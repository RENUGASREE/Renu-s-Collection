import mongoose, { Types } from "mongoose";
import { StudioMaterial, StudioReservation, Order, type IStudioReservation, type StudioReservationStatus } from "../models/index.js";
import { AppError } from "../middleware/errorHandler.js";
import { env } from "../config/env.js";

export interface AggregatedComponent {
  quantity: number;
  itemNames: string[];
}

export interface VerifiedComponent {
  quantity: number;
  materialId?: Types.ObjectId;
  materialName: string;
  availableStock: number;
}

/**
 * Aggregates all required material variant SKUs across all custom designs in the cart.
 * Accounts for repeated beads/charms inside each piece multiplied by the item quantity.
 */
export function aggregateCustomDesignComponents(
  cartItems: Array<any>
): Record<string, AggregatedComponent> {
  const aggregated: Record<string, AggregatedComponent> = {};

  for (const item of cartItems) {
    if (item.itemType === "product") continue;
    if (item.itemType === "custom_design" || item.studioDesign) {
      const sd = item.studioDesign;
      if (!sd) continue;

      const itemQty = Math.max(1, Number(item.quantity) || 1);
      const itemName = item.name || "Custom Jewelry Piece";

      // 1. Tally from beadSequence
      if (Array.isArray(sd.beadSequence)) {
        for (const bead of sd.beadSequence) {
          const sku = bead.variantSku?.trim()?.toUpperCase();
          if (sku) {
            if (!aggregated[sku]) {
              aggregated[sku] = { quantity: 0, itemNames: [] };
            }
            aggregated[sku].quantity += 1 * itemQty;
            if (!aggregated[sku].itemNames.includes(itemName)) {
              aggregated[sku].itemNames.push(itemName);
            }
          }
        }
      }

      // 2. Tally from charms
      if (Array.isArray(sd.charms)) {
        for (const charm of sd.charms) {
          const sku = charm.variantSku?.trim()?.toUpperCase();
          if (sku) {
            if (!aggregated[sku]) {
              aggregated[sku] = { quantity: 0, itemNames: [] };
            }
            aggregated[sku].quantity += 1 * itemQty;
            if (!aggregated[sku].itemNames.includes(itemName)) {
              aggregated[sku].itemNames.push(itemName);
            }
          }
        }
      }

      // 3. Fallback: components array if present and sequence was empty
      if (
        (!sd.beadSequence || sd.beadSequence.length === 0) &&
        Array.isArray(sd.components)
      ) {
        for (const comp of sd.components) {
          const sku = comp.variantSku?.trim()?.toUpperCase();
          const compQty = Math.max(1, Number(comp.quantity) || 1);
          if (sku) {
            if (!aggregated[sku]) {
              aggregated[sku] = { quantity: 0, itemNames: [] };
            }
            aggregated[sku].quantity += compQty * itemQty;
            if (!aggregated[sku].itemNames.includes(itemName)) {
              aggregated[sku].itemNames.push(itemName);
            }
          }
        }
      }
    }
  }

  return aggregated;
}

/**
 * Validates that every selected material variant exists in the active catalogue,
 * is marked active, and has sufficient available stock.
 * Fails safely if stock data is missing or insufficient.
 */
export async function validateCustomDesignStock(
  cartItems: Array<any>
): Promise<Record<string, VerifiedComponent>> {
  const aggregated = aggregateCustomDesignComponents(cartItems);
  const skus = Object.keys(aggregated);
  if (skus.length === 0) return {};

  const verified: Record<string, VerifiedComponent> = {};

  // Query live catalogue for all referenced SKUs
  const materials = await StudioMaterial.find({
    "variants.sku": { $in: skus },
  });

  const materialBySku = new Map<string, any>();
  for (const mat of materials) {
    for (const v of mat.variants) {
      if (v.sku) {
        materialBySku.set(v.sku.toUpperCase(), { material: mat, variant: v });
      }
    }
  }

  for (const sku of skus) {
    const entry = materialBySku.get(sku);
    const required = aggregated[sku].quantity;
    const itemNamesStr = aggregated[sku].itemNames.join(", ");

    if (!entry) {
      throw new AppError(
        `Component with SKU "${sku}" for design "${itemNamesStr}" was not found in the studio catalogue. Please contact support.`,
        400
      );
    }

    const { material, variant } = entry;

    if (!material.isActive) {
      throw new AppError(
        `Material "${material.name}" (${sku}) is currently inactive or discontinued. Please update your custom design.`,
        400
      );
    }

    if (!variant.isActive) {
      throw new AppError(
        `Component variant "${variant.sizeLabel || sku}" of "${material.name}" is currently unavailable.`,
        400
      );
    }

    if (typeof variant.stock !== "number" || isNaN(variant.stock)) {
      throw new AppError(
        `Component "${material.name}" (${sku}) has uninitialized stock data. Admin inventory setup required.`,
        400
      );
    }

    if (variant.stock < required) {
      throw new AppError(
        `Insufficient stock for "${material.name}" (${sku}) used in "${itemNamesStr}". Requested: ${required}, Available: ${variant.stock}.`,
        400
      );
    }

    verified[sku] = {
      quantity: required,
      materialId: material._id,
      materialName: material.name,
      availableStock: variant.stock,
    };
  }

  return verified;
}

