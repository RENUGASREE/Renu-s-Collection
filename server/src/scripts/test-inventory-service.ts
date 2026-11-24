/**
 * ============================================================================
 * Phase 3C-4: PostgreSQL Inventory Service Test Suite
 * ============================================================================
 *
 * Verifies that the migrated Inventory Service operates exclusively on Supabase
 * PostgreSQL with full ACID transaction safety, conditional stock decrement,
 * complete audit logging in `inventory_logs`, and 100% backward compatibility.
 *
 * Test Coverage:
 *  1.  adjustStock positive delta increments stock and creates inventory log.
 *  2.  adjustStock negative delta decrements stock conditionally and creates inventory log.
 *  3.  adjustStock negative delta throws AppError 400 on insufficient stock.
 *  4.  adjustStock missing product throws AppError 404.
 *  5.  adjustStock zero delta returns current stock without updating.
 *  6.  adjustStock invalid product ID throws AppError 400.
 *  7.  adjustStock invalid quantity change throws AppError 400.
 *  8.  adjustStock supports both parameter signatures (params object and productId, params).
 *  9.  adjustStock normalizes 'confirm' action to 'adjust' for PostgreSQL schema CHECK constraint.
 *  10. adjustStock rolls back entire transaction if inventory log insertion fails.
 *  11. adjustStock validates and sets foreign keys safely for orderId and performedBy.
 *  12. deductStockForOrder deducts multiple items atomically in a single transaction.
 *  13. deductStockForOrder rolls back all items when any single item fails (insufficient stock).
 *  14. deductStockForOrder skips items with quantity <= 0.
 *  15. reserveStockForOrder reserves stock across items with 'reserve' action in a transaction.
 *  16. reserveStockForOrder rolls back all reserved items if any item fails.
 *  17. releaseReservedStock restores product stock with 'release' action in a transaction.
 *  18. confirmReservedStock converts reservation to sale with 'adjust' action and zero delta.
 *  19. cleanupExpiredReservations finds expired reservations and releases held stock.
 *  20. cleanupExpiredReservations marks pending order as failed with expiration note.
 *  21. getInventoryLogs filters by productId, sku, action, orderId, performedBy, and dates.
 *  22. getInventoryLogs returns paginated response with correct meta object.
 *  23. getInventoryHistory retrieves product-specific history and rejects invalid ID format.
 *  24. getInventorySummary returns catalog-wide metrics (totalProducts, totalStock, outOfStock, lowStock, movements).
 *  25. getInventorySummary returns single-product summary when productId is provided.
 *  26. getLowStockProducts queries products at or below low stock threshold.
 *  27. addStock convenience method increments stock and validates positive quantity.
 *  28. deductStock convenience method decrements stock and validates positive quantity.
 *  29. API compatibility — returned entities provide both id and _id, and typed properties.
 *  30. Transaction client reuse — supplied client is used directly without opening new transaction.
 *
 * Run:
 *   node --env-file=server/.env server/node_modules/tsx/dist/cli.mjs \
 *     server/src/scripts/test-inventory-service.ts
 */

import {
  adjustStock,
  deductStockForOrder,
  reserveStockForOrder,
  releaseReservedStock,
  confirmReservedStock,
  cleanupExpiredReservations,
  getInventoryLogs,
  getInventoryHistory,
  getInventorySummary,
  getLowStockProducts,
  addStock,
  deductStock,
  setInventoryRepository,
  setInventoryDatabasePool,
  setInventoryProductRepository,
  IInventoryLogRecord,
} from "../services/inventory.service.js";
import {
  PostgresInventoryRepository,
  mapRowToInventoryLog,
} from "../repositories/postgres-inventory.repository.js";
import {
  PostgresProductRepository,
  ProductRecord,
} from "../repositories/postgres-product.repository.js";
import { AppError } from "../middleware/errorHandler.js";
import { IDbPool, IDbPoolClient, IQueryResult, IDbClient } from "../types/database.types.js";

