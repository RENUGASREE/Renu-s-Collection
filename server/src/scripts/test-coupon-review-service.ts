/**
 * ============================================================================
 * Phase 3G: Coupon & Review Services Test Suite
 * ============================================================================
 *
 * Verifies that the migrated Coupon and Review services operate on Supabase
 * PostgreSQL while preserving discount rules, atomic concurrency protection,
 * review submissions, verified purchase checks, rating recalculation, admin
 * moderation, customer ownership permissions, and legacy API contracts.
 *
 * Zero live database writes (all write tests use in-memory mock repositories
 * and dependency injection).
 *
 * Run:
 *   node --env-file=server/.env server/node_modules/tsx/dist/cli.mjs \
 *     server/src/scripts/test-coupon-review-service.ts
 */

import { PostgresCouponRepository } from "../repositories/postgres-coupon.repository.js";
import { PostgresReviewRepository } from "../repositories/postgres-review.repository.js";
import { PostgresProductRepository } from "../repositories/postgres-product.repository.js";
import * as couponService from "../services/coupon.service.js";
import * as reviewService from "../services/review.service.js";
import * as reviewController from "../controllers/review.controller.js";
import {
  ICouponRecord,
  ICreateCouponData,
  IUpdateCouponData,
  IReviewRecord,
  ICreateReviewData,
  IUpdateReviewData,
  IProductRatingSummary,
} from "../types/database.types.js";
import { AppError } from "../middleware/errorHandler.js";

// ANSI color codes
const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const BLUE = "\x1b[34m";
const BOLD = "\x1b[1m";
const RESET = "\x1b[0m";

let passedTests = 0;
let failedTests = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    passedTests++;
    console.log(`  ${GREEN}✓${RESET} ${testName}`);
  } else {
    failedTests++;
    console.error(`  ${RED}✗${RESET} ${testName}`);
    if (detail) console.error(`    ${RED}Detail: ${detail}${RESET}`);
  }
}

// ---------------------------------------------------------------------------
// In-Memory Mock Coupon Repository
// ---------------------------------------------------------------------------

class MockCouponRepository extends PostgresCouponRepository {
  public coupons: Map<string, ICouponRecord> = new Map();

  constructor(initialCoupons: ICouponRecord[] = []) {
    super();
    for (const c of initialCoupons) {
      this.coupons.set(c.id, { ...c });
    }
  }

  public async findByCode(code: string): Promise<ICouponRecord | null> {
    if (!code) return null;
    const upper = code.trim().toUpperCase();
    for (const c of this.coupons.values()) {
      if (c.code.toUpperCase() === upper) {
        return { ...c };
      }
    }
    return null;
  }

  public async findById(id: string): Promise<ICouponRecord | null> {
    const found = this.coupons.get(id);
    return found ? { ...found } : null;
  }

  public async findAll(options?: { isActive?: boolean; limit?: number; offset?: number }): Promise<{
    coupons: ICouponRecord[];
    total: number;
  }> {
    let list = Array.from(this.coupons.values());
    if (options?.isActive !== undefined) {
      list = list.filter((c) => c.isActive === options.isActive);
    }
    const total = list.length;
    const offset = options?.offset ?? 0;
    const limit = options?.limit ?? list.length;
    return {
      coupons: list.slice(offset, offset + limit),
      total,
    };
  }

