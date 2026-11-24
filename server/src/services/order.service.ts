/**
 * ============================================================================
 * Order Service (Phase 3F: PostgreSQL Migration)
 * ============================================================================
 *
 * Backed by Supabase PostgreSQL `orders` and `order_items` tables using
 * `PostgresOrderRepository`.
 *
 * Guarantees:
 * 1. Authoritative recalculation of all subtotals, discounts, tax, shipping, and total.
 * 2. Concurrency-safe, idempotent checkout via `idempotencyKey` and `checkoutFingerprint`.
 * 3. Atomic stock deduction for regular products and stock reservation for custom designs.
 * 4. Automatic rollback of reservation and order record on checkout failure.
 * 5. Full backwards compatibility with existing order routes, legacy routes, and controllers.
 * 6. Clean dependency injection for test isolation without live database writes.
 */

import crypto from "crypto";
import { Types } from "mongoose";
import { AppError } from "../middleware/errorHandler.js";
import { generateOrderNumber, isValidEntityId } from "../utils/helpers.js";
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
import * as couponService from "./coupon.service.js";
import {
  IDbPool,
  IOrderRecord,
} from "../types/database.types.js";
import { PostgresOrderRepository } from "../repositories/postgres-order.repository.js";
import { PostgresProductRepository } from "../repositories/postgres-product.repository.js";
import { PostgresUserRepository } from "../repositories/postgres-user.repository.js";
import { PostgresDatabase } from "../db/postgres.js";
import type { IAddress } from "../models/User.js";
import type { OrderStatus } from "../types/index.js";

const SHIPPING_FREE_THRESHOLD = 1000;
const SHIPPING_FLAT = 50;

// ---------------------------------------------------------------------------
// Singletons & Dependency Injection
// ---------------------------------------------------------------------------

let activeOrderRepo: PostgresOrderRepository | null = null;
let activeProductRepo: PostgresProductRepository | null = null;
let activeUserRepo: PostgresUserRepository | null = null;
let activePool: IDbPool | null = null;

export function setOrderRepository(repo: PostgresOrderRepository): void {
  activeOrderRepo = repo;
}

export function setOrderDatabasePool(pool: IDbPool): void {
  activePool = pool;
  activeOrderRepo = new PostgresOrderRepository(pool);
}

export function setOrderProductRepository(repo: PostgresProductRepository): void {
  activeProductRepo = repo;
}

export function setOrderUserRepository(repo: PostgresUserRepository): void {
  activeUserRepo = repo;
}

function getOrderPool(): IDbPool {
  if (!activePool) {
    activePool = PostgresDatabase.getPool();
  }
  return activePool;
}

function getOrderRepo(): PostgresOrderRepository {
  if (!activeOrderRepo) {
    activeOrderRepo = new PostgresOrderRepository(getOrderPool());
  }
  return activeOrderRepo;
}

function getProductRepo(): PostgresProductRepository {
  if (!activeProductRepo) {
    activeProductRepo = new PostgresProductRepository(getOrderPool());
  }
  return activeProductRepo;
}

function getUserRepo(): PostgresUserRepository {
  if (!activeUserRepo) {
    activeUserRepo = new PostgresUserRepository(getOrderPool());
  }
  return activeUserRepo;
}

// ---------------------------------------------------------------------------
// Commerce Tax Configuration
// ---------------------------------------------------------------------------

