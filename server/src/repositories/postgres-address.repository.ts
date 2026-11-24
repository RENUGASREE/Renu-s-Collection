/**
 * ============================================================================
 * PostgreSQL Address Repository (Phase 3D)
 * ============================================================================
 *
 * Implements typed, parameterized data-access for the `user_addresses` table on
 * Supabase PostgreSQL.
 *
 * Guarantees:
 * 1. Parameterized SQL only — prevents SQL injection.
 * 2. Strict ID validation accepting both 24-char hex MongoDB ObjectIds and 36-char UUIDs.
 * 3. User ownership enforcement on all mutations (preventing unauthorized address tampering).
 * 4. Dual identifier compatibility (`id` and `_id`) matching frontend contracts.
 * 5. Reusable across standalone queries and transactional clients.
 */

import {
  IDbClient,
  IDbPool,
  IUserAddressDbRow,
  IUserAddressRecord,
  ICreateAddressData,
  IUpdateAddressData,
} from "../types/database.types.js";
import { PostgresDatabase } from "../db/postgres.js";
import { isValidEntityId } from "../utils/helpers.js";
import { AppError } from "../middleware/errorHandler.js";

const ALLOWED_ADDRESS_UPDATE_COLUMNS: Record<string, string> = {
  label: "label",
  fullName: "full_name",
  line1: "line1",
  line2: "line2",
  city: "city",
  state: "state",
  postalCode: "postal_code",
  country: "country",
  phone: "phone",
  isDefault: "is_default",
};

export function mapRowToAddress(row: IUserAddressDbRow): IUserAddressRecord {
  const idStr = String(row.id);
  return {
    id: idStr,
    _id: idStr,
    userId: String(row.user_id),
    label: row.label ?? undefined,
    fullName: String(row.full_name),
    line1: String(row.line1),
    line2: row.line2 ?? undefined,
    city: String(row.city),
    state: String(row.state),
    postalCode: String(row.postal_code),
    country: String(row.country || "IN"),
    phone: String(row.phone),
    isDefault: Boolean(row.is_default),
    createdAt: row.created_at instanceof Date ? row.created_at : new Date(row.created_at),
    updatedAt: row.updated_at instanceof Date ? row.updated_at : new Date(row.updated_at),
  };
}

export class PostgresAddressRepository {
  private readonly pool?: IDbPool;

  constructor(pool?: IDbPool) {
    this.pool = pool;
  }

  private getExecutor(client?: IDbClient): IDbClient {
    return client ?? this.pool ?? PostgresDatabase.getPool();
  }

  /**
   * Finds all addresses belonging to a user, ordered by default address first, then creation time.
   */
  public async findByUserId(userId: string, client?: IDbClient): Promise<IUserAddressRecord[]> {
    if (!isValidEntityId(userId)) return [];

    const executor = this.getExecutor(client);
    const result = await executor.query<IUserAddressDbRow>(
      `SELECT id, user_id, label, full_name, line1, line2, city, state, postal_code,
              country, phone, is_default, created_at, updated_at
       FROM user_addresses
       WHERE user_id = $1
       ORDER BY is_default DESC, created_at ASC;`,
      [userId]
    );

    return result.rows.map(mapRowToAddress);
  }

  /**
   * Finds an address by ID and verifies user ownership.
   */
  public async findByIdAndUserId(
    id: string,
    userId: string,
    client?: IDbClient
  ): Promise<IUserAddressRecord | null> {
    if (!isValidEntityId(id) || !isValidEntityId(userId)) return null;

    const executor = this.getExecutor(client);
    const result = await executor.query<IUserAddressDbRow>(
      `SELECT id, user_id, label, full_name, line1, line2, city, state, postal_code,
              country, phone, is_default, created_at, updated_at
       FROM user_addresses
       WHERE id = $1 AND user_id = $2
       LIMIT 1;`,
      [id, userId]
    );

    if (result.rowCount === 0 || !result.rows[0]) return null;
    return mapRowToAddress(result.rows[0]);
  }

  /**
   * Counts the number of addresses for a user.
   */
  public async countByUserId(userId: string, client?: IDbClient): Promise<number> {
    if (!isValidEntityId(userId)) return 0;

    const executor = this.getExecutor(client);
    const result = await executor.query<{ count: number | string }>(
      `SELECT COUNT(*)::int AS count FROM user_addresses WHERE user_id = $1;`,
      [userId]
    );
    return Number(result.rows[0]?.count ?? 0);
  }

  /**
   * Finds the first address for a user.
   */
  public async findFirstByUserId(userId: string, client?: IDbClient): Promise<IUserAddressRecord | null> {
    if (!isValidEntityId(userId)) return null;

    const executor = this.getExecutor(client);
    const result = await executor.query<IUserAddressDbRow>(
      `SELECT id, user_id, label, full_name, line1, line2, city, state, postal_code,
              country, phone, is_default, created_at, updated_at
       FROM user_addresses
       WHERE user_id = $1
       ORDER BY created_at ASC
       LIMIT 1;`,
      [userId]
    );

    if (result.rowCount === 0 || !result.rows[0]) return null;
    return mapRowToAddress(result.rows[0]);
  }

