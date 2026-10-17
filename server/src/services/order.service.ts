import { Types } from "mongoose";
import crypto from "crypto";
import { Order } from "../models/Order.js";
import { User } from "../models/User.js";
import { Coupon } from "../models/Coupon.js";
import { Product } from "../models/Product.js";
import { AppError } from "../middleware/errorHandler.js";
import { generateOrderNumber } from "../utils/helpers.js";
import { getCartItems, clearCart, toLegacyCartItem, getOrCreateCart } from "./cart.service.js";
import { deductStockForOrder, adjustStock } from "./inventory.service.js";
import {
  validateCustomDesignStock,
  reserveStudioStockForOrder,
  restockStudioReservation,
} from "./studio-inventory.service.js";
import { customizationService } from "./customization.service.js";
import { calculateDesignPrice } from "./studio.service.js";
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

function normalizeAddressForFingerprint(addr: IAddress): string {
  const norm = (s?: string) => (s || "").trim().toLowerCase();
  return [
    norm(addr.fullName),
    norm(addr.line1),
    norm(addr.line2),
    norm(addr.city),
    norm(addr.state),
    norm(addr.postalCode),
    norm(addr.country),
  ].join("|");
}

function isAddressMatching(a: IAddress, b: IAddress): boolean {
  const norm = (s?: string) => (s || "").trim().toLowerCase();
  return (
    norm(a.line1) === norm(b.line1) &&
    norm(a.city) === norm(b.city) &&
    norm(a.state) === norm(b.state) &&
    norm(a.postalCode) === norm(b.postalCode)
  );
}

function serializeCustomDesignForFingerprint(item: any, includePrice: boolean): string {
  const sd = item.studioDesign;
  const jType = sd?.jewelleryType || "bracelet";
  const cType = sd?.constructionType || "elastic_bead";
  const wrist = sd?.wristMm || 0;
  // Preserve ordered bead sequence; fall back to aggregate components if beadSequence is unavailable
  const beads =
    sd?.beadSequence && sd.beadSequence.length > 0
      ? sd.beadSequence
          .map((b: any, idx: number) => `${idx}:${b.variantSku || b.materialId || ""}`)
          .join(",")
      : (sd?.components || [])
          .map((c: any) => `${c.variantSku}:${c.quantity}`)
          .sort()
          .join(",");
  // Preserve charm-to-bead attachment relationships (anchorInstanceId)
  const charms = (sd?.charms || [])
    .map((c: any) => `${c.variantSku || c.materialId || ""}@${c.anchorInstanceId || ""}`)
    .sort()
    .join(",");

  const pricePart = includePrice ? `:${item.unitPrice}` : "";
  return `custom:${item.quantity}${pricePart}:${jType}:${cType}:${wrist}:[${beads}]:[${charms}]`;
}

function serializeProductForFingerprint(item: any, includePrice: boolean): string {
  const prodId = item.productId ? item.productId.toString() : item.sku;
  const selections = item.customization?.selections;
  const selSummary = selections
    ? Object.keys(selections)
        .sort()
        .map((k) => `${k}=${JSON.stringify((selections as any)[k])}`)
        .join(",")
    : "";
  const eng = item.customization?.engraving || "";
  const pricePart = includePrice ? `:${item.unitPrice}` : "";
  return `product:${prodId}:${item.sku}:${item.quantity}${pricePart}:${selSummary}:${eng}`;
}

export function isCustomDesignItem(item: any): boolean {
  if (item.itemType === "product") return false;
  if (item.itemType === "custom_design") return true;
  return Boolean(
    item.studioDesign &&
      ((Array.isArray(item.studioDesign.beadSequence) && item.studioDesign.beadSequence.length > 0) ||
        (Array.isArray(item.studioDesign.charms) && item.studioDesign.charms.length > 0) ||
        (Array.isArray(item.studioDesign.components) && item.studioDesign.components.length > 0))
  );
}

export function generateCheckoutFingerprint(
  userId: string,
  items: Array<any>,
  authoritativeTotal: number,
  shippingAddress: IAddress,
  paymentMethod: string
): string {
  const sortedItems = [...items]
    .map((item) => {
      if (isCustomDesignItem(item)) {
        return serializeCustomDesignForFingerprint(item, true);
      }
      return serializeProductForFingerprint(item, true);
    })
    .sort()
    .join(";");

  const normalizedAddress = normalizeAddressForFingerprint(shippingAddress);
  const raw = `${userId}|${sortedItems}|${authoritativeTotal}|${normalizedAddress}|${paymentMethod}`;
  return crypto.createHash("sha256").update(raw).digest("hex");
}

