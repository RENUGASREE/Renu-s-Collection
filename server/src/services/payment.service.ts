import Razorpay from "razorpay";
import crypto from "crypto";
import { env } from "../config/env.js";
import { Order } from "../models/Order.js";
import { AppError } from "../middleware/errorHandler.js";
import { deductStockForOrder } from "./inventory.service.js";
import { clearCart } from "./cart.service.js";
import { Coupon } from "../models/Coupon.js";

function getClient() {
  if (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET) {
    return null;
  }
  return new Razorpay({
    key_id: env.RAZORPAY_KEY_ID,
    key_secret: env.RAZORPAY_KEY_SECRET,
  });
}

export async function createRazorpayOrder(userId: string, orderId: string, amountRupees: number) {
  const client = getClient();
  const order = await Order.findOne({ _id: orderId, userId });
  if (!order) throw new AppError("Order not found", 404);

  if (!client) {
    order.razorpayOrderId = `dev_order_${order.orderNumber}`;
    await order.save();
    return {
      success: true,
      razorpay_order_id: order.razorpayOrderId,
      amount: Math.round(amountRupees * 100),
      currency: "INR",
      key_id: env.RAZORPAY_KEY_ID ?? "rzp_test_dev",
      name: "Renu's Collections",
      description: `Order #${order.orderNumber}`,
      devMode: true,
    };
  }

  const razorpayOrder = await client.orders.create({
    amount: Math.round(amountRupees * 100),
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

  const client = getClient();
  if (client && env.RAZORPAY_KEY_SECRET) {
    const body = `${input.razorpay_order_id}|${input.razorpay_payment_id}`;
    const expected = crypto
      .createHmac("sha256", env.RAZORPAY_KEY_SECRET)
      .update(body)
      .digest("hex");
    if (expected !== input.razorpay_signature) {
      order.paymentStatus = "failed";
      await order.save();
      throw new AppError("Payment verification failed", 400);
    }
  }

  order.paymentStatus = "paid";
  order.status = "processing";
  order.razorpayPaymentId = input.razorpay_payment_id;
  order.razorpaySignature = input.razorpay_signature;
  order.statusHistory.push({
    status: "processing",
    note: "Payment confirmed via Razorpay",
    changedAt: new Date(),
  });
  await order.save();

  await deductStockForOrder(
    order.items.map((i) => ({ productId: i.productId.toString(), quantity: i.quantity })),
    order.id,
    userId
  );

  if (order.couponCode) {
    await Coupon.updateOne({ code: order.couponCode }, { $inc: { usedCount: 1 } });
  }

  await clearCart(userId);

  return { success: true, order_id: order.id, message: "Payment verified successfully" };
}

export async function recordPaymentFailure(userId: string, orderId: string, reason?: string) {
  const order = await Order.findOne({ _id: orderId, userId });
  if (!order) throw new AppError("Order not found", 404);
  order.paymentStatus = "failed";
  if (reason) order.notes = `${order.notes ?? ""}\nPayment failed: ${reason}`.trim();
  await order.save();
  return { success: true };
}

export async function processRefund(orderId: string, amount?: number, reason?: string) {
  const order = await Order.findById(orderId);
  if (!order) throw new AppError("Order not found", 404);

  if (order.paymentStatus !== "paid") {
    throw new AppError("Cannot refund unpaid order", 400);
  }

  const client = getClient();
  if (!client) {
    // Dev mode: simulate refund
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
