/**
 * ============================================================================
 * Studio Inventory & Reservation Service (Phase 3H)
 * ============================================================================
 *
 * Implements atomic component-level stock reservation, verification, commitment,
 * release, and restocking for custom jewelry pieces in Supabase PostgreSQL.
 *
 * Adheres strictly to:
 * - PostgreSQL repository layer (`PostgresStudioRepository`, `PostgresStudioReservationRepository`, `PostgresOrderRepository`).
 * - Transactional consistency: reservation creation, commitment, and release cannot partially succeed.
 * - Idempotency safeguards: safe against duplicate payment webhooks and callbacks.
 * - Zero direct Mongoose dependencies.
 * - Dependency injection for test isolation without database writes.
 */

import { AppError } from "../middleware/errorHandler.js";
import { env } from "../config/env.js";
import { PostgresStudioRepository } from "../repositories/postgres-studio.repository.js";
import { PostgresStudioReservationRepository } from "../repositories/postgres-studio-reservation.repository.js";
import { PostgresOrderRepository } from "../repositories/postgres-order.repository.js";
import { PostgresDatabase, withTransaction } from "../db/postgres.js";
import {
  IDbClient,
  IStudioReservationRecord,
  StudioReservationStatusType,
} from "../types/database.types.js";

let defaultStudioRepo = new PostgresStudioRepository();
let defaultReservationRepo = new PostgresStudioReservationRepository();
let defaultOrderRepo = new PostgresOrderRepository();

export function setStudioRepository(repo: PostgresStudioRepository): void {
  defaultStudioRepo = repo;
}

export function setStudioReservationRepository(repo: PostgresStudioReservationRepository): void {
  defaultReservationRepo = repo;
}

export function setStudioOrderRepository(repo: PostgresOrderRepository): void {
  defaultOrderRepo = repo;
}

export function getStudioRepository(): PostgresStudioRepository {
  return defaultStudioRepo;
}

export function getStudioReservationRepository(): PostgresStudioReservationRepository {
  return defaultReservationRepo;
}

export interface AggregatedComponent {
  quantity: number;
  itemNames: string[];
}

export interface VerifiedComponent {
  quantity: number;
  materialId?: string | null;
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
 */
export async function validateCustomDesignStock(
  cartItems: Array<any>,
  client?: IDbClient
): Promise<Record<string, VerifiedComponent>> {
  const studioRepo = defaultStudioRepo;

  // 1. Verify jewellery category readiness for all custom designs
  for (const item of cartItems) {
    if (item.itemType === "product") continue;
    if (item.itemType === "custom_design" || item.studioDesign) {
      const sd = item.studioDesign;
      if (!sd) continue;
      if (sd.jewelleryType) {
        const jTypeSlug = String(sd.jewelleryType).toLowerCase().trim();
        const jType = await studioRepo.findJewelleryTypeBySlug(jTypeSlug, client);
        if (!jType || !jType.isPublished || jType.isEnabled === false || jType.isArchived) {
          throw new AppError(
            `Jewellery category "${sd.jewelleryType}" is currently unavailable or in preparation.`,
            400
          );
        }
        if (jType.designerStatus !== "available") {
          throw new AppError(
            `Jewellery category "${jType.displayName || sd.jewelleryType}" is currently not available for custom orders.`,
            400
          );
        }

        const constructionType = sd.constructionType ? String(sd.constructionType).toLowerCase().trim() : undefined;
        const rule = await studioRepo.findDesignRule(jTypeSlug, constructionType, client);
        if (!rule) {
          throw new AppError(
            `Jewellery category "${jType.displayName}" lacks an active manufacturing design rule.`,
            400
          );
        }

        const charge = await studioRepo.findMakingCharge(jTypeSlug, constructionType || "elastic_bead", client);
        if (!charge) {
          throw new AppError(
            `Jewellery category "${jType.displayName}" lacks configured craftsmanship making charges.`,
            400
          );
        }
      }
    }
  }

  const aggregated = aggregateCustomDesignComponents(cartItems);
  const skus = Object.keys(aggregated);
  if (skus.length === 0) return {};

  const verified: Record<string, VerifiedComponent> = {};

  // Query live catalogue for all referenced SKUs
  const materials = await studioRepo.findMaterialsBySkus(skus, client);

  const materialBySku = new Map<string, { material: any; variant: any }>();
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
      materialId: material.id,
      materialName: material.name,
      availableStock: variant.stock,
    };
  }

  return verified;
}

