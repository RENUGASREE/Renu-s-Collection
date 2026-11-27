/**
 * ============================================================================
 * Studio Service (Phase 3H)
 * ============================================================================
 *
 * Implements core Studio business logic for bespoke jewellery creation:
 * - Studio readiness assessments and dynamic gap analysis.
 * - Secure public catalogue projections.
 * - Authoritative pricing quotes and component breakdowns.
 * - User saved design management (CRUD) with customer ownership checks.
 * - Design templates catalogue and validation.
 * - Studio custom design cart integration.
 *
 * Adheres strictly to:
 * - PostgreSQL repository layer (`PostgresStudioRepository`).
 * - Zero direct Mongoose database queries.
 * - Dual ID compatibility (MongoDB ObjectId and UUID).
 * - Preservation of all existing material and variant attributes and stock.
 * - Dependency injection for test isolation without database writes.
 */

import { PostgresStudioRepository } from "../repositories/postgres-studio.repository.js";
import { addStudioDesignToCart } from "./cart.service.js";
import { AppError } from "../middleware/errorHandler.js";
import { env } from "../config/env.js";
import { assertValidEntityId } from "../utils/helpers.js";
import {
  IDbClient,
  IStudioMaterialRecord,
  ISavedDesignRecord,
  IDesignTemplateRecord,
} from "../types/database.types.js";

let defaultStudioRepo = new PostgresStudioRepository();

export function setStudioRepository(repo: PostgresStudioRepository): void {
  defaultStudioRepo = repo;
}

export function getStudioRepository(): PostgresStudioRepository {
  return defaultStudioRepo;
}

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

