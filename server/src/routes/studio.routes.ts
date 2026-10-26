import { Router } from "express";
import * as studioController from "../controllers/studio.controller.js";
import { requireAuth, requireAdmin, optionalAuth } from "../middleware/auth.js";
import { validateBody, validateQuery } from "../middleware/validate.js";
import {
  createMaterialSchema,
  updateMaterialSchema,
  createVariantSchema,
  updateVariantSchema,
  createJewelleryTypeSchema,
  updateJewelleryTypeSchema,
  upsertDesignRuleSchema,
  upsertMakingChargeSchema,
  priceQuoteSchema,
  materialQuerySchema,
  saveDesignSchema,
  updateSavedDesignSchema,
  createDesignTemplateSchema,
  updateDesignTemplateSchema,
  addStudioDesignToCartSchema,
  aiDesignPromptSchema,
} from "../validators/studio.validators.js";

const router = Router();

// ============================================================================
// PUBLIC READ-ONLY ENDPOINTS
// ============================================================================

// List published jewellery types (e.g. Bracelets available; others coming soon)
router.get("/jewellery-types", optionalAuth, studioController.listJewelleryTypes);

// Studio category readiness report (component availability, design rules, making charges)
router.get("/jewellery-types/readiness", optionalAuth, studioController.getJewelleryTypesReadiness);
router.get("/admin/jewellery-types/readiness", requireAuth, requireAdmin, studioController.getJewelleryTypesReadiness);

// List active materials & variants eligible for a jewellery type (purchase cost stripped)
router.get(
  "/materials",
  optionalAuth,
  validateQuery(materialQuerySchema),
  studioController.listMaterials
);

// Get single active material with public projection
router.get("/materials/:id", optionalAuth, studioController.getMaterial);

// Get active design rule for a jewellery type & construction
router.get("/rules/:jewelleryType/:constructionType", optionalAuth, studioController.getDesignRule);

// Get active making charge structure
router.get(
  "/making-charges/:jewelleryType/:constructionType",
  optionalAuth,
  studioController.getMakingCharge
);

// Calculate authoritative design price quote from variant selections
router.post(
  "/price-quote",
  validateBody(priceQuoteSchema),
  studioController.calculatePriceQuote
);

// Starter design templates (public view)
router.get("/templates", optionalAuth, studioController.listTemplates);
router.get("/templates/:slug", optionalAuth, studioController.getTemplate);

// AI Design Assistant suggestions (public view)
router.post(
  "/ai/suggestions",
  optionalAuth,
  validateBody(aiDesignPromptSchema),
  studioController.getAIDesignSuggestions
);

// ============================================================================
// CUSTOMER AUTHENTICATED ENDPOINTS (Saved designs & Cart integration)
// ============================================================================

router.get("/my-designs", requireAuth, studioController.listSavedDesigns);
router.post(
  "/my-designs",
  requireAuth,
  validateBody(saveDesignSchema),
  studioController.createSavedDesign
);
router.get("/my-designs/:id", requireAuth, studioController.getSavedDesign);
router.patch(
  "/my-designs/:id",
  requireAuth,
  validateBody(updateSavedDesignSchema),
  studioController.updateSavedDesign
);
router.delete("/my-designs/:id", requireAuth, studioController.deleteSavedDesign);

// Add custom studio design to cart
router.post(
  "/cart/add",
  requireAuth,
  validateBody(addStudioDesignToCartSchema),
  studioController.addCustomDesignToCart
);

// ============================================================================
// ADMIN MANAGEMENT ENDPOINTS (Guarded with requireAuth & requireAdmin)
// ============================================================================

// Jewellery Types Management
router.get(
  "/admin/jewellery-types",
  requireAuth,
  requireAdmin,
  studioController.listJewelleryTypes
);

router.post(
  "/admin/jewellery-types",
  requireAuth,
  requireAdmin,
  validateBody(createJewelleryTypeSchema),
  studioController.createJewelleryType
);

router.patch(
  "/admin/jewellery-types/:slug",
  requireAuth,
  requireAdmin,
  validateBody(updateJewelleryTypeSchema),
  studioController.updateJewelleryType
);

router.delete(
  "/admin/jewellery-types/:slug",
  requireAuth,
  requireAdmin,
  studioController.deleteJewelleryType
);

router.post(
  "/admin/jewellery-types/:slug/archive",
  requireAuth,
  requireAdmin,
  studioController.archiveJewelleryType
);

router.post(
  "/admin/jewellery-types/:slug/restore",
  requireAuth,
  requireAdmin,
  studioController.restoreJewelleryType
);

// Materials Management
router.get(
  "/admin/materials",
  requireAuth,
  requireAdmin,
  validateQuery(materialQuerySchema),
  studioController.listMaterials
);

router.post(
  "/admin/materials",
  requireAuth,
  requireAdmin,
  validateBody(createMaterialSchema),
  studioController.createMaterial
);

router.get(
  "/admin/materials/:id",
  requireAuth,
  requireAdmin,
  studioController.getMaterial
);

router.patch(
  "/admin/materials/:id",
  requireAuth,
  requireAdmin,
  validateBody(updateMaterialSchema),
  studioController.updateMaterial
);

router.delete(
  "/admin/materials/:id",
  requireAuth,
  requireAdmin,
  studioController.deleteMaterial
);

// Material Variant Management
router.post(
  "/admin/materials/:id/variants",
  requireAuth,
  requireAdmin,
  validateBody(createVariantSchema),
  studioController.addVariant
);

router.patch(
  "/admin/materials/:id/variants/:sku",
  requireAuth,
  requireAdmin,
  validateBody(updateVariantSchema),
  studioController.updateVariant
);

router.delete(
  "/admin/materials/:id/variants/:sku",
  requireAuth,
  requireAdmin,
  studioController.deleteVariant
);

// Design Rules Management
router.get(
  "/admin/rules/:jewelleryType/:constructionType",
  requireAuth,
  requireAdmin,
  studioController.getDesignRule
);

router.put(
  "/admin/rules/:jewelleryType/:constructionType",
  requireAuth,
  requireAdmin,
  validateBody(upsertDesignRuleSchema),
  studioController.upsertDesignRule
);

// Making Charges Management
router.get(
  "/admin/making-charges/:jewelleryType/:constructionType",
  requireAuth,
  requireAdmin,
  studioController.getMakingCharge
);

router.put(
  "/admin/making-charges/:jewelleryType/:constructionType",
  requireAuth,
  requireAdmin,
  validateBody(upsertMakingChargeSchema),
  studioController.upsertMakingCharge
);

// Design Templates Management (Admin)
router.post(
  "/admin/templates",
  requireAuth,
  requireAdmin,
  validateBody(createDesignTemplateSchema),
  studioController.createTemplate
);

router.patch(
  "/admin/templates/:slug",
  requireAuth,
  requireAdmin,
  validateBody(updateDesignTemplateSchema),
  studioController.updateTemplate
);

router.delete(
  "/admin/templates/:slug",
  requireAuth,
  requireAdmin,
  studioController.deleteTemplate
);

// Inventory & Reservation Management (Admin)
router.get(
  "/admin/inventory/reservations",
  requireAuth,
  requireAdmin,
  studioController.getStudioReservationsAdmin
);

router.post(
  "/admin/inventory/cleanup-expired",
  requireAuth,
  requireAdmin,
  studioController.cleanupExpiredReservationsAdmin
);

router.post(
  "/admin/inventory/reconcile/:id",
  requireAuth,
  requireAdmin,
  studioController.reconcileReservationAdmin
);

export default router;
