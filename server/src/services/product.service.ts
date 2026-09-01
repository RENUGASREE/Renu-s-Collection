import { FilterQuery, Types, FlattenMaps } from "mongoose";
import { Product, IProduct } from "../models/Product.js";
import { Category } from "../models/Category.js";
import { AppError } from "../middleware/errorHandler.js";
import { paginate, toSlug, generateSku } from "../utils/helpers.js";
import { adjustStock as inventoryAdjustStock } from "./inventory.service.js";
import type { z } from "zod";
import type { createProductSchema, updateProductSchema, productQuerySchema } from "../validators/catalog.validators.js";
import type { PaginationMeta } from "../types/index.js";
import type { InventoryAction } from "../types/index.js";

type CreateProductInput = z.infer<typeof createProductSchema>;
type UpdateProductInput = z.infer<typeof updateProductSchema>;
type ProductQuery = z.infer<typeof productQuerySchema>;
type ProductLean = FlattenMaps<IProduct> & { _id: Types.ObjectId; isInStock: boolean; effectivePrice: number };

function buildProductFilter(query: ProductQuery): FilterQuery<IProduct> {
  const filter: FilterQuery<IProduct> = { isActive: true };

  if (query.categoryId) filter.categoryId = new Types.ObjectId(query.categoryId);
  if (query.subcategoryId) filter.subcategoryId = new Types.ObjectId(query.subcategoryId);
  if (query.minPrice !== undefined || query.maxPrice !== undefined) {
    filter.price = {};
    if (query.minPrice !== undefined) filter.price.$gte = query.minPrice;
    if (query.maxPrice !== undefined) filter.price.$lte = query.maxPrice;
  }
  if (query.material) filter.materials = query.material;
  if (query.color) filter.colors = query.color;
  if (query.minRating !== undefined) filter.averageRating = { $gte: query.minRating };
  if (query.inStock === "true") filter.stock = { $gt: 0 };
  if (query.inStock === "false") filter.stock = 0;
  if (query.isSignaturePiece === "true") filter.isSignaturePiece = true;
  if (query.isSignaturePiece === "false") filter.isSignaturePiece = false;

  if (query.q) {
    filter.$text = { $search: query.q };
  }

  return filter;
}

function buildSort(query: ProductQuery): Record<string, 1 | -1> {
  switch (query.sort) {
    case "price_asc":
      return { price: 1 };
    case "price_desc":
      return { price: -1 };
    case "rating":
      return { averageRating: -1 };
    case "name":
      return { name: 1 };
    case "newest":
    default:
      return { createdAt: -1 };
  }
}

export async function listProducts(query: ProductQuery): Promise<{ items: ProductLean[]; meta: PaginationMeta }> {
  const { page, limit, skip } = paginate(query.page, query.limit);
  const filter = buildProductFilter(query);
  const sort = buildSort(query);

  const [items, total] = await Promise.all([
    Product.find(filter).sort(sort).skip(skip).limit(limit).lean(),
    Product.countDocuments(filter),
  ]);

  // Add virtual fields to lean documents
  const itemsWithVirtuals = items.map(item => ({
    ...item,
    isInStock: (item.stock as number) > 0,
    effectivePrice: item.salePrice != null && item.salePrice < item.price ? item.salePrice : item.price,
  }));

  return {
    items: itemsWithVirtuals,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    },
  };
}

export async function searchProducts(
  q: string,
  query: Omit<ProductQuery, "q">
): Promise<{ items: ProductLean[]; meta: PaginationMeta }> {
  return listProducts({ ...query, q });
}

export async function getProductById(id: string): Promise<ProductLean> {
  if (!Types.ObjectId.isValid(id)) throw new AppError("Invalid product id", 400);
  const product = await Product.findById(id).lean();
  if (!product) throw new AppError("Product not found", 404);
  // Add virtual fields to lean document
  return {
    ...product,
    isInStock: (product.stock as number) > 0,
    effectivePrice: product.salePrice != null && product.salePrice < product.price ? product.salePrice : product.price,
  };
}

