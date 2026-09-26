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

  try {
    // Check if product exists
    const product = await Product.findById(input.productId);
    if (!product) throw new AppError("Product not found", 404);

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

    try {
      await recalculateProductRating(input.productId);
    } catch (ratingError) {
      console.error("Failed to recalculate rating during review creation:", ratingError);
    }

    try {
      await review.populate("userId", "username email");
    } catch {
      // ignore population error
    }

    return review;
  } catch (error) {
    console.error('Error creating review:', error);
    throw error;
  }
}

async function recalculateProductRating(productId: string) {
  if (!Types.ObjectId.isValid(productId)) return;
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

  const averageRating = stats[0]?.averageRating ? Number(stats[0].averageRating.toFixed(1)) : 0;
  const reviewCount = stats[0]?.reviewCount ?? 0;

  await Product.findByIdAndUpdate(productId, {
    averageRating,
    reviewCount,
  });
}

export function toLegacyReview(review: Record<string, unknown> | any) {
  const doc = review && typeof review.toObject === "function" ? review.toObject() : review;
  const user = doc?.userId as { username?: string; email?: string } | undefined;
  return {
    id: (doc?._id ? (doc._id.toString ? doc._id.toString() : String(doc._id)) : ""),
    userId: doc?.userId,
    username: user?.username ?? user?.email?.split("@")[0] ?? "Customer",
    productId: doc?.productId,
    rating: doc?.rating ?? 0,
    title: doc?.title ?? "",
    body: doc?.body ?? "",
    isVerifiedPurchase: Boolean(doc?.isVerifiedPurchase),
    createdAt: doc?.createdAt ?? new Date().toISOString(),
    isApproved: Boolean(doc?.isApproved),
    images: doc?.images ?? [],
    helpfulCount: doc?.helpfulCount ?? 0,
  };
}
