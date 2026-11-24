/**
 * ============================================================================
 * Payment Service (Phase 3F: PostgreSQL Migration)
 * ============================================================================
 *
 * Implements Razorpay payment operations backed by Supabase PostgreSQL `orders`
 * using `PostgresOrderRepository`.
 *
 * Guarantees:
 * 1. Safe commerce mode assertion and validation against live credentials.
 * 2. Authoritative payment amount verification from persisted order total.
 * 3. Cryptographic HMAC-SHA256 signature verification before any order mutation.
 * 4. Concurrency-safe atomic transition from non-paid -> paid.
 * 5. Tracked, idempotent per-item post-payment fulfillment:
 *    - Product inventory deduction with duplicate-prevention tracking.
 *    - Custom jewelry studio reservation commit.
 *    - Single-winner coupon increment.
 *    - Post-order cart clearing.
 * 6. Clean dependency injection for test isolation without live database writes.
 */

import Razorpay from "razorpay";
import crypto from "crypto";
import { env } from "../config/env.js";
import { AppError } from "../middleware/errorHandler.js";
import { adjustStock } from "./inventory.service.js";
import { commitStudioReservation, releaseStudioReservation } from "./studio-inventory.service.js";
import { clearCart } from "./cart.service.js";
import { redeemCoupon } from "./coupon.service.js";
import { validateDeliveryEligibility } from "./order.service.js";
import { PostgresOrderRepository } from "../repositories/postgres-order.repository.js";
import { PostgresDatabase } from "../db/postgres.js";
import { IDbPool, IOrderRecord } from "../types/database.types.js";

// ---------------------------------------------------------------------------
// Singletons & Dependency Injection
// ---------------------------------------------------------------------------

let activeOrderRepo: PostgresOrderRepository | null = null;
let activePool: IDbPool | null = null;

export function setPaymentOrderRepository(repo: PostgresOrderRepository): void {
  activeOrderRepo = repo;
}

export function setPaymentDatabasePool(pool: IDbPool): void {
  activePool = pool;
  activeOrderRepo = new PostgresOrderRepository(pool);
}

function getOrderRepo(): PostgresOrderRepository {
  if (!activeOrderRepo) {
    if (!activePool) {
      activePool = PostgresDatabase.getPool();
    }
    activeOrderRepo = new PostgresOrderRepository(activePool);
  }
  return activeOrderRepo;
}

// ---------------------------------------------------------------------------
// Commerce Mode Helpers
// ---------------------------------------------------------------------------

function isLiveKey(keyId: string | undefined): boolean {
  return typeof keyId === "string" && keyId.startsWith("rzp_live_");
}

function assertCommerceCredentials(): void {
  if (env.COMMERCE_MODE === "disabled") {
    throw new AppError(
      "Online payments are currently disabled on this server (COMMERCE_MODE=disabled).",
      503
    );
  }

  if (env.COMMERCE_MODE === "test") {
    if (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET) {
      return;
    }
    if (isLiveKey(env.RAZORPAY_KEY_ID)) {
      throw new AppError(
        "Server is in test-commerce mode but live Razorpay credentials are configured. " +
          "Set COMMERCE_MODE=live to enable real transactions, or use test credentials.",
        503
      );
    }
    return;
  }

  if (env.COMMERCE_MODE === "live") {
    if (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET) {
      throw new AppError(
        "Live-commerce mode requires RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET to be set.",
        503
      );
    }
    if (!isLiveKey(env.RAZORPAY_KEY_ID)) {
      throw new AppError(
        "Server is in live-commerce mode but test Razorpay credentials are configured. " +
          "Use live credentials for real transactions.",
        503
      );
    }
    return;
  }
}

function getClient(): Razorpay | null {
  if (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET) {
    return null;
  }
  return new Razorpay({
    key_id: env.RAZORPAY_KEY_ID,
    key_secret: env.RAZORPAY_KEY_SECRET,
  });
}

// ---------------------------------------------------------------------------
// Create Razorpay Order
// ---------------------------------------------------------------------------

