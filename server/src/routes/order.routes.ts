import { Router, Request, Response, NextFunction } from "express";
import {
  createOrderFromCart,
  listUserOrders,
  getOrderById,
  cancelOrder,
  updateOrderStatus,
} from "../services/order.service.js";
import { requireAuth } from "../middleware/auth.js";
import { requireAdmin } from "../middleware/auth.js";
import { validateParams } from "../middleware/validate.js";
import { z } from "zod";

const router = Router();

// All order routes require authentication
router.use(requireAuth);

// Create order from cart
router.post("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, error: "User not authenticated" });
    }

    const {
      shippingAddress,
      billingAddress,
      email,
      phone,
      notes,
      paymentMethod,
      couponCode,
    } = req.body;

    if (!shippingAddress || !email || !phone) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields: shippingAddress, email, phone",
      });
    }

    const order = await createOrderFromCart(userId, {
      shipping_address: shippingAddress,
      billing_address: billingAddress,
      phone_number: phone,
      email,
      notes,
      payment_method: paymentMethod || "razorpay",
      couponCode,
    });

    return res.json({ success: true, data: order });
  } catch (error) {
    next(error);
    return;
  }
});

// Get user's orders
router.get("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, error: "User not authenticated" });
    }

    const orders = await listUserOrders(userId);
    return res.json({ success: true, data: orders });
  } catch (error) {
    next(error);
    return;
  }
});

// Get specific order by ID
router.get(
  "/:orderId",
  validateParams(z.object({ orderId: z.string() })),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ success: false, error: "User not authenticated" });
      }

      const { orderId } = req.params;
      const order = await getOrderById(userId, orderId);
      return res.json({ success: true, data: order });
    } catch (error) {
      next(error);
      return;
    }
  }
);

// Cancel order
router.post(
  "/:orderId/cancel",
  validateParams(z.object({ orderId: z.string() })),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ success: false, error: "User not authenticated" });
      }

      const { orderId } = req.params;
      const order = await cancelOrder(userId, orderId);
      return res.json({ success: true, data: order });
    } catch (error) {
      next(error);
      return;
    }
  }
);

// Admin: Update order status
router.patch(
  "/admin/:orderId/status",
  requireAdmin,
  validateParams(z.object({ orderId: z.string() })),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { orderId } = req.params;
      const { status, trackingNumber } = req.body;

      console.log('Admin order status update:', { orderId, status, trackingNumber });

      if (!status) {
        return res.status(400).json({ success: false, error: "Status is required" });
      }

      const order = await updateOrderStatus(orderId, status, trackingNumber, req.user?.id);
      return res.json({ success: true, data: order });
    } catch (error) {
      next(error);
      return;
    }
  }
);

export default router;
