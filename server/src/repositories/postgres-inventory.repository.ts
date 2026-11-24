/**
 * ============================================================================
 * PostgreSQL Inventory Repository (Phase 3C-4)
 * ============================================================================
 *
 * Implements typed, parameterized data-access for inventory logs and stock
 * movements on Supabase PostgreSQL.
 *
 * Guarantees:
 * 1. Parameterized SQL only — prevents SQL injection.
 * 2. Strict ID validation accepting both 24-char hex MongoDB ObjectIds and 36-char UUIDs.
 * 3. Atomic conditional stock adjustments with row-level locking.
 * 4. Dual identifier support (id and _id) on all mapped entities.
 * 5. Reusable across standalone queries and transactional clients.
 */

import {
  IDbClient,
  IDbPool,
  IInventoryLogDbRow,
  IInventoryLogRecord,
  ICreateInventoryLogData,
  IInventoryLogFilterOptions,
  IInventorySummaryRecord,
} from "../types/database.types.js";
import { PostgresDatabase } from "../db/postgres.js";
import { isValidEntityId } from "../utils/helpers.js";
import { AppError } from "../middleware/errorHandler.js";
import type { InventoryAction } from "../types/index.js";

// Allowed actions enforced by CHECK constraint in PostgreSQL schema:
// CHECK (action IN ('add', 'deduct', 'adjust', 'reserve', 'release'))
const ALLOWED_SQL_ACTIONS = new Set(["add", "deduct", "adjust", "reserve", "release"]);

/**
 * Normalizes domain inventory action to PostgreSQL schema constraint.
 * 'confirm' is mapped to 'adjust'.
 */
function normalizeActionForSql(action: string): "add" | "deduct" | "adjust" | "reserve" | "release" {
  if (ALLOWED_SQL_ACTIONS.has(action)) {
    return action as "add" | "deduct" | "adjust" | "reserve" | "release";
  }
  return "adjust";
}

/**
 * Maps raw PostgreSQL row to typed domain entity with dual id/_id compatibility.
 */
export function mapRowToInventoryLog(row: IInventoryLogDbRow): IInventoryLogRecord {
  const idStr = String(row.id);
  return {
    id: idStr,
    _id: idStr,
    productId: String(row.product_id),
    sku: String(row.sku),
    action: row.action as InventoryAction,
    quantityChange: Number(row.quantity_change),
    previousStock: Number(row.previous_stock),
    newStock: Number(row.new_stock),
    reason: row.reason ? String(row.reason) : null,
    orderId: row.order_id ? String(row.order_id) : null,
    performedBy: row.performed_by ? String(row.performed_by) : null,
    createdAt: row.created_at instanceof Date ? row.created_at : new Date(row.created_at),
  };
}

export class PostgresInventoryRepository {
  private readonly pool?: IDbPool;

  constructor(pool?: IDbPool) {
    this.pool = pool;
  }

  private getExecutor(client?: IDbClient): IDbClient {
    return client ?? this.pool ?? PostgresDatabase.getPool();
  }

  /**
   * Creates an inventory audit log record in `inventory_logs`.
   */
  public async createLog(
    data: ICreateInventoryLogData,
    client?: IDbClient
  ): Promise<IInventoryLogRecord> {
    if (!isValidEntityId(data.productId)) {
      throw new AppError("Invalid product id", 400);
    }
    if (!data.sku || typeof data.sku !== "string" || !data.sku.trim()) {
      throw new AppError("SKU is required for inventory log", 400);
    }
    if (!Number.isFinite(data.quantityChange) || !Number.isInteger(data.quantityChange)) {
      throw new AppError("Invalid quantity change", 400);
    }

    const executor = this.getExecutor(client);
    const sqlAction = normalizeActionForSql(data.action);

    // Foreign key safety checks
    let validOrderId: string | null = null;
    if (data.orderId && isValidEntityId(data.orderId)) {
      const orderCheck = await executor.query(
        "SELECT id FROM orders WHERE id = $1 LIMIT 1;",
        [data.orderId]
      );
      if (orderCheck.rowCount && orderCheck.rowCount > 0) {
        validOrderId = data.orderId;
      }
    }

    let validUserId: string | null = null;
    if (data.performedBy && isValidEntityId(data.performedBy)) {
      const userCheck = await executor.query(
        "SELECT id FROM users WHERE id = $1 LIMIT 1;",
        [data.performedBy]
      );
      if (userCheck.rowCount && userCheck.rowCount > 0) {
        validUserId = data.performedBy;
      }
    }

    const result = await executor.query<IInventoryLogDbRow>(
      `INSERT INTO inventory_logs (
         id, product_id, sku, action, quantity_change, previous_stock, new_stock, reason, order_id, performed_by, created_at
       ) VALUES (
         COALESCE($1, gen_random_uuid()::text), $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW()
       )
       RETURNING id, product_id, sku, action, quantity_change, previous_stock, new_stock, reason, order_id, performed_by, created_at;`,
      [
        data.id || null,
        data.productId,
        data.sku.trim().toUpperCase(),
        sqlAction,
        data.quantityChange,
        data.previousStock,
        data.newStock,
        data.reason ?? null,
        validOrderId,
        validUserId,
      ]
    );

    return mapRowToInventoryLog(result.rows[0]);
  }

