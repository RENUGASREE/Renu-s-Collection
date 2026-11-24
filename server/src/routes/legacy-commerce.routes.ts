import { Router, Request, Response, NextFunction } from "express";
import { requireAuth } from "../middleware/auth.js";
import * as cartService from "../services/cart.service.js";
import * as orderService from "../services/order.service.js";
import * as paymentService from "../services/payment.service.js";
import * as reviewService from "../services/review.service.js";
import * as customizationService from "../services/customization.service.js";
import * as wishlistService from "../services/wishlist.service.js";
import { PostgresUserRepository } from "../repositories/postgres-user.repository.js";
import { AppError } from "../middleware/errorHandler.js";

const router = Router();
const userRepo = new PostgresUserRepository();

function authUserId(req: { user?: { id: string } }) {
  if (!req.user?.id) throw new AppError("Authentication required", 401);
  return req.user.id;
}

// --- Cart ---
router.get("/cart-items", requireAuth, async (req, res, next) => {
  try {
    const userId = authUserId(req);
    const items = await cartService.getCartItems(userId);
    res.json(items.map((item, idx) => cartService.toLegacyCartItem(item as never, idx)));
  } catch (e) {
    next(e);
  }
});

router.post("/cart-items", requireAuth, async (req, res, next) => {
  try {
    const userId = authUserId(req);
    const items = await cartService.addCartItem(userId, req.body);
    res.status(201).json(items.map((item, idx) => cartService.toLegacyCartItem(item as never, idx)));
  } catch (e) {
    next(e);
  }
});

router.patch("/cart-items/:id", requireAuth, async (req, res, next) => {
  try {
    const userId = authUserId(req);
    const quantity = Number(req.body.quantity ?? 1);
    const items = await cartService.updateCartItemQuantity(userId, req.params.id, quantity, req.body.customization);
    res.json(items.map((item, idx) => cartService.toLegacyCartItem(item as never, idx)));
  } catch (e) {
    next(e);
  }
});

router.delete("/cart-items/:id", requireAuth, async (req, res, next) => {
  try {
    const userId = authUserId(req);
    const items = await cartService.removeCartItem(userId, req.params.id);
    res.json(items.map((item, idx) => cartService.toLegacyCartItem(item as never, idx)));
  } catch (e) {
    next(e);
  }
});

// --- Orders ---
router.get("/orders", requireAuth, async (req, res, next) => {
  try {
    const orders = await orderService.listUserOrders(authUserId(req));
    res.json(orders.map((o) => orderService.toLegacyOrder(o)));
  } catch (e) {
    next(e);
  }
});

router.post("/orders", requireAuth, async (req, res, next) => {
  try {
    const resolvedIdempotencyKey =
      (typeof req.body?.idempotencyKey === "string" && req.body.idempotencyKey.trim()) ||
      (typeof req.headers["idempotency-key"] === "string" && req.headers["idempotency-key"].trim()) ||
      (typeof req.headers["x-idempotency-key"] === "string" && req.headers["x-idempotency-key"].trim()) ||
      undefined;

    const order = await orderService.createOrderFromCart(authUserId(req), {
      ...req.body,
      idempotencyKey: resolvedIdempotencyKey,
    });
    res.status(201).json({
      id: order.id,
      order_number: order.orderNumber,
      total_amount: order.total,
      status: order.status,
      payment_status: order.paymentStatus,
    });
  } catch (e) {
    next(e);
  }
});

router.post("/orders/:id/cancel_order", requireAuth, async (req, res, next) => {
  try {
    await orderService.cancelOrder(authUserId(req), req.params.id);
    res.json({ message: "Order cancelled successfully" });
  } catch (e) {
    next(e);
  }
});

// --- Users (legacy) ---
router.get("/users/:id", requireAuth, async (req, res, next) => {
  try {
    if (req.user!.id !== req.params.id && req.user!.role !== "admin") {
      throw new AppError("Forbidden", 403);
    }
    const user = await userRepo.findById(req.params.id);
    if (!user) throw new AppError("User not found", 404);
    res.json({
      id: user.id || user._id,
      username: user.username,
      email: user.email,
      phone_number: user.phone || "",
      address: "",
      date_joined: user.createdAt,
    });
  } catch (e) {
    next(e);
  }
});

