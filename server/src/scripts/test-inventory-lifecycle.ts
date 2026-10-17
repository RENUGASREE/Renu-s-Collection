import mongoose, { Types } from "mongoose";
import { connectDatabase, disconnectDatabase } from "../db/connection.js";
import { StudioMaterial } from "../models/StudioMaterial.js";
import { StudioReservation } from "../models/StudioReservation.js";
import { Order } from "../models/Order.js";
import { Product } from "../models/Product.js";
import { Cart } from "../models/Cart.js";
import { User } from "../models/User.js";
import {
  aggregateCustomDesignComponents,
  validateCustomDesignStock,
  reserveStudioStockForOrder,
  commitStudioReservation,
  releaseStudioReservation,
  restockStudioReservation,
  cleanupExpiredStudioReservations,
  reconcileStudioReservation,
} from "../services/studio-inventory.service.js";
import { createOrderFromCart, cancelOrder } from "../services/order.service.js";

interface TestReport {
  name: string;
  passed: boolean;
  error?: string;
  details?: string;
}

const results: TestReport[] = [];

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
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
  console.log("Renu's Collections — Milestone 6 Inventory Lifecycle Verification Suite");
  console.log("================================================================================");

  // ---------------------------------------------------------------------------
  // 1. Pure Unit Tests: Aggregation & Multipliers
  // ---------------------------------------------------------------------------
  await runTest("Unit Test: aggregateCustomDesignComponents across multiple items & repeated beads", async () => {
    const mockCartItems = [
      {
        itemType: "custom_design",
        name: "Custom Bracelet 1",
        quantity: 2,
        studioDesign: {
          jewelleryType: "bracelet",
          constructionType: "elastic_bead",
          wristMm: 160,
          beadSequence: [
            { variantSku: "SKU-BEAD-A", displayName: "Bead A" },
            { variantSku: "SKU-BEAD-A", displayName: "Bead A" },
            { variantSku: "SKU-BEAD-B", displayName: "Bead B" },
          ],
          charms: [
            { variantSku: "SKU-CHARM-1", displayName: "Charm 1" },
          ],
        },
      },
      {
        itemType: "custom_design",
        name: "Custom Bracelet 2",
        quantity: 1,
        studioDesign: {
          jewelleryType: "bracelet",
          constructionType: "elastic_bead",
          wristMm: 170,
          beadSequence: [
            { variantSku: "SKU-BEAD-A", displayName: "Bead A" },
          ],
          charms: [],
        },
      },
      {
        itemType: "product",
        name: "Standard Catalog Product",
        quantity: 3,
        sku: "STD-PROD-01",
      },
    ];

    const aggregated = aggregateCustomDesignComponents(mockCartItems);

    // SKU-BEAD-A: (2 in item 1 * 2 qty) + (1 in item 2 * 1 qty) = 4 + 1 = 5
    assert(aggregated["SKU-BEAD-A"]?.quantity === 5, "SKU-BEAD-A total should be 5");
    // SKU-BEAD-B: (1 in item 1 * 2 qty) = 2
    assert(aggregated["SKU-BEAD-B"]?.quantity === 2, "SKU-BEAD-B total should be 2");
    // SKU-CHARM-1: (1 in item 1 * 2 qty) = 2
    assert(aggregated["SKU-CHARM-1"]?.quantity === 2, "SKU-CHARM-1 total should be 2");
    // Standard product should not be in aggregated custom components
    assert(!aggregated["STD-PROD-01"], "Standard product should be excluded");
  });

  // ---------------------------------------------------------------------------
  // 2. Database Integration Tests
  // ---------------------------------------------------------------------------
  let dbConnected = false;
  try {
    // Attempt default database connection
    await connectDatabase();
    dbConnected = true;
    console.log("\nConnected to database. Running integration tests on live schema...\n");
  } catch (remoteErr: any) {
    try {
      console.log("\nRemote database connection unavailable:", remoteErr?.message);
      console.log("Connecting to local MongoDB instance (mongodb://127.0.0.1:27017/renu_collections_test)...");
      await mongoose.connect("mongodb://127.0.0.1:27017/renu_collections_test", {
        autoIndex: true,
      });
      dbConnected = true;
      console.log("Connected to local MongoDB test database. Running integration tests on live schema...\n");
    } catch (localErr: any) {
      console.warn("Local database connection also unavailable:", localErr?.message);
      console.warn("Skipping live database execution. Pure unit tests completed.\n");
    }
  }

  if (dbConnected) {
    const testAdminUser = await User.create({
      username: `testadmin_${Date.now()}`,
      name: "Test Admin",
      email: `test-admin-${Date.now()}@example.com`,
      passwordHash: "hash123",
      role: "admin",
      isActive: true,
    });

    const testUserId = testAdminUser._id as Types.ObjectId;
    const testSkuA = `TEST-SKU-A-${Date.now()}`;
    const testSkuB = `TEST-SKU-B-${Date.now()}`;

    // Seed temporary test material
    const testMaterial = await StudioMaterial.create({
      name: "Test Gemstone Component",
      code: `MAT-TEST-${Date.now()}`,
      materialType: "bead",
      imageUrl: "/test.png",
      allowedJewelleryTypes: ["bracelet"],
      isActive: true,
      sortOrder: 999,
      variants: [
        {
          sku: testSkuA,
          sizeLabel: "8mm",
          dimensionsMm: { diameterMm: 8 },
          sellingUnit: "piece",
          purchaseCost: 10,
          sellingRate: 25,
          stock: 10, // 10 units available
          lowStockThreshold: 2,
          isActive: true,
        },
        {
          sku: testSkuB,
          sizeLabel: "6mm",
          dimensionsMm: { diameterMm: 6 },
          sellingUnit: "piece",
          purchaseCost: 8,
          sellingRate: 20,
          stock: 4, // 4 units available
          lowStockThreshold: 1,
          isActive: true,
        },
      ],
    });

    try {
      // Test 1: Successful reservation and stock decrement
      await runTest("1. Successful reservation and atomic stock decrement", async () => {
        const orderId = new Types.ObjectId();
        const cartItems = [
          {
            itemType: "custom_design",
            name: "Test Design",
            quantity: 1,
            studioDesign: {
              beadSequence: [
                { variantSku: testSkuA },
                { variantSku: testSkuA }, // 2 of SKU A
              ],
              charms: [],
            },
          },
        ];

        const reservation = await reserveStudioStockForOrder({
          orderId,
          orderNumber: "TEST-ORD-01",
          userId: testUserId,
          cartItems,
          paymentMethod: "razorpay",
        });

        assert(reservation !== null, "Reservation created");
        assert(reservation?.status === "reserved", "Status should be 'reserved'");
        assert(reservation?.items[0].quantity === 2, "Reserved qty should be 2");

        // Verify material stock decremented from 10 to 8
        const mat = await StudioMaterial.findById(testMaterial._id);
        const vA = mat?.variants.find((v) => v.sku === testSkuA);
        assert(vA?.stock === 8, `Stock should be 8, got ${vA?.stock}`);
      });

      // Test 2: Insufficient stock rejection
      await runTest("2. Insufficient stock rejection with clear error", async () => {
        const cartItems = [
          {
            itemType: "custom_design",
            name: "Greedy Design",
            quantity: 10, // Wants 10 * 2 = 20 units of SKU A (only 8 remain)
            studioDesign: {
              beadSequence: [
                { variantSku: testSkuA },
                { variantSku: testSkuA },
              ],
            },
          },
        ];

        let failed = false;
        try {
          await validateCustomDesignStock(cartItems);
        } catch (err: any) {
          failed = true;
          assert(err.message.includes("Insufficient stock"), `Error message should explain stock: ${err.message}`);
        }
        assert(failed, "Validation should have thrown insufficient stock error");
      });

      // Test 3: Concurrent attempts for the final available units
      await runTest("3. Concurrent attempts for last available units (atomic race)", async () => {
        // Stock of SKU B is currently 4.
        // We simulate two concurrent checkouts, each wanting 3 units of SKU B (3 + 3 = 6 > 4).
        const orderId1 = new Types.ObjectId();
        const orderId2 = new Types.ObjectId();

        const cartItems = [
          {
            itemType: "custom_design",
            name: "Race Design",
            quantity: 3,
            studioDesign: {
              beadSequence: [{ variantSku: testSkuB }],
            },
          },
        ];

        const attempts = await Promise.allSettled([
          reserveStudioStockForOrder({
            orderId: orderId1,
            orderNumber: "RACE-ORD-01",
            userId: testUserId,
            cartItems,
            paymentMethod: "razorpay",
          }),
          reserveStudioStockForOrder({
            orderId: orderId2,
            orderNumber: "RACE-ORD-02",
            userId: testUserId,
            cartItems,
            paymentMethod: "razorpay",
          }),
        ]);

        const fulfilled = attempts.filter((a) => a.status === "fulfilled");
        const rejected = attempts.filter((a) => a.status === "rejected");

        assert(fulfilled.length === 1, `Exactly 1 concurrent attempt should succeed, got ${fulfilled.length}`);
        assert(rejected.length === 1, `Exactly 1 concurrent attempt should fail, got ${rejected.length}`);

        // Remaining stock of SKU B should be 4 - 3 = 1 (never negative!)
        const mat = await StudioMaterial.findById(testMaterial._id);
        const vB = mat?.variants.find((v) => v.sku === testSkuB);
        assert(vB?.stock === 1, `Stock of SKU B should be 1, got ${vB?.stock}`);
      });

      // Test 4: Partial reservation failure and rollback
      await runTest("4. Partial reservation failure and rollback", async () => {
        // SKU A has 8 in stock. SKU B has 1 in stock.
        // Design wants 2 of SKU A (available) and 5 of SKU B (unavailable).
        const orderId = new Types.ObjectId();
        const cartItems = [
          {
            itemType: "custom_design",
            name: "Mixed Design",
            quantity: 1,
            studioDesign: {
              beadSequence: [
                { variantSku: testSkuA },
                { variantSku: testSkuA }, // 2 of SKU A
                { variantSku: testSkuB },
                { variantSku: testSkuB },
                { variantSku: testSkuB },
                { variantSku: testSkuB },
                { variantSku: testSkuB }, // 5 of SKU B (only 1 exists!)
              ],
            },
          },
        ];

        let failed = false;
        try {
          await reserveStudioStockForOrder({
            orderId,
            orderNumber: "ROLLBACK-ORD-01",
            userId: testUserId,
            cartItems,
            paymentMethod: "razorpay",
          });
        } catch (err: any) {
          failed = true;
        }

        assert(failed, "Reservation must fail due to SKU B");

        // Verify SKU A stock was NOT consumed or was cleanly rolled back to 8
        const mat = await StudioMaterial.findById(testMaterial._id);
        const vA = mat?.variants.find((v) => v.sku === testSkuA);
        assert(vA?.stock === 8, `Stock of SKU A must remain 8 after rollback, got ${vA?.stock}`);
      });

      // Test 5: Successful Razorpay payment commits reservation
      await runTest("5. Successful Razorpay payment commits reservation", async () => {
        const orderId = new Types.ObjectId();
        await reserveStudioStockForOrder({
          orderId,
          orderNumber: "PAY-ORD-01",
          userId: testUserId,
          cartItems: [
            {
              itemType: "custom_design",
              quantity: 1,
              studioDesign: { beadSequence: [{ variantSku: testSkuA }] },
            },
          ],
          paymentMethod: "razorpay",
        });

        // Commit on payment success
        const commitRes = await commitStudioReservation(orderId);
        assert(commitRes.success, "Commit should succeed");
        assert(commitRes.status === "committed", "Status should be 'committed'");

        const resDoc = await StudioReservation.findOne({ orderId });
        assert(resDoc?.status === "committed", "DB status should be committed");
        assert(resDoc?.committedAt !== undefined, "committedAt should be recorded");
      });

      // Test 6: Failed or expired payment and reservation release
      await runTest("6. Failed or expired payment releases reservation", async () => {
        // Stock of SKU A was 8 - 1 = 7.
        // Reserve 2 of SKU A (stock drops to 5).
        const orderId = new Types.ObjectId();
        await reserveStudioStockForOrder({
          orderId,
          orderNumber: "FAIL-ORD-01",
          userId: testUserId,
          cartItems: [
            {
              itemType: "custom_design",
              quantity: 2,
              studioDesign: { beadSequence: [{ variantSku: testSkuA }] },
            },
          ],
          paymentMethod: "razorpay",
        });

        let mat = await StudioMaterial.findById(testMaterial._id);
        let vA = mat?.variants.find((v) => v.sku === testSkuA);
        assert(vA?.stock === 5, `Stock should be 5 during reservation, got ${vA?.stock}`);

        // Release on payment failure
        const releaseRes = await releaseStudioReservation(orderId, "Payment cancelled by user");
        assert(releaseRes.released, "Should report released = true");

        mat = await StudioMaterial.findById(testMaterial._id);
        vA = mat?.variants.find((v) => v.sku === testSkuA);
        assert(vA?.stock === 7, `Stock should be restored to 7, got ${vA?.stock}`);
      });

      // Test 7: Late payment after reservation expiry (re-reserve and out-of-stock reconciliation)
      await runTest("7. Late payment after reservation expiry: re-reserves if available, flags reconciliation if out of stock", async () => {
        // Case A: Stock still available -> late payment re-reserves successfully
        const orderIdA = new Types.ObjectId();
        await reserveStudioStockForOrder({
          orderId: orderIdA,
          orderNumber: "LATE-ORD-01",
          userId: testUserId,
          cartItems: [
            {
              itemType: "custom_design",
              quantity: 1,
              studioDesign: { beadSequence: [{ variantSku: testSkuA }] },
            },
          ],
          paymentMethod: "razorpay",
        });

        // Expire and release the reservation (stock restored from 6 to 7)
        await releaseStudioReservation(orderIdA, "Reservation expired");

        // Late payment arrives and re-reserves
        const lateCommit = await commitStudioReservation(orderIdA);
        assert(lateCommit.success, "Late commit should succeed if stock still available");
        assert(lateCommit.status === "committed", "Status should transition to committed");

        // Case B: Stock exhausted in the meantime -> late payment flags reconciliation
        const orderIdB = new Types.ObjectId();
        await reserveStudioStockForOrder({
          orderId: orderIdB,
          orderNumber: "LATE-ORD-02",
          userId: testUserId,
          cartItems: [
            {
              itemType: "custom_design",
              quantity: 1,
              studioDesign: { beadSequence: [{ variantSku: testSkuB }] }, // SKU B has 1 left
            },
          ],
          paymentMethod: "razorpay",
        });

        // Release SKU B (stock goes back to 1)
        await releaseStudioReservation(orderIdB, "Expired");

        // Another customer buys that last unit of SKU B (stock drops to 0)
        await StudioMaterial.updateOne(
          { "variants.sku": testSkuB },
          { $set: { "variants.$.stock": 0 } }
        );

        // Now orderIdB's late payment arrives!
        const exhaustedCommit = await commitStudioReservation(orderIdB);
        assert(!exhaustedCommit.success, "Late commit must fail to re-reserve when stock is 0");
        assert(exhaustedCommit.status === "reconciliation_required", "Must be flagged for reconciliation");

        const resDocB = await StudioReservation.findOne({ orderId: orderIdB });
        assert(resDocB?.status === "reconciliation_required", "DB status must be reconciliation_required");
      });

      // Test 8: COD placement immediate commitment and cancellation restock
      await runTest("8. COD immediate commitment and cancellation restock", async () => {
        const orderId = new Types.ObjectId();
        // Place COD order reserving 2 of SKU A
        const reservation = await reserveStudioStockForOrder({
          orderId,
          orderNumber: "COD-ORD-01",
          userId: testUserId,
          cartItems: [
            {
              itemType: "custom_design",
              quantity: 2,
              studioDesign: { beadSequence: [{ variantSku: testSkuA }] },
            },
          ],
          paymentMethod: "cod",
        });

        assert(reservation?.status === "committed", "COD reservation should immediately be 'committed'");

        // Customer cancels COD order
        const restockRes = await restockStudioReservation(orderId, "Customer cancelled COD order");
        assert(restockRes.restocked, "Stock should be restocked");

        const resDoc = await StudioReservation.findOne({ orderId });
        assert(resDoc?.status === "restocked", "DB status should be 'restocked'");
      });

      // Test 9: Duplicate events idempotency
      await runTest("9. Duplicate payment callbacks and restock calls are idempotent", async () => {
        const orderId = new Types.ObjectId();
        await reserveStudioStockForOrder({
          orderId,
          orderNumber: "IDEM-ORD-01",
          userId: testUserId,
          cartItems: [
            {
              itemType: "custom_design",
              quantity: 1,
              studioDesign: { beadSequence: [{ variantSku: testSkuA }] },
            },
          ],
          paymentMethod: "razorpay",
        });

        // 1st commit
        await commitStudioReservation(orderId);
        // 2nd commit (duplicate webhook)
        const dupCommit = await commitStudioReservation(orderId);
        assert(dupCommit.message.includes("already committed"), "Duplicate commit handled");

        // 1st restock
        await restockStudioReservation(orderId);
        // 2nd restock (duplicate cancellation event)
        const dupRestock = await restockStudioReservation(orderId);
        assert(dupRestock.restocked === false, "Duplicate restock should not restock twice");
      });

      // Test 10: Expiry cleanup function
      await runTest("10. cleanupExpiredStudioReservations releases only unpaid expired orders", async () => {
        const orderId = new Types.ObjectId();
        // Create an expired reservation in the past
        await StudioReservation.create({
          orderId,
          orderNumber: "EXP-ORD-01",
          userId: testUserId,
          status: "reserved",
          items: [{ materialId: testMaterial._id, materialName: "Test", sku: testSkuA, quantity: 1 }],
          reservedAt: new Date(Date.now() - 40 * 60 * 1000), // 40m ago
          expiresAt: new Date(Date.now() - 10 * 60 * 1000), // 10m ago
        });

        // Decrement stock to simulate active reservation
        await StudioMaterial.updateOne(
          { "variants.sku": testSkuA },
          { $inc: { "variants.$.stock": -1 } }
        );

        const cleanupResult = await cleanupExpiredStudioReservations();
        assert(cleanupResult.released >= 1, "Should have released at least 1 expired reservation");

        const resDoc = await StudioReservation.findOne({ orderId });
        assert(resDoc?.status === "released", "Expired reservation should be 'released'");
      });

      // Test 11: Admin reconciliation actions
      await runTest("11. Admin reconciliation: force_commit and refund_and_release", async () => {
        const orderIdReconcile = new Types.ObjectId();
        const address = {
          fullName: "Admin Test",
          line1: "123 St",
          city: "Chennai",
          state: "Tamil Nadu",
          postalCode: "600001",
          country: "India",
          phone: "9876543210",
        };
        await Order.create({
          _id: orderIdReconcile,
          orderNumber: "REC-ORD-01",
          userId: testUserId,
          status: "processing",
          paymentStatus: "paid",
          items: [],
          subtotal: 500,
          shipping: 0,
          total: 500,
          shippingAddress: address,
          billingAddress: address,
          email: "admin@test.com",
          phone: "9876543210",
          paymentMethod: "razorpay",
        });

        const flaggedRes = await StudioReservation.create({
          orderId: orderIdReconcile,
          orderNumber: "REC-ORD-01",
          userId: testUserId,
          status: "reconciliation_required",
          items: [{ materialId: testMaterial._id, materialName: "Test", sku: testSkuA, quantity: 1 }],
          reservedAt: new Date(),
          expiresAt: new Date(),
        });

        // Admin action 1: force_commit
        const reconciledCommit = await reconcileStudioReservation(flaggedRes._id.toString(), "force_commit", "Manual stock sourced");
        assert(reconciledCommit.status === "committed", "Status should be committed");

        // Admin action 2: refund_and_release
        const reconciledRefund = await reconcileStudioReservation(flaggedRes._id.toString(), "refund_and_release", "Customer refunded");
        assert(reconciledRefund.status === "released", "Status should be released");

        const updatedOrder = await Order.findById(orderIdReconcile);
        assert(updatedOrder?.status === "cancelled", "Order should be cancelled after refund_and_release");

        await Order.deleteOne({ _id: orderIdReconcile });
        await StudioReservation.deleteOne({ _id: flaggedRes._id });
      });

      // Test 12: Standard catalog product stock and mixed checkout safety
      await runTest("12. Standard catalog product stock & mixed cart checkout unaffected", async () => {
        // Create standard catalogue product
        const stdProduct = await Product.create({
          name: "Standard Pearl Earrings",
          slug: `std-pearl-earrings-${Date.now()}`,
          description: "Fine earrings",
          categoryId: new Types.ObjectId(),
          price: 999,
          currency: "INR",
          sku: `STD-PEARL-${Date.now()}`,
          stock: 5,
          lowStockThreshold: 1,
          media: [{ url: "/test.png", isPrimary: true }],
          colors: ["white"],
          materials: ["pearl"],
          tags: ["earrings"],
          isSignaturePiece: false,
          isActive: true,
          isCustomizable: false,
          averageRating: 0,
          reviewCount: 0,
        });

        // Set up cart with standard product
        await Cart.deleteMany({ userId: testUserId });
        await Cart.create({
          userId: testUserId,
          items: [
            {
              itemType: "product",
              productId: stdProduct._id,
              sku: stdProduct.sku,
              name: stdProduct.name,
              unitPrice: 999,
              quantity: 2,
              savedForLater: false,
            },
          ],
        });

        const idempotencyKey = `IDEM-STD-${Date.now()}`;
        const order = await createOrderFromCart(testUserId.toString(), {
          shipping_address: {
            fullName: "Tamil Nadu Tester",
            line1: "123 Anna Salai",
            city: "Chennai",
            state: "Tamil Nadu",
            postalCode: "600002",
            country: "India",
          },
          phone_number: "9876543210",
          email: "tn@example.com",
          payment_method: "cod",
          idempotencyKey,
        });

        assert(order !== null, "Order created");
        assert(order.status === "processing", "COD order should be processing");

        // Standard product stock should have decremented from 5 to 3
        const refreshedProduct = await Product.findById(stdProduct._id);
        assert(refreshedProduct?.stock === 3, `Stock should be 3, got ${refreshedProduct?.stock}`);

        // Retry with same idempotencyKey: must return existing order without further stock decrement
        const retriedOrder = await createOrderFromCart(testUserId.toString(), {
          shipping_address: {
            fullName: "Tamil Nadu Tester",
            line1: "123 Anna Salai",
            city: "Chennai",
            state: "Tamil Nadu",
            postalCode: "600002",
            country: "India",
          },
          phone_number: "9876543210",
          email: "tn@example.com",
          payment_method: "cod",
          idempotencyKey,
        });

        assert(retriedOrder.orderNumber === order.orderNumber, "Retry must return same order");
        const productAfterRetry = await Product.findById(stdProduct._id);
        assert(productAfterRetry?.stock === 3, "Stock should remain 3 after idempotency retry");

        // Cancelling order restores standard product stock back to 5
        await cancelOrder(testUserId.toString(), order.id);
        const productAfterCancel = await Product.findById(stdProduct._id);
        assert(productAfterCancel?.stock === 5, `Stock should be restored to 5 on cancellation, got ${productAfterCancel?.stock}`);

        // Clean up
        await Product.deleteOne({ _id: stdProduct._id });
        await Order.deleteOne({ _id: order._id });
      });

      // Test 13: Failure-injection: stock restoration failure during release reverts reservation state and enables retry
      await runTest("13. Failure-injection: stock restoration failure during release reverts state for unblocked retry", async () => {
        // Ensure test SKU has sufficient stock for clean test isolation
        await StudioMaterial.updateOne(
          { "variants.sku": testSkuA },
          { $set: { "variants.$.stock": 10 } }
        );
        const orderId = new Types.ObjectId();
        await reserveStudioStockForOrder({
          orderId,
          orderNumber: "FAIL-INJECT-REL-01",
          userId: testUserId,
          cartItems: [
            {
              itemType: "custom_design",
              quantity: 1,
              studioDesign: { beadSequence: [{ variantSku: testSkuA }] },
            },
          ],
          paymentMethod: "razorpay",
        });

        // Inject simulated database failure on stock restoration
        const originalUpdateOne = StudioMaterial.updateOne;
        let shouldFail = true;
        try {
          StudioMaterial.updateOne = (async (...args: any[]) => {
            if (shouldFail && args[0]?.["variants.sku"] === testSkuA) {
              throw new Error("Simulated transient DB failure during stock restoration");
            }
            return (originalUpdateOne as any).apply(StudioMaterial, args);
          }) as any;

          let failed = false;
          try {
            await releaseStudioReservation(orderId, "Test failure injection");
          } catch (err: any) {
            failed = true;
          }
          assert(failed, "releaseStudioReservation must throw when stock update fails");

          // Verify state consistency: status must NOT be stuck in "released"
          const intermediateDoc = await StudioReservation.findOne({ orderId });
          assert(
            intermediateDoc?.status === "reserved",
            `Reservation status must remain or revert to 'reserved' to allow retries, got '${intermediateDoc?.status}'`
          );

          // Now simulate database recovery: retry the release
          shouldFail = false;
          const retryResult = await releaseStudioReservation(orderId, "Retry after DB recovery");
          assert(retryResult.released, "Retry must succeed in releasing reservation");

          const finalDoc = await StudioReservation.findOne({ orderId });
          assert(finalDoc?.status === "released", "Final status must be 'released' after successful retry");
        } finally {
          StudioMaterial.updateOne = originalUpdateOne;
        }
      });

      // Test 14: Failure-injection: stock restoration failure during restock reverts reservation state and enables retry
      await runTest("14. Failure-injection: stock restoration failure during restock reverts state for unblocked retry", async () => {
        // Ensure test SKU has sufficient stock for clean test isolation
        await StudioMaterial.updateOne(
          { "variants.sku": testSkuA },
          { $set: { "variants.$.stock": 10 } }
        );
        const orderId = new Types.ObjectId();
        // Create committed reservation (as in confirmed COD order)
        await reserveStudioStockForOrder({
          orderId,
          orderNumber: "FAIL-INJECT-RESTOCK-01",
          userId: testUserId,
          cartItems: [
            {
              itemType: "custom_design",
              quantity: 1,
              studioDesign: { beadSequence: [{ variantSku: testSkuA }] },
            },
          ],
          paymentMethod: "cod",
        });

        const initialDoc = await StudioReservation.findOne({ orderId });
        assert(initialDoc?.status === "committed", "COD reservation should be 'committed'");

        // Inject simulated database failure on stock restoration
        const originalUpdateOne = StudioMaterial.updateOne;
        let shouldFail = true;
        try {
          StudioMaterial.updateOne = (async (...args: any[]) => {
            if (shouldFail && args[0]?.["variants.sku"] === testSkuA) {
              throw new Error("Simulated transient DB failure during restocking");
            }
            return (originalUpdateOne as any).apply(StudioMaterial, args);
          }) as any;

          let failed = false;
          try {
            await restockStudioReservation(orderId, "Test restock failure injection");
          } catch (err: any) {
            failed = true;
          }
          assert(failed, "restockStudioReservation must throw when stock update fails");

          // Verify state consistency: status must NOT be stuck in "restocked"
          const intermediateDoc = await StudioReservation.findOne({ orderId });
          assert(
            intermediateDoc?.status === "committed",
            `Reservation status must remain or revert to 'committed' to allow retries, got '${intermediateDoc?.status}'`
          );

          // Now simulate database recovery: retry the restock
          shouldFail = false;
          const retryResult = await restockStudioReservation(orderId, "Retry restock after DB recovery");
          assert(retryResult.restocked, "Retry must succeed in restocking components");

          const finalDoc = await StudioReservation.findOne({ orderId });
          assert(finalDoc?.status === "restocked", "Final status must be 'restocked' after successful retry");
        } finally {
          StudioMaterial.updateOne = originalUpdateOne;
        }
      });

    } finally {
      // Clean up temporary material, reservations, and admin user
      await StudioMaterial.deleteOne({ _id: testMaterial._id });
      await StudioReservation.deleteMany({ userId: testUserId });
      await User.deleteOne({ _id: testAdminUser._id });
      await Cart.deleteMany({ userId: testUserId });
      await disconnectDatabase();
      console.log("\nDatabase disconnected. Temporary test artifacts cleaned up.");
    }
  }

  // ---------------------------------------------------------------------------
  // Summary
  // ---------------------------------------------------------------------------
  console.log("\n================================================================================");
  console.log("TEST RESULTS SUMMARY");
  console.log("================================================================================");
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  console.log(`Total: ${results.length} | Passed: ${passed} | Failed: ${failed}`);

  if (failed > 0) {
    console.error("Some tests failed!");
    process.exit(1);
  } else {
    console.log("All inventory lifecycle verification tests passed successfully!");
  }
}

main().catch((err) => {
  console.error("Fatal test suite runner error:", err);
  process.exit(1);
});