function getCompositionFingerprint(items: Array<any>): string {
  const sortedItems = [...items]
    .map((item) => {
      if (isCustomDesignItem(item)) {
        return serializeCustomDesignForFingerprint(item, false);
      }
      return serializeProductForFingerprint(item, false);
    })
    .sort()
    .join(";");
  return crypto.createHash("sha256").update(sortedItems).digest("hex");
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
    confirmPriceChanges?: boolean;
    expectedTotal?: number;
    idempotencyKey?: string;
  }
) {
  // Enforce testing access safeguard before processing the order
  await assertTestCommerceAccess(userId);

  // 1. Fast-path Idempotency Check:
  // If an order already exists for this authenticated user and idempotencyKey (e.g. cart already cleared by COD)
  const idempotencyKey = input.idempotencyKey?.trim() || undefined;
  if (idempotencyKey) {
    const existingOrder = await Order.findOne({
      userId: new Types.ObjectId(userId),
      idempotencyKey,
    });
    if (existingOrder) {
      if (input.payment_method && existingOrder.paymentMethod !== input.payment_method) {
        throw new AppError(
          "Idempotency key has already been used for a different payment method. Please start a new checkout attempt.",
          409
        );
      }
      if (input.shipping_address) {
        const incomingAddress = parseLegacyAddress(input.shipping_address);
        if (!isAddressMatching(incomingAddress, existingOrder.shippingAddress)) {
          throw new AppError(
            "Idempotency key has already been used for a different shipping destination. Please start a new checkout attempt.",
            409
          );
        }
      }

      // Check current cart contents:
      // If the cart has already been cleared (e.g. legitimate retry after completed COD), return existingOrder safely.
      // If the cart is non-empty, ensure the key is not being reused for a materially different cart.
      const cart = await getOrCreateCart(userId);
      const cartItems = cart.items.filter((i) => !i.savedForLater);

      if (cartItems.length > 0) {
        const currentCartComposition = getCompositionFingerprint(cartItems);
        const existingOrderComposition = getCompositionFingerprint(existingOrder.items);

        if (currentCartComposition !== existingOrderComposition) {
          throw new AppError(
            "Idempotency key has already been used for an order with different items. Please start a new checkout attempt.",
            409
          );
        }
      }

      return existingOrder;
    }
  }

  const cart = await getOrCreateCart(userId);
  const cartItems = cart.items.filter((i) => !i.savedForLater);
  if (cartItems.length === 0) throw new AppError("Cart is empty", 400);

  // Validate custom design material stock before processing pricing or orders
  await validateCustomDesignStock(cartItems);

  const orderItems = [];
  let subtotal = 0;

  for (const item of cartItems) {
    if (isCustomDesignItem(item)) {
      if (!item.studioDesign) {
        throw new AppError(`Custom design "${item.name}" is missing required design specification.`, 400);
      }

      const skuCounts: Record<string, number> = {};
      for (const b of item.studioDesign.beadSequence || []) {
        if (b.variantSku) {
          skuCounts[b.variantSku] = (skuCounts[b.variantSku] || 0) + 1;
        }
      }
      for (const c of item.studioDesign.charms || []) {
        if (c.variantSku) {
          skuCounts[c.variantSku] = (skuCounts[c.variantSku] || 0) + 1;
        }
      }

      const components = Object.entries(skuCounts).map(([variantSku, quantity]) => ({
        variantSku,
        quantity,
      }));

      if (components.length === 0) {
        throw new AppError(`Custom design "${item.name}" has no bead or charm components.`, 400);
      }

      // Authoritative pricing calculated fresh from active materials & selling rates
      const quote = await calculateDesignPrice({
        jewelleryType: item.studioDesign.jewelleryType || "bracelet",
        constructionType: item.studioDesign.constructionType || "elastic_bead",
        components,
      });

      const authoritativeUnitPrice = quote.totalPrice;
      const storedUnitPrice = Number(item.unitPrice);

      // If price differs from what was stored in the cart, do not silently charge the changed amount
      if (Math.abs(authoritativeUnitPrice - storedUnitPrice) > 0.01) {
        // Synchronize cart item with latest authoritative quote
        item.unitPrice = authoritativeUnitPrice;
        item.studioDesign.breakdown = {
          componentsTotal: quote.componentSubtotal,
          baseMakingCharge: quote.makingCharge.baseFee,
          customizationCharge: quote.makingCharge.totalMakingFee - quote.makingCharge.baseFee,
          total: quote.totalPrice,
        };
        cart.markModified("items");
        await cart.save();

        if (!input.confirmPriceChanges) {
          throw new AppError(
            `Price for "${item.name}" has updated from ₹${storedUnitPrice.toLocaleString("en-IN")} to ₹${authoritativeUnitPrice.toLocaleString("en-IN")} based on current component rates. Please review and confirm the updated total to place your order.`,
            409
          );
        }
      }

      const authoritativeStudioDesign = {
        ...item.studioDesign,
        breakdown: {
          componentsTotal: quote.componentSubtotal,
          baseMakingCharge: quote.makingCharge.baseFee,
          customizationCharge: quote.makingCharge.totalMakingFee - quote.makingCharge.baseFee,
          total: quote.totalPrice,
        },
      };

      const lineSubtotal = authoritativeUnitPrice * item.quantity;
      subtotal += lineSubtotal;

      orderItems.push({
        itemType: "custom_design" as const,
        sku: item.sku,
        name: item.name,
        imageUrl: item.imageUrl,
        unitPrice: authoritativeUnitPrice,
        quantity: item.quantity,
        subtotal: lineSubtotal,
        studioDesign: authoritativeStudioDesign,
      });
      continue;
    }

    if (!item.productId) {
      throw new AppError(`Product unavailable: ${item.name}`, 400);
    }

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

  // Safeguard against intervening price changes:
  // If the customer confirmed an updated total, verify that authoritative rates haven't changed again
  // between the confirmation dialog rendering and order placement.
  if (input.confirmPriceChanges && input.expectedTotal !== undefined) {
    if (Math.abs(total - input.expectedTotal) > 0.01) {
      throw new AppError(
        `Component rates have updated again. The order total has changed from ₹${input.expectedTotal.toLocaleString("en-IN")} to ₹${total.toLocaleString("en-IN")}. Please review and confirm the updated total before continuing.`,
        409
      );
    }
  }

  const shippingAddress = parseLegacyAddress(input.shipping_address);
  shippingAddress.phone = input.phone_number;
  const billingAddress = parseLegacyAddress(input.billing_address ?? input.shipping_address);
  billingAddress.phone = input.phone_number;

  // Enforce Tamil Nadu delivery restriction before creating order
  validateDeliveryEligibility(shippingAddress);

  const checkoutFingerprint = generateCheckoutFingerprint(
    userId,
    orderItems,
    total,
    shippingAddress,
    input.payment_method
  );

  if (!idempotencyKey) {
    // Secondary safety check for callers without an idempotencyKey:
    // Match only identical cart/order fingerprints within 15 seconds (prevents double-tap duplicates)
    const recentDuplicate = await Order.findOne({
      userId: new Types.ObjectId(userId),
      checkoutFingerprint,
      createdAt: { $gte: new Date(Date.now() - 15000) },
    }).sort({ createdAt: -1 });

    if (recentDuplicate) {
      return recentDuplicate;
    }
  }

  let order;
  try {
    order = await Order.create({
      orderNumber: generateOrderNumber(),
      userId: new Types.ObjectId(userId),
      idempotencyKey,
      checkoutFingerprint,
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
  } catch (err: any) {
    // Concurrent request race resolution: if another request already inserted with this idempotencyKey
    if (err?.code === 11000 && idempotencyKey) {
      const existing = await Order.findOne({
        userId: new Types.ObjectId(userId),
        idempotencyKey,
      });
      if (existing) {
        if (existing.checkoutFingerprint && existing.checkoutFingerprint !== checkoutFingerprint) {
          throw new AppError(
            "Idempotency key has already been used for a different checkout request. Please start a new checkout attempt.",
            409
          );
        }
        return existing;
      }
    }
    throw err;
  }

  // Atomically reserve custom design component stock (or commit immediately for COD)
  try {
    const studioReservation = await reserveStudioStockForOrder({
      orderId: order._id as Types.ObjectId,
      orderNumber: order.orderNumber,
      userId: order.userId as Types.ObjectId,
      cartItems,
      paymentMethod: input.payment_method,
    });
    if (studioReservation) {
      order.studioReservationId = studioReservation._id as Types.ObjectId;
      order.studioReservationStatus = studioReservation.status;
      await order.save();
    }
  } catch (reservationErr) {
    // If stock reservation fails, remove the newly inserted pending order
    // to prevent orphaned, unpayable orders in the database.
    await Order.deleteOne({ _id: order._id });
    throw reservationErr;
  }

  if (input.payment_method === "cod") {
    try {
      const regularItems = orderItems
        .filter((i) => i.productId && i.itemType !== "custom_design")
        .map((i) => ({ productId: i.productId!.toString(), quantity: i.quantity }));
      if (regularItems.length > 0) {
        await deductStockForOrder(
          regularItems,
          order.id,
          userId
        );
        order.deductedItemIds = orderItems
          .filter((i) => i.productId && i.itemType !== "custom_design")
          .map((i: any) => (i._id ? i._id.toString() : i.productId!.toString()));
      }
      order.status = "processing";
      order.statusHistory.push({ status: "processing", note: "COD order confirmed", changedAt: new Date() });
      await order.save();
      if (coupon) {
        coupon.usedCount += 1;
        await coupon.save();
      }
      await clearCart(userId);
    } catch (codErr) {
      if (order.studioReservationId) {
        await restockStudioReservation(order._id, "COD placement failed rollback");
      }
      await Order.deleteOne({ _id: order._id });
      throw codErr;
    }
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

  // Idempotently restock custom design components
  await restockStudioReservation(order._id, "Customer cancelled order");

  // Restore regular product inventory if deducted
  if (order.deductedItemIds && order.deductedItemIds.length > 0) {
    const regularItems = order.items
      .filter((i) => i.productId && i.itemType !== "custom_design")
      .map((i) => ({ productId: i.productId!.toString(), quantity: i.quantity }));
    if (regularItems.length > 0) {
      for (const item of regularItems) {
        try {
          await adjustStock({
            productId: item.productId,
            quantityChange: item.quantity,
            action: "release",
            reason: "Order cancelled - stock returned",
            orderId: order.id,
            performedBy: userId,
          });
        } catch (restockErr) {
          console.error(`[cancelOrder] Product restock error:`, restockErr);
        }
      }
      order.deductedItemIds = [];
    }
  }

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
  const oldStatus = order.status;
  order.status = status;
  if (trackingNumber) order.trackingNumber = trackingNumber;
  order.statusHistory.push({
    status,
    changedAt: new Date(),
    changedBy: adminId ? new Types.ObjectId(adminId) : undefined,
    note: trackingNumber ? `Tracking: ${trackingNumber}` : undefined,
  });

  // If transitioning to cancelled, restock inventory
  if (status === "cancelled" && oldStatus !== "cancelled") {
    await restockStudioReservation(order._id, "Admin cancelled order");
    if (order.deductedItemIds && order.deductedItemIds.length > 0) {
      const regularItems = order.items
        .filter((i) => i.productId && i.itemType !== "custom_design")
        .map((i) => ({ productId: i.productId!.toString(), quantity: i.quantity }));
      if (regularItems.length > 0) {
        for (const item of regularItems) {
          try {
            await adjustStock({
              productId: item.productId,
              quantityChange: item.quantity,
              action: "release",
              reason: "Order cancelled by admin - stock returned",
              orderId: order.id,
              performedBy: adminId,
            });
          } catch (restockErr) {
            console.error(`[updateOrderStatus] Product restock error:`, restockErr);
          }
        }
        order.deductedItemIds = [];
      }
    }
  }

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
    items: (order.items as Record<string, unknown>[])?.map((item) => {
      const isCustomDesign = (item as any).itemType === "custom_design" || !!(item as any).studioDesign;
      const productType = isCustomDesign
        ? ((item as any).studioDesign?.jewelleryType ?? "bracelet")
        : (String(item.sku || "").startsWith("BRC") ? "bracelet" : "chain");
      return {
        id: item._id,
        itemType: isCustomDesign ? "custom_design" : "product",
        product_type: productType,
        product_id: item.productId ? (item.productId as any).toString() : undefined,
        productId: item.productId ? (item.productId as any).toString() : undefined,
        product_name: item.name,
        price: item.unitPrice,
        quantity: item.quantity,
        subtotal: item.subtotal,
        studioDesign: (item as any).studioDesign,
      };
    }),
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
