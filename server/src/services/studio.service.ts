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

export async function initStudioDefaults(): Promise<void> {
  try {
    // A. Default Jewellery Types
    const defaultTypes = [
      {
        slug: "bracelet",
        displayName: "Bracelets",
        description: "Design bespoke handcrafted elastic bead and custom gemstone bracelets.",
        displayOrder: 1,
        isEnabled: true,
        designerStatus: "available" as const,
        supportedConstructionTypes: ["elastic_bead"],
      },
      {
        slug: "earrings",
        displayName: "Kundan Stone Earrings",
        description: "Bespoke Kundan stud and drop earrings with customizable stone shapes, colors, and hooks.",
        displayOrder: 2,
        isEnabled: true,
        designerStatus: "coming_soon" as const,
        supportedConstructionTypes: ["drop_stud", "kundan_earring"],
      },
      {
        slug: "bangles",
        displayName: "Kundan Stone Bangles",
        description: "Personalized Kundan stone bangles with calibrated sizing (2.4, 2.6, 2.8) and stone arrangements.",
        displayOrder: 3,
        isEnabled: true,
        designerStatus: "coming_soon" as const,
        supportedConstructionTypes: ["rigid_bangle", "kundan_bangle"],
      },
      {
        slug: "chain_necklace",
        displayName: "Custom Chains & Necklaces",
        description: "Custom chains and statement necklaces with artisanal pendants, charms, and accents.",
        displayOrder: 4,
        isEnabled: true,
        designerStatus: "coming_soon" as const,
        supportedConstructionTypes: ["chain_pendant"],
      },
    ];

    for (const typeData of defaultTypes) {
      await JewelleryType.findOneAndUpdate(
        { slug: typeData.slug },
        {
          $setOnInsert: { slug: typeData.slug, displayOrder: typeData.displayOrder, isEnabled: typeData.isEnabled },
          $set: {
            displayName: typeData.displayName,
            description: typeData.description,
            supportedConstructionTypes: typeData.supportedConstructionTypes,
          },
        },
        { upsert: true, new: true }
      );
    }

    // B. Default Elastic Bead Bracelet Design Rule
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

    // C. Default Making Charge for Elastic Bead Bracelet
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
    // D. Seed Core Handcrafted Studio Materials if collection is empty
    const materialCount = await StudioMaterial.countDocuments();
    if (materialCount === 0) {
      const defaultMaterials = [
        {
          name: "Natural Rose Quartz",
          code: "MAT-ROSE-QUARTZ",
          description: "Gentle blush pink natural rose quartz beads, celebrated as the stone of unconditional love and heart harmony.",
          materialType: "stone",
          imageUrl: "/logo.png",
          allowedJewelleryTypes: ["bracelet"],
          isActive: true,
          sortOrder: 1,
          variants: [
            {
              sku: "BEAD-RQ-8MM",
              color: "Pink",
              finish: "Polished",
              sizeLabel: "8mm Round",
              dimensionsMm: { diameterMm: 8, holeDiameterMm: 1 },
              sellingUnit: "piece",
              purchaseCost: 20,
              sellingRate: 45,
              stock: 500,
              lowStockThreshold: 20,
              isActive: true,
            },
            {
              sku: "BEAD-RQ-6MM",
              color: "Pink",
              finish: "Polished",
              sizeLabel: "6mm Round",
              dimensionsMm: { diameterMm: 6, holeDiameterMm: 1 },
              sellingUnit: "piece",
              purchaseCost: 15,
              sellingRate: 35,
              stock: 500,
              lowStockThreshold: 20,
              isActive: true,
            },
          ],
        },
        {
          name: "Grade-A Amethyst",
          code: "MAT-AMETHYST",
          description: "Deep regal purple natural amethyst beads, known for tranquility, intuition, and spiritual balance.",
          materialType: "stone",
          imageUrl: "/logo.png",
          allowedJewelleryTypes: ["bracelet"],
          isActive: true,
          sortOrder: 2,
          variants: [
            {
              sku: "BEAD-AME-8MM",
              color: "Purple",
              finish: "Polished",
              sizeLabel: "8mm Round",
              dimensionsMm: { diameterMm: 8, holeDiameterMm: 1 },
              sellingUnit: "piece",
              purchaseCost: 25,
              sellingRate: 55,
              stock: 450,
              lowStockThreshold: 20,
              isActive: true,
            },
          ],
        },
        {
          name: "Matte Black Onyx",
          code: "MAT-BLACK-ONYX",
          description: "Velvety smooth matte black onyx beads providing sleek grounding energy and timeless modern style.",
          materialType: "stone",
          imageUrl: "/logo.png",
          allowedJewelleryTypes: ["bracelet"],
          isActive: true,
          sortOrder: 3,
          variants: [
            {
              sku: "BEAD-ONYX-8MM",
              color: "Black",
              finish: "Matte",
              sizeLabel: "8mm Round",
              dimensionsMm: { diameterMm: 8, holeDiameterMm: 1 },
              sellingUnit: "piece",
              purchaseCost: 18,
              sellingRate: 40,
              stock: 600,
              lowStockThreshold: 20,
              isActive: true,
            },
          ],
        },
        {
          name: "Golden Tiger Eye",
          code: "MAT-TIGER-EYE",
          description: "Rich chatoyant golden-brown tiger eye beads, inspiring courage, vitality, and focused confidence.",
          materialType: "stone",
          imageUrl: "/logo.png",
          allowedJewelleryTypes: ["bracelet"],
          isActive: true,
          sortOrder: 4,
          variants: [
            {
              sku: "BEAD-TIG-8MM",
              color: "Brown",
              finish: "Chatoyant",
              sizeLabel: "8mm Round",
              dimensionsMm: { diameterMm: 8, holeDiameterMm: 1 },
              sellingUnit: "piece",
              purchaseCost: 22,
              sellingRate: 50,
              stock: 400,
              lowStockThreshold: 20,
              isActive: true,
            },
          ],
        },
        {
          name: "Natural Turquoise",
          code: "MAT-TURQUOISE",
          description: "Striking ocean-cyan natural turquoise beads with organic copper veining, representing wisdom and serenity.",
          materialType: "stone",
          imageUrl: "/logo.png",
          allowedJewelleryTypes: ["bracelet"],
          isActive: true,
          sortOrder: 5,
          variants: [
            {
              sku: "BEAD-TRQ-8MM",
              color: "Blue",
              finish: "Smooth",
              sizeLabel: "8mm Round",
              dimensionsMm: { diameterMm: 8, holeDiameterMm: 1 },
              sellingUnit: "piece",
              purchaseCost: 30,
              sellingRate: 65,
              stock: 350,
              lowStockThreshold: 20,
              isActive: true,
            },
          ],
        },
        {
          name: "Freshwater Pearl",
          code: "MAT-PEARL",
          description: "Luminous white freshwater baroque pearl beads offering refined artisanal elegance and classic charm.",
          materialType: "bead",
          imageUrl: "/logo.png",
          allowedJewelleryTypes: ["bracelet"],
          isActive: true,
          sortOrder: 6,
          variants: [
            {
              sku: "BEAD-PRL-8MM",
              color: "White",
              finish: "Luster",
              sizeLabel: "8mm Round",
              dimensionsMm: { diameterMm: 8, holeDiameterMm: 1 },
              sellingUnit: "piece",
              purchaseCost: 35,
              sellingRate: 75,
              stock: 300,
              lowStockThreshold: 15,
              isActive: true,
            },
          ],
        },
        {
          name: "Volcanic Lava Stone",
          code: "MAT-LAVA",
          description: "Porous tactile charcoal-black volcanic basalt stone beads, naturally receptive to essential oils.",
          materialType: "stone",
          imageUrl: "/logo.png",
          allowedJewelleryTypes: ["bracelet"],
          isActive: true,
          sortOrder: 7,
          variants: [
            {
              sku: "BEAD-LAV-8MM",
              color: "Black",
              finish: "Porous",
              sizeLabel: "8mm Round",
              dimensionsMm: { diameterMm: 8, holeDiameterMm: 1 },
              sellingUnit: "piece",
              purchaseCost: 15,
              sellingRate: 35,
              stock: 500,
              lowStockThreshold: 20,
              isActive: true,
            },
          ],
        },
        {
          name: "Clear Crystal Quartz",
          code: "MAT-CLEAR-QUARTZ",
          description: "Faceted transparent natural rock crystal quartz beads reflecting light with pure crystalline sparkle.",
          materialType: "stone",
          imageUrl: "/logo.png",
          allowedJewelleryTypes: ["bracelet"],
          isActive: true,
          sortOrder: 8,
          variants: [
            {
              sku: "BEAD-CQ-8MM",
              color: "Clear",
              finish: "Faceted",
              sizeLabel: "8mm Faceted",
              dimensionsMm: { diameterMm: 8, holeDiameterMm: 1 },
              sellingUnit: "piece",
              purchaseCost: 20,
              sellingRate: 48,
              stock: 400,
              lowStockThreshold: 20,
              isActive: true,
            },
          ],
        },
        {
          name: "Sterling Silver Spacer Rondelle",
          code: "MAT-SPACER-SILVER",
          description: "Artisanal sterling silver-plated ribbed rondelle spacer beads for rhythm and textural accents.",
          materialType: "spacer",
          imageUrl: "/logo.png",
          allowedJewelleryTypes: ["bracelet"],
          isActive: true,
          sortOrder: 9,
          variants: [
            {
              sku: "SPC-SLV-4MM",
              color: "Silver",
              finish: "Polished",
              sizeLabel: "4mm Rondelle",
              dimensionsMm: { diameterMm: 4, holeDiameterMm: 1 },
              sellingUnit: "piece",
              purchaseCost: 12,
              sellingRate: 28,
              stock: 800,
              lowStockThreshold: 50,
              isActive: true,
            },
          ],
        },
        {
          name: "Celestial Star Charm",
          code: "MAT-CHARM-STAR",
          description: "Delicately cast five-point celestial star drop charm in bright sterling silver finish.",
          materialType: "charm",
          imageUrl: "/logo.png",
          allowedJewelleryTypes: ["bracelet"],
          isActive: true,
          sortOrder: 10,
          variants: [
            {
              sku: "CHM-STAR-SLV",
              color: "Silver",
              finish: "Bright Silver",
              sizeLabel: "12mm Drop",
              dimensionsMm: { lengthMm: 12, widthMm: 10, attachmentSizeMm: 4 },
              sellingUnit: "piece",
              purchaseCost: 65,
              sellingRate: 150,
              stock: 150,
              lowStockThreshold: 10,
              isActive: true,
            },
          ],
        },
        {
          name: "Sacred Lotus Charm",
          code: "MAT-CHARM-LOTUS",
          description: "Intricately detailed blooming lotus flower charm in polished warm gold brass finish.",
          materialType: "charm",
          imageUrl: "/logo.png",
          allowedJewelleryTypes: ["bracelet"],
          isActive: true,
          sortOrder: 11,
          variants: [
            {
              sku: "CHM-LOTUS-GLD",
              color: "Gold",
              finish: "Warm Gold",
              sizeLabel: "14mm Drop",
              dimensionsMm: { lengthMm: 14, widthMm: 12, attachmentSizeMm: 4 },
              sellingUnit: "piece",
              purchaseCost: 75,
              sellingRate: 175,
              stock: 120,
              lowStockThreshold: 10,
              isActive: true,
            },
          ],
        },
      ];

      for (const matData of defaultMaterials) {
        await StudioMaterial.findOneAndUpdate(
          { code: matData.code },
          { $setOnInsert: matData },
          { upsert: true, new: true }
        );
      }
    }

    // E. Seed Starter Design Templates if collection is empty
    const templateCount = await DesignTemplate.countDocuments();
    if (templateCount === 0) {
      const defaultTemplates = [
        {
          slug: "celestial-harmony",
          name: "Celestial Harmony",
          description: "Romantic rose quartz and freshwater pearls paired with silver spacers and a celestial star charm.",
          wristMm: 160,
          isPublished: true,
          sortOrder: 1,
          beadSequence: [
            { variantSku: "BEAD-RQ-8MM", displayName: "Natural Rose Quartz · 8mm", imageUrl: "/logo.png" },
            { variantSku: "BEAD-PRL-8MM", displayName: "Freshwater Pearl · 8mm", imageUrl: "/logo.png" },
            { variantSku: "SPC-SLV-4MM", displayName: "Sterling Silver Spacer · 4mm", imageUrl: "/logo.png" },
            { variantSku: "BEAD-RQ-8MM", displayName: "Natural Rose Quartz · 8mm", imageUrl: "/logo.png" },
            { variantSku: "BEAD-PRL-8MM", displayName: "Freshwater Pearl · 8mm", imageUrl: "/logo.png" },
            { variantSku: "BEAD-RQ-8MM", displayName: "Natural Rose Quartz · 8mm", imageUrl: "/logo.png" },
            { variantSku: "BEAD-PRL-8MM", displayName: "Freshwater Pearl · 8mm", imageUrl: "/logo.png" },
            { variantSku: "SPC-SLV-4MM", displayName: "Sterling Silver Spacer · 4mm", imageUrl: "/logo.png" },
            { variantSku: "BEAD-RQ-8MM", displayName: "Natural Rose Quartz · 8mm", imageUrl: "/logo.png" },
            { variantSku: "BEAD-PRL-8MM", displayName: "Freshwater Pearl · 8mm", imageUrl: "/logo.png" },
            { variantSku: "BEAD-RQ-8MM", displayName: "Natural Rose Quartz · 8mm", imageUrl: "/logo.png" },
            { variantSku: "BEAD-PRL-8MM", displayName: "Freshwater Pearl · 8mm", imageUrl: "/logo.png" },
            { variantSku: "SPC-SLV-4MM", displayName: "Sterling Silver Spacer · 4mm", imageUrl: "/logo.png" },
            { variantSku: "BEAD-RQ-8MM", displayName: "Natural Rose Quartz · 8mm", imageUrl: "/logo.png" },
            { variantSku: "BEAD-PRL-8MM", displayName: "Freshwater Pearl · 8mm", imageUrl: "/logo.png" },
            { variantSku: "BEAD-RQ-8MM", displayName: "Natural Rose Quartz · 8mm", imageUrl: "/logo.png" },
            { variantSku: "BEAD-PRL-8MM", displayName: "Freshwater Pearl · 8mm", imageUrl: "/logo.png" },
            { variantSku: "SPC-SLV-4MM", displayName: "Sterling Silver Spacer · 4mm", imageUrl: "/logo.png" },
            { variantSku: "BEAD-RQ-8MM", displayName: "Natural Rose Quartz · 8mm", imageUrl: "/logo.png" },
            { variantSku: "BEAD-PRL-8MM", displayName: "Freshwater Pearl · 8mm", imageUrl: "/logo.png" },
          ],
          charms: [
            { anchorVariantSku: "BEAD-RQ-8MM", variantSku: "CHM-STAR-SLV", displayName: "Celestial Star Charm", imageUrl: "/logo.png" },
          ],
        },
        {
          slug: "earthy-focus",
          name: "Earthy Focus & Strength",
          description: "Grounding matte black onyx and golden tiger eye beads for vitality, clarity, and daily confidence.",
          wristMm: 160,
          isPublished: true,
          sortOrder: 2,
          beadSequence: [
            { variantSku: "BEAD-ONYX-8MM", displayName: "Matte Black Onyx · 8mm", imageUrl: "/logo.png" },
            { variantSku: "BEAD-TIG-8MM", displayName: "Golden Tiger Eye · 8mm", imageUrl: "/logo.png" },
            { variantSku: "BEAD-ONYX-8MM", displayName: "Matte Black Onyx · 8mm", imageUrl: "/logo.png" },
            { variantSku: "BEAD-TIG-8MM", displayName: "Golden Tiger Eye · 8mm", imageUrl: "/logo.png" },
            { variantSku: "BEAD-ONYX-8MM", displayName: "Matte Black Onyx · 8mm", imageUrl: "/logo.png" },
            { variantSku: "BEAD-TIG-8MM", displayName: "Golden Tiger Eye · 8mm", imageUrl: "/logo.png" },
            { variantSku: "BEAD-ONYX-8MM", displayName: "Matte Black Onyx · 8mm", imageUrl: "/logo.png" },
            { variantSku: "BEAD-TIG-8MM", displayName: "Golden Tiger Eye · 8mm", imageUrl: "/logo.png" },
            { variantSku: "BEAD-ONYX-8MM", displayName: "Matte Black Onyx · 8mm", imageUrl: "/logo.png" },
            { variantSku: "BEAD-TIG-8MM", displayName: "Golden Tiger Eye · 8mm", imageUrl: "/logo.png" },
            { variantSku: "BEAD-ONYX-8MM", displayName: "Matte Black Onyx · 8mm", imageUrl: "/logo.png" },
            { variantSku: "BEAD-TIG-8MM", displayName: "Golden Tiger Eye · 8mm", imageUrl: "/logo.png" },
            { variantSku: "BEAD-ONYX-8MM", displayName: "Matte Black Onyx · 8mm", imageUrl: "/logo.png" },
            { variantSku: "BEAD-TIG-8MM", displayName: "Golden Tiger Eye · 8mm", imageUrl: "/logo.png" },
            { variantSku: "BEAD-ONYX-8MM", displayName: "Matte Black Onyx · 8mm", imageUrl: "/logo.png" },
            { variantSku: "BEAD-TIG-8MM", displayName: "Golden Tiger Eye · 8mm", imageUrl: "/logo.png" },
            { variantSku: "BEAD-ONYX-8MM", displayName: "Matte Black Onyx · 8mm", imageUrl: "/logo.png" },
            { variantSku: "BEAD-TIG-8MM", displayName: "Golden Tiger Eye · 8mm", imageUrl: "/logo.png" },
            { variantSku: "BEAD-ONYX-8MM", displayName: "Matte Black Onyx · 8mm", imageUrl: "/logo.png" },
            { variantSku: "BEAD-TIG-8MM", displayName: "Golden Tiger Eye · 8mm", imageUrl: "/logo.png" },
            { variantSku: "BEAD-ONYX-8MM", displayName: "Matte Black Onyx · 8mm", imageUrl: "/logo.png" },
          ],
          charms: [],
        },
      ];

      for (const t of defaultTemplates) {
        await DesignTemplate.findOneAndUpdate(
          { slug: t.slug },
          { $setOnInsert: t },
          { upsert: true, new: true }
        );
      }
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
  designerStatus: "available" | "coming_soon" | "maintenance";
  supportedConstructionTypes: string[];
  eligibleMaterialCount: number;
  hasDesignRule: boolean;
  hasMakingCharge: boolean;
  templateCount: number;
  isFullyReady: boolean;
  gapAnalysis: {
    materialsStatus: "stocked" | "lacking_catalogue_components";
    materialsDetail: string;
    rulesStatus: "active" | "missing_construction_rule";
    pricingStatus: "active" | "missing_craftsmanship_fee";
    summary: string;
  };
}

export async function getStudioReadinessReport(): Promise<JewelleryTypeReadiness[]> {
  const types = await JewelleryType.find({ isEnabled: true }).sort({ displayOrder: 1 }).lean();
  const report: JewelleryTypeReadiness[] = [];

  for (const t of types) {
    const eligibleCount = await StudioMaterial.countDocuments({
      isActive: true,
      allowedJewelleryTypes: t.slug,
    });

    const primaryConstruction = t.supportedConstructionTypes[0] || "";

    const [rule, makingCharge, templateCount] = await Promise.all([
      primaryConstruction
        ? DesignRule.findOne({ jewelleryType: t.slug, constructionType: primaryConstruction, isActive: true }).lean()
        : null,
      primaryConstruction
        ? MakingCharge.findOne({ jewelleryType: t.slug, constructionType: primaryConstruction, isActive: true }).lean()
        : null,
      DesignTemplate.countDocuments({ jewelleryType: t.slug, isPublished: true }),
    ]);

    const hasDesignRule = Boolean(rule);
    const hasMakingCharge = Boolean(makingCharge);
    const isFullyReady = eligibleCount > 0 && hasDesignRule && hasMakingCharge && t.designerStatus === "available";

    let materialsDetail = "";
    let summary = "";

    if (t.slug === "bracelet") {
      materialsDetail = `${eligibleCount} active gemstone beads, spacers, and charms configured.`;
      summary = isFullyReady
        ? "Interactive 2D Elastic Bead Bracelet Designer is live and fully calibrated."
        : "Bracelet studio components available.";
    } else if (t.slug === "earrings") {
      materialsDetail =
        eligibleCount > 0
          ? `${eligibleCount} eligible materials linked.`
          : "Lacking Kundan setting collets, stone cabochons, and earring hook findings in the catalogue.";
      summary =
        "Kundan stone earrings require dedicated collet settings and hook findings in the catalogue before interactive designing can be enabled.";
    } else if (t.slug === "bangles") {
      materialsDetail =
        eligibleCount > 0
          ? `${eligibleCount} eligible materials linked.`
          : "Lacking rigid bangle metal frames and Kundan stone inlays in the catalogue.";
      summary =
        "Kundan stone bangles require rigid circular frames (2.4/2.6/2.8) and inlay stone materials in the catalogue before interactive designing can be enabled.";
    } else if (t.slug === "chain_necklace") {
      materialsDetail =
        eligibleCount > 0
          ? `${eligibleCount} eligible materials linked.`
          : "Lacking spooled chain links and clasp findings in the catalogue.";
      summary =
        "Custom chains require spooled link materials and clasp findings in the catalogue before interactive assembling can be enabled.";
    } else {
      materialsDetail = `${eligibleCount} eligible materials configured.`;
      summary = "Jewellery type under technical development.";
    }

    report.push({
      slug: t.slug,
      displayName: t.displayName,
      description: t.description,
      designerStatus: t.designerStatus,
      supportedConstructionTypes: t.supportedConstructionTypes,
      eligibleMaterialCount: eligibleCount,
      hasDesignRule,
      hasMakingCharge,
      templateCount,
      isFullyReady,
      gapAnalysis: {
        materialsStatus: eligibleCount > 0 ? "stocked" : "lacking_catalogue_components",
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
      inStock: v.stock > 0,
      stock: v.stock,
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

  // 1. Verify Jewellery Type exists and is active
  const jType = await JewelleryType.findOne({ slug: jewelleryType, isEnabled: true });
  if (!jType) {
    throw new AppError(`Jewellery type "${jewelleryType}" is not supported or active`, 400);
  }

  if (!jType.supportedConstructionTypes.includes(constructionType)) {
    throw new AppError(
      `Construction type "${constructionType}" is not supported for ${jType.displayName}`,
      400
    );
  }

  // 2. Validate component selection array
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

  // 3. Retrieve authoritative variant and material data
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

    const variant = mat.variants.find((v) => v.sku === sku);
    if (!variant || !variant.isActive) {
      throw new AppError(`Variant "${sku}" is inactive or unavailable`, 400);
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

  componentSubtotal = Math.round(componentSubtotal * 100) / 100;

  // 4. Retrieve making charges
  const makingChargeConfig = await MakingCharge.findOne({
    jewelleryType,
    constructionType,
    isActive: true,
  });

  const baseFee = makingChargeConfig ? Number(makingChargeConfig.baseFee) : 0;
  const activeServiceCharges = makingChargeConfig?.serviceCharges || [];

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
  const query = onlyPublished ? { isPublished: true } : {};
  return DesignTemplate.find(query).sort({ sortOrder: 1, createdAt: -1 }).lean();
}

export async function getDesignTemplateBySlug(slug: string) {
  const template = await DesignTemplate.findOne({ slug: slug.toLowerCase() }).lean();
  if (!template) {
    throw new AppError("Design template not found", 404);
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

