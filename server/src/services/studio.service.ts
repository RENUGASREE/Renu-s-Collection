import { JewelleryType } from "../models/JewelleryType.js";
import { StudioMaterial, IStudioMaterial, IMaterialVariant } from "../models/StudioMaterial.js";
import { DesignRule } from "../models/DesignRule.js";
import { MakingCharge } from "../models/MakingCharge.js";
import { SavedDesign } from "../models/SavedDesign.js";
import { DesignTemplate } from "../models/DesignTemplate.js";
import { addStudioDesignToCart } from "./cart.service.js";
import { AppError } from "../middleware/errorHandler.js";
import { Types } from "mongoose";

// ============================================================================
// 1. SAFE IDEMPOTENT INITIALIZATION
// ============================================================================

export const KNOWN_SAMPLE_MATERIAL_CODES = [
  "MAT-ROSE-QUARTZ",
  "MAT-AMETHYST",
  "MAT-BLACK-ONYX",
  "MAT-TIGER-EYE",
  "MAT-TURQUOISE",
  "MAT-PEARL",
  "MAT-LAVA",
  "MAT-CLEAR-QUARTZ",
  "MAT-SPACER-SILVER",
  "MAT-CHARM-STAR",
  "MAT-CHARM-LOTUS",
];

export const KNOWN_SAMPLE_TEMPLATE_SLUGS = [
  "celestial-harmony",
  "grounding-earth",
];

export async function initStudioDefaults(): Promise<void> {
  try {
    // A. Base Bracelet Category template (only inserted if database has no bracelet record)
    await JewelleryType.findOneAndUpdate(
      { slug: "bracelet" },
      {
        $setOnInsert: {
          slug: "bracelet",
          displayName: "Bracelets",
          description: "Design bespoke handcrafted elastic bead and custom gemstone bracelets.",
          imageUrl: "https://images.unsplash.com/photo-1611591475878-1a51187494c8?auto=format&fit=crop&w=800&q=80",
          displayOrder: 1,
          isEnabled: true,
          isPublished: false,
          isArchived: false,
          designerStatus: "coming_soon" as const,
          supportedConstructionTypes: ["elastic_bead"],
        },
      },
      { upsert: true, new: true }
    );

    // B. Ensure legacy predefined types, if already in DB with no publication status, default to UNPUBLISHED
    await JewelleryType.updateMany(
      {
        slug: { $in: ["bracelet", "earrings", "bangles", "chain_necklace"] },
        isPublished: { $exists: false },
      },
      { $set: { isPublished: false, isArchived: false, designerStatus: "coming_soon" } }
    );

    // C. Default Elastic Bead Bracelet Design Rule
    await DesignRule.findOneAndUpdate(
      { jewelleryType: "bracelet", constructionType: "elastic_bead" },
      {
        $setOnInsert: {
          jewelleryType: "bracelet",
          constructionType: "elastic_bead",
          minWristMm: 130, // 13 cm
          maxWristMm: 220, // 22 cm
          minComponents: 12,
          maxComponents: 45,
          permittedBeadSizesMm: [4, 6, 8, 10, 12],
          allowedMaterialTypes: ["bead", "stone", "spacer", "charm"],
          maxCharms: 5,
          fitAllowanceMm: 10, // 10mm comfortable elastic ease
          requiresReviewThresholds: {
            minComponentsForReview: 14,
            maxComponentsForReview: 38,
            notes: "Artisan review recommended when component count deviates significantly from calibrated bead size standards.",
          },
          isActive: true,
          version: 1,
        },
      },
      { upsert: true, new: true }
    );

    // D. Default Making Charge for Elastic Bead Bracelet
    await MakingCharge.findOneAndUpdate(
      { jewelleryType: "bracelet", constructionType: "elastic_bead" },
      {
        $setOnInsert: {
          jewelleryType: "bracelet",
          constructionType: "elastic_bead",
          baseFee: 150, // INR 150 base artisanal stringing & finishing fee
          serviceCharges: [
            {
              name: "Premium Velvet Gift Box",
              fee: 100,
              isOptional: true,
              description: "Luxurious velvet keepsake storage and gift box",
            },
          ],
          isActive: true,
        },
      },
      { upsert: true, new: true }
    );
  } catch (err) {
    console.error("Studio initialization error (non-fatal):", err);
  }
}