/**
 * Atomically reserves required component stock for an order using conditional MongoDB updates.
 * If concurrent requests exhaust stock on any component, all previously reserved components
 * in this attempt are immediately rolled back and released.
 */
export async function reserveStudioStockForOrder(params: {
  orderId: Types.ObjectId;
  orderNumber: string;
  userId: Types.ObjectId;
  cartItems: Array<any>;
  paymentMethod: string;
  expiryMinutes?: number;
}): Promise<IStudioReservation | null> {
  const verified = await validateCustomDesignStock(params.cartItems);
  const skus = Object.keys(verified);
  if (skus.length === 0) return null;

  const successfullyReserved: Array<{ sku: string; quantity: number }> = [];

  try {
    for (const sku of skus) {
      const comp = verified[sku];

      // Atomic conditional update: only decrement if stock >= required and isActive is true
      const result = await StudioMaterial.updateOne(
        {
          _id: comp.materialId,
          isActive: true,
          variants: {
            $elemMatch: {
              sku,
              isActive: true,
              stock: { $gte: comp.quantity },
            },
          },
        },
        {
          $inc: { "variants.$.stock": -comp.quantity },
        }
      );

      if (result.modifiedCount === 0) {
        // Race condition: another checkout grabbed the remaining units!
        throw new AppError(
          `Stock for component "${comp.materialName}" (${sku}) became unavailable during checkout reservation. Please review your cart.`,
          400
        );
      }

      successfullyReserved.push({ sku, quantity: comp.quantity });
    }
  } catch (err: any) {
    // PARTIAL RESERVATION ROLLBACK:
    // Restore all items that were successfully decremented during this failed attempt
    for (const r of successfullyReserved) {
      try {
        await StudioMaterial.updateOne(
          { "variants.sku": r.sku },
          { $inc: { "variants.$.stock": r.quantity } }
        );
      } catch (rollbackErr) {
        console.error(`[studio-inventory] Rollback failure for ${r.sku}:`, rollbackErr);
      }
    }
    throw err;
  }

  // Determine initial reservation state:
  // For Cash on Delivery (COD), order placement immediately confirms the order (status: "processing"),
  // so the reservation is directly committed.
  // For online payments (Razorpay), reservation is held pending payment confirmation with an expiry.
  const isCod = params.paymentMethod.toLowerCase() === "cod";
  const initialStatus: StudioReservationStatus = isCod ? "committed" : "reserved";
  const now = new Date();
  const timeoutMin = params.expiryMinutes || env.STUDIO_RESERVATION_TIMEOUT_MINUTES || 30;
  const expiresAt = new Date(now.getTime() + timeoutMin * 60 * 1000);

  const reservation = await StudioReservation.create({
    orderId: params.orderId,
    orderNumber: params.orderNumber,
    userId: params.userId,
    status: initialStatus,
    items: skus.map((sku) => ({
      materialId: verified[sku].materialId,
      materialName: verified[sku].materialName,
      sku,
      quantity: verified[sku].quantity,
    })),
    reservedAt: now,
    expiresAt,
    committedAt: isCod ? now : undefined,
  });

  return reservation;
}

function supportsTransactions(): boolean {
  try {
    const conn = mongoose.connection as any;
    const topology = conn?.client?.topology?.description;
    const type = topology?.type;
    return type === "ReplicaSetWithPrimary" || type === "Sharded";
  } catch {
    return false;
  }
}

