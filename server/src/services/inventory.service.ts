/**
 * ============================================================================
 * Inventory Service (Phase 3C-4: PostgreSQL Migration)
 * ============================================================================
 *
 * Implements transaction-safe inventory and stock management backed by Supabase
 * PostgreSQL.
 *
 * Guarantees:
 * 1. Atomic conditional stock adjustments with strict protection against negative stock.
 * 2. Multi-item ACID transaction atomicity (order deductions/reservations roll back on error).
 * 3. Complete audit trail in `inventory_logs` written in the same transaction as stock updates.
 * 4. Dual ID compatibility (`id` and `_id`) for 24-character ObjectIds and 36-character UUIDs.
 * 5. Full backward compatibility with existing callers (`order.service.ts`, `payment.service.ts`, etc.).
 */

import { PostgresDatabase, withTransaction } from "../db/postgres.js";
import { PostgresInventoryRepository } from "../repositories/postgres-inventory.repository.js";
import {
  PostgresProductRepository,
  ProductRecord,
} from "../repositories/postgres-product.repository.js";
import {
  IDbClient,
  IDbPool,
  IInventoryLogRecord,
  IInventoryLogFilterOptions,
  IInventorySummaryRecord,
} from "../types/database.types.js";
import { isValidEntityId } from "../utils/helpers.js";
import { AppError } from "../middleware/errorHandler.js";
import type { InventoryAction } from "../types/index.js";

// Re-export type definitions for consumers
export type { IInventoryLogRecord, IInventorySummaryRecord };

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

export interface AdjustStockParams {
  productId: string;
  quantityChange: number;
  action: InventoryAction;
  reason?: string;
  orderId?: string;
  performedBy?: string;
}

// ---------------------------------------------------------------------------
// Singletons & Dependency Injection
// ---------------------------------------------------------------------------

let activeInventoryRepo: PostgresInventoryRepository | null = null;
let activeProductRepo: PostgresProductRepository | null = null;
let activePool: IDbPool | null = null;

function getInventoryRepo(): PostgresInventoryRepository {
  if (!activeInventoryRepo) {
    activeInventoryRepo = new PostgresInventoryRepository(getInventoryPool());
  }
  return activeInventoryRepo;
}

function getProductRepo(): PostgresProductRepository {
  if (!activeProductRepo) {
    activeProductRepo = new PostgresProductRepository(getInventoryPool());
  }
  return activeProductRepo;
}

function getInventoryPool(): IDbPool {
  if (!activePool) {
    activePool = PostgresDatabase.getPool();
  }
  return activePool;
}

export function setInventoryRepository(repo: PostgresInventoryRepository): void {
  activeInventoryRepo = repo;
}

export function setInventoryProductRepository(repo: PostgresProductRepository): void {
  activeProductRepo = repo;
}

export function setInventoryDatabasePool(pool: IDbPool): void {
  activePool = pool;
  activeInventoryRepo = new PostgresInventoryRepository(pool);
  activeProductRepo = new PostgresProductRepository(pool);
}

// Helper to determine if an object is a transaction client or a pool
function isDbClient(target: any): target is IDbClient {
  return target && typeof target.query === "function" && typeof target.connect !== "function";
}

// ---------------------------------------------------------------------------
// Core Stock Adjustments
// ---------------------------------------------------------------------------

/**
 * Atomically adjusts stock for a product and creates an inventory audit log
 * within the same PostgreSQL transaction.
 *
 * Overloaded to support both calling conventions:
 * 1. adjustStock(params, clientOrPool?)
 * 2. adjustStock(productId, params, clientOrPool?)
 */
export async function adjustStock(
  paramsOrId: AdjustStockParams | string,
  paramsSecond?: {
    quantityChange: number;
    action: InventoryAction;
    reason?: string;
    orderId?: string;
    performedBy?: string;
  },
  clientOrPool?: IDbClient | IDbPool
): Promise<{ productId: string; previousStock: number; newStock: number }> {
  let productId: string;
  let params: {
    quantityChange: number;
    action: InventoryAction;
    reason?: string;
    orderId?: string;
    performedBy?: string;
  };

  if (typeof paramsOrId === "string") {
    productId = paramsOrId;
    if (!paramsSecond) {
      throw new AppError("Stock adjustment parameters are required", 400);
    }
    params = paramsSecond;
  } else {
    productId = paramsOrId.productId;
    params = paramsOrId;
  }

  if (!isValidEntityId(productId)) {
    throw new AppError("Invalid product id", 400);
  }

  if (!Number.isFinite(params.quantityChange) || !Number.isInteger(params.quantityChange)) {
    throw new AppError("Invalid quantity change", 400);
  }

  const executeAdjustment = async (client: IDbClient) => {
    // 1. Atomic conditional stock change on products table
    const stockResult = await getInventoryRepo().adjustStockAtomic(
      {
        productId,
        quantityChange: params.quantityChange,
      },
      client
    );

    // 2. Insert audit log into inventory_logs table in the same transaction
    await getInventoryRepo().createLog(
      {
        productId: stockResult.productId,
        sku: stockResult.sku,
        action: params.action,
        quantityChange: params.quantityChange,
        previousStock: stockResult.previousStock,
        newStock: stockResult.newStock,
        reason: params.reason,
        orderId: params.orderId,
        performedBy: params.performedBy,
      },
      client
    );

    return {
      productId: stockResult.productId,
      previousStock: stockResult.previousStock,
      newStock: stockResult.newStock,
    };
  };

  if (isDbClient(clientOrPool)) {
    return executeAdjustment(clientOrPool);
  }

  const pool = clientOrPool ? (clientOrPool as IDbPool) : getInventoryPool();
  return withTransaction(pool, executeAdjustment);
}