// ============================================================================
// 1.1 STUDIO ARCHITECTURE & READINESS REPORT
// ============================================================================

export interface JewelleryTypeReadiness {
  slug: string;
  displayName: string;
  description?: string;
  imageUrl?: string;
  displayOrder: number;
  isEnabled: boolean;
  isPublished: boolean;
  isArchived: boolean;
  designerStatus: "available" | "coming_soon" | "maintenance";
  supportedConstructionTypes: string[];
  eligibleMaterialCount: number;
  inStockVariantCount: number;
  hasDesignRule: boolean;
  hasMakingCharge: boolean;
  templateCount: number;
  isFullyReady: boolean;
  gapAnalysis: {
    materialsStatus: "stocked" | "out_of_stock" | "lacking_catalogue_components";
    materialsDetail: string;
    rulesStatus: "active" | "missing_construction_rule";
    pricingStatus: "active" | "missing_craftsmanship_fee";
    summary: string;
  };
}

export async function getStudioReadinessReport(isAdmin: boolean = false): Promise<JewelleryTypeReadiness[]> {
  const filter: any = isAdmin
    ? { isArchived: { $ne: true } }
    : { isPublished: true, isEnabled: { $ne: false }, isArchived: { $ne: true } };

  const types = await JewelleryType.find(filter).sort({ displayOrder: 1, createdAt: 1 }).lean();
  const report: JewelleryTypeReadiness[] = [];

  for (const t of types) {
    const materials = await StudioMaterial.find({
      isActive: true,
      allowedJewelleryTypes: t.slug,
    }).lean();

    const eligibleCount = materials.length;
    const inStockVariantCount = materials.reduce(
      (sum, m) => sum + (m.variants || []).filter((v) => v.isActive && v.stock > 0).length,
      0
    );

    const primaryConstruction = (t.supportedConstructionTypes && t.supportedConstructionTypes[0]) || "";

    const [rule, makingCharge, templateCount] = await Promise.all([
      primaryConstruction
        ? DesignRule.findOne({ jewelleryType: t.slug, constructionType: primaryConstruction, isActive: true }).lean()
        : null,
      primaryConstruction
        ? MakingCharge.findOne({ jewelleryType: t.slug, constructionType: primaryConstruction, isActive: true }).lean()
        : null,
      DesignTemplate.countDocuments({ jewelleryType: t.slug, isPublished: true }),
    ]);

    const hasMaterials = eligibleCount > 0;
    const hasStock = inStockVariantCount > 0;
    const hasDesignRule = Boolean(rule);
    const hasMakingCharge = Boolean(makingCharge);
    const isPublished = Boolean(t.isPublished);
    const isAvailable = t.designerStatus === "available";

    const isFullyReady =
      hasMaterials &&
      hasStock &&
      hasDesignRule &&
      hasMakingCharge &&
      isAvailable &&
      isPublished &&
      t.isEnabled !== false &&
      !t.isArchived;

    // Dynamic gap analysis details based on live catalogue state
    let materialsStatus: "stocked" | "out_of_stock" | "lacking_catalogue_components" = "stocked";
    let materialsDetail = "";

    if (!hasMaterials) {
      materialsStatus = "lacking_catalogue_components";
      materialsDetail = "No active catalogue materials configured for this category yet.";
    } else if (!hasStock) {
      materialsStatus = "out_of_stock";
      materialsDetail = `${eligibleCount} material(s) configured, but all variants are currently out of stock.`;
    } else {
      materialsStatus = "stocked";
      materialsDetail = `${eligibleCount} active material(s) with ${inStockVariantCount} in-stock variant(s).`;
    }

    let summary = "";
    if (isFullyReady) {
      summary = `${t.displayName} studio is fully calibrated, stocked, and available for customer orders.`;
    } else if (!isPublished) {
      summary = `${t.displayName} is currently saved as unpublished in the Admin Studio.`;
    } else if (!isAvailable) {
      summary = `${t.displayName} is marked as ${t.designerStatus.replace("_", " ")} while catalogue components are prepared.`;
    } else if (!hasMaterials) {
      summary = `Awaiting active materials to be catalogued in Admin Studio.`;
    } else if (!hasStock) {
      summary = `Awaiting inventory replenishment for active components.`;
    } else if (!hasDesignRule) {
      summary = `Awaiting construction calibration rules in Admin Studio.`;
    } else if (!hasMakingCharge) {
      summary = `Awaiting craftsmanship making charges in Admin Studio.`;
    } else {
      summary = `Jewellery category configuration in progress.`;
    }

    report.push({
      slug: t.slug,
      displayName: t.displayName,
      description: t.description,
      imageUrl: t.imageUrl,
      displayOrder: t.displayOrder,
      isEnabled: t.isEnabled,
      isPublished: t.isPublished,
      isArchived: Boolean(t.isArchived),
      designerStatus: t.designerStatus,
      supportedConstructionTypes: t.supportedConstructionTypes || [],
      eligibleMaterialCount: eligibleCount,
      inStockVariantCount,
      hasDesignRule,
      hasMakingCharge,
      templateCount,
      isFullyReady,
      gapAnalysis: {
        materialsStatus,
        materialsDetail,
        rulesStatus: hasDesignRule ? "active" : "missing_construction_rule",
        pricingStatus: hasMakingCharge ? "active" : "missing_craftsmanship_fee",
        summary,
      },
    });
  }

  return report;
}

