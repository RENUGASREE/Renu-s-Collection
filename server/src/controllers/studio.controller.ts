/**
 * ============================================================================
 * Studio Controller (Phase 3H)
 * ============================================================================
 *
 * Handles HTTP requests for all Studio catalogue, designer, customization,
 * templates, saved designs, pricing, and reservation admin endpoints.
 *
 * Fully migrated to Supabase PostgreSQL repositories:
 * - `PostgresStudioRepository`
 * - `PostgresStudioReservationRepository`
 * - Zero direct Mongoose database queries.
 */

import { Request, Response, NextFunction } from "express";
import { PostgresStudioRepository } from "../repositories/postgres-studio.repository.js";
import { PostgresStudioReservationRepository } from "../repositories/postgres-studio-reservation.repository.js";
import {
  calculateDesignPrice,
  toPublicMaterial,
  getUserSavedDesigns,
  getSavedDesignById,
  saveUserDesign,
  updateUserDesign,
  deleteUserDesign,
  getDesignTemplates,
  getDesignTemplateBySlug,
  createDesignTemplate,
  updateDesignTemplate,
  deleteDesignTemplate,
  addDesignToUserCart,
  getStudioReadinessReport,
} from "../services/studio.service.js";
import { generateDesignSuggestions } from "../services/ai-assistant.service.js";
import {
  cleanupExpiredStudioReservations,
  reconcileStudioReservation,
} from "../services/studio-inventory.service.js";
import { AppError } from "../middleware/errorHandler.js";

const studioRepo = new PostgresStudioRepository();
const reservationRepo = new PostgresStudioReservationRepository();

// ============================================================================
// COMPONENT TYPES CONTROLLERS
// ============================================================================

export async function listComponentTypes(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const isAdmin = req.user?.role === "admin" || req.query.admin === "true";
    const filter = !isAdmin && req.query.includeInactive !== "true" ? { isActive: true } : undefined;

    const types = await studioRepo.listComponentTypes(filter);
    const usageMap = await studioRepo.getMaterialUsageCountByComponentType();

    const data = types.map((t) => ({
      ...t,
      materialCount: usageMap.get(t.typeId.toLowerCase()) || 0,
    }));

    res.json({
      success: true,
      data,
    });
  } catch (error) {
    next(error);
  }
}

export async function createComponentType(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { displayName, typeId, description, displayOrder, isActive } = req.body;

    if (!displayName || !displayName.trim()) {
      throw new AppError("Display name is required", 400);
    }

    const normalizedTypeId = (
      typeId && typeId.trim()
        ? typeId.trim()
        : displayName.trim().replace(/[^a-zA-Z0-9_-]+/g, "_").replace(/^_+|_+$/g, "")
    ).toLowerCase();

    if (!normalizedTypeId) {
      throw new AppError("A valid internal type identifier could not be determined", 400);
    }

    const existing = await studioRepo.findComponentTypeByTypeId(normalizedTypeId);
    if (existing) {
      throw new AppError(`Component type with identifier "${normalizedTypeId}" already exists`, 409);
    }

    const newType = await studioRepo.createComponentType({
      typeId: normalizedTypeId,
      displayName: displayName.trim(),
      description: description?.trim() || null,
      displayOrder: typeof displayOrder === "number" ? displayOrder : 0,
      isActive: isActive !== false,
    });

    res.status(201).json({
      success: true,
      data: newType,
      message: `Component type "${newType.displayName}" created successfully`,
    });
  } catch (error) {
    next(error);
  }
}

export async function updateComponentType(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const targetTypeId = req.params.typeId.toLowerCase().trim();
    const { displayName, description, displayOrder, isActive } = req.body;

    const compType = await studioRepo.findComponentTypeByTypeId(targetTypeId);
    if (!compType) {
      throw new AppError(`Component type "${targetTypeId}" not found`, 404);
    }

    const updated = await studioRepo.updateComponentType(targetTypeId, {
      displayName: displayName?.trim(),
      description: description !== undefined ? description.trim() : undefined,
      displayOrder: typeof displayOrder === "number" ? displayOrder : undefined,
      isActive: typeof isActive === "boolean" ? isActive : undefined,
    });

    res.json({
      success: true,
      data: updated,
      message: `Component type "${updated?.displayName || targetTypeId}" updated successfully`,
    });
  } catch (error) {
    next(error);
  }
}