  public async create(data: ICreateCouponData): Promise<ICouponRecord> {
    const id = data.id || `coupon-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const record: ICouponRecord = {
      id,
      code: data.code.trim().toUpperCase(),
      description: data.description,
      type: data.type,
      value: data.value,
      minOrderAmount: data.minOrderAmount ?? 0,
      maxDiscount: data.maxDiscount,
      usageLimit: data.usageLimit,
      usedCount: data.usedCount ?? 0,
      isActive: data.isActive !== undefined ? data.isActive : true,
      startsAt: data.startsAt ? new Date(data.startsAt) : undefined,
      expiresAt: data.expiresAt ? new Date(data.expiresAt) : undefined,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.coupons.set(id, record);
    return { ...record };
  }

  public async updateById(id: string, data: IUpdateCouponData): Promise<ICouponRecord | null> {
    const existing = this.coupons.get(id);
    if (!existing) return null;

    const updated: ICouponRecord = {
      ...existing,
      code: data.code !== undefined ? data.code.trim().toUpperCase() : existing.code,
      description: data.description !== undefined ? data.description : existing.description,
      type: data.type !== undefined ? data.type : existing.type,
      value: data.value !== undefined ? data.value : existing.value,
      minOrderAmount: data.minOrderAmount !== undefined ? data.minOrderAmount : existing.minOrderAmount,
      maxDiscount: data.maxDiscount !== undefined ? data.maxDiscount : existing.maxDiscount,
      usageLimit: data.usageLimit !== undefined ? data.usageLimit : existing.usageLimit,
      usedCount: data.usedCount !== undefined ? data.usedCount : existing.usedCount,
      isActive: data.isActive !== undefined ? data.isActive : existing.isActive,
      startsAt: data.startsAt !== undefined ? (data.startsAt ? new Date(data.startsAt) : undefined) : existing.startsAt,
      expiresAt: data.expiresAt !== undefined ? (data.expiresAt ? new Date(data.expiresAt) : undefined) : existing.expiresAt,
      updatedAt: new Date(),
    };

    this.coupons.set(id, updated);
    return { ...updated };
  }

  public async deleteById(id: string): Promise<boolean> {
    return this.coupons.delete(id);
  }

  public async atomicIncrementUsedCount(idOrCode: string): Promise<boolean> {
    const upper = idOrCode.trim().toUpperCase();
    for (const [id, c] of this.coupons.entries()) {
      if (id === idOrCode || c.code.toUpperCase() === upper) {
        if (!c.isActive) return false;
        if (c.usageLimit !== undefined && c.usedCount >= c.usageLimit) {
          return false;
        }
        c.usedCount += 1;
        c.updatedAt = new Date();
        this.coupons.set(id, c);
        return true;
      }
    }
    return false;
  }

  public async decrementUsedCount(idOrCode: string): Promise<boolean> {
    const upper = idOrCode.trim().toUpperCase();
    for (const [id, c] of this.coupons.entries()) {
      if (id === idOrCode || c.code.toUpperCase() === upper) {
        c.usedCount = Math.max(0, c.usedCount - 1);
        c.updatedAt = new Date();
        this.coupons.set(id, c);
        return true;
      }
    }
    return false;
  }
}

// ---------------------------------------------------------------------------
// In-Memory Mock Review Repository
// ---------------------------------------------------------------------------

class MockReviewRepository extends PostgresReviewRepository {
  public reviews: Map<string, IReviewRecord> = new Map();
  public verifiedPurchases: Set<string> = new Set(); // "userId:productId"

  constructor(initialReviews: IReviewRecord[] = []) {
    super();
    for (const r of initialReviews) {
      this.reviews.set(r.id, { ...r });
    }
  }

  public async findById(id: string): Promise<IReviewRecord | null> {
    const found = this.reviews.get(id);
    return found ? { ...found } : null;
  }

  public async findByUserAndProduct(userId: string, productId: string): Promise<IReviewRecord | null> {
    for (const r of this.reviews.values()) {
      if (r.userId === userId && r.productId === productId) {
        return { ...r };
      }
    }
    return null;
  }

  public async findByProductId(
    productId: string,
    options?: { isApproved?: boolean; limit?: number; offset?: number }
  ): Promise<{ reviews: IReviewRecord[]; total: number }> {
    let list = Array.from(this.reviews.values()).filter((r) => r.productId === productId);
    if (options?.isApproved !== undefined) {
      list = list.filter((r) => r.isApproved === options.isApproved);
    }
    const total = list.length;
    const offset = options?.offset ?? 0;
    const limit = options?.limit ?? list.length;
    return {
      reviews: list.slice(offset, offset + limit),
      total,
    };
  }

  public async findAll(options?: { isApproved?: boolean; limit?: number; offset?: number }): Promise<{
    reviews: IReviewRecord[];
    total: number;
  }> {
    let list = Array.from(this.reviews.values());
    if (options?.isApproved !== undefined) {
      list = list.filter((r) => r.isApproved === options.isApproved);
    }
    const total = list.length;
    const offset = options?.offset ?? 0;
    const limit = options?.limit ?? list.length;
    return {
      reviews: list.slice(offset, offset + limit),
      total,
    };
  }

  public async create(data: ICreateReviewData): Promise<IReviewRecord> {
    const id = data.id || `review-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const record: IReviewRecord = {
      id,
      userId: data.userId,
      productId: data.productId,
      orderId: data.orderId || null,
      rating: data.rating,
      title: data.title,
      body: data.body,
      images: data.images ?? [],
      isVerifiedPurchase: Boolean(data.isVerifiedPurchase),
      isApproved: Boolean(data.isApproved),
      helpfulCount: data.helpfulCount ?? 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      user: {
        username: "TestCustomer",
        email: "customer@example.com",
      },
    };
    this.reviews.set(id, record);
    return { ...record };
  }

