import { Router } from "express";
import healthRoutes from "./health.routes.js";
import categoryRoutes from "./category.routes.js";
import productRoutes from "./product.routes.js";
import authRoutes from "./auth.routes.js";
import userRoutes from "./user.routes.js";
import cartRoutes from "./cart.routes.js";
import adminRoutes from "./admin.routes.js";
import customizationRoutes from "./customization.routes.js";
import addressRoutes from "./address.routes.js";
import paymentRoutes from "./payment.routes.js";
import webhookRoutes from "./webhook.routes.js";
import orderRoutes from "./order.routes.js";
import { sanitizeRequest } from "../middleware/validate.js";

const router = Router();

// Apply sanitization middleware to all routes
router.use(sanitizeRequest);

router.use("/health", healthRoutes);
router.use("/auth", authRoutes);
router.use("/users", userRoutes);
router.use("/cart", cartRoutes);
router.use("/admin", adminRoutes);
router.use("/categories", categoryRoutes);
router.use("/products", productRoutes);
router.use("/customization", customizationRoutes);
router.use("/addresses", addressRoutes);
router.use("/payments", paymentRoutes);
router.use("/webhooks", webhookRoutes);
router.use("/orders", orderRoutes);

export default router;
