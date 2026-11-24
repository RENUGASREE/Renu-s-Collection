/**
 * ============================================================================
 * Review Service (Phase 3G)
 * ============================================================================
 *
 * Implements product review management, customer review submissions, verified
 * purchase tracking, helpfulness voting, admin approvals/rejections, and
 * product aggregate rating recalculation for Supabase PostgreSQL.
 *
 * Adheres strictly to:
 * - PostgreSQL repository layer (`PostgresReviewRepository`, `PostgresProductRepository`).
 * - Zero direct Mongoose database queries.
 * - Accurate average rating & review count synchronization.
 * - Enforcing one review per customer per product.
 * - Safe customer ownership / admin permission checks on deletions.
 * - Dependency injection for test isolation without database writes.
 */

import { AppError } from "../middleware/errorHandler.js";
import { PostgresReviewRepository } from "../repositories/postgres-review.repository.js";
import { PostgresProductRepository } from "../repositories/postgres-product.repository.js";
import {
  IDbClient,
  IDbPool,
  IReviewRecord,
  ICreateReviewData,
  IProductRatingSummary,
} from "../types/database.types.js";

let defaultReviewRepo = new PostgresReviewRepository();
let defaultProductRepo = new PostgresProductRepository();

export function setReviewRepository(repo: PostgresReviewRepository): void {
  defaultReviewRepo = repo;
}

export function setReviewProductRepository(repo: PostgresProductRepository): void {
  defaultProductRepo = repo;
}

export function setReviewDatabasePool(pool: IDbPool): void {
  defaultReviewRepo = new PostgresReviewRepository(pool);
  defaultProductRepo = new PostgresProductRepository(pool);
}

export function getReviewRepository(): PostgresReviewRepository {
  return defaultReviewRepo;
}

export function getReviewProductRepository(): PostgresProductRepository {
  return defaultProductRepo;
}

/**
 * Recalculates and updates product average rating and review count.
 */
export async function recalculateProductRating(
  productId: string,
  client?: IDbClient
): Promise<IProductRatingSummary> {
  const reviewRepo = defaultReviewRepo;
  const productRepo = defaultProductRepo;

  const stats = await reviewRepo.calculateRatingSummary(productId, client);

  try {
    await productRepo.updateById(
      productId,
      {
        averageRating: stats.averageRating,
        reviewCount: stats.reviewCount,
      },
      client
    );
  } catch (err) {
    console.error(`Failed to update product ${productId} rating cache:`, err);
  }

  return stats;
}

/**
 * List approved reviews for a product (public view).
 */
export async function listProductReviews(
  productId: string,
  client?: IDbClient
): Promise<IReviewRecord[]> {
  if (!productId) return [];
  const repo = defaultReviewRepo;
  const result = await repo.findByProductId(productId, { isApproved: true }, client);
  return result.reviews;
}

/**
 * List reviews for a product with pagination.
 */
export async function getProductReviewsPaginated(
  productId: string,
  page: number = 1,
  limit: number = 10,
  client?: IDbClient
): Promise<{ reviews: IReviewRecord[]; total: number; page: number; limit: number }> {
  if (!productId) {
    throw new AppError("Product ID is required", 400);
  }
  const repo = defaultReviewRepo;
  const offset = Math.max(0, (page - 1) * limit);
  const result = await repo.findByProductId(productId, { isApproved: true, limit, offset }, client);

  return {
    reviews: result.reviews,
    total: result.total,
    page,
    limit,
  };
}

/**
 * Create a new product review by a customer.
 */
export async function createReview(
  userId: string,
  input: {
    productId: string;
    rating: number;
    title: string;
    body: string;
    images?: string[];
  },
  client?: IDbClient
): Promise<IReviewRecord> {
  if (!input.productId) throw new AppError("Invalid product", 400);
  if (!input.rating || input.rating < 1 || input.rating > 5) {
    throw new AppError("Rating must be between 1 and 5", 400);
  }
  if (!input.title || !input.title.trim()) {
    throw new AppError("Review title is required", 400);
  }
  if (!input.body || !input.body.trim()) {
    throw new AppError("Review body is required", 400);
  }

  const reviewRepo = defaultReviewRepo;
  const productRepo = defaultProductRepo;

  // Check if product exists
  const product = await productRepo.findById(input.productId, client);
  if (!product) {
    throw new AppError("Product not found", 404);
  }

  // Check unique review constraint (one review per user per product)
  const existing = await reviewRepo.findByUserAndProduct(userId, input.productId, client);
  if (existing) {
    throw new AppError("You already reviewed this product", 409);
  }

  // Check verified purchase
  const verifiedCheck = await reviewRepo.checkVerifiedPurchase(userId, input.productId, client);

  const createData: ICreateReviewData = {
    userId,
    productId: input.productId,
    orderId: verifiedCheck.orderId || null,
    rating: input.rating,
    title: input.title.trim(),
    body: input.body.trim(),
    images: input.images ?? [],
    isVerifiedPurchase: verifiedCheck.isVerified,
    isApproved: false, // New reviews require admin moderation
    helpfulCount: 0,
  };

  const review = await reviewRepo.create(createData, client);

  // Recalculate rating (in case approved or initial)
  try {
    await recalculateProductRating(input.productId, client);
  } catch (ratingError) {
    console.error("Failed to recalculate rating during review creation:", ratingError);
  }

  return review;
}

