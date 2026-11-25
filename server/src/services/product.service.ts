/**
 * ============================================================================
 * Product Service — PostgreSQL Implementation (Phase 3C-3)
 * ============================================================================
 *
 * Migrated from MongoDB/Mongoose to Supabase PostgreSQL using `PostgresProductRepository`
 * and `PostgresCategoryRepository`.
 *
 * Guarantees:
 * - 100% PostgreSQL-backed product CRUD and stock management.
 * - Zero Mongoose / MongoDB dependencies in this service.
 * - Exact API contract compatibility (items, meta, error codes, and field formats).
 * - Full backward compatibility: entities provide both `id` and `_id`, `effectivePrice`, and `isInStock`.
 * - Atomic stock adjustments and `inventory_logs` insertion inside the same PostgreSQL transaction.
 * - Support for repository and database pool dependency injection for unit testing.
 */

import { AppError } from "../middleware/errorHandler.js";
import { toSlug, generateSku, isValidEntityId } from "../utils/helpers.js";
import {
  PostgresProductRepository,
  postgresProductRepository,
  ProductRecord,
  ProductFilterOptions,
  UpdateProductData,
  computeEffectivePrice,
} from "../repositories/postgres-product.repository.js";
import {
  PostgresCategoryRepository,
  postgresCategoryRepository,
} from "../repositories/postgres-category.repository.js";
import { PostgresDatabase, withTransaction } from "../db/postgres.js";
import { IDbPool } from "../types/database.types.js";
import type { z } from "zod";
import type {
  createProductSchema,
  updateProductSchema,
  productQuerySchema,
} from "../validators/catalog.validators.js";
import type { PaginationMeta, InventoryAction } from "../types/index.js";

export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
export type ProductQuery = z.infer<typeof productQuerySchema>;

/** Domain entity alias preserved for backward-compatibility with existing consumers. */
export type ProductLean = ProductRecord;

export { computeEffectivePrice };

// Default dependencies (can be overridden for unit testing)
let activeProductRepository: PostgresProductRepository = postgresProductRepository;
let activeCategoryRepository: PostgresCategoryRepository = postgresCategoryRepository;
let activeDatabasePool: IDbPool | null = null;

function getPool(): IDbPool {
  return activeDatabasePool ?? PostgresDatabase.getPool();
}

/** Allows overriding the product repository instance for isolated unit tests. */
export function setProductRepository(repo: PostgresProductRepository): void {
  activeProductRepository = repo;
}

/** Allows overriding the category repository instance for isolated unit tests. */
export function setCategoryRepository(repo: PostgresCategoryRepository): void {
  activeCategoryRepository = repo;
}

/** Allows overriding the database pool for isolated unit tests. */
export function setProductDatabasePool(pool: IDbPool | null): void {
  activeDatabasePool = pool;
}

/**
 * Lists products matching filter, pagination, and sorting criteria.
 */
export async function listProducts(
  query: ProductQuery,
  repo: PostgresProductRepository = activeProductRepository
): Promise<{ items: ProductLean[]; meta: PaginationMeta }> {
  const repoFilters: ProductFilterOptions = {};

  // Only filter by isActive if not explicitly set to "all"
  if (query.isActive !== "all") {
    repoFilters.isActive = query.isActive === "true" ? true : query.isActive === "false" ? false : true;
  } else {
    repoFilters.isActive = "all";
  }

  if (query.subcategoryId) {
    if (!isValidEntityId(query.subcategoryId)) {
      throw new AppError("Invalid subcategory id", 400);
    }
    if (typeof activeCategoryRepository.getDescendantIds === "function") {
      try {
        const descendantIds = await activeCategoryRepository.getDescendantIds(query.subcategoryId);
        repoFilters.categoryIds = descendantIds.length > 0 ? descendantIds : [query.subcategoryId];
      } catch {
        repoFilters.subcategoryId = query.subcategoryId;
      }
    } else {
      repoFilters.subcategoryId = query.subcategoryId;
    }
  } else if (query.categoryId) {
    if (!isValidEntityId(query.categoryId)) {
      throw new AppError("Invalid category id", 400);
    }
    if (typeof activeCategoryRepository.getDescendantIds === "function") {
      try {
        const descendantIds = await activeCategoryRepository.getDescendantIds(query.categoryId);
        repoFilters.categoryIds = descendantIds.length > 0 ? descendantIds : [query.categoryId];
      } catch {
        repoFilters.categoryId = query.categoryId;
      }
    } else {
      repoFilters.categoryId = query.categoryId;
    }
  }

  if (query.minPrice !== undefined) repoFilters.minPrice = query.minPrice;
  if (query.maxPrice !== undefined) repoFilters.maxPrice = query.maxPrice;
  if (query.material) repoFilters.material = query.material;
  if (query.color) repoFilters.color = query.color;
  if (query.minRating !== undefined) repoFilters.minRating = query.minRating;
  if (query.inStock === "true") repoFilters.inStock = true;
  if (query.inStock === "false") repoFilters.inStock = false;
  if (query.isSignaturePiece === "true") repoFilters.isSignaturePiece = true;
  if (query.isSignaturePiece === "false") repoFilters.isSignaturePiece = false;
  if (query.q) repoFilters.q = query.q;

  const page = Math.max(1, query.page || 1);
  const limit = Math.max(1, Math.min(100, query.limit || 20));

  const [items, total] = await Promise.all([
    repo.findAll(repoFilters, { page, limit }, query.sort),
    repo.count(repoFilters),
  ]);

  return {
    items,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    },
  };
}

