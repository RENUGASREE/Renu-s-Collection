import { Request, Response, NextFunction } from "express";
import { Types } from "mongoose";
import { JewelleryType } from "../models/JewelleryType.js";
import { StudioMaterial } from "../models/StudioMaterial.js";
import { ComponentType, ensureDefaultComponentTypes } from "../models/ComponentType.js";
import { Category } from "../models/Category.js";
import { CustomizationConfig } from "../models/CustomizationConfig.js";
import { DesignRule } from "../models/DesignRule.js";
import { MakingCharge } from "../models/MakingCharge.js";
import { StudioReservation } from "../models/StudioReservation.js";
import { Order } from "../models/Order.js";
import { SavedDesign } from "../models/SavedDesign.js";
import { DesignTemplate } from "../models/DesignTemplate.js";
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

// ============================================================================
// COMPONENT TYPES CONTROLLERS
// ============================================================================

export async function listComponentTypes(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    await ensureDefaultComponentTypes();
    const isAdmin = req.user?.role === "admin" || req.query.admin === "true";
    const filter: any = {};
    if (!isAdmin && req.query.includeInactive !== "true") {
      filter.isActive = true;
    }

    const types = await ComponentType.find(filter)
      .sort({ displayOrder: 1, createdAt: 1 })
      .lean();

    // Attach usage count for each component type across materials
    const usageCounts = await StudioMaterial.aggregate([
      { $group: { _id: "$materialType", count: { $sum: 1 } } },
    ]);
    const usageMap = new Map<string, number>();
    usageCounts.forEach((c) => {
      if (c._id) usageMap.set(String(c._id).toLowerCase(), c.count);
    });

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
    await ensureDefaultComponentTypes();
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

    const existing = await ComponentType.findOne({ typeId: normalizedTypeId });
    if (existing) {
      throw new AppError(`Component type with identifier "${normalizedTypeId}" already exists`, 409);
    }

    const newType = await ComponentType.create({
      typeId: normalizedTypeId,
      displayName: displayName.trim(),
      description: description?.trim(),
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

    const compType = await ComponentType.findOne({ typeId: targetTypeId });
    if (!compType) {
      throw new AppError(`Component type "${targetTypeId}" not found`, 404);
    }

    if (displayName && displayName.trim()) {
      compType.displayName = displayName.trim();
    }
    if (description !== undefined) {
      compType.description = description.trim();
    }
    if (typeof displayOrder === "number") {
      compType.displayOrder = displayOrder;
    }
    if (typeof isActive === "boolean") {
      compType.isActive = isActive;
    }

    await compType.save();

    res.json({
      success: true,
      data: compType,
      message: `Component type "${compType.displayName}" updated successfully`,
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
    const compType = await ComponentType.findOne({ typeId: targetTypeId });
    if (!compType) {
      throw new AppError(`Component type "${targetTypeId}" not found`, 404);
    }

    // Safety check: is this component type currently used by any materials?
    const materialCount = await StudioMaterial.countDocuments({
      materialType: targetTypeId,
    });

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

    await ComponentType.deleteOne({ _id: compType._id });

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
    const isAdmin = req.user?.role === "admin";
    const includeArchived = req.query.includeArchived === "true";

    let filter: any;
    if (isAdmin) {
      filter = includeArchived ? {} : { isArchived: { $ne: true } };
    } else {
      // Customer view: only published, enabled, and non-archived categories
      filter = { isPublished: true, isEnabled: { $ne: false }, isArchived: { $ne: true } };
    }

    const types = await JewelleryType.find(filter).sort({ displayOrder: 1, createdAt: 1 });
    res.json({ success: true, data: types });
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
    const isAdmin = req.user?.role === "admin";
    const report = await getStudioReadinessReport(isAdmin);
    res.json({ success: true, data: report });
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

    const normalizedSlug = slug.toLowerCase().trim();
    const existing = await JewelleryType.findOne({ slug: normalizedSlug });
    if (existing) {
      throw new AppError(`A jewellery category with slug "${normalizedSlug}" already exists`, 409);
    }

    const targetPublished = Boolean(isPublished);
    const targetStatus = designerStatus || "coming_soon";

    if (targetPublished && targetStatus === "available") {
      throw new AppError(
        `New categories must be created in "Coming Soon" or unpublished status first so materials, construction rules, and making charges can be configured before publishing.`,
        400
      );
    }

    const type = await JewelleryType.create({
      slug: normalizedSlug,
      displayName,
      description,
      imageUrl,
      displayOrder: displayOrder ?? 0,
      isEnabled: isEnabled !== undefined ? isEnabled : true,
      isPublished: isPublished !== undefined ? isPublished : false, // Default to unpublished
      isArchived: false,
      designerStatus: designerStatus || "coming_soon",
      supportedConstructionTypes: supportedConstructionTypes || [],
    });

    res.status(201).json({
      success: true,
      data: type,
      message: `Jewellery category "${displayName}" created successfully`,
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
    const { slug } = req.params;
    const normalizedSlug = slug.toLowerCase();
    const updates = { ...req.body };

    const current = await JewelleryType.findOne({ slug: normalizedSlug });
    if (!current) {
      throw new AppError(`Jewellery type "${slug}" was not found`, 404);
    }

    // If isPublished is being set, keep isEnabled in sync for compatibility
    if (updates.isPublished !== undefined && updates.isEnabled === undefined) {
      updates.isEnabled = updates.isPublished;
    }

    const targetPublished = updates.isPublished !== undefined ? updates.isPublished : current.isPublished;
    const targetStatus = updates.designerStatus !== undefined ? updates.designerStatus : current.designerStatus;

    // Server-enforced readiness:
    // If the category is being marked as published and available for customer orders,
    // verify that required active materials, stock, DesignRule, and MakingCharge exist.
    if (targetPublished && targetStatus === "available") {
      const activeMaterials = await StudioMaterial.find({
        isActive: true,
        allowedJewelleryTypes: normalizedSlug,
      }).lean();

      const inStockVariantCount = activeMaterials.reduce(
        (sum, m) => sum + (m.variants || []).filter((v) => v.isActive && v.stock > 0).length,
        0
      );

      const constructions = updates.supportedConstructionTypes || current.supportedConstructionTypes || [];
      const primaryConstruction = constructions[0] || "";

      const [hasRule, hasCharge] = await Promise.all([
        primaryConstruction
          ? DesignRule.findOne({ jewelleryType: normalizedSlug, constructionType: primaryConstruction, isActive: true }).lean()
          : null,
        primaryConstruction
          ? MakingCharge.findOne({ jewelleryType: normalizedSlug, constructionType: primaryConstruction, isActive: true }).lean()
          : null,
      ]);

      const missing: string[] = [];
      if (activeMaterials.length === 0) {
        missing.push("at least one active catalogue material");
      } else if (inStockVariantCount === 0) {
        missing.push("at least one in-stock material variant");
      }
      if (!hasRule) {
        missing.push(`an active construction DesignRule for "${primaryConstruction || "default"}"`);
      }
      if (!hasCharge) {
        missing.push(`an active craftsmanship MakingCharge for "${primaryConstruction || "default"}"`);
      }

      if (missing.length > 0) {
        throw new AppError(
          `Cannot publish "${current.displayName}" as available. It is missing: ${missing.join(", ")}. Please configure and calibrate these requirements before publishing.`,
          400
        );
      }
    }

    const type = await JewelleryType.findOneAndUpdate(
      { slug: normalizedSlug },
      { $set: updates },
      { new: true, runValidators: true }
    );

    if (!type) {
      throw new AppError(`Jewellery type "${slug}" was not found`, 404);
    }

    res.json({ success: true, data: type, message: "Jewellery type updated successfully" });
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
    const { slug } = req.params;
    const normalizedSlug = slug.toLowerCase();

    const category = await JewelleryType.findOne({ slug: normalizedSlug });
    if (!category) {
      throw new AppError(`Jewellery category "${slug}" was not found`, 404);
    }

    // Safety checks: verify that no materials, saved designs, templates, reservations, or orders reference this category
    const [materialCount, savedCount, templateCount, reservationCount, orderCount] = await Promise.all([
      StudioMaterial.countDocuments({ allowedJewelleryTypes: normalizedSlug }),
      SavedDesign.countDocuments({ jewelleryType: normalizedSlug }),
      DesignTemplate.countDocuments({ jewelleryType: normalizedSlug }),
      StudioReservation.countDocuments({ "components.jewelleryType": normalizedSlug }),
      Order.countDocuments({ "items.customDesign.jewelleryType": normalizedSlug }),
    ]);

    const reasons: string[] = [];
    if (materialCount > 0) reasons.push(`${materialCount} material(s)`);
    if (savedCount > 0) reasons.push(`${savedCount} customer saved design(s)`);
    if (templateCount > 0) reasons.push(`${templateCount} design template(s)`);
    if (reservationCount > 0) reasons.push(`${reservationCount} stock reservation(s)`);
    if (orderCount > 0) reasons.push(`${orderCount} historical order(s)`);

    if (reasons.length > 0) {
      throw new AppError(
        `Cannot delete category "${category.displayName}" because it is referenced by: ${reasons.join(", ")}. Please archive or unpublish this category instead to protect historical records.`,
        409
      );
    }

    await JewelleryType.deleteOne({ _id: category._id });
    res.json({
      success: true,
      message: `Jewellery category "${category.displayName}" deleted successfully`,
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
    const { slug } = req.params;
    const category = await JewelleryType.findOneAndUpdate(
      { slug: slug.toLowerCase() },
      { $set: { isArchived: true, isPublished: false, archivedAt: new Date() } },
      { new: true }
    );

    if (!category) {
      throw new AppError(`Jewellery category "${slug}" was not found`, 404);
    }

    res.json({
      success: true,
      data: category,
      message: `Category "${category.displayName}" has been archived and unpublished.`,
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
    const { slug } = req.params;
    const category = await JewelleryType.findOneAndUpdate(
      { slug: slug.toLowerCase() },
      { $set: { isArchived: false }, $unset: { archivedAt: 1 } },
      { new: true }
    );

    if (!category) {
      throw new AppError(`Jewellery category "${slug}" was not found`, 404);
    }

    res.json({
      success: true,
      data: category,
      message: `Category "${category.displayName}" has been restored.`,
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

    const andClauses: any[] = [{ isActive: true }];

    if (scope === "studio") {
      // Backward compatibility: materials with "studio" scope OR legacy records where visibilityScopes is missing/empty
      andClauses.push({
        $or: [
          { visibilityScopes: "studio" },
          { visibilityScopes: { $exists: false } },
          { visibilityScopes: { $size: 0 } },
        ],
      });
    } else if (scope && scope !== "all") {
      andClauses.push({ visibilityScopes: scope });
    }

    if (jewelleryType) {
      const jTypeSlug = String(jewelleryType).toLowerCase().trim();
      const jType = await JewelleryType.findOne({
        slug: jTypeSlug,
        isPublished: true,
        isEnabled: { $ne: false },
        isArchived: { $ne: true },
      });
      if (!jType) {
        throw new AppError(`Jewellery category "${jewelleryType}" is currently unavailable`, 404);
      }
      andClauses.push({ allowedJewelleryTypes: jTypeSlug });
    }

    if (materialType) {
      andClauses.push({ materialType });
    }

    if (search && typeof search === "string" && search.trim()) {
      const regex = new RegExp(search.trim(), "i");
      andClauses.push({
        $or: [{ name: regex }, { code: regex }, { "variants.sku": regex }],
      });
    }

    const query: any = andClauses.length === 1 ? andClauses[0] : { $and: andClauses };

    const skip = (Number(page) - 1) * Number(limit);
    const [materials, total] = await Promise.all([
      StudioMaterial.find(query)
        .sort({ sortOrder: 1, createdAt: -1 })
        .skip(skip)
        .limit(Number(limit)),
      StudioMaterial.countDocuments(query),
    ]);

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

    const query: any = {};

    if (scope && scope !== "all") {
      query.visibilityScopes = scope;
    }
    if (jewelleryType) {
      query.allowedJewelleryTypes = jewelleryType;
    }
    if (materialType) {
      query.materialType = materialType;
    }
    if (typeof isActive !== "undefined") {
      query.isActive = isActive === "true";
    }
    if (search && typeof search === "string" && search.trim()) {
      const regex = new RegExp(search.trim(), "i");
      query.$or = [{ name: regex }, { code: regex }, { "variants.sku": regex }];
    }

    const skip = (Number(page) - 1) * Number(limit);
    const [materials, total, activeReservations] = await Promise.all([
      StudioMaterial.find(query)
        .sort({ sortOrder: 1, createdAt: -1 })
        .skip(skip)
        .limit(Number(limit)),
      StudioMaterial.countDocuments(query),
      StudioReservation.find({
        status: { $in: ["reserved", "committed"] },
      }).select("items status").lean(),
    ]);

    // Aggregate active reservations by SKU to report committed and checkout-held stock
    const reservationCountsBySku: Record<string, { reserved: number; committed: number }> = {};
    for (const resDoc of activeReservations) {
      for (const item of resDoc.items || []) {
        const sku = item.sku?.toUpperCase();
        if (sku) {
          if (!reservationCountsBySku[sku]) {
            reservationCountsBySku[sku] = { reserved: 0, committed: 0 };
          }
          if (resDoc.status === "reserved") {
            reservationCountsBySku[sku].reserved += item.quantity;
          } else if (resDoc.status === "committed") {
            reservationCountsBySku[sku].committed += item.quantity;
          }
        }
      }
    }

    const data = materials.map((m) => {
      const doc = m.toObject ? m.toObject() : JSON.parse(JSON.stringify(m));
      doc.visibilityScopes = doc.visibilityScopes && doc.visibilityScopes.length > 0 ? doc.visibilityScopes : ["studio"];
      doc.variants = (doc.variants || []).map((v: any) => {
        const sku = v.sku?.toUpperCase();
        const resInfo = reservationCountsBySku[sku] || { reserved: 0, committed: 0 };
        return {
          ...v,
          reservedStock: resInfo.reserved,
          committedStock: resInfo.committed,
          physicalStock: (v.stock || 0) + resInfo.reserved + resInfo.committed,
        };
      });
      return doc;
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
    const { id } = req.params;
    const material = await StudioMaterial.findById(id);

    if (!material || !material.isActive) {
      throw new AppError("Studio material not found", 404);
    }

    const data = toPublicMaterial(material);
    res.json({ success: true, data });
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
    const { id } = req.params;
    const material = await StudioMaterial.findById(id);

    if (!material) {
      throw new AppError("Studio material not found", 404);
    }

    res.json({ success: true, data: material });
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
    const { code, variants = [] } = req.body;

    // Check material code uniqueness
    const existing = await StudioMaterial.findOne({ code: code.toUpperCase() });
    if (existing) {
      throw new AppError(`Material with code "${code}" already exists`, 409);
    }

    // Check SKU uniqueness across variants
    const skus = variants.map((v: any) => v.sku?.toUpperCase());
    const uniqueSkus = new Set(skus);
    if (uniqueSkus.size !== skus.length) {
      throw new AppError("Duplicate SKUs detected within the variant list", 400);
    }

    if (skus.length > 0) {
      const existingSkuMat = await StudioMaterial.findOne({ "variants.sku": { $in: skus } });
      if (existingSkuMat) {
        throw new AppError("One or more variant SKUs already exist in the material library", 409);
      }
    }

    const material = await StudioMaterial.create({
      ...req.body,
      code: code.toUpperCase(),
      variants: variants.map((v: any) => ({
        ...v,
        sku: v.sku.toUpperCase(),
      })),
    });

    res.status(201).json({
      success: true,
      data: material,
      message: "Material component created successfully",
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
    const updates = { ...req.body };

    const material = await StudioMaterial.findById(id);
    if (!material) {
      throw new AppError("Material not found", 404);
    }

    const oldCode = material.code;
    let newCode = oldCode;

    if (updates.code) {
      newCode = updates.code.trim().toUpperCase();
      if (newCode !== oldCode) {
        const existing = await StudioMaterial.findOne({ code: newCode, _id: { $ne: id } });
        if (existing) {
          throw new AppError(`Another material with code "${newCode}" already exists`, 409);
        }
      }
    }

    // Cascade update variant SKUs if compound code changed or if syncVariantSkus is requested
    const shouldSync = updates.syncVariantSkus || (updates.code && newCode !== oldCode);
    if (shouldSync && material.variants && material.variants.length > 0) {
      for (const variant of material.variants) {
        if (variant.sku.startsWith(oldCode)) {
          variant.sku = newCode + variant.sku.slice(oldCode.length);
        } else if (updates.syncVariantSkus) {
          const cleanSize = (variant.sizeLabel || "STD").trim().toUpperCase().replace(/\s+/g, "");
          variant.sku = `${newCode}-${cleanSize}`;
        }
      }
    }

    // Apply allowed material fields
    if (updates.name) material.name = updates.name.trim();
    if (updates.code) material.code = newCode;
    if (typeof updates.description !== "undefined") material.description = updates.description;
    if (updates.materialType) material.materialType = updates.materialType;
    if (updates.imageUrl) material.imageUrl = updates.imageUrl;
    if (typeof updates.renderAssetUrl !== "undefined") material.renderAssetUrl = updates.renderAssetUrl;
    if (updates.additionalImages) material.additionalImages = updates.additionalImages;
    if (updates.allowedJewelleryTypes) material.allowedJewelleryTypes = updates.allowedJewelleryTypes;
    if (updates.supportedConstructionTypes) material.supportedConstructionTypes = updates.supportedConstructionTypes;
    if (updates.visibilityScopes) material.visibilityScopes = updates.visibilityScopes;
    if (typeof updates.isActive !== "undefined") material.isActive = updates.isActive;
    if (typeof updates.sortOrder !== "undefined") material.sortOrder = updates.sortOrder;

    await material.save();

    res.json({ success: true, data: material, message: "Material updated successfully" });
  } catch (error) {
    next(error);
  }
}

// ============================================================================
// MATERIAL VARIANTS CONTROLLERS
// ============================================================================

export async function addVariant(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;
    const variantData = req.body;
    const sku = variantData.sku.toUpperCase();

    // Check SKU uniqueness globally
    const existingSku = await StudioMaterial.findOne({ "variants.sku": sku });
    if (existingSku) {
      throw new AppError(`Variant SKU "${sku}" already exists in the material library`, 409);
    }

    const material = await StudioMaterial.findById(id);
    if (!material) {
      throw new AppError("Material not found", 404);
    }

    material.variants.push({
      ...variantData,
      sku,
    });

    await material.save();

    res.status(201).json({
      success: true,
      data: material,
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
    const { id, sku } = req.params;
    const targetParam = decodeURIComponent(sku).trim();
    const updates = req.body;

    const material = await StudioMaterial.findById(id);
    if (!material) {
      throw new AppError("Material not found", 404);
    }

    const variant = material.variants.find(
      (v: any) =>
        (v._id && v._id.toString() === targetParam) ||
        (v.sku && v.sku.toUpperCase() === targetParam.toUpperCase())
    );
    if (!variant) {
      throw new AppError(`Variant "${targetParam}" not found on this material`, 404);
    }

    const currentSku = variant.sku;

    // Support updating the variant SKU itself
    if (updates.sku) {
      const newSku = updates.sku.trim().toUpperCase();
      if (newSku !== currentSku) {
        const existingWithSku = await StudioMaterial.findOne({
          _id: { $ne: material._id },
          "variants.sku": newSku,
        });
        const duplicateOnSameMaterial = material.variants.some(
          (v) => v.sku === newSku && v !== variant
        );
        if (existingWithSku || duplicateOnSameMaterial) {
          throw new AppError(`Variant SKU "${newSku}" already exists`, 409);
        }
        variant.sku = newSku;
      }
    }

    // Apply updates safely
    if (typeof updates.color !== "undefined") variant.color = updates.color;
    if (typeof updates.finish !== "undefined") variant.finish = updates.finish;
    if (typeof updates.sizeLabel !== "undefined") variant.sizeLabel = updates.sizeLabel;
    if (typeof updates.dimensionsMm !== "undefined") variant.dimensionsMm = updates.dimensionsMm;
    if (typeof updates.sellingUnit !== "undefined") variant.sellingUnit = updates.sellingUnit;
    if (typeof updates.purchaseCost !== "undefined") variant.purchaseCost = updates.purchaseCost;
    if (typeof updates.sellingRate !== "undefined") variant.sellingRate = updates.sellingRate;
    if (typeof updates.stock !== "undefined") variant.stock = updates.stock;
    if (typeof updates.lowStockThreshold !== "undefined") variant.lowStockThreshold = updates.lowStockThreshold;
    if (typeof updates.isActive !== "undefined") variant.isActive = updates.isActive;

    await material.save();

    res.json({
      success: true,
      data: material,
      message: `Variant "${variant.sku}" updated successfully`,
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
    const { id, sku } = req.params;
    const targetParam = decodeURIComponent(sku).trim();

    const material = await StudioMaterial.findById(id);
    if (!material) {
      throw new AppError("Material not found", 404);
    }

    // Match variant by actual variant _id or SKU (case-insensitive)
    const variantIndex = material.variants.findIndex(
      (v: any) =>
        (v._id && v._id.toString() === targetParam) ||
        (v.sku && v.sku.toUpperCase() === targetParam.toUpperCase())
    );
    if (variantIndex === -1) {
      throw new AppError(`Variant "${targetParam}" not found`, 404);
    }

    const variant = material.variants[variantIndex];
    const targetSku = variant.sku;
    const variantId = variant._id ? variant._id.toString() : null;

    // Safeguard 1: Historical Orders check
    // Uses both variant SKU and actual variant ObjectId / reference across studioDesign and customization
    const orderQueries: any[] = [
      { "items.studioDesign.beadSequence.variantSku": targetSku },
      { "items.studioDesign.charms.variantSku": targetSku },
      { "items.studioDesign.components.variantSku": targetSku },
      { "items.customDesign.beadSequence.variantSku": targetSku },
      { "items.customDesign.charms.variantSku": targetSku },
      { "items.customization.breakdown.variantSku": targetSku },
      { "items.customization.breakdown.sku": targetSku },
      { "items.customization.selections.Charm": targetSku },
      { "items.customization.selections.charm": targetSku },
    ];

    if (variantId) {
      orderQueries.push(
        { "items.studioDesign.beadSequence.variantId": variantId },
        { "items.studioDesign.charms.variantId": variantId },
        { "items.studioDesign.components.variantId": variantId },
        { "items.customDesign.beadSequence.variantId": variantId },
        { "items.customDesign.charms.variantId": variantId }
      );
      if (Types.ObjectId.isValid(variantId)) {
        const vObjId = new Types.ObjectId(variantId);
        orderQueries.push(
          { "items.studioDesign.beadSequence.variantId": vObjId },
          { "items.studioDesign.charms.variantId": vObjId },
          { "items.studioDesign.components.variantId": vObjId }
        );
      }
    }

    const orderCount = await Order.countDocuments({ $or: orderQueries });

    if (orderCount > 0) {
      res.status(409).json({
        success: false,
        canDeactivate: true,
        isHistoricalOrder: true,
        orderCount,
        message: `Cannot permanently delete SKU "${targetSku}" because it is referenced in ${orderCount} historical order(s). Historical order records cannot be altered. Please deactivate this variant instead so it is hidden from future orders while preserving order history.`,
      });
      return;
    }

    // Safeguard 2: Check other protected references (Saved Designs, Reservations, Templates, Customizations)
    const savedDesignQueries: any[] = [
      { "beadSequence.variantSku": targetSku },
      { "charms.variantSku": targetSku },
      { "components.variantSku": targetSku },
    ];
    const reservationQueries: any[] = [
      { "components.variantSku": targetSku },
    ];

    if (variantId) {
      savedDesignQueries.push(
        { "beadSequence.variantId": variantId },
        { "charms.variantId": variantId },
        { "components.variantId": variantId }
      );
      reservationQueries.push({ "components.variantId": variantId });
    }

    const [savedCount, reservationCount, templateCount, configCount, categoryCount] =
      await Promise.all([
        SavedDesign.countDocuments({ $or: savedDesignQueries }),
        StudioReservation.countDocuments({ $or: reservationQueries }),
        DesignTemplate.countDocuments({
          $or: [
            { "beadSequence.variantSku": targetSku },
            { "charms.variantSku": targetSku },
          ],
        }),
        CustomizationConfig.countDocuments({
          $or: [
            { "fields.options.variantSku": targetSku },
            ...(variantId ? [{ "fields.options.variantId": variantId }] : []),
          ],
        }),
        Category.countDocuments({
          $or: [
            { "customizationFields.options.variantSku": targetSku },
            ...(variantId ? [{ "customizationFields.options.variantId": variantId }] : []),
          ],
        }),
      ]);

    const otherReasons: string[] = [];
    if (savedCount > 0) otherReasons.push(`${savedCount} saved design(s)`);
    if (reservationCount > 0) otherReasons.push(`${reservationCount} active stock reservation(s)`);
    if (templateCount > 0) otherReasons.push(`${templateCount} design template(s)`);
    if (configCount > 0 || categoryCount > 0)
      otherReasons.push(`${configCount + categoryCount} product customization option(s)`);

    if (otherReasons.length > 0) {
      res.status(409).json({
        success: false,
        canDeactivate: true,
        isHistoricalOrder: false,
        reasons: otherReasons,
        message: `Cannot permanently delete SKU "${targetSku}" because it is referenced in: ${otherReasons.join(", ")}. Please remove these references or deactivate the variant instead.`,
      });
      return;
    }

    // Permanently remove the variant when verified to have 0 historical orders or protected references
    material.variants.splice(variantIndex, 1);
    await material.save();

    res.json({
      success: true,
      data: material,
      message: `Variant SKU "${targetSku}" has been permanently deleted`,
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
    const material = await StudioMaterial.findById(id);
    if (!material) {
      throw new AppError("Material not found", 404);
    }

    const skus = (material.variants || []).map((v) => v.sku);
    const variantIds = (material.variants || [])
      .map((v: any) => v._id?.toString())
      .filter(Boolean);

    // Safeguard: Check if any variant SKU or ID is used in historical orders, saved designs, or reservations
    const orderQueries: any[] = [
      { "items.studioDesign.beadSequence.variantSku": { $in: skus } },
      { "items.studioDesign.charms.variantSku": { $in: skus } },
      { "items.studioDesign.components.variantSku": { $in: skus } },
      { "items.customDesign.beadSequence.variantSku": { $in: skus } },
      { "items.customDesign.charms.variantSku": { $in: skus } },
      { "items.customization.breakdown.variantSku": { $in: skus } },
      { "items.customization.breakdown.sku": { $in: skus } },
    ];
    if (variantIds.length > 0) {
      orderQueries.push(
        { "items.studioDesign.beadSequence.variantId": { $in: variantIds } },
        { "items.studioDesign.charms.variantId": { $in: variantIds } },
        { "items.studioDesign.components.variantId": { $in: variantIds } }
      );
    }

    const [orderCount, savedCount, reservationCount] = await Promise.all([
      Order.countDocuments({ $or: orderQueries }),
      SavedDesign.countDocuments({
        $or: [
          { "beadSequence.variantSku": { $in: skus } },
          { "charms.variantSku": { $in: skus } },
        ],
      }),
      StudioReservation.countDocuments({ "components.variantSku": { $in: skus } }),
    ]);

    const reasons: string[] = [];
    if (orderCount > 0) reasons.push(`${orderCount} historical order(s)`);
    if (savedCount > 0) reasons.push(`${savedCount} saved design(s)`);
    if (reservationCount > 0) reasons.push(`${reservationCount} stock reservation(s)`);

    if (reasons.length > 0) {
      res.status(409).json({
        success: false,
        canDeactivate: true,
        message: `Cannot permanently delete material "${material.name}" because its variants (${skus.join(", ")}) are referenced by: ${reasons.join(", ")}. Please deactivate or archive it instead to protect historical records.`,
      });
      return;
    }

    await StudioMaterial.findByIdAndDelete(id);
    res.json({
      success: true,
      message: `Material "${material.name}" and its variants have been safely removed.`,
    });
  } catch (error) {
    next(error);
  }
}

// ============================================================================
// DESIGN RULES & MAKING CHARGES CONTROLLERS
// ============================================================================

export async function getDesignRule(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { jewelleryType, constructionType } = req.params;
    const isAdmin = req.user?.role === "admin";
    const filter: any = {
      jewelleryType: jewelleryType.toLowerCase(),
      constructionType: constructionType.toLowerCase(),
    };
    if (!isAdmin) {
      const jType = await JewelleryType.findOne({
        slug: jewelleryType.toLowerCase(),
        isPublished: true,
        isEnabled: { $ne: false },
        isArchived: { $ne: true },
      });
      if (!jType) {
        throw new AppError(`Jewellery category "${jewelleryType}" is not available`, 404);
      }
      filter.isActive = true;
    }

    const rule = await DesignRule.findOne(filter);
    if (!rule) {
      throw new AppError(`Design rule for ${jewelleryType} / ${constructionType} not found`, 404);
    }

    res.json({ success: true, data: rule });
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
    const rule = await DesignRule.findOneAndUpdate(
      {
        jewelleryType: jewelleryType.toLowerCase(),
        constructionType: constructionType.toLowerCase(),
      },
      {
        $set: {
          ...req.body,
          jewelleryType: jewelleryType.toLowerCase(),
          constructionType: constructionType.toLowerCase(),
        },
        $inc: { version: 1 },
      },
      { upsert: true, new: true, runValidators: true }
    );

    res.json({ success: true, data: rule, message: "Design rule saved successfully" });
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
    const isAdmin = req.user?.role === "admin";
    const filter: any = {
      jewelleryType: jewelleryType.toLowerCase(),
      constructionType: constructionType.toLowerCase(),
    };
    if (!isAdmin) {
      const jType = await JewelleryType.findOne({
        slug: jewelleryType.toLowerCase(),
        isPublished: true,
        isEnabled: { $ne: false },
        isArchived: { $ne: true },
      });
      if (!jType) {
        throw new AppError(`Jewellery category "${jewelleryType}" is not available`, 404);
      }
      filter.isActive = true;
    }

    const charge = await MakingCharge.findOne(filter);
    if (!charge) {
      throw new AppError(`Making charge for ${jewelleryType} / ${constructionType} not found`, 404);
    }

    res.json({ success: true, data: charge });
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
    const charge = await MakingCharge.findOneAndUpdate(
      {
        jewelleryType: jewelleryType.toLowerCase(),
        constructionType: constructionType.toLowerCase(),
      },
      {
        $set: {
          ...req.body,
          jewelleryType: jewelleryType.toLowerCase(),
          constructionType: constructionType.toLowerCase(),
        },
      },
      { upsert: true, new: true, runValidators: true }
    );

    res.json({ success: true, data: charge, message: "Making charge saved successfully" });
  } catch (error) {
    next(error);
  }
}

// ============================================================================
// PRICE QUOTE CONTROLLER
// ============================================================================

export async function calculatePriceQuote(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const quote = await calculateDesignPrice(req.body);
    res.json({ success: true, data: quote });
  } catch (error) {
    next(error);
  }
}

// ============================================================================
// SAVED DESIGNS CONTROLLERS (AUTH REQUIRED)
// ============================================================================

export async function listSavedDesigns(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) {
      throw new AppError("Authentication required", 401);
    }
    const designs = await getUserSavedDesigns(userId);
    res.json({ success: true, data: designs });
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
    if (!userId) {
      throw new AppError("Authentication required", 401);
    }
    const { id } = req.params;
    const design = await getSavedDesignById(userId, id);
    res.json({ success: true, data: design });
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
    if (!userId) {
      throw new AppError("Authentication required", 401);
    }
    const design = await saveUserDesign(userId, req.body);
    res.status(201).json({
      success: true,
      data: design,
      message: "Design saved successfully",
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
    if (!userId) {
      throw new AppError("Authentication required", 401);
    }
    const { id } = req.params;
    const design = await updateUserDesign(userId, id, req.body);
    res.json({
      success: true,
      data: design,
      message: "Design updated successfully",
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
    if (!userId) {
      throw new AppError("Authentication required", 401);
    }
    const { id } = req.params;
    await deleteUserDesign(userId, id);
    res.json({ success: true, message: "Design deleted successfully" });
  } catch (error) {
    next(error);
  }
}

// ============================================================================
// DESIGN TEMPLATES CONTROLLERS
// ============================================================================

export async function listTemplates(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // Studio starter templates must ALWAYS be published only, regardless of who is browsing
    const templates = await getDesignTemplates(true);
    res.json({ success: true, data: templates });
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
    // Admin management view retrieves all templates (both published and drafts)
    const templates = await getDesignTemplates(false);
    res.json({ success: true, data: templates });
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
    const { slug } = req.params;
    // Public endpoint strictly requires published status
    const template = await getDesignTemplateBySlug(slug, false);
    res.json({ success: true, data: template });
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
    const { slug } = req.params;
    const template = await getDesignTemplateBySlug(slug, true);
    res.json({ success: true, data: template });
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
    const template = await createDesignTemplate(req.body);
    res.status(201).json({
      success: true,
      data: template,
      message: "Template created successfully",
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
    const { slug } = req.params;
    const template = await updateDesignTemplate(slug, req.body);
    res.json({
      success: true,
      data: template,
      message: "Template updated successfully",
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
    const { slug } = req.params;
    await deleteDesignTemplate(slug);
    res.json({ success: true, message: "Template deleted successfully" });
  } catch (error) {
    next(error);
  }
}

// ============================================================================
// STUDIO CART CONTROLLER (AUTH REQUIRED)
// ============================================================================

export async function addCustomDesignToCart(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) {
      throw new AppError("Authentication required", 401);
    }
    const result = await addDesignToUserCart(userId, req.body);
    res.status(201).json({
      success: true,
      data: result,
      message: `"${req.body.name}" added to shopping bag`,
    });
  } catch (error) {
    next(error);
  }
}

// ============================================================================
// AI DESIGN ASSISTANT CONTROLLER
// ============================================================================

export async function getAIDesignSuggestions(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const suggestions = await generateDesignSuggestions(req.body);
    res.json({
      success: true,
      data: suggestions,
      message: `Generated ${suggestions.length} curated design suggestion${suggestions.length === 1 ? "" : "s"}`,
    });
  } catch (error) {
    next(error);
  }
}

// ============================================================================
// STUDIO INVENTORY & RESERVATION CONTROLLERS (MILESTONE 6)
// ============================================================================

export async function getStudioReservationsAdmin(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { status, orderNumber, limit = 50, page = 1 } = req.query as any;
    const query: any = {};

    if (status) query.status = status;
    if (orderNumber) query.orderNumber = new RegExp(orderNumber.trim(), "i");

    const skip = (Number(page) - 1) * Number(limit);
    const [reservations, total] = await Promise.all([
      StudioReservation.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .populate("orderId", "orderNumber status paymentStatus total paymentMethod")
        .lean(),
      StudioReservation.countDocuments(query),
    ]);

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
      message: `Checked ${result.checked} pending reservations: released ${result.released}, committed ${result.committed}`,
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
    const { action, adminNotes } = req.body;
    if (!["force_commit", "refund_and_release"].includes(action)) {
      throw new AppError("Invalid reconciliation action. Must be 'force_commit' or 'refund_and_release'.", 400);
    }

    const updated = await reconcileStudioReservation(id, action, adminNotes);
    res.json({
      success: true,
      data: updated,
      message: `Reservation ${updated.orderNumber} successfully reconciled (${action})`,
    });
  } catch (error) {
    next(error);
  }
}



