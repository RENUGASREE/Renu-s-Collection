/**
 * ============================================================================
 * PostgreSQL Review Repository (Phase 3G)
 * ============================================================================
 *
 * Provides typed, parameterized operations for customer product reviews stored in
 * the Supabase PostgreSQL `reviews` table.
 *
 * Adheres strictly to:
 * - Parameterized SQL queries (preventing SQL injection).
 * - Safe identifier validation.
 * - Accurate rating aggregation and verified purchase verification.
 * - Shared PostgreSQL connection pooling via `PostgresDatabase`.
 * - Zero Mongoose dependencies.
 */

import { randomUUID } from "node:crypto";
import {
  IDbClient,
  IReviewDbRow,
  IReviewRecord,
  ICreateReviewData,
  IUpdateReviewData,
  IProductRatingSummary,
} from "../types/database.types.js";
import { PostgresDatabase } from "../db/postgres.js";
import { assertValidEntityId } from "../utils/helpers.js";

export class PostgresReviewRepository {
  private client?: IDbClient;

  constructor(client?: IDbClient) {
    this.client = client;
  }

  private getExecutor(overrideClient?: IDbClient): IDbClient {
    if (overrideClient) return overrideClient;
    if (this.client) return this.client;
    return PostgresDatabase.getPool();
  }

  public mapRowToReview(row: IReviewDbRow): IReviewRecord {
    let images: string[] = [];
    if (Array.isArray(row.images)) {
      images = row.images;
    } else if (typeof row.images === "string") {
      // Could be Postgres array string like "{img1,img2}" or JSON
      const trimmed = row.images.trim();
      if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
        images = trimmed
          .slice(1, -1)
          .split(",")
          .map((s) => s.trim().replace(/^"(.*)"$/, "$1"))
          .filter(Boolean);
      } else {
        try {
          const parsed = JSON.parse(trimmed);
          if (Array.isArray(parsed)) images = parsed;
        } catch {
          if (trimmed) images = [trimmed];
        }
      }
    }