export async function deleteComponentType(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const targetTypeId = req.params.typeId.toLowerCase().trim();
    const compType = await studioRepo.findComponentTypeByTypeId(targetTypeId);
    if (!compType) {
      throw new AppError(`Component type "${targetTypeId}" not found`, 404);
    }

    const usageMap = await studioRepo.getMaterialUsageCountByComponentType();
    const materialCount = usageMap.get(targetTypeId) || 0;

    if (materialCount > 0) {
      res.status(409).json({
        success: false,
        canDeactivate: true,
        isUsed: true,
        materialCount,
        message: `Cannot permanently delete component type "${compType.displayName}" because it is currently used by ${materialCount} shared material(s). You can deactivate it instead to prevent new materials from using it while preserving existing records.`,
      });
      return;
    }

    await studioRepo.deleteComponentType(targetTypeId);

    res.json({
      success: true,
      message: `Component type "${compType.displayName}" has been permanently removed`,
    });
  } catch (error) {
    next(error);
  }
}

// ============================================================================
// JEWELLERY TYPES CONTROLLERS
// ============================================================================

export async function listJewelleryTypes(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const isAdmin = req.user?.role === "admin" || req.query.admin === "true";
    const filter = isAdmin
      ? req.query.includeArchived === "true"
        ? undefined
        : { isArchived: false }
      : { isPublished: true, isEnabled: true, isArchived: false };

    const data = await studioRepo.listJewelleryTypes(filter);
    res.json({
      success: true,
      data,
    });
  } catch (error) {
    next(error);
  }
}

export async function getJewelleryTypesReadiness(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const isAdmin = req.user?.role === "admin" || req.query.admin === "true";
    const data = await getStudioReadinessReport(isAdmin);
    res.json({
      success: true,
      data,
    });
  } catch (error) {
    next(error);
  }
}

export async function createJewelleryType(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const {
      slug,
      displayName,
      description,
      imageUrl,
      displayOrder,
      isEnabled,
      isPublished,
      designerStatus,
      supportedConstructionTypes,
    } = req.body;

    const normalizedSlug = (slug || displayName || "").toLowerCase().trim();
    if (!normalizedSlug) {
      throw new AppError("Category slug or display name is required", 400);
    }

    const existing = await studioRepo.findJewelleryTypeBySlug(normalizedSlug);
    if (existing) {
      throw new AppError(`Jewellery category with slug "${normalizedSlug}" already exists`, 409);
    }

    const newType = await studioRepo.createJewelleryType({
      slug: normalizedSlug,
      displayName: displayName.trim(),
      description: description?.trim() || null,
      imageUrl: imageUrl || null,
      displayOrder: typeof displayOrder === "number" ? displayOrder : 0,
      isEnabled: isEnabled !== false,
      isPublished: isPublished === true,
      designerStatus: designerStatus || "coming_soon",
      supportedConstructionTypes: Array.isArray(supportedConstructionTypes) ? supportedConstructionTypes : ["elastic_bead"],
    });

    res.status(201).json({
      success: true,
      data: newType,
      message: `Jewellery category "${newType.displayName}" created successfully`,
    });
  } catch (error) {
    next(error);
  }
}

export async function updateJewelleryType(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const targetSlug = req.params.slug.toLowerCase().trim();
    const existing = await studioRepo.findJewelleryTypeBySlug(targetSlug);
    if (!existing) {
      throw new AppError(`Jewellery category "${targetSlug}" not found`, 404);
    }

    const updated = await studioRepo.updateJewelleryType(targetSlug, req.body);

    res.json({
      success: true,
      data: updated,
      message: `Jewellery category "${updated?.displayName || targetSlug}" updated successfully`,
    });
  } catch (error) {
    next(error);
  }
}

export async function deleteJewelleryType(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const targetSlug = req.params.slug.toLowerCase().trim();
    const existing = await studioRepo.findJewelleryTypeBySlug(targetSlug);
    if (!existing) {
      throw new AppError(`Jewellery category "${targetSlug}" not found`, 404);
    }

    const { total } = await studioRepo.findMaterials({ jewelleryType: targetSlug });
    if (total > 0) {
      res.status(409).json({
        success: false,
        canArchive: true,
        materialCount: total,
        message: `Cannot permanently delete jewellery category "${existing.displayName}" because it is linked to ${total} material(s). You can archive it instead to safely hide it from customers while preserving existing product history.`,
      });
      return;
    }

    await studioRepo.deleteJewelleryType(targetSlug);

    res.json({
      success: true,
      message: `Jewellery category "${existing.displayName}" has been permanently deleted`,
    });
  } catch (error) {
    next(error);
  }
}