export async function createRazorpayOrder(userId: string, orderId: string, _amountRupees?: number) {
  assertCommerceCredentials();

  const client = getClient();
  const orderRepo = getOrderRepo();
  const order = await orderRepo.findById(orderId);
  if (!order || order.userId !== userId) throw new AppError("Order not found", 404);

  // Enforce delivery address eligibility before taking payment
  validateDeliveryEligibility(order.shippingAddress);

  if (order.paymentStatus === "paid") {
    throw new AppError("Order is already paid", 400);
  }

  // Authoritative amount derived strictly from the persisted order total
  const amountPaise = Math.round(order.total * 100);

  if (!client) {
    const devOrderId = `dev_order_${order.orderNumber}`;
    await orderRepo.updateById(order.id, { razorpayOrderId: devOrderId });
    return {
      success: true,
      razorpay_order_id: devOrderId,
      amount: amountPaise,
      currency: "INR",
      key_id: "rzp_test_dev",
      name: "Renu's Collections",
      description: `Order #${order.orderNumber}`,
      devMode: true,
    };
  }

  const razorpayOrder = await client.orders.create({
    amount: amountPaise,
    currency: "INR",
    receipt: order.orderNumber,
    notes: { orderId: order.id, userId },
  });

  await orderRepo.updateById(order.id, { razorpayOrderId: razorpayOrder.id });

  return {
    success: true,
    razorpay_order_id: razorpayOrder.id,
    amount: razorpayOrder.amount,
    currency: razorpayOrder.currency,
    key_id: env.RAZORPAY_KEY_ID,
    name: "Renu's Collections",
    description: `Order #${order.orderNumber}`,
  };
}

// ---------------------------------------------------------------------------
// Verify Razorpay Payment and run Tracked Post-Payment Fulfillment
// ---------------------------------------------------------------------------

export async function verifyRazorpayPayment(
  userId: string,
  input: {
    order_id: string;
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
  }
) {
  const orderRepo = getOrderRepo();
  const order = await orderRepo.findById(input.order_id);
  if (!order || order.userId !== userId) throw new AppError("Order not found", 404);

  // Idempotency: same payment ID already verified -> short-circuit
  if (order.paymentStatus === "paid" && order.razorpayPaymentId === input.razorpay_payment_id) {
    if (order.fulfillmentStatus !== "completed") {
      return runFulfillment(order, userId);
    }
    return { success: true, order_id: order.id, message: "Payment already verified" };
  }

  // Ownership: Razorpay order ID must match what was generated for this order
  if (order.razorpayOrderId && order.razorpayOrderId !== input.razorpay_order_id) {
    throw new AppError("Invalid Razorpay order ID for this order", 400);
  }

  if (env.RAZORPAY_KEY_SECRET) {
    const body = `${input.razorpay_order_id}|${input.razorpay_payment_id}`;
    const expected = crypto
      .createHmac("sha256", env.RAZORPAY_KEY_SECRET)
      .update(body)
      .digest("hex");
    if (expected !== input.razorpay_signature) {
      throw new AppError("Payment verification failed: invalid signature", 400);
    }
  }

  const client = getClient();
  if (client) {
    try {
      const paymentDetails = await client.payments.fetch(input.razorpay_payment_id);
      const expectedPaise = Math.round(order.total * 100);

      if (paymentDetails.amount !== expectedPaise) {
        throw new AppError("Payment amount mismatch with order total", 400);
      }
      if (paymentDetails.currency !== "INR") {
        throw new AppError("Invalid payment currency", 400);
      }
      if (paymentDetails.status !== "captured") {
        throw new AppError(
          `Payment not captured. Current payment status: ${paymentDetails.status}`,
          400
        );
      }
    } catch (err: any) {
      if (err instanceof AppError) throw err;
      console.warn("Could not fetch remote Razorpay payment details:", err?.message);
      throw new AppError(
        "Payment verification gateway temporarily unavailable. Please retry shortly.",
        503
      );
    }
  }

  // Atomic transition: only ONE concurrent caller wins transition from non-paid -> paid
  const updatedOrder = await orderRepo.atomicTransitionToPaid(order.id, {
    razorpayPaymentId: input.razorpay_payment_id,
    razorpaySignature: input.razorpay_signature,
    note: "Payment confirmed via Razorpay",
  });

  if (!updatedOrder) {
    return { success: true, order_id: order.id, message: "Payment already verified" };
  }

  return runFulfillment(updatedOrder, userId);
}