// ============================================================================
// 2. PUBLIC DATA PROJECTION (Security: strip purchase cost, hide inactive)
// ============================================================================

export interface PublicMaterialVariant {
  sku: string;
  color?: string;
  finish?: string;
  sizeLabel: string;
  dimensionsMm: IMaterialVariant["dimensionsMm"];
  sellingUnit: string;
  sellingRate: number;
  inStock: boolean;
  stock?: number;
}

export interface PublicStudioMaterial {
  id: string;
  name: string;
  code: string;
  description?: string;
  materialType: string;
  imageUrl: string;
  renderAssetUrl?: string;
  additionalImages: string[];
  allowedJewelleryTypes: string[];
  sortOrder: number;
  variants: PublicMaterialVariant[];
}

export function toPublicMaterial(mat: IStudioMaterial): PublicStudioMaterial {
  const activeVariants = (mat.variants || [])
    .filter((v) => v.isActive)
    .map((v) => ({
      sku: v.sku,
      color: v.color,
      finish: v.finish,
      sizeLabel: v.sizeLabel,
      dimensionsMm: v.dimensionsMm,
      sellingUnit: v.sellingUnit,
      sellingRate: v.sellingRate,
      inStock: typeof v.stock === "number" ? v.stock > 0 : false,
      stock: typeof v.stock === "number" ? v.stock : 0,
    }));

  return {
    id: mat._id.toString(),
    name: mat.name,
    code: mat.code,
    description: mat.description,
    materialType: mat.materialType,
    imageUrl: mat.imageUrl,
    renderAssetUrl: mat.renderAssetUrl,
    additionalImages: mat.additionalImages || [],
    allowedJewelleryTypes: mat.allowedJewelleryTypes || [],
    sortOrder: mat.sortOrder,
    variants: activeVariants,
  };
}

// ============================================================================
// 3. AUTHORITATIVE PRICE CALCULATION FOUNDATION
// ============================================================================

export interface ComponentSelectionInput {
  variantSku: string;
  quantity: number;
}

export interface PriceBreakdownItem {
  materialId: string;
  materialName: string;
  materialCode: string;
  materialType: string;
  variantSku: string;
  sizeLabel: string;
  color?: string;
  finish?: string;
  sellingUnit: string;
  unitRate: number;
  quantity: number;
  subtotal: number;
  imageUrl: string;
  renderAssetUrl?: string;
}