export async function archiveJewelleryType(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const targetSlug = req.params.slug.toLowerCase().trim();
    const updated = await studioRepo.archiveJewelleryType(targetSlug);
    if (!updated) {
      throw new AppError(`Jewellery category "${targetSlug}" not found`, 404);
    }
    res.json({
      success: true,
      data: updated,
      message: `Jewellery category "${updated.displayName}" has been archived and hidden from customers`,
    });
  } catch (error) {
    next(error);
  }
}

export async function restoreJewelleryType(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const targetSlug = req.params.slug.toLowerCase().trim();
    const updated = await studioRepo.restoreJewelleryType(targetSlug);
    if (!updated) {
      throw new AppError(`Jewellery category "${targetSlug}" not found`, 404);
    }
    res.json({
      success: true,
      data: updated,
      message: `Jewellery category "${updated.displayName}" has been restored`,
    });
  } catch (error) {
    next(error);
  }
}

// ============================================================================
// MATERIALS CONTROLLERS
// ============================================================================

export async function listMaterials(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { jewelleryType, materialType, search, page = 1, limit = 50, scope = "studio" } = req.query as any;

    if (jewelleryType) {
      const jTypeSlug = String(jewelleryType).toLowerCase().trim();
      const jType = await studioRepo.findJewelleryTypeBySlug(jTypeSlug);
      if (!jType || !jType.isPublished || jType.isEnabled === false || jType.isArchived) {
        throw new AppError(`Jewellery category "${jewelleryType}" is currently unavailable`, 404);
      }
    }

    const offset = (Number(page) - 1) * Number(limit);
    const { materials, total } = await studioRepo.findMaterials({
      isActive: true,
      jewelleryType: jewelleryType ? String(jewelleryType).toLowerCase().trim() : undefined,
      materialType: materialType ? String(materialType).trim() : undefined,
      visibilityScope: scope === "all" ? undefined : scope,
      search: search ? String(search).trim() : undefined,
      limit: Number(limit),
      offset,
    });

    const data = materials.map((m) => toPublicMaterial(m));

    res.json({
      success: true,
      data,
      meta: {
        page: Number(page),
        limit: Number(limit),
        total,
        totalPages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function listAdminMaterials(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { jewelleryType, materialType, isActive, search, page = 1, limit = 50, scope } = req.query as any;

    const offset = (Number(page) - 1) * Number(limit);
    const { materials, total } = await studioRepo.findMaterials({
      isActive: typeof isActive !== "undefined" ? isActive === "true" : undefined,
      jewelleryType: jewelleryType ? String(jewelleryType).toLowerCase().trim() : undefined,
      materialType: materialType ? String(materialType).trim() : undefined,
      visibilityScope: scope && scope !== "all" ? scope : undefined,
      search: search ? String(search).trim() : undefined,
      limit: Number(limit),
      offset,
    });

    const { reservations } = await reservationRepo.findAll({ status: "reserved" });
    const { reservations: committedRes } = await reservationRepo.findAll({ status: "committed" });

    const reservationCountsBySku: Record<string, { reserved: number; committed: number }> = {};
    for (const r of reservations) {
      for (const item of r.items || []) {
        const sku = item.sku.toUpperCase();
        if (!reservationCountsBySku[sku]) reservationCountsBySku[sku] = { reserved: 0, committed: 0 };
        reservationCountsBySku[sku].reserved += item.quantity;
      }
    }
    for (const r of committedRes) {
      for (const item of r.items || []) {
        const sku = item.sku.toUpperCase();
        if (!reservationCountsBySku[sku]) reservationCountsBySku[sku] = { reserved: 0, committed: 0 };
        reservationCountsBySku[sku].committed += item.quantity;
      }
    }

    const data = materials.map((m) => {
      const variants = (m.variants || []).map((v) => {
        const sku = v.sku.toUpperCase();
        const resInfo = reservationCountsBySku[sku] || { reserved: 0, committed: 0 };
        return {
          ...v,
          reservedStock: resInfo.reserved,
          committedStock: resInfo.committed,
          physicalStock: (v.stock || 0) + resInfo.reserved + resInfo.committed,
        };
      });
      return { ...m, variants };
    });

    res.json({
      success: true,
      data,
      meta: {
        page: Number(page),
        limit: Number(limit),
        total,
        totalPages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function getMaterial(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const mat = await studioRepo.findMaterialById(req.params.id);
    if (!mat || !mat.isActive) {
      throw new AppError("Material not found", 404);
    }
    res.json({
      success: true,
      data: toPublicMaterial(mat),
    });
  } catch (error) {
    next(error);
  }
}

export async function getAdminMaterial(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const mat = await studioRepo.findMaterialById(req.params.id);
    if (!mat) {
      throw new AppError("Material not found", 404);
    }
    res.json({
      success: true,
      data: mat,
    });
  } catch (error) {
    next(error);
  }
}

export async function createMaterial(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { code, name } = req.body;
    const existing = await studioRepo.findMaterialByCode(code);
    if (existing) {
      throw new AppError(`Material with code "${code.toUpperCase()}" already exists`, 409);
    }

    const created = await studioRepo.createMaterial(req.body);
    res.status(201).json({
      success: true,
      data: created,
      message: `Material "${name}" created successfully`,
    });
  } catch (error) {
    next(error);
  }
}

export async function updateMaterial(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;
    const updated = await studioRepo.updateMaterial(id, req.body);
    if (!updated) {
      throw new AppError("Material not found", 404);
    }
    res.json({
      success: true,
      data: updated,
      message: "Material updated successfully",
    });
  } catch (error) {
    next(error);
  }
}

export async function addVariant(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;
    const { sku } = req.body;

    const existing = await studioRepo.findVariantBySku(sku);
    if (existing) {
      throw new AppError(`Variant with SKU "${sku.toUpperCase()}" already exists`, 409);
    }

    const variant = await studioRepo.addVariant(id, req.body);
    res.status(201).json({
      success: true,
      data: variant,
      message: `Variant "${sku}" added successfully`,
    });
  } catch (error) {
    next(error);
  }
}

export async function updateVariant(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { sku } = req.params;
    const oldSku = sku.trim().toUpperCase();
    const newSku = req.body.sku ? String(req.body.sku).trim().toUpperCase() : undefined;

    if (newSku && newSku !== oldSku) {
      const existing = await studioRepo.findVariantBySku(newSku);
      if (existing) {
        throw new AppError(`Variant with SKU "${newSku}" already exists`, 409);
      }
    }

    const updated = await studioRepo.updateVariant(oldSku, req.body);
    if (!updated) {
      throw new AppError(`Variant with SKU "${oldSku}" not found`, 404);
    }
    res.json({
      success: true,
      data: updated,
      message: `Variant "${newSku || oldSku}" updated successfully`,
    });
  } catch (error) {
    next(error);
  }
}

export async function deleteVariant(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { sku } = req.params;
    const success = await studioRepo.deleteVariant(sku);
    if (!success) {
      throw new AppError(`Variant with SKU "${sku}" not found`, 404);
    }
    res.json({
      success: true,
      message: `Variant "${sku}" removed successfully`,
    });
  } catch (error) {
    next(error);
  }
}

export async function deleteMaterial(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;
    const success = await studioRepo.deleteMaterial(id);
    if (!success) {
      throw new AppError("Material not found", 404);
    }
    res.json({
      success: true,
      message: "Material deleted successfully",
    });
  } catch (error) {
    next(error);
  }
}