/**
 * Searches products by search term `q` and optional catalog filters.
 */
export async function searchProducts(
  q: string,
  query: Omit<ProductQuery, "q">,
  repo: PostgresProductRepository = activeProductRepository
): Promise<{ items: ProductLean[]; meta: PaginationMeta }> {
  return listProducts({ ...query, q }, repo);
}

/**
 * Retrieves a single product by its unique ID. Throws 400 on invalid format, 404 if not found.
 */
export async function getProductById(
  id: string,
  repo: PostgresProductRepository = activeProductRepository
): Promise<ProductLean> {
  if (!isValidEntityId(id)) throw new AppError("Invalid product id", 400);
  const product = await repo.findById(id);
  if (!product) throw new AppError("Product not found", 404);
  return product;
}

/**
 * Retrieves a single active product by its unique slug. Throws 404 if not found.
 */
export async function getProductBySlug(
  slug: string,
  repo: PostgresProductRepository = activeProductRepository
): Promise<ProductLean> {
  if (!slug || typeof slug !== "string" || slug.trim() === "") {
    throw new AppError("Product not found", 404);
  }
  const product = await repo.findBySlug(slug, { activeOnly: true });
  if (!product) throw new AppError("Product not found", 404);
  return product;
}

/**
 * Retrieves a single product by its SKU. Throws 404 if not found.
 */
export async function getProductBySku(
  sku: string,
  repo: PostgresProductRepository = activeProductRepository
): Promise<ProductLean> {
  if (!sku || typeof sku !== "string" || sku.trim() === "") {
    throw new AppError("Product not found", 404);
  }
  const product = await repo.findBySku(sku);
  if (!product) throw new AppError("Product not found", 404);
  return product;
}

/**
 * Creates a new product.
 *
 * - Validates category and subcategory existence (400).
 * - Generates slug and SKU if omitted.
 * - Validates slug and SKU uniqueness (409).
 * - Resolves media array from `media` or fallback `imageUrl`.
 * - Inserts into PostgreSQL and synchronizes media atomically.
 */
export async function createProduct(
  input: CreateProductInput,
  repo: PostgresProductRepository = activeProductRepository,
  catRepo: PostgresCategoryRepository = activeCategoryRepository
): Promise<ProductLean> {
  if (!isValidEntityId(input.categoryId)) {
    throw new AppError("Category not found", 400);
  }
  const category = await catRepo.findById(input.categoryId);
  if (!category) {
    throw new AppError("Category not found", 400);
  }

  if (input.subcategoryId) {
    if (!isValidEntityId(input.subcategoryId)) {
      throw new AppError("Subcategory not found", 400);
    }
    const sub = await catRepo.findById(input.subcategoryId);
    if (!sub) {
      throw new AppError("Subcategory not found", 400);
    }
  }

  const slug = input.slug ? toSlug(input.slug) : toSlug(input.name);
  const sku = input.sku?.toUpperCase() ?? generateSku(category.productType.slice(0, 3).toUpperCase());

  const existingSlug = await repo.existsBySlug(slug);
  if (existingSlug) throw new AppError("Product slug already exists", 409);

  const existingSku = await repo.existsBySku(sku);
  if (existingSku) throw new AppError("SKU already exists", 409);

  // Determine media array: prioritize explicit media array, fallback to imageUrl
  const media = input.media && input.media.length > 0
    ? input.media
    : input.imageUrl
      ? [{ url: input.imageUrl, type: "image" as const, isPrimary: true, sortOrder: 0 }]
      : [];

  const { imageUrl: _unused, ...restInput } = input;

  try {
    const product = await repo.create({
      ...restInput,
      slug,
      sku,
      media,
      subcategoryId: input.subcategoryId || null,
    });
    return product;
  } catch (err: any) {
    if (err?.code === "23505") {
      if (err?.message?.includes("sku") || err?.detail?.includes("sku")) {
        throw new AppError("SKU already exists", 409);
      }
      throw new AppError("Product slug already exists", 409);
    }
    throw err;
  }
}

