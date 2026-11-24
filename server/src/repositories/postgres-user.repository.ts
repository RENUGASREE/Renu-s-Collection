/**
 * ============================================================================
 * PostgreSQL User Repository (Phase 3D)
 * ============================================================================
 *
 * Implements typed, parameterized data-access for the `users` table on Supabase
 * PostgreSQL.
 *
 * Guarantees:
 * 1. Parameterized SQL only — prevents SQL injection.
 * 2. Strict ID validation accepting both 24-char hex MongoDB ObjectIds and 36-char UUIDs.
 * 3. Dual identifier compatibility (`id` and `_id`) on all mapped entities.
 * 4. Safe column allowlist for dynamic updates.
 * 5. Reusable across standalone queries and transactional clients.
 */

import {
  IDbClient,
  IDbPool,
  IUserDbRow,
  IUserRecord,
  ICreateUserData,
  IUpdateUserData,
} from "../types/database.types.js";
import { PostgresDatabase } from "../db/postgres.js";
import { isValidEntityId } from "../utils/helpers.js";
import { AppError } from "../middleware/errorHandler.js";

const ALLOWED_USER_UPDATE_COLUMNS: Record<string, string> = {
  username: "username",
  firstName: "first_name",
  lastName: "last_name",
  phone: "phone",
  role: "role",
  googleId: "google_id",
  avatarUrl: "avatar_url",
  isEmailVerified: "is_email_verified",
  passwordHash: "password_hash",
  refreshTokenHash: "refresh_token_hash",
  previousRefreshTokenHash: "previous_refresh_token_hash",
  previousRefreshTokenExpiresAt: "previous_refresh_token_expires_at",
  passwordResetToken: "password_reset_token",
  passwordResetExpires: "password_reset_expires",
  lastLoginAt: "last_login_at",
};

export function mapRowToUser(row: IUserDbRow): IUserRecord {
  const idStr = String(row.id);
  return {
    id: idStr,
    _id: idStr,
    email: String(row.email),
    username: String(row.username),
    passwordHash: row.password_hash ?? undefined,
    firstName: row.first_name ?? undefined,
    lastName: row.last_name ?? undefined,
    phone: row.phone ?? undefined,
    role: row.role as "customer" | "admin",
    googleId: row.google_id ?? undefined,
    avatarUrl: row.avatar_url ?? undefined,
    isEmailVerified: Boolean(row.is_email_verified),
    refreshTokenHash: row.refresh_token_hash ?? undefined,
    previousRefreshTokenHash: row.previous_refresh_token_hash ?? undefined,
    previousRefreshTokenExpiresAt: row.previous_refresh_token_expires_at
      ? new Date(row.previous_refresh_token_expires_at)
      : undefined,
    passwordResetToken: row.password_reset_token ?? undefined,
    passwordResetExpires: row.password_reset_expires
      ? new Date(row.password_reset_expires)
      : undefined,
    lastLoginAt: row.last_login_at ? new Date(row.last_login_at) : undefined,
    createdAt: row.created_at instanceof Date ? row.created_at : new Date(row.created_at),
    updatedAt: row.updated_at instanceof Date ? row.updated_at : new Date(row.updated_at),
  };
}

export class PostgresUserRepository {
  private readonly pool?: IDbPool;

  constructor(pool?: IDbPool) {
    this.pool = pool;
  }

  private getExecutor(client?: IDbClient): IDbClient {
    return client ?? this.pool ?? PostgresDatabase.getPool();
  }

  /**
   * Finds a user by ID. Returns null if invalid format or not found.
   */
  public async findById(id: string, client?: IDbClient): Promise<IUserRecord | null> {
    if (!isValidEntityId(id)) return null;

    const executor = this.getExecutor(client);
    const result = await executor.query<IUserDbRow>(
      `SELECT id, email, username, password_hash, first_name, last_name, phone, role,
              google_id, avatar_url, is_email_verified, refresh_token_hash,
              previous_refresh_token_hash, previous_refresh_token_expires_at,
              password_reset_token, password_reset_expires, last_login_at, created_at, updated_at
       FROM users
       WHERE id = $1
       LIMIT 1;`,
      [id]
    );

    if (result.rowCount === 0 || !result.rows[0]) return null;
    return mapRowToUser(result.rows[0]);
  }