export async function getProductBySlug(slug: string): Promise<ProductLean> {
  const product = await Product.findOne({ slug: slug.toLowerCase(), isActive: true }).lean();
  if (!product) throw new AppError("Product not found", 404);
  // Add virtual fields to lean document
  return {
    ...product,
    isInStock: (product.stock as number) > 0,
    effectivePrice: product.salePrice != null && product.salePrice < product.price ? product.salePrice : product.price,
  };
}

export async function createProduct(input: CreateProductInput): Promise<ProductLean> {
  const category = await Category.findById(input.categoryId);
  if (!category) throw new AppError("Category not found", 400);

  if (input.subcategoryId) {
    const sub = await Category.findById(input.subcategoryId);
    if (!sub) throw new AppError("Subcategory not found", 400);
  }

  const slug = input.slug ? toSlug(input.slug) : toSlug(input.name);
  const sku = input.sku?.toUpperCase() ?? generateSku(category.productType.slice(0, 3).toUpperCase());

  const existingSlug = await Product.findOne({ slug });
  if (existingSlug) throw new AppError("Product slug already exists", 409);

  const existingSku = await Product.findOne({ sku });
  if (existingSku) throw new AppError("SKU already exists", 409);

  // Convert imageUrl to media array if provided
  const media = input.imageUrl
    ? [{ url: input.imageUrl, type: "image" as const, isPrimary: true, sortOrder: 0 }]
    : input.media || [];

  const product = await Product.create({
    ...input,
    slug,
    sku,
    media,
    categoryId: new Types.ObjectId(input.categoryId),
    subcategoryId: input.subcategoryId ? new Types.ObjectId(input.subcategoryId) : null,
  });

  const productObj = product.toObject() as any;
  return {
    ...productObj,
    isInStock: (productObj.stock as number) > 0,
    effectivePrice: productObj.salePrice != null && productObj.salePrice < productObj.price ? productObj.salePrice : productObj.price,
  };
}

export async function updateProduct(id: string, input: UpdateProductInput): Promise<ProductLean> {
  if (!Types.ObjectId.isValid(id)) throw new AppError("Invalid product id", 400);

  const update: Record<string, unknown> = { ...input };
  if (input.slug) update.slug = toSlug(input.slug);
  if (input.sku) update.sku = input.sku.toUpperCase();
  if (input.categoryId) update.categoryId = new Types.ObjectId(input.categoryId);
  if (input.subcategoryId !== undefined) {
    update.subcategoryId = input.subcategoryId ? new Types.ObjectId(input.subcategoryId) : null;
  }

  // Convert imageUrl to media array if provided
  if (input.imageUrl) {
    update.media = [{ url: input.imageUrl, type: "image" as const, isPrimary: true, sortOrder: 0 }];
  }

  const product = await Product.findByIdAndUpdate(id, update, {
    new: true,
    runValidators: true,
  }).lean();

  if (!product) throw new AppError("Product not found", 404);
  const productObj = product as any;
  return {
    ...productObj,
    isInStock: (productObj.stock as number) > 0,
    effectivePrice: productObj.salePrice != null && productObj.salePrice < productObj.price ? productObj.salePrice : productObj.price,
  };
}

export async function deleteProduct(id: string): Promise<void> {
  if (!Types.ObjectId.isValid(id)) throw new AppError("Invalid product id", 400);
  const result = await Product.findByIdAndDelete(id);
  if (!result) throw new AppError("Product not found", 404);
}

export async function listLowStockProducts(threshold?: number): Promise<ProductLean[]> {
  const products = await Product.find({ isActive: true }).lean();
  return products
    .filter((p) => p.stock <= (threshold ?? p.lowStockThreshold))
    .map((p) => ({
      ...p,
      isInStock: (p.stock as number) > 0,
      effectivePrice: p.salePrice != null && p.salePrice < p.price ? p.salePrice : p.price,
    }));
}

export async function adjustStock(
  productId: string,
  params: {
    quantityChange: number;
    action: InventoryAction;
    reason?: string;
    performedBy?: string;
  }
): Promise<{ productId: string; previousStock: number; newStock: number }> {
  return inventoryAdjustStock({
    productId,
    ...params,
  });
}
