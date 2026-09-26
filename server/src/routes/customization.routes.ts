import { Router } from "express";
import {
  getProductCustomization,
  calculateCustomizationPrice,
  validateCustomization,
  getCustomizationPreview,
} from "../controllers/customization.controller.js";
import { validateParams } from "../middleware/validate.js";
import { z } from "zod";

const router = Router();

const paramSchema = z.object({
  id: z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid ID format").optional(),
  productId: z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid ID format").optional(),
});

// Get customization configuration for a product
router.get(
  "/products/:productId/customization",
  validateParams(paramSchema),
  getProductCustomization
);

// Calculate price for customization selections
router.post(
  "/products/:productId/customization/calculate-price",
  validateParams(paramSchema),
  calculateCustomizationPrice
);

// Validate customization selections
router.post(
  "/products/:productId/customization/validate",
  validateParams(paramSchema),
  validateCustomization
);

// Generate preview for customization
router.post(
  "/products/:productId/customization/preview",
  validateParams(paramSchema),
  getCustomizationPreview
);

export default router;