/**
 * Commits a pending reservation to consumed stock upon verified payment.
 * Idempotent: safe against duplicate payment callbacks or retries.
 * If payment arrives late after reservation was released due to timeout:
 *   Attempts atomic re-reservation; if unavailable, flags order for safe admin reconciliation.
 */
export async function commitStudioReservation(
  orderId: string | Types.ObjectId
): Promise<{ success: boolean; status: StudioReservationStatus; message: string }> {
  const now = new Date();

  // 1. Transactional path (when active replica set or mongos cluster is present)
  if (supportsTransactions()) {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const transitioned = await StudioReservation.findOneAndUpdate(
        { orderId, status: "reserved" },
        {
          $set: {
            status: "committed",
            committedAt: now,
          },
        },
        { new: true, session }
      );

      if (transitioned) {
        await Order.updateOne(
          { _id: orderId },
          { $set: { studioReservationStatus: "committed" } },
          { session }
        );
        await session.commitTransaction();
        return { success: true, status: "committed", message: "Reservation committed to sale" };
      }
      await session.abortTransaction();
    } catch (err) {
      await session.abortTransaction();
      throw err;
    } finally {
      session.endSession();
    }
  }

  // 2. Non-transactional fallback:
  const transitioned = await StudioReservation.findOneAndUpdate(
    { orderId, status: "reserved" },
    {
      $set: {
        status: "committed",
        committedAt: now,
      },
    },
    { new: true }
  );

  if (transitioned) {
    await Order.updateOne(
      { _id: orderId },
      { $set: { studioReservationStatus: "committed" } }
    );
    return { success: true, status: "committed", message: "Reservation committed to sale" };
  }

  const reservation = await StudioReservation.findOne({ orderId });
  if (!reservation) {
    return { success: true, status: "committed", message: "No studio reservation required" };
  }

  if (reservation.status === "committed") {
    return { success: true, status: "committed", message: "Reservation already committed" };
  }

  // Handle LATE PAYMENT after reservation was released due to timeout:
  if (reservation.status === "released") {
    // Atomically claim the released reservation to prevent concurrent late payments from racing
    const locked = await StudioReservation.findOneAndUpdate(
      { orderId, status: "released" },
      {
        $set: {
          status: "reconciliation_required",
          reconciliationNotes: "Processing late payment verification...",
        },
      },
      { new: true }
    );

    if (!locked) {
      const refreshed = await StudioReservation.findOne({ orderId });
      return {
        success: refreshed?.status === "committed",
        status: refreshed?.status || "reconciliation_required",
        message: `Reservation current status: ${refreshed?.status}`,
      };
    }

    const reReserved: Array<{ sku: string; quantity: number }> = [];
    let reReserveFailed = false;

    for (const item of locked.items) {
      const res = await StudioMaterial.updateOne(
        {
          "variants.sku": item.sku,
          isActive: true,
          variants: {
            $elemMatch: {
              sku: item.sku,
              isActive: true,
              stock: { $gte: item.quantity },
            },
          },
        },
        {
          $inc: { "variants.$.stock": -item.quantity },
        }
      );

      if (res.modifiedCount === 0) {
        reReserveFailed = true;
        break;
      }
      reReserved.push({ sku: item.sku, quantity: item.quantity });
    }

    if (reReserveFailed) {
      // Rollback any partially re-reserved items
      for (const r of reReserved) {
        await StudioMaterial.updateOne(
          { "variants.sku": r.sku },
          { $inc: { "variants.$.stock": r.quantity } }
        );
      }

      locked.status = "reconciliation_required";
      locked.reconciliationNotes =
        "Late payment captured after reservation expiry, but components are now out of stock. Safe admin reconciliation required.";
      await locked.save();

      await Order.updateOne(
        { _id: orderId },
        {
          $set: {
            studioReservationStatus: "reconciliation_required",
            fulfillmentStatus: "requires_action",
          },
          $push: {
            fulfillmentErrors:
              "Late payment received; custom jewelry components were reallocated and require admin reconciliation.",
          },
        }
      );

      return {
        success: false,
        status: "reconciliation_required",
        message: "Stock unavailable for late payment; flagged for reconciliation",
      };
    }

    // Re-reservation succeeded!
    locked.status = "committed";
    locked.committedAt = new Date();
    locked.reconciliationNotes = "Re-reserved successfully upon late payment arrival";
    await locked.save();

    await Order.updateOne(
      { _id: orderId },
      { $set: { studioReservationStatus: "committed" } }
    );

    return {
      success: true,
      status: "committed",
      message: "Late payment re-reserved and committed successfully",
    };
  }

  return {
    success: reservation.status !== "reconciliation_required",
    status: reservation.status,
    message: `Reservation current status: ${reservation.status}`,
  };
}