export interface DesignPriceQuote {
  jewelleryType: string;
  constructionType: string;
  items: PriceBreakdownItem[];
  totalComponentQuantity: number;
  componentSubtotal: number;
  makingCharge: {
    baseFee: number;
    selectedServiceCharges: Array<{ name: string; fee: number }>;
    totalMakingFee: number;
  };
  totalPrice: number;
  currency: string;
  calculatedAt: string;
  isProvisionalQuote: boolean;
  isPurchasable: boolean;
  status: "provisional_estimate";
  disclaimer: string;
}

export async function calculateDesignPrice(params: {
  jewelleryType: string;
  constructionType: string;
  components: ComponentSelectionInput[];
  selectedServiceCharges?: string[];
}): Promise<DesignPriceQuote> {
  const { jewelleryType, constructionType, components, selectedServiceCharges = [] } = params;

  // 1. Authoritative category & status verification
  const jType = await JewelleryType.findOne({
    slug: jewelleryType,
    isPublished: true,
    isEnabled: { $ne: false },
    isArchived: { $ne: true },
  });
  if (!jType) {
    throw new AppError(`Jewellery category "${jewelleryType}" is not published or active for custom orders`, 404);
  }

  if (jType.designerStatus !== "available") {
    throw new AppError(
      `Jewellery category "${jType.displayName}" is currently marked as ${jType.designerStatus.replace("_", " ")} and not open for orders`,
      400
    );
  }

  if (!jType.supportedConstructionTypes.includes(constructionType)) {
    throw new AppError(
      `Construction type "${constructionType}" is not supported for ${jType.displayName}`,
      400
    );
  }

  // 2. Enforce active construction DesignRule and MakingCharge (readiness requirements)
  const [rule, makingChargeConfig] = await Promise.all([
    DesignRule.findOne({
      jewelleryType,
      constructionType,
      isActive: true,
    }),
    MakingCharge.findOne({
      jewelleryType,
      constructionType,
      isActive: true,
    }),
  ]);

  if (!rule) {
    throw new AppError(
      `Design calibration rule for "${jType.displayName}" (${constructionType}) is not configured. This category is not yet ready for orders.`,
      400
    );
  }

  if (!makingChargeConfig) {
    throw new AppError(
      `Craftsmanship making charges for "${jType.displayName}" (${constructionType}) are not configured. This category is not yet ready for orders.`,
      400
    );
  }

  // 3. Validate component selection array
  if (!Array.isArray(components) || components.length === 0) {
    throw new AppError("At least one component is required to calculate pricing", 400);
  }

  // Aggregate quantities by SKU to prevent duplicate lookups
  const aggregatedMap = new Map<string, number>();
  for (const c of components) {
    if (!c.variantSku || typeof c.variantSku !== "string") {
      throw new AppError("Invalid or missing component variant SKU", 400);
    }
    const qty = Number(c.quantity);
    if (!Number.isInteger(qty) || qty <= 0) {
      throw new AppError(`Invalid quantity for SKU "${c.variantSku}": must be a positive integer`, 400);
    }
    aggregatedMap.set(c.variantSku, (aggregatedMap.get(c.variantSku) || 0) + qty);
  }

  // 4. Retrieve authoritative variant and material data
  const skus = Array.from(aggregatedMap.keys());
  const materials = await StudioMaterial.find({
    "variants.sku": { $in: skus },
    isActive: true,
  });

  const breakdownItems: PriceBreakdownItem[] = [];
  let componentSubtotal = 0;
  let totalComponentQuantity = 0;

  for (const [sku, quantity] of aggregatedMap.entries()) {
    // Find matching material and variant
    const mat = materials.find((m) => m.variants.some((v) => v.sku === sku));
    if (!mat) {
      throw new AppError(`Material component with SKU "${sku}" was not found or is currently inactive`, 404);
    }

    // Verify category/type eligibility
    if (!mat.allowedJewelleryTypes.includes(jewelleryType)) {
      throw new AppError(
        `Component "${mat.name}" (${sku}) is not eligible for use in ${jType.displayName}`,
        400
      );
    }

    // Verify component materialType against DesignRule allowed types
    if (rule.allowedMaterialTypes && rule.allowedMaterialTypes.length > 0) {
      if (!rule.allowedMaterialTypes.includes(mat.materialType)) {
        throw new AppError(
          `Component type "${mat.materialType}" (${mat.name}) is not permitted under construction rules for ${jType.displayName}`,
          400
        );
      }
    }

    const variant = mat.variants.find((v) => v.sku === sku);
    if (!variant || !variant.isActive) {
      throw new AppError(`Variant "${sku}" is inactive or unavailable`, 400);
    }

    if (typeof variant.stock === "number" && variant.stock <= 0) {
      throw new AppError(`Component variant "${variant.sizeLabel || sku}" of "${mat.name}" is currently out of stock`, 400);
    }

    // Safe monetary calculation in Rupees (2 decimal places)
    const unitRate = Number(variant.sellingRate);
    if (isNaN(unitRate) || unitRate < 0) {
      throw new AppError(`Authoritative selling rate for SKU "${sku}" is invalid`, 500);
    }

    const itemSubtotal = Math.round(unitRate * quantity * 100) / 100;
    componentSubtotal += itemSubtotal;
    totalComponentQuantity += quantity;

    breakdownItems.push({
      materialId: mat._id.toString(),
      materialName: mat.name,
      materialCode: mat.code,
      materialType: mat.materialType,
      variantSku: variant.sku,
      sizeLabel: variant.sizeLabel,
      color: variant.color,
      finish: variant.finish,
      sellingUnit: variant.sellingUnit,
      unitRate,
      quantity,
      subtotal: itemSubtotal,
      imageUrl: mat.imageUrl,
      renderAssetUrl: mat.renderAssetUrl,
    });
  }

  // 5. Validate total component count against the design rule
  if (
    (typeof rule.minComponents === "number" && totalComponentQuantity < rule.minComponents) ||
    (typeof rule.maxComponents === "number" && totalComponentQuantity > rule.maxComponents)
  ) {
    throw new AppError(
      `Component count (${totalComponentQuantity}) must be between ${rule.minComponents} and ${rule.maxComponents} for ${jType.displayName}`,
      400
    );
  }

  componentSubtotal = Math.round(componentSubtotal * 100) / 100;

  // 6. Calculate craftsmanship making charges
  const baseFee = Number(makingChargeConfig.baseFee) || 0;
  const activeServiceCharges = makingChargeConfig.serviceCharges || [];

  const matchedServiceCharges: Array<{ name: string; fee: number }> = [];
  let serviceChargesTotal = 0;

  for (const requestedCharge of selectedServiceCharges) {
    const chargeDef = activeServiceCharges.find(
      (sc) => sc.name.toLowerCase() === requestedCharge.toLowerCase()
    );
    if (chargeDef) {
      matchedServiceCharges.push({ name: chargeDef.name, fee: chargeDef.fee });
      serviceChargesTotal += chargeDef.fee;
    }
  }

  const totalMakingFee = Math.round((baseFee + serviceChargesTotal) * 100) / 100;
  const totalPrice = Math.round((componentSubtotal + totalMakingFee) * 100) / 100;

  return {
    jewelleryType,
    constructionType,
    items: breakdownItems,
    totalComponentQuantity,
    componentSubtotal,
    makingCharge: {
      baseFee,
      selectedServiceCharges: matchedServiceCharges,
      totalMakingFee,
    },
    totalPrice: Math.max(0, totalPrice),
    currency: "INR",
    calculatedAt: new Date().toISOString(),
    isProvisionalQuote: true,
    isPurchasable: false,
    status: "provisional_estimate",
    disclaimer:
      "This is a provisional design cost estimate based on component rates and base craftsmanship fees. It does not constitute an approved, fit-validated, or checkout-ready order. Final manufacturing feasibility and physical calibration must be confirmed before order placement.",
  };
}

