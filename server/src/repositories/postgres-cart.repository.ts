/**
 * ============================================================================
 * PostgreSQL Cart Repository (Phase 3E)
 * ============================================================================
 *
 * Implements typed, parameterized data access for the `carts` and `cart_items`
 * tables on Supabase PostgreSQL.
 *
 * Guarantees:
 * 1. Parameterized SQL only — prevents SQL injection.
 * 2. Strict ID validation accepting both 24-char hex MongoDB ObjectIds and 36-char UUIDs.
 * 3. Atomic cart item manipulations and multi-statement transaction client support.
 * 4. Dual identifier compatibility (`id` and `_id`) matching frontend and service contracts.
 * 5. Handles both authenticated customer carts (`user_id`) and guest session carts (`session_id`).
 */

import {
  IDbClient,
  IDbPool,
  ICartDbRow,
  ICartItemDbRow,
  ICartRecord,
  ICartItemRecord,
  ICreateCartData,
  ICreateCartItemData,
  IUpdateCartItemData,
} from "../types/database.types.js";
import { PostgresDatabase } from "../db/postgres.js";
import { isValidEntityId } from "../utils/helpers.js";
import crypto from "crypto";

export function mapRowToCartItem(row: ICartItemDbRow): ICartItemRecord {
  const idStr = String(row.id);
  const parseJson = (val: any) => {
    if (!val) return undefined;
    if (typeof val === "object") return val;
    try {
      return JSON.parse(val);
    } catch {
      return val;
    }
  };

  return {
    id: idStr,
    _id: idStr,
    cartId: String(row.cart_id),
    itemType: row.item_type || "product",
    productId: row.product_id ? String(row.product_id) : undefined,
    sku: String(row.sku),
    name: String(row.name),
    imageUrl: row.image_url ? String(row.image_url) : undefined,
    unitPrice: typeof row.unit_price === "string" ? parseFloat(row.unit_price) : Number(row.unit_price),
    quantity: Number(row.quantity),
    customization: parseJson(row.customization),
    studioDesign: parseJson(row.studio_design),
    savedForLater: Boolean(row.saved_for_later),
    createdAt: row.created_at instanceof Date ? row.created_at : new Date(row.created_at),
    updatedAt: row.updated_at instanceof Date ? row.updated_at : new Date(row.updated_at),
  };
}

export function mapRowToCart(row: ICartDbRow, items: ICartItemRecord[] = []): ICartRecord {
  const idStr = String(row.id);
  return {
    id: idStr,
    _id: idStr,
    userId: row.user_id ? String(row.user_id) : null,
    sessionId: row.session_id ? String(row.session_id) : null,
    couponCode: row.coupon_code ? String(row.coupon_code) : undefined,
    items,
    createdAt: row.created_at instanceof Date ? row.created_at : new Date(row.created_at),
    updatedAt: row.updated_at instanceof Date ? row.updated_at : new Date(row.updated_at),
  };
}

export class PostgresCartRepository {
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
   * Finds a cart by user ID, including its associated cart items.
   */
  public async findByUserId(userId: string, client?: IDbClient): Promise<ICartRecord | null> {
    if (!isValidEntityId(userId)) return null;

    const executor = this.getExecutor(client);
    const result = await executor.query<ICartDbRow>(
      `SELECT id, user_id, session_id, coupon_code, created_at, updated_at
       FROM carts
       WHERE user_id = $1
       LIMIT 1;`,
      [userId]
    );

    if (result.rowCount === 0 || !result.rows[0]) return null;

    const items = await this.getItemsByCartId(result.rows[0].id, client);
    return mapRowToCart(result.rows[0], items);
  }

  /**
   * Finds a cart by session ID (guest cart), including its associated cart items.
   */
  public async findBySessionId(sessionId: string, client?: IDbClient): Promise<ICartRecord | null> {
    if (!sessionId || !sessionId.trim()) return null;

    const executor = this.getExecutor(client);
    const result = await executor.query<ICartDbRow>(
      `SELECT id, user_id, session_id, coupon_code, created_at, updated_at
       FROM carts
       WHERE session_id = $1
       LIMIT 1;`,
      [sessionId.trim()]
    );

    if (result.rowCount === 0 || !result.rows[0]) return null;

    const items = await this.getItemsByCartId(result.rows[0].id, client);
    return mapRowToCart(result.rows[0], items);
  }