// --- Wishlist ---
router.get("/wishlist", requireAuth, async (req, res, next) => {
  try {
    const items = await wishlistService.getWishlistItems(req.user!.id);
    res.json(
      items.map((i) => {
        const productType = String(i.product?.sku || '').startsWith("BRC") ? "bracelet" : "chain";
        return {
          id: i.id,
          product_type: productType,
          product_id: i.productId,
          created_at: i.createdAt,
        };
      })
    );
  } catch (e) {
    next(e);
  }
});

router.post("/wishlist", requireAuth, async (req, res, next) => {
  try {
    const productId = String(req.body.product_id);
    const item = await wishlistService.addToWishlist(req.user!.id, productId);
    const productType = String(item.product?.sku || '').startsWith("BRC") ? "bracelet" : "chain";
    res.status(201).json({
      id: item.id,
      product_type: productType,
      product_id: item.productId,
    });
  } catch (e) {
    next(e);
  }
});

router.delete("/wishlist/:id", requireAuth, async (req, res, next) => {
  try {
    await wishlistService.removeFromWishlist(req.user!.id, { itemId: req.params.id });
    res.status(204).send();
  } catch (e) {
    next(e);
  }
});

// --- Reviews ---
router.get("/reviews", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { product_type: _pt, product_id } = req.query;
    if (!product_id) {
      res.json([]);
      return;
    }
    const reviews = await reviewService.listProductReviews(String(product_id));
    res.json(reviews.map((r) => reviewService.toLegacyReview(r as any)));
  } catch (e) {
    next(e);
  }
});

router.post("/reviews", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const review = await reviewService.createReview(authUserId(req), req.body);
    res.status(201).json(reviewService.toLegacyReview(review as any));
  } catch (e) {
    next(e);
  }
});

// --- Customization ---
router.get("/materials", async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await customizationService.getCustomizationOptions("bracelet");
    res.json(data.materials);
  } catch (e) {
    next(e);
  }
});

router.get("/chain-types", async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await customizationService.getCustomizationOptions("chain");
    res.json(data.chainTypes);
  } catch (e) {
    next(e);
  }
});

router.get("/bracelet-sizes", async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await customizationService.getCustomizationOptions("bracelet");
    res.json(data.braceletSizes);
  } catch (e) {
    next(e);
  }
});

router.get("/customization-options", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const optionType = req.query.option_type;
    const data = await customizationService.getCustomizationOptions("bracelet");
    if (optionType === "charm") {
      res.json(data.charms);
      return;
    }
    res.json(data.charms);
  } catch (e) {
    next(e);
  }
});

router.post("/customized-products/generate-preview", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { generatePreviewLegacy } = await import("../services/customization.service.js");
    const result = await generatePreviewLegacy({
      product_type: req.body.product_type,
      customization_data: req.body.customization_data,
      base_product_id: req.body.base_product_id,
    });
    res.json(result);
  } catch (e) {
    next(e);
  }
});

router.post("/customized-products", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const saved = await customizationService.saveCustomizedProduct(authUserId(req), req.body);
    res.status(201).json(saved);
  } catch (e) {
    next(e);
  }
});

router.post("/customized-products/:id/add_to_cart", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await customizationService.addCustomizedToCart(authUserId(req), {
      product_type: req.body.product_type ?? "bracelet",
      base_product_id: req.body.base_product_id,
      customization_data: req.body.customization_data ?? {},
      total_price: req.body.total_price ?? 0,
      preview_image_url: req.body.preview_image_url,
    });
    res.json(result);
  } catch (e) {
    next(e);
  }
});

// --- Razorpay ---
router.post("/payments/razorpay/create_order", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orderId = req.body.order_id;
    const amount = Number(req.body.amount) / 100;
    const result = await paymentService.createRazorpayOrder(authUserId(req), orderId, amount);
    res.json(result);
  } catch (e) {
    next(e);
  }
});

router.post("/payments/razorpay/verify_payment", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await paymentService.verifyRazorpayPayment(authUserId(req), req.body);
    res.json(result);
  } catch (e) {
    next(e);
  }
});

router.post("/payments/razorpay/payment_failed", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await paymentService.recordPaymentFailure(
      authUserId(req),
      req.body.order_id,
      req.body.error_description
    );
    res.json(result);
  } catch (e) {
    next(e);
  }
});

export default router;