// ============================================================================
// 5. SAVED DESIGNS (USER-AUTHENTICATED)
// ============================================================================

export async function getUserSavedDesigns(userId: string) {
  if (!Types.ObjectId.isValid(userId)) {
    throw new AppError("Invalid user id", 400);
  }
  return SavedDesign.find({ userId: new Types.ObjectId(userId) })
    .sort({ updatedAt: -1 })
    .lean();
}

export async function getSavedDesignById(userId: string, id: string) {
  if (!Types.ObjectId.isValid(userId) || !Types.ObjectId.isValid(id)) {
    throw new AppError("Invalid id", 400);
  }
  const design = await SavedDesign.findOne({
    _id: new Types.ObjectId(id),
    userId: new Types.ObjectId(userId),
  }).lean();
  if (!design) {
    throw new AppError("Saved design not found", 404);
  }
  return design;
}

export async function saveUserDesign(
  userId: string,
  input: {
    name: string;
    jewelleryType?: "bracelet";
    constructionType?: "elastic_bead";
    wristMm: number;
    beadSequence: any[];
    charms?: any[];
    estimatedTotal?: number;
  }
) {
  if (!Types.ObjectId.isValid(userId)) {
    throw new AppError("Invalid user id", 400);
  }

  // Pre-calculate fresh quote to store fresh estimatedTotal and timestamp
  const skuCounts: Record<string, number> = {};
  for (const b of input.beadSequence) {
    if (b.variantSku) {
      skuCounts[b.variantSku] = (skuCounts[b.variantSku] || 0) + 1;
    }
  }
  for (const c of input.charms || []) {
    if (c.variantSku) {
      skuCounts[c.variantSku] = (skuCounts[c.variantSku] || 0) + 1;
    }
  }

  const components = Object.entries(skuCounts).map(([variantSku, quantity]) => ({
    variantSku,
    quantity,
  }));

  let estimatedTotal = 0;
  if (components.length > 0) {
    try {
      const quote = await calculateDesignPrice({
        jewelleryType: input.jewelleryType || "bracelet",
        constructionType: input.constructionType || "elastic_bead",
        components,
      });
      estimatedTotal = quote.totalPrice;
    } catch {
      // Do not trust client estimate if quote calculation fails
      estimatedTotal = 0;
    }
  }

  const design = await SavedDesign.create({
    userId: new Types.ObjectId(userId),
    name: input.name,
    jewelleryType: input.jewelleryType || "bracelet",
    constructionType: input.constructionType || "elastic_bead",
    wristMm: input.wristMm,
    beadSequence: input.beadSequence,
    charms: input.charms || [],
    estimatedTotal,
    lastValidatedAt: new Date(),
  });

  return design;
}