/**
 * Releases reserved component stock back to available inventory.
 * Used when payment fails, is cancelled, or reservation expires.
 * Protected by MongoDB transaction when replica set is active, and recoverable rollback compensation.
 * Idempotent: will not release more than once.
 */
export async function releaseStudioReservation(
  orderId: string | Types.ObjectId,
  reason?: string
): Promise<{ success: boolean; released: boolean; message: string }> {
  // First verify current reservation state
  const existing = await StudioReservation.findOne({ orderId });
  if (!existing) {
    return { success: true, released: false, message: "No reservation found" };
  }
  if (existing.status === "released") {
    return { success: true, released: false, message: "Reservation already released" };
  }
  if (existing.status === "restocked") {
    return { success: true, released: false, message: "Reservation already restocked" };
  }
  if (existing.status === "committed") {
    return {
      success: false,
      released: false,
      message: "Committed reservation cannot be released; use restockStudioReservation for cancellations",
    };
  }
  if (existing.status !== "reserved") {
    return { success: true, released: false, message: `Reservation status: ${existing.status}` };
  }

  // 1. Transactional path (when active replica set or mongos cluster is present)
  let session: mongoose.ClientSession | null = null;
  let inTx = false;
  if (supportsTransactions()) {
    try {
      session = await mongoose.startSession();
      session.startTransaction();
      inTx = true;
    } catch {
      if (session) {
        session.endSession();
        session = null;
      }
    }
  }

  if (session && inTx) {
    try {
      const reservation = await StudioReservation.findOneAndUpdate(
        { orderId, status: "reserved" },
        {
          $set: {
            status: "released",
            releasedAt: new Date(),
            releaseReason: reason || "Payment cancelled or failed",
          },
        },
        { new: false, session }
      );

      if (!reservation) {
        await session.abortTransaction();
        return { success: true, released: false, message: "Reservation already processed concurrently" };
      }

      // Restore stock for all components atomically inside the transaction
      for (const item of reservation.items) {
        await StudioMaterial.updateOne(
          { "variants.sku": item.sku },
          { $inc: { "variants.$.stock": item.quantity } },
          { session }
        );
      }

      await Order.updateOne(
        { _id: orderId },
        { $set: { studioReservationStatus: "released" } },
        { session }
      );

      await session.commitTransaction();
      return { success: true, released: true, message: "Reservation released and stock restored" };
    } catch (err) {
      await session.abortTransaction();
      throw err;
    } finally {
      session.endSession();
    }
  }

  // 2. Non-transactional fallback with recoverable compensation mechanism:
  // Atomically claim the document to prevent concurrent callers from racing
  const reservation = await StudioReservation.findOneAndUpdate(
    { orderId, status: "reserved" },
    {
      $set: {
        status: "released",
        releasedAt: new Date(),
        releaseReason: reason || "Payment cancelled or failed",
      },
    },
    { new: false }
  );

  if (!reservation) {
    return { success: true, released: false, message: "Reservation already processed concurrently" };
  }

  const restoredItems: Array<{ sku: string; quantity: number }> = [];
  try {
    for (const item of reservation.items) {
      await StudioMaterial.updateOne(
        { "variants.sku": item.sku },
        { $inc: { "variants.$.stock": item.quantity } }
      );
      restoredItems.push({ sku: item.sku, quantity: item.quantity });
    }

    await Order.updateOne(
      { _id: orderId },
      { $set: { studioReservationStatus: "released" } }
    );

    return { success: true, released: true, message: "Reservation released and stock restored" };
  } catch (err: any) {
    // RECOVERABLE COMPENSATION:
    // If any failure occurs during stock restoration, roll back any partially restored items
    for (const r of restoredItems) {
      try {
        await StudioMaterial.updateOne(
          { "variants.sku": r.sku },
          { $inc: { "variants.$.stock": -r.quantity } }
        );
      } catch (rollbackErr) {
        console.error(`[studio-inventory] Failed rolling back restored stock for ${r.sku}:`, rollbackErr);
      }
    }

    // Revert reservation status back to "reserved" so retries are NOT blocked
    try {
      await StudioReservation.updateOne(
        { _id: reservation._id },
        {
          $set: {
            status: "reserved",
            releaseReason: `Restoration failed: ${err?.message || "Unknown error"}. Reverted for retry.`,
          },
          $unset: { releasedAt: 1 },
        }
      );
    } catch (revertErr) {
      console.error("[studio-inventory] Failed to revert reservation status:", revertErr);
    }

    throw err;
  }
}

