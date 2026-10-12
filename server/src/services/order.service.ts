import { Types } from "mongoose";
import { Order } from "../models/Order.js";
import { User } from "../models/User.js";
import { Coupon } from "../models/Coupon.js";
import { Product } from "../models/Product.js";
import { AppError } from "../middleware/errorHandler.js";
import { generateOrderNumber } from "../utils/helpers.js";
import { getCartItems, clearCart, toLegacyCartItem } from "./cart.service.js";
import { deductStockForOrder } from "./inventory.service.js";
import { customizationService } from "./customization.service.js";
import { env } from "../config/env.js";
import type { IAddress } from "../models/User.js";
import type { ICartItem } from "../models/Cart.js";
import type { OrderStatus } from "../types/index.js";

const SHIPPING_FREE_THRESHOLD = 1000;
const SHIPPING_FLAT = 50;

/**
 * Commerce Tax Configuration
 * Explicitly tied to server-side COMMERCE_MODE:
 * In test mode (COMMERCE_MODE=test):
 *   - order.tax = 0 (Merchandise prices are final selling prices; no unexpected tax added)
 *   - total = (subtotal - discount) + shipping
 * 
 * For future commercial operation:
 *   - Production live commerce remains unactivated pending verified business and tax registration.
 */
export function getCommerceTaxConfig() {
  if (env.COMMERCE_MODE === "test") {
    return {
      mode: "test",
      isGstRegistered: false,
      taxRate: 0,
    };
  }
  // Safe closed default: non-GST registered, 0 tax rate
  return {
    mode: env.COMMERCE_MODE,
    isGstRegistered: false,
    taxRate: 0,
  };
}

export function isTamilNaduState(state?: string): boolean {
  if (!state) return false;
  const normalized = state.trim().toLowerCase().replace(/[\s\-_.]/g, "");
  return normalized === "tamilnadu" || normalized === "tn";
}

export function validateDeliveryEligibility(address: IAddress | { state?: string }) {
  if (!address || !isTamilNaduState(address.state)) {
    throw new AppError(
      "Delivery is currently available only within Tamil Nadu. Please select or enter a Tamil Nadu delivery address.",
      400
    );
  }
}

function parseLegacyAddress(raw: string | IAddress | any): IAddress {
  if (typeof raw === "object" && raw !== null) {
    return {
      fullName: raw.fullName ?? "Customer",
      line1: raw.line1 ?? raw.addressLine1 ?? raw.address ?? "",
      line2: raw.line2 ?? raw.addressLine2 ?? "",
      city: raw.city ?? "",
      postalCode: raw.postalCode ?? raw.pincode ?? raw.zipCode ?? "",
      country: raw.country ?? "India",
      state: raw.state ?? "",
      phone: raw.phone ?? raw.phoneNumber ?? "",
      label: raw.label,
    };
  }

  const str = String(raw || "").trim();
  const parts = str.split(",").map((p) => p.trim());
  // If formatted as "fullName, line1, line2, city, state, postalCode, country" (7 parts)
  // or "fullName, line1, city, state, postalCode, country" (6 parts)
  let state = "";
  if (parts.length >= 6) {
    // Second-to-last or third-to-last is often state before postalCode/country
    // E.g.: [fullName, line1, line2, city, state, postalCode, country] -> state is at index length - 3
    state = parts[parts.length - 3] || "";
  } else if (parts.length >= 4) {
    state = parts[parts.length - 2] || "";
  } else {
    state = parts[2] ?? "";
  }

  return {
    fullName: parts[0] ?? "Customer",
    line1: parts[1] ?? str,
    city: parts.length > 4 ? parts[parts.length - 4] : (parts[2] ?? ""),
    postalCode: parts.length > 2 ? parts[parts.length - 2] : (parts[3] ?? ""),
    country: parts.length > 1 ? parts[parts.length - 1] : "India",
    state: state,
    phone: "",
  };
}

async function validateCoupon(code: string | undefined, subtotal: number) {
  if (!code) return { discount: 0, coupon: null as null };
  const coupon = await Coupon.findOne({ code: code.toUpperCase(), isActive: true });
  if (!coupon) throw new AppError("Invalid coupon code", 400);
  if (coupon.expiresAt && coupon.expiresAt < new Date()) {
    throw new AppError("Coupon expired", 400);
  }
  if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) {
    throw new AppError("Coupon usage limit reached", 400);
  }
  if (subtotal < coupon.minOrderAmount) {
    throw new AppError(`Minimum order amount ₹${coupon.minOrderAmount} required`, 400);
  }

  let discount =
    coupon.type === "percentage"
      ? (subtotal * coupon.value) / 100
      : coupon.value;

  if (coupon.maxDiscount) discount = Math.min(discount, coupon.maxDiscount);
  return { discount, coupon };
}