/**
 * Updates an existing product by ID.
 *
 * - Validates product ID (400) and category/subcategory if updated (400).
 * - Enforces slug and SKU uniqueness on update (409).
 * - Handles media synchronization atomically.
 * - Returns updated product or throws 404 if not found.
 */
export async function updateProduct(
  id: string,
  input: UpdateProductInput,
  repo: PostgresProductRepository = activeProductRepository,
  catRepo: PostgresCategoryRepository = activeCategoryRepository
): Promise<ProductLean> {
  if (!isValidEntityId(id)) throw new AppError("Invalid product id", 400);

  if (input.categoryId) {
    if (!isValidEntityId(input.categoryId)) throw new AppError("Category not found", 400);
    const cat = await catRepo.findById(input.categoryId);
    if (!cat) throw new AppError("Category not found", 400);
  }

  if (input.subcategoryId) {
    if (!isValidEntityId(input.subcategoryId)) throw new AppError("Subcategory not found", 400);
    const sub = await catRepo.findById(input.subcategoryId);
    if (!sub) throw new AppError("Subcategory not found", 400);
  }

  const { imageUrl, ...restInput } = input;
  const updateData: UpdateProductData = { ...restInput };

  if (input.slug) {
    updateData.slug = toSlug(input.slug);
    const slugExists = await repo.existsBySlug(updateData.slug, id);
    if (slugExists) throw new AppError("Product slug already exists", 409);
  }

  if (input.sku) {
    updateData.sku = input.sku.toUpperCase();
    const skuExists = await repo.existsBySku(updateData.sku, id);
    if (skuExists) throw new AppError("SKU already exists", 409);
  }

  if (input.subcategoryId !== undefined) {
    updateData.subcategoryId = input.subcategoryId ? input.subcategoryId : null;
  }

  // Handle media updates: prioritize media array if provided; otherwise fallback to single imageUrl if specified
  if (input.media !== undefined) {
    updateData.media = input.media;
  } else if (imageUrl) {
    updateData.media = [{ url: imageUrl, type: "image" as const, isPrimary: true, sortOrder: 0 }];
  }

  try {
    const product = await repo.updateById(id, updateData);
    if (!product) throw new AppError("Product not found", 404);
    return product;
  } catch (err: any) {
    if (err?.code === "23505") {
      if (err?.message?.includes("sku") || err?.detail?.includes("sku")) {
        throw new AppError("SKU already exists", 409);
      }
      throw new AppError("Product slug already exists", 409);
    }
    throw err;
  }
}

/**
 * Deletes a product by ID. Throws 400 on invalid ID, 404 if not found.
 */
export async function deleteProduct(
  id: string,
  repo: PostgresProductRepository = activeProductRepository
): Promise<void> {
  if (!isValidEntityId(id)) throw new AppError("Invalid product id", 400);
  const result = await repo.deleteById(id);
  if (!result) throw new AppError("Product not found", 404);
}

/**
 * Retrieves products with stock at or below their low stock threshold.
 */
export async function listLowStockProducts(
  threshold?: number,
  repo: PostgresProductRepository = activeProductRepository
): Promise<ProductLean[]> {
  return repo.findLowStock(threshold);
}

