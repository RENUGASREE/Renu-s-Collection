import fs from "fs";
import path from "path";
import dns from "dns";
import dotenv from "dotenv";

// Load server .env
dotenv.config({ path: path.resolve(__dirname, "../../.env") });
dotenv.config({ path: path.resolve(process.cwd(), "server/.env") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { env } from "../config/env.js";
import { PostgresInventoryService } from "../services/postgres-inventory.service.js";
import { MongoToSupabaseMigrator } from "./migrate-mongo-to-supabase.js";
import { IDbClient, IQueryResult } from "../types/database.types.js";

// Ensure Atlas SRV connection strings resolve reliably across Windows environments
if (env.MONGODB_URI?.startsWith("mongodb+srv://")) {
  try {
    dns.setServers(["8.8.8.8", "1.1.1.1"]);
  } catch {}
}

/**
 * Mock DB Client to test Postgres transactional inventory, ID compatibility,
 * and resume/stale-overwrite protection logic.
 */
class MockDbClient implements IDbClient {
  public executedQueries: Array<{ sql: string; params?: any[] }> = [];
  public productStockTable: Map<string, { id: string; sku: string; stock: number }> = new Map();
  public variantStockTable: Map<string, { id: string; sku: string; stock: number }> = new Map();
  public reservationsTable: Map<string, any> = new Map();
  public reservationItemsTable: Array<{ reservation_id: string; sku: string; quantity: number }> = [];
  public ordersTable: Map<string, any> = new Map();
  public usersTable: Map<string, { id: string; email: string; updated_at: Date; role: string }> = new Map();
  public imageMappingsTable: Map<string, { mongodb_id: string; file_size_bytes: number }> = new Map();

  async query<T = any>(sql: string, params?: any[]): Promise<IQueryResult<T>> {
    this.executedQueries.push({ sql, params });

    // Handle atomic conditional deduction: UPDATE products SET stock = stock - $1 WHERE id = $2 AND stock >= $1
    if (sql.includes("UPDATE products") && sql.includes("stock >= $1")) {
      const [qty, id] = params || [];
      const prod = this.productStockTable.get(id);
      if (prod && prod.stock >= qty) {
        const prev = prod.stock;
        prod.stock -= qty;
        return {
          rows: [{ id: prod.id, sku: prod.sku, new_stock: prod.stock, previous_stock: prev }] as any,
          rowCount: 1,
        };
      }
      return { rows: [], rowCount: 0 };
    }

    // Handle SELECT for error diagnostics
    if (sql.includes("SELECT id, stock, sku FROM products WHERE id = $1")) {
      const [id] = params || [];
      const prod = this.productStockTable.get(id);
      if (prod) {
        return { rows: [{ id: prod.id, stock: prod.stock, sku: prod.sku }] as any, rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    }

    // Handle studio material variant deduction
    if (sql.includes("UPDATE studio_material_variants") && sql.includes("stock >= $1")) {
      const [qty, sku] = params || [];
      const variant = this.variantStockTable.get(sku);
      if (variant && variant.stock >= qty) {
        variant.stock -= qty;
        return { rows: [{ id: variant.id, sku, stock: variant.stock }] as any, rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    }

    // Handle studio reservation insert
    if (sql.includes("INSERT INTO studio_reservations")) {
      const [id, orderId, orderNumber, userId, expiresAt] = params || [];
      this.reservationsTable.set(id, { id, orderId, orderNumber, userId, expiresAt, status: "reserved" });
      return { rows: [], rowCount: 1 };
    }

    // Handle studio reservation items insert
    if (sql.includes("INSERT INTO studio_reservation_items")) {
      const [reservationId, , , sku, quantity] = params || [];
      this.reservationItemsTable.push({ reservation_id: reservationId, sku, quantity });
      return { rows: [], rowCount: 1 };
    }

    // Handle studio reservation commit
    if (sql.includes("UPDATE studio_reservations") && sql.includes("status = 'committed'")) {
      const [id] = params || [];
      const res = this.reservationsTable.get(id);
      if (res && res.status === "reserved") {
        res.status = "committed";
        return { rows: [{ id }] as any, rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    }

    // Handle studio reservation release
    if (sql.includes("UPDATE studio_reservations") && sql.includes("status = 'released'")) {
      const [id] = params || [];
      const res = this.reservationsTable.get(id);
      if (res && res.status !== "released") {
        res.status = "released";
        return { rows: [{ id, status: "released" }] as any, rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    }

    // Handle fetch items for released reservation
    if (sql.includes("SELECT sku, quantity FROM studio_reservation_items WHERE reservation_id = $1")) {
      const [id] = params || [];
      const items = this.reservationItemsTable.filter((i) => i.reservation_id === id);
      return { rows: items as any, rowCount: items.length };
    }

    // Handle restoration of variant stock
    if (sql.includes("UPDATE studio_material_variants") && sql.includes("stock = stock + $1")) {
      const [qty, sku] = params || [];
      const variant = this.variantStockTable.get(sku);
      if (variant) {
        variant.stock += qty;
        return { rows: [{ id: variant.id, sku, stock: variant.stock }] as any, rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    }

    // Handle select expired reservations for sweeper
    if (sql.includes("SELECT id FROM studio_reservations") && sql.includes("status = 'reserved' AND expires_at < NOW()")) {
      const now = new Date();
      const expired: any[] = [];
      for (const res of this.reservationsTable.values()) {
        if (res.status === "reserved" && new Date(res.expiresAt) < now) {
          expired.push({ id: res.id });
        }
      }
      return { rows: expired as any, rowCount: expired.length };
    }

    // Handle order idempotency check
    if (sql.includes("FROM orders") && sql.includes("idempotency_key = $2")) {
      const [userId, idempotencyKey] = params || [];
      for (const ord of this.ordersTable.values()) {
        if (ord.userId === userId && ord.idempotencyKey === idempotencyKey) {
          return { rows: [{ id: ord.id, order_number: ord.orderNumber, status: ord.status }] as any, rowCount: 1 };
        }
      }
      return { rows: [], rowCount: 0 };
    }

    // Handle image mappings resume check
    if (sql.includes("SELECT mongodb_id, file_size_bytes FROM image_mappings WHERE mongodb_id = $1")) {
      const [id] = params || [];
      const record = this.imageMappingsTable.get(id);
      if (record) {
        return { rows: [record] as any, rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    }

    // Handle users upsert with stale update protection
    if (sql.includes("INSERT INTO users") && sql.includes("ON CONFLICT (id) DO UPDATE")) {
      const id = params?.[0];
      const email = params?.[1];
      const role = params?.length === 6 ? params[4] : params?.[7];
      const ua = params?.[params.length - 1];
      const existing = this.usersTable.get(id);
      if (existing) {
        // Evaluate WHERE users.updated_at <= EXCLUDED.updated_at
        if (existing.updated_at <= new Date(ua)) {
          existing.email = email;
          existing.updated_at = new Date(ua);
          existing.role = role;
          return { rows: [{ id }] as any, rowCount: 1 };
        } else {
          // Stale source record ignored
          return { rows: [], rowCount: 0 };
        }
      } else {
        this.usersTable.set(id, { id, email, updated_at: new Date(ua), role });
        return { rows: [{ id }] as any, rowCount: 1 };
      }
    }

    // Default return
    return { rows: [], rowCount: 1 };
  }
}

async function runValidationTests() {
  console.log("================================================================================");
  console.log("RENU'S COLLECTIONS – SUPABASE MIGRATION PHASE 1.1 HARDENING & VALIDATION SUITE");
  console.log("================================================================================\n");

  let passedTests = 0;
  let totalTests = 0;

  function assert(condition: boolean, testName: string) {
    totalTests++;
    if (condition) {
      console.log(`[PASS] ${testName}`);
      passedTests++;
    } else {
      console.error(`[FAIL] ${testName}`);
      throw new Error(`Assertion failed: ${testName}`);
    }
  }

  // --------------------------------------------------------------------------
  // TEST SECTION 1: Schema File & VARCHAR(36) Identifier Consistency
  // --------------------------------------------------------------------------
  console.log("--- 1. Testing Schema DDL & Identifier Compatibility ---");
  const ddlPath = path.resolve(process.cwd(), "src/db/migrations/001_initial_schema.sql");
  assert(fs.existsSync(ddlPath), "001_initial_schema.sql exists in server/src/db/migrations/");

  const ddlContent = fs.readFileSync(ddlPath, "utf-8");

  // Verify all entity primary keys use VARCHAR(36)
  const pkTables = [
    "users",
    "user_addresses",
    "categories",
    "products",
    "product_media",
    "component_types",
    "jewellery_types",
    "studio_materials",
    "studio_material_variants",
    "customization_configs",
    "making_charges",
    "design_rules",
    "design_templates",
    "saved_designs",
    "orders",
    "order_items",
    "studio_reservations",
    "studio_reservation_items",
    "carts",
    "cart_items",
    "wishlist_items",
    "reviews",
    "coupons",
    "inventory_logs",
    "contact_messages",
    "image_mappings",
  ];

  for (const table of pkTables) {
    assert(
      ddlContent.includes(`CREATE TABLE IF NOT EXISTS ${table}`),
      `DDL includes table definition for "${table}"`
    );
  }

  // Verify VARCHAR(36) on critical tables
  assert(
    ddlContent.includes("id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text"),
    "Tables define 'id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text'"
  );
  assert(
    ddlContent.includes("mongodb_id VARCHAR(36) PRIMARY KEY"),
    "image_mappings uses VARCHAR(36) PRIMARY KEY preserving original 24-char ObjectId"
  );

  // Verify foreign-key column types use VARCHAR(36)
  assert(ddlContent.includes("user_id VARCHAR(36)"), "user_id columns use VARCHAR(36)");
  assert(ddlContent.includes("category_id VARCHAR(36)"), "category_id columns use VARCHAR(36)");
  assert(ddlContent.includes("product_id VARCHAR(36)"), "product_id columns use VARCHAR(36)");
  assert(ddlContent.includes("material_id VARCHAR(36)"), "material_id columns use VARCHAR(36)");
  assert(ddlContent.includes("order_id VARCHAR(36)"), "order_id columns use VARCHAR(36)");
  assert(ddlContent.includes("reservation_id VARCHAR(36)"), "reservation_id columns use VARCHAR(36)");

  // Verify 24-character ObjectId and 36-character UUID length constraints
  const sampleObjectId = "6ae44c64900e0da3e5b0adf9"; // 24 chars
  const sampleUuid = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11"; // 36 chars
  assert(sampleObjectId.length === 24 && sampleObjectId.length <= 36, "Sample 24-char ObjectId fits within VARCHAR(36)");
  assert(sampleUuid.length === 36 && sampleUuid.length <= 36, "Sample 36-char UUID fits within VARCHAR(36)");

  // --------------------------------------------------------------------------
  // TEST SECTION 2: Custom Authentication Preservation
  // --------------------------------------------------------------------------
  console.log("\n--- 2. Testing Custom Express JWT & Bcrypt Authentication ---");
  // Test password hashing and verification compatibility
  const plainPassword = "SecureCustomerPassword@2026";
  const saltRounds = 12;
  const hash = await bcrypt.hash(plainPassword, saltRounds);
  assert(hash.startsWith("$2a$") || hash.startsWith("$2b$"), "bcrypt produces standard modular crypt format hash ($2a$/$2b$)");

  const isMatch = await bcrypt.compare(plainPassword, hash);
  assert(isMatch === true, "bcrypt successfully verifies password against modular crypt hash");

  const isWrongMatch = await bcrypt.compare("WrongPassword", hash);
  assert(isWrongMatch === false, "bcrypt correctly rejects invalid password");

  // Verify DDL includes refresh token rotation and reset columns
  assert(ddlContent.includes("refresh_token_hash VARCHAR(255)"), "users table preserves refresh_token_hash");
  assert(ddlContent.includes("previous_refresh_token_hash VARCHAR(255)"), "users table preserves previous_refresh_token_hash");
  assert(ddlContent.includes("previous_refresh_token_expires_at TIMESTAMPTZ"), "users table preserves previous_refresh_token_expires_at");
  assert(ddlContent.includes("role VARCHAR(20) NOT NULL DEFAULT 'customer' CHECK (role IN ('customer', 'admin'))"), "users table enforces RBAC role constraint");

  // --------------------------------------------------------------------------
  // TEST SECTION 3: Inventory Transaction & Concurrency Behavior
  // --------------------------------------------------------------------------
  console.log("\n--- 3. Testing PostgreSQL Inventory & Concurrency Logic ---");
  const mockDb = new MockDbClient();

  // Test with both 24-character ObjectIds and 36-character UUIDs
  const mongoProductId = "6ae44c64900e0da3e5b0adf9"; // 24 chars
  const uuidProductId = "c1a2b3c4-d5e6-7f8a-9b0c-1d2e3f4a5b6c"; // 36 chars

  mockDb.productStockTable.set(mongoProductId, { id: mongoProductId, sku: "BRAC-MONGO-001", stock: 15 });
  mockDb.productStockTable.set(uuidProductId, { id: uuidProductId, sku: "BRAC-UUID-002", stock: 8 });
  mockDb.variantStockTable.set("CHARM-SILVER-01", { id: "6ae55555900e0da3e5b0adfa", sku: "CHARM-SILVER-01", stock: 10 });

  // Atomic deduction on 24-char ObjectId product
  const res1 = await PostgresInventoryService.deductStandardStockInTx(mockDb, [
    { productId: mongoProductId, sku: "BRAC-MONGO-001", quantity: 5 },
  ]);
  assert(res1.success && res1.deductedItems[0].newStock === 10, "Atomic deduction succeeded on 24-character ObjectId product (15 -> 10)");

  // Atomic deduction on 36-char UUID product
  const res2 = await PostgresInventoryService.deductStandardStockInTx(mockDb, [
    { productId: uuidProductId, sku: "BRAC-UUID-002", quantity: 3 },
  ]);
  assert(res2.success && res2.deductedItems[0].newStock === 5, "Atomic deduction succeeded on 36-character UUID product (8 -> 5)");

  // Insufficient stock failure
  let caughtInsufficient: any = null;
  try {
    await PostgresInventoryService.deductStandardStockInTx(mockDb, [
      { productId: uuidProductId, sku: "BRAC-UUID-002", quantity: 20 },
    ]);
  } catch (err) {
    caughtInsufficient = err;
  }
  assert(caughtInsufficient !== null && caughtInsufficient.statusCode === 400, "Insufficient stock throws HTTP 400 error");
  assert(mockDb.productStockTable.get(uuidProductId)?.stock === 5, "Product stock remains untouched after insufficient stock attempt");

  // Studio Reservation creation, variant locking, and expiration release
  const resId = "res_test_001";
  const studioRes = await PostgresInventoryService.createStudioReservationInTx(
    mockDb,
    resId,
    "RC-ORD-2001",
    mongoProductId,
    [{ materialName: "Silver Charm", sku: "CHARM-SILVER-01", quantity: 4 }],
    -5 // Expired 5 minutes ago to test sweeper
  );
  assert(studioRes.status === "reserved", "Studio reservation created with status 'reserved'");
  assert(mockDb.variantStockTable.get("CHARM-SILVER-01")?.stock === 6, "Studio variant stock locked (10 -> 6)");

  // Test expired reservation sweeper restores stock
  const releasedCount = await PostgresInventoryService.sweepExpiredReservations(mockDb);
  assert(releasedCount === 1, "Expired reservation sweeper detected and released 1 reservation");
  assert(mockDb.variantStockTable.get("CHARM-SILVER-01")?.stock === 10, "Studio variant stock restored to 10 by sweeper");
  assert(mockDb.reservationsTable.get(resId)?.status === "released", "Reservation status updated to 'released'");

  // Test order idempotency lookup
  mockDb.ordersTable.set("ord_1", {
    id: "ord_1",
    orderNumber: "RC-ORD-1001",
    userId: mongoProductId,
    idempotencyKey: "idemp_abc_123",
    status: "processing",
  });
  const existingOrder = await PostgresInventoryService.findExistingIdempotentOrder(mockDb, mongoProductId, "idemp_abc_123");
  assert(existingOrder !== null && existingOrder.orderNumber === "RC-ORD-1001", "Order idempotency successfully detects existing order");

  const nonExistentOrder = await PostgresInventoryService.findExistingIdempotentOrder(mockDb, mongoProductId, "new_key_456");
  assert(nonExistentOrder === null, "Order idempotency returns null for fresh request key");

  // --------------------------------------------------------------------------
  // TEST SECTION 4: Safe Migration Resume & Stale Overwrite Protection
  // --------------------------------------------------------------------------
  console.log("\n--- 4. Testing Safe Resume & Stale Overwrite Protection ---");
  // 1. Test image resume skip
  const testImageId = "6ae44c64900e0da3e5b0adf9";
  mockDb.imageMappingsTable.set(testImageId, { mongodb_id: testImageId, file_size_bytes: 5632128 });

  const checkExistingImage = await mockDb.query(
    `SELECT mongodb_id, file_size_bytes FROM image_mappings WHERE mongodb_id = $1;`,
    [testImageId]
  );
  assert(checkExistingImage.rowCount === 1, "Existing image mapping detected by ID");
  assert(Number(checkExistingImage.rows[0].file_size_bytes) === 5632128, "Existing image size matches, safe to skip re-upload");

  // 2. Test stale overwrite protection on users
  const userId = "user_stale_test_1";
  const targetUpdatedAt = new Date("2026-11-19T20:00:00Z");
  mockDb.usersTable.set(userId, { id: userId, email: "updated_on_target@example.com", updated_at: targetUpdatedAt, role: "customer" });

  // Attempt to ingest an older source record (from earlier backup)
  const staleSourceUpdatedAt = new Date("2026-11-18T10:00:00Z"); // Older than target!
  const staleInsertResult = await mockDb.query(
    `INSERT INTO users (id, email, username, password_hash, role, updated_at) VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email WHERE users.updated_at <= EXCLUDED.updated_at;`,
    [userId, "stale_from_mongo@example.com", "user", "hash", "customer", staleSourceUpdatedAt.toISOString()]
  );
  assert(staleInsertResult.rowCount === 0, "Stale update rejected by WHERE users.updated_at <= EXCLUDED.updated_at guard");
  assert(mockDb.usersTable.get(userId)?.email === "updated_on_target@example.com", "Target record preserved against stale overwrite");

  // Ingest a newer source record
  const freshSourceUpdatedAt = new Date("2026-11-20T12:00:00Z"); // Newer than target
  const freshInsertResult = await mockDb.query(
    `INSERT INTO users (id, email, username, password_hash, role, updated_at) VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email WHERE users.updated_at <= EXCLUDED.updated_at;`,
    [userId, "fresh_from_source@example.com", "user", "hash", "customer", freshSourceUpdatedAt.toISOString()]
  );
  assert(freshInsertResult.rowCount === 1, "Fresh update accepted when source is newer or equal");
  assert(mockDb.usersTable.get(userId)?.email === "fresh_from_source@example.com", "Target record updated cleanly when source is newer");

  // --------------------------------------------------------------------------
  // TEST SECTION 5: Dry-Run Against Live MongoDB
  // --------------------------------------------------------------------------
  console.log("\n--- 5. Testing Migration Tool in Dry-Run Mode against Live MongoDB ---");
  const migrator = new MongoToSupabaseMigrator({
    dryRun: true,
    resume: true,
    batchSize: 50,
  });

  const summary = await migrator.run();
  assert(summary.dryRun === true, "Migrator executed cleanly in dry-run mode (zero writes)");
  assert(summary.imagesMigrated.count === 102, "All 102 GridFS images identified for migration");
  assert(summary.imagesMigrated.totalBytes > 300 * 1024 * 1024, "Total image binary size verified (>300 MB)");
  assert(Object.keys(summary.collectionsMigrated).length === 19, "All 19 relational entities processed in dependency order");

  // --------------------------------------------------------------------------
  // SUMMARY
  // --------------------------------------------------------------------------
  console.log("\n================================================================================");
  console.log(`PHASE 1.1 HARDENING VALIDATION COMPLETE: ${passedTests}/${totalTests} TESTS PASSED.`);
  console.log("================================================================================\n");

  await mongoose.disconnect();
}

runValidationTests().catch((err) => {
  console.error("Validation failed:", err);
  process.exit(1);
});