  /**
   * Finds a user by email (case-insensitive).
   */
  public async findByEmail(email: string, client?: IDbClient): Promise<IUserRecord | null> {
    if (!email || !email.trim()) return null;

    const executor = this.getExecutor(client);
    const result = await executor.query<IUserDbRow>(
      `SELECT id, email, username, password_hash, first_name, last_name, phone, role,
              google_id, avatar_url, is_email_verified, refresh_token_hash,
              previous_refresh_token_hash, previous_refresh_token_expires_at,
              password_reset_token, password_reset_expires, last_login_at, created_at, updated_at
       FROM users
       WHERE LOWER(email) = LOWER($1)
       LIMIT 1;`,
      [email.trim()]
    );

    if (result.rowCount === 0 || !result.rows[0]) return null;
    return mapRowToUser(result.rows[0]);
  }

  /**
   * Finds a user by username (case-insensitive).
   */
  public async findByUsername(username: string, client?: IDbClient): Promise<IUserRecord | null> {
    if (!username || !username.trim()) return null;

    const executor = this.getExecutor(client);
    const result = await executor.query<IUserDbRow>(
      `SELECT id, email, username, password_hash, first_name, last_name, phone, role,
              google_id, avatar_url, is_email_verified, refresh_token_hash,
              previous_refresh_token_hash, previous_refresh_token_expires_at,
              password_reset_token, password_reset_expires, last_login_at, created_at, updated_at
       FROM users
       WHERE LOWER(username) = LOWER($1)
       LIMIT 1;`,
      [username.trim()]
    );

    if (result.rowCount === 0 || !result.rows[0]) return null;
    return mapRowToUser(result.rows[0]);
  }

  /**
   * Finds a user by Google ID.
   */
  public async findByGoogleId(googleId: string, client?: IDbClient): Promise<IUserRecord | null> {
    if (!googleId || !googleId.trim()) return null;

    const executor = this.getExecutor(client);
    const result = await executor.query<IUserDbRow>(
      `SELECT id, email, username, password_hash, first_name, last_name, phone, role,
              google_id, avatar_url, is_email_verified, refresh_token_hash,
              previous_refresh_token_hash, previous_refresh_token_expires_at,
              password_reset_token, password_reset_expires, last_login_at, created_at, updated_at
       FROM users
       WHERE google_id = $1
       LIMIT 1;`,
      [googleId.trim()]
    );

    if (result.rowCount === 0 || !result.rows[0]) return null;
    return mapRowToUser(result.rows[0]);
  }

  /**
   * Finds a user with a valid, non-expired password reset token hash.
   */
  public async findByPasswordResetToken(
    tokenHash: string,
    client?: IDbClient
  ): Promise<IUserRecord | null> {
    if (!tokenHash || !tokenHash.trim()) return null;

    const executor = this.getExecutor(client);
    const result = await executor.query<IUserDbRow>(
      `SELECT id, email, username, password_hash, first_name, last_name, phone, role,
              google_id, avatar_url, is_email_verified, refresh_token_hash,
              previous_refresh_token_hash, previous_refresh_token_expires_at,
              password_reset_token, password_reset_expires, last_login_at, created_at, updated_at
       FROM users
       WHERE password_reset_token = $1 AND password_reset_expires > NOW()
       LIMIT 1;`,
      [tokenHash.trim()]
    );

    if (result.rowCount === 0 || !result.rows[0]) return null;
    return mapRowToUser(result.rows[0]);
  }

  /**
   * Creates a new user record.
   */
  public async create(data: ICreateUserData, client?: IDbClient): Promise<IUserRecord> {
    const executor = this.getExecutor(client);
    const email = data.email.toLowerCase().trim();
    const username = data.username.trim();

    try {
      const result = await executor.query<IUserDbRow>(
        `INSERT INTO users (
           id, email, username, password_hash, first_name, last_name, phone,
           role, google_id, avatar_url, is_email_verified, created_at, updated_at
         ) VALUES (
           COALESCE($1, gen_random_uuid()::text), $2, $3, $4, $5, $6, $7,
           COALESCE($8, 'customer'), $9, $10, COALESCE($11, FALSE), NOW(), NOW()
         )
         RETURNING id, email, username, password_hash, first_name, last_name, phone, role,
                   google_id, avatar_url, is_email_verified, refresh_token_hash,
                   previous_refresh_token_hash, previous_refresh_token_expires_at,
                   password_reset_token, password_reset_expires, last_login_at, created_at, updated_at;`,
        [
          data.id || null,
          email,
          username,
          data.passwordHash || null,
          data.firstName || null,
          data.lastName || null,
          data.phone || null,
          data.role || "customer",
          data.googleId || null,
          data.avatarUrl || null,
          data.isEmailVerified ?? false,
        ]
      );

      return mapRowToUser(result.rows[0]);
    } catch (err: any) {
      if (err?.code === "23505") {
        if (err?.message?.includes("email") || err?.detail?.includes("email")) {
          throw new AppError("Email already registered", 409);
        }
        if (err?.message?.includes("google_id") || err?.detail?.includes("google_id")) {
          throw new AppError("Google account already linked to another user", 409);
        }
      }
      throw err;
    }
  }

