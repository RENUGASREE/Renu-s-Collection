import crypto from "crypto";
import { OAuth2Client } from "google-auth-library";
import { User, IUser } from "../models/User.js";
import { AppError } from "../middleware/errorHandler.js";
import { hashPassword, comparePassword, hashToken, compareToken } from "../utils/password.js";
import { signAccessToken, signRefreshToken, verifyRefreshToken } from "../utils/jwt.js";
import { sendPasswordResetEmail } from "../utils/email.js";
import { env } from "../config/env.js";
import { UserRole } from "../types/index.js";

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

function sanitizeUser(user: IUser): AuthUserResponse {
  return {
    id: user.id,
    email: user.email,
    username: user.username,
    role: user.role,
    firstName: user.firstName,
    lastName: user.lastName,
    phone: user.phone,
    avatarUrl: user.avatarUrl,
    isEmailVerified: user.isEmailVerified,
  };
}

async function issueTokens(user: IUser, isRotation = false): Promise<AuthTokensResponse> {
  const accessToken = signAccessToken({
    sub: user.id,
    email: user.email,
    role: user.role,
  });
  const refreshToken = signRefreshToken(user.id);

  if (isRotation && user.refreshTokenHash) {
    user.previousRefreshTokenHash = user.refreshTokenHash;
    // 30 seconds grace period for concurrent in-flight requests or network delays
    user.previousRefreshTokenExpiresAt = new Date(Date.now() + 30 * 1000);
  } else {
    user.previousRefreshTokenHash = undefined;
    user.previousRefreshTokenExpiresAt = undefined;
  }

  user.refreshTokenHash = await hashToken(refreshToken);
  user.lastLoginAt = new Date();
  await user.save();

  return {
    user: sanitizeUser(user),
    accessToken,
    refreshToken,
  };
}

export async function registerUser(input: {
  email: string;
  password: string;
  username?: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
}): Promise<AuthTokensResponse> {
  const email = input.email.toLowerCase().trim();
  const existing = await User.findOne({ email });
  if (existing) {
    throw new AppError("Email already registered", 409);
  }

  const username = input.username?.trim() || email.split("@")[0];
  const passwordHash = await hashPassword(input.password);

  const user = await User.create({
    email,
    username,
    passwordHash,
    firstName: input.firstName,
    lastName: input.lastName,
    phone: input.phone,
    role: "customer",
    isEmailVerified: false,
  });

  return issueTokens(user);
}

export async function loginUser(email: string, password: string): Promise<AuthTokensResponse> {
  const user = await User.findOne({ email: email.toLowerCase().trim() }).select("+passwordHash");
  if (!user || !user.passwordHash) {
    throw new AppError("Invalid email or password", 401);
  }

  const valid = await comparePassword(password, user.passwordHash);
  if (!valid) {
    throw new AppError("Invalid email or password", 401);
  }

  return issueTokens(user);
}

export async function refreshSession(refreshToken: string): Promise<AuthTokensResponse> {
  let payload: { sub: string };
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    throw new AppError("Invalid or expired refresh token", 401);
  }

  const user = await User.findById(payload.sub).select(
    "+refreshTokenHash +previousRefreshTokenHash +previousRefreshTokenExpiresAt"
  );
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

  return issueTokens(user, true);
}

export async function logoutUser(userId: string): Promise<void> {
  await User.findByIdAndUpdate(userId, {
    $unset: {
      refreshTokenHash: 1,
      previousRefreshTokenHash: 1,
      previousRefreshTokenExpiresAt: 1,
    },
  });
}

export async function forgotPassword(email: string): Promise<void> {
  const user = await User.findOne({ email: email.toLowerCase().trim() });
  if (!user) {
    // Do not reveal whether email exists
    return;
  }

  const resetToken = crypto.randomBytes(32).toString("hex");
  const hashed = crypto.createHash("sha256").update(resetToken).digest("hex");

  user.passwordResetToken = hashed;
  user.passwordResetExpires = new Date(Date.now() + 60 * 60 * 1000);
  await user.save();

  const basePath = (env.FRONTEND_BASE_PATH || "/").replace(/\/$/, "");
  const resetUrl = `${env.FRONTEND_URL}${basePath}/reset-password?token=${resetToken}`;

  await sendPasswordResetEmail(user.email, resetUrl);
}

export async function resetPassword(token: string, password: string): Promise<void> {
  const hashed = crypto.createHash("sha256").update(token).digest("hex");

  const user = await User.findOne({
    passwordResetToken: hashed,
    passwordResetExpires: { $gt: new Date() },
  }).select("+passwordResetToken +passwordResetExpires");

  if (!user) {
    throw new AppError("Invalid or expired reset token", 400);
  }

  user.passwordHash = await hashPassword(password);
  user.passwordResetToken = undefined;
  user.passwordResetExpires = undefined;
  user.refreshTokenHash = undefined;
  await user.save();
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

export async function loginWithGoogle(idToken: string): Promise<AuthTokensResponse> {
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
  let user = await User.findOne({ $or: [{ googleId: payload.sub }, { email }] });

  if (user) {
    if (!user.googleId) {
      user.googleId = payload.sub;
    }
    if (payload.picture) user.avatarUrl = payload.picture;
    user.isEmailVerified = payload.email_verified ?? user.isEmailVerified;
    if (!user.firstName && payload.given_name) user.firstName = payload.given_name;
    if (!user.lastName && payload.family_name) user.lastName = payload.family_name;
    await user.save();
  } else {
    user = await User.create({
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

  return issueTokens(user);
}

export async function getUserById(id: string): Promise<AuthUserResponse> {
  const user = await User.findById(id);
  if (!user) throw new AppError("User not found", 404);
  return sanitizeUser(user);
}

export { sanitizeUser };
