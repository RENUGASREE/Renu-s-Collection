import Razorpay from "razorpay";
import crypto from "crypto";
import { env } from "../config/env.js";
import { Order } from "../models/Order.js";
import { AppError } from "../middleware/errorHandler.js";
import { adjustStock } from "./inventory.service.js";
import { clearCart } from "./cart.service.js";
import { Coupon } from "../models/Coupon.js";
import { validateDeliveryEligibility } from "./order.service.js";

// ---------------------------------------------------------------------------
// Commerce mode helpers
// ---------------------------------------------------------------------------

/**
 * Razorpay test key IDs always start with "rzp_test_".
 * Live key IDs start with "rzp_live_".
 */
function isLiveKey(keyId: string | undefined): boolean {
  return typeof keyId === "string" && keyId.startsWith("rzp_live_");
}

/**
 * Validate that the current Razorpay credentials are compatible with
 * the server's COMMERCE_MODE.
 *
 * COMMERCE_MODE=test  → only test credentials (rzp_test_*) are allowed.
 *                        Live credentials are rejected to prevent real charges.
 * COMMERCE_MODE=live  → live credentials required. (Not currently activated.)
 * COMMERCE_MODE=disabled → all Razorpay transactions are blocked.
 *
 * Fails closed: missing or incompatible configuration blocks the payment.
 */
