/**
 * ============================================================================
 * PostgreSQL Coupon Repository (Phase 3G)
 * ============================================================================
 *
 * Provides typed, parameterized operations for coupons stored in
 * the Supabase PostgreSQL `coupons` table.
 *
 * Adheres strictly to:
 * - Parameterized SQL queries (preventing SQL injection).
 * - Safe identifier validation.
 * - Atomic concurrency checks for coupon usage limits.
 * - Shared PostgreSQL connection pooling via `PostgresDatabase`.
 * - Zero Mongoose dependencies.
 */

import { randomUUID } from "node:crypto";
import {
  IDbClient,
  ICouponDbRow,
  ICouponRecord,
  ICreateCouponData,
  IUpdateCouponData,
} from "../types/database.types.js";
import { PostgresDatabase } from "../db/postgres.js";
import { assertValidEntityId } from "../utils/helpers.js";

export class PostgresCouponRepository {
  private client?: IDbClient;

  constructor(client?: IDbClient) {
    this.client = client;
  }

  private getExecutor(overrideClient?: IDbClient): IDbClient {
    if (overrideClient) return overrideClient;
    if (this.client) return this.client;
    return PostgresDatabase.getPool();
  }

  public mapRowToCoupon(row: ICouponDbRow): ICouponRecord {
    return {
      id: String(row.id),
      code: String(row.code).toUpperCase(),
      description: row.description ? String(row.description) : undefined,
      type: row.type as "percentage" | "fixed",
      value: Number(row.value),
      minOrderAmount: Number(row.min_order_amount ?? 0),
      maxDiscount: row.max_discount !== null && row.max_discount !== undefined ? Number(row.max_discount) : undefined,
      usageLimit: row.usage_limit !== null && row.usage_limit !== undefined ? Number(row.usage_limit) : undefined,
      usedCount: Number(row.used_count ?? 0),
      isActive: Boolean(row.is_active),
      startsAt: row.starts_at ? new Date(row.starts_at) : undefined,
      expiresAt: row.expires_at ? new Date(row.expires_at) : undefined,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  /**
   * Find a coupon by its unique code (case-insensitive).
   */
  public async findByCode(code: string, client?: IDbClient): Promise<ICouponRecord | null> {
    if (!code || typeof code !== "string") return null;
    const executor = this.getExecutor(client);
    const sql = `
      SELECT id, code, description, type, value, min_order_amount,
             max_discount, usage_limit, used_count, is_active,
             starts_at, expires_at, created_at, updated_at
      FROM coupons
      WHERE UPPER(code) = UPPER($1)
      LIMIT 1;
    `;
    const result = await executor.query<ICouponDbRow>(sql, [code.trim()]);
    if (result.rows.length === 0) return null;
    return this.mapRowToCoupon(result.rows[0]);
  }

  /**
   * Find a coupon by primary key ID.
   */
  public async findById(id: string, client?: IDbClient): Promise<ICouponRecord | null> {
    if (!id || typeof id !== "string") return null;
    assertValidEntityId(id, "couponId");
    const executor = this.getExecutor(client);
    const sql = `
      SELECT id, code, description, type, value, min_order_amount,
             max_discount, usage_limit, used_count, is_active,
             starts_at, expires_at, created_at, updated_at
      FROM coupons
      WHERE id = $1
      LIMIT 1;
    `;
    const result = await executor.query<ICouponDbRow>(sql, [id]);
    if (result.rows.length === 0) return null;
    return this.mapRowToCoupon(result.rows[0]);
  }

  /**
   * List coupons with optional filtering and pagination.
   */
  public async findAll(
    options?: { isActive?: boolean; limit?: number; offset?: number },
    client?: IDbClient
  ): Promise<{ coupons: ICouponRecord[]; total: number }> {
    const executor = this.getExecutor(client);
    const conditions: string[] = [];
    const params: any[] = [];
    let pIdx = 1;

    if (options?.isActive !== undefined) {
      conditions.push(`is_active = $${pIdx++}`);
      params.push(options.isActive);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const countSql = `SELECT COUNT(*)::integer AS total FROM coupons ${whereClause};`;
    const countResult = await executor.query<{ total: number }>(countSql, params);
    const total = countResult.rows[0]?.total ?? 0;

    let querySql = `
      SELECT id, code, description, type, value, min_order_amount,
             max_discount, usage_limit, used_count, is_active,
             starts_at, expires_at, created_at, updated_at
      FROM coupons
      ${whereClause}
      ORDER BY created_at DESC
    `;

    if (options?.limit !== undefined && options.limit > 0) {
      querySql += ` LIMIT $${pIdx++}`;
      params.push(options.limit);
    }
    if (options?.offset !== undefined && options.offset > 0) {
      querySql += ` OFFSET $${pIdx++}`;
      params.push(options.offset);
    }

    const result = await executor.query<ICouponDbRow>(querySql, params);
    return {
      coupons: result.rows.map((row) => this.mapRowToCoupon(row)),
      total,
    };
  }

  /**
   * Create a new coupon.
   */
  public async create(data: ICreateCouponData, client?: IDbClient): Promise<ICouponRecord> {
    const executor = this.getExecutor(client);
    const id = data.id || randomUUID();
    const code = data.code.trim().toUpperCase();

    const sql = `
      INSERT INTO coupons (
        id, code, description, type, value, min_order_amount,
        max_discount, usage_limit, used_count, is_active,
        starts_at, expires_at, created_at, updated_at
      )
      VALUES (
        $1, $2, $3, $4, $5, $6,
        $7, $8, $9, $10,
        $11, $12, NOW(), NOW()
      )
      RETURNING id, code, description, type, value, min_order_amount,
                max_discount, usage_limit, used_count, is_active,
                starts_at, expires_at, created_at, updated_at;
    `;

    const params = [
      id,
      code,
      data.description || null,
      data.type,
      data.value,
      data.minOrderAmount ?? 0,
      data.maxDiscount ?? null,
      data.usageLimit ?? null,
      data.usedCount ?? 0,
      data.isActive !== undefined ? data.isActive : true,
      data.startsAt ? new Date(data.startsAt) : null,
      data.expiresAt ? new Date(data.expiresAt) : null,
    ];

    const result = await executor.query<ICouponDbRow>(sql, params);
    return this.mapRowToCoupon(result.rows[0]);
  }

  /**
   * Update a coupon by ID.
   */
  public async updateById(
    id: string,
    data: IUpdateCouponData,
    client?: IDbClient
  ): Promise<ICouponRecord | null> {
    assertValidEntityId(id, "couponId");
    const executor = this.getExecutor(client);

    const setClauses: string[] = [];
    const params: any[] = [];
    let pIdx = 1;

    if (data.code !== undefined) {
      setClauses.push(`code = $${pIdx++}`);
      params.push(data.code.trim().toUpperCase());
    }
    if (data.description !== undefined) {
      setClauses.push(`description = $${pIdx++}`);
      params.push(data.description);
    }
    if (data.type !== undefined) {
      setClauses.push(`type = $${pIdx++}`);
      params.push(data.type);
    }
    if (data.value !== undefined) {
      setClauses.push(`value = $${pIdx++}`);
      params.push(data.value);
    }
    if (data.minOrderAmount !== undefined) {
      setClauses.push(`min_order_amount = $${pIdx++}`);
      params.push(data.minOrderAmount);
    }
    if (data.maxDiscount !== undefined) {
      setClauses.push(`max_discount = $${pIdx++}`);
      params.push(data.maxDiscount);
    }
    if (data.usageLimit !== undefined) {
      setClauses.push(`usage_limit = $${pIdx++}`);
      params.push(data.usageLimit);
    }
    if (data.usedCount !== undefined) {
      setClauses.push(`used_count = $${pIdx++}`);
      params.push(data.usedCount);
    }
    if (data.isActive !== undefined) {
      setClauses.push(`is_active = $${pIdx++}`);
      params.push(data.isActive);
    }
    if (data.startsAt !== undefined) {
      setClauses.push(`starts_at = $${pIdx++}`);
      params.push(data.startsAt ? new Date(data.startsAt) : null);
    }
    if (data.expiresAt !== undefined) {
      setClauses.push(`expires_at = $${pIdx++}`);
      params.push(data.expiresAt ? new Date(data.expiresAt) : null);
    }

    if (setClauses.length === 0) {
      return this.findById(id, client);
    }

    setClauses.push(`updated_at = NOW()`);
    params.push(id);
    const sql = `
      UPDATE coupons
      SET ${setClauses.join(", ")}
      WHERE id = $${pIdx}
      RETURNING id, code, description, type, value, min_order_amount,
                max_discount, usage_limit, used_count, is_active,
                starts_at, expires_at, created_at, updated_at;
    `;

    const result = await executor.query<ICouponDbRow>(sql, params);
    if (result.rows.length === 0) return null;
    return this.mapRowToCoupon(result.rows[0]);
  }

  /**
   * Delete a coupon by ID.
   */
  public async deleteById(id: string, client?: IDbClient): Promise<boolean> {
    assertValidEntityId(id, "couponId");
    const executor = this.getExecutor(client);
    const sql = `DELETE FROM coupons WHERE id = $1;`;
    const result = await executor.query(sql, [id]);
    return result.rowCount > 0;
  }

  /**
   * Atomic increment of used_count with usage_limit check.
   * Returns true if increment succeeded, false if limit was reached or coupon is inactive.
   */
  public async atomicIncrementUsedCount(idOrCode: string, client?: IDbClient): Promise<boolean> {
    if (!idOrCode) return false;
    const executor = this.getExecutor(client);
    const sql = `
      UPDATE coupons
      SET used_count = used_count + 1, updated_at = NOW()
      WHERE (id = $1 OR UPPER(code) = UPPER($1))
        AND is_active = TRUE
        AND (usage_limit IS NULL OR used_count < usage_limit)
      RETURNING id;
    `;
    const result = await executor.query<{ id: string }>(sql, [idOrCode.trim()]);
    return result.rowCount > 0;
  }

  /**
   * Decrements used_count (safe rollback on failed checkout/order cancellation).
   */
  public async decrementUsedCount(idOrCode: string, client?: IDbClient): Promise<boolean> {
    if (!idOrCode) return false;
    const executor = this.getExecutor(client);
    const sql = `
      UPDATE coupons
      SET used_count = GREATEST(0, used_count - 1), updated_at = NOW()
      WHERE (id = $1 OR UPPER(code) = UPPER($1))
      RETURNING id;
    `;
    const result = await executor.query<{ id: string }>(sql, [idOrCode.trim()]);
    return result.rowCount > 0;
  }
}