// ---------------------------------------------------------------------------
// Fulfillment: Inventory deduction -> Coupon usage -> Cart clearing
// ---------------------------------------------------------------------------

export async function runFulfillment(
  order: IOrderRecord,
  userId: string
): Promise<{ success: true; order_id: string; message: string; fulfillmentStatus: string }> {
  const orderRepo = getOrderRepo();
  const errors: string[] = [];

  // --- Step 1: Stock deduction (per-item tracking via deductedItemIds)
  {
    const deductedSet = new Set<string>((order.deductedItemIds || []).map(String));

    for (const item of order.items || []) {
      const itemId = item.id ? String(item.id) : null;
      if (itemId && deductedSet.has(itemId)) {
        continue;
      }

      if (!item.productId || item.itemType === "custom_design") {
        continue;
      }

      try {
        await adjustStock({
          productId: item.productId.toString(),
          quantityChange: -item.quantity,
          action: "deduct",
          reason: "Order placement (payment verified)",
          orderId: order.id,
          performedBy: userId,
        });

        if (itemId) {
          await orderRepo.addDeductedItemId(order.id, itemId);
          deductedSet.add(itemId);
        }
      } catch (err: any) {
        const msg = `Inventory deduction failed for product ${item.productId}: ${err?.message}`;
        console.error(`[fulfillment] order ${order.id} — ${msg}`);
        errors.push(msg);
      }
    }

    // --- Step 1b: Commit Studio Reservation (Custom Jewelry Components) ---
    const hasStudioItems = order.studioReservationId || (order.items && order.items.some((i: any) => i.itemType === "custom_design"));
    if (hasStudioItems) {
      try {
        const commitRes = await commitStudioReservation(order.id);
        if (!commitRes.success && commitRes.status === "reconciliation_required") {
          errors.push(commitRes.message);
        }
      } catch (err: any) {
        const msg = `Studio reservation commit error: ${err?.message}`;
        console.error(`[fulfillment] order ${order.id} — ${msg}`);
        errors.push(msg);
      }
    }
  }

  // --- Step 2: Coupon usage increment ---
  const couponCode = order.couponCode;
  const couponAlreadyProcessed = order.couponProcessed === true;

  if (couponCode && !couponAlreadyProcessed) {
    try {
      const wonClaim = await orderRepo.claimCouponProcessed(order.id);
      if (wonClaim) {
        await redeemCoupon(couponCode);
      }
    } catch (err: any) {
      const msg = `Coupon usage increment failed: ${err?.message}`;
      console.error(`[fulfillment] order ${order.id} — ${msg}`);
      errors.push(msg);
    }
  }

  // --- Step 3: Clear cart ---
  const cartAlreadyCleared = order.cartCleared === true;

  if (!cartAlreadyCleared) {
    try {
      const wonClaim = await orderRepo.claimCartCleared(order.id);
      if (wonClaim) {
        await clearCart(userId);
      }
    } catch (err: any) {
      const msg = `Cart clearing failed: ${err?.message}`;
      console.error(`[fulfillment] order ${order.id} — ${msg}`);
      errors.push(msg);
    }
  }

  // --- Persist final fulfillment outcome ---
  const allSucceeded = errors.length === 0;
  const finalStatus = allSucceeded ? "completed" : "requires_action";

  await orderRepo.updateById(order.id, {
    fulfillmentStatus: finalStatus,
    fulfillmentErrors: errors,
  });

  if (!allSucceeded) {
    await orderRepo.appendStatusHistory(order.id, {
      status: "processing",
      note: `Payment captured; fulfillment requires action: ${errors.join("; ")}`,
      changedAt: new Date(),
    });
    console.error(
      `[fulfillment] order ${order.id} requires admin action. Errors: ${errors.join("; ")}`
    );
  }

  return {
    success: true,
    order_id: order.id,
    message: allSucceeded
      ? "Payment verified successfully"
      : "Payment captured; fulfillment pending admin action",
    fulfillmentStatus: finalStatus,
  };
}

