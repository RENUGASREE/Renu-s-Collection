import { Request, Response, NextFunction } from "express";
import { JewelleryType } from "../models/JewelleryType.js";
import { StudioMaterial } from "../models/StudioMaterial.js";
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
    const { jewelleryType, materialType, search, page = 1, limit = 50 } = req.query as any;

    const query: any = { isActive: true };

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
      query.allowedJewelleryTypes = jTypeSlug;
    }

    if (materialType) {
      query.materialType = materialType;
    }

    if (search && typeof search === "string" && search.trim()) {
      const regex = new RegExp(search.trim(), "i");
      query.$or = [{ name: regex }, { code: regex }, { "variants.sku": regex }];
    }

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
    const { jewelleryType, materialType, isActive, search, page = 1, limit = 50 } = req.query as any;

    const query: any = {};

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
    const [materials, total] = await Promise.all([
      StudioMaterial.find(query)
        .sort({ sortOrder: 1, createdAt: -1 })
        .skip(skip)
        .limit(Number(limit)),
      StudioMaterial.countDocuments(query),
    ]);

    res.json({
      success: true,
      data: materials,
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

    if (updates.code) {
      updates.code = updates.code.toUpperCase();
      const existing = await StudioMaterial.findOne({ code: updates.code, _id: { $ne: id } });
      if (existing) {
        throw new AppError(`Another material with code "${updates.code}" already exists`, 409);
      }
    }

    // Do not overwrite entire variants array via general update to avoid wiping stock;
    // use dedicated variant endpoints instead.
    delete updates.variants;

    const material = await StudioMaterial.findByIdAndUpdate(id, { $set: updates }, { new: true });
    if (!material) {
      throw new AppError("Material not found", 404);
    }

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
    const targetSku = sku.toUpperCase();
    const updates = req.body;

    const material = await StudioMaterial.findById(id);
    if (!material) {
      throw new AppError("Material not found", 404);
    }

    const variant = material.variants.find((v) => v.sku === targetSku);
    if (!variant) {
      throw new AppError(`Variant with SKU "${targetSku}" not found on this material`, 404);
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
      message: `Variant "${targetSku}" updated successfully`,
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
    const targetSku = sku.toUpperCase();

    const material = await StudioMaterial.findById(id);
    if (!material) {
      throw new AppError("Material not found", 404);
    }

    const variant = material.variants.find((v) => v.sku === targetSku);
    if (!variant) {
      throw new AppError(`Variant "${targetSku}" not found`, 404);
    }

    // Soft disable variant to preserve order history and design quotes
    variant.isActive = false;
    await material.save();

    res.json({
      success: true,
      data: material,
      message: `Variant "${targetSku}" has been disabled`,
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

    // Safeguard: Check if any variant SKU is used in historical orders, saved designs, or reservations
    const [orderCount, savedCount, reservationCount] = await Promise.all([
      Order.countDocuments({ "items.customDesign.beadSequence.variantSku": { $in: skus } }),
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
      throw new AppError(
        `Cannot permanently delete material "${material.name}" because its variants (${skus.join(", ")}) are referenced by: ${reasons.join(", ")}. Please deactivate or archive it instead to protect historical records.`,
        409
      );
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
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const isAdmin = req.user?.role === "admin";
    const templates = await getDesignTemplates(!isAdmin);
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
    const isAdmin = req.user?.role === "admin";
    const template = await getDesignTemplateBySlug(slug, isAdmin);
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



