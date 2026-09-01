import { z } from "zod";
import { PRODUCT_TYPES } from "../types/index.js";

const mediaSchema = z.object({
  url: z.string().url(),
  alt: z.string().optional(),
  type: z.enum(["image", "video"]).default("image"),
  isPrimary: z.boolean().optional(),
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
  media: z.array(mediaSchema).optional(),
  imageUrl: z.string().url().optional(),
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