  /**
   * Finds a cart by cart ID, including its associated cart items.
   */
  public async findById(id: string, client?: IDbClient): Promise<ICartRecord | null> {
    if (!isValidEntityId(id)) return null;

    const executor = this.getExecutor(client);
    const result = await executor.query<ICartDbRow>(
      `SELECT id, user_id, session_id, coupon_code, created_at, updated_at
       FROM carts
       WHERE id = $1
       LIMIT 1;`,
      [id]
    );

    if (result.rowCount === 0 || !result.rows[0]) return null;

    const items = await this.getItemsByCartId(result.rows[0].id, client);
    return mapRowToCart(result.rows[0], items);
  }

  /**
   * Creates a new cart record in PostgreSQL.
   */
  public async create(data: ICreateCartData, client?: IDbClient): Promise<ICartRecord> {
    const executor = this.getExecutor(client);
    const id = data.id || crypto.randomUUID();

    const result = await executor.query<ICartDbRow>(
      `INSERT INTO carts (id, user_id, session_id, coupon_code, created_at, updated_at)
       VALUES ($1, $2, $3, $4, NOW(), NOW())
       RETURNING id, user_id, session_id, coupon_code, created_at, updated_at;`,
      [
        id,
        data.userId || null,
        data.sessionId || null,
        data.couponCode || null,
      ]
    );

    return mapRowToCart(result.rows[0], []);
  }

  /**
   * Updates cart-level fields (e.g. couponCode, userId, sessionId).
   */
  public async updateById(
    id: string,
    data: Partial<ICreateCartData>,
    client?: IDbClient
  ): Promise<ICartRecord | null> {
    if (!isValidEntityId(id)) return null;

    const setClauses: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (data.userId !== undefined) {
      setClauses.push(`user_id = $${idx++}`);
      params.push(data.userId || null);
    }
    if (data.sessionId !== undefined) {
      setClauses.push(`session_id = $${idx++}`);
      params.push(data.sessionId || null);
    }
    if (data.couponCode !== undefined) {
      setClauses.push(`coupon_code = $${idx++}`);
      params.push(data.couponCode || null);
    }

    if (setClauses.length === 0) {
      return this.findById(id, client);
    }

    setClauses.push(`updated_at = NOW()`);
    params.push(id);

    const executor = this.getExecutor(client);
    const result = await executor.query<ICartDbRow>(
      `UPDATE carts
       SET ${setClauses.join(", ")}
       WHERE id = $${idx}
       RETURNING id, user_id, session_id, coupon_code, created_at, updated_at;`,
      params
    );

    if (result.rowCount === 0 || !result.rows[0]) return null;

    const items = await this.getItemsByCartId(id, client);
    return mapRowToCart(result.rows[0], items);
  }

  /**
   * Deletes a cart by its ID (cascades to all cart_items automatically).
   */
  public async deleteById(id: string, client?: IDbClient): Promise<boolean> {
    if (!isValidEntityId(id)) return false;

    const executor = this.getExecutor(client);
    const result = await executor.query(
      `DELETE FROM carts WHERE id = $1;`,
      [id]
    );

    return result.rowCount > 0;
  }

  /**
   * Retrieves all items belonging to a cart ordered by created_at ascending.
   */
  public async getItemsByCartId(cartId: string, client?: IDbClient): Promise<ICartItemRecord[]> {
    if (!isValidEntityId(cartId)) return [];

    const executor = this.getExecutor(client);
    const result = await executor.query<ICartItemDbRow>(
      `SELECT id, cart_id, item_type, product_id, sku, name, image_url, unit_price,
              quantity, customization, studio_design, saved_for_later, created_at, updated_at
       FROM cart_items
       WHERE cart_id = $1
       ORDER BY created_at ASC;`,
      [cartId]
    );

    return result.rows.map(mapRowToCartItem);
  }