  /**
   * Retrieves paginated inventory logs matching filter criteria.
   */
  public async findLogs(
    filters?: IInventoryLogFilterOptions,
    pagination?: { page?: number; limit?: number },
    client?: IDbClient
  ): Promise<{ items: IInventoryLogRecord[]; total: number }> {
    const executor = this.getExecutor(client);

    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (filters?.productId) {
      if (!isValidEntityId(filters.productId)) {
        throw new AppError("Invalid product id", 400);
      }
      conditions.push(`product_id = $${paramIndex++}`);
      params.push(filters.productId);
    }

    if (filters?.sku) {
      conditions.push(`UPPER(sku) = UPPER($${paramIndex++})`);
      params.push(filters.sku.trim());
    }

    if (filters?.action) {
      const sqlAction = normalizeActionForSql(filters.action);
      conditions.push(`action = $${paramIndex++}`);
      params.push(sqlAction);
    }

    if (filters?.orderId) {
      if (!isValidEntityId(filters.orderId)) {
        throw new AppError("Invalid order id", 400);
      }
      conditions.push(`order_id = $${paramIndex++}`);
      params.push(filters.orderId);
    }

    if (filters?.performedBy) {
      if (!isValidEntityId(filters.performedBy)) {
        throw new AppError("Invalid user id", 400);
      }
      conditions.push(`performed_by = $${paramIndex++}`);
      params.push(filters.performedBy);
    }

    if (filters?.startDate) {
      conditions.push(`created_at >= $${paramIndex++}`);
      params.push(filters.startDate instanceof Date ? filters.startDate : new Date(filters.startDate));
    }

    if (filters?.endDate) {
      conditions.push(`created_at <= $${paramIndex++}`);
      params.push(filters.endDate instanceof Date ? filters.endDate : new Date(filters.endDate));
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    // Count query
    const countResult = await executor.query<{ total: number | string }>(
      `SELECT COUNT(*)::int AS total FROM inventory_logs ${whereClause};`,
      params
    );
    const total = Number(countResult.rows[0]?.total ?? 0);

    // Pagination
    const page = Math.max(1, pagination?.page ?? 1);
    const limit = Math.max(1, Math.min(100, pagination?.limit ?? 20));
    const offset = (page - 1) * limit;

    const dataParams = [...params, limit, offset];
    const dataResult = await executor.query<IInventoryLogDbRow>(
      `SELECT id, product_id, sku, action, quantity_change, previous_stock, new_stock, reason, order_id, performed_by, created_at
       FROM inventory_logs
       ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${paramIndex++} OFFSET $${paramIndex++};`,
      dataParams
    );

    return {
      items: dataResult.rows.map(mapRowToInventoryLog),
      total,
    };
  }

  /**
   * Retrieves inventory history for a specific product.
   */
  public async findByProductId(
    productId: string,
    options?: { page?: number; limit?: number },
    client?: IDbClient
  ): Promise<{ items: IInventoryLogRecord[]; total: number }> {
    if (!isValidEntityId(productId)) {
      throw new AppError("Invalid product id", 400);
    }
    return this.findLogs({ productId }, options, client);
  }

  /**
   * Finds expired reservations older than cutoffDate.
   */
  public async findExpiredReservations(
    cutoffDate: Date,
    client?: IDbClient
  ): Promise<IInventoryLogRecord[]> {
    const executor = this.getExecutor(client);
    const result = await executor.query<IInventoryLogDbRow>(
      `SELECT id, product_id, sku, action, quantity_change, previous_stock, new_stock, reason, order_id, performed_by, created_at
       FROM inventory_logs
       WHERE action = 'reserve' AND created_at < $1
       ORDER BY created_at ASC;`,
      [cutoffDate]
    );
    return result.rows.map(mapRowToInventoryLog);
  }

  /**
   * Atomically adjusts product stock inside a transaction client.
   * Conditional update prevents negative stock.
   */
  public async adjustStockAtomic(
    params: {
      productId: string;
      quantityChange: number;
    },
    client: IDbClient
  ): Promise<{ productId: string; sku: string; previousStock: number; newStock: number }> {
    if (!isValidEntityId(params.productId)) {
      throw new AppError("Invalid product id", 400);
    }
    if (!Number.isFinite(params.quantityChange) || !Number.isInteger(params.quantityChange)) {
      throw new AppError("Invalid quantity change", 400);
    }

    const { productId, quantityChange } = params;

    if (quantityChange < 0) {
      const requiredQty = Math.abs(quantityChange);
      const updateResult = await client.query<{ id: string; sku: string; stock: number }>(
        `UPDATE products
         SET stock = stock - $1, updated_at = NOW()
         WHERE id = $2 AND stock >= $1
         RETURNING id, sku, stock;`,
        [requiredQty, productId]
      );

      if (updateResult.rowCount === 0 || !updateResult.rows[0]) {
        const checkResult = await client.query<{ id: string; stock: number; sku: string }>(
          `SELECT id, stock, sku FROM products WHERE id = $1;`,
          [productId]
        );

        if (checkResult.rowCount === 0 || !checkResult.rows[0]) {
          throw new AppError("Product not found", 404);
        }

        throw new AppError("Insufficient stock", 400);
      }

      const row = updateResult.rows[0];
      const newStock = Number(row.stock);
      const previousStock = newStock - quantityChange;
      return { productId: row.id, sku: row.sku, previousStock, newStock };
    }

    if (quantityChange > 0) {
      const updateResult = await client.query<{ id: string; sku: string; stock: number }>(
        `UPDATE products
         SET stock = stock + $1, updated_at = NOW()
         WHERE id = $2
         RETURNING id, sku, stock;`,
        [quantityChange, productId]
      );

      if (updateResult.rowCount === 0 || !updateResult.rows[0]) {
        throw new AppError("Product not found", 404);
      }

      const row = updateResult.rows[0];
      const newStock = Number(row.stock);
      const previousStock = newStock - quantityChange;
      return { productId: row.id, sku: row.sku, previousStock, newStock };
    }

    // quantityChange === 0
    const checkResult = await client.query<{ id: string; stock: number; sku: string }>(
      `SELECT id, stock, sku FROM products WHERE id = $1;`,
      [productId]
    );

    if (checkResult.rowCount === 0 || !checkResult.rows[0]) {
      throw new AppError("Product not found", 404);
    }

    const currentStock = Number(checkResult.rows[0].stock);
    return {
      productId: checkResult.rows[0].id,
      sku: checkResult.rows[0].sku,
      previousStock: currentStock,
      newStock: currentStock,
    };
  }

  /**
   * Retrieves summary inventory metrics across catalog or for a single product.
   */
  public async getSummary(
    productId?: string,
    client?: IDbClient
  ): Promise<IInventorySummaryRecord> {
    const executor = this.getExecutor(client);

    if (productId) {
      if (!isValidEntityId(productId)) {
        throw new AppError("Invalid product id", 400);
      }

      const result = await executor.query<{
        total_products: number | string;
        total_stock_quantity: number | string;
        out_of_stock_count: number | string;
        low_stock_count: number | string;
        recent_movements_count: number | string;
      }>(
        `SELECT
           1 AS total_products,
           p.stock AS total_stock_quantity,
           CASE WHEN p.stock = 0 THEN 1 ELSE 0 END AS out_of_stock_count,
           CASE WHEN p.stock <= p.low_stock_threshold THEN 1 ELSE 0 END AS low_stock_count,
           (SELECT COUNT(*)::int FROM inventory_logs WHERE product_id = $1) AS recent_movements_count
         FROM products p
         WHERE p.id = $1;`,
        [productId]
      );

      if (result.rowCount === 0 || !result.rows[0]) {
        throw new AppError("Product not found", 404);
      }

      const row = result.rows[0];
      return {
        totalProducts: Number(row.total_products),
        totalStockQuantity: Number(row.total_stock_quantity),
        outOfStockCount: Number(row.out_of_stock_count),
        lowStockCount: Number(row.low_stock_count),
        recentMovementsCount: Number(row.recent_movements_count),
      };
    }

    const result = await executor.query<{
      total_products: number | string;
      total_stock_quantity: number | string;
      out_of_stock_count: number | string;
      low_stock_count: number | string;
      recent_movements_count: number | string;
    }>(
      `SELECT
         COUNT(*)::int AS total_products,
         COALESCE(SUM(stock), 0)::int AS total_stock_quantity,
         COUNT(*) FILTER (WHERE stock = 0)::int AS out_of_stock_count,
         COUNT(*) FILTER (WHERE stock <= low_stock_threshold)::int AS low_stock_count,
         (SELECT COUNT(*)::int FROM inventory_logs WHERE created_at >= NOW() - INTERVAL '30 days') AS recent_movements_count
       FROM products
       WHERE is_active = true;`
    );

    const row = result.rows[0];
    return {
      totalProducts: Number(row?.total_products ?? 0),
      totalStockQuantity: Number(row?.total_stock_quantity ?? 0),
      outOfStockCount: Number(row?.out_of_stock_count ?? 0),
      lowStockCount: Number(row?.low_stock_count ?? 0),
      recentMovementsCount: Number(row?.recent_movements_count ?? 0),
    };
  }
}