// ---------------------------------------------------------------------------
// Test runner helpers
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => Promise<void> | void): Promise<void> {
  try {
    await fn();
    console.log(`  ✓  ${name}`);
    passed++;
  } catch (err: any) {
    console.error(`  ✗  ${name}`);
    console.error(`       ${err?.message ?? err}`);
    failed++;
  }
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

// ---------------------------------------------------------------------------
// Test fixtures & mock factories
// ---------------------------------------------------------------------------

const sampleProductId = "6ae44c64900e0da3e5b0adf9";
const sampleSku = "REN-KUN-CHK-001";
const sampleOrderId = "6ae44c64900e0da3e5b0adfc";
const sampleUserId = "6ae44c64900e0da3e5b0adfd";

const sampleLogDbRow = {
  id: "550e8400-e29b-41d4-a716-446655440000",
  product_id: sampleProductId,
  sku: sampleSku,
  action: "adjust",
  quantity_change: 5,
  previous_stock: 10,
  new_stock: 15,
  reason: "Restock",
  order_id: null,
  performed_by: sampleUserId,
  created_at: new Date("2026-11-20T10:00:00Z"),
};

function createMockDbPool(
  queryHandler?: (sql: string, params?: any[]) => Promise<IQueryResult<any>> | IQueryResult<any>
): {
  pool: IDbPool;
  queries: Array<{ sql: string; params?: any[] }>;
  released: boolean[];
} {
  const queries: Array<{ sql: string; params?: any[] }> = [];
  const released: boolean[] = [];

  const client: IDbPoolClient = {
    async query<T = any>(sql: string, params?: any[]): Promise<IQueryResult<T>> {
      queries.push({ sql: sql.trim(), params });
      if (queryHandler) {
        return queryHandler(sql, params);
      }
      return { rows: [], rowCount: 0 };
    },
    release: () => {
      released.push(true);
    },
  };

  const pool: IDbPool = {
    connect: async () => client,
    query: async (sql, params) => client.query(sql, params),
    end: async () => {},
  };

  return { pool, queries, released };
}

// ---------------------------------------------------------------------------
// Test Suite Execution
// ---------------------------------------------------------------------------

async function run(): Promise<void> {
  console.log("\n━━━  Phase 3C-4: PostgreSQL Inventory Service Tests  ━━━\n");

  // 1. adjustStock — positive delta increments stock
  await test("adjustStock positive delta increments stock and creates inventory log", async () => {
    let stock = 10;
    const { pool, queries } = createMockDbPool((sql, params) => {
      if (sql.includes("UPDATE products") && sql.includes("stock + $1")) {
        const delta = params![0];
        stock += delta;
        return { rows: [{ id: sampleProductId, sku: sampleSku, stock }], rowCount: 1 };
      }
      if (sql.includes("INSERT INTO inventory_logs")) {
        return { rows: [{ ...sampleLogDbRow, quantity_change: 5, previous_stock: 10, new_stock: 15 }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });

    const repo = new PostgresInventoryRepository(pool);
    setInventoryRepository(repo);
    setInventoryDatabasePool(pool);

    const result = await adjustStock({
      productId: sampleProductId,
      quantityChange: 5,
      action: "add",
      reason: "Manual restock",
    });

    assertEqual(result.productId, sampleProductId, "productId");
    assertEqual(result.previousStock, 10, "previousStock");
    assertEqual(result.newStock, 15, "newStock");

    const hasUpdate = queries.some((q) => q.sql.includes("UPDATE products") && q.sql.includes("stock + $1"));
    const hasLog = queries.some((q) => q.sql.includes("INSERT INTO inventory_logs"));
    assert(hasUpdate, "executed UPDATE products");
    assert(hasLog, "executed INSERT INTO inventory_logs");
  });

  // 2. adjustStock — negative delta decrements stock conditionally
  await test("adjustStock negative delta decrements stock conditionally and creates inventory log", async () => {
    let stock = 20;
    const { pool } = createMockDbPool((sql, params) => {
      if (sql.includes("UPDATE products") && sql.includes("stock >= $1")) {
        const delta = params![0];
        stock -= delta;
        return { rows: [{ id: sampleProductId, sku: sampleSku, stock }], rowCount: 1 };
      }
      if (sql.includes("INSERT INTO inventory_logs")) {
        return { rows: [{ ...sampleLogDbRow, quantity_change: -8, previous_stock: 20, new_stock: 12 }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });

    setInventoryRepository(new PostgresInventoryRepository(pool));
    setInventoryDatabasePool(pool);

    const result = await adjustStock({
      productId: sampleProductId,
      quantityChange: -8,
      action: "deduct",
      reason: "Customer sale",
    });

    assertEqual(result.previousStock, 20, "previousStock");
    assertEqual(result.newStock, 12, "newStock");
  });

  // 3. adjustStock — insufficient stock throws 400
  await test("adjustStock negative delta throws AppError 400 on insufficient stock", async () => {
    const { pool } = createMockDbPool((sql) => {
      if (sql.includes("UPDATE products") && sql.includes("stock >= $1")) {
        return { rows: [], rowCount: 0 };
      }
      if (sql.includes("SELECT id, stock, sku FROM products")) {
        return { rows: [{ id: sampleProductId, stock: 3, sku: sampleSku }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });

    setInventoryRepository(new PostgresInventoryRepository(pool));
    setInventoryDatabasePool(pool);

    let error: any = null;
    try {
      await adjustStock({
        productId: sampleProductId,
        quantityChange: -10,
        action: "deduct",
      });
    } catch (e) {
      error = e;
    }

    assert(error instanceof AppError, "is AppError");
    assertEqual(error.statusCode, 400, "status 400");
    assertEqual(error.message, "Insufficient stock", "error message");
  });

  // 4. adjustStock — missing product throws 404
  await test("adjustStock missing product throws AppError 404", async () => {
    const { pool } = createMockDbPool((sql) => {
      if (sql.includes("UPDATE products")) return { rows: [], rowCount: 0 };
      if (sql.includes("SELECT id, stock, sku FROM products")) return { rows: [], rowCount: 0 };
      return { rows: [], rowCount: 0 };
    });

    setInventoryRepository(new PostgresInventoryRepository(pool));
    setInventoryDatabasePool(pool);

    let error: any = null;
    try {
      await adjustStock({
        productId: sampleProductId,
        quantityChange: -5,
        action: "deduct",
      });
    } catch (e) {
      error = e;
    }

    assert(error instanceof AppError, "is AppError");
    assertEqual(error.statusCode, 404, "status 404");
  });

  // 5. adjustStock — zero delta returns current stock
  await test("adjustStock zero delta returns current stock without updating", async () => {
    const { pool, queries } = createMockDbPool((sql) => {
      if (sql.includes("SELECT id, stock, sku FROM products")) {
        return { rows: [{ id: sampleProductId, stock: 15, sku: sampleSku }], rowCount: 1 };
      }
      if (sql.includes("INSERT INTO inventory_logs")) {
        return { rows: [{ ...sampleLogDbRow, quantity_change: 0, previous_stock: 15, new_stock: 15 }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });

    setInventoryRepository(new PostgresInventoryRepository(pool));
    setInventoryDatabasePool(pool);

    const result = await adjustStock({
      productId: sampleProductId,
      quantityChange: 0,
      action: "adjust",
    });

    assertEqual(result.previousStock, 15, "previousStock");
    assertEqual(result.newStock, 15, "newStock");
    const hasUpdate = queries.some((q) => q.sql.includes("UPDATE products"));
    assert(!hasUpdate, "no UPDATE products executed on zero delta");
  });

  // 6. adjustStock — invalid product ID format throws 400
  await test("adjustStock invalid product ID throws AppError 400", async () => {
    const { pool } = createMockDbPool();
    setInventoryRepository(new PostgresInventoryRepository(pool));
    setInventoryDatabasePool(pool);

    let error: any = null;
    try {
      await adjustStock({
        productId: "invalid-id",
        quantityChange: 5,
        action: "add",
      });
    } catch (e) {
      error = e;
    }

    assert(error instanceof AppError, "is AppError");
    assertEqual(error.statusCode, 400, "status 400");
  });

  // 7. adjustStock — invalid quantity change throws 400
  await test("adjustStock invalid quantity change throws AppError 400", async () => {
    const { pool } = createMockDbPool();
    setInventoryRepository(new PostgresInventoryRepository(pool));
    setInventoryDatabasePool(pool);

    let errFloat: any = null;
    try {
      await adjustStock({
        productId: sampleProductId,
        quantityChange: 3.5,
        action: "add",
      });
    } catch (e) {
      errFloat = e;
    }
    assert(errFloat instanceof AppError && errFloat.statusCode === 400, "rejects float quantity");

    let errNaN: any = null;
    try {
      await adjustStock({
        productId: sampleProductId,
        quantityChange: NaN,
        action: "add",
      });
    } catch (e) {
      errNaN = e;
    }
    assert(errNaN instanceof AppError && errNaN.statusCode === 400, "rejects NaN quantity");
  });

  // 8. adjustStock — supports both parameter signatures
  await test("adjustStock supports both parameter signatures (params object and productId, params)", async () => {
    const { pool } = createMockDbPool((sql) => {
      if (sql.includes("UPDATE products")) {
        return { rows: [{ id: sampleProductId, sku: sampleSku, stock: 25 }], rowCount: 1 };
      }
      if (sql.includes("INSERT INTO inventory_logs")) {
        return { rows: [{ ...sampleLogDbRow, quantity_change: 5, previous_stock: 20, new_stock: 25 }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });

    setInventoryRepository(new PostgresInventoryRepository(pool));
    setInventoryDatabasePool(pool);

    // Style 1: adjustStock(params)
    const res1 = await adjustStock({
      productId: sampleProductId,
      quantityChange: 5,
      action: "add",
    });
    assertEqual(res1.newStock, 25, "style 1 newStock");

    // Style 2: adjustStock(productId, params)
    const res2 = await adjustStock(sampleProductId, {
      quantityChange: 5,
      action: "add",
    });
    assertEqual(res2.newStock, 25, "style 2 newStock");
  });

  // 9. adjustStock — normalizes 'confirm' action to 'adjust'
  await test("adjustStock normalizes 'confirm' action to 'adjust' for PostgreSQL schema CHECK constraint", async () => {
    let capturedAction: string | undefined;
    const { pool } = createMockDbPool((sql, params) => {
      if (sql.includes("SELECT id, stock, sku FROM products")) {
        return { rows: [{ id: sampleProductId, stock: 10, sku: sampleSku }], rowCount: 1 };
      }
      if (sql.includes("INSERT INTO inventory_logs")) {
        capturedAction = params![3]; // action is 4th param
        return { rows: [{ ...sampleLogDbRow, action: "adjust" }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });

    setInventoryRepository(new PostgresInventoryRepository(pool));
    setInventoryDatabasePool(pool);

    await adjustStock({
      productId: sampleProductId,
      quantityChange: 0,
      action: "confirm" as any,
    });

    assertEqual(capturedAction, "adjust", "action normalized to adjust in SQL");
  });

  // 10. adjustStock — transaction rollback on log insertion failure
  await test("adjustStock rolls back entire transaction if inventory log insertion fails", async () => {
    const { pool, queries, released } = createMockDbPool((sql) => {
      if (sql.includes("UPDATE products")) {
        return { rows: [{ id: sampleProductId, sku: sampleSku, stock: 25 }], rowCount: 1 };
      }
      if (sql.includes("INSERT INTO inventory_logs")) {
        throw new Error("Simulated log failure");
      }
      return { rows: [], rowCount: 0 };
    });

    setInventoryRepository(new PostgresInventoryRepository(pool));
    setInventoryDatabasePool(pool);

    let error: any = null;
    try {
      await adjustStock({
        productId: sampleProductId,
        quantityChange: 5,
        action: "add",
      });
    } catch (e) {
      error = e;
    }

    assert(error !== null && error.message.includes("Simulated log failure"), "error propagated");
    const hasRollback = queries.some((q) => q.sql === "ROLLBACK");
    assert(hasRollback, "ROLLBACK executed on log failure");
    assert(released[0] === true, "client released back to pool");
  });

  // 11. adjustStock — foreign key validation for orderId and performedBy
  await test("adjustStock validates and sets foreign keys safely for orderId and performedBy", async () => {
    let capturedOrderId: string | null = "initial";
    let capturedUserId: string | null = "initial";

    const { pool } = createMockDbPool((sql, params) => {
      if (sql.includes("SELECT id FROM orders WHERE id = $1")) {
        return { rows: [{ id: sampleOrderId }], rowCount: 1 };
      }
      if (sql.includes("SELECT id FROM users WHERE id = $1")) {
        return { rows: [], rowCount: 0 }; // user doesn't exist
      }
      if (sql.includes("UPDATE products")) {
        return { rows: [{ id: sampleProductId, sku: sampleSku, stock: 25 }], rowCount: 1 };
      }
      if (sql.includes("INSERT INTO inventory_logs")) {
        capturedOrderId = params![8]; // order_id ($9)
        capturedUserId = params![9]; // performed_by ($10)
        return { rows: [{ ...sampleLogDbRow }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });

    setInventoryRepository(new PostgresInventoryRepository(pool));
    setInventoryDatabasePool(pool);

    await adjustStock({
      productId: sampleProductId,
      quantityChange: 5,
      action: "add",
      orderId: sampleOrderId,
      performedBy: sampleUserId,
    });

    assertEqual(capturedOrderId, sampleOrderId, "valid orderId preserved");
    assertEqual(capturedUserId, null, "missing user sanitized to null to prevent FK 23503 error");
  });

  // 12. deductStockForOrder — deducts multiple items in transaction
  await test("deductStockForOrder deducts multiple items atomically in a single transaction", async () => {
    const items = [
      { productId: "6ae44c64900e0da3e5b0adf9", quantity: 2 },
      { productId: "6ae44c64900e0da3e5b0adfa", quantity: 3 },
    ];

    const { pool, queries } = createMockDbPool((sql, params) => {
      if (sql.includes("UPDATE products") && sql.includes("stock >= $1")) {
        return { rows: [{ id: params![1], sku: "SKU-" + params![1], stock: 10 }], rowCount: 1 };
      }
      if (sql.includes("INSERT INTO inventory_logs")) {
        return { rows: [{ ...sampleLogDbRow }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });

    setInventoryRepository(new PostgresInventoryRepository(pool));
    setInventoryDatabasePool(pool);

    await deductStockForOrder(items, sampleOrderId, sampleUserId);

    const updateQueries = queries.filter((q) => q.sql.includes("UPDATE products"));
    assertEqual(updateQueries.length, 2, "2 update queries executed");
    const hasCommit = queries.some((q) => q.sql === "COMMIT");
    assert(hasCommit, "transaction committed successfully");
  });

  // 13. deductStockForOrder — rolls back all items when any item fails
  await test("deductStockForOrder rolls back all items when any single item fails (insufficient stock)", async () => {
    const items = [
      { productId: "6ae44c64900e0da3e5b0adf9", quantity: 2 },
      { productId: "6ae44c64900e0da3e5b0adfa", quantity: 50 }, // insufficient
    ];

    let callCount = 0;
    const { pool, queries } = createMockDbPool((sql, params) => {
      if (sql.includes("UPDATE products") && sql.includes("stock >= $1")) {
        callCount++;
        if (callCount === 1) {
          return { rows: [{ id: params![1], sku: "SKU-1", stock: 10 }], rowCount: 1 };
        }
        // Second item fails
        return { rows: [], rowCount: 0 };
      }
      if (sql.includes("SELECT id, stock, sku FROM products")) {
        return { rows: [{ id: params![0], stock: 5, sku: "SKU-2" }], rowCount: 1 };
      }
      if (sql.includes("INSERT INTO inventory_logs")) {
        return { rows: [{ ...sampleLogDbRow }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });

    setInventoryRepository(new PostgresInventoryRepository(pool));
    setInventoryDatabasePool(pool);

    let error: any = null;
    try {
      await deductStockForOrder(items, sampleOrderId);
    } catch (e) {
      error = e;
    }

    assert(error instanceof AppError && error.statusCode === 400, "throws 400 on second item");
    const hasRollback = queries.some((q) => q.sql === "ROLLBACK");
    assert(hasRollback, "ROLLBACK executed, reversing first item deduction");
  });

  // 14. deductStockForOrder — skips items with quantity <= 0
  await test("deductStockForOrder skips items with quantity <= 0", async () => {
    const items = [
      { productId: sampleProductId, quantity: 0 },
      { productId: sampleProductId, quantity: -2 },
    ];

    const { pool, queries } = createMockDbPool();
    setInventoryRepository(new PostgresInventoryRepository(pool));
    setInventoryDatabasePool(pool);

    await deductStockForOrder(items, sampleOrderId);

    const updateQueries = queries.filter((q) => q.sql.includes("UPDATE products"));
    assertEqual(updateQueries.length, 0, "no updates executed for 0/negative items");
  });

  // 15. reserveStockForOrder — reserves stock with 'reserve' action in transaction
  await test("reserveStockForOrder reserves stock across items with 'reserve' action in a transaction", async () => {
    const items = [{ productId: sampleProductId, quantity: 2 }];
    let capturedAction: string | undefined;

    const { pool } = createMockDbPool((sql, params) => {
      if (sql.includes("UPDATE products")) {
        return { rows: [{ id: sampleProductId, sku: sampleSku, stock: 8 }], rowCount: 1 };
      }
      if (sql.includes("INSERT INTO inventory_logs")) {
        capturedAction = params![3];
        return { rows: [{ ...sampleLogDbRow, action: "reserve" }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });

    setInventoryRepository(new PostgresInventoryRepository(pool));
    setInventoryDatabasePool(pool);

    await reserveStockForOrder(items, sampleOrderId);
    assertEqual(capturedAction, "reserve", "action is reserve");
  });

  // 16. reserveStockForOrder — rolls back all reserved items if any item fails
  await test("reserveStockForOrder rolls back all reserved items if any item fails", async () => {
    const items = [
      { productId: "6ae44c64900e0da3e5b0adf9", quantity: 1 },
      { productId: "6ae44c64900e0da3e5b0adfa", quantity: 99 },
    ];

    let callCount = 0;
    const { pool, queries } = createMockDbPool((sql, params) => {
      if (sql.includes("UPDATE products")) {
        callCount++;
        if (callCount === 1) return { rows: [{ id: params![1], sku: "SKU-1", stock: 10 }], rowCount: 1 };
        return { rows: [], rowCount: 0 };
      }
      if (sql.includes("SELECT id, stock, sku FROM products")) {
        return { rows: [{ id: params![0], stock: 0, sku: "SKU-2" }], rowCount: 1 };
      }
      if (sql.includes("INSERT INTO inventory_logs")) {
        return { rows: [{ ...sampleLogDbRow }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });

    setInventoryRepository(new PostgresInventoryRepository(pool));
    setInventoryDatabasePool(pool);

    let error: any = null;
    try {
      await reserveStockForOrder(items, sampleOrderId);
    } catch (e) {
      error = e;
    }

    assert(error instanceof AppError && error.statusCode === 400, "throws 400 on reservation failure");
    assert(queries.some((q) => q.sql === "ROLLBACK"), "ROLLBACK triggered");
  });

  // 17. releaseReservedStock — restores stock with 'release' action
  await test("releaseReservedStock restores product stock with 'release' action in a transaction", async () => {
    const items = [{ productId: sampleProductId, quantity: 2 }];
    let capturedAction: string | undefined;

    const { pool } = createMockDbPool((sql, params) => {
      if (sql.includes("UPDATE products") && sql.includes("stock + $1")) {
        return { rows: [{ id: sampleProductId, sku: sampleSku, stock: 12 }], rowCount: 1 };
      }
      if (sql.includes("INSERT INTO inventory_logs")) {
        capturedAction = params![3];
        return { rows: [{ ...sampleLogDbRow, action: "release" }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });

    setInventoryRepository(new PostgresInventoryRepository(pool));
    setInventoryDatabasePool(pool);

    await releaseReservedStock(items, sampleOrderId);
    assertEqual(capturedAction, "release", "action is release");
  });

  // 18. confirmReservedStock — converts reservation to sale with 'adjust' action
  await test("confirmReservedStock converts reservation to sale with 'adjust' action and zero delta", async () => {
    const items = [{ productId: sampleProductId, quantity: 2 }];
    let capturedDelta: number | undefined;

    const { pool } = createMockDbPool((sql, params) => {
      if (sql.includes("SELECT id, stock, sku FROM products")) {
        return { rows: [{ id: sampleProductId, stock: 10, sku: sampleSku }], rowCount: 1 };
      }
      if (sql.includes("INSERT INTO inventory_logs")) {
        capturedDelta = params![4];
        return { rows: [{ ...sampleLogDbRow }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });

    setInventoryRepository(new PostgresInventoryRepository(pool));
    setInventoryDatabasePool(pool);

    await confirmReservedStock(items, sampleOrderId);
    assertEqual(capturedDelta, 0, "quantity change is 0 on confirmation");
  });

  // 19. cleanupExpiredReservations — releases expired reservations
  await test("cleanupExpiredReservations finds expired reservations and releases held stock", async () => {
    let orderUpdated = false;
    let stockReleased = false;

    const { pool } = createMockDbPool((sql) => {
      if (sql.includes("WHERE action = 'reserve' AND created_at < $1")) {
        return {
          rows: [
            {
              id: "log-1",
              product_id: sampleProductId,
              sku: sampleSku,
              action: "reserve",
              quantity_change: -2,
              previous_stock: 10,
              new_stock: 8,
              order_id: sampleOrderId,
              created_at: new Date(Date.now() - 40 * 60 * 1000),
            },
          ],
          rowCount: 1,
        };
      }
      if (sql.includes("SELECT id, payment_status, notes FROM orders WHERE id = $1")) {
        return { rows: [{ id: sampleOrderId, payment_status: "pending", notes: "Order pending" }], rowCount: 1 };
      }
      if (sql.includes("UPDATE products") && sql.includes("stock + $1")) {
        stockReleased = true;
        return { rows: [{ id: sampleProductId, sku: sampleSku, stock: 10 }], rowCount: 1 };
      }
      if (sql.includes("UPDATE orders SET payment_status = 'failed'")) {
        orderUpdated = true;
        return { rows: [], rowCount: 1 };
      }
      if (sql.includes("INSERT INTO inventory_logs")) {
        return { rows: [{ ...sampleLogDbRow }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });

    setInventoryRepository(new PostgresInventoryRepository(pool));
    setInventoryDatabasePool(pool);

    await cleanupExpiredReservations();

    assert(stockReleased, "stock restored on expired reservation");
    assert(orderUpdated, "order status updated to failed");
  });

  // 20. cleanupExpiredReservations — handles reservation with unmatched order
  await test("cleanupExpiredReservations releases reservation when order is not found in Postgres", async () => {
    let stockReleased = false;

    const { pool } = createMockDbPool((sql) => {
      if (sql.includes("WHERE action = 'reserve' AND created_at < $1")) {
        return {
          rows: [
            {
              id: "log-orphan",
              product_id: sampleProductId,
              sku: sampleSku,
              action: "reserve",
              quantity_change: -3,
              previous_stock: 10,
              new_stock: 7,
              order_id: "6ae44c64900e0da3e5b0adef",
              created_at: new Date(Date.now() - 50 * 60 * 1000),
            },
          ],
          rowCount: 1,
        };
      }
      if (sql.includes("SELECT id, payment_status, notes FROM orders WHERE id = $1")) {
        return { rows: [], rowCount: 0 }; // unmatched order
      }
      if (sql.includes("UPDATE products") && sql.includes("stock + $1")) {
        stockReleased = true;
        return { rows: [{ id: sampleProductId, sku: sampleSku, stock: 10 }], rowCount: 1 };
      }
      if (sql.includes("INSERT INTO inventory_logs")) {
        return { rows: [{ ...sampleLogDbRow }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });

    setInventoryRepository(new PostgresInventoryRepository(pool));
    setInventoryDatabasePool(pool);

    await cleanupExpiredReservations();
    assert(stockReleased, "released stock even with unmatched order");
  });

  // 21. getInventoryLogs — filters mapping and pagination
  await test("getInventoryLogs filters by productId, sku, action, orderId, performedBy, and dates", async () => {
    let capturedSql = "";
    let capturedParams: any[] = [];

    const { pool } = createMockDbPool((sql, params) => {
      if (sql.includes("SELECT COUNT(*)::int AS total FROM inventory_logs")) {
        return { rows: [{ total: 25 }], rowCount: 1 };
      }
      if (sql.includes("SELECT id, product_id, sku, action")) {
        capturedSql = sql;
        capturedParams = params || [];
        return { rows: [sampleLogDbRow], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });

    setInventoryRepository(new PostgresInventoryRepository(pool));
    setInventoryDatabasePool(pool);

    const result = await getInventoryLogs(
      {
        productId: sampleProductId,
        sku: sampleSku,
        action: "deduct",
        orderId: sampleOrderId,
        performedBy: sampleUserId,
        startDate: new Date("2026-11-01"),
        endDate: new Date("2026-11-20"),
      },
      { page: 2, limit: 10 }
    );

    assertEqual(result.items.length, 1, "items length");
    assertEqual(result.meta.page, 2, "meta.page");
    assertEqual(result.meta.limit, 10, "meta.limit");
    assertEqual(result.meta.total, 25, "meta.total");
    assertEqual(result.meta.totalPages, 3, "meta.totalPages");
    assertEqual(result.meta.hasNextPage, true, "hasNextPage");
    assertEqual(result.meta.hasPrevPage, true, "hasPrevPage");

    assert(capturedSql.includes("product_id = $1"), "filtered by product_id");
    assert(capturedSql.includes("UPPER(sku) = UPPER($2)"), "filtered by UPPER(sku)");
    assert(capturedSql.includes("action = $3"), "filtered by action");
    assert(capturedSql.includes("order_id = $4"), "filtered by order_id");
    assert(capturedSql.includes("performed_by = $5"), "filtered by performed_by");
    assert(capturedSql.includes("created_at >= $6"), "filtered by startDate");
    assert(capturedSql.includes("created_at <= $7"), "filtered by endDate");
    assert(capturedSql.includes("LIMIT $8 OFFSET $9"), "paginated with LIMIT/OFFSET");
    assert(capturedParams.length === 9, "all 9 query parameters passed");
  });

  // 22. getInventoryLogs — boundary defaults
  await test("getInventoryLogs enforces pagination boundary defaults", async () => {
    const { pool } = createMockDbPool((sql) => {
      if (sql.includes("SELECT COUNT(*)")) return { rows: [{ total: 0 }], rowCount: 1 };
      if (sql.includes("SELECT id, product_id")) return { rows: [], rowCount: 0 };
      return { rows: [], rowCount: 0 };
    });

    setInventoryRepository(new PostgresInventoryRepository(pool));
    setInventoryDatabasePool(pool);

    const result = await getInventoryLogs(undefined, { page: -5, limit: 500 });
    assertEqual(result.meta.page, 1, "page clamped to 1");
    assertEqual(result.meta.limit, 100, "limit clamped to 100");
  });

  // 23. getInventoryHistory — product specific history and invalid ID validation
  await test("getInventoryHistory retrieves product-specific history and rejects invalid ID format", async () => {
    const { pool } = createMockDbPool((sql) => {
      if (sql.includes("SELECT COUNT(*)")) return { rows: [{ total: 1 }], rowCount: 1 };
      if (sql.includes("SELECT id, product_id")) return { rows: [sampleLogDbRow], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    });

    setInventoryRepository(new PostgresInventoryRepository(pool));
    setInventoryDatabasePool(pool);

    const result = await getInventoryHistory(sampleProductId);
    assertEqual(result.items.length, 1, "history items length");

    let error: any = null;
    try {
      await getInventoryHistory("invalid-format");
    } catch (e) {
      error = e;
    }
    assert(error instanceof AppError && error.statusCode === 400, "rejects invalid product ID");
  });

  // 24. getInventorySummary — catalog-wide summary
  await test("getInventorySummary returns catalog-wide metrics", async () => {
    const { pool } = createMockDbPool((sql) => {
      if (sql.includes("FROM products") && sql.includes("is_active = true")) {
        return {
          rows: [
            {
              total_products: 42,
              total_stock_quantity: 1250,
              out_of_stock_count: 3,
              low_stock_count: 7,
              recent_movements_count: 120,
            },
          ],
          rowCount: 1,
        };
      }
      return { rows: [], rowCount: 0 };
    });

    setInventoryRepository(new PostgresInventoryRepository(pool));
    setInventoryDatabasePool(pool);

    const summary = await getInventorySummary();
    assertEqual(summary.totalProducts, 42, "totalProducts");
    assertEqual(summary.totalStockQuantity, 1250, "totalStockQuantity");
    assertEqual(summary.outOfStockCount, 3, "outOfStockCount");
    assertEqual(summary.lowStockCount, 7, "lowStockCount");
    assertEqual(summary.recentMovementsCount, 120, "recentMovementsCount");
  });

  // 25. getInventorySummary — single product summary
  await test("getInventorySummary returns single-product summary when productId is provided", async () => {
    const { pool } = createMockDbPool((sql) => {
      if (sql.includes("FROM products p") && sql.includes("WHERE p.id = $1")) {
        return {
          rows: [
            {
              total_products: 1,
              total_stock_quantity: 15,
              out_of_stock_count: 0,
              low_stock_count: 0,
              recent_movements_count: 8,
            },
          ],
          rowCount: 1,
        };
      }
      return { rows: [], rowCount: 0 };
    });

    setInventoryRepository(new PostgresInventoryRepository(pool));
    setInventoryDatabasePool(pool);

    const summary = await getInventorySummary(sampleProductId);
    assertEqual(summary.totalProducts, 1, "single product total");
    assertEqual(summary.totalStockQuantity, 15, "product stock");
    assertEqual(summary.recentMovementsCount, 8, "movements count");
  });

  // 26. getLowStockProducts — delegates to product repo
  await test("getLowStockProducts queries products at or below low stock threshold", async () => {
    let capturedThreshold: number | undefined;
    const mockProductRepo = {
      findLowStock: async (threshold?: number) => {
        capturedThreshold = threshold;
        return [{ id: sampleProductId, sku: sampleSku, stock: 2 } as ProductRecord];
      },
    } as unknown as PostgresProductRepository;

    setInventoryProductRepository(mockProductRepo);

    const products = await getLowStockProducts(5);
    assertEqual(products.length, 1, "products length");
    assertEqual(capturedThreshold, 5, "threshold passed to repository");
  });

  // 27. addStock & deductStock convenience wrappers
  await test("addStock and deductStock convenience wrappers validate quantity > 0 and execute adjustments", async () => {
    let capturedDelta: number | undefined;

    const { pool } = createMockDbPool((sql, params) => {
      if (sql.includes("UPDATE products")) {
        capturedDelta = params![0];
        return { rows: [{ id: sampleProductId, sku: sampleSku, stock: 20 }], rowCount: 1 };
      }
      if (sql.includes("INSERT INTO inventory_logs")) {
        return { rows: [{ ...sampleLogDbRow }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });

    setInventoryRepository(new PostgresInventoryRepository(pool));
    setInventoryDatabasePool(pool);

    await addStock(sampleProductId, 10, "Warehouse arrival");
    assertEqual(capturedDelta, 10, "add delta is 10");

    await deductStock(sampleProductId, 4, "Store shrinkage");
    assertEqual(capturedDelta, 4, "deduct delta is 4");

    let errZeroAdd: any = null;
    try {
      await addStock(sampleProductId, 0);
    } catch (e) {
      errZeroAdd = e;
    }
    assert(errZeroAdd instanceof AppError && errZeroAdd.statusCode === 400, "rejects 0 add");

    let errZeroDeduct: any = null;
    try {
      await deductStock(sampleProductId, -5);
    } catch (e) {
      errZeroDeduct = e;
    }
    assert(errZeroDeduct instanceof AppError && errZeroDeduct.statusCode === 400, "rejects negative deduct");
  });

  // 28. API response compatibility — id and _id, typed properties
  await test("API compatibility — returned entities provide both id and _id, and typed properties", async () => {
    const { pool } = createMockDbPool((sql) => {
      if (sql.includes("SELECT COUNT(*)")) return { rows: [{ total: 1 }], rowCount: 1 };
      if (sql.includes("SELECT id, product_id")) return { rows: [sampleLogDbRow], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    });

    setInventoryRepository(new PostgresInventoryRepository(pool));
    setInventoryDatabasePool(pool);

    const result = await getInventoryLogs();
    const log = result.items[0];

    assertEqual(typeof log.id, "string", "id is string");
    assertEqual(typeof log._id, "string", "_id is string");
    assertEqual(log.id, log._id, "id equals _id");
    assertEqual(log.productId, sampleProductId, "productId matches");
    assertEqual(log.sku, sampleSku, "sku matches");
    assertEqual(typeof log.quantityChange, "number", "quantityChange is number");
    assertEqual(typeof log.previousStock, "number", "previousStock is number");
    assertEqual(typeof log.newStock, "number", "newStock is number");
    assert(log.createdAt instanceof Date, "createdAt is Date");
  });

  // 29. Transaction client reuse
  await test("Transaction client reuse — supplied client is used directly without opening new transaction", async () => {
    const executedQueries: string[] = [];
    const mockClient: IDbClient = {
      query: async <T = any>(sql: string): Promise<IQueryResult<T>> => {
        executedQueries.push(sql.trim());
        if (sql.includes("UPDATE products")) {
          return { rows: [{ id: sampleProductId, sku: sampleSku, stock: 15 }] as unknown as T[], rowCount: 1 };
        }
        if (sql.includes("INSERT INTO inventory_logs")) {
          return { rows: [{ ...sampleLogDbRow }] as unknown as T[], rowCount: 1 };
        }
        return { rows: [] as T[], rowCount: 0 };
      },
    };

    await adjustStock(
      {
        productId: sampleProductId,
        quantityChange: 5,
        action: "add",
      },
      undefined,
      mockClient
    );

    const hasBegin = executedQueries.some((q) => q === "BEGIN");
    assert(!hasBegin, "did not issue redundant BEGIN when supplied client is passed");
    const hasUpdate = executedQueries.some((q) => q.includes("UPDATE products"));
    assert(hasUpdate, "executed queries on supplied client");
  });

  // 30. mapRowToInventoryLog — converts database row to domain entity with dual IDs
  await test("mapRowToInventoryLog converts database row to domain entity with dual IDs", () => {
    const entity: IInventoryLogRecord = mapRowToInventoryLog(sampleLogDbRow);
    assertEqual(entity.id, sampleLogDbRow.id, "id matches");
    assertEqual(entity._id, sampleLogDbRow.id, "_id matches id");
    assertEqual(entity.productId, sampleLogDbRow.product_id, "productId matches");
    assertEqual(entity.sku, sampleLogDbRow.sku, "sku matches");
    assertEqual(entity.quantityChange, 5, "quantityChange matches");
    assertEqual(entity.previousStock, 10, "previousStock matches");
    assertEqual(entity.newStock, 15, "newStock matches");
    assert(entity.createdAt instanceof Date, "createdAt is Date");
  });

  // ── Results Summary ───────────────────────────────────────────────────────
  console.log(`\n━━━  Results: ${passed} passed, ${failed} failed  ━━━\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

run().catch((err) => {
  console.error("Test runner encountered an unhandled error:", err);
  process.exit(1);
});