/**
 * Retries fulfillment operations for an order whose payment was captured
 * but whose fulfillment previously failed (status: "requires_action").
 * Guaranteed idempotent: skips items already in deductedItemIds,
 * coupons already claimed, and carts already cleared.
 */
export async function retryOrderFulfillment(
  orderId: string,
  userId?: string
): Promise<{ success: boolean; order_id: string; message: string; fulfillmentStatus: string }> {
  const orderRepo = getOrderRepo();
  const order = await orderRepo.findById(orderId);
  if (!order) {
    throw new AppError("Order not found", 404);
  }
  if (order.paymentStatus !== "paid") {
    throw new AppError("Cannot fulfill order: payment status is not paid", 400);
  }
  if (order.fulfillmentStatus === "completed") {
    return {
      success: true,
      order_id: order.id,
      message: "Order fulfillment already completed",
      fulfillmentStatus: "completed",
    };
  }

  // Atomic claim lock with fencing token: prevent concurrent fulfillment runs across multiple instances
  let claimToken: string | undefined;
  if (typeof (orderRepo as any).claimOrderForFulfillment === "function") {
    const claimRes = await (orderRepo as any).claimOrderForFulfillment(order.id);
    const wonClaim = typeof claimRes === "boolean" ? claimRes : claimRes?.claimed;
    claimToken = typeof claimRes === "object" ? claimRes?.claimToken : undefined;

    if (!wonClaim) {
      const refreshed = await orderRepo.findById(order.id);
      return {
        success: refreshed?.fulfillmentStatus === "completed",
        order_id: order.id,
        message: "Fulfillment already in progress or completed by another worker",
        fulfillmentStatus: refreshed?.fulfillmentStatus || "pending",
      };
    }
  }

  try {
    const outcome = await runFulfillment(order, userId || order.userId || "");
    if (claimToken && typeof (orderRepo as any).completeOrderFulfillment === "function") {
      await (orderRepo as any).completeOrderFulfillment(order.id, claimToken);
    }
    return outcome;
  } catch (err: any) {
    if (claimToken && typeof (orderRepo as any).releaseOrderFulfillmentClaim === "function") {
      await (orderRepo as any).releaseOrderFulfillmentClaim(order.id, claimToken, err.message).catch(() => {});
    } else {
      await orderRepo
        .updateById(order.id, {
          fulfillmentStatus: "requires_action",
          fulfillmentErrors: [err.message || "Unexpected fulfillment error"],
        })
        .catch(() => {});
    }
    throw err;
  }
}

/**
 * Reconciles and retries all pending order fulfillments across the system.
 * Designed to run on server boot or administrative scheduled maintenance.
 */