/**
 * Restores consumed component stock to the catalogue upon eligible order cancellation.
 * Protected by MongoDB transaction when replica set is active, and recoverable rollback compensation.
 * Idempotent: ensures stock is restored exactly once.
 */
export async function restockStudioReservation(
  orderId: string | Types.ObjectId,
  reason?: string
): Promise<{ success: boolean; restocked: boolean; message: string }> {
  // First verify current reservation state
  const existing = await StudioReservation.findOne({ orderId });
  if (!existing) {
    return { success: true, restocked: false, message: "No reservation found" };
  }
  if (existing.status === "restocked") {
    return { success: true, restocked: false, message: "Reservation already restocked" };
  }
  if (existing.status === "released") {
    return { success: true, restocked: false, message: "Reservation was already released prior to fulfillment" };
  }
  if (!["committed", "reserved"].includes(existing.status)) {
    return { success: true, restocked: false, message: `Reservation status: ${existing.status}` };
  }

  const previousStatus = existing.status;

  // 1. Transactional path (when active replica set or mongos cluster is present)
  let session: mongoose.ClientSession | null = null;
  let inTx = false;
  if (supportsTransactions()) {
    try {
      session = await mongoose.startSession();
      session.startTransaction();
      inTx = true;
    } catch {
      if (session) {
        session.endSession();
        session = null;
      }
    }
  }

  if (session && inTx) {
    try {
      const reservation = await StudioReservation.findOneAndUpdate(
        { orderId, status: { $in: ["committed", "reserved"] } },
        {
          $set: {
            status: "restocked",
            restockedAt: new Date(),
            releaseReason: reason || "Order cancelled - stock restocked",
          },
        },
        { new: false, session }
      );

      if (!reservation) {
        await session.abortTransaction();
        return { success: true, restocked: false, message: "Reservation already restocked concurrently" };
      }

      // Restore stock for all components atomically inside the transaction
      for (const item of reservation.items) {
        await StudioMaterial.updateOne(
          { "variants.sku": item.sku },
          { $inc: { "variants.$.stock": item.quantity } },
          { session }
        );
      }

      await Order.updateOne(
        { _id: orderId },
        { $set: { studioReservationStatus: "restocked" } },
        { session }
      );

      await session.commitTransaction();
      return { success: true, restocked: true, message: "Components restocked to inventory" };
    } catch (err) {
      await session.abortTransaction();
      throw err;
    } finally {
      session.endSession();
    }
  }

  // 2. Non-transactional fallback with recoverable compensation mechanism:
  // Atomically claim the document
  const reservation = await StudioReservation.findOneAndUpdate(
    { orderId, status: { $in: ["committed", "reserved"] } },
    {
      $set: {
        status: "restocked",
        restockedAt: new Date(),
        releaseReason: reason || "Order cancelled - stock restocked",
      },
    },
    { new: false }
  );

  if (!reservation) {
    return { success: true, restocked: false, message: "Reservation already restocked concurrently" };
  }

  const restockedItems: Array<{ sku: string; quantity: number }> = [];
  try {
    for (const item of reservation.items) {
      await StudioMaterial.updateOne(
        { "variants.sku": item.sku },
        { $inc: { "variants.$.stock": item.quantity } }
      );
      restockedItems.push({ sku: item.sku, quantity: item.quantity });
    }

    await Order.updateOne(
      { _id: orderId },
      { $set: { studioReservationStatus: "restocked" } }
    );

    return { success: true, restocked: true, message: "Components restocked to inventory" };
  } catch (err: any) {
    // RECOVERABLE COMPENSATION:
    // If any failure occurs during stock restoration, roll back any partially restocked items
    for (const r of restockedItems) {
      try {
        await StudioMaterial.updateOne(
          { "variants.sku": r.sku },
          { $inc: { "variants.$.stock": -r.quantity } }
        );
      } catch (rollbackErr) {
        console.error(`[studio-inventory] Failed rolling back restocked stock for ${r.sku}:`, rollbackErr);
      }
    }

    // Revert reservation status back to previous status so retries are NOT blocked
    try {
      await StudioReservation.updateOne(
        { _id: reservation._id },
        {
          $set: {
            status: previousStatus,
            releaseReason: `Restock failed: ${err?.message || "Unknown error"}. Reverted for retry.`,
          },
          $unset: { restockedAt: 1 },
        }
      );
    } catch (revertErr) {
      console.error("[studio-inventory] Failed to revert reservation status:", revertErr);
    }

    throw err;
  }
}