/**
 * Get review by ID.
 */
export async function getReviewById(reviewId: string, client?: IDbClient): Promise<IReviewRecord> {
  if (!reviewId) throw new AppError("Review ID is required", 400);
  const review = await defaultReviewRepo.findById(reviewId, client);
  if (!review) throw new AppError("Review not found", 404);
  return review;
}

/**
 * Increment helpful count on a review.
 */
export async function markReviewHelpful(reviewId: string, client?: IDbClient): Promise<IReviewRecord> {
  if (!reviewId) throw new AppError("Review ID is required", 400);
  const review = await defaultReviewRepo.incrementHelpfulCount(reviewId, client);
  if (!review) throw new AppError("Review not found", 404);
  return review;
}

/**
 * Delete a review with customer ownership / admin permission check.
 */
export async function deleteReview(
  reviewId: string,
  userId: string,
  userRole?: string,
  client?: IDbClient
): Promise<void> {
  if (!reviewId) throw new AppError("Review ID is required", 400);
  const review = await defaultReviewRepo.findById(reviewId, client);
  if (!review) throw new AppError("Review not found", 404);

  const isOwner = String(review.userId) === String(userId);
  const isAdmin = userRole === "admin";

  if (!isOwner && !isAdmin) {
    throw new AppError("You do not have permission to delete this review", 403);
  }

  const productId = review.productId;
  await defaultReviewRepo.deleteById(reviewId, client);

  // Recalculate product rating
  try {
    await recalculateProductRating(productId, client);
  } catch (ratingError) {
    console.error("Failed to recalculate rating after review deletion:", ratingError);
  }
}

/**
 * Admin: Approve a review.
 */
export async function approveReview(reviewId: string, client?: IDbClient): Promise<IReviewRecord> {
  if (!reviewId) throw new AppError("Review ID is required", 400);
  const review = await defaultReviewRepo.setApproval(reviewId, true, client);
  if (!review) throw new AppError("Review not found", 404);

  // Recalculate rating on approval
  await recalculateProductRating(review.productId, client);

  return review;
}

/**
 * Admin: Reject a review.
 */
export async function rejectReview(reviewId: string, client?: IDbClient): Promise<IReviewRecord> {
  if (!reviewId) throw new AppError("Review ID is required", 400);
  const review = await defaultReviewRepo.setApproval(reviewId, false, client);
  if (!review) throw new AppError("Review not found", 404);

  // Recalculate rating on rejection
  await recalculateProductRating(review.productId, client);

  return review;
}

/**
 * Admin: Get all reviews (including pending).
 */
export async function getAllReviews(
  options?: { isApproved?: boolean; limit?: number; offset?: number },
  client?: IDbClient
): Promise<IReviewRecord[]> {
  const result = await defaultReviewRepo.findAll(options, client);
  return result.reviews;
}

/**
 * Maps a review record to the backward-compatible legacy API response format.
 */
export function toLegacyReview(review: IReviewRecord | Record<string, unknown> | any) {
  const doc = review && typeof review.toObject === "function" ? review.toObject() : review;
  const user = doc?.user || (doc?.userId as { username?: string; email?: string } | undefined);
  const userIdVal =
    doc?.userId && typeof doc.userId === "object" && "id" in doc.userId
      ? String(doc.userId.id)
      : doc?.userId !== undefined
      ? String(doc.userId)
      : "";

  const idVal = doc?.id
    ? String(doc.id)
    : doc?._id
    ? doc._id.toString
      ? doc._id.toString()
      : String(doc._id)
    : "";

  const productIdVal =
    doc?.productId && typeof doc.productId === "object" && "id" in doc.productId
      ? String(doc.productId.id)
      : doc?.productId !== undefined
      ? String(doc.productId)
      : "";

  return {
    id: idVal,
    userId: userIdVal,
    username: user?.username ?? user?.email?.split("@")[0] ?? "Customer",
    productId: productIdVal,
    rating: Number(doc?.rating ?? 0),
    title: doc?.title ? String(doc.title) : "",
    body: doc?.body ? String(doc.body) : "",
    isVerifiedPurchase: Boolean(doc?.isVerifiedPurchase),
    createdAt:
      doc?.createdAt instanceof Date
        ? doc.createdAt.toISOString()
        : doc?.createdAt
        ? String(doc.createdAt)
        : new Date().toISOString(),
    isApproved: Boolean(doc?.isApproved),
    images: Array.isArray(doc?.images) ? doc.images : [],
    helpfulCount: Number(doc?.helpfulCount ?? 0),
  };
}