// ============================================================================
// DESIGN RULES & MAKING CHARGES
// ============================================================================

export async function getDesignRule(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { jewelleryType, constructionType } = req.params;
    const rule = await studioRepo.findDesignRule(jewelleryType, constructionType);
    if (!rule) {
      throw new AppError("Design rule not found", 404);
    }
    res.json({
      success: true,
      data: rule,
    });
  } catch (error) {
    next(error);
  }
}

export async function upsertDesignRule(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { jewelleryType, constructionType } = req.params;
    const rule = await studioRepo.upsertDesignRule({
      jewelleryType,
      constructionType,
      ...req.body,
    });
    res.json({
      success: true,
      data: rule,
      message: "Design rule updated successfully",
    });
  } catch (error) {
    next(error);
  }
}

export async function getMakingCharge(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { jewelleryType, constructionType } = req.params;
    const charge = await studioRepo.findMakingCharge(jewelleryType, constructionType);
    if (!charge) {
      throw new AppError("Making charge not found", 404);
    }
    res.json({
      success: true,
      data: charge,
    });
  } catch (error) {
    next(error);
  }
}

export async function upsertMakingCharge(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { jewelleryType, constructionType } = req.params;
    const charge = await studioRepo.upsertMakingCharge({
      jewelleryType,
      constructionType,
      ...req.body,
    });
    res.json({
      success: true,
      data: charge,
      message: "Making charge updated successfully",
    });
  } catch (error) {
    next(error);
  }
}

// ============================================================================
// PRICING QUOTE
// ============================================================================

export async function calculatePriceQuote(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const quote = await calculateDesignPrice(req.body);
    res.json({
      success: true,
      data: quote,
    });
  } catch (error) {
    next(error);
  }
}

// ============================================================================
// SAVED DESIGNS
// ============================================================================

