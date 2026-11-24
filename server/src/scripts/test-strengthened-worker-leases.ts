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
  console.log("PHASE 3M.1: STRENGTHENED WORKER LEASE & FENCING TOKEN CONCURRENCY TESTS");
  console.log("================================================================================\n");

  PostgresDatabase.initialize();
  const orderRepo = new PostgresOrderRepository();

  const testOrderId = crypto.randomUUID();
  const testUserId = "6a9552a173d000847babfb09";
  const testOrderNum = `TEST-LEASE-${Date.now()}`;

  const testBucket = "product-images";
  const testQueuePath = `test-lease-img-${Date.now()}.png`;

  try {
    console.log("--- TEST GROUP 1: ORDER FULFILLMENT WORKER LEASES & FENCING ---");

    // 1. Setup: Insert test order in 'requires_action'
    await PostgresDatabase.query(
      `INSERT INTO orders (
        id, user_id, order_number, subtotal, total, currency, status, payment_status, fulfillment_status,
        shipping_address, billing_address, email, phone, updated_at
       ) VALUES (
        $1, $2, $3, 200, 200, 'INR', 'pending', 'paid', 'requires_action',
        '{}'::jsonb, '{}'::jsonb, 'test@example.com', '1234567890', NOW()
       );`,
      [testOrderId, testUserId, testOrderNum]
    );
    console.log(`[PASS 1.1] Inserted order ${testOrderId} in requires_action status`);

    // 2. Scenario 1: Two workers claiming simultaneously
    const worker1Claim = await orderRepo.claimOrderForFulfillment(testOrderId, undefined, 5);
    assert.strictEqual(worker1Claim.claimed, true, "Worker 1 claim must succeed");
    assert.ok(worker1Claim.claimToken, "Worker 1 must receive a claim token");
    console.log(`[PASS 1.2] Worker 1 claimed order with token: ${worker1Claim.claimToken?.slice(0, 8)}...`);

    const worker2Claim = await orderRepo.claimOrderForFulfillment(testOrderId, undefined, 5);
    assert.strictEqual(worker2Claim.claimed, false, "Concurrent Worker 2 claim must be rejected");
    assert.strictEqual(worker2Claim.claimToken, undefined, "Worker 2 must not receive a claim token");
    console.log("[PASS 1.3] Worker 2 rejected while Worker 1 holds active lease (mutual exclusion)");

    // 3. Scenario 2: Worker 1 extends its lease (heartbeat / renewal)
    const renewed = await orderRepo.extendOrderFulfillmentLease(testOrderId, worker1Claim.claimToken!, 10);
    assert.strictEqual(renewed, true, "Worker 1 lease extension must succeed with valid token");
    console.log("[PASS 1.4] Worker 1 extended its lease successfully (heartbeat)");

    const invalidRenew = await orderRepo.extendOrderFulfillmentLease(testOrderId, "invalid-token", 10);
    assert.strictEqual(invalidRenew, false, "Lease extension with invalid token must fail");
    console.log("[PASS 1.5] Lease extension rejected for invalid token");

    // 4. Scenario 3: Worker 1 runs longer than original lease (lease expires)
    // Explicitly expire the claim timestamp in DB (no dependency on updated_at!)
    await PostgresDatabase.query(
      `UPDATE orders SET claim_expires_at = NOW() - INTERVAL '1 second' WHERE id = $1;`,
      [testOrderId]
    );
    console.log("[PASS 1.6] Simulated elapsed lease: claim_expires_at set to past");

    // 5. Scenario 4: An expired lease is discovered by reconciler and reclaimed by Worker 3
    const stranded = await orderRepo.findOrdersRequiringFulfillment(50, undefined, 5);
    assert.ok(stranded.some(o => o.id === testOrderId), "Reconciler discovers expired order");
    console.log("[PASS 1.7] Reconciler discovered order with expired claim_expires_at");

    const worker3Claim = await orderRepo.claimOrderForFulfillment(testOrderId, undefined, 5);
    assert.strictEqual(worker3Claim.claimed, true, "Worker 3 successfully reclaims expired lease");
    assert.notStrictEqual(worker3Claim.claimToken, worker1Claim.claimToken, "Worker 3 receives a fresh claim token");
    console.log(`[PASS 1.8] Worker 3 reclaimed order with new token: ${worker3Claim.claimToken?.slice(0, 8)}...`);

    // 6. Scenario 5: FENCING TEST - Old Worker 1 attempts completion after lease reclaimed
    const oldWorkerCompletion = await orderRepo.completeOrderFulfillment(testOrderId, worker1Claim.claimToken!);
    assert.strictEqual(oldWorkerCompletion, false, "Old worker completion MUST BE REJECTED by fencing token");
    console.log("[PASS 1.9] Fencing token blocked zombie Worker 1 from completing reclaimed order");

    // 6b. Scenario 5b: FENCING TEST - Old Worker 1 attempts failure/release after lease reclaimed
    const oldWorkerFailure = await orderRepo.releaseOrderFulfillmentClaim(testOrderId, worker1Claim.claimToken!, "Zombie worker failure");
    assert.strictEqual(oldWorkerFailure, false, "Old worker failure/release MUST BE REJECTED by fencing token");
    console.log("[PASS 1.10] Fencing token blocked zombie Worker 1 from releasing reclaimed order");

    // 7. Scenario 6: Active Worker 3 completes fulfillment successfully
    const worker3Completion = await orderRepo.completeOrderFulfillment(testOrderId, worker3Claim.claimToken!);
    assert.strictEqual(worker3Completion, true, "Active Worker 3 completion must succeed");

    const finishedOrder = await orderRepo.findById(testOrderId);
    assert.strictEqual(finishedOrder?.fulfillmentStatus, "completed", "Order status is completed");
    assert.strictEqual((finishedOrder as any).claimToken, undefined, "Claim token cleared on completion");
    console.log("[PASS 1.11] Active Worker 3 completed order and cleared lease metadata\n");

    console.log("--- TEST GROUP 2: IMAGE DELETION QUEUE WORKER LEASES & FENCING ---");

    // 8. Record pending deletion in durable queue
    await ImageDeletionReconciler.recordPendingStorageDeletion(testBucket, testQueuePath, undefined, "Testing worker lease");
    console.log(`[PASS 2.1] Recorded queue item for ${testQueuePath}`);

    // 9. Two workers claiming queue item simultaneously
    const claimA = await ImageDeletionReconciler.claimItem(testBucket, testQueuePath, 30);
    assert.strictEqual(claimA.claimed, true, "Worker A claim succeeds");
    assert.ok(claimA.claimToken, "Worker A receives a claim token");
    console.log(`[PASS 2.2] Worker A claimed queue item with token: ${claimA.claimToken?.slice(0, 8)}...`);

    const claimB = await ImageDeletionReconciler.claimItem(testBucket, testQueuePath, 30);
    assert.strictEqual(claimB.claimed, false, "Worker B claim rejected while Worker A holds active lease");
    console.log("[PASS 2.3] Concurrent Worker B rejected (queue mutual exclusion)");

    // 10. Worker A extends lease
    const extA = await ImageDeletionReconciler.extendLease(testBucket, testQueuePath, claimA.claimToken!, 60);
    assert.strictEqual(extA, true, "Worker A lease extension succeeds");
    console.log("[PASS 2.4] Worker A extended queue lease");

    // 11. Worker A lease expires
    await PostgresDatabase.query(
      `UPDATE image_deletion_queue SET claim_expires_at = NOW() - INTERVAL '1 second' WHERE supabase_path = $1;`,
      [testQueuePath]
    );
    console.log("[PASS 2.5] Queue claim_expires_at expired");

    // 12. Recovery Worker C reclaims
    const claimC = await ImageDeletionReconciler.claimItem(testBucket, testQueuePath, 30);
    assert.strictEqual(claimC.claimed, true, "Recovery Worker C reclaims expired queue lease");
    console.log(`[PASS 2.6] Recovery Worker C reclaimed queue item with token: ${claimC.claimToken?.slice(0, 8)}...`);

    // 13. Fencing: Old Worker A attempts to complete (delete from queue)
    const oldComplete = await ImageDeletionReconciler.completeItem(testBucket, testQueuePath, claimA.claimToken!);
    assert.strictEqual(oldComplete, false, "Old Worker A completion MUST BE REJECTED by fencing token");
    console.log("[PASS 2.7] Fencing token blocked zombie Worker A from deleting reclaimed queue entry");

    // 13b. Fencing: Old Worker A attempts to release/fail after lease reclaimed
    const oldRelease = await ImageDeletionReconciler.releaseItem(testBucket, testQueuePath, claimA.claimToken!, "Zombie queue failure");
    assert.strictEqual(oldRelease, false, "Old Worker A release MUST BE REJECTED by fencing token");
    console.log("[PASS 2.8] Fencing token blocked zombie Worker A from releasing reclaimed queue entry");

    // 14. Active Worker C completes item
    const validComplete = await ImageDeletionReconciler.completeItem(testBucket, testQueuePath, claimC.claimToken!);
    assert.strictEqual(validComplete, true, "Active Worker C completed and removed queue item");
    console.log("[PASS 2.9] Active Worker C successfully removed queue item\n");

  } finally {
    // 15. GUARANTEED CLEANUP IN FINALLY BLOCK
    await PostgresDatabase.query("DELETE FROM orders WHERE id = $1;", [testOrderId]);
    await ImageDeletionReconciler.removePendingStorageDeletion(testBucket, testQueuePath);
    console.log("[PASS] Guaranteed cleanup: removed test order and test deletion queue records");
    await PostgresDatabase.close();
  }

  console.log("================================================================================");
  console.log("ALL 20 STRENGTHENED WORKER LEASE & FENCING ASSERTIONS PASSED (100%)");
  console.log("================================================================================");
}

runTests().catch(err => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
