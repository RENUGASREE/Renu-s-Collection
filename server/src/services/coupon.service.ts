/**
 * ============================================================================
 * Coupon Service (Phase 3G)
 * ============================================================================
 *
 * Implements coupon validation, discount calculation, atomic redemption,
 * rollback, and administrative CRUD operations for Supabase PostgreSQL.
 *
 * Adheres strictly to:
 * - PostgreSQL repository layer (`PostgresCouponRepository`).
 * - Zero Mongoose dependencies.
 * - Concurrency protection: atomic usage limit increments.
 * - Rollback capability on payment failures or order cancellations.
 * - Dependency injection for test isolation without database writes.
 */

import { AppError } from "../middleware/errorHandler.js";
import { PostgresCouponRepository } from "../repositories/postgres-coupon.repository.js";
import {
  IDbClient,
  IDbPool,
  ICouponRecord,
  ICreateCouponData,
  IUpdateCouponData,
} from "../types/database.types.js";

let defaultRepo = new PostgresCouponRepository();

export function setCouponRepository(repo: PostgresCouponRepository): void {
  defaultRepo = repo;
}

export function setCouponDatabasePool(pool: IDbPool): void {
  defaultRepo = new PostgresCouponRepository(pool);
}

export function getCouponRepository(): PostgresCouponRepository {
  return defaultRepo;
}

/**
 * Pure helper to calculate discount amount based on coupon rules.
 */
export function calculateDiscount(coupon: ICouponRecord, subtotal: number): number {
  if (!coupon || subtotal <= 0) return 0;

  let discount =
    coupon.type === "percentage"
      ? (subtotal * coupon.value) / 100
      : coupon.value;

  if (coupon.maxDiscount !== undefined && coupon.maxDiscount > 0) {
    discount = Math.min(discount, coupon.maxDiscount);
  }

  // Discount cannot exceed subtotal
  discount = Math.min(discount, subtotal);
  // Round to 2 decimal places
  return Math.round(discount * 100) / 100;
}

/**
 * Validates a coupon code against order subtotal and active rules.
 */
export async function validateCoupon(
  code: string | undefined,
  subtotal: number,
  client?: IDbClient
): Promise<{ discount: number; coupon: ICouponRecord | null }> {
  if (!code || !code.trim()) {
    return { discount: 0, coupon: null };
  }

  const repo = defaultRepo;
  const coupon = await repo.findByCode(code.trim(), client);

  if (!coupon || !coupon.isActive) {
    throw new AppError("Invalid coupon code", 400);
  }

  const now = new Date();
  if (coupon.startsAt && new Date(coupon.startsAt) > now) {
    throw new AppError("Coupon is not active yet", 400);
  }

  if (coupon.expiresAt && new Date(coupon.expiresAt) < now) {
    throw new AppError("Coupon expired", 400);
  }

  if (coupon.usageLimit !== undefined && coupon.usedCount >= coupon.usageLimit) {
    throw new AppError("Coupon usage limit reached", 400);
  }

  if (subtotal < coupon.minOrderAmount) {
    throw new AppError(
      `Minimum order amount ₹${coupon.minOrderAmount} required`,
      400
    );
  }

  const discount = calculateDiscount(coupon, subtotal);
  return { discount, coupon };
}

/**
 * Atomically increments coupon usedCount if within usageLimit.
 */
export async function redeemCoupon(codeOrId: string, client?: IDbClient): Promise<boolean> {
  if (!codeOrId) return false;
  const repo = defaultRepo;
  return repo.atomicIncrementUsedCount(codeOrId, client);
}

/**
 * Decrements coupon usedCount (safe rollback).
 */
export async function rollbackCouponUsage(codeOrId: string, client?: IDbClient): Promise<boolean> {
  if (!codeOrId) return false;
  const repo = defaultRepo;
  return repo.decrementUsedCount(codeOrId, client);
}

/**
 * Get coupon by code.
 */
export async function getCouponByCode(code: string, client?: IDbClient): Promise<ICouponRecord | null> {
  if (!code) return null;
  return defaultRepo.findByCode(code, client);
}

/**
 * Get coupon by ID.
 */
export async function getCouponById(id: string, client?: IDbClient): Promise<ICouponRecord> {
  const coupon = await defaultRepo.findById(id, client);
  if (!coupon) {
    throw new AppError("Coupon not found", 404);
  }
  return coupon;
}

/**
 * List coupons with optional filtering and pagination.
 */
export async function listCoupons(
  options?: { isActive?: boolean; limit?: number; offset?: number },
  client?: IDbClient
): Promise<{ coupons: ICouponRecord[]; total: number }> {
  return defaultRepo.findAll(options, client);
}

/**
 * Create a new coupon.
 */
export async function createCoupon(
  data: ICreateCouponData,
  client?: IDbClient
): Promise<ICouponRecord> {
  if (!data.code || !data.code.trim()) {
    throw new AppError("Coupon code is required", 400);
  }
  if (!data.type || !["percentage", "fixed"].includes(data.type)) {
    throw new AppError("Invalid coupon type. Must be 'percentage' or 'fixed'", 400);
  }
  if (data.value === undefined || data.value <= 0) {
    throw new AppError("Coupon value must be greater than zero", 400);
  }
  if (data.type === "percentage" && data.value > 100) {
    throw new AppError("Percentage discount cannot exceed 100%", 400);
  }

  const existing = await defaultRepo.findByCode(data.code, client);
  if (existing) {
    throw new AppError(`Coupon with code '${data.code.toUpperCase()}' already exists`, 409);
  }

  return defaultRepo.create(data, client);
}

/**
 * Update a coupon by ID.
 */
export async function updateCoupon(
  id: string,
  data: IUpdateCouponData,
  client?: IDbClient
): Promise<ICouponRecord> {
  const existing = await defaultRepo.findById(id, client);
  if (!existing) {
    throw new AppError("Coupon not found", 404);
  }

  if (data.code && data.code.trim().toUpperCase() !== existing.code) {
    const codeConflict = await defaultRepo.findByCode(data.code, client);
    if (codeConflict && codeConflict.id !== id) {
      throw new AppError(`Coupon with code '${data.code.toUpperCase()}' already exists`, 409);
    }
  }

  if (data.value !== undefined && data.value <= 0) {
    throw new AppError("Coupon value must be greater than zero", 400);
  }

  const updated = await defaultRepo.updateById(id, data, client);
  if (!updated) {
    throw new AppError("Coupon not found", 404);
  }
  return updated;
}

/**
 * Delete a coupon by ID.
 */
export async function deleteCoupon(id: string, client?: IDbClient): Promise<void> {
  const existing = await defaultRepo.findById(id, client);
  if (!existing) {
    throw new AppError("Coupon not found", 404);
  }
  await defaultRepo.deleteById(id, client);
}
