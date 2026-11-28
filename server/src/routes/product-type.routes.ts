/**
 * ============================================================================
 * Product Type Routes
 * ============================================================================
 */

import { Router } from "express";
import * as productTypeController from "../controllers/product-type.controller.js";
import { requireAuth, requireAdmin, optionalAuth } from "../middleware/auth.js";
import { validateBody, validateParams } from "../middleware/validate.js";
import {
  createProductTypeSchema,
  updateProductTypeSchema,
  idParamSchema,
} from "../validators/catalog.validators.js";

const router = Router();

// Public: list active product types (for dropdowns and catalogue display)
router.get("/", optionalAuth, productTypeController.listProductTypes);

// Admin: list all product types (including inactive) with category usage counts
router.get("/admin", requireAuth, requireAdmin, productTypeController.listProductTypesAdmin);

// Public / Admin: get single product type
router.get("/:id", optionalAuth, validateParams(idParamSchema), productTypeController.getProductType);

// Admin: create a new product type
router.post(
  "/admin",
  requireAuth,
  requireAdmin,
  validateBody(createProductTypeSchema),
  productTypeController.createProductType
);

// Admin: update an existing product type (name, description, order, active/inactive)
router.patch(
  "/admin/:id",
  requireAuth,
  requireAdmin,
  validateParams(idParamSchema),
  validateBody(updateProductTypeSchema),
  productTypeController.updateProductType
);

// Admin: delete a product type (guarded against types assigned to categories)
router.delete(
  "/admin/:id",
  requireAuth,
  requireAdmin,
  validateParams(idParamSchema),
  productTypeController.deleteProductType
);

export default router;
