import { Router } from "express";
import * as studioController from "../controllers/studio.controller.js";
import * as independentStudioController from "../controllers/independent-studio.controller.js";
import { requireAuth, requireAdmin, optionalAuth } from "../middleware/auth.js";
import { validateBody, validateQuery } from "../middleware/validate.js";
import {
  createMaterialSchema,
  updateMaterialSchema,
  createVariantSchema,
  updateVariantSchema,
  createComponentTypeSchema,
  updateComponentTypeSchema,
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

// List active component types (e.g. Bead, Stone, Charm, Spacer, Clasp, etc.)
router.get("/component-types", optionalAuth, studioController.listComponentTypes);

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

// Component Types Management
router.get(
  "/admin/component-types",
  requireAuth,
  requireAdmin,
  studioController.listComponentTypes
);

router.post(
  "/admin/component-types",
  requireAuth,
  requireAdmin,
  validateBody(createComponentTypeSchema),
  studioController.createComponentType
);

router.patch(
  "/admin/component-types/:typeId",
  requireAuth,
  requireAdmin,
  validateBody(updateComponentTypeSchema),
  studioController.updateComponentType
);

router.delete(
  "/admin/component-types/:typeId",
  requireAuth,
  requireAdmin,
  studioController.deleteComponentType
);

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
  studioController.listAdminMaterials
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
  studioController.getAdminMaterial
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
router.get(
  "/admin/templates",
  requireAuth,
  requireAdmin,
  studioController.listAdminTemplates
);

router.get(
  "/admin/templates/:slug",
  requireAuth,
  requireAdmin,
  studioController.getAdminTemplate
);

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

// ============================================================================
// INDEPENDENT CREATE YOUR OWN STUDIO ROUTES
// ============================================================================

// Categories & Subcategories (Public & Customer view)
router.get("/categories/tree", optionalAuth, independentStudioController.getStudioCategoriesTree);
router.get("/categories", optionalAuth, independentStudioController.getStudioCategories);
router.get("/categories/:id", optionalAuth, independentStudioController.getStudioCategory);

// Construction Methods (Public & Customer view)
router.get("/methods", optionalAuth, independentStudioController.getConstructionMethods);
router.get("/methods/:id", optionalAuth, independentStudioController.getConstructionMethod);
router.get("/subcategories/:subcategoryId/methods", optionalAuth, independentStudioController.getMethodsForSubcategory);

// Multi-Rule Management (Public & Customer view)
router.get("/design-rules", optionalAuth, independentStudioController.getDesignRules);
router.get("/design-rules/:id", optionalAuth, independentStudioController.getDesignRule);

// Visual Assembly Structures (Public & Customer view)
router.get("/methods/:methodId/assembly", optionalAuth, independentStudioController.getAssemblyStructure);

// Physical Fit Calculation
router.post("/physical-fit", optionalAuth, independentStudioController.checkPhysicalFit);

// ADMIN: Category Management
router.post("/admin/categories", requireAuth, requireAdmin, independentStudioController.createStudioCategory);
router.patch("/admin/categories/:id", requireAuth, requireAdmin, independentStudioController.updateStudioCategory);
router.delete("/admin/categories/:id", requireAuth, requireAdmin, independentStudioController.deleteStudioCategory);

// ADMIN: Construction Methods Management
router.post("/admin/methods", requireAuth, requireAdmin, independentStudioController.createConstructionMethod);
router.patch("/admin/methods/:id", requireAuth, requireAdmin, independentStudioController.updateConstructionMethod);
router.delete("/admin/methods/:id", requireAuth, requireAdmin, independentStudioController.deleteConstructionMethod);
router.post("/admin/subcategories/:subcategoryId/methods/:methodId", requireAuth, requireAdmin, independentStudioController.assignMethodToSubcategory);
router.delete("/admin/subcategories/:subcategoryId/methods/:methodId", requireAuth, requireAdmin, independentStudioController.removeMethodFromSubcategory);

// ADMIN: Design Rules Management
router.post("/admin/design-rules", requireAuth, requireAdmin, independentStudioController.createDesignRule);
router.patch("/admin/design-rules/:id", requireAuth, requireAdmin, independentStudioController.updateDesignRule);
router.post("/admin/design-rules/:id/duplicate", requireAuth, requireAdmin, independentStudioController.duplicateDesignRule);
router.delete("/admin/design-rules/:id", requireAuth, requireAdmin, independentStudioController.deleteDesignRule);

// ADMIN: Visual Assembly Structures Management
router.post("/admin/assembly", requireAuth, requireAdmin, independentStudioController.saveAssemblyStructure);
router.delete("/admin/assembly/:id", requireAuth, requireAdmin, independentStudioController.deleteAssemblyStructure);

// ADMIN: Material Linking Management
router.get("/admin/material-links", requireAuth, requireAdmin, independentStudioController.getMaterialLinks);
router.post("/admin/material-links", requireAuth, requireAdmin, independentStudioController.createMaterialLink);
router.patch("/admin/material-links/:id", requireAuth, requireAdmin, independentStudioController.updateMaterialLink);
router.delete("/admin/material-links/:id", requireAuth, requireAdmin, independentStudioController.deleteMaterialLink);

export default router;