/**
 * Atomically reserves required component stock for an order using conditional PostgreSQL updates.
 * If concurrent requests exhaust stock on any component, all previously reserved components
 * in this attempt are immediately rolled back and released.
 */
export async function reserveStudioStockForOrder(params: {
  orderId: string;
  orderNumber: string;
  userId: string;
  cartItems: Array<any>;
  paymentMethod: string;
  expiryMinutes?: number;
  client?: IDbClient;
}): Promise<IStudioReservationRecord | null> {
  const studioRepo = defaultStudioRepo;
  const reservationRepo = defaultReservationRepo;

  const executeReservation = async (dbClient?: IDbClient) => {
    const verified = await validateCustomDesignStock(params.cartItems, dbClient);
    const skus = Object.keys(verified);
    if (skus.length === 0) return null;

    const successfullyReserved: Array<{ sku: string; quantity: number }> = [];

    try {
      for (const sku of skus) {
        const comp = verified[sku];
        const success = await studioRepo.atomicDecrementVariantStock(sku, comp.quantity, dbClient);
        if (!success) {
          throw new AppError(
            `Stock for component "${comp.materialName}" (${sku}) became unavailable during checkout reservation. Please review your cart.`,
            400
          );
        }
        successfullyReserved.push({ sku, quantity: comp.quantity });
      }
    } catch (err: any) {
      // In non-transactional or mocked client environments, run loop rollback
      if (!dbClient || !PostgresDatabase.isInitialized()) {
        for (const r of successfullyReserved) {
          try {
            await studioRepo.incrementVariantStock(r.sku, r.quantity, dbClient);
          } catch (rollbackErr) {
            console.error(`[studio-inventory] Rollback failure for ${r.sku}:`, rollbackErr);
          }
        }
      }
      throw err;
    }

    const isCod = params.paymentMethod.toLowerCase() === "cod";
    const initialStatus: StudioReservationStatusType = isCod ? "committed" : "reserved";
    const now = new Date();
    const timeoutMin = params.expiryMinutes || env.STUDIO_RESERVATION_TIMEOUT_MINUTES || 30;
    const expiresAt = new Date(now.getTime() + timeoutMin * 60 * 1000);

    const reservation = await reservationRepo.createReservation(
      {
        orderId: params.orderId,
        orderNumber: params.orderNumber,
        userId: params.userId,
        status: initialStatus,
        items: skus.map((sku) => ({
          materialId: verified[sku].materialId || null,
          materialName: verified[sku].materialName,
          sku,
          quantity: verified[sku].quantity,
        })),
        reservedAt: now,
        expiresAt,
        committedAt: isCod ? now : undefined,
      },
      dbClient
    );

    return reservation;
  };

  if (params.client) {
    return await executeReservation(params.client);
  }

  if (PostgresDatabase.isInitialized()) {
    return await withTransaction(PostgresDatabase.getPool(), executeReservation);
  }

  return await executeReservation();
}

/**
 * Commits a pending reservation to consumed stock upon verified payment.
 * Idempotent: safe against duplicate payment callbacks or webhooks.
 * If payment arrives late after reservation was released due to timeout:
 *   Attempts atomic re-reservation; if unavailable, flags order for safe admin reconciliation.
 */