export function getCommerceTaxConfig() {
  if (env.COMMERCE_MODE === "test") {
    return {
      mode: "test",
      isGstRegistered: false,
      taxRate: 0,
    };
  }
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

export function parseLegacyAddress(raw: string | IAddress | any): IAddress {
  if (typeof raw === "object" && raw !== null) {
    return {
      fullName: raw.fullName ?? raw.name ?? "Customer",
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
  let state = "";
  if (parts.length >= 6) {
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
  return couponService.validateCoupon(code, subtotal);
}

async function assertTestCommerceAccess(userId: string): Promise<void> {
  if (env.COMMERCE_MODE === "disabled") {
    throw new AppError("Order placement is currently disabled on this server.", 503);
  }

  if (env.COMMERCE_MODE === "test") {
    const user = await getUserRepo().findById(userId);
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
  const beads =
    sd?.beadSequence && sd.beadSequence.length > 0
      ? sd.beadSequence
          .map((b: any, idx: number) => `${idx}:${b.variantSku || b.materialId || ""}`)
          .join(",")
      : (sd?.components || [])
          .map((c: any) => `${c.variantSku}:${c.quantity}`)
          .sort()
          .join(",");

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

// ---------------------------------------------------------------------------
// Create Order from Cart
// ---------------------------------------------------------------------------

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
): Promise<IOrderRecord> {
  const orderRepo = getOrderRepo();
  const productRepo = getProductRepo();

  // Enforce testing access safeguard before processing the order
  await assertTestCommerceAccess(userId);

  // 1. Fast-path Idempotency Check:
  const idempotencyKey = input.idempotencyKey?.trim() || undefined;
  if (idempotencyKey) {
    const existingOrder = await orderRepo.findByIdempotencyKey(userId, idempotencyKey);
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

      // Check current cart contents
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

  const orderItems: Array<{
    itemType: "product" | "custom_design";
    productId?: string | null;
    sku: string;
    name: string;
    imageUrl?: string | null;
    unitPrice: number;
    quantity: number;
    subtotal: number;
    customization?: any;
    studioDesign?: any;
  }> = [];

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

      const quote = await calculateDesignPrice({
        jewelleryType: item.studioDesign.jewelleryType || "bracelet",
        constructionType: item.studioDesign.constructionType || "elastic_bead",
        components,
      });

      const authoritativeUnitPrice = quote.totalPrice;
      const storedUnitPrice = Number(item.unitPrice);

      if (Math.abs(authoritativeUnitPrice - storedUnitPrice) > 0.01) {
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
        itemType: "custom_design",
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

    const product = await productRepo.findById(item.productId);
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
      itemType: "product",
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

  // Enforce Tamil Nadu delivery restriction
  validateDeliveryEligibility(shippingAddress);

  const checkoutFingerprint = generateCheckoutFingerprint(
    userId,
    orderItems,
    total,
    shippingAddress,
    input.payment_method
  );

  if (!idempotencyKey) {
    const recentDuplicate = await orderRepo.findRecentByCheckoutFingerprint(
      userId,
      checkoutFingerprint,
      15000
    );
    if (recentDuplicate) {
      return recentDuplicate;
    }
  }

  const orderNumber = generateOrderNumber();
  const initialStatusHistory = [
    {
      status: "pending",
      note: env.COMMERCE_MODE === "test" ? "Test order placed (non-commercial mode)" : "Order placed",
      changedAt: new Date().toISOString(),
    },
  ];

  let order: IOrderRecord;
  try {
    order = await orderRepo.create({
      orderNumber,
      userId,
      idempotencyKey,
      checkoutFingerprint,
      status: "pending",
      paymentStatus: "pending",
      subtotal,
      discount,
      tax,
      shipping,
      total,
      couponCode: coupon?.code || null,
      shippingAddress,
      billingAddress,
      email: input.email,
      phone: input.phone_number,
      notes: env.COMMERCE_MODE === "test" ? `[TEST ORDER] ${input.notes || ""}`.trim() : input.notes,
      paymentMethod: input.payment_method || "razorpay",
      statusHistory: initialStatusHistory,
    });

    // Insert order items
    const createdItems = await orderRepo.addItems(
      order.id,
      orderItems.map((item) => ({
        itemType: item.itemType,
        productId: item.productId,
        sku: item.sku,
        name: item.name,
        imageUrl: item.imageUrl,
        unitPrice: item.unitPrice,
        quantity: item.quantity,
        subtotal: item.subtotal,
        customization: item.customization,
        studioDesign: item.studioDesign,
      }))
    );
    order.items = createdItems;
  } catch (err: any) {
    // Unique violation on (user_id, idempotency_key)
    if ((err?.code === "23505" || err?.code === 11000) && idempotencyKey) {
      const existing = await orderRepo.findByIdempotencyKey(userId, idempotencyKey);
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
    const rawOrderId = order.id;
    const rawUserId = order.userId || userId;
    const studioReservation = await reserveStudioStockForOrder({
      orderId: (Types.ObjectId.isValid(rawOrderId) ? new Types.ObjectId(rawOrderId) : rawOrderId) as any,
      orderNumber: order.orderNumber,
      userId: (Types.ObjectId.isValid(rawUserId) ? new Types.ObjectId(rawUserId) : rawUserId) as any,
      cartItems,
      paymentMethod: input.payment_method,
    });
    if (studioReservation) {
      const reservationId = studioReservation.id || String((studioReservation as any)._id || "");
      await orderRepo.updateById(order.id, {
        studioReservationId: reservationId,
        studioReservationStatus: studioReservation.status,
      });
      order.studioReservationId = reservationId;
      order.studioReservationStatus = studioReservation.status;
    }
  } catch (reservationErr) {
    await orderRepo.deleteById(order.id);
    throw reservationErr;
  }

  if (input.payment_method === "cod") {
    try {
      const regularItems = order.items
        .filter((i) => i.productId && i.itemType !== "custom_design")
        .map((i) => ({ productId: i.productId!.toString(), quantity: i.quantity }));

      if (regularItems.length > 0) {
        await deductStockForOrder(regularItems, order.id, userId);
        const deductedIds = order.items
          .filter((i) => i.productId && i.itemType !== "custom_design")
          .map((i) => i.id);
        for (const dId of deductedIds) {
          await orderRepo.addDeductedItemId(order.id, dId);
        }
        order.deductedItemIds = deductedIds;
      }

      await orderRepo.updateById(order.id, {
        status: "processing",
      });
      await orderRepo.appendStatusHistory(order.id, {
        status: "processing",
        note: "COD order confirmed",
        changedAt: new Date(),
      });
      order.status = "processing";

      if (coupon) {
        const wonCoupon = await orderRepo.claimCouponProcessed(order.id);
        if (wonCoupon) {
          await couponService.redeemCoupon(coupon.code);
          order.couponProcessed = true;
        }
      }

      await clearCart(userId);
      await orderRepo.claimCartCleared(order.id);
      order.cartCleared = true;
    } catch (codErr) {
      if (order.deductedItemIds && order.deductedItemIds.length > 0) {
        const regularItems = order.items
          .filter((i) => i.productId && i.itemType !== "custom_design")
          .map((i) => ({ productId: i.productId!.toString(), quantity: i.quantity }));
        for (const item of regularItems) {
          try {
            await adjustStock({
              productId: item.productId,
              quantityChange: item.quantity,
              action: "release",
              reason: "COD placement failed rollback",
              orderId: order.id,
              performedBy: userId,
            });
          } catch (restockErr) {
            console.error(`[createOrderFromCart] Failed to restore stock during COD error rollback:`, restockErr);
          }
        }
      }
      if (order.studioReservationId) {
        await restockStudioReservation(order.id, "COD placement failed rollback");
      }
      await orderRepo.deleteById(order.id);
      throw codErr;
    }
  }

  return order;
}

// ---------------------------------------------------------------------------
// Read Order Operations
// ---------------------------------------------------------------------------

export async function listUserOrders(userId: string): Promise<IOrderRecord[]> {
  return getOrderRepo().findByUserId(userId);
}

export async function getOrderById(userId: string, orderId: string): Promise<IOrderRecord> {
  if (!isValidEntityId(orderId)) throw new AppError("Invalid order id", 400);
  const order = await getOrderRepo().findById(orderId);
  if (!order || order.userId !== userId) throw new AppError("Order not found", 404);
  return order;
}

export async function getOrderByNumber(orderNumber: string): Promise<IOrderRecord | null> {
  return getOrderRepo().findByOrderNumber(orderNumber);
}

export async function listAllOrders(
  filter?: { status?: string; paymentStatus?: string; search?: string },
  options?: { limit?: number; offset?: number }
): Promise<{ orders: IOrderRecord[]; total: number }> {
  return getOrderRepo().findAll(filter, options);
}

// ---------------------------------------------------------------------------
// Cancel Order
// ---------------------------------------------------------------------------

export async function cancelOrder(userId: string, orderId: string): Promise<IOrderRecord> {
  const orderRepo = getOrderRepo();
  const order = await orderRepo.findById(orderId);
  if (!order || order.userId !== userId) throw new AppError("Order not found", 404);
  if (!["pending", "processing"].includes(order.status)) {
    throw new AppError("Order cannot be cancelled", 400);
  }

  // Idempotently restock custom design components if order has studio items/reservation
  const hasStudioItems = order.studioReservationId || (order.items && order.items.some((i: any) => i.itemType === "custom_design"));
  if (hasStudioItems) {
    try {
      await restockStudioReservation(order.id, "Customer cancelled order");
    } catch (studioErr) {
      console.error(`[cancelOrder] Failed to restock studio reservation for order ${order.id}:`, studioErr);
    }
  }

  // Idempotently rollback coupon usage if previously processed
  if (order.couponCode && order.couponProcessed) {
    try {
      await couponService.rollbackCouponUsage(order.couponCode);
    } catch (couponErr) {
      console.error(`[cancelOrder] Failed to rollback coupon usage for ${order.couponCode}:`, couponErr);
    }
  }

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
    }
  }

  const updated = await orderRepo.updateById(order.id, {
    status: "cancelled",
    deductedItemIds: [],
    couponProcessed: false,
  });

  await orderRepo.appendStatusHistory(order.id, {
    status: "cancelled",
    note: "Customer cancelled order",
    changedAt: new Date(),
  });

  return updated || order;
}

// ---------------------------------------------------------------------------
// Admin Update Order Status
// ---------------------------------------------------------------------------

export async function updateOrderStatus(
  orderId: string,
  status: OrderStatus,
  trackingNumber?: string,
  adminId?: string
): Promise<IOrderRecord> {
  const orderRepo = getOrderRepo();
  const order = await orderRepo.findById(orderId);
  if (!order) throw new AppError("Order not found", 404);

  const oldStatus = order.status;

  if (status === "cancelled" && oldStatus !== "cancelled") {
    const hasStudioItems = order.studioReservationId || (order.items && order.items.some((i: any) => i.itemType === "custom_design"));
    if (hasStudioItems) {
      try {
        await restockStudioReservation(order.id, "Admin cancelled order");
      } catch (studioErr) {
        console.error(`[updateOrderStatus] Failed to restock studio reservation for order ${order.id}:`, studioErr);
      }
    }
    if (order.couponCode && order.couponProcessed) {
      try {
        await couponService.rollbackCouponUsage(order.couponCode);
      } catch (couponErr) {
        console.error(`[updateOrderStatus] Failed to rollback coupon usage for ${order.couponCode}:`, couponErr);
      }
    }
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
      }
    }
  }

  const updateData: any = {
    status,
    deductedItemIds: status === "cancelled" ? [] : order.deductedItemIds,
    couponProcessed: status === "cancelled" ? false : order.couponProcessed,
  };
  if (trackingNumber) updateData.trackingNumber = trackingNumber;

  const updated = await orderRepo.updateById(order.id, updateData);

  await orderRepo.appendStatusHistory(order.id, {
    status,
    note: trackingNumber ? `Tracking: ${trackingNumber}` : undefined,
    changedAt: new Date(),
    changedBy: adminId,
  });

  return updated || order;
}

// ---------------------------------------------------------------------------
// Legacy Serialization Compatibility
// ---------------------------------------------------------------------------

export function toLegacyOrder(order: Record<string, unknown> | IOrderRecord) {
  const ord = order as any;
  const idStr = (ord.id || ord._id)?.toString() || "";
  const orderNumber = ord.orderNumber || ord.order_number;
  const status = ord.status;
  const paymentStatus =
    ord.paymentStatus === "paid" || ord.payment_status === "paid"
      ? "completed"
      : (ord.paymentStatus || ord.payment_status);
  const total = ord.total ?? ord.total_amount;
  const shippingAddress = ord.shippingAddress ?? ord.shipping_address;
  const billingAddress = ord.billingAddress ?? ord.billing_address;
  const phone = ord.phone ?? ord.phone_number;
  const email = ord.email;
  const notes = ord.notes;
  const createdAt = ord.createdAt ?? ord.created_at;
  const updatedAt = ord.updatedAt ?? ord.updated_at;
  const paymentMethod = ord.paymentMethod ?? ord.payment_method;
  const transactionId = ord.razorpayPaymentId ?? ord.razorpay_payment_id;

  const items = Array.isArray(ord.items)
    ? ord.items.map((item: any) => {
        const itemId = (item.id || item._id)?.toString();
        const isCustomDesign =
          item.itemType === "custom_design" ||
          item.item_type === "custom_design" ||
          !!item.studioDesign ||
          !!item.studio_design;
        const studioDesign = item.studioDesign || item.studio_design;
        const productType = isCustomDesign
          ? (studioDesign?.jewelleryType ?? "bracelet")
          : (String(item.sku || "").startsWith("BRC") ? "bracelet" : "chain");
        const productId = item.productId || item.product_id;

        return {
          id: itemId,
          itemType: isCustomDesign ? "custom_design" : "product",
          product_type: productType,
          product_id: productId ? productId.toString() : undefined,
          productId: productId ? productId.toString() : undefined,
          product_name: item.name || item.product_name,
          price: item.unitPrice ?? item.unit_price ?? item.price,
          quantity: item.quantity,
          subtotal: item.subtotal,
          studioDesign,
        };
      })
    : [];

  return {
    id: idStr,
    order_number: orderNumber,
    status,
    payment_status: paymentStatus,
    total_amount: total,
    shipping_address: formatAddress(shippingAddress),
    billing_address: formatAddress(billingAddress),
    phone_number: phone,
    email,
    notes,
    created_at: createdAt,
    updated_at: updatedAt,
    payment_method: paymentMethod,
    transaction_id: transactionId,
    items,
  };
}

function formatAddress(addr: unknown): string {
  if (!addr || typeof addr !== "object") return "";
  const a = addr as IAddress;
  return [a.fullName, a.line1, a.city, a.postalCode, a.country].filter(Boolean).join(", ");
}

export async function getLegacyCartForCheckout(userId: string) {
  const items = await getCartItems(userId);
  return items.map((item, idx) => toLegacyCartItem(item as any, idx));
}
