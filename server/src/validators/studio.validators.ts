import { z } from "zod";
import { STUDIO_MATERIAL_TYPES, SELLING_UNITS } from "../models/StudioMaterial.js";

const mediaUrlSchema = z.string().min(1).max(2048).refine(
  (val) => {
    const trimmed = val.trim();
    if (/^(javascript|vbscript):/i.test(trimmed)) return false;
    if (/^data:image\/svg(\+xml)?/i.test(trimmed)) return false;
    if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return true;
    if (trimmed.startsWith("/")) return true;
    if (/^data:image\/(jpeg|jpg|png|webp|gif);base64,/i.test(trimmed)) return true;
    return false;
  },
  { message: "Must be a valid web URL, relative path (/assets/...), or safe raster data:image URI" }
);

export const dimensionsSchema = z.object({
  lengthMm: z.number().min(0).optional(),
  widthMm: z.number().min(0).optional(),
  heightMm: z.number().min(0).optional(),
  diameterMm: z.number().min(0).optional(),
  holeDiameterMm: z.number().min(0).optional(),
  attachmentSizeMm: z.number().min(0).optional(),
});

export const createVariantSchema = z.object({
  sku: z.string().min(2).max(64).trim().toUpperCase(),
  color: z.string().max(80).optional(),
  finish: z.string().max(80).optional(),
  sizeLabel: z.string().min(1).max(60).trim(),
  dimensionsMm: dimensionsSchema.optional().default({}),
  sellingUnit: z.enum(SELLING_UNITS).default("piece"),
  purchaseCost: z.number().min(0).default(0),
  sellingRate: z.number().min(0),
  stock: z.number().int().min(0).default(0),
  lowStockThreshold: z.number().int().min(0).default(5),
  isActive: z.boolean().default(true),
});

export const updateVariantSchema = createVariantSchema.partial();

export const createMaterialSchema = z.object({
  name: z.string().min(1).max(150).trim(),
  code: z.string().min(2).max(64).trim().toUpperCase(),
  description: z.string().max(2000).optional(),
  materialType: z.enum(STUDIO_MATERIAL_TYPES),
  imageUrl: mediaUrlSchema,
  renderAssetUrl: mediaUrlSchema.optional(),
  additionalImages: z.array(mediaUrlSchema).optional().default([]),
  allowedJewelleryTypes: z.array(z.string().min(1)).min(1),
  isActive: z.boolean().optional().default(true),
  sortOrder: z.number().int().optional().default(0),
  variants: z.array(createVariantSchema).optional().default([]),
});

export const updateMaterialSchema = createMaterialSchema.partial();

export const updateJewelleryTypeSchema = z.object({
  displayName: z.string().min(1).max(100).optional(),
  description: z.string().max(1000).optional(),
  displayOrder: z.number().int().optional(),
  isEnabled: z.boolean().optional(),
  designerStatus: z.enum(["available", "coming_soon", "maintenance"]).optional(),
  supportedConstructionTypes: z.array(z.string().min(1)).optional(),
});

export const upsertDesignRuleSchema = z.object({
  minWristMm: z.number().min(50).max(300),
  maxWristMm: z.number().min(80).max(350),
  minComponents: z.number().int().min(1).max(200),
  maxComponents: z.number().int().min(1).max(200),
  permittedBeadSizesMm: z.array(z.number().positive()),
  allowedMaterialTypes: z.array(z.string().min(1)),
  maxCharms: z.number().int().min(0).default(5),
  fitAllowanceMm: z.number().min(0).default(10),
  requiresReviewThresholds: z
    .object({
      minComponentsForReview: z.number().int().optional(),
      maxComponentsForReview: z.number().int().optional(),
      notes: z.string().max(500).optional(),
    })
    .optional(),
  isActive: z.boolean().optional().default(true),
});

export const upsertMakingChargeSchema = z.object({
  baseFee: z.number().min(0),
  serviceCharges: z
    .array(
      z.object({
        name: z.string().min(1).max(100).trim(),
        fee: z.number().min(0),
        isOptional: z.boolean().default(true),
        description: z.string().max(500).optional(),
      })
    )
    .optional()
    .default([]),
  isActive: z.boolean().optional().default(true),
});