  public async updateById(id: string, data: IUpdateReviewData): Promise<IReviewRecord | null> {
    const existing = this.reviews.get(id);
    if (!existing) return null;
    const updated: IReviewRecord = {
      ...existing,
      rating: data.rating !== undefined ? data.rating : existing.rating,
      title: data.title !== undefined ? data.title : existing.title,
      body: data.body !== undefined ? data.body : existing.body,
      images: data.images !== undefined ? data.images : existing.images,
      isApproved: data.isApproved !== undefined ? data.isApproved : existing.isApproved,
      helpfulCount: data.helpfulCount !== undefined ? data.helpfulCount : existing.helpfulCount,
      updatedAt: new Date(),
    };
    this.reviews.set(id, updated);
    return { ...updated };
  }

  public async deleteById(id: string): Promise<boolean> {
    return this.reviews.delete(id);
  }

  public async incrementHelpfulCount(id: string): Promise<IReviewRecord | null> {
    const existing = this.reviews.get(id);
    if (!existing) return null;
    existing.helpfulCount += 1;
    existing.updatedAt = new Date();
    this.reviews.set(id, existing);
    return { ...existing };
  }

  public async setApproval(id: string, isApproved: boolean): Promise<IReviewRecord | null> {
    const existing = this.reviews.get(id);
    if (!existing) return null;
    existing.isApproved = isApproved;
    existing.updatedAt = new Date();
    this.reviews.set(id, existing);
    return { ...existing };
  }

  public async calculateRatingSummary(productId: string): Promise<IProductRatingSummary> {
    const approved = Array.from(this.reviews.values()).filter(
      (r) => r.productId === productId && r.isApproved === true
    );
    if (approved.length === 0) {
      return { averageRating: 0, reviewCount: 0 };
    }
    const sum = approved.reduce((acc, r) => acc + r.rating, 0);
    const avg = Math.round((sum / approved.length) * 10) / 10;
    return {
      averageRating: avg,
      reviewCount: approved.length,
    };
  }

  public async checkVerifiedPurchase(
    userId: string,
    productId: string
  ): Promise<{ isVerified: boolean; orderId?: string }> {
    const key = `${userId}:${productId}`;
    if (this.verifiedPurchases.has(key)) {
      return { isVerified: true, orderId: `order-verified-${Date.now()}` };
    }
    return { isVerified: false };
  }
}

// ---------------------------------------------------------------------------
// In-Memory Mock Product Repository
// ---------------------------------------------------------------------------

class MockProductRepository extends PostgresProductRepository {
  public products: Map<string, any> = new Map();

  constructor(initialProducts: any[] = []) {
    super();
    for (const p of initialProducts) {
      this.products.set(p.id, { ...p });
    }
  }

  public async findById(id: string): Promise<any | null> {
    const found = this.products.get(id);
    return found ? { ...found } : null;
  }

  public async updateById(id: string, data: any): Promise<any | null> {
    const existing = this.products.get(id);
    if (!existing) return null;
    const updated = { ...existing, ...data, updatedAt: new Date() };
    this.products.set(id, updated);
    return { ...updated };
  }
}

// ---------------------------------------------------------------------------
// Test Runner
// ---------------------------------------------------------------------------

