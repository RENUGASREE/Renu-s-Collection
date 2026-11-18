import dotenv from "dotenv";
import path from "path";
import { Types } from "mongoose";

dotenv.config({ path: path.resolve(process.cwd(), "server/.env") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });
dotenv.config();

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  details?: string;
}

const results: TestResult[] = [];

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function runTest(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    results.push({ name, passed: true });
    console.log(`[PASS] ${name}`);
  } catch (err: any) {
    results.push({ name, passed: false, error: err?.message || String(err) });
    console.error(`[FAIL] ${name}: ${err?.message}`);
  }
}

async function main() {
  console.log("================================================================================");
  console.log("Renu's Collections — Standard Product Inventory Concurrency & Consistency Tests");
  console.log("================================================================================");

  const { connectDatabase, disconnectDatabase } = await import("../db/connection.js");
  const { Product, Category, InventoryLog } = await import("../models/index.js");
  const {
    adjustStock,
    deductStockForOrder,
    reserveStockForOrder,
  } = await import("../services/inventory.service.js");

  let isUsingMock = false;
  try {
    const connectPromise = connectDatabase();
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Database connection timed out")), 3000)
    );
    await Promise.race([connectPromise, timeoutPromise]);
    console.log("Connected to live MongoDB database.");
  } catch (err: any) {
    console.warn(`MongoDB live connection skipped (${err.message}). Using in-memory product inventory simulation.`);
    isUsingMock = true;
  }

  const createdProductIds: Types.ObjectId[] = [];
  let testCategoryId: Types.ObjectId = new Types.ObjectId();

  if (isUsingMock) {
    const inMemoryProducts = new Map<string, any>();
    const inMemoryLogs: any[] = [];

    Product.create = (async (doc: any) => {
      const _id = new Types.ObjectId();
      const productObj = {
        _id,
        id: _id.toString(),
        sku: doc.sku,
        name: doc.name,
        stock: doc.stock,
        price: doc.price,
        categoryId: doc.categoryId,
        isActive: doc.isActive,
      };
      inMemoryProducts.set(_id.toString(), productObj);
      return productObj as any;
    }) as any;

    Product.findById = (async (id: any) => {
      const idStr = id?.toString();
      const p = inMemoryProducts.get(idStr);
      return p ? { ...p } : null;
    }) as any;

    Product.exists = (async (query: any) => {
      const idStr = query?._id?.toString();
      return inMemoryProducts.has(idStr) ? { _id: query._id } : null;
    }) as any;

    Product.findOneAndUpdate = (async (filter: any, update: any, _options?: any) => {
      const idStr = filter?._id?.toString();
      const p = inMemoryProducts.get(idStr);
      if (!p) return null;

      if (filter.stock && typeof filter.stock.$gte === "number") {
        if (p.stock < filter.stock.$gte) {
          return null; // Condition not met (Insufficient stock)
        }
      }

      if (update.$inc && typeof update.$inc.stock === "number") {
        p.stock += update.$inc.stock;
      }

      return { ...p, id: idStr };
    }) as any;

    InventoryLog.create = (async (logData: any) => {
      const _id = new Types.ObjectId();
      const logObj = { _id, ...logData };
      inMemoryLogs.push(logObj);
      return logObj as any;
    }) as any;

    InventoryLog.findOne = (async (query: any) => {
      const found = inMemoryLogs.find((l) => {
        if (query.productId && l.productId.toString() !== query.productId.toString()) return false;
        if (query.action && l.action !== query.action) return false;
        return true;
      });
      return found ? { ...found } : null;
    }) as any;
  } else {
    // 1. Locate or create category for test products
    const existingCategory = await Category.findOne();
    if (existingCategory) {
      testCategoryId = existingCategory._id as Types.ObjectId;
    } else {
      const newCat = await Category.create({
        name: "Test Category",
        slug: `test-cat-${Date.now()}`,
        status: "active",
      });
      testCategoryId = newCat._id as Types.ObjectId;
    }
  }

  // Helper to create isolated test products
  const createTestProduct = async (stock: number, prefix: string) => {
    const uniqueSuffix = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
    const prod = await Product.create({
      name: `Test Product ${prefix} ${uniqueSuffix}`,
      slug: `test-prod-${prefix.toLowerCase()}-${uniqueSuffix}`,
      description: "Automated test product for inventory consistency testing",
      categoryId: testCategoryId,
      price: 199,
      sku: `TST-${prefix.toUpperCase()}-${uniqueSuffix}`,
      stock,
      isActive: true,
    });
    createdProductIds.push(prod._id as Types.ObjectId);
    return prod;
  };

  try {
    // -------------------------------------------------------------------------
    // Test Case 1: Successful stock deduction
    // -------------------------------------------------------------------------
    await runTest("Test 1: Successful stock deduction", async () => {
      const prod = await createTestProduct(10, "DEDUCT");
      const orderId = new Types.ObjectId().toString();

      await deductStockForOrder(
        [{ productId: prod._id.toString(), quantity: 2 }],
        orderId
      );

      const refreshed = await Product.findById(prod._id);
      assert(refreshed !== null, "Product should exist");
      assert(refreshed!.stock === 8, `Expected stock to be 8, got ${refreshed!.stock}`);

      // Verify InventoryLog
      const log = await InventoryLog.findOne({
        productId: prod._id,
        orderId: new Types.ObjectId(orderId),
        action: "deduct",
      });
      assert(log !== null, "Inventory log must be recorded");
      assert(log!.previousStock === 10, `Expected previousStock 10, got ${log!.previousStock}`);
      assert(log!.newStock === 8, `Expected newStock 8, got ${log!.newStock}`);
      assert(log!.quantityChange === -2, `Expected quantityChange -2, got ${log!.quantityChange}`);
    });

    // -------------------------------------------------------------------------
    // Test Case 2: Insufficient stock rejection
    // -------------------------------------------------------------------------
    await runTest("Test 2: Insufficient stock rejection", async () => {
      const prod = await createTestProduct(8, "INSUFFICIENT");
      const orderId = new Types.ObjectId().toString();

      let errorCaught: any = null;
      try {
        await deductStockForOrder(
          [{ productId: prod._id.toString(), quantity: 15 }],
          orderId
        );
      } catch (err) {
        errorCaught = err;
      }

      assert(errorCaught !== null, "Must throw an error when quantity exceeds stock");
      assert(errorCaught.statusCode === 400, `Expected statusCode 400, got ${errorCaught.statusCode}`);
      assert(
        errorCaught.message === "Insufficient stock",
        `Expected 'Insufficient stock' message, got '${errorCaught.message}'`
      );

      // Verify stock in database remains unchanged
      const refreshed = await Product.findById(prod._id);
      assert(refreshed !== null, "Product should exist");
      assert(refreshed!.stock === 8, `Stock must remain 8, got ${refreshed!.stock}`);
    });

    // -------------------------------------------------------------------------
    // Test Case 3: Two simultaneous attempts to purchase the final unit
    // -------------------------------------------------------------------------
    await runTest("Test 3: Two simultaneous attempts to purchase the final unit", async () => {
      const prod = await createTestProduct(1, "RACE");
      const orderId1 = new Types.ObjectId().toString();
      const orderId2 = new Types.ObjectId().toString();

      // Launch both requests simultaneously
      const [res1, res2] = await Promise.allSettled([
        adjustStock({
          productId: prod._id.toString(),
          quantityChange: -1,
          action: "deduct",
          reason: "Concurrent purchase 1",
          orderId: orderId1,
        }),
        adjustStock({
          productId: prod._id.toString(),
          quantityChange: -1,
          action: "deduct",
          reason: "Concurrent purchase 2",
          orderId: orderId2,
        }),
      ]);

      const successCount = [res1, res2].filter((r) => r.status === "fulfilled").length;
      const rejectedCount = [res1, res2].filter((r) => r.status === "rejected").length;

      assert(
        successCount === 1,
        `Exactly 1 concurrent request must succeed. Succeeded: ${successCount}`
      );
      assert(
        rejectedCount === 1,
        `Exactly 1 concurrent request must be rejected. Rejected: ${rejectedCount}`
      );

      const rejectedResult = (res1.status === "rejected" ? res1 : res2) as PromiseRejectedResult;
      assert(
        rejectedResult.reason?.message === "Insufficient stock",
        `Rejected request must fail with 'Insufficient stock', got: ${rejectedResult.reason?.message}`
      );

      // Verify final stock is 0 and NOT negative
      const refreshed = await Product.findById(prod._id);
      assert(refreshed !== null, "Product should exist");
      assert(
        refreshed!.stock === 0,
        `Final stock must be exactly 0, got ${refreshed!.stock} (cannot be negative)`
      );
    });

    // -------------------------------------------------------------------------
    // Test Case 4: Rollback when later item in multi-item order cannot be deducted
    // -------------------------------------------------------------------------
    await runTest("Test 4: Rollback when a later item in a multi-item order cannot be reserved/deducted", async () => {
      const prodA = await createTestProduct(5, "ROLLBACK-A");
      const prodB = await createTestProduct(0, "ROLLBACK-B"); // 0 stock, will fail
      const orderId = new Types.ObjectId().toString();

      let errorCaught: any = null;
      try {
        await deductStockForOrder(
          [
            { productId: prodA._id.toString(), quantity: 2 },
            { productId: prodB._id.toString(), quantity: 1 },
          ],
          orderId
        );
      } catch (err) {
        errorCaught = err;
      }

      assert(errorCaught !== null, "Multi-item order must fail when an item is out of stock");
      assert(
        errorCaught.message === "Insufficient stock",
        `Expected 'Insufficient stock' error, got: ${errorCaught.message}`
      );

      // Verify Product A stock was restored to initial 5
      const refreshedA = await Product.findById(prodA._id);
      assert(refreshedA !== null, "Product A should exist");
      assert(
        refreshedA!.stock === 5,
        `Product A stock must be rolled back to 5, got ${refreshedA!.stock}`
      );

      // Verify Product B stock remains 0
      const refreshedB = await Product.findById(prodB._id);
      assert(refreshedB !== null, "Product B should exist");
      assert(
        refreshedB!.stock === 0,
        `Product B stock must remain 0, got ${refreshedB!.stock}`
      );

      // Also verify reserveStockForOrder rollback
      const prodC = await createTestProduct(4, "ROLLBACK-C");
      const prodD = await createTestProduct(0, "ROLLBACK-D");
      const orderId2 = new Types.ObjectId().toString();

      let reserveError: any = null;
      try {
        await reserveStockForOrder(
          [
            { productId: prodC._id.toString(), quantity: 3 },
            { productId: prodD._id.toString(), quantity: 1 },
          ],
          orderId2
        );
      } catch (err) {
        reserveError = err;
      }

      assert(reserveError !== null, "Multi-item reservation must fail when an item is out of stock");
      assert(
        reserveError.message === "Insufficient stock",
        `Expected 'Insufficient stock' error, got: ${reserveError.message}`
      );

      // Verify Product C stock was restored to 4
      const refreshedC = await Product.findById(prodC._id);
      assert(refreshedC !== null, "Product C should exist");
      assert(
        refreshedC!.stock === 4,
        `Product C stock must be rolled back to 4, got ${refreshedC!.stock}`
      );
    });

  } finally {
    if (!isUsingMock) {
      console.log("\nCleaning up test artifacts...");
      if (createdProductIds.length > 0) {
        await Product.deleteMany({ _id: { $in: createdProductIds } });
        await InventoryLog.deleteMany({ productId: { $in: createdProductIds } });
        console.log(`Deleted ${createdProductIds.length} test products and associated logs.`);
      }
      await disconnectDatabase();
      console.log("Database disconnected.");
    }
  }

  // Summary
  console.log("\n================================================================================");
  console.log("Test Summary:");
  const total = results.length;
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  results.forEach((r, idx) => {
    console.log(`  ${idx + 1}. [${r.passed ? "PASS" : "FAIL"}] ${r.name}`);
    if (r.error) console.log(`     Error: ${r.error}`);
  });

  console.log(`\nTotal: ${total} | Passed: ${passed} | Failed: ${failed}`);
  console.log("================================================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch(async (err) => {
  console.error("Unhandled test suite execution error:", err);
  process.exit(1);
});
