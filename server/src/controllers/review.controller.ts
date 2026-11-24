import * as reviewService from "../services/review.service.js";
import { AppError } from "../middleware/errorHandler.js";

export async function getProductReviews(
  productId: string | undefined,
  page: number = 1,
  limit: number = 10
) {
  if (!productId) {
    throw new AppError("Product ID is required", 400);
  }
  const result = await reviewService.getProductReviewsPaginated(productId, page, limit);
  return {
    reviews: result.reviews.map((review) => reviewService.toLegacyReview(review as any)),
    total: result.total,
    page: result.page,
    limit: result.limit,
  };
}

export async function createReview(userId: string, body: any) {
  const review = await reviewService.createReview(userId, body);
  return reviewService.toLegacyReview(review as any);
}

export async function markReviewHelpful(reviewId: string) {
  const review = await reviewService.markReviewHelpful(reviewId);
  return reviewService.toLegacyReview(review as any);
}

export async function deleteReview(reviewId: string, userId: string, userRole?: string) {
  await reviewService.deleteReview(reviewId, userId, userRole);
}

export async function approveReview(reviewId: string) {
  const review = await reviewService.approveReview(reviewId);
  return reviewService.toLegacyReview(review as any);
}

export async function rejectReview(reviewId: string) {
  const review = await reviewService.rejectReview(reviewId);
  return reviewService.toLegacyReview(review as any);
}

export async function getAllReviews() {
  const reviews = await reviewService.getAllReviews();
  return reviews.map((review, index) => ({
    ...reviewService.toLegacyReview(review as any),
    _key: `review-${review.id}-${index}`,
  }));
}
