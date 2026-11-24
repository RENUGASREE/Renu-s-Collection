/**
 * ============================================================================
 * Authentication Service (Phase 3D: PostgreSQL Migration)
 * ============================================================================
 *
 * Implements customer and administrator authentication backed by Supabase
 * PostgreSQL.
 *
 * Guarantees:
 * 1. Preserves existing custom JWT + bcrypt authentication architecture.
 * 2. 100% backward compatibility with customer accounts, credentials, and IDs.
 * 3. Grace-period-protected refresh token rotation.
 * 4. Google OAuth account lookup and automatic linking.
 * 5. Password reset via cryptographically secure SHA-256 tokens.
 */

import crypto from "crypto";
import { OAuth2Client } from "google-auth-library";
import { PostgresUserRepository } from "../repositories/postgres-user.repository.js";
import { IUserRecord } from "../types/database.types.js";
import { AppError } from "../middleware/errorHandler.js";
import { hashPassword, comparePassword, hashToken, compareToken } from "../utils/password.js";
import { signAccessToken, signRefreshToken, verifyRefreshToken } from "../utils/jwt.js";
import { sendPasswordResetEmail } from "../utils/email.js";
import { env } from "../config/env.js";
import { UserRole } from "../types/index.js";
import { isValidEntityId } from "../utils/helpers.js";

export interface AuthUserResponse {
  id: string;
  email: string;
  username: string;
  role: UserRole;
  firstName?: string;
  lastName?: string;
  phone?: string;
  avatarUrl?: string;
  isEmailVerified: boolean;
}

export interface AuthTokensResponse {
  user: AuthUserResponse;
  accessToken: string;
  refreshToken: string;
}

// ---------------------------------------------------------------------------
// Singleton & Dependency Injection
// ---------------------------------------------------------------------------

let activeUserRepo: PostgresUserRepository | null = null;

function getUserRepo(): PostgresUserRepository {
  if (!activeUserRepo) {
    activeUserRepo = new PostgresUserRepository();
  }
  return activeUserRepo;
}

export function setUserRepository(repo: PostgresUserRepository): void {
  activeUserRepo = repo;
}

export function sanitizeUser(user: IUserRecord | any): AuthUserResponse {
  const idStr = String(user.id || user._id);
  return {
    id: idStr,
    email: user.email,
    username: user.username,
    role: user.role,
    firstName: user.firstName,
    lastName: user.lastName,
    phone: user.phone,
    avatarUrl: user.avatarUrl,
    isEmailVerified: Boolean(user.isEmailVerified),
  };
}

async function issueTokens(
  user: IUserRecord,
  isRotation = false,
  repo = getUserRepo()
): Promise<AuthTokensResponse> {
  const accessToken = signAccessToken({
    sub: user.id,
    email: user.email,
    role: user.role,
  });
  const refreshToken = signRefreshToken(user.id);

  let previousRefreshTokenHash: string | null = null;
  let previousRefreshTokenExpiresAt: Date | null = null;

  if (isRotation && user.refreshTokenHash) {
    previousRefreshTokenHash = user.refreshTokenHash;
    // 30 seconds grace period for concurrent in-flight requests or network delays
    previousRefreshTokenExpiresAt = new Date(Date.now() + 30 * 1000);
  }

  const refreshTokenHash = await hashToken(refreshToken);
  const lastLoginAt = new Date();

  const updated = await repo.updateById(user.id, {
    refreshTokenHash,
    previousRefreshTokenHash,
    previousRefreshTokenExpiresAt,
    lastLoginAt,
  });

  return {
    user: sanitizeUser(updated || user),
    accessToken,
    refreshToken,
  };
}

export async function registerUser(
  input: {
    email: string;
    password: string;
    username?: string;
    firstName?: string;
    lastName?: string;
    phone?: string;
  },
  repo = getUserRepo()
): Promise<AuthTokensResponse> {
  const email = input.email.toLowerCase().trim();
  const existing = await repo.findByEmail(email);
  if (existing) {
    throw new AppError("Email already registered", 409);
  }

  const username = input.username?.trim() || email.split("@")[0];
  const passwordHash = await hashPassword(input.password);

  const user = await repo.create({
    email,
    username,
    passwordHash,
    firstName: input.firstName,
    lastName: input.lastName,
    phone: input.phone,
    role: "customer",
    isEmailVerified: false,
  });

  return issueTokens(user, false, repo);
}

export async function loginUser(
  email: string,
  password: string,
  repo = getUserRepo()
): Promise<AuthTokensResponse> {
  const user = await repo.findByEmail(email.toLowerCase().trim());
  if (!user || !user.passwordHash) {
    throw new AppError("Invalid email or password", 401);
  }

  const valid = await comparePassword(password, user.passwordHash);
  if (!valid) {
    throw new AppError("Invalid email or password", 401);
  }

  return issueTokens(user, false, repo);
}