export async function reconcilePendingOrderFulfillments(limit = 50): Promise<{
  processed: number;
  succeeded: number;
  failed: number;
  results: Array<{ orderId: string; orderNumber: string; success: boolean; errors?: string[] }>;
}> {
  const orderRepo = getOrderRepo();
  const pendingOrders = await orderRepo.findOrdersRequiringFulfillment(limit);

  if (pendingOrders.length === 0) {
    return { processed: 0, succeeded: 0, failed: 0, results: [] };
  }

  console.log(`[FulfillmentReconciler] Found ${pendingOrders.length} order(s) requiring fulfillment retry...`);
  const results: Array<{ orderId: string; orderNumber: string; success: boolean; errors?: string[] }> = [];
  let succeeded = 0;
  let failed = 0;

  for (const order of pendingOrders) {
    try {
      const outcome = await retryOrderFulfillment(order.id, order.userId || undefined);
      if (outcome.fulfillmentStatus === "completed") {
        succeeded++;
        results.push({ orderId: order.id, orderNumber: order.orderNumber, success: true });
        console.log(`[FulfillmentReconciler] Successfully completed fulfillment for order ${order.orderNumber} (${order.id}).`);
      } else {
        failed++;
        const refreshed = await orderRepo.findById(order.id);
        const errs = refreshed?.fulfillmentErrors || [];
        results.push({ orderId: order.id, orderNumber: order.orderNumber, success: false, errors: errs });
        console.error(
          `[FulfillmentReconciler] ATTENTION: Order ${order.orderNumber} (${order.id}) requires administrative intervention: ${errs.join("; ")}`
        );
      }
    } catch (err: any) {
      failed++;
      results.push({ orderId: order.id, orderNumber: order.orderNumber, success: false, errors: [err.message] });
      console.error(
        `[FulfillmentReconciler] ATTENTION: Order ${order.orderNumber} (${order.id}) retry failed: ${err.message}`
      );
    }
  }

  return { processed: pendingOrders.length, succeeded, failed, results };
}

// ---------------------------------------------------------------------------
// Record Payment Failure
// ---------------------------------------------------------------------------

export async function recordPaymentFailure(userId: string, orderId: string, reason?: string) {
  const orderRepo = getOrderRepo();
  const order = await orderRepo.findById(orderId);
  if (!order || order.userId !== userId) throw new AppError("Order not found", 404);

  const notes = reason
    ? `${order.notes ?? ""}\nPayment failed: ${reason}`.trim()
    : order.notes;

  await orderRepo.updateById(order.id, {
    paymentStatus: "failed",
    notes,
  });

  const hasStudio = order.studioReservationId || (order.items && order.items.some((i: any) => i.itemType === "custom_design"));
  if (hasStudio) {
    try {
      await releaseStudioReservation(orderId, reason || "Payment failed / dismissed");
    } catch (err) {
      console.error(`[recordPaymentFailure] Studio release error:`, err);
    }
  }

  return { success: true };
}

// ---------------------------------------------------------------------------
// Process Refund (Admin Action)
// ---------------------------------------------------------------------------

export async function processRefund(orderId: string, amount?: number, reason?: string) {
  const orderRepo = getOrderRepo();
  const order = await orderRepo.findById(orderId);
  if (!order) throw new AppError("Order not found", 404);

  if (order.paymentStatus !== "paid") {
    throw new AppError("Cannot refund unpaid order", 400);
  }

  const client = getClient();
  if (!client) {
    await orderRepo.updateById(order.id, {
      paymentStatus: "refunded",
      status: "refunded",
    });
    await orderRepo.appendStatusHistory(order.id, {
      status: "refunded",
      note: reason || "Refund processed (dev mode)",
      changedAt: new Date(),
    });
    return {
      success: true,
      refundId: `dev_refund_${order.orderNumber}`,
      amount: amount || order.total,
    };
  }

  if (!order.razorpayPaymentId) {
    throw new AppError("No Razorpay payment ID found", 400);
  }

  const refundAmount = amount ? Math.round(amount * 100) : Math.round(order.total * 100);

  try {
    const refund = await client.payments.refund(order.razorpayPaymentId, {
      amount: refundAmount,
      notes: { orderId: order.id.toString(), reason: reason || "" },
    });

    const refundId = (refund as any).id || `refund_${Date.now()}`;

    await orderRepo.updateById(order.id, {
      paymentStatus: "refunded",
      status: "refunded",
    });
    await orderRepo.appendStatusHistory(order.id, {
      status: "refunded",
      note: `Refund processed: ₹${(refundAmount / 100).toFixed(2)} (Refund ID: ${refundId})`,
      changedAt: new Date(),
    });

    return { success: true, refundId, amount: refundAmount / 100 };
  } catch (error: any) {
    console.error("Refund error:", error);
    throw new AppError(`Refund failed: ${error.message}`, 400);
  }
}