export async function updateUserDesign(
  userId: string,
  id: string,
  input: {
    name?: string;
    wristMm?: number;
    beadSequence?: any[];
    charms?: any[];
    estimatedTotal?: number;
  }
) {
  if (!Types.ObjectId.isValid(userId) || !Types.ObjectId.isValid(id)) {
    throw new AppError("Invalid id", 400);
  }

  const design = await SavedDesign.findOne({
    _id: new Types.ObjectId(id),
    userId: new Types.ObjectId(userId),
  });
  if (!design) {
    throw new AppError("Saved design not found", 404);
  }

  if (input.name !== undefined) design.name = input.name;
  if (input.wristMm !== undefined) design.wristMm = input.wristMm;
  if (input.beadSequence !== undefined) design.beadSequence = input.beadSequence;
  if (input.charms !== undefined) design.charms = input.charms;

  // Recalculate authoritative estimatedTotal server-side from current design components
  const activeBeads = design.beadSequence || [];
  const activeCharms = design.charms || [];
  const skuCounts: Record<string, number> = {};
  for (const b of activeBeads) {
    if (b.variantSku) {
      skuCounts[b.variantSku] = (skuCounts[b.variantSku] || 0) + 1;
    }
  }
  for (const c of activeCharms) {
    if (c.variantSku) {
      skuCounts[c.variantSku] = (skuCounts[c.variantSku] || 0) + 1;
    }
  }

  const components = Object.entries(skuCounts).map(([variantSku, quantity]) => ({
    variantSku,
    quantity,
  }));

  if (components.length > 0) {
    try {
      const quote = await calculateDesignPrice({
        jewelleryType: design.jewelleryType || "bracelet",
        constructionType: design.constructionType || "elastic_bead",
        components,
      });
      design.estimatedTotal = quote.totalPrice;
    } catch {
      design.estimatedTotal = 0;
    }
  } else {
    design.estimatedTotal = 0;
  }
  design.lastValidatedAt = new Date();

  await design.save();
  return design;
}