  /**
   * Retrieves a single cart item by ID.
   */
  public async getItemById(itemId: string, client?: IDbClient): Promise<ICartItemRecord | null> {
    if (!isValidEntityId(itemId)) return null;

    const executor = this.getExecutor(client);
    const result = await executor.query<ICartItemDbRow>(
      `SELECT id, cart_id, item_type, product_id, sku, name, image_url, unit_price,
              quantity, customization, studio_design, saved_for_later, created_at, updated_at
       FROM cart_items
       WHERE id = $1
       LIMIT 1;`,
      [itemId]
    );

    if (result.rowCount === 0 || !result.rows[0]) return null;
    return mapRowToCartItem(result.rows[0]);
  }

  /**
   * Adds an item to a cart.
   */
  public async addItem(data: ICreateCartItemData, client?: IDbClient): Promise<ICartItemRecord> {
    const executor = this.getExecutor(client);
    const id = data.id || crypto.randomUUID();

    const result = await executor.query<ICartItemDbRow>(
      `INSERT INTO cart_items (
         id, cart_id, item_type, product_id, sku, name, image_url,
         unit_price, quantity, customization, studio_design, saved_for_later,
         created_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), NOW())
       RETURNING id, cart_id, item_type, product_id, sku, name, image_url, unit_price,
                 quantity, customization, studio_design, saved_for_later, created_at, updated_at;`,
      [
        id,
        data.cartId,
        data.itemType || "product",
        data.productId || null,
        data.sku,
        data.name,
        data.imageUrl || null,
        data.unitPrice,
        data.quantity ?? 1,
        data.customization ? JSON.stringify(data.customization) : JSON.stringify({}),
        data.studioDesign ? JSON.stringify(data.studioDesign) : null,
        data.savedForLater ?? false,
      ]
    );

    return mapRowToCartItem(result.rows[0]);
  }

  /**
   * Updates a cart item's quantity, price, or saved_for_later status.
   */
  public async updateItem(
    itemId: string,
    data: IUpdateCartItemData,
    client?: IDbClient
  ): Promise<ICartItemRecord | null> {
    if (!isValidEntityId(itemId)) return null;

    const setClauses: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (data.quantity !== undefined) {
      setClauses.push(`quantity = $${idx++}`);
      params.push(data.quantity);
    }
    if (data.unitPrice !== undefined) {
      setClauses.push(`unit_price = $${idx++}`);
      params.push(data.unitPrice);
    }
    if (data.customization !== undefined) {
      setClauses.push(`customization = $${idx++}`);
      params.push(data.customization ? JSON.stringify(data.customization) : JSON.stringify({}));
    }
    if (data.studioDesign !== undefined) {
      setClauses.push(`studio_design = $${idx++}`);
      params.push(data.studioDesign ? JSON.stringify(data.studioDesign) : null);
    }
    if (data.savedForLater !== undefined) {
      setClauses.push(`saved_for_later = $${idx++}`);
      params.push(data.savedForLater);
    }

    if (setClauses.length === 0) {
      return this.getItemById(itemId, client);
    }

    setClauses.push(`updated_at = NOW()`);
    params.push(itemId);

    const executor = this.getExecutor(client);
    const result = await executor.query<ICartItemDbRow>(
      `UPDATE cart_items
       SET ${setClauses.join(", ")}
       WHERE id = $${idx}
       RETURNING id, cart_id, item_type, product_id, sku, name, image_url, unit_price,
                 quantity, customization, studio_design, saved_for_later, created_at, updated_at;`,
      params
    );

    if (result.rowCount === 0 || !result.rows[0]) return null;
    return mapRowToCartItem(result.rows[0]);
  }

  /**
   * Deletes a single cart item by ID.
   */
  public async deleteItem(itemId: string, client?: IDbClient): Promise<boolean> {
    if (!isValidEntityId(itemId)) return false;

    const executor = this.getExecutor(client);
    const result = await executor.query(
      `DELETE FROM cart_items WHERE id = $1;`,
      [itemId]
    );

    return result.rowCount > 0;
  }

  /**
   * Clears cart items, optionally preserving saved_for_later items.
   */
  public async clearCartItems(
    cartId: string,
    preserveSavedForLater = true,
    client?: IDbClient
  ): Promise<number> {
    if (!isValidEntityId(cartId)) return 0;

    const executor = this.getExecutor(client);
    let sql = `DELETE FROM cart_items WHERE cart_id = $1`;
    if (preserveSavedForLater) {
      sql += ` AND saved_for_later = FALSE`;
    }

    const result = await executor.query(sql, [cartId]);
    return result.rowCount;
  }
}