/**
 * Deducts stock for multiple items in an order within a single transaction.
 * If any item lacks sufficient stock or does not exist, the entire transaction rolls back.
 */
export async function deductStockForOrder(
  items: { productId: string; quantity: number }[],
  orderId: string,
  performedBy?: string,
  clientOrPool?: IDbClient | IDbPool
): Promise<void> {
  const executeDeductions = async (client: IDbClient) => {
    for (const item of items) {
      if (item.quantity <= 0) continue;
      await adjustStock(
        {
          productId: item.productId,
          quantityChange: -item.quantity,
          action: "deduct",
          reason: "Order placement",
          orderId,
          performedBy,
        },
        undefined,
        client
      );
    }
  };

  if (isDbClient(clientOrPool)) {
    return executeDeductions(clientOrPool);
  }

  const pool = clientOrPool ? (clientOrPool as IDbPool) : getInventoryPool();
  return withTransaction(pool, executeDeductions);
}

const RESERVATION_TIMEOUT_MINUTES = 30;

/**
 * Reserves stock for an order when payment is initiated.
 * If any item is out of stock, all items roll back atomically.
 */
export async function reserveStockForOrder(
  items: { productId: string; quantity: number }[],
  orderId: string,
  performedBy?: string,
  clientOrPool?: IDbClient | IDbPool
): Promise<void> {
  const executeReservations = async (client: IDbClient) => {
    for (const item of items) {
      if (item.quantity <= 0) continue;
      await adjustStock(
        {
          productId: item.productId,
          quantityChange: -item.quantity,
          action: "reserve",
          reason: "Payment initiated - stock reserved",
          orderId,
          performedBy,
        },
        undefined,
        client
      );
    }
  };

  if (isDbClient(clientOrPool)) {
    return executeReservations(clientOrPool);
  }

  const pool = clientOrPool ? (clientOrPool as IDbPool) : getInventoryPool();
  return withTransaction(pool, executeReservations);
}

/**
 * Releases reserved stock back to product inventory when payment fails or is cancelled.
 */
export async function releaseReservedStock(
  items: { productId: string; quantity: number }[],
  orderId: string,
  performedBy?: string,
  clientOrPool?: IDbClient | IDbPool
): Promise<void> {
  const executeRelease = async (client: IDbClient) => {
    for (const item of items) {
      if (item.quantity <= 0) continue;
      await adjustStock(
        {
          productId: item.productId,
          quantityChange: item.quantity,
          action: "release",
          reason: "Payment failed - reservation released",
          orderId,
          performedBy,
        },
        undefined,
        client
      );
    }
  };

  if (isDbClient(clientOrPool)) {
    return executeRelease(clientOrPool);
  }

  const pool = clientOrPool ? (clientOrPool as IDbPool) : getInventoryPool();
  return withTransaction(pool, executeRelease);
}

/**
 * Confirms a reserved stock allocation upon successful payment confirmation.
 */
export async function confirmReservedStock(
  items: { productId: string; quantity: number }[],
  orderId: string,
  performedBy?: string,
  clientOrPool?: IDbClient | IDbPool
): Promise<void> {
  const executeConfirm = async (client: IDbClient) => {
    for (const item of items) {
      await adjustStock(
        {
          productId: item.productId,
          quantityChange: 0,
          action: "adjust",
          reason: "Payment confirmed - reservation converted to sale",
          orderId,
          performedBy,
        },
        undefined,
        client
      );
    }
  };

  if (isDbClient(clientOrPool)) {
    return executeConfirm(clientOrPool);
  }

  const pool = clientOrPool ? (clientOrPool as IDbPool) : getInventoryPool();
  return withTransaction(pool, executeConfirm);
}

/**
 * Cleans up expired reservations older than 30 minutes.
 * Releases held stock and updates pending orders to failed.
 */