async function runTests() {
  console.log(`${BOLD}${BLUE}=== Running Phase 3G: Coupon & Review Services Test Suite ===${RESET}\n`);

  // Setup sample data
  const testProductId = "prod-00000000-0000-0000-0000-000000000001";
  const testUserId1 = "user-00000000-0000-0000-0000-000000000001";
  const testUserId2 = "user-00000000-0000-0000-0000-000000000002";
  const adminUserId = "user-00000000-0000-0000-0000-admin0000001";

  const initialProducts = [
    {
      id: testProductId,
      name: "Handcrafted Silver Filigree Necklace",
      slug: "handcrafted-silver-filigree-necklace",
      basePrice: 2500,
      stock: 10,
      isActive: true,
      averageRating: 0,
      reviewCount: 0,
    },
  ];

  const initialCoupons: ICouponRecord[] = [
    {
      id: "coupon-1",
      code: "FESTIVE10",
      description: "10% off on all orders above ₹1000",
      type: "percentage",
      value: 10,
      minOrderAmount: 1000,
      maxDiscount: 500,
      usageLimit: 100,
      usedCount: 5,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: "coupon-2",
      code: "FLAT300",
      description: "Flat ₹300 off on orders above ₹1500",
      type: "fixed",
      value: 300,
      minOrderAmount: 1500,
      usedCount: 0,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: "coupon-3",
      code: "EXPIRED50",
      type: "percentage",
      value: 50,
      minOrderAmount: 0,
      usedCount: 0,
      isActive: true,
      expiresAt: new Date(Date.now() - 86400000), // 1 day in past
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: "coupon-4",
      code: "FUTURE20",
      type: "percentage",
      value: 20,
      minOrderAmount: 0,
      usedCount: 0,
      isActive: true,
      startsAt: new Date(Date.now() + 86400000), // 1 day in future
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: "coupon-5",
      code: "LIMIT1",
      type: "fixed",
      value: 100,
      minOrderAmount: 0,
      usageLimit: 1,
      usedCount: 1, // Already reached
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: "coupon-6",
      code: "INACTIVE99",
      type: "percentage",
      value: 99,
      minOrderAmount: 0,
      usedCount: 0,
      isActive: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ];

  const mockCouponRepo = new MockCouponRepository(initialCoupons);
  const mockReviewRepo = new MockReviewRepository();
  const mockProductRepo = new MockProductRepository(initialProducts);

  couponService.setCouponRepository(mockCouponRepo);
  reviewService.setReviewRepository(mockReviewRepo);
  reviewService.setReviewProductRepository(mockProductRepo);

  console.log(`${BOLD}--- Section 1: Coupon Validation & Calculations ---${RESET}`);

  // Test 1: Percentage coupon calculation
  const res1 = await couponService.validateCoupon("festive10", 2000);
  assert(
    res1.discount === 200 && res1.coupon?.code === "FESTIVE10",
    "1. Percentage coupon discount correctly calculated (10% on ₹2000 = ₹200)"
  );

  // Test 2: Fixed coupon calculation
  const res2 = await couponService.validateCoupon("FLAT300", 2000);
  assert(
    res2.discount === 300 && res2.coupon?.code === "FLAT300",
    "2. Fixed coupon discount correctly calculated (Flat ₹300)"
  );

  // Test 3: Percentage discount capped at maxDiscount
  const res3 = await couponService.validateCoupon("FESTIVE10", 10000);
  assert(
    res3.discount === 500,
    "3. Percentage discount correctly capped at maxDiscount (10% of 10000 = 1000, capped at ₹500)"
  );

  // Test 4: Subtotal capping (discount cannot exceed subtotal)
  await mockCouponRepo.create({
    code: "MEGA1000",
    type: "fixed",
    value: 1000,
    minOrderAmount: 0,
  });
  const res4 = await couponService.validateCoupon("MEGA1000", 450);
  assert(
    res4.discount === 450,
    "4. Discount capped at order subtotal (₹1000 fixed discount capped at ₹450 subtotal)"
  );

  // Test 5: Inactive coupon rejected
  try {
    await couponService.validateCoupon("INACTIVE99", 500);
    assert(false, "5. Inactive coupon should throw AppError 400");
  } catch (err: any) {
    assert(
      err instanceof AppError && err.statusCode === 400 && err.message === "Invalid coupon code",
      "5. Inactive coupon rejected with AppError 400"
    );
  }

  // Test 6: Unknown coupon rejected
  try {
    await couponService.validateCoupon("UNKNOWN123", 500);
    assert(false, "6. Unknown coupon should throw AppError 400");
  } catch (err: any) {
    assert(
      err instanceof AppError && err.statusCode === 400 && err.message === "Invalid coupon code",
      "6. Unknown coupon rejected with AppError 400"
    );
  }

  // Test 7: Expired coupon rejected
  try {
    await couponService.validateCoupon("EXPIRED50", 1000);
    assert(false, "7. Expired coupon should throw AppError 400");
  } catch (err: any) {
    assert(
      err instanceof AppError && err.statusCode === 400 && err.message === "Coupon expired",
      "7. Expired coupon rejected with AppError 400 ('Coupon expired')"
    );
  }

  // Test 8: Not-yet-started coupon rejected
  try {
    await couponService.validateCoupon("FUTURE20", 1000);
    assert(false, "8. Future coupon should throw AppError 400");
  } catch (err: any) {
    assert(
      err instanceof AppError && err.statusCode === 400 && err.message === "Coupon is not active yet",
      "8. Future coupon rejected with AppError 400 ('Coupon is not active yet')"
    );
  }

  // Test 9: Usage limit reached coupon rejected
  try {
    await couponService.validateCoupon("LIMIT1", 1000);
    assert(false, "9. Usage limit reached coupon should throw AppError 400");
  } catch (err: any) {
    assert(
      err instanceof AppError && err.statusCode === 400 && err.message === "Coupon usage limit reached",
      "9. Usage limit reached coupon rejected with AppError 400"
    );
  }

  // Test 10: Minimum order amount requirement
  try {
    await couponService.validateCoupon("FESTIVE10", 800); // min is 1000
    assert(false, "10. Below minOrderAmount should throw AppError 400");
  } catch (err: any) {
    assert(
      err instanceof AppError && err.statusCode === 400 && err.message.includes("Minimum order amount"),
      "10. Below minimum order amount rejected with descriptive error message"
    );
  }

  // Test 11: Empty coupon code returns 0 discount
  const res11 = await couponService.validateCoupon("", 1000);
  assert(
    res11.discount === 0 && res11.coupon === null,
    "11. Empty/undefined coupon code returns { discount: 0, coupon: null }"
  );

  console.log(`\n${BOLD}--- Section 2: Atomic Concurrency Redemption & Rollback ---${RESET}`);

  // Test 12: Atomic increment usedCount
  const couponBefore = await mockCouponRepo.findByCode("FESTIVE10");
  const initialUsed = couponBefore?.usedCount ?? 0;
  const incrementSuccess = await couponService.redeemCoupon("FESTIVE10");
  const couponAfter = await mockCouponRepo.findByCode("FESTIVE10");
  assert(
    incrementSuccess === true && couponAfter?.usedCount === initialUsed + 1,
    "12. Atomic redeemCoupon incremented usedCount successfully"
  );

  // Test 13: Atomic increment rejects when usage limit is hit
  await mockCouponRepo.create({
    code: "ONETIME",
    type: "fixed",
    value: 50,
    usageLimit: 1,
    usedCount: 0,
    isActive: true,
  });
  const firstClaim = await couponService.redeemCoupon("ONETIME");
  const secondClaim = await couponService.redeemCoupon("ONETIME");
  assert(
    firstClaim === true && secondClaim === false,
    "13. Atomic redeemCoupon allows single winner when usage limit is reached"
  );

  // Test 14: Rollback coupon usage
  const rollbackSuccess = await couponService.rollbackCouponUsage("ONETIME");
  const rolledBackCoupon = await mockCouponRepo.findByCode("ONETIME");
  assert(
    rollbackSuccess === true && rolledBackCoupon?.usedCount === 0,
    "14. Rollback coupon usage safely decremented usedCount"
  );

  console.log(`\n${BOLD}--- Section 3: Coupon Administrative CRUD Operations ---${RESET}`);

  // Test 15: Create new coupon
  const createdCoupon = await couponService.createCoupon({
    code: "WELCOME20",
    description: "Welcome discount for new members",
    type: "percentage",
    value: 20,
    minOrderAmount: 500,
  });
  assert(
    createdCoupon.code === "WELCOME20" && createdCoupon.value === 20,
    "15. Admin createCoupon creates new active coupon"
  );

  // Test 16: Duplicate coupon code rejected
  try {
    await couponService.createCoupon({
      code: "WELCOME20",
      type: "percentage",
      value: 15,
    });
    assert(false, "16. Duplicate coupon code should throw AppError 409");
  } catch (err: any) {
    assert(
      err instanceof AppError && err.statusCode === 409,
      "16. Duplicate coupon code rejected with AppError 409"
    );
  }

  // Test 17: Update coupon
  const updatedCoupon = await couponService.updateCoupon(createdCoupon.id, {
    description: "Updated welcome discount description",
    value: 25,
  });
  assert(
    updatedCoupon.value === 25 && updatedCoupon.description === "Updated welcome discount description",
    "17. Admin updateCoupon successfully updates coupon properties"
  );

  // Test 18: Delete coupon
  await couponService.deleteCoupon(createdCoupon.id);
  const deletedCheck = await mockCouponRepo.findById(createdCoupon.id);
  assert(
    deletedCheck === null,
    "18. Admin deleteCoupon successfully deletes coupon"
  );

  console.log(`\n${BOLD}--- Section 4: Review Creation & Verified Purchase ---${RESET}`);

  // Mock verified purchase for testUserId1
  mockReviewRepo.verifiedPurchases.add(`${testUserId1}:${testProductId}`);

  // Test 19: Create review with verified purchase
  const review1 = await reviewService.createReview(testUserId1, {
    productId: testProductId,
    rating: 5,
    title: "Exquisite craftsmanship!",
    body: "The silver filigree work is stunning, beyond my expectations.",
    images: ["https://example.com/necklace1.jpg"],
  });
  assert(
    review1.isVerifiedPurchase === true &&
      review1.isApproved === false &&
      review1.rating === 5,
    "19. Customer review created with verified purchase and initial isApproved: false"
  );

  // Test 20: Prevent duplicate reviews for same user and product
  try {
    await reviewService.createReview(testUserId1, {
      productId: testProductId,
      rating: 4,
      title: "Another review",
      body: "Trying to submit another review.",
    });
    assert(false, "20. Duplicate review should throw AppError 409");
  } catch (err: any) {
    assert(
      err instanceof AppError && err.statusCode === 409 && err.message === "You already reviewed this product",
      "20. Duplicate review by same customer rejected with AppError 409 ('You already reviewed this product')"
    );
  }

  // Test 21: Create review for non-existent product throws 404
  try {
    await reviewService.createReview(testUserId2, {
      productId: "prod-00000000-0000-0000-0000-000000000999",
      rating: 5,
      title: "Invalid product",
      body: "Product does not exist",
    });
    assert(false, "21. Review for non-existent product should throw AppError 404");
  } catch (err: any) {
    assert(
      err instanceof AppError && err.statusCode === 404 && err.message === "Product not found",
      "21. Review for non-existent product rejected with AppError 404"
    );
  }

  // Test 22: Rating bounds check (reject rating < 1 or > 5)
  try {
    await reviewService.createReview(testUserId2, {
      productId: testProductId,
      rating: 6,
      title: "Invalid rating",
      body: "Rating is 6",
    });
    assert(false, "22. Rating > 5 should throw AppError 400");
  } catch (err: any) {
    assert(
      err instanceof AppError && err.statusCode === 400,
      "22. Rating outside 1-5 range rejected with AppError 400"
    );
  }

  // Test 23: Create unverified review from testUserId2
  const review2 = await reviewService.createReview(testUserId2, {
    productId: testProductId,
    rating: 4,
    title: "Lovely necklace",
    body: "Gifted to my sister, she loved the design.",
  });
  assert(
    review2.isVerifiedPurchase === false && review2.isApproved === false,
    "23. Review from customer without purchase created with isVerifiedPurchase: false"
  );

  console.log(`\n${BOLD}--- Section 5: Review Moderation & Rating Recalculation ---${RESET}`);

  // Test 24: Public reviews list only approved reviews
  const publicListBefore = await reviewService.listProductReviews(testProductId);
  assert(
    publicListBefore.length === 0,
    "24. Public listing returns 0 reviews when none are approved yet"
  );

  // Test 25: Admin approves review1
  const approvedReview1 = await reviewService.approveReview(review1.id);
  const updatedProductAfterApprove1 = await mockProductRepo.findById(testProductId);
  assert(
    approvedReview1.isApproved === true &&
      updatedProductAfterApprove1.averageRating === 5 &&
      updatedProductAfterApprove1.reviewCount === 1,
    "25. Admin approveReview sets isApproved: true and updates product averageRating (5.0) and reviewCount (1)"
  );

  // Test 26: Admin approves review2
  await reviewService.approveReview(review2.id);
  const updatedProductAfterApprove2 = await mockProductRepo.findById(testProductId);
  assert(
    updatedProductAfterApprove2.averageRating === 4.5 &&
      updatedProductAfterApprove2.reviewCount === 2,
    "26. Approving second review (rating 4) recalculates averageRating to 4.5 and reviewCount to 2"
  );

  // Test 27: Public reviews list now returns both approved reviews
  const publicListAfter = await reviewService.listProductReviews(testProductId);
  assert(
    publicListAfter.length === 2,
    "27. Public listing returns 2 approved reviews"
  );

  // Test 28: Helpful count increment
  const helpfulReview = await reviewService.markReviewHelpful(review1.id);
  assert(
    helpfulReview.helpfulCount === 1,
    "28. markReviewHelpful increments helpfulCount to 1"
  );

  // Test 29: Admin reject review
  await reviewService.rejectReview(review2.id);
  const updatedProductAfterReject = await mockProductRepo.findById(testProductId);
  assert(
    updatedProductAfterReject.averageRating === 5 &&
      updatedProductAfterReject.reviewCount === 1,
    "29. Admin rejectReview sets isApproved: false and recalculates product rating back to 5.0 (count: 1)"
  );

  console.log(`\n${BOLD}--- Section 6: Review Permissions & Deletions ---${RESET}`);

  // Test 30: Non-owner non-admin user cannot delete review
  try {
    await reviewService.deleteReview(review1.id, "unauthorized-user-id", "customer");
    assert(false, "30. Unauthorized delete should throw AppError 403");
  } catch (err: any) {
    assert(
      err instanceof AppError && err.statusCode === 403,
      "30. Unauthorized user delete rejected with AppError 403 ('You do not have permission to delete this review')"
    );
  }

  // Test 31: Customer can delete their own review
  await reviewService.deleteReview(review2.id, testUserId2, "customer");
  const checkReview2 = await mockReviewRepo.findById(review2.id);
  assert(
    checkReview2 === null,
    "31. Customer successfully deletes their own review"
  );

  // Test 32: Admin can delete any review
  await reviewService.deleteReview(review1.id, adminUserId, "admin");
  const checkReview1 = await mockReviewRepo.findById(review1.id);
  const productAfterAllDeleted = await mockProductRepo.findById(testProductId);
  assert(
    checkReview1 === null &&
      productAfterAllDeleted.averageRating === 0 &&
      productAfterAllDeleted.reviewCount === 0,
    "32. Admin successfully deletes review and product rating cache resets to 0.0 (count: 0)"
  );

  console.log(`\n${BOLD}--- Section 7: Controller & Legacy Response Contracts ---${RESET}`);

  // Test 33: Controller getProductReviews formatting & pagination
  // Create an approved review for testing controller
  const testReview = await mockReviewRepo.create({
    userId: testUserId1,
    productId: testProductId,
    rating: 5,
    title: "Controller Test Review",
    body: "Testing controller response shape",
    isApproved: true,
  });

  const controllerRes = await reviewController.getProductReviews(testProductId, 1, 10);
  assert(
    controllerRes.reviews.length === 1 &&
      controllerRes.reviews[0].id === testReview.id &&
      controllerRes.reviews[0].username === "TestCustomer" &&
      controllerRes.total === 1 &&
      controllerRes.page === 1 &&
      controllerRes.limit === 10,
    "33. Controller getProductReviews returns paginated response matching legacy contract"
  );

  // Test 34: Controller getAllReviews includes _key
  const allReviewsRes = await reviewController.getAllReviews();
  assert(
    allReviewsRes.length >= 1 && typeof allReviewsRes[0]._key === "string",
    "34. Controller getAllReviews returns items with _key property preserved"
  );

  // Test 35: toLegacyReview helper contract
  const legacyDoc = reviewService.toLegacyReview({
    id: "rev-123",
    userId: "usr-456",
    user: { username: "RenuG", email: "renu@example.com" },
    productId: "prd-789",
    rating: 5,
    title: "Magnificent",
    body: "Truly regal piece",
    isVerifiedPurchase: true,
    isApproved: true,
    helpfulCount: 3,
    images: ["https://example.com/image.png"],
  });
  assert(
    legacyDoc.id === "rev-123" &&
      legacyDoc.userId === "usr-456" &&
      legacyDoc.username === "RenuG" &&
      legacyDoc.isVerifiedPurchase === true &&
      legacyDoc.helpfulCount === 3,
    "35. toLegacyReview correctly formats record into expected API schema"
  );

  // Summary
  console.log(`\n${BOLD}====================================================${RESET}`);
  console.log(`Test Results: ${GREEN}${passedTests} passed${RESET}, ${failedTests > 0 ? `${RED}${failedTests} failed` : `${GREEN}0 failed`}${RESET}`);
  console.log(`${BOLD}====================================================${RESET}\n`);

  if (failedTests > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