  /**
   * Clears default status on all addresses for a given user.
   */
  public async clearDefaultsForUser(userId: string, client?: IDbClient): Promise<void> {
    if (!isValidEntityId(userId)) return;

    const executor = this.getExecutor(client);
    await executor.query(
      `UPDATE user_addresses
       SET is_default = FALSE, updated_at = NOW()
       WHERE user_id = $1;`,
      [userId]
    );
  }

  /**
   * Inserts a new user address.
   */
  public async create(data: ICreateAddressData, client?: IDbClient): Promise<IUserAddressRecord> {
    if (!isValidEntityId(data.userId)) {
      throw new AppError("Invalid user id", 400);
    }

    const executor = this.getExecutor(client);
    const result = await executor.query<IUserAddressDbRow>(
      `INSERT INTO user_addresses (
         id, user_id, label, full_name, line1, line2, city, state, postal_code,
         country, phone, is_default, created_at, updated_at
       ) VALUES (
         COALESCE($1, gen_random_uuid()::text), $2, $3, $4, $5, $6, $7, $8, $9,
         COALESCE($10, 'IN'), $11, COALESCE($12, FALSE), NOW(), NOW()
       )
       RETURNING id, user_id, label, full_name, line1, line2, city, state, postal_code,
                 country, phone, is_default, created_at, updated_at;`,
      [
        data.id || null,
        data.userId,
        data.label || null,
        data.fullName,
        data.line1,
        data.line2 || null,
        data.city,
        data.state,
        data.postalCode,
        data.country || "IN",
        data.phone,
        data.isDefault ?? false,
      ]
    );

    return mapRowToAddress(result.rows[0]);
  }

  /**
   * Updates an address with ownership verification.
   */
  public async updateById(
    id: string,
    userId: string,
    data: IUpdateAddressData,
    client?: IDbClient
  ): Promise<IUserAddressRecord | null> {
    if (!isValidEntityId(id) || !isValidEntityId(userId)) return null;

    const setClauses: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    for (const [propKey, colName] of Object.entries(ALLOWED_ADDRESS_UPDATE_COLUMNS)) {
      if (propKey in data) {
        const val = (data as any)[propKey];
        setClauses.push(`${colName} = $${paramIndex++}`);
        params.push(val === undefined ? null : val);
      }
    }

    if (setClauses.length === 0) {
      return this.findByIdAndUserId(id, userId, client);
    }

    setClauses.push(`updated_at = NOW()`);
    params.push(id);
    params.push(userId);

    const executor = this.getExecutor(client);
    const result = await executor.query<IUserAddressDbRow>(
      `UPDATE user_addresses
       SET ${setClauses.join(", ")}
       WHERE id = $${paramIndex++} AND user_id = $${paramIndex++}
       RETURNING id, user_id, label, full_name, line1, line2, city, state, postal_code,
                 country, phone, is_default, created_at, updated_at;`,
      params
    );

    if (result.rowCount === 0 || !result.rows[0]) return null;
    return mapRowToAddress(result.rows[0]);
  }

  /**
   * Deletes an address with ownership verification.
   */
  public async deleteById(
    id: string,
    userId: string,
    client?: IDbClient
  ): Promise<IUserAddressRecord | null> {
    if (!isValidEntityId(id) || !isValidEntityId(userId)) return null;

    const executor = this.getExecutor(client);
    const result = await executor.query<IUserAddressDbRow>(
      `DELETE FROM user_addresses
       WHERE id = $1 AND user_id = $2
       RETURNING id, user_id, label, full_name, line1, line2, city, state, postal_code,
                 country, phone, is_default, created_at, updated_at;`,
      [id, userId]
    );

    if (result.rowCount === 0 || !result.rows[0]) return null;
    return mapRowToAddress(result.rows[0]);
  }

  /**
   * Sets an address as default, clearing other defaults for the user.
   */
  public async setDefault(id: string, userId: string, client?: IDbClient): Promise<void> {
    if (!isValidEntityId(id) || !isValidEntityId(userId)) {
      throw new AppError("Invalid address or user id", 400);
    }

    const executor = this.getExecutor(client);
    // 1. Clear previous defaults
    await executor.query(
      `UPDATE user_addresses
       SET is_default = FALSE, updated_at = NOW()
       WHERE user_id = $1;`,
      [userId]
    );

    // 2. Set target address as default
    const result = await executor.query(
      `UPDATE user_addresses
       SET is_default = TRUE, updated_at = NOW()
       WHERE id = $1 AND user_id = $2;`,
      [id, userId]
    );

    if (result.rowCount === 0) {
      throw new AppError("Address not found", 404);
    }
  }
}
