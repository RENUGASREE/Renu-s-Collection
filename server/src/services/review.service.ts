import { Types } from "mongoose";
import { Review } from "../models/Review.js";
import { Product } from "../models/Product.js";
import { Order } from "../models/Order.js";
import { AppError } from "../middleware/errorHandler.js";

export async function listProductReviews(productId: string) {
  if (!Types.ObjectId.isValid(productId)) return [];
  return Review.find({
    productId: new Types.ObjectId(productId),
    isApproved: true,
  })
    .populate("userId", "username email")
    .sort({ createdAt: -1 })
    .lean();
}

export async function createReview(
  userId: string,
  input: {
    productId: string;
    rating: number;
    title: string;
    body: string;
    images?: string[];
  }
) {
  if (!Types.ObjectId.isValid(input.productId)) throw new AppError("Invalid product", 400);

  const existing = await Review.findOne({
    userId: new Types.ObjectId(userId),
    productId: new Types.ObjectId(input.productId),
  });
  if (existing) throw new AppError("You already reviewed this product", 409);

  const paidOrder = await Order.findOne({
    userId: new Types.ObjectId(userId),
    paymentStatus: { $in: ["paid", "pending"] },
    status: { $ne: "cancelled" },
    "items.productId": new Types.ObjectId(input.productId),
  });

  const review = await Review.create({
    userId: new Types.ObjectId(userId),
    productId: new Types.ObjectId(input.productId),
    orderId: paidOrder?._id,
    rating: input.rating,
    title: input.title,
    body: input.body,
    images: input.images ?? [],
    isVerifiedPurchase: Boolean(paidOrder),
    isApproved: false,
  });

  await recalculateProductRating(input.productId);
  return review;
}

async function recalculateProductRating(productId: string) {
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

  await Product.findByIdAndUpdate(productId, {
    averageRating: stats[0]?.averageRating ?? 0,
    reviewCount: stats[0]?.reviewCount ?? 0,
  });
}

export function toLegacyReview(review: Record<string, unknown>) {
  const user = review.userId as { username?: string; email?: string } | undefined;
  return {
    id: (review._id as { toString(): string }).toString(),
    userId: review.userId,
    username: user?.username ?? user?.email?.split("@")[0] ?? "Customer",
    productId: review.productId,
    rating: review.rating,
    title: review.title,
    body: review.body,
    isVerifiedPurchase: review.isVerifiedPurchase,
    createdAt: review.createdAt,
    isApproved: review.isApproved,
    images: review.images ?? [],
    helpfulCount: review.helpfulCount ?? 0,
  };
}