export const priceQuoteSchema = z.object({
  jewelleryType: z.string().min(1).trim(),
  constructionType: z.string().min(1).trim(),
  components: z
    .array(
      z.object({
        variantSku: z.string().min(1).trim().toUpperCase(),
        quantity: z.number().int().positive(),
      })
    )
    .min(1),
  selectedServiceCharges: z.array(z.string().trim()).optional().default([]),
});

export const materialQuerySchema = z.object({
  jewelleryType: z.string().optional(),
  materialType: z.enum(STUDIO_MATERIAL_TYPES).optional(),
  isActive: z.enum(["true", "false"]).optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(50),
});

// ============================================================================
// Milestone 3: Saved Designs, Templates & Cart Schemas
// ============================================================================

export const savedDesignBeadSchema = z.object({
  materialId: z.string().min(1),
  variantSku: z.string().min(1).trim().toUpperCase(),
  displayName: z.string().min(1),
  diameterMm: z.number().min(0).default(0),
  imageUrl: z.string().default(""),
});

export const savedDesignCharmSchema = z.object({
  instanceId: z.string().min(1),
  anchorInstanceId: z.string().min(1),
  materialId: z.string().min(1),
  variantSku: z.string().min(1).trim().toUpperCase(),
  displayName: z.string().min(1),
  imageUrl: z.string().default(""),
});

export const saveDesignSchema = z.object({
  name: z.string().min(1).max(80).trim(),
  jewelleryType: z.string().min(1).default("bracelet"),
  constructionType: z.string().min(1).default("elastic_bead"),
  wristMm: z.number().min(0).max(500).optional().default(160),
  beadSequence: z.array(savedDesignBeadSchema).min(1),
  charms: z.array(savedDesignCharmSchema).optional().default([]),
  estimatedTotal: z.number().min(0).optional().default(0),
});

export const updateSavedDesignSchema = z.object({
  name: z.string().min(1).max(80).trim().optional(),
  wristMm: z.number().min(0).max(500).optional(),
  beadSequence: z.array(savedDesignBeadSchema).min(1).optional(),
  charms: z.array(savedDesignCharmSchema).optional(),
  estimatedTotal: z.number().min(0).optional(),
});

export const templateBeadSchema = z.object({
  variantSku: z.string().min(1).trim().toUpperCase(),
  displayName: z.string().min(1),
  imageUrl: z.string().default(""),
});

export const templateCharmSchema = z.object({
  anchorVariantSku: z.string().min(1).trim().toUpperCase(),
  variantSku: z.string().min(1).trim().toUpperCase(),
  displayName: z.string().min(1),
  imageUrl: z.string().default(""),
});

export const createDesignTemplateSchema = z.object({
  slug: z.string().min(2).max(64).trim().toLowerCase(),
  name: z.string().min(1).max(100).trim(),
  description: z.string().max(1000).optional(),
  thumbnailUrl: z.string().max(2048).optional(),
  jewelleryType: z.string().min(1).default("bracelet"),
  constructionType: z.string().min(1).default("elastic_bead"),
  wristMm: z.number().min(0).max(500).default(160),
  beadSequence: z.array(templateBeadSchema).min(1),
  charms: z.array(templateCharmSchema).optional().default([]),
  isPublished: z.boolean().optional().default(false),
  sortOrder: z.number().int().optional().default(0),
});

export const updateDesignTemplateSchema = createDesignTemplateSchema.partial();

export const addStudioDesignToCartSchema = z.object({
  savedDesignId: z.string().optional(),
  name: z.string().min(1).max(100).trim(),
  jewelleryType: z.string().min(1).default("bracelet"),
  constructionType: z.string().min(1).default("elastic_bead"),
  wristMm: z.number().min(0).max(500).optional().default(160),
  quantity: z.number().int().positive().optional().default(1),
  imageUrl: z.string().optional(),
  beadSequence: z.array(savedDesignBeadSchema).min(1),
  charms: z.array(savedDesignCharmSchema).optional().default([]),
  selectedServiceCharges: z.array(z.string().trim()).optional().default([]),
});

export const aiDesignPromptSchema = z.object({
  prompt: z.string().min(2).max(1000).trim(),
  jewelleryType: z.string().optional().default("bracelet"),
  occasion: z.string().max(100).optional(),
  colorTheme: z.string().max(100).optional(),
  budget: z.number().min(100).max(50000).optional(),
  style: z.string().max(100).optional(),
  wristMm: z.number().min(0).max(500).optional(),
});