export async function refreshSession(
  refreshToken: string,
  repo = getUserRepo()
): Promise<AuthTokensResponse> {
  let payload: { sub: string };
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    throw new AppError("Invalid or expired refresh token", 401);
  }

  const user = await repo.findById(payload.sub);
  if (!user || !user.refreshTokenHash) {
    throw new AppError("Invalid refresh session", 401);
  }

  let valid = await compareToken(refreshToken, user.refreshTokenHash);

  // If token does not match current hash, check if it matches previous hash within 30s grace window
  if (!valid && user.previousRefreshTokenHash && user.previousRefreshTokenExpiresAt) {
    const isWithinGracePeriod = user.previousRefreshTokenExpiresAt.getTime() > Date.now();
    if (isWithinGracePeriod) {
      const matchesPrevious = await compareToken(refreshToken, user.previousRefreshTokenHash);
      if (matchesPrevious) {
        // Issue fresh access token without re-rotating or invalidating the active session
        const accessToken = signAccessToken({
          sub: user.id,
          email: user.email,
          role: user.role,
        });
        return {
          user: sanitizeUser(user),
          accessToken,
          refreshToken,
        };
      }
    }
  }

  if (!valid) {
    throw new AppError("Invalid refresh session", 401);
  }

  return issueTokens(user, true, repo);
}

export async function logoutUser(userId: string, repo = getUserRepo()): Promise<void> {
  if (!isValidEntityId(userId)) return;

  await repo.updateById(userId, {
    refreshTokenHash: null,
    previousRefreshTokenHash: null,
    previousRefreshTokenExpiresAt: null,
  });
}

export async function forgotPassword(email: string, repo = getUserRepo()): Promise<void> {
  const user = await repo.findByEmail(email.toLowerCase().trim());
  if (!user) {
    // Do not reveal whether email exists
    return;
  }

  const resetToken = crypto.randomBytes(32).toString("hex");
  const hashed = crypto.createHash("sha256").update(resetToken).digest("hex");

  await repo.updateById(user.id, {
    passwordResetToken: hashed,
    passwordResetExpires: new Date(Date.now() + 60 * 60 * 1000),
  });

  const basePath = (env.FRONTEND_BASE_PATH || "/").replace(/\/$/, "");
  const resetUrl = `${env.FRONTEND_URL}${basePath}/reset-password?token=${resetToken}`;

  await sendPasswordResetEmail(user.email, resetUrl);
}

export async function resetPassword(
  token: string,
  password: string,
  repo = getUserRepo()
): Promise<void> {
  const hashed = crypto.createHash("sha256").update(token).digest("hex");
  const user = await repo.findByPasswordResetToken(hashed);

  if (!user) {
    throw new AppError("Invalid or expired reset token", 400);
  }

  const newPasswordHash = await hashPassword(password);
  await repo.updateById(user.id, {
    passwordHash: newPasswordHash,
    passwordResetToken: null,
    passwordResetExpires: null,
    refreshTokenHash: null,
    previousRefreshTokenHash: null,
    previousRefreshTokenExpiresAt: null,
  });
}

let googleClient: OAuth2Client | null = null;

function getGoogleClient(): OAuth2Client {
  if (!env.GOOGLE_CLIENT_ID) {
    throw new AppError("Google login is not configured", 503);
  }
  if (!googleClient) {
    googleClient = new OAuth2Client(env.GOOGLE_CLIENT_ID);
  }
  return googleClient;
}

export async function loginWithGoogle(
  idToken: string,
  repo = getUserRepo()
): Promise<AuthTokensResponse> {
  const client = getGoogleClient();
  const ticket = await client.verifyIdToken({
    idToken,
    audience: env.GOOGLE_CLIENT_ID,
  });

  const payload = ticket.getPayload();
  if (!payload?.email) {
    throw new AppError("Google account email not available", 400);
  }

  const email = payload.email.toLowerCase();
  let user: IUserRecord | null = null;

  if (payload.sub) {
    user = await repo.findByGoogleId(payload.sub);
  }
  if (!user) {
    user = await repo.findByEmail(email);
  }

  if (user) {
    const updateData: any = {};
    if (!user.googleId && payload.sub) {
      updateData.googleId = payload.sub;
    }
    if (payload.picture && payload.picture !== user.avatarUrl) {
      updateData.avatarUrl = payload.picture;
    }
    if (payload.email_verified !== undefined && payload.email_verified !== user.isEmailVerified) {
      updateData.isEmailVerified = payload.email_verified;
    }
    if (!user.firstName && payload.given_name) {
      updateData.firstName = payload.given_name;
    }
    if (!user.lastName && payload.family_name) {
      updateData.lastName = payload.family_name;
    }

    if (Object.keys(updateData).length > 0) {
      const updated = await repo.updateById(user.id, updateData);
      if (updated) user = updated;
    }
  } else {
    user = await repo.create({
      email,
      username: payload.name || email.split("@")[0],
      googleId: payload.sub,
      avatarUrl: payload.picture,
      firstName: payload.given_name,
      lastName: payload.family_name,
      role: "customer",
      isEmailVerified: payload.email_verified ?? false,
    });
  }

  return issueTokens(user, false, repo);
}

export async function getUserById(id: string, repo = getUserRepo()): Promise<AuthUserResponse> {
  if (!isValidEntityId(id)) {
    throw new AppError("User not found", 404);
  }
  const user = await repo.findById(id);
  if (!user) throw new AppError("User not found", 404);
  return sanitizeUser(user);
}
