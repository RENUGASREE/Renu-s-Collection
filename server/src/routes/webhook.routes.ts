import { Router, Request, Response, NextFunction } from "express";
import crypto from "crypto";
import { env } from "../config/env.js";
import { PostgresOrderRepository } from "../repositories/postgres-order.repository.js";
import { deductStockForOrder } from "../services/inventory.service.js";
import { commitStudioReservation, releaseStudioReservation } from "../services/studio-inventory.service.js";
import { clearCart } from "../services/cart.service.js";
import { redeemCoupon } from "../services/coupon.service.js";

const router = Router();
const orderRepo = new PostgresOrderRepository();

// Razorpay webhook endpoint
router.post("/razorpay", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const signature = req.headers["x-razorpay-signature"] as string;
    if (!signature) {
      return res.status(400).json({ success: false, error: "Missing signature" });
    }

    const webhookSecret = env.RAZORPAY_WEBHOOK_SECRET;
    if (!webhookSecret) {
      return res.status(500).json({ success: false, error: "Webhook secret not configured" });
    }

    // Use original raw request body bytes captured prior to JSON parsing
    const rawBody: Buffer =
      req.rawBody ||
      (typeof req.body === "string"
        ? Buffer.from(req.body, "utf8")
        : Buffer.from(JSON.stringify(req.body), "utf8"));

    const expected = crypto
      .createHmac("sha256", webhookSecret)
      .update(rawBody)
      .digest("hex");

    const signatureBuffer = Buffer.from(signature, "utf8");
    const expectedBuffer = Buffer.from(expected, "utf8");

    const isMatch =
      signatureBuffer.length === expectedBuffer.length &&
      crypto.timingSafeEqual(signatureBuffer, expectedBuffer);

    if (!isMatch) {
      return res.status(401).json({ success: false, error: "Invalid signature" });
    }

    const event = req.body;
    const eventType = event.event;
    const payload = event;

    switch (eventType) {
      case "payment.captured":
        await handlePaymentCaptured(payload.payment?.entity || event.payload?.payment?.entity);
        break;
      
      case "payment.failed":
        await handlePaymentFailed(payload.payment?.entity || event.payload?.payment?.entity);
        break;
      
      case "refund.processed":
        await handleRefundProcessed(payload.refund?.entity || event.payload?.refund?.entity);
        break;
      
      default:
        console.log(`Unhandled webhook event: ${eventType}`);
    }

    return res.json({ success: true });
  } catch (error) {
    next(error);
    return;
  }
});

async function handlePaymentCaptured(payment: any) {
  const razorpayOrderId = payment.order_id;
  const razorpayPaymentId = payment.id;

  // Atomic transition: only ONE concurrent caller (webhook or browser verification) wins
  const order = await orderRepo.atomicTransitionToPaidByRazorpayOrderId(razorpayOrderId, {
    razorpayPaymentId,
    razorpaySignature: payment.razorpay_signature,
    note: "Payment confirmed via Razorpay webhook",
  });

  if (!order) {
    console.log(`Order with Razorpay order ID ${razorpayOrderId} already paid or not found, skipping webhook processing`);
    return;
  }

  // Deduct stock for standard products
  const productItems = order.items
    .filter((i) => i.productId && (i as any).itemType !== "custom_design")
    .map((i) => ({ productId: i.productId!.toString(), quantity: i.quantity }));
  if (productItems.length > 0) {
    await deductStockForOrder(
      productItems,
      order.id,
      order.userId || ""
    );
  }

  // Commit studio reservation for custom jewelry components
  await commitStudioReservation(order.id);

  // Update coupon usage if applicable
  if (order.couponCode) {
    const wonCoupon = await orderRepo.claimCouponProcessed(order.id);
    if (wonCoupon) {
      await redeemCoupon(order.couponCode);
    }
  }

  // Clear cart
  if (order.userId) {
    const wonCart = await orderRepo.claimCartCleared(order.id);
    if (wonCart) {
      await clearCart(order.userId);
    }
  }

  console.log(`Payment captured for order ${order.orderNumber}`);
}

async function handlePaymentFailed(payment: any) {
  const razorpayOrderId = payment.order_id;
  const errorCode = payment.error_code;
  const errorDescription = payment.error_description;

  const order = await orderRepo.findByRazorpayOrderId(razorpayOrderId);
  
  if (!order) {
    console.error(`Order not found for Razorpay order ID: ${razorpayOrderId}`);
    return;
  }

  const notes = `${order.notes ?? ""}\nPayment failed: ${errorDescription} (${errorCode})`.trim();
  await orderRepo.updateById(order.id, {
    paymentStatus: "failed",
    notes,
  });

  await orderRepo.appendStatusHistory(order.id, {
    status: "pending",
    note: `Payment failed: ${errorDescription}`,
    changedAt: new Date(),
  });

  // Release any reserved studio components back to catalogue
  await releaseStudioReservation(order.id, `Webhook payment failure: ${errorDescription}`);

  console.log(`Payment failed for order ${order.orderNumber}: ${errorDescription}`);
}

async function handleRefundProcessed(refund: any) {
  const razorpayPaymentId = refund.payment_id;
  const refundId = refund.id;
  const amount = refund.amount / 100;

  const order = await orderRepo.findByRazorpayPaymentId(razorpayPaymentId);
  
  if (!order) {
    console.error(`Order not found for Razorpay payment ID: ${razorpayPaymentId}`);
    return;
  }

  await orderRepo.updateById(order.id, {
    paymentStatus: "refunded",
    status: "refunded",
  });

  await orderRepo.appendStatusHistory(order.id, {
    status: "refunded",
    note: `Refund processed: ₹${amount} (Refund ID: ${refundId})`,
    changedAt: new Date(),
  });

  console.log(`Refund processed for order ${order.orderNumber}: ₹${amount}`);
}

export default router;