export async function initStudioDefaults(client?: IDbClient): Promise<void> {
  const repo = defaultStudioRepo;
  try {
    // A. Base Bracelet Category template
    const existingBracelet = await repo.findJewelleryTypeBySlug("bracelet", client);
    if (!existingBracelet) {
      await repo.createJewelleryType(
        {
          slug: "bracelet",
          displayName: "Bracelets",
          description: "Design bespoke handcrafted elastic bead and custom gemstone bracelets.",
          imageUrl: "https://images.unsplash.com/photo-1611591475878-1a51187494c8?auto=format&fit=crop&w=800&q=80",
          displayOrder: 1,
          isEnabled: true,
          isPublished: false,
          isArchived: false,
          designerStatus: "coming_soon",
          supportedConstructionTypes: ["elastic_bead"],
        },
        client
      );
    }

    // B. Default Elastic Bead Bracelet Design Rule
    const existingRule = await repo.findDesignRule("bracelet", "elastic_bead", client);
    if (!existingRule) {
      await repo.upsertDesignRule(
        {
          jewelleryType: "bracelet",
          constructionType: "elastic_bead",
          minWristMm: 130,
          maxWristMm: 220,
          minComponents: 12,
          maxComponents: 45,
          permittedBeadSizesMm: [4, 6, 8, 10, 12],
          allowedMaterialTypes: ["bead", "stone", "spacer", "charm"],
          maxCharms: 5,
          fitAllowanceMm: 10,
          requiresReviewThresholds: {
            minComponentsForReview: 14,
            maxComponentsForReview: 38,
            notes: "Artisan review recommended when component count deviates significantly from calibrated bead size standards.",
          },
          isActive: true,
          version: 1,
        },
        client
      );
    }

    // C. Default Making Charge for Elastic Bead Bracelet
    const existingCharge = await repo.findMakingCharge("bracelet", "elastic_bead", client);
    if (!existingCharge) {
      await repo.upsertMakingCharge(
        {
          jewelleryType: "bracelet",
          constructionType: "elastic_bead",
          baseFee: 150,
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
        client
      );
    }
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

export async function getStudioReadinessReport(
  isAdmin: boolean = false,
  client?: IDbClient
): Promise<JewelleryTypeReadiness[]> {
  const repo = defaultStudioRepo;
  const filter = isAdmin
    ? { isArchived: false }
    : { isPublished: true, isEnabled: true, isArchived: false };

  const types = await repo.listJewelleryTypes(filter, client);
  const report: JewelleryTypeReadiness[] = [];

  for (const t of types) {
    const { materials } = await repo.findMaterials(
      {
        isActive: true,
        jewelleryType: t.slug,
        visibilityScope: "studio",
      },
      client
    );

    const eligibleCount = materials.length;
    const inStockVariantCount = materials.reduce(
      (sum, m) => sum + (m.variants || []).filter((v) => v.isActive && v.stock > 0).length,
      0
    );

    const primaryConstruction = (t.supportedConstructionTypes && t.supportedConstructionTypes[0]) || "";

    const [rule, makingCharge, templateCount] = await Promise.all([
      primaryConstruction
        ? repo.findDesignRule(t.slug, primaryConstruction, client)
        : null,
      primaryConstruction
        ? repo.findMakingCharge(t.slug, primaryConstruction, client)
        : null,
      repo.countTemplates(t.slug, true, client),
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
      description: t.description || undefined,
      imageUrl: t.imageUrl || undefined,
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
// 2. PUBLIC DATA PROJECTION
// ============================================================================

export interface PublicMaterialVariant {
  sku: string;
  color?: string;
  finish?: string;
  sizeLabel: string;
  dimensionsMm: any;
  sellingUnit: string;
  sellingRate: number;
  inStock: boolean;
  stock?: number;
  imageUrl?: string;
  renderAssetUrl?: string;
}

export interface PublicStudioMaterial {
  id: string;
  _id?: string;
  name: string;
  code: string;
  description?: string;
  materialType: string;
  imageUrl?: string | null;
  renderAssetUrl?: string;
  additionalImages: string[];
  allowedJewelleryTypes: string[];
  visibilityScopes: string[];
  sortOrder: number;
  selectionPolicy?: 'customer_selects_variant' | 'seller_random_variant';
  assortmentNotes?: string;
  eligibleAssortmentSkus?: string[];
  variants: PublicMaterialVariant[];
}

export function toPublicMaterial(mat: IStudioMaterialRecord): PublicStudioMaterial {
  const activeVariants = (mat.variants || [])
    .filter((v) => v.isActive)
    .map((v) => ({
      sku: v.sku,
      color: v.color || undefined,
      finish: v.finish || undefined,
      sizeLabel: v.sizeLabel,
      dimensionsMm: v.dimensionsMm,
      sellingUnit: v.sellingUnit,
      sellingRate: v.sellingRate,
      inStock: v.stock > 0,
      stock: v.stock,
      imageUrl: v.imageUrl || undefined,
      renderAssetUrl: v.renderAssetUrl || undefined,
    }));

  return {
    id: mat.id,
    _id: mat.id,
    name: mat.name,
    code: mat.code,
    description: mat.description || undefined,
    materialType: mat.materialType,
    imageUrl: mat.imageUrl || undefined,
    renderAssetUrl: mat.renderAssetUrl || undefined,
    additionalImages: mat.additionalImages || [],
    allowedJewelleryTypes: mat.allowedJewelleryTypes || [],
    visibilityScopes: mat.visibilityScopes || ["studio"],
    sortOrder: mat.sortOrder,
    selectionPolicy: mat.selectionPolicy || 'customer_selects_variant',
    assortmentNotes: mat.assortmentNotes || undefined,
    eligibleAssortmentSkus: mat.eligibleAssortmentSkus || [],
    variants: activeVariants,
  };
}

// ============================================================================
// 3. AUTHORITATIVE PRICE CALCULATION & QUOTE ENGINE
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
  color?: string | null;
  finish?: string | null;
  sellingUnit: string;
  unitRate: number;
  quantity: number;
  subtotal: number;
  imageUrl?: string | null;
  renderAssetUrl?: string | null;
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
  status: string;
  disclaimer: string;
}

export async function calculateDesignPrice(
  params: {
    jewelleryType: string;
    constructionType: string;
    components: ComponentSelectionInput[];
    selectedServiceCharges?: string[];
  },
  client?: IDbClient
): Promise<DesignPriceQuote> {
  const { jewelleryType, constructionType, components, selectedServiceCharges = [] } = params;
  const repo = defaultStudioRepo;

  // 1. Category & status verification
  const jType = await repo.findJewelleryTypeBySlug(jewelleryType, client);
  if (!jType || !jType.isPublished || jType.isEnabled === false || jType.isArchived) {
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

  // 2. Enforce active construction DesignRule and MakingCharge
  const [rule, makingChargeConfig] = await Promise.all([
    repo.findDesignRule(jewelleryType, constructionType, client),
    repo.findMakingCharge(jewelleryType, constructionType, client),
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

  const aggregatedMap = new Map<string, number>();
  for (const c of components) {
    if (!c.variantSku || typeof c.variantSku !== "string") {
      throw new AppError("Invalid or missing component variant SKU", 400);
    }
    const qty = Number(c.quantity);
    if (!Number.isInteger(qty) || qty <= 0) {
      throw new AppError(`Invalid quantity for SKU "${c.variantSku}": must be a positive integer`, 400);
    }
    aggregatedMap.set(c.variantSku.trim().toUpperCase(), (aggregatedMap.get(c.variantSku.trim().toUpperCase()) || 0) + qty);
  }

  // 4. Retrieve authoritative variant and material data
  const skus = Array.from(aggregatedMap.keys());
  const materials = await repo.findMaterialsBySkus(skus, client);

  const breakdownItems: PriceBreakdownItem[] = [];
  let componentSubtotal = 0;
  let totalComponentQuantity = 0;

  for (const [sku, quantity] of aggregatedMap.entries()) {
    const mat = materials.find((m) => m.variants.some((v) => v.sku === sku));
    if (!mat || !mat.isActive) {
      throw new AppError(`Material component with SKU "${sku}" was not found or is currently inactive`, 404);
    }

    if (!mat.allowedJewelleryTypes.includes(jewelleryType)) {
      throw new AppError(
        `Component "${mat.name}" (${sku}) is not eligible for use in ${jType.displayName}`,
        400
      );
    }

    const scopes = mat.visibilityScopes && mat.visibilityScopes.length > 0 ? mat.visibilityScopes : ["studio"];
    if (!scopes.includes("studio")) {
      throw new AppError(
        `Component "${mat.name}" (${sku}) is not enabled for use in Create Your Own Studio`,
        400
      );
    }

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

    const unitRate = Number(variant.sellingRate);
    if (isNaN(unitRate) || unitRate < 0) {
      throw new AppError(`Authoritative selling rate for SKU "${sku}" is invalid`, 500);
    }

    const itemSubtotal = Math.round(unitRate * quantity * 100) / 100;
    componentSubtotal += itemSubtotal;
    totalComponentQuantity += quantity;

    breakdownItems.push({
      materialId: mat.id,
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
      imageUrl: mat.imageUrl || null,
      renderAssetUrl: mat.renderAssetUrl || null,
    });
  }

  // 5. Validate total component count against design rule
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
// 4. SAVED DESIGNS
// ============================================================================

export async function getUserSavedDesigns(userId: string, client?: IDbClient): Promise<ISavedDesignRecord[]> {
  assertValidEntityId(userId, "userId");
  const repo = defaultStudioRepo;
  return repo.findSavedDesignsByUserId(userId, client);
}

export async function getSavedDesignById(
  userId: string,
  id: string,
  client?: IDbClient
): Promise<ISavedDesignRecord> {
  assertValidEntityId(userId, "userId");
  assertValidEntityId(id, "savedDesignId");
  const repo = defaultStudioRepo;
  const design = await repo.findSavedDesignById(id, client);
  if (!design || design.userId !== userId) {
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
  },
  client?: IDbClient
): Promise<ISavedDesignRecord> {
  assertValidEntityId(userId, "userId");
  const repo = defaultStudioRepo;

  const skuCounts: Record<string, number> = {};
  for (const b of input.beadSequence || []) {
    if (b.variantSku) {
      const s = String(b.variantSku).trim().toUpperCase();
      skuCounts[s] = (skuCounts[s] || 0) + 1;
    }
  }
  for (const c of input.charms || []) {
    if (c.variantSku) {
      const s = String(c.variantSku).trim().toUpperCase();
      skuCounts[s] = (skuCounts[s] || 0) + 1;
    }
  }

  const components = Object.entries(skuCounts).map(([variantSku, quantity]) => ({
    variantSku,
    quantity,
  }));

  let estimatedTotal = 0;
  if (components.length > 0) {
    try {
      const quote = await calculateDesignPrice(
        {
          jewelleryType: input.jewelleryType || "bracelet",
          constructionType: input.constructionType || "elastic_bead",
          components,
        },
        client
      );
      estimatedTotal = quote.totalPrice;
    } catch {
      estimatedTotal = 0;
    }
  }

  return repo.createSavedDesign(
    {
      userId,
      name: input.name,
      jewelleryType: input.jewelleryType || "bracelet",
      constructionType: input.constructionType || "elastic_bead",
      wristMm: input.wristMm,
      beadSequence: input.beadSequence || [],
      charms: input.charms || [],
      estimatedTotal,
    },
    client
  );
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
  },
  client?: IDbClient
): Promise<ISavedDesignRecord> {
  assertValidEntityId(userId, "userId");
  assertValidEntityId(id, "savedDesignId");
  const repo = defaultStudioRepo;

  const existing = await repo.findSavedDesignById(id, client);
  if (!existing || existing.userId !== userId) {
    throw new AppError("Saved design not found", 404);
  }

  const activeBeads = input.beadSequence !== undefined ? input.beadSequence : existing.beadSequence;
  const activeCharms = input.charms !== undefined ? input.charms : existing.charms;
  const activeJewelleryType = existing.jewelleryType || "bracelet";
  const activeConstructionType = existing.constructionType || "elastic_bead";

  const skuCounts: Record<string, number> = {};
  for (const b of activeBeads || []) {
    if (b.variantSku) {
      const s = String(b.variantSku).trim().toUpperCase();
      skuCounts[s] = (skuCounts[s] || 0) + 1;
    }
  }
  for (const c of activeCharms || []) {
    if (c.variantSku) {
      const s = String(c.variantSku).trim().toUpperCase();
      skuCounts[s] = (skuCounts[s] || 0) + 1;
    }
  }

  const components = Object.entries(skuCounts).map(([variantSku, quantity]) => ({
    variantSku,
    quantity,
  }));

  let estimatedTotal = 0;
  if (components.length > 0) {
    try {
      const quote = await calculateDesignPrice(
        {
          jewelleryType: activeJewelleryType,
          constructionType: activeConstructionType,
          components,
        },
        client
      );
      estimatedTotal = quote.totalPrice;
    } catch {
      estimatedTotal = 0;
    }
  }

  const updated = await repo.updateSavedDesign(
    id,
    {
      name: input.name,
      wristMm: input.wristMm,
      beadSequence: input.beadSequence,
      charms: input.charms,
      estimatedTotal,
    },
    client
  );

  if (!updated) {
    throw new AppError("Saved design not found", 404);
  }
  return updated;
}

export async function deleteUserDesign(
  userId: string,
  id: string,
  client?: IDbClient
): Promise<{ success: boolean }> {
  assertValidEntityId(userId, "userId");
  assertValidEntityId(id, "savedDesignId");
  const repo = defaultStudioRepo;

  const existing = await repo.findSavedDesignById(id, client);
  if (!existing || existing.userId !== userId) {
    throw new AppError("Saved design not found", 404);
  }

  await repo.deleteSavedDesign(id, client);
  return { success: true };
}

// ============================================================================
// 5. DESIGN TEMPLATES
// ============================================================================

export async function getDesignTemplates(
  onlyPublished = true,
  client?: IDbClient
): Promise<IDesignTemplateRecord[]> {
  const repo = defaultStudioRepo;
  if (onlyPublished) {
    const publishedTypes = await repo.listJewelleryTypes(
      { isPublished: true, isEnabled: true, isArchived: false },
      client
    );
    const templates = await repo.findTemplates({ isPublished: true }, client);
    const publishedSlugs = new Set(publishedTypes.map((t) => t.slug.toLowerCase()));
    return templates.filter((t) => publishedSlugs.has(t.jewelleryType.toLowerCase()));
  }
  return repo.findTemplates({}, client);
}

export async function getDesignTemplateBySlug(
  slug: string,
  isAdmin = false,
  client?: IDbClient
): Promise<IDesignTemplateRecord> {
  const repo = defaultStudioRepo;
  const template = await repo.findTemplateBySlug(slug, client);
  if (!template) {
    throw new AppError("Design template not found", 404);
  }
  if (!isAdmin) {
    if (!template.isPublished) {
      throw new AppError("Design template not found", 404);
    }
    const jType = await repo.findJewelleryTypeBySlug(template.jewelleryType, client);
    if (!jType || !jType.isPublished || jType.isEnabled === false || jType.isArchived) {
      throw new AppError("Design template is currently unavailable", 404);
    }
  }
  return template;
}

async function validateAndEnrichTemplateComponents(
  jewelleryType: string,
  beadSequence: any[],
  charms: any[] = [],
  isPublished = false,
  client?: IDbClient
) {
  const repo = defaultStudioRepo;
  const jType = await repo.findJewelleryTypeBySlug(jewelleryType, client);
  if (!jType) {
    throw new AppError(`Jewellery type "${jewelleryType}" not found`, 400);
  }
  if (isPublished && (!jType.isPublished || jType.isEnabled === false || jType.isArchived === true)) {
    throw new AppError(
      `Cannot publish template: jewellery type "${jewelleryType}" is not currently published/available`,
      400
    );
  }

  if (!Array.isArray(beadSequence) || beadSequence.length === 0) {
    throw new AppError("Template bead sequence must contain at least one bead", 400);
  }

  const allBeadSkus = beadSequence.map((b) => String(b.variantSku || "").toUpperCase().trim());
  const allCharmSkus = (charms || []).map((c) => String(c.variantSku || "").toUpperCase().trim());
  const uniqueSkus = Array.from(new Set([...allBeadSkus, ...allCharmSkus].filter(Boolean)));

  if (isPublished && env.COMMERCE_MODE === "live") {
    const hasTestItems = uniqueSkus.some((sku) => sku.startsWith("TEST-"));
    if (hasTestItems) {
      throw new AppError(
        "Cannot publish template with temporary TEST- inventory while COMMERCE_MODE is live. Please replace with genuine materials before going live.",
        400
      );
    }
  }

  const materials = await repo.findMaterialsBySkus(uniqueSkus, client);

  const variantLookup = new Map<string, { material: any; variant: any }>();
  for (const m of materials) {
    for (const v of m.variants) {
      variantLookup.set(v.sku.toUpperCase(), { material: m, variant: v });
    }
  }

  const enrichedBeads = beadSequence.map((b) => {
    const sku = String(b.variantSku || "").toUpperCase().trim();
    const found = variantLookup.get(sku);
    if (!found) {
      throw new AppError(`Referenced variant SKU "${sku}" does not exist in the material library`, 400);
    }
    if (isPublished && (!found.material.isActive || !found.variant.isActive)) {
      throw new AppError(`Cannot publish template: variant SKU "${sku}" is inactive or disabled`, 400);
    }
    return {
      variantSku: sku,
      displayName: b.displayName?.trim() || found.material.name,
      imageUrl: b.imageUrl?.trim() || found.material.imageUrl || found.material.renderAssetUrl || "",
    };
  });

  const enrichedCharms = (charms || []).map((c) => {
    const sku = String(c.variantSku || "").toUpperCase().trim();
    const anchor = String(c.anchorVariantSku || "").toUpperCase().trim();
    const found = variantLookup.get(sku);
    if (!found) {
      throw new AppError(`Referenced charm SKU "${sku}" does not exist in the material library`, 400);
    }
    if (isPublished && (!found.material.isActive || !found.variant.isActive)) {
      throw new AppError(`Cannot publish template: charm SKU "${sku}" is inactive or disabled`, 400);
    }
    if (!allBeadSkus.includes(anchor)) {
      throw new AppError(`Charm anchor SKU "${anchor}" is not present in the bead sequence`, 400);
    }
    return {
      anchorVariantSku: anchor,
      variantSku: sku,
      displayName: c.displayName?.trim() || found.material.name,
      imageUrl: c.imageUrl?.trim() || found.material.imageUrl || found.material.renderAssetUrl || "",
    };
  });

  return { enrichedBeads, enrichedCharms };
}

export async function createDesignTemplate(input: any, client?: IDbClient): Promise<IDesignTemplateRecord> {
  const repo = defaultStudioRepo;
  const existing = await repo.findTemplateBySlug(input.slug, client);
  if (existing) {
    throw new AppError(`Template with slug "${input.slug}" already exists`, 409);
  }

  const { enrichedBeads, enrichedCharms } = await validateAndEnrichTemplateComponents(
    input.jewelleryType || "bracelet",
    input.beadSequence,
    input.charms,
    Boolean(input.isPublished),
    client
  );

  return repo.createTemplate(
    {
      slug: input.slug,
      name: input.name,
      description: input.description,
      thumbnailUrl: input.thumbnailUrl,
      jewelleryType: input.jewelleryType || "bracelet",
      constructionType: input.constructionType || "elastic_bead",
      wristMm: input.wristMm,
      beadSequence: enrichedBeads,
      charms: enrichedCharms,
      isPublished: input.isPublished,
      sortOrder: input.sortOrder,
    },
    client
  );
}

export async function updateDesignTemplate(
  slug: string,
  input: any,
  client?: IDbClient
): Promise<IDesignTemplateRecord> {
  const repo = defaultStudioRepo;
  const template = await repo.findTemplateBySlug(slug, client);
  if (!template) {
    throw new AppError("Design template not found", 404);
  }

  const targetJewelleryType = input.jewelleryType || template.jewelleryType;
  const targetBeads = input.beadSequence || template.beadSequence;
  const targetCharms = input.charms !== undefined ? input.charms : template.charms;
  const targetPublished = input.isPublished !== undefined ? Boolean(input.isPublished) : template.isPublished;

  const { enrichedBeads, enrichedCharms } = await validateAndEnrichTemplateComponents(
    targetJewelleryType,
    targetBeads,
    targetCharms,
    targetPublished,
    client
  );

  const updated = await repo.updateTemplate(
    slug,
    {
      name: input.name,
      description: input.description,
      thumbnailUrl: input.thumbnailUrl,
      jewelleryType: input.jewelleryType,
      constructionType: input.constructionType,
      wristMm: input.wristMm,
      beadSequence: enrichedBeads,
      charms: enrichedCharms,
      isPublished: input.isPublished,
      sortOrder: input.sortOrder,
    },
    client
  );

  if (!updated) {
    throw new AppError("Design template not found", 404);
  }
  return updated;
}

export async function deleteDesignTemplate(slug: string, client?: IDbClient): Promise<{ success: boolean }> {
  const repo = defaultStudioRepo;
  const success = await repo.deleteTemplate(slug, client);
  if (!success) {
    throw new AppError("Design template not found", 404);
  }
  return { success: true };
}

// ============================================================================
// 6. CART INTEGRATION FOR STUDIO DESIGNS
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
  },
  client?: IDbClient
) {
  assertValidEntityId(userId, "userId");
  const repo = defaultStudioRepo;

  // 1. Authoritative price calculation
  const skuCounts: Record<string, number> = {};
  for (const b of input.beadSequence || []) {
    if (b.variantSku) {
      const s = String(b.variantSku).trim().toUpperCase();
      skuCounts[s] = (skuCounts[s] || 0) + 1;
    }
  }
  for (const c of input.charms || []) {
    if (c.variantSku) {
      const s = String(c.variantSku).trim().toUpperCase();
      skuCounts[s] = (skuCounts[s] || 0) + 1;
    }
  }

  const components = Object.entries(skuCounts).map(([variantSku, quantity]) => ({
    variantSku,
    quantity,
  }));

  if (components.length === 0) {
    throw new AppError("Design has no components", 400);
  }

  const quote = await calculateDesignPrice(
    {
      jewelleryType: input.jewelleryType,
      constructionType: input.constructionType,
      components,
      selectedServiceCharges: input.selectedServiceCharges || [],
    },
    client
  );

  // 2. Validate sizing and charm limits against design rule
  const rule = await repo.findDesignRule(
    input.jewelleryType.toLowerCase(),
    input.constructionType.toLowerCase(),
    client
  );
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

  let displayImage = input.imageUrl;
  if (!displayImage) {
    const beadWithImage = (input.beadSequence || []).find((b: any) => b.imageUrl);
    displayImage = beadWithImage?.imageUrl || "/assets/images/placeholder-jewellery.png";
  }

  const studioDesignSnapshot = {
    savedDesignId: input.savedDesignId || undefined,
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
