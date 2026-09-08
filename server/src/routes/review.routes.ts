import { Router, Request, Response, NextFunction } from "express";
import * as reviewController from "../controllers/review.controller.js";
import { requireAuth } from "../middleware/auth.js";
import { validateBody, validateParams, validateQuery } from "../middleware/validate.js";
import { z } from "zod";

const reviewQuerySchema = z.object({
  productId: z.string().optional(),
  page: z.coerce.number().optional().default(1),
  limit: z.coerce.number().optional().default(10),
});

const reviewBodySchema = z.object({
  productId: z.string(),
  rating: z.number().min(1).max(5),
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(2000),
  images: z.array(z.string()).optional().default([]),
});

const reviewIdParamSchema = z.object({
  reviewId: z.string(),
});

const router = Router();

// Get reviews for a product
router.get(
  "/",
  validateQuery(reviewQuerySchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { productId, page, limit } = req.query as any;
      const reviews = await reviewController.getProductReviews(productId, page, limit);
      res.json({ success: true, data: reviews });
    } catch (error) {
      next(error);
    }
  }
);

// Create a review
router.post(
  "/",
  requireAuth,
  validateBody(reviewBodySchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.id;
      if (!userId) throw new Error("User not authenticated");
      const review = await reviewController.createReview(userId, req.body);
      res.json({ success: true, data: review });
    } catch (error) {
      next(error);
    }
  }
);

// Mark review as helpful
router.post(
  "/:reviewId/helpful",
  requireAuth,
  validateParams(reviewIdParamSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { reviewId } = req.params;
      if (!reviewId) throw new Error("Review ID is required");
      const review = await reviewController.markReviewHelpful(reviewId);
      res.json({ success: true, data: review });
    } catch (error) {
      next(error);
    }
  }
);

// Delete own review
router.delete(
  "/:reviewId",
  requireAuth,
  validateParams(reviewIdParamSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { reviewId } = req.params;
      if (!reviewId) throw new Error("Review ID is required");
      const userId = req.user?.id;
      if (!userId) throw new Error("User not authenticated");
      await reviewController.deleteReview(reviewId, userId);
      res.json({ success: true, message: "Review deleted" });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
