/**
 * ============================================================================
 * User Service (Phase 3D: PostgreSQL Migration)
 * ============================================================================
 *
 * Implements user profile management, password updates, and administrator
 * user operations backed by Supabase PostgreSQL.
 *
 * Guarantees:
 * 1. Preserves existing password hash algorithms and verification rules.
 * 2. Revokes active refresh token sessions upon password change.
 * 3. Enforces username and email uniqueness.
 * 4. Dual ID compatibility (`id` and `_id`).
 * 5. 100% backward compatibility with controllers and API contracts.
 */

import { PostgresUserRepository } from "../repositories/postgres-user.repository.js";
import { AppError } from "../middleware/errorHandler.js";
import { hashPassword, comparePassword } from "../utils/password.js";
import { sanitizeUser } from "./auth.service.js";
import { isValidEntityId } from "../utils/helpers.js";
import type { PaginationMeta } from "../types/index.js";

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

/**
 * Updates a user's profile details.
 */
export async function updateProfile(
  userId: string,
  input: { username?: string; firstName?: string; lastName?: string; phone?: string },
  repo = getUserRepo()
) {
  if (!isValidEntityId(userId)) {
    throw new AppError("Invalid user id", 400);
  }

  // Check username uniqueness if changing username
  if (input.username && input.username.trim()) {
    const existing = await repo.findByUsername(input.username.trim());
    if (existing && existing.id !== userId) {
      throw new AppError("Username already taken", 409);
    }
  }

  const updated = await repo.updateById(userId, input);
  if (!updated) {
    throw new AppError("User not found", 404);
  }

  return sanitizeUser(updated);
}

/**
 * Changes a user's password after verifying the current password.
 * Revokes refresh sessions upon successful password change.
 */
export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
  repo = getUserRepo()
): Promise<void> {
  if (!isValidEntityId(userId)) {
    throw new AppError("Invalid user id", 400);
  }

  const user = await repo.findById(userId);
  if (!user || !user.passwordHash) {
    throw new AppError("Password login not available for this account", 400);
  }

  const valid = await comparePassword(currentPassword, user.passwordHash);
  if (!valid) {
    throw new AppError("Current password is incorrect", 400);
  }

  const newHash = await hashPassword(newPassword);
  await repo.updateById(userId, {
    passwordHash: newHash,
    refreshTokenHash: null,
    previousRefreshTokenHash: null,
    previousRefreshTokenExpiresAt: null,
  });
}

/**
 * Lists users with optional pagination, role filter, and text search.
 */
export async function listUsers(
  query: {
    page: number;
    limit: number;
    q?: string;
    role?: "customer" | "admin";
  },
  repo = getUserRepo()
) {
  const page = Math.max(1, query.page ?? 1);
  const limit = Math.max(1, Math.min(100, query.limit ?? 20));

  const { items, total } = await repo.findUsers({ ...query, page, limit });

  const totalPages = Math.ceil(total / limit) || 1;
  const meta: PaginationMeta = {
    page,
    limit,
    total,
    totalPages,
  };

  return {
    items: items.map((u) => ({
      id: u.id,
      _id: u.id,
      email: u.email,
      username: u.username,
      role: u.role,
      firstName: u.firstName,
      lastName: u.lastName,
      phone: u.phone,
      isEmailVerified: u.isEmailVerified,
      createdAt: u.createdAt,
      lastLoginAt: u.lastLoginAt,
    })),
    meta,
  };
}

/**
 * Updates a user's authorization role.
 */
export async function updateUserRole(
  userId: string,
  role: "customer" | "admin",
  repo = getUserRepo()
) {
  if (!isValidEntityId(userId)) {
    throw new AppError("Invalid user id", 400);
  }

  if (role !== "customer" && role !== "admin") {
    throw new AppError("Invalid role", 400);
  }

  const user = await repo.updateRole(userId, role);
  if (!user) {
    throw new AppError("User not found", 404);
  }

  return sanitizeUser(user);
}