function assertCommerceCredentials(): void {
  if (env.COMMERCE_MODE === "disabled") {
    throw new AppError(
      "Online payments are currently disabled on this server (COMMERCE_MODE=disabled).",
      503
    );
  }

  if (env.COMMERCE_MODE === "test") {
    if (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET) {
      // No credentials supplied at all — simulate offline test mode (handled
      // in createRazorpayOrder by returning a devMode stub). Allowed.
      return;
    }
    if (isLiveKey(env.RAZORPAY_KEY_ID)) {
      // Live credentials detected while COMMERCE_MODE=test → fail closed.
      throw new AppError(
        "Server is in test-commerce mode but live Razorpay credentials are configured. " +
          "Set COMMERCE_MODE=live to enable real transactions, or use test credentials.",
        503
      );
    }
    // Test key is present and matches mode — OK.
    return;
  }

  if (env.COMMERCE_MODE === "live") {
    // Live mode is not yet intentionally activated for this deployment.
    // Guard: require live credentials to be explicitly configured.
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
// Create Razorpay order
// ---------------------------------------------------------------------------

export async function createRazorpayOrder(userId: string, orderId: string, _amountRupees?: number) {
  // Validate commerce mode before initiating any payment.
  assertCommerceCredentials();

  const client = getClient();
  const order = await Order.findOne({ _id: orderId, userId });
  if (!order) throw new AppError("Order not found", 404);

  // Enforce delivery address eligibility before taking payment.
  validateDeliveryEligibility(order.shippingAddress);

  if (order.paymentStatus === "paid") {
    throw new AppError("Order is already paid", 400);
  }

  // Authoritative amount derived strictly from the persisted order total.
  const amountPaise = Math.round(order.total * 100);

  if (!client) {
    // No credentials configured: return a test stub so UI can exercise the
    // checkout flow without hitting Razorpay.
    order.razorpayOrderId = `dev_order_${order.orderNumber}`;
    await order.save();
    return {
      success: true,
      razorpay_order_id: order.razorpayOrderId,
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

  order.razorpayOrderId = razorpayOrder.id;
  await order.save();

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
// Verify Razorpay payment and run tracked post-payment fulfillment
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
  const order = await Order.findOne({ _id: input.order_id, userId });
  if (!order) throw new AppError("Order not found", 404);

  // Idempotency: same payment ID already verified → short-circuit.
  if (order.paymentStatus === "paid" && order.razorpayPaymentId === input.razorpay_payment_id) {
    // If fulfillment was previously incomplete, resume it instead of returning early.
    if (order.fulfillmentStatus !== "completed") {
      return runFulfillment(order, userId);
    }
    return { success: true, order_id: order.id, message: "Payment already verified" };
  }

  // Ownership: the Razorpay order ID must match what was generated for this order.
  if (order.razorpayOrderId && order.razorpayOrderId !== input.razorpay_order_id) {
    throw new AppError("Invalid Razorpay order ID for this order", 400);
  }

  const client = getClient();
  if (client && env.RAZORPAY_KEY_SECRET) {
    // Signature verification — do not mutate order state on failure so it remains retryable.
    const body = `${input.razorpay_order_id}|${input.razorpay_payment_id}`;
    const expected = crypto
      .createHmac("sha256", env.RAZORPAY_KEY_SECRET)
      .update(body)
      .digest("hex");
    if (expected !== input.razorpay_signature) {
      throw new AppError("Payment verification failed: invalid signature", 400);
    }

    try {
      // Fetch canonical payment details from Razorpay to verify amount, currency, and capture.
      const paymentDetails = await client.payments.fetch(input.razorpay_payment_id);
      const expectedPaise = Math.round(order.total * 100);

      if (paymentDetails.amount !== expectedPaise) {
        throw new AppError("Payment amount mismatch with order total", 400);
      }
      if (paymentDetails.currency !== "INR") {
        throw new AppError("Invalid payment currency", 400);
      }
      // An authorized-but-uncaptured payment must NOT mark an order paid or deduct stock.
      if (paymentDetails.status !== "captured") {
        throw new AppError(
          `Payment not captured. Current payment status: ${paymentDetails.status}`,
          400
        );
      }
    } catch (err: any) {
      if (err instanceof AppError) throw err;
      // Transient gateway failure — do NOT corrupt payment state.
      console.warn("Could not fetch remote Razorpay payment details:", err?.message);
      throw new AppError(
        "Payment verification gateway temporarily unavailable. Please retry shortly.",
        503
      );
    }
  }

  // Atomic transition: only ONE concurrent caller wins the transition from non-paid → paid.
  const updatedOrder = await Order.findOneAndUpdate(
    { _id: order._id, paymentStatus: { $ne: "paid" } },
    {
      $set: {
        paymentStatus: "paid",
        status: "processing",
        razorpayPaymentId: input.razorpay_payment_id,
        razorpaySignature: input.razorpay_signature,
        fulfillmentStatus: "pending",
      },
      $push: {
        statusHistory: {
          status: "processing",
          note: "Payment confirmed via Razorpay",
          changedAt: new Date(),
        },
      },
    },
    { new: true }
  );

  if (!updatedOrder) {
    // Concurrent request already won the race.
    return { success: true, order_id: order.id, message: "Payment already verified" };
  }

  return runFulfillment(updatedOrder, userId);
}

// ---------------------------------------------------------------------------
// Fulfillment: inventory deduction → coupon usage → cart clearing
// Each step is independently idempotent and tracked on the Order document.
// ---------------------------------------------------------------------------

async function runFulfillment(
  order: Awaited<ReturnType<typeof Order.findOneAndUpdate>> & {},
  userId: string
): Promise<{ success: true; order_id: string; message: string; fulfillmentStatus: string }> {
  const errors: string[] = [];

  // --- Step 1: Stock deduction — per-item idempotency via Order item ID + InventoryLog
  //
  // Durable per-item tracking: Each order item has its own unique subdocument _id.
  // We check order.deductedItemIds (and InventoryLog) to prevent double deductions,
  // allowing a partially fulfilled multi-item order to resume seamlessly.
  {
    const deductedSet = new Set<string>(
      ((order as any).deductedItemIds || []).map((id: any) => id.toString())
    );

    for (const item of (order as any).items || []) {
      const itemSubdocId = item._id ? item._id.toString() : null;

      // Skip if this specific line item was already recorded as deducted on the order
      if (itemSubdocId && deductedSet.has(itemSubdocId)) {
        continue;
      }

      try {
        await adjustStock({
          productId: item.productId.toString(),
          quantityChange: -item.quantity,
          action: "deduct",
          reason: "Order placement (payment verified)",
          orderId: (order as any).id,
          performedBy: userId,
        });

        if (itemSubdocId) {
          await Order.updateOne(
            { _id: (order as any)._id },
            { $addToSet: { deductedItemIds: itemSubdocId } }
          );
          deductedSet.add(itemSubdocId);
        }
      } catch (err: any) {
        const msg = `Inventory deduction failed for product ${item.productId}: ${err?.message}`;
        console.error(`[fulfillment] order ${(order as any).id} — ${msg}`);
        errors.push(msg);
        // Continue to attempt remaining items — do not abort the whole loop.
      }
    }
  }

  // --- Step 2: Coupon usage increment (idempotent via single-winner Order claim) --
  const couponCode = (order as any).couponCode;
  const couponAlreadyProcessed = (order as any).couponProcessed === true;

  if (couponCode && !couponAlreadyProcessed) {
    try {
      // Atomically claim the coupon processing on the Order first to eliminate duplicate increment risk
      const claimResult = await Order.findOneAndUpdate(
        { _id: (order as any)._id, couponProcessed: { $ne: true } },
        { $set: { couponProcessed: true } },
        { new: true }
      );

      if (claimResult) {
        await Coupon.updateOne({ code: couponCode }, { $inc: { usedCount: 1 } });
      }
    } catch (err: any) {
      const msg = `Coupon usage increment failed: ${err?.message}`;
      console.error(`[fulfillment] order ${(order as any).id} — ${msg}`);
      errors.push(msg);
    }
  }

  // --- Step 3: Clear cart (idempotent via cartCleared flag) ------------------
  const cartAlreadyCleared = (order as any).cartCleared === true;

  if (!cartAlreadyCleared) {
    try {
      await clearCart(userId);
      await Order.updateOne({ _id: (order as any)._id }, { $set: { cartCleared: true } });
    } catch (err: any) {
      const msg = `Cart clearing failed: ${err?.message}`;
      console.error(`[fulfillment] order ${(order as any).id} — ${msg}`);
      errors.push(msg);
    }
  }

  // --- Persist final fulfillment outcome ------------------------------------
  const allSucceeded = errors.length === 0;
  const finalStatus = allSucceeded ? "completed" : "requires_action";

  const updatePayload: Record<string, any> = {
    $set: { fulfillmentStatus: finalStatus },
  };

  if (!allSucceeded) {
    updatePayload.$push = {
      fulfillmentErrors: { $each: errors },
      statusHistory: {
        status: "processing",
        note: `Payment captured; fulfillment requires action: ${errors.join("; ")}`,
        changedAt: new Date(),
      },
    };
    console.error(
      `[fulfillment] order ${(order as any).id} requires admin action. Errors: ${errors.join("; ")}`
    );
  }

  await Order.updateOne({ _id: (order as any)._id }, updatePayload);

  return {
    success: true,
    order_id: (order as any).id,
    message: allSucceeded ? "Payment verified successfully" : "Payment captured; fulfillment pending admin action",
    fulfillmentStatus: finalStatus,
  };
}

// ---------------------------------------------------------------------------
// Record payment failure (COD-unrelated; called by client on Razorpay dismiss)
// ---------------------------------------------------------------------------

export async function recordPaymentFailure(userId: string, orderId: string, reason?: string) {
  const order = await Order.findOne({ _id: orderId, userId });
  if (!order) throw new AppError("Order not found", 404);
  order.paymentStatus = "failed";
  if (reason) order.notes = `${order.notes ?? ""}\nPayment failed: ${reason}`.trim();
  await order.save();
  return { success: true };
}

// ---------------------------------------------------------------------------
// Refund (admin action)
// ---------------------------------------------------------------------------

export async function processRefund(orderId: string, amount?: number, reason?: string) {
  const order = await Order.findById(orderId);
  if (!order) throw new AppError("Order not found", 404);

  if (order.paymentStatus !== "paid") {
    throw new AppError("Cannot refund unpaid order", 400);
  }

  const client = getClient();
  if (!client) {
    // No credentials: simulate refund (dev/test mode).
    order.paymentStatus = "refunded";
    order.status = "refunded";
    order.statusHistory.push({
      status: "refunded",
      note: reason || "Refund processed (dev mode)",
      changedAt: new Date(),
    });
    await order.save();
    return { success: true, refundId: `dev_refund_${order.orderNumber}`, amount: amount || order.total };
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

    order.paymentStatus = "refunded";
    order.status = "refunded";
    order.statusHistory.push({
      status: "refunded",
      note: `Refund processed: ₹${(refundAmount / 100).toFixed(2)} (Refund ID: ${refundId})`,
      changedAt: new Date(),
    });
    await order.save();

    return { success: true, refundId, amount: refundAmount / 100 };
  } catch (error: any) {
    console.error("Refund error:", error);
    throw new AppError(`Refund failed: ${error.message}`, 400);
  }
}