  /**
   * Updates user fields with strict column allowlist and parameterization.
   */
  public async updateById(
    id: string,
    data: IUpdateUserData,
    client?: IDbClient
  ): Promise<IUserRecord | null> {
    if (!isValidEntityId(id)) return null;

    const setClauses: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    for (const [propKey, colName] of Object.entries(ALLOWED_USER_UPDATE_COLUMNS)) {
      if (propKey in data) {
        const val = (data as any)[propKey];
        setClauses.push(`${colName} = $${paramIndex++}`);
        params.push(val === undefined ? null : val);
      }
    }

    if (setClauses.length === 0) {
      return this.findById(id, client);
    }

    setClauses.push(`updated_at = NOW()`);
    params.push(id);

    const executor = this.getExecutor(client);
    try {
      const result = await executor.query<IUserDbRow>(
        `UPDATE users
         SET ${setClauses.join(", ")}
         WHERE id = $${paramIndex}
         RETURNING id, email, username, password_hash, first_name, last_name, phone, role,
                   google_id, avatar_url, is_email_verified, refresh_token_hash,
                   previous_refresh_token_hash, previous_refresh_token_expires_at,
                   password_reset_token, password_reset_expires, last_login_at, created_at, updated_at;`,
        params
      );

      if (result.rowCount === 0 || !result.rows[0]) return null;
      return mapRowToUser(result.rows[0]);
    } catch (err: any) {
      if (err?.code === "23505") {
        if (err?.message?.includes("email") || err?.detail?.includes("email")) {
          throw new AppError("Email already registered", 409);
        }
        if (err?.message?.includes("google_id") || err?.detail?.includes("google_id")) {
          throw new AppError("Google account already linked to another user", 409);
        }
      }
      throw err;
    }
  }

  /**
   * Updates a user's role. Throws 400 on invalid ID.
   */
  public async updateRole(
    id: string,
    role: "customer" | "admin",
    client?: IDbClient
  ): Promise<IUserRecord | null> {
    if (!isValidEntityId(id)) {
      throw new AppError("Invalid user id", 400);
    }
    return this.updateById(id, { role }, client);
  }

  /**
   * Retrieves paginated users with optional role and search filters.
   */
  public async findUsers(
    query: { page?: number; limit?: number; q?: string; role?: "customer" | "admin" },
    client?: IDbClient
  ): Promise<{ items: IUserRecord[]; total: number }> {
    const executor = this.getExecutor(client);
    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (query.role) {
      conditions.push(`role = $${paramIndex++}`);
      params.push(query.role);
    }

    if (query.q && query.q.trim()) {
      const term = `%${query.q.trim()}%`;
      conditions.push(`(email ILIKE $${paramIndex} OR username ILIKE $${paramIndex})`);
      params.push(term);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const countResult = await executor.query<{ total: number | string }>(
      `SELECT COUNT(*)::int AS total FROM users ${whereClause};`,
      params
    );
    const total = Number(countResult.rows[0]?.total ?? 0);

    const page = Math.max(1, query.page ?? 1);
    const limit = Math.max(1, Math.min(100, query.limit ?? 20));
    const offset = (page - 1) * limit;

    const dataParams = [...params, limit, offset];
    const dataResult = await executor.query<IUserDbRow>(
      `SELECT id, email, username, password_hash, first_name, last_name, phone, role,
              google_id, avatar_url, is_email_verified, refresh_token_hash,
              previous_refresh_token_hash, previous_refresh_token_expires_at,
              password_reset_token, password_reset_expires, last_login_at, created_at, updated_at
       FROM users
       ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${paramIndex++} OFFSET $${paramIndex++};`,
      dataParams
    );

    return {
      items: dataResult.rows.map(mapRowToUser),
      total,
    };
  }

  /**
   * Counts users by role.
   */
  public async countByRole(role?: "customer" | "admin", client?: IDbClient): Promise<number> {
    const executor = this.getExecutor(client);
    if (role) {
      const res = await executor.query<{ count: number | string }>(
        `SELECT COUNT(*)::int AS count FROM users WHERE role = $1;`,
        [role]
      );
      return Number(res.rows[0]?.count ?? 0);
    }
    const res = await executor.query<{ count: number | string }>(
      `SELECT COUNT(*)::int AS count FROM users;`
    );
    return Number(res.rows[0]?.count ?? 0);
  }
}