export async function commitStudioReservation(
  orderId: string,
  client?: IDbClient
): Promise<{ success: boolean; status: StudioReservationStatusType; message: string }> {
  const reservationRepo = defaultReservationRepo;
  const studioRepo = defaultStudioRepo;
  const orderRepo = defaultOrderRepo;
  const now = new Date();

  // 1. Try atomic transition from "reserved" -> "committed"
  const transitioned = await reservationRepo.atomicTransitionStatus(
    orderId,
    ["reserved"],
    "committed",
    { committedAt: now },
    client
  );

  if (transitioned) {
    try {
      await orderRepo.updateById(orderId, { studioReservationStatus: "committed" }, client);
    } catch (orderUpdateErr) {
      console.error(`[commitStudioReservation] Failed to update order studio status:`, orderUpdateErr);
    }
    return { success: true, status: "committed", message: "Reservation committed to sale" };
  }

  // 2. Check existing reservation
  const reservation = await reservationRepo.findByOrderId(orderId, client);
  if (!reservation) {
    return { success: true, status: "committed", message: "No studio reservation required" };
  }

  if (reservation.status === "committed") {
    return { success: true, status: "committed", message: "Reservation already committed" };
  }

  // 3. Handle LATE PAYMENT after reservation was released due to timeout
  if (reservation.status === "released") {
    const locked = await reservationRepo.atomicTransitionStatus(
      orderId,
      ["released"],
      "reconciliation_required",
      { reconciliationNotes: "Processing late payment verification..." },
      client
    );

    if (!locked) {
      const refreshed = await reservationRepo.findByOrderId(orderId, client);
      return {
        success: refreshed?.status === "committed",
        status: refreshed?.status || "reconciliation_required",
        message: `Reservation current status: ${refreshed?.status}`,
      };
    }

    const reReserved: Array<{ sku: string; quantity: number }> = [];
    let reReserveFailed = false;

    for (const item of locked.items) {
      const success = await studioRepo.atomicDecrementVariantStock(item.sku, item.quantity, client);
      if (!success) {
        reReserveFailed = true;
        break;
      }
      reReserved.push({ sku: item.sku, quantity: item.quantity });
    }

    if (reReserveFailed) {
      // Rollback partially re-reserved items
      for (const r of reReserved) {
        await studioRepo.incrementVariantStock(r.sku, r.quantity, client);
      }

      await reservationRepo.updateReconciliation(
        locked.id,
        "reconciliation_required",
        "Late payment captured after reservation expiry, but components are now out of stock. Safe admin reconciliation required.",
        client
      );

      try {
        const order = await orderRepo.findById(orderId, client);
        const existingErrors = order?.fulfillmentErrors || [];
        await orderRepo.updateById(
          orderId,
          {
            studioReservationStatus: "reconciliation_required",
            fulfillmentStatus: "requires_action",
            fulfillmentErrors: [
              ...existingErrors,
              "Late payment received; custom jewelry components were reallocated and require admin reconciliation.",
            ],
          },
          client
        );
      } catch (err) {
        console.error("[commitStudioReservation] Error updating order fulfillment errors:", err);
      }

      return {
        success: false,
        status: "reconciliation_required",
        message: "Stock unavailable for late payment; flagged for reconciliation",
      };
    }

    // Re-reservation succeeded!
    await reservationRepo.atomicTransitionStatus(
      orderId,
      ["reconciliation_required"],
      "committed",
      { committedAt: new Date(), reconciliationNotes: "Re-reserved successfully upon late payment arrival" },
      client
    );

    try {
      await orderRepo.updateById(orderId, { studioReservationStatus: "committed" }, client);
    } catch (err) {
      console.error("[commitStudioReservation] Error updating order studio status:", err);
    }

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
 * Idempotent: will not release more than once.
 */
export async function releaseStudioReservation(
  orderId: string,
  reason?: string,
  client?: IDbClient
): Promise<{ success: boolean; released: boolean; message: string }> {
  const reservationRepo = defaultReservationRepo;
  const studioRepo = defaultStudioRepo;
  const orderRepo = defaultOrderRepo;

  const existing = await reservationRepo.findByOrderId(orderId, client);
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

  // Atomic transition from "reserved" -> "released"
  const transitioned = await reservationRepo.atomicTransitionStatus(
    orderId,
    ["reserved"],
    "released",
    { releasedAt: new Date(), releaseReason: reason || "Payment cancelled or failed" },
    client
  );

  if (!transitioned) {
    return { success: true, released: false, message: "Reservation already processed concurrently" };
  }

  // Restore component stock
  for (const item of transitioned.items) {
    try {
      await studioRepo.incrementVariantStock(item.sku, item.quantity, client);
    } catch (err) {
      console.error(`[releaseStudioReservation] Error restoring stock for SKU ${item.sku}:`, err);
    }
  }

  try {
    await orderRepo.updateById(orderId, { studioReservationStatus: "released" }, client);
  } catch (err) {
    console.error(`[releaseStudioReservation] Failed to update order studio status:`, err);
  }

  return { success: true, released: true, message: "Reservation released and stock restored" };
}

/**
 * Restores consumed component stock to the catalogue upon eligible order cancellation.
 * Idempotent: ensures stock is restored exactly once.
 */
export async function restockStudioReservation(
  orderId: string,
  reason?: string,
  client?: IDbClient
): Promise<{ success: boolean; restocked: boolean; message: string }> {
  const reservationRepo = defaultReservationRepo;
  const studioRepo = defaultStudioRepo;
  const orderRepo = defaultOrderRepo;

  const existing = await reservationRepo.findByOrderId(orderId, client);
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

  // Atomic transition to "restocked"
  const transitioned = await reservationRepo.atomicTransitionStatus(
    orderId,
    ["committed", "reserved"],
    "restocked",
    { restockedAt: new Date(), releaseReason: reason || "Order cancelled - stock restocked" },
    client
  );

  if (!transitioned) {
    return { success: true, restocked: false, message: "Reservation already restocked concurrently" };
  }

  // Restore component stock
  for (const item of transitioned.items) {
    try {
      await studioRepo.incrementVariantStock(item.sku, item.quantity, client);
    } catch (err) {
      console.error(`[restockStudioReservation] Error restocking SKU ${item.sku}:`, err);
    }
  }

  try {
    await orderRepo.updateById(orderId, { studioReservationStatus: "restocked" }, client);
  } catch (err) {
    console.error(`[restockStudioReservation] Failed to update order studio status:`, err);
  }

  return { success: true, restocked: true, message: "Components restocked to inventory" };
}

/**
 * Cleans up expired reservations where payment was never completed.
 * Safety: Never releases inventory belonging to a successfully paid order.
 */
export async function cleanupExpiredStudioReservations(client?: IDbClient): Promise<{
  checked: number;
  released: number;
  committed: number;
  errors: string[];
}> {
  const reservationRepo = defaultReservationRepo;
  const orderRepo = defaultOrderRepo;
  const now = new Date();

  const expiredReservations = await reservationRepo.findExpiredReservations(now, client);

  let releasedCount = 0;
  let committedCount = 0;
  const errors: string[] = [];

  for (const reservation of expiredReservations) {
    try {
      const order = await orderRepo.findById(reservation.orderId, client);

      // Safety check: if order is already paid, DO NOT release! Commit it instead!
      if (order && order.paymentStatus === "paid") {
        await commitStudioReservation(reservation.orderId, client);
        committedCount++;
        continue;
      }

      // Order unpaid & expired: release reservation
      const res = await releaseStudioReservation(reservation.orderId, "Reservation timeout expired", client);
      if (res.released) {
        releasedCount++;
        if (order && order.paymentStatus === "pending") {
          const notes = `${order.notes || ""}\nStock reservation expired`.trim();
          await orderRepo.updateById(
            order.id,
            {
              paymentStatus: "failed",
              notes,
            },
            client
          );
          await orderRepo.appendStatusHistory(
            order.id,
            {
              status: "pending",
              note: "Stock reservation expired; order cancelled",
              changedAt: new Date(),
            },
            client
          );
        }
      }
    } catch (err: any) {
      errors.push(`Error cleaning reservation ${reservation.id}: ${err?.message}`);
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
  adminNotes?: string,
  client?: IDbClient
): Promise<IStudioReservationRecord> {
  const reservationRepo = defaultReservationRepo;
  const orderRepo = defaultOrderRepo;

  const reservation = await reservationRepo.findById(reservationId, client);
  if (!reservation) {
    throw new AppError("Studio reservation not found", 404);
  }

  if (action === "force_commit") {
    const updated = await reservationRepo.updateReconciliation(
      reservationId,
      "committed",
      `Force-committed by admin: ${adminNotes || "Stock manually adjusted"}`,
      client
    );
    if (!updated) throw new AppError("Failed to update reservation", 500);

    await orderRepo.updateById(
      reservation.orderId,
      {
        studioReservationStatus: "committed",
        fulfillmentStatus: "completed",
      },
      client
    );
    await orderRepo.appendStatusHistory(
      reservation.orderId,
      {
        status: "processing",
        note: `Admin reconciled reservation: ${adminNotes || "Stock resolved"}`,
        changedAt: new Date(),
      },
      client
    );
    return updated;
  } else if (action === "refund_and_release") {
    const updated = await reservationRepo.updateReconciliation(
      reservationId,
      "released",
      `Released by admin for refund: ${adminNotes || "Customer refunded"}`,
      client
    );
    if (!updated) throw new AppError("Failed to update reservation", 500);

    await orderRepo.updateById(
      reservation.orderId,
      {
        studioReservationStatus: "released",
        status: "cancelled",
      },
      client
    );
    await orderRepo.appendStatusHistory(
      reservation.orderId,
      {
        status: "cancelled",
        note: `Admin reconciled order for refund/cancellation: ${adminNotes || "Inventory unavailable"}`,
        changedAt: new Date(),
      },
      client
    );
    return updated;
  }

  return reservation;
}