/**
 * Atomically adjusts stock for a product and inserts an audit log into `inventory_logs`
 * within the same PostgreSQL transaction.
 *
 * - Negative changes are conditional, preventing negative stock.
 * - Throws 400 on invalid product ID or quantity.
 * - Throws 400 on insufficient stock.
 * - Throws 404 if product does not exist.
 */
export async function adjustStock(
  productId: string,
  params: {
    quantityChange: number;
    action: InventoryAction;
    reason?: string;
    performedBy?: string;
    orderId?: string;
  },
  repo: PostgresProductRepository = activeProductRepository,
  pool: IDbPool = getPool()
): Promise<{ productId: string; previousStock: number; newStock: number }> {
  if (!isValidEntityId(productId)) {
    throw new AppError("Invalid product id", 400);
  }

  if (!Number.isFinite(params.quantityChange) || !Number.isInteger(params.quantityChange)) {
    throw new AppError("Invalid quantity change", 400);
  }

  return withTransaction(pool, async (client) => {
    let updatedProduct: ProductRecord;
    let previousStock: number;
    let newStock: number;

    if (params.quantityChange < 0) {
      const requiredQty = Math.abs(params.quantityChange);

      // Atomic conditional decrement in PostgreSQL
      const updateResult = await client.query<{
        id: string;
        sku: string;
        stock: number;
      }>(
        `UPDATE products
         SET stock = stock - $1, updated_at = NOW()
         WHERE id = $2 AND stock >= $1
         RETURNING id, sku, stock;`,
        [requiredQty, productId]
      );

      if (updateResult.rowCount === 0 || !updateResult.rows[0]) {
        const checkResult = await client.query<{ id: string; stock: number; sku: string }>(
          `SELECT id, stock, sku FROM products WHERE id = $1;`,
          [productId]
        );

        if (checkResult.rowCount === 0 || !checkResult.rows[0]) {
          throw new AppError("Product not found", 404);
        }

        throw new AppError("Insufficient stock", 400);
      }

      const row = updateResult.rows[0];
      newStock = Number(row.stock);
      previousStock = newStock - params.quantityChange;
      updatedProduct = { sku: row.sku, id: row.id } as ProductRecord;
    } else if (params.quantityChange > 0) {
      // Atomic increment in PostgreSQL
      const updateResult = await client.query<{
        id: string;
        sku: string;
        stock: number;
      }>(
        `UPDATE products
         SET stock = stock + $1, updated_at = NOW()
         WHERE id = $2
         RETURNING id, sku, stock;`,
        [params.quantityChange, productId]
      );

      if (updateResult.rowCount === 0 || !updateResult.rows[0]) {
        throw new AppError("Product not found", 404);
      }

      const row = updateResult.rows[0];
      newStock = Number(row.stock);
      previousStock = newStock - params.quantityChange;
      updatedProduct = { sku: row.sku, id: row.id } as ProductRecord;
    } else {
      // quantityChange === 0
      const existing = await repo.findById(productId, client);
      if (!existing) {
        throw new AppError("Product not found", 404);
      }
      updatedProduct = existing;
      previousStock = updatedProduct.stock;
      newStock = updatedProduct.stock;
    }

    // Verify foreign keys for inventory_logs if provided
    let validOrderId: string | null = null;
    if (params.orderId && isValidEntityId(params.orderId)) {
      const orderCheck = await client.query("SELECT id FROM orders WHERE id = $1 LIMIT 1;", [params.orderId]);
      if (orderCheck.rowCount && orderCheck.rowCount > 0) {
        validOrderId = params.orderId;
      }
    }

    let validUserId: string | null = null;
    if (params.performedBy && isValidEntityId(params.performedBy)) {
      const userCheck = await client.query("SELECT id FROM users WHERE id = $1 LIMIT 1;", [params.performedBy]);
      if (userCheck.rowCount && userCheck.rowCount > 0) {
        validUserId = params.performedBy;
      }
    }

    // Insert inventory_log in the same transaction
    await client.query(
      `INSERT INTO inventory_logs (
         product_id, sku, action, quantity_change, previous_stock, new_stock, reason, order_id, performed_by
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9);`,
      [
        productId,
        updatedProduct.sku,
        params.action,
        params.quantityChange,
        previousStock,
        newStock,
        params.reason ?? null,
        validOrderId,
        validUserId,
      ]
    );

    return {
      productId,
      previousStock,
      newStock,
    };
  });
}
