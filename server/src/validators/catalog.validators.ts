import { z } from "zod";
import { PRODUCT_TYPES } from "../types/index.js";

const mediaUrlSchema = z.string().min(1).max(2 * 1024 * 1024, "Media URL exceeds maximum length").refine(
  (val) => {
    const trimmed = val.trim();
    // Disallow dangerous URI schemes like javascript:, vbscript:, etc.
    if (/^(javascript|vbscript):/i.test(trimmed)) return false;
    // Explicitly reject SVG data URLs due to script injection risks
    if (/^data:image\/svg(\+xml)?/i.test(trimmed)) return false;
    // Allow standard web URLs
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return true;
    // Allow safe relative paths
    if (trimmed.startsWith('/')) return true;
    // Allow only safe raster image data URLs (jpeg, png, webp, gif)
    if (/^data:image\/(jpeg|jpg|png|webp|gif);base64,/i.test(trimmed)) return true;

    return false;
  },
  { message: "Must be a valid web URL, relative path (/assets/...), or safe raster data:image URI (jpeg, png, webp, gif)" }
);

const mediaSchema = z.object({
  url: mediaUrlSchema,
  alt: z.string().optional(),
  type: z.enum(["image", "video"]).default("image"),
  isPrimary: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

const customizationOptionSchema = z.object({
  value: z.string(),
  label: z.string(),
  priceModifier: z.number().optional().default(0),
  imageUrl: z.string().optional(),
});

const customizationFieldValidationSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  type: z.enum(["select", "multiselect", "color", "text", "number"]),
  options: z.array(customizationOptionSchema).optional(),
  required: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

export const createCategorySchema = z.object({
  name: z.string().min(1).max(120),
  slug: z.string().min(1).max(120).optional(),
  description: z.string().max(2000).optional(),
  parentId: z.string().optional().nullable(),
  productType: z.enum(PRODUCT_TYPES),
  imageUrl: z.string().url().optional(),
  isActive: z.boolean().optional(),
  showInMenu: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  seoTitle: z.string().max(160).optional(),
  seoDescription: z.string().max(320).optional(),
  customizationFields: z.array(customizationFieldValidationSchema).optional(),
});

export const updateCategorySchema = createCategorySchema.partial();

export const categoryQuerySchema = z.object({
  active: z.enum(["true", "false"]).optional(),
  menu: z.enum(["true", "false"]).optional(),
  productType: z.enum(PRODUCT_TYPES).optional(),
  parentId: z.string().optional(),
});

export const createProductSchema = z.object({
  name: z.string().min(1).max(200),
  slug: z.string().min(1).max(200).optional(),
  description: z.string().min(1),
  shortDescription: z.string().max(500).optional(),
  categoryId: z.string().min(1),
  subcategoryId: z.string().optional().nullable(),
  price: z.number().min(0),
  salePrice: z.number().min(0).nullable().optional(),
  sku: z.string().min(1).max(64).optional(),
  stock: z.number().int().min(0).optional(),
  lowStockThreshold: z.number().int().min(0).optional(),
  weightGrams: z.number().min(0).optional(),
  materialInfo: z.string().optional(),
  careInstructions: z.string().optional(),
  additionalInfo: z.string().optional().nullable(),
  media: z.array(mediaSchema).optional(),
  imageUrl: mediaUrlSchema.optional(),
  colors: z.array(z.string()).optional(),
  materials: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  badge: z.string().optional(),
  isSignaturePiece: z.boolean().optional(),
  signatureCategory: z.enum(["fashion", "trending", "latest", "none"]).optional(),
  isActive: z.boolean().optional(),
  isCustomizable: z.boolean().optional(),
});

export const updateProductSchema = createProductSchema.partial();

export const productQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().optional(),
  categoryId: z.string().optional(),
  subcategoryId: z.string().optional(),
  minPrice: z.coerce.number().min(0).optional(),
  maxPrice: z.coerce.number().min(0).optional(),
  material: z.string().optional(),
  color: z.string().optional(),
  minRating: z.coerce.number().min(0).max(5).optional(),
  inStock: z.enum(["true", "false"]).optional(),
  isSignaturePiece: z.enum(["true", "false"]).optional(),
  isActive: z.enum(["true", "false", "all"]).optional(),
  sort: z.enum(["price_asc", "price_desc", "newest", "rating", "name"]).optional(),
});

export const idParamSchema = z.object({
  id: z.string().min(1),
});

export const slugParamSchema = z.object({
  slug: z.string().min(1),
});
