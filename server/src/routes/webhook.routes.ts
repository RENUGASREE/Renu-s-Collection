import { Router, Request, Response, NextFunction } from "express";
import crypto from "crypto";
import { env } from "../config/env.js";
import { Order } from "../models/Order.js";
import { deductStockForOrder } from "../services/inventory.service.js";
import { commitStudioReservation, releaseStudioReservation } from "../services/studio-inventory.service.js";
import { clearCart } from "../services/cart.service.js";
import { Coupon } from "../models/Coupon.js";

const router = Router();

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

    const body = JSON.stringify(req.body);
    const expected = crypto
      .createHmac("sha256", webhookSecret)
      .update(body)
      .digest("hex");

    if (signature !== expected) {
      return res.status(401).json({ success: false, error: "Invalid signature" });
    }

    const event = req.body;
    const eventType = event.event;
    const payload = event;

    switch (eventType) {
      case "payment.captured":
        await handlePaymentCaptured(payload.payment.entity);
        break;
      
      case "payment.failed":
        await handlePaymentFailed(payload.payment.entity);
        break;
      
      case "refund.processed":
        await handleRefundProcessed(payload.refund.entity);
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
  const order = await Order.findOneAndUpdate(
    { razorpayOrderId, paymentStatus: { $ne: "paid" } },
    {
      $set: {
        paymentStatus: "paid",
        status: "processing",
        razorpayPaymentId,
        razorpaySignature: payment.razorpay_signature,
      },
      $push: {
        statusHistory: {
          status: "processing",
          note: "Payment confirmed via Razorpay webhook",
          changedAt: new Date(),
        },
      },
    },
    { new: true }
  );

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
      order.userId.toString()
    );
  }

  // Commit studio reservation for custom jewelry components
  await commitStudioReservation(order._id);

  // Update coupon usage if applicable
  if (order.couponCode) {
    await Coupon.updateOne({ code: order.couponCode }, { $inc: { usedCount: 1 } });
  }

  // Clear cart
  await clearCart(order.userId.toString());

  console.log(`Payment captured for order ${order.orderNumber}`);
}

async function handlePaymentFailed(payment: any) {
  const razorpayOrderId = payment.order_id;
  const errorCode = payment.error_code;
  const errorDescription = payment.error_description;

  const order = await Order.findOne({ razorpayOrderId: razorpayOrderId });
  
  if (!order) {
    console.error(`Order not found for Razorpay order ID: ${razorpayOrderId}`);
    return;
  }

  order.paymentStatus = "failed";
  order.notes = `${order.notes ?? ""}\nPayment failed: ${errorDescription} (${errorCode})`.trim();
  order.statusHistory.push({
    status: "pending",
    note: `Payment failed: ${errorDescription}`,
    changedAt: new Date(),
  });

  await order.save();

  // Release any reserved studio components back to catalogue
  await releaseStudioReservation(order._id, `Webhook payment failure: ${errorDescription}`);

  console.log(`Payment failed for order ${order.orderNumber}: ${errorDescription}`);
}

async function handleRefundProcessed(refund: any) {
  const razorpayPaymentId = refund.payment_id;
  const refundId = refund.id;
  const amount = refund.amount / 100;

  const order = await Order.findOne({ razorpayPaymentId: razorpayPaymentId });
  
  if (!order) {
    console.error(`Order not found for Razorpay payment ID: ${razorpayPaymentId}`);
    return;
  }

  order.paymentStatus = "refunded";
  order.status = "refunded";
  order.statusHistory.push({
    status: "refunded",
    note: `Refund processed: ₹${amount} (Refund ID: ${refundId})`,
    changedAt: new Date(),
  });

  await order.save();
  console.log(`Refund processed for order ${order.orderNumber}: ₹${amount}`);
}

export default router;