export async function listSavedDesigns(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) throw new AppError("Authentication required", 401);
    const data = await getUserSavedDesigns(userId);
    res.json({
      success: true,
      data,
    });
  } catch (error) {
    next(error);
  }
}

export async function getSavedDesign(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) throw new AppError("Authentication required", 401);
    const data = await getSavedDesignById(userId, req.params.id);
    res.json({
      success: true,
      data,
    });
  } catch (error) {
    next(error);
  }
}

export async function createSavedDesign(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) throw new AppError("Authentication required", 401);
    const data = await saveUserDesign(userId, req.body);
    res.status(201).json({
      success: true,
      data,
      message: `Design "${data.name}" saved successfully`,
    });
  } catch (error) {
    next(error);
  }
}

export async function updateSavedDesign(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) throw new AppError("Authentication required", 401);
    const data = await updateUserDesign(userId, req.params.id, req.body);
    res.json({
      success: true,
      data,
      message: `Design "${data.name}" updated successfully`,
    });
  } catch (error) {
    next(error);
  }
}

export async function deleteSavedDesign(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) throw new AppError("Authentication required", 401);
    await deleteUserDesign(userId, req.params.id);
    res.json({
      success: true,
      message: "Saved design deleted successfully",
    });
  } catch (error) {
    next(error);
  }
}

// ============================================================================
// TEMPLATES
// ============================================================================

export async function listTemplates(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const data = await getDesignTemplates(true);
    res.json({
      success: true,
      data,
    });
  } catch (error) {
    next(error);
  }
}

export async function listAdminTemplates(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const data = await getDesignTemplates(false);
    res.json({
      success: true,
      data,
    });
  } catch (error) {
    next(error);
  }
}

export async function getTemplate(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const data = await getDesignTemplateBySlug(req.params.slug, false);
    res.json({
      success: true,
      data,
    });
  } catch (error) {
    next(error);
  }
}

export async function getAdminTemplate(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const data = await getDesignTemplateBySlug(req.params.slug, true);
    res.json({
      success: true,
      data,
    });
  } catch (error) {
    next(error);
  }
}

export async function createTemplate(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const data = await createDesignTemplate(req.body);
    res.status(201).json({
      success: true,
      data,
      message: `Template "${data.name}" created successfully`,
    });
  } catch (error) {
    next(error);
  }
}

export async function updateTemplate(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const data = await updateDesignTemplate(req.params.slug, req.body);
    res.json({
      success: true,
      data,
      message: `Template "${data.name}" updated successfully`,
    });
  } catch (error) {
    next(error);
  }
}

export async function deleteTemplate(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    await deleteDesignTemplate(req.params.slug);
    res.json({
      success: true,
      message: "Template deleted successfully",
    });
  } catch (error) {
    next(error);
  }
}

// ============================================================================
// CART INTEGRATION & AI SUGGESTIONS
// ============================================================================

export async function addCustomDesignToCart(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) throw new AppError("Authentication required", 401);
    const data = await addDesignToUserCart(userId, req.body);
    res.status(201).json({
      success: true,
      data,
      message: `Custom design "${req.body.name}" added to cart`,
    });
  } catch (error) {
    next(error);
  }
}

export async function getAIDesignSuggestions(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const data = await generateDesignSuggestions(req.body);
    res.json({
      success: true,
      data,
    });
  } catch (error) {
    next(error);
  }
}

// ============================================================================
// INVENTORY & RESERVATION MANAGEMENT (ADMIN)
// ============================================================================

export async function getStudioReservationsAdmin(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { status, page = 1, limit = 50 } = req.query as any;
    const offset = (Number(page) - 1) * Number(limit);
    const { reservations, total } = await reservationRepo.findAll({
      status: status ? String(status) : undefined,
      limit: Number(limit),
      offset,
    });

    res.json({
      success: true,
      data: reservations,
      meta: {
        page: Number(page),
        limit: Number(limit),
        total,
        totalPages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function cleanupExpiredReservationsAdmin(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const result = await cleanupExpiredStudioReservations();
    res.json({
      success: true,
      data: result,
      message: `Cleaned up ${result.released} expired studio reservations (${result.committed} committed for paid orders)`,
    });
  } catch (error) {
    next(error);
  }
}

export async function reconcileReservationAdmin(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;
    const { action, notes } = req.body;
    if (!action || !["force_commit", "refund_and_release"].includes(action)) {
      throw new AppError("Valid action (force_commit or refund_and_release) is required", 400);
    }

    const reservation = await reconcileStudioReservation(id, action, notes);
    res.json({
      success: true,
      data: reservation,
      message: `Studio reservation ${reservation.status} successfully`,
    });
  } catch (error) {
    next(error);
  }
}