export async function deleteUserDesign(userId: string, id: string) {
  if (!Types.ObjectId.isValid(userId) || !Types.ObjectId.isValid(id)) {
    throw new AppError("Invalid id", 400);
  }

  const result = await SavedDesign.findOneAndDelete({
    _id: new Types.ObjectId(id),
    userId: new Types.ObjectId(userId),
  });
  if (!result) {
    throw new AppError("Saved design not found", 404);
  }
  return { success: true };
}

// ============================================================================
// 6. DESIGN TEMPLATES (PUBLIC & ADMIN)
// ============================================================================

export async function getDesignTemplates(onlyPublished = true) {
  if (onlyPublished) {
    const publishedTypes = await JewelleryType.find({
      isPublished: true,
      isEnabled: { $ne: false },
      isArchived: { $ne: true },
    }).select("slug").lean();
    const publishedSlugs = publishedTypes.map((t) => t.slug.toLowerCase());
    return DesignTemplate.find({
      isPublished: true,
      jewelleryType: { $in: publishedSlugs },
    }).sort({ sortOrder: 1, createdAt: -1 }).lean();
  }
  return DesignTemplate.find({}).sort({ sortOrder: 1, createdAt: -1 }).lean();
}

export async function getDesignTemplateBySlug(slug: string, isAdmin = false) {
  const template = await DesignTemplate.findOne({ slug: slug.toLowerCase() }).lean();
  if (!template) {
    throw new AppError("Design template not found", 404);
  }
  if (!isAdmin) {
    if (!template.isPublished) {
      throw new AppError("Design template not found", 404);
    }
    const jType = await JewelleryType.findOne({
      slug: template.jewelleryType?.toLowerCase(),
      isPublished: true,
      isEnabled: { $ne: false },
      isArchived: { $ne: true },
    });
    if (!jType) {
      throw new AppError("Design template is currently unavailable", 404);
    }
  }
  return template;
}

export async function createDesignTemplate(input: any) {
  const existing = await DesignTemplate.findOne({ slug: input.slug.toLowerCase() });
  if (existing) {
    throw new AppError(`Template with slug "${input.slug}" already exists`, 409);
  }
  return DesignTemplate.create({
    ...input,
    slug: input.slug.toLowerCase(),
  });
}

export async function updateDesignTemplate(slug: string, input: any) {
  const template = await DesignTemplate.findOne({ slug: slug.toLowerCase() });
  if (!template) {
    throw new AppError("Design template not found", 404);
  }
  Object.assign(template, input);
  if (input.slug) {
    template.slug = input.slug.toLowerCase();
  }
  await template.save();
  return template;
}

export async function deleteDesignTemplate(slug: string) {
  const result = await DesignTemplate.findOneAndDelete({ slug: slug.toLowerCase() });
  if (!result) {
    throw new AppError("Design template not found", 404);
  }
  return { success: true };
}

// ============================================================================
// 7. CART INTEGRATION FOR STUDIO DESIGNS
// ============================================================================