/**
 * Safeguard for non-commercial test deployments:
 * When COMMERCE_MODE=test, only authorized testing accounts (administrators or
 * accounts specified in TEST_COMMERCE_ALLOWED_EMAILS) are permitted to create orders.
 * This prevents public visitors from accidentally placing test orders (COD or Razorpay)
 * before the boutique officially opens.
 */
async function assertTestCommerceAccess(userId: string): Promise<void> {
  if (env.COMMERCE_MODE === "disabled") {
    throw new AppError("Order placement is currently disabled on this server.", 503);
  }

  if (env.COMMERCE_MODE === "test") {
    // If an allowlist is configured, enforce strict membership.
    // If not configured, default safely to admin-only test ordering.
    const user = await User.findById(userId).select("email role");
    if (!user) throw new AppError("User not found", 401);

    const isExplicitlyAllowed =
      env.testCommerceAllowedEmails.length > 0 &&
      env.testCommerceAllowedEmails.includes(user.email.toLowerCase());

    const isAdmin = user.role === "admin";

    if (!isAdmin && !isExplicitlyAllowed) {
      throw new AppError(
        "Store is currently undergoing private testing prior to launch. Order placement is restricted to authorized testing accounts.",
        403
      );
    }
  }
}

export async function createOrderFromCart(
  userId: string,
  input: {
    shipping_address: string | IAddress | any;
    billing_address?: string | IAddress | any;
    phone_number: string;
    email: string;
    notes?: string;
    payment_method: string;
    couponCode?: string;
  }
) {
  // Enforce testing access safeguard before processing the order
  await assertTestCommerceAccess(userId);

  const cartItems = await getCartItems(userId);
  if (cartItems.length === 0) throw new AppError("Cart is empty", 400);

  const orderItems = [];
  let subtotal = 0;

  for (const item of cartItems) {
    const product = await Product.findById(item.productId);
    if (!product || !product.isActive) {
      throw new AppError(`Product unavailable: ${item.name}`, 400);
    }
    if (product.stock < item.quantity) {
      throw new AppError(`Insufficient stock for ${item.name}`, 400);
    }

    let priceModifier = 0;
    let breakdown: any[] = [];
    if (item.customization?.selections && Object.keys(item.customization.selections).length > 0) {
      try {
        const pricing = await customizationService.calculatePrice(
          item.productId.toString(),
          item.customization.selections as Record<string, string | string[]>
        );
        priceModifier = pricing.priceModifier;
        breakdown = pricing.breakdown;
      } catch (err) {
        priceModifier = item.customization.priceModifier ?? 0;
        breakdown = item.customization.breakdown ?? [];
      }
    } else {
      priceModifier = item.customization?.priceModifier ?? 0;
      breakdown = item.customization?.breakdown ?? [];
    }

    const unitPrice = item.unitPrice + priceModifier;
    const lineSubtotal = unitPrice * item.quantity;
    subtotal += lineSubtotal;

    orderItems.push({
      productId: item.productId,
      sku: item.sku,
      name: item.name,
      imageUrl: item.imageUrl,
      unitPrice,
      quantity: item.quantity,
      subtotal: lineSubtotal,
      customization: item.customization
        ? {
            selections: item.customization.selections,
            previewImageUrl: item.customization.previewImageUrl,
            engraving: item.customization.engraving,
            breakdown,
          }
        : undefined,
    });
  }

  const { discount, coupon } = await validateCoupon(input.couponCode, subtotal);
  const shipping = subtotal - discount >= SHIPPING_FREE_THRESHOLD ? 0 : SHIPPING_FLAT;
  const taxable = Math.max(0, subtotal - discount);
  const taxConfig = getCommerceTaxConfig();
  const tax = taxConfig.isGstRegistered
    ? Math.round(taxable * taxConfig.taxRate * 100) / 100
    : 0;
  const total = Math.round((taxable + tax + shipping) * 100) / 100;

  const shippingAddress = parseLegacyAddress(input.shipping_address);
  shippingAddress.phone = input.phone_number;
  const billingAddress = parseLegacyAddress(input.billing_address ?? input.shipping_address);
  billingAddress.phone = input.phone_number;

  // Enforce Tamil Nadu delivery restriction before creating order
  validateDeliveryEligibility(shippingAddress);

  const order = await Order.create({
    orderNumber: generateOrderNumber(),
    userId: new Types.ObjectId(userId),
    status: "pending",
    paymentStatus: input.payment_method === "cod" ? "pending" : "pending",
    items: orderItems,
    subtotal,
    discount,
    tax,
    shipping,
    total,
    couponCode: coupon?.code,
    shippingAddress,
    billingAddress,
    email: input.email,
    phone: input.phone_number,
    notes: env.COMMERCE_MODE === "test" ? `[TEST ORDER] ${input.notes || ""}`.trim() : input.notes,
    paymentMethod: input.payment_method,
    statusHistory: [{
      status: "pending",
      note: env.COMMERCE_MODE === "test" ? "Test order placed (non-commercial mode)" : "Order placed",
      changedAt: new Date()
    }],
  });

  if (input.payment_method === "cod") {
    await deductStockForOrder(
      orderItems.map((i) => ({ productId: i.productId.toString(), quantity: i.quantity })),
      order.id,
      userId
    );
    order.status = "processing";
    order.statusHistory.push({ status: "processing", note: "COD order confirmed", changedAt: new Date() });
    await order.save();
    if (coupon) {
      coupon.usedCount += 1;
      await coupon.save();
    }
    await clearCart(userId);
  }

  return order;
}

