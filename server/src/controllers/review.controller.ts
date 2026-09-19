import * as reviewService from "../services/review.service.js";
import { Review } from "../models/Review.js";
import { AppError } from "../middleware/errorHandler.js";
import { Types } from "mongoose";

export async function getProductReviews(
  productId: string | undefined,
  page: number = 1,
  limit: number = 10
) {
  if (!productId) {
    throw new AppError("Product ID is required", 400);
  }
  const reviews = await reviewService.listProductReviews(productId);
  const startIndex = (page - 1) * limit;
  const paginatedReviews = reviews.slice(startIndex, startIndex + limit);
  return {
    reviews: paginatedReviews.map((review) => reviewService.toLegacyReview(review as any)),
    total: reviews.length,
    page,
    limit,
  };
}

export async function createReview(userId: string, body: any) {
  const review = await reviewService.createReview(userId, body);
  return reviewService.toLegacyReview(review as any);
}

export async function markReviewHelpful(reviewId: string) {
  const review = await Review.findById(reviewId);
  if (!review) throw new AppError("Review not found", 404);

  review.helpfulCount = (review.helpfulCount || 0) + 1;
  await review.save();

  return reviewService.toLegacyReview(review as any);
}

export async function deleteReview(reviewId: string, userId: string) {
  const review = await Review.findById(reviewId);
  if (!review) throw new AppError("Review not found", 404);

  if (review.userId.toString() !== userId) {
    throw new AppError("You can only delete your own review", 403);
  }

  const productId = review.productId.toString();
  await Review.findByIdAndDelete(reviewId);

  // Recalculate product rating
  const stats = await Review.aggregate([
    { $match: { productId: new Types.ObjectId(productId), isApproved: true } },
    {
      $group: {
        _id: null,
        averageRating: { $avg: "$rating" },
        reviewCount: { $sum: 1 },
      },
    },
  ]);

  const { Product } = await import("../models/Product.js");
  await Product.findByIdAndUpdate(productId, {
    averageRating: stats[0]?.averageRating ?? 0,
    reviewCount: stats[0]?.reviewCount ?? 0,
  });
}

export async function approveReview(reviewId: string) {
  const review = await Review.findById(reviewId);
  if (!review) throw new AppError("Review not found", 404);

  review.isApproved = true;
  await review.save();

  // Recalculate product rating
  const productId = review.productId.toString();
  const stats = await Review.aggregate([
    { $match: { productId: new Types.ObjectId(productId), isApproved: true } },
    {
      $group: {
        _id: null,
        averageRating: { $avg: "$rating" },
        reviewCount: { $sum: 1 },
      },
    },
  ]);

  const { Product } = await import("../models/Product.js");
  await Product.findByIdAndUpdate(productId, {
    averageRating: stats[0]?.averageRating ?? 0,
    reviewCount: stats[0]?.reviewCount ?? 0,
  });

  return reviewService.toLegacyReview(review as any);
}

export async function rejectReview(reviewId: string) {
  const review = await Review.findById(reviewId);
  if (!review) throw new AppError("Review not found", 404);

  review.isApproved = false;
  await review.save();

  // Recalculate product rating
  const productId = review.productId.toString();
  const stats = await Review.aggregate([
    { $match: { productId: new Types.ObjectId(productId), isApproved: true } },
    {
      $group: {
        _id: null,
        averageRating: { $avg: "$rating" },
        reviewCount: { $sum: 1 },
      },
    },
  ]);

  const { Product } = await import("../models/Product.js");
  await Product.findByIdAndUpdate(productId, {
    averageRating: stats[0]?.averageRating ?? 0,
    reviewCount: stats[0]?.reviewCount ?? 0,
  });

  return reviewService.toLegacyReview(review as any);
}

export async function getAllReviews() {
  const reviews = await Review.find()
    .populate("userId", "username email")
    .populate("productId", "name")
    .sort({ createdAt: -1 })
    .lean();
  
  return reviews.map((review, index) => ({
    ...reviewService.toLegacyReview(review as any),
    _key: `review-${review._id}-${index}`,
  }));
}