export async function addDesignToUserCart(
  userId: string,
  input: {
    savedDesignId?: string;
    name: string;
    jewelleryType: string;
    constructionType: string;
    wristMm: number;
    quantity?: number;
    imageUrl?: string;
    beadSequence: any[];
    charms?: any[];
    selectedServiceCharges?: string[];
  }
) {
  if (!Types.ObjectId.isValid(userId)) {
    throw new AppError("Invalid user id", 401);
  }

  // 1. Authoritative server-side price calculation
  const skuCounts: Record<string, number> = {};
  for (const b of input.beadSequence) {
    if (b.variantSku) {
      skuCounts[b.variantSku] = (skuCounts[b.variantSku] || 0) + 1;
    }
  }
  for (const c of input.charms || []) {
    if (c.variantSku) {
      skuCounts[c.variantSku] = (skuCounts[c.variantSku] || 0) + 1;
    }
  }

  const components = Object.entries(skuCounts).map(([variantSku, quantity]) => ({
    variantSku,
    quantity,
  }));

  if (components.length === 0) {
    throw new AppError("Design has no components", 400);
  }

  const quote = await calculateDesignPrice({
    jewelleryType: input.jewelleryType,
    constructionType: input.constructionType,
    components,
    selectedServiceCharges: input.selectedServiceCharges || [],
  });

  // 2. Validate sizing and charm limits against the design rule
  const rule = await DesignRule.findOne({
    jewelleryType: input.jewelleryType.toLowerCase(),
    constructionType: input.constructionType.toLowerCase(),
    isActive: true,
  });
  if (rule) {
    if (typeof input.wristMm === "number") {
      if (typeof rule.minWristMm === "number" && input.wristMm < rule.minWristMm) {
        throw new AppError(
          `Wrist size (${input.wristMm}mm) cannot be less than the minimum of ${rule.minWristMm}mm`,
          400
        );
      }
      if (typeof rule.maxWristMm === "number" && input.wristMm > rule.maxWristMm) {
        throw new AppError(
          `Wrist size (${input.wristMm}mm) cannot exceed the maximum of ${rule.maxWristMm}mm`,
          400
        );
      }
    }
    const charmCount = (input.charms || []).length;
    if (typeof rule.maxCharms === "number" && charmCount > rule.maxCharms) {
      throw new AppError(
        `Number of charms (${charmCount}) exceeds the maximum allowed (${rule.maxCharms})`,
        400
      );
    }
  }

  // 2. Build thumbnail image from first bead with an image, or input.imageUrl
  let displayImage = input.imageUrl;
  if (!displayImage) {
    const beadWithImage = input.beadSequence.find((b) => b.imageUrl);
    displayImage = beadWithImage?.imageUrl || "/assets/images/placeholder-jewellery.png";
  }

  // 3. Assemble snapshot
  const studioDesignSnapshot = {
    savedDesignId: input.savedDesignId && Types.ObjectId.isValid(input.savedDesignId)
      ? new Types.ObjectId(input.savedDesignId)
      : undefined,
    name: input.name,
    jewelleryType: input.jewelleryType,
    constructionType: input.constructionType,
    wristMm: input.wristMm,
    beadSequence: input.beadSequence,
    charms: input.charms || [],
    breakdown: {
      componentsTotal: quote.componentSubtotal,
      baseMakingCharge: quote.makingCharge.baseFee,
      customizationCharge: quote.makingCharge.totalMakingFee - quote.makingCharge.baseFee,
      total: quote.totalPrice,
    },
  };

  // 4. Add to cart using the dedicated cart helper
  const cartItems = await addStudioDesignToCart(userId, {
    name: input.name,
    unitPrice: quote.totalPrice,
    quantity: input.quantity || 1,
    imageUrl: displayImage,
    studioDesign: studioDesignSnapshot,
  });

  return {
    cartItems,
    addedDesign: {
      name: input.name,
      unitPrice: quote.totalPrice,
      quantity: input.quantity || 1,
      breakdown: studioDesignSnapshot.breakdown,
    },
  };
}