export async function listUserOrders(userId: string) {
  return Order.find({ userId: new Types.ObjectId(userId) })
    .sort({ createdAt: -1 })
    .lean();
}

export async function getOrderById(userId: string, orderId: string) {
  if (!Types.ObjectId.isValid(orderId)) throw new AppError("Invalid order id", 400);
  const order = await Order.findOne({
    _id: orderId,
    userId: new Types.ObjectId(userId),
  }).lean();
  if (!order) throw new AppError("Order not found", 404);
  return order;
}

export async function cancelOrder(userId: string, orderId: string) {
  const order = await Order.findOne({
    _id: orderId,
    userId: new Types.ObjectId(userId),
  });
  if (!order) throw new AppError("Order not found", 404);
  if (!["pending", "processing"].includes(order.status)) {
    throw new AppError("Order cannot be cancelled", 400);
  }
  order.status = "cancelled";
  order.statusHistory.push({ status: "cancelled", changedAt: new Date() });
  await order.save();
  return order;
}

export async function updateOrderStatus(
  orderId: string,
  status: OrderStatus,
  trackingNumber?: string,
  adminId?: string
) {
  const order = await Order.findById(orderId);
  if (!order) throw new AppError("Order not found", 404);
  order.status = status;
  if (trackingNumber) order.trackingNumber = trackingNumber;
  order.statusHistory.push({
    status,
    changedAt: new Date(),
    changedBy: adminId ? new Types.ObjectId(adminId) : undefined,
    note: trackingNumber ? `Tracking: ${trackingNumber}` : undefined,
  });
  await order.save();
  return order;
}

export function toLegacyOrder(order: Record<string, unknown>) {
  return {
    id: (order._id as { toString(): string }).toString(),
    order_number: order.orderNumber,
    status: order.status,
    payment_status: order.paymentStatus === "paid" ? "completed" : order.paymentStatus,
    total_amount: order.total,
    shipping_address: formatAddress(order.shippingAddress),
    billing_address: formatAddress(order.billingAddress),
    phone_number: order.phone,
    email: order.email,
    notes: order.notes,
    created_at: order.createdAt,
    updated_at: order.updatedAt,
    payment_method: order.paymentMethod,
    transaction_id: order.razorpayPaymentId,
    items: (order.items as Record<string, unknown>[])?.map((item) => ({
      id: item._id,
      product_type: String(item.sku).startsWith("BRC") ? "bracelet" : "chain",
      product_id: item.productId,
      product_name: item.name,
      price: item.unitPrice,
      quantity: item.quantity,
      subtotal: item.subtotal,
    })),
  };
}

function formatAddress(addr: unknown): string {
  if (!addr || typeof addr !== "object") return "";
  const a = addr as IAddress;
  return [a.fullName, a.line1, a.city, a.postalCode, a.country].filter(Boolean).join(", ");
}

export async function getLegacyCartForCheckout(userId: string) {
  const items = await getCartItems(userId);
  return items.map((item, idx) => toLegacyCartItem(item as ICartItem & { _id?: Types.ObjectId }, idx));
}