/**
 * Cleans up expired reservations where payment was never completed.
 * Safety: Never releases inventory belonging to a successfully paid order.
 */
export async function cleanupExpiredStudioReservations(): Promise<{
  checked: number;
  released: number;
  committed: number;
  errors: string[];
}> {
  const now = new Date();
  const expiredReservations = await StudioReservation.find({
    status: "reserved",
    expiresAt: { $lt: now },
  });

  let releasedCount = 0;
  let committedCount = 0;
  const errors: string[] = [];

  for (const reservation of expiredReservations) {
    try {
      const order = await Order.findById(reservation.orderId);

      // Safety check: if order is already paid, DO NOT release! Commit it instead!
      if (order && order.paymentStatus === "paid") {
        await commitStudioReservation(reservation.orderId);
        committedCount++;
        continue;
      }

      // Order unpaid & expired: release reservation
      const res = await releaseStudioReservation(reservation.orderId, "Reservation timeout expired");
      if (res.released) {
        releasedCount++;
        if (order && order.paymentStatus === "pending") {
          order.paymentStatus = "failed";
          order.notes = `${order.notes || ""}\nStock reservation expired`.trim();
          order.statusHistory.push({
            status: "pending",
            note: "Stock reservation expired; order cancelled",
            changedAt: new Date(),
          });
          await order.save();
        }
      }
    } catch (err: any) {
      errors.push(`Error cleaning reservation ${reservation._id}: ${err?.message}`);
    }
  }

  return {
    checked: expiredReservations.length,
    released: releasedCount,
    committed: committedCount,
    errors,
  };
}

/**
 * Reconciles an order flagged for administrative action (e.g. late payment stock conflict).
 */
export async function reconcileStudioReservation(
  reservationId: string,
  action: "force_commit" | "refund_and_release",
  adminNotes?: string
): Promise<IStudioReservation> {
  const reservation = await StudioReservation.findById(reservationId);
  if (!reservation) {
    throw new AppError("Studio reservation not found", 404);
  }

  if (action === "force_commit") {
    reservation.status = "committed";
    reservation.committedAt = new Date();
    reservation.reconciliationNotes = `Force-committed by admin: ${adminNotes || "Stock manually adjusted"}`;
    await reservation.save();

    await Order.updateOne(
      { _id: reservation.orderId },
      {
        $set: {
          studioReservationStatus: "committed",
          fulfillmentStatus: "completed",
        },
        $push: {
          statusHistory: {
            status: "processing",
            note: `Admin reconciled reservation: ${adminNotes || "Stock resolved"}`,
            changedAt: new Date(),
          },
        },
      }
    );
  } else if (action === "refund_and_release") {
    // Release if any stock was held
    reservation.status = "released";
    reservation.releasedAt = new Date();
    reservation.reconciliationNotes = `Released by admin for refund: ${adminNotes || "Customer refunded"}`;
    await reservation.save();

    await Order.updateOne(
      { _id: reservation.orderId },
      {
        $set: {
          studioReservationStatus: "released",
          status: "cancelled",
        },
        $push: {
          statusHistory: {
            status: "cancelled",
            note: `Admin reconciled order for refund/cancellation: ${adminNotes || "Inventory unavailable"}`,
            changedAt: new Date(),
          },
        },
      }
    );
  }

  return reservation;
}