export async function cleanupExpiredReservations(
  clientOrPool?: IDbClient | IDbPool
): Promise<void> {
  const executeCleanup = async (client: IDbClient) => {
    const cutoffTime = new Date(Date.now() - RESERVATION_TIMEOUT_MINUTES * 60 * 1000);
    const expiredLogs = await getInventoryRepo().findExpiredReservations(cutoffTime, client);

    for (const log of expiredLogs) {
      // Check if order exists and is pending in PostgreSQL
      if (log.orderId) {
        const orderRes = await client.query<{ id: string; payment_status: string; notes: string | null }>(
          "SELECT id, payment_status, notes FROM orders WHERE id = $1 LIMIT 1;",
          [log.orderId]
        );

        if (orderRes.rowCount && orderRes.rowCount > 0) {
          const order = orderRes.rows[0];
          if (order.payment_status === "pending") {
            // Release the reservation
            await adjustStock(
              {
                productId: log.productId,
                quantityChange: Math.abs(log.quantityChange),
                action: "release",
                reason: "Reservation expired",
                orderId: order.id,
              },
              undefined,
              client
            );

            // Update order status
            const updatedNotes = `${order.notes ?? ""}\nStock reservation expired`.trim();
            await client.query(
              "UPDATE orders SET payment_status = 'failed', notes = $1, updated_at = NOW() WHERE id = $2;",
              [updatedNotes, order.id]
            );
          }
        } else {
          // No order found in Postgres, release the stock allocation
          await adjustStock(
            {
              productId: log.productId,
              quantityChange: Math.abs(log.quantityChange),
              action: "release",
              reason: "Reservation expired (unmatched order)",
              orderId: log.orderId,
            },
            undefined,
            client
          );
        }
      }
    }
  };

  if (isDbClient(clientOrPool)) {
    return executeCleanup(clientOrPool);
  }

  const pool = clientOrPool ? (clientOrPool as IDbPool) : getInventoryPool();
  return withTransaction(pool, executeCleanup);
}

// ---------------------------------------------------------------------------
// Inventory Reporting & Queries
// ---------------------------------------------------------------------------

/**
 * Retrieves paginated inventory logs matching filter criteria.
 */
export async function getInventoryLogs(
  filters?: IInventoryLogFilterOptions,
  pagination?: { page?: number; limit?: number },
  clientOrPool?: IDbClient | IDbPool
): Promise<{ items: IInventoryLogRecord[]; meta: PaginationMeta }> {
  const client = isDbClient(clientOrPool) ? clientOrPool : undefined;
  const page = Math.max(1, pagination?.page ?? 1);
  const limit = Math.max(1, Math.min(100, pagination?.limit ?? 20));

  const { items, total } = await getInventoryRepo().findLogs(filters, { page, limit }, client);
  const totalPages = Math.ceil(total / limit) || 1;

  return {
    items,
    meta: {
      page,
      limit,
      total,
      totalPages,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
    },
  };
}

/**
 * Retrieves audit history for a single product.
 */
export async function getInventoryHistory(
  productId: string,
  options?: { page?: number; limit?: number },
  clientOrPool?: IDbClient | IDbPool
): Promise<{ items: IInventoryLogRecord[]; meta: PaginationMeta }> {
  if (!isValidEntityId(productId)) {
    throw new AppError("Invalid product id", 400);
  }

  return getInventoryLogs({ productId }, options, clientOrPool);
}

/**
 * Retrieves overall catalog inventory metrics or single-product inventory summary.
 */
export async function getInventorySummary(
  productId?: string,
  clientOrPool?: IDbClient | IDbPool
): Promise<IInventorySummaryRecord> {
  const client = isDbClient(clientOrPool) ? clientOrPool : undefined;
  return getInventoryRepo().getSummary(productId, client);
}

/**
 * Retrieves products at or below their low-stock threshold.
 */
export async function getLowStockProducts(
  threshold?: number,
  clientOrPool?: IDbClient | IDbPool
): Promise<ProductRecord[]> {
  const client = isDbClient(clientOrPool) ? clientOrPool : undefined;
  return getProductRepo().findLowStock(threshold, client);
}

/**
 * Convenience method to increment product stock.
 */
export async function addStock(
  productId: string,
  quantity: number,
  reason = "Stock addition",
  performedBy?: string,
  clientOrPool?: IDbClient | IDbPool
): Promise<{ productId: string; previousStock: number; newStock: number }> {
  if (quantity <= 0) {
    throw new AppError("Quantity to add must be greater than zero", 400);
  }
  return adjustStock(
    {
      productId,
      quantityChange: quantity,
      action: "add",
      reason,
      performedBy,
    },
    undefined,
    clientOrPool
  );
}

/**
 * Convenience method to deduct product stock.
 */
export async function deductStock(
  productId: string,
  quantity: number,
  reason = "Manual deduction",
  orderId?: string,
  performedBy?: string,
  clientOrPool?: IDbClient | IDbPool
): Promise<{ productId: string; previousStock: number; newStock: number }> {
  if (quantity <= 0) {
    throw new AppError("Quantity to deduct must be greater than zero", 400);
  }
  return adjustStock(
    {
      productId,
      quantityChange: -quantity,
      action: "deduct",
      reason,
      orderId,
      performedBy,
    },
    undefined,
    clientOrPool
  );
}
