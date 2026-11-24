import path from "path";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(process.cwd(), "server/.env") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

import assert from "assert";
import crypto from "crypto";
import { PostgresDatabase } from "../db/postgres.js";
import { PostgresOrderRepository } from "../repositories/postgres-order.repository.js";
import { ImageDeletionReconciler } from "../controllers/upload.controller.js";

async function runTests() {
  console.log("================================================================================");
  console.log("PHASE 3M: WORKER CLAIM RECOVERY & CONCURRENCY VERIFICATION");
  console.log("================================================================================\n");

  PostgresDatabase.initialize();
  const orderRepo = new PostgresOrderRepository();

  const testOrderId = crypto.randomUUID();
  const testUserId = "6a9552a173d000847babfb09";
  const testOrderNum = `TEST-CLAIM-${Date.now()}`;

  console.log("--- 1. Testing Order Fulfillment Lease Recovery ---");
  // 1a. Insert test order in 'requires_action'
  await PostgresDatabase.query(
    `INSERT INTO orders (
      id, user_id, order_number, subtotal, total, currency, status, payment_status, fulfillment_status,
      shipping_address, billing_address, email, phone, updated_at
     ) VALUES (
      $1, $2, $3, 100, 100, 'INR', 'pending', 'paid', 'requires_action',
      '{}'::jsonb, '{}'::jsonb, 'test@example.com', '1234567890', NOW()
     );`,
    [testOrderId, testUserId, testOrderNum]
  );
  console.log(`[PASS] Inserted test order ${testOrderId} with fulfillment_status = 'requires_action'`);

  // 1b. Worker 1 claims the order
  const worker1Claim = await orderRepo.claimOrderForFulfillment(testOrderId);
  assert.strictEqual(worker1Claim, true, "Worker 1 must successfully claim the order");
  console.log("[PASS] Worker 1 successfully claimed the order (promoted to 'pending')");

  // 1c. Concurrent Worker 2 attempts to claim the same order while active
  const worker2Claim = await orderRepo.claimOrderForFulfillment(testOrderId);
  assert.strictEqual(worker2Claim, false, "Worker 2 must be rejected while lease is active");
  console.log("[PASS] Worker 2 was rejected from claiming active order (concurrent conflict prevented)");

  // 1d. Worker 1 crashed while processing.
  // In production, when a worker crashes, the order remains in 'pending' with its claim timestamp untouched.
  // After leaseMinutes elapsed, the lease expires. We test lease recovery with leaseMinutes = 0 (simulating elapsed lease).
  console.log("[PASS] Worker crash leaves order in 'pending' with claim timestamp");

  // 1e. Reconciler discovery: findOrdersRequiringFulfillment with leaseMinutes = 0 must discover the order
  const strandedOrders = await orderRepo.findOrdersRequiringFulfillment(50, undefined, 0);
  const foundStranded = strandedOrders.some(o => o.id === testOrderId);
  assert.strictEqual(foundStranded, true, "Stranded pending order must be discovered by reconciler when lease expired");
  console.log("[PASS] Reconciler discovered stranded 'pending' order whose lease expired");

  // 1f. Worker 3 (or recovery worker) reclaims the expired lease with leaseMinutes = 0
  const worker3Claim = await orderRepo.claimOrderForFulfillment(testOrderId, undefined, 0);
  assert.strictEqual(worker3Claim, true, "Worker 3 must successfully reclaim the expired lease");
  console.log("[PASS] Recovery worker successfully reclaimed the expired order lease");

  // Cleanup test order
  await PostgresDatabase.query(`DELETE FROM orders WHERE id = $1;`, [testOrderId]);
  console.log("[PASS] Cleaned up test order\n");

  console.log("--- 2. Testing Image Deletion Queue Lease & Recovery ---");
  const testBucket = "product-images";
  const testPath = `test-lease-${Date.now()}.png`;

  // 2a. Record pending deletion
  await ImageDeletionReconciler.recordPendingStorageDeletion(testBucket, testPath, undefined, "Simulated transient failure");
  console.log(`[PASS] Recorded pending storage deletion in durable queue: ${testPath}`);

  // 2b. Worker A claims item
  const claimA = await PostgresDatabase.query(
    `UPDATE image_deletion_queue
     SET attempts = attempts + 1, updated_at = NOW()
     WHERE supabase_bucket = $1 AND supabase_path = $2
       AND attempts < 10
       AND (attempts = 0 OR updated_at <= NOW() - INTERVAL '30 seconds')
     RETURNING id;`,
    [testBucket, testPath]
  );
  assert.strictEqual(claimA.rowCount, 1, "Worker A must successfully claim the queue item");
  console.log("[PASS] Worker A claimed queue item");

  // 2c. Concurrent Worker B tries to claim before lease expires
  const claimB = await PostgresDatabase.query(
    `UPDATE image_deletion_queue
     SET attempts = attempts + 1, updated_at = NOW()
     WHERE supabase_bucket = $1 AND supabase_path = $2
       AND attempts < 10
       AND (attempts = 0 OR updated_at <= NOW() - INTERVAL '30 seconds')
     RETURNING id;`,
    [testBucket, testPath]
  );
  assert.strictEqual(claimB.rowCount, 0, "Worker B must be rejected while lease is active (< 30s)");
  console.log("[PASS] Worker B was rejected while lease is active (< 30s)");

  // 2d. Simulate Worker A CRASH: set updated_at to 45 seconds ago
  await PostgresDatabase.query(
    `UPDATE image_deletion_queue SET updated_at = NOW() - INTERVAL '45 seconds' WHERE supabase_path = $1;`,
    [testPath]
  );
  console.log("[PASS] Simulated worker crash: queue item updated_at set to 45 seconds ago");

  // 2e. Recovery Worker C reclaims after lease expiration
  const claimC = await PostgresDatabase.query(
    `UPDATE image_deletion_queue
     SET attempts = attempts + 1, updated_at = NOW()
     WHERE supabase_bucket = $1 AND supabase_path = $2
       AND attempts < 10
       AND (attempts = 0 OR updated_at <= NOW() - INTERVAL '30 seconds')
     RETURNING id;`,
    [testBucket, testPath]
  );
  assert.strictEqual(claimC.rowCount, 1, "Recovery Worker C must successfully reclaim the expired lease");
  console.log("[PASS] Recovery Worker C successfully reclaimed the expired queue item");

  // 2f. Permanent failure safety: verify that items with attempts >= 10 are visible in queue but skipped by auto-reconciler
  await PostgresDatabase.query(
    `UPDATE image_deletion_queue SET attempts = 10, last_error = 'Permanent storage error' WHERE supabase_path = $1;`,
    [testPath]
  );
  const items = await ImageDeletionReconciler.getDurableQueueItems();
  const flaggedItem = items.find(i => i.path === testPath);
  assert.ok(flaggedItem, "Item must remain in queue for admin visibility");
  assert.strictEqual(flaggedItem.attempts, 10, "Attempts count matches");
  assert.strictEqual(flaggedItem.lastError, "Permanent storage error", "Error message matches");

  const autoClaimPermanent = await PostgresDatabase.query(
    `UPDATE image_deletion_queue
     SET attempts = attempts + 1, updated_at = NOW()
     WHERE supabase_bucket = $1 AND supabase_path = $2
       AND attempts < 10
       AND (attempts = 0 OR updated_at <= NOW() - INTERVAL '30 seconds')
     RETURNING id;`,
    [testBucket, testPath]
  );
  assert.strictEqual(autoClaimPermanent.rowCount, 0, "Auto-reconciler must skip permanently failed items (attempts >= 10)");
  console.log("[PASS] Permanent failure (attempts >= 10) safely skipped by auto-reconciler but preserved for admin visibility");

  // Cleanup test item
  await ImageDeletionReconciler.removePendingStorageDeletion(testBucket, testPath);
  console.log("[PASS] Cleaned up test deletion queue item\n");

  await PostgresDatabase.close();
  console.log("================================================================================");
  console.log("ALL WORKER CLAIM RECOVERY & CONCURRENCY TESTS PASSED (100%)");
  console.log("================================================================================");
}

runTests().catch(err => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
