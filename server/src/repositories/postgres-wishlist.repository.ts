/**
 * ============================================================================
 * PostgreSQL Wishlist Repository (Phase 3E)
 * ============================================================================
 *
 * Implements typed, parameterized data access for the `wishlist_items` table
 * on Supabase PostgreSQL.
 *
 * Guarantees:
 * 1. Parameterized SQL only — prevents SQL injection.
 * 2. Strict ID validation accepting both 24-char hex MongoDB ObjectIds and 36-char UUIDs.
 * 3. Duplicate prevention via UNIQUE(user_id, product_id) with idempotent upsert.
 * 4. Dual identifier compatibility (`id` and `_id`) matching frontend contracts.
 * 5. Automatic join with products table to populate product name, price, media, and stock.
 */

import {
  IDbClient,
  IDbPool,
  IWishlistItemDbRow,
  IWishlistItemRecord,
} from "../types/database.types.js";
import { PostgresDatabase } from "../db/postgres.js";
import { isValidEntityId } from "../utils/helpers.js";
import crypto from "crypto";

export function mapRowToWishlistItem(row: IWishlistItemDbRow): IWishlistItemRecord {
  const idStr = String(row.id);
  const productIdStr = String(row.product_id);

  let product: IWishlistItemRecord["product"] = undefined;
  if (row.product_name !== undefined && row.product_name !== null) {
    let media: any[] = [];
    if (row.product_media) {
      if (Array.isArray(row.product_media)) {
        media = row.product_media;
      } else if (typeof row.product_media === "string") {
        try {
          media = JSON.parse(row.product_media);
        } catch {
          media = [];
        }
      }
    }

    product = {
      id: productIdStr,
      _id: productIdStr,
      name: String(row.product_name),
      sku: String(row.product_sku || ""),
      price: typeof row.product_price === "string" ? parseFloat(row.product_price) : Number(row.product_price || 0),
      salePrice: row.product_sale_price !== null && row.product_sale_price !== undefined
        ? (typeof row.product_sale_price === "string" ? parseFloat(row.product_sale_price) : Number(row.product_sale_price))
        : null,
      media,
      stock: Number(row.product_stock ?? 0),
      isActive: Boolean(row.product_is_active ?? true),
    };
  }

  return {
    id: idStr,
    _id: idStr,
    userId: String(row.user_id),
    productId: productIdStr,
    createdAt: row.created_at instanceof Date ? row.created_at : new Date(row.created_at),
    updatedAt: row.updated_at instanceof Date ? row.updated_at : new Date(row.updated_at),
    product,
  };
}

export class PostgresWishlistRepository {
  private readonly pool?: IDbPool;

  constructor(pool?: IDbPool) {
    this.pool = pool;
  }

  private getExecutor(client?: IDbClient): IDbClient {
    if (client) return client;
    if (this.pool) return this.pool;
    return PostgresDatabase.getPool();
  }

  /**
   * Retrieves all wishlist items for a user, populated with product information.
   */
  public async findByUserId(userId: string, client?: IDbClient): Promise<IWishlistItemRecord[]> {
    if (!isValidEntityId(userId)) return [];

    const executor = this.getExecutor(client);
    const result = await executor.query<IWishlistItemDbRow>(
      `SELECT w.id, w.user_id, w.product_id, w.created_at, w.updated_at,
              p.name AS product_name, p.sku AS product_sku, p.price AS product_price,
              p.sale_price AS product_sale_price, p.media AS product_media,
              p.stock AS product_stock, p.is_active AS product_is_active
       FROM wishlist_items w
       LEFT JOIN products p ON w.product_id = p.id
       WHERE w.user_id = $1
       ORDER BY w.created_at DESC;`,
      [userId]
    );

    return result.rows.map(mapRowToWishlistItem);
  }

  /**
   * Finds a wishlist item by user ID and product ID.
   */
  public async findByUserAndProduct(
    userId: string,
    productId: string,
    client?: IDbClient
  ): Promise<IWishlistItemRecord | null> {
    if (!isValidEntityId(userId) || !isValidEntityId(productId)) return null;

    const executor = this.getExecutor(client);
    const result = await executor.query<IWishlistItemDbRow>(
      `SELECT w.id, w.user_id, w.product_id, w.created_at, w.updated_at,
              p.name AS product_name, p.sku AS product_sku, p.price AS product_price,
              p.sale_price AS product_sale_price, p.media AS product_media,
              p.stock AS product_stock, p.is_active AS product_is_active
       FROM wishlist_items w
       LEFT JOIN products p ON w.product_id = p.id
       WHERE w.user_id = $1 AND w.product_id = $2
       LIMIT 1;`,
      [userId, productId]
    );

    if (result.rowCount === 0 || !result.rows[0]) return null;
    return mapRowToWishlistItem(result.rows[0]);
  }

  /**
   * Adds a product to a user's wishlist (or updates timestamp if already present).
   */
  public async addItem(
    userId: string,
    productId: string,
    id?: string,
    client?: IDbClient
  ): Promise<IWishlistItemRecord> {
    const executor = this.getExecutor(client);
    const resolvedId = id || crypto.randomUUID();

    const result = await executor.query<IWishlistItemDbRow>(
      `INSERT INTO wishlist_items (id, user_id, product_id, created_at, updated_at)
       VALUES ($1, $2, $3, NOW(), NOW())
       ON CONFLICT (user_id, product_id)
       DO UPDATE SET updated_at = NOW()
       RETURNING id, user_id, product_id, created_at, updated_at;`,
      [resolvedId, userId, productId]
    );

    return mapRowToWishlistItem(result.rows[0]);
  }

  /**
   * Deletes a wishlist item by its ID, enforcing user ownership.
   */
  public async deleteByIdAndUserId(
    id: string,
    userId: string,
    client?: IDbClient
  ): Promise<boolean> {
    if (!isValidEntityId(id) || !isValidEntityId(userId)) return false;

    const executor = this.getExecutor(client);
    const result = await executor.query(
      `DELETE FROM wishlist_items
       WHERE id = $1 AND user_id = $2;`,
      [id, userId]
    );

    return result.rowCount > 0;
  }

  /**
   * Deletes a wishlist item by user ID and product ID.
   */
  public async deleteByUserAndProduct(
    userId: string,
    productId: string,
    client?: IDbClient
  ): Promise<boolean> {
    if (!isValidEntityId(userId) || !isValidEntityId(productId)) return false;

    const executor = this.getExecutor(client);
    const result = await executor.query(
      `DELETE FROM wishlist_items
       WHERE user_id = $1 AND product_id = $2;`,
      [userId, productId]
    );

    return result.rowCount > 0;
  }

  /**
   * Clears all wishlist items for a user.
   */
  public async clearByUserId(userId: string, client?: IDbClient): Promise<number> {
    if (!isValidEntityId(userId)) return 0;

    const executor = this.getExecutor(client);
    const result = await executor.query(
      `DELETE FROM wishlist_items WHERE user_id = $1;`,
      [userId]
    );

    return result.rowCount;
  }

  /**
   * Counts the total number of wishlist items for a user.
   */
  public async countByUserId(userId: string, client?: IDbClient): Promise<number> {
    if (!isValidEntityId(userId)) return 0;

    const executor = this.getExecutor(client);
    const result = await executor.query<{ count: number }>(
      `SELECT COUNT(*)::int AS count FROM wishlist_items WHERE user_id = $1;`,
      [userId]
    );

    return result.rows[0]?.count ?? 0;
  }
}