    return {
      id: String(row.id),
      userId: String(row.user_id),
      productId: String(row.product_id),
      orderId: row.order_id ? String(row.order_id) : null,
      rating: Number(row.rating),
      title: String(row.title),
      body: String(row.body),
      images,
      isVerifiedPurchase: Boolean(row.is_verified_purchase),
      isApproved: Boolean(row.is_approved),
      helpfulCount: Number(row.helpful_count ?? 0),
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      user:
        row.user_username || row.user_email
          ? {
              username: row.user_username ? String(row.user_username) : undefined,
              email: row.user_email ? String(row.user_email) : undefined,
            }
          : undefined,
      product: row.product_name
        ? {
            name: String(row.product_name),
          }
        : undefined,
    };
  }

  /**
   * Find a review by primary key ID.
   */
  public async findById(id: string, client?: IDbClient): Promise<IReviewRecord | null> {
    if (!id || typeof id !== "string") return null;
    assertValidEntityId(id, "reviewId");
    const executor = this.getExecutor(client);
    const sql = `
      SELECT r.id, r.user_id, r.product_id, r.order_id, r.rating, r.title,
             r.body, r.images, r.is_verified_purchase, r.is_approved,
             r.helpful_count, r.created_at, r.updated_at,
             u.username AS user_username, u.email AS user_email,
             p.name AS product_name
      FROM reviews r
      LEFT JOIN users u ON r.user_id = u.id
      LEFT JOIN products p ON r.product_id = p.id
      WHERE r.id = $1
      LIMIT 1;
    `;
    const result = await executor.query<IReviewDbRow>(sql, [id]);
    if (result.rows.length === 0) return null;
    return this.mapRowToReview(result.rows[0]);
  }

  /**
   * Find a review by user and product (checking unique constraint).
   */
  public async findByUserAndProduct(
    userId: string,
    productId: string,
    client?: IDbClient
  ): Promise<IReviewRecord | null> {
    assertValidEntityId(userId, "userId");
    assertValidEntityId(productId, "productId");
    const executor = this.getExecutor(client);
    const sql = `
      SELECT r.id, r.user_id, r.product_id, r.order_id, r.rating, r.title,
             r.body, r.images, r.is_verified_purchase, r.is_approved,
             r.helpful_count, r.created_at, r.updated_at,
             u.username AS user_username, u.email AS user_email,
             p.name AS product_name
      FROM reviews r
      LEFT JOIN users u ON r.user_id = u.id
      LEFT JOIN products p ON r.product_id = p.id
      WHERE r.user_id = $1 AND r.product_id = $2
      LIMIT 1;
    `;
    const result = await executor.query<IReviewDbRow>(sql, [userId, productId]);
    if (result.rows.length === 0) return null;
    return this.mapRowToReview(result.rows[0]);
  }

  /**
   * Find reviews for a specific product with pagination and approval filter.
   */
  public async findByProductId(
    productId: string,
    options?: { isApproved?: boolean; limit?: number; offset?: number },
    client?: IDbClient
  ): Promise<{ reviews: IReviewRecord[]; total: number }> {
    assertValidEntityId(productId, "productId");
    const executor = this.getExecutor(client);
    const conditions: string[] = ["r.product_id = $1"];
    const params: any[] = [productId];
    let pIdx = 2;

    if (options?.isApproved !== undefined) {
      conditions.push(`r.is_approved = $${pIdx++}`);
      params.push(options.isApproved);
    }

    const whereClause = `WHERE ${conditions.join(" AND ")}`;

    const countSql = `SELECT COUNT(*)::integer AS total FROM reviews r ${whereClause};`;
    const countResult = await executor.query<{ total: number }>(countSql, params);
    const total = countResult.rows[0]?.total ?? 0;

    let querySql = `
      SELECT r.id, r.user_id, r.product_id, r.order_id, r.rating, r.title,
             r.body, r.images, r.is_verified_purchase, r.is_approved,
             r.helpful_count, r.created_at, r.updated_at,
             u.username AS user_username, u.email AS user_email,
             p.name AS product_name
      FROM reviews r
      LEFT JOIN users u ON r.user_id = u.id
      LEFT JOIN products p ON r.product_id = p.id
      ${whereClause}
      ORDER BY r.created_at DESC
    `;

    if (options?.limit !== undefined && options.limit > 0) {
      querySql += ` LIMIT $${pIdx++}`;
      params.push(options.limit);
    }
    if (options?.offset !== undefined && options.offset > 0) {
      querySql += ` OFFSET $${pIdx++}`;
      params.push(options.offset);
    }

    const result = await executor.query<IReviewDbRow>(querySql, params);
    return {
      reviews: result.rows.map((row) => this.mapRowToReview(row)),
      total,
    };
  }

  /**
   * Find all reviews (admin view) with optional approval filter and pagination.
   */
  public async findAll(
    options?: { isApproved?: boolean; limit?: number; offset?: number },
    client?: IDbClient
  ): Promise<{ reviews: IReviewRecord[]; total: number }> {
    const executor = this.getExecutor(client);
    const conditions: string[] = [];
    const params: any[] = [];
    let pIdx = 1;

    if (options?.isApproved !== undefined) {
      conditions.push(`r.is_approved = $${pIdx++}`);
      params.push(options.isApproved);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const countSql = `SELECT COUNT(*)::integer AS total FROM reviews r ${whereClause};`;
    const countResult = await executor.query<{ total: number }>(countSql, params);
    const total = countResult.rows[0]?.total ?? 0;

    let querySql = `
      SELECT r.id, r.user_id, r.product_id, r.order_id, r.rating, r.title,
             r.body, r.images, r.is_verified_purchase, r.is_approved,
             r.helpful_count, r.created_at, r.updated_at,
             u.username AS user_username, u.email AS user_email,
             p.name AS product_name
      FROM reviews r
      LEFT JOIN users u ON r.user_id = u.id
      LEFT JOIN products p ON r.product_id = p.id
      ${whereClause}
      ORDER BY r.created_at DESC
    `;

    if (options?.limit !== undefined && options.limit > 0) {
      querySql += ` LIMIT $${pIdx++}`;
      params.push(options.limit);
    }
    if (options?.offset !== undefined && options.offset > 0) {
      querySql += ` OFFSET $${pIdx++}`;
      params.push(options.offset);
    }

    const result = await executor.query<IReviewDbRow>(querySql, params);
    return {
      reviews: result.rows.map((row) => this.mapRowToReview(row)),
      total,
    };
  }

  /**
   * Create a new review.
   */
  public async create(data: ICreateReviewData, client?: IDbClient): Promise<IReviewRecord> {
    assertValidEntityId(data.userId, "userId");
    assertValidEntityId(data.productId, "productId");
    if (data.orderId) assertValidEntityId(data.orderId, "orderId");

    const executor = this.getExecutor(client);
    const id = data.id || randomUUID();

    const sql = `
      INSERT INTO reviews (
        id, user_id, product_id, order_id, rating, title,
        body, images, is_verified_purchase, is_approved,
        helpful_count, created_at, updated_at
      )
      VALUES (
        $1, $2, $3, $4, $5, $6,
        $7, $8, $9, $10,
        $11, NOW(), NOW()
      )
      RETURNING id, user_id, product_id, order_id, rating, title,
                body, images, is_verified_purchase, is_approved,
                helpful_count, created_at, updated_at;
    `;

    const params = [
      id,
      data.userId,
      data.productId,
      data.orderId || null,
      data.rating,
      data.title,
      data.body,
      data.images ?? [],
      data.isVerifiedPurchase || false,
      data.isApproved || false,
      data.helpfulCount ?? 0,
    ];

    const result = await executor.query<IReviewDbRow>(sql, params);
    return this.mapRowToReview(result.rows[0]);
  }

  /**
   * Update review by ID.
   */
  public async updateById(
    id: string,
    data: IUpdateReviewData,
    client?: IDbClient
  ): Promise<IReviewRecord | null> {
    assertValidEntityId(id, "reviewId");
    const executor = this.getExecutor(client);

    const setClauses: string[] = [];
    const params: any[] = [];
    let pIdx = 1;

    if (data.rating !== undefined) {
      setClauses.push(`rating = $${pIdx++}`);
      params.push(data.rating);
    }
    if (data.title !== undefined) {
      setClauses.push(`title = $${pIdx++}`);
      params.push(data.title);
    }
    if (data.body !== undefined) {
      setClauses.push(`body = $${pIdx++}`);
      params.push(data.body);
    }
    if (data.images !== undefined) {
      setClauses.push(`images = $${pIdx++}`);
      params.push(data.images);
    }
    if (data.isApproved !== undefined) {
      setClauses.push(`is_approved = $${pIdx++}`);
      params.push(data.isApproved);
    }
    if (data.helpfulCount !== undefined) {
      setClauses.push(`helpful_count = $${pIdx++}`);
      params.push(data.helpfulCount);
    }

    if (setClauses.length === 0) {
      return this.findById(id, client);
    }

    setClauses.push(`updated_at = NOW()`);
    params.push(id);
    const sql = `
      UPDATE reviews
      SET ${setClauses.join(", ")}
      WHERE id = $${pIdx}
      RETURNING id, user_id, product_id, order_id, rating, title,
                body, images, is_verified_purchase, is_approved,
                helpful_count, created_at, updated_at;
    `;

    const result = await executor.query<IReviewDbRow>(sql, params);
    if (result.rows.length === 0) return null;
    return this.mapRowToReview(result.rows[0]);
  }

  /**
   * Delete a review by ID.
   */
  public async deleteById(id: string, client?: IDbClient): Promise<boolean> {
    assertValidEntityId(id, "reviewId");
    const executor = this.getExecutor(client);
    const sql = `DELETE FROM reviews WHERE id = $1;`;
    const result = await executor.query(sql, [id]);
    return result.rowCount > 0;
  }

  /**
   * Increment helpful count for a review.
   */
  public async incrementHelpfulCount(id: string, client?: IDbClient): Promise<IReviewRecord | null> {
    assertValidEntityId(id, "reviewId");
    const executor = this.getExecutor(client);
    const sql = `
      UPDATE reviews
      SET helpful_count = COALESCE(helpful_count, 0) + 1, updated_at = NOW()
      WHERE id = $1
      RETURNING id, user_id, product_id, order_id, rating, title,
                body, images, is_verified_purchase, is_approved,
                helpful_count, created_at, updated_at;
    `;
    const result = await executor.query<IReviewDbRow>(sql, [id]);
    if (result.rows.length === 0) return null;
    return this.mapRowToReview(result.rows[0]);
  }

  /**
   * Set approval status for a review.
   */
  public async setApproval(id: string, isApproved: boolean, client?: IDbClient): Promise<IReviewRecord | null> {
    assertValidEntityId(id, "reviewId");
    const executor = this.getExecutor(client);
    const sql = `
      UPDATE reviews
      SET is_approved = $2, updated_at = NOW()
      WHERE id = $1
      RETURNING id, user_id, product_id, order_id, rating, title,
                body, images, is_verified_purchase, is_approved,
                helpful_count, created_at, updated_at;
    `;
    const result = await executor.query<IReviewDbRow>(sql, [id, isApproved]);
    if (result.rows.length === 0) return null;
    return this.mapRowToReview(result.rows[0]);
  }

  /**
   * Calculate average rating and approved review count for a product.
   */
  public async calculateRatingSummary(productId: string, client?: IDbClient): Promise<IProductRatingSummary> {
    assertValidEntityId(productId, "productId");
    const executor = this.getExecutor(client);
    const sql = `
      SELECT COALESCE(ROUND(AVG(rating)::numeric, 1), 0.0)::float AS average_rating,
             COUNT(*)::integer AS review_count
      FROM reviews
      WHERE product_id = $1 AND is_approved = TRUE;
    `;
    const result = await executor.query<{ average_rating: number; review_count: number }>(sql, [productId]);
    const row = result.rows[0];
    return {
      averageRating: row ? Number(row.average_rating) : 0,
      reviewCount: row ? Number(row.review_count) : 0,
    };
  }

  /**
   * Check if a user has a valid paid/pending purchase of the product.
   */
  public async checkVerifiedPurchase(
    userId: string,
    productId: string,
    client?: IDbClient
  ): Promise<{ isVerified: boolean; orderId?: string }> {
    assertValidEntityId(userId, "userId");
    assertValidEntityId(productId, "productId");
    const executor = this.getExecutor(client);
    const sql = `
      SELECT o.id
      FROM orders o
      JOIN order_items oi ON o.id = oi.order_id
      WHERE o.user_id = $1
        AND oi.product_id = $2
        AND o.status != 'cancelled'
        AND o.payment_status IN ('paid', 'pending')
      ORDER BY o.created_at DESC
      LIMIT 1;
    `;
    const result = await executor.query<{ id: string }>(sql, [userId, productId]);
    if (result.rows.length > 0) {
      return { isVerified: true, orderId: String(result.rows[0].id) };
    }
    return { isVerified: false };
  }
}
