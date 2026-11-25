/**
 * ============================================================================
 * PostgreSQL Product Repository (Phase 3C-1 / 3C-2)
 * ============================================================================
 *
 * Provides strongly-typed, parameterized CRUD and stock management operations
 * for product data stored in the Supabase PostgreSQL `products` and `product_media` tables.
 *
 * Guarantees:
 * - 100% Parameterized SQL queries (preventing SQL injection).
 * - Safe identifier validation (24-char hex ObjectId or 36-char canonical UUID).
 * - Strict update allowlisting (preventing overwrite of immutable fields).
 * - Atomic media synchronization between `products.media` JSONB and `product_media` relational table.
 * - Atomic conditional stock adjustments preventing negative inventory.
 * - Single-client transaction management via `withTransaction` and supplied client reuse.
 * - Numeric parsing for PostgreSQL NUMERIC types (price, sale_price, weight_grams, average_rating).
 * - Native array parsing for TEXT[] columns (colors, materials, tags).
 * - Derived virtual fields (effectivePrice, isInStock).
 * - Dual ID compatibility (both `id` and `_id` available).
 * - Zero Mongoose dependencies.
 */

import { IDbClient, IDbPool } from "../types/database.types.js";
import { PostgresDatabase, withTransaction } from "../db/postgres.js";
import { isValidEntityId, assertValidEntityId } from "../utils/helpers.js";
import { AppError } from "../middleware/errorHandler.js";

/** Product media structure stored in `products.media` JSONB and `product_media` table. */
export interface ProductMedia {
  url: string;
  alt?: string;
  type: "image" | "video";
  isPrimary?: boolean;
  sortOrder?: number;
}

/** Raw database row shape returned by PostgreSQL queries on `products`. */
export interface ProductDbRow {
  id: string;
  name: string;
  slug: string;
  description: string;
  short_description: string | null;
  category_id: string;
  subcategory_id: string | null;
  price: string | number;
  sale_price: string | number | null;
  currency: string;
  sku: string;
  stock: number;
  low_stock_threshold: number;
  weight_grams: string | number | null;
  material_info: string | null;
  care_instructions: string | null;
  additional_info: string | null;
  media: any;
  colors: string[];
  materials: string[];
  tags: string[];
  badge: string | null;
  is_signature_piece: boolean;
  signature_category: string;
  is_active: boolean;
  is_customizable: boolean;
  average_rating: string | number;
  review_count: number;
  created_at: Date | string;
  updated_at: Date | string;
}

/** Strongly-typed domain entity representing a Product. */
export interface ProductRecord {
  id: string;
  /** Preserved for backward-compatibility with existing templates/contracts expecting `_id`. */
  _id: string;
  name: string;
  slug: string;
  description: string;
  shortDescription: string | null;
  categoryId: string;
  subcategoryId: string | null;
  price: number;
  salePrice: number | null;
  effectivePrice: number;
  currency: string;
  sku: string;
  stock: number;
  isInStock: boolean;
  lowStockThreshold: number;
  weightGrams: number | null;
  materialInfo: string | null;
  careInstructions: string | null;
  additionalInfo: string | null;
  media: ProductMedia[];
  colors: string[];
  materials: string[];
  tags: string[];
  badge: string | null;
  isSignaturePiece: boolean;
  signatureCategory: string;
  isActive: boolean;
  isCustomizable: boolean;
  averageRating: number;
  reviewCount: number;
  createdAt: Date;
  updatedAt: Date;
}

/** Data required to insert a new product record. */
export interface CreateProductData {
  id?: string;
  name: string;
  slug: string;
  description: string;
  shortDescription?: string | null;
  categoryId: string;
  subcategoryId?: string | null;
  price: number;
  salePrice?: number | null;
  currency?: string;
  sku: string;
  stock?: number;
  lowStockThreshold?: number;
  weightGrams?: number | null;
  materialInfo?: string | null;
  careInstructions?: string | null;
  additionalInfo?: string | null;
  media?: ProductMedia[];
  colors?: string[];
  materials?: string[];
  tags?: string[];
  badge?: string | null;
  isSignaturePiece?: boolean;
  signatureCategory?: "fashion" | "trending" | "latest" | "none" | string;
  isActive?: boolean;
  isCustomizable?: boolean;
  averageRating?: number;
  reviewCount?: number;
}

/** Fields that may be updated on an existing product record. */
export interface UpdateProductData {
  name?: string;
  slug?: string;
  description?: string;
  shortDescription?: string | null;
  categoryId?: string;
  subcategoryId?: string | null;
  price?: number;
  salePrice?: number | null;
  currency?: string;
  sku?: string;
  stock?: number;
  lowStockThreshold?: number;
  weightGrams?: number | null;
  materialInfo?: string | null;
  careInstructions?: string | null;
  additionalInfo?: string | null;
  media?: ProductMedia[];
  colors?: string[];
  materials?: string[];
  tags?: string[];
  badge?: string | null;
  isSignaturePiece?: boolean;
  signatureCategory?: "fashion" | "trending" | "latest" | "none" | string;
  isActive?: boolean;
  isCustomizable?: boolean;
  averageRating?: number;
  reviewCount?: number;
}

/** Filter criteria for searching and listing products. */
export interface ProductFilterOptions {
  isActive?: boolean | "all";
  categoryId?: string;
  subcategoryId?: string;
  categoryIds?: string[];
  minPrice?: number;
  maxPrice?: number;
  material?: string;
  color?: string;
  tag?: string;
  minRating?: number;
  inStock?: boolean;
  isSignaturePiece?: boolean;
  signatureCategory?: string;
  q?: string;
}

/** Pagination parameters. */
export interface ProductPaginationOptions {
  page?: number;
  limit?: number;
  offset?: number;
}

/** Sorting options matching catalog specifications. */
export type ProductSortOption =
  | "price_asc"
  | "price_desc"
  | "rating"
  | "name"
  | "newest"
  | string;

/**
 * Strict allowlist of columns permitted in UPDATE operations on `products`.
 * Prevents arbitrary field injection, overwriting immutable primary keys, or corrupting timestamps.
 */
export const ALLOWED_PRODUCT_UPDATE_COLUMNS: Readonly<Record<string, string>> = Object.freeze({
  name: "name",
  slug: "slug",
  description: "description",
  shortDescription: "short_description",
  categoryId: "category_id",
  subcategoryId: "subcategory_id",
  price: "price",
  salePrice: "sale_price",
  currency: "currency",
  sku: "sku",
  stock: "stock",
  lowStockThreshold: "low_stock_threshold",
  weightGrams: "weight_grams",
  materialInfo: "material_info",
  careInstructions: "care_instructions",
  additionalInfo: "additional_info",
  media: "media",
  colors: "colors",
  materials: "materials",
  tags: "tags",
  badge: "badge",
  isSignaturePiece: "is_signature_piece",
  signatureCategory: "signature_category",
  isActive: "is_active",
  isCustomizable: "is_customizable",
  averageRating: "average_rating",
  reviewCount: "review_count",
});

/**
 * Derives the effective price following the established catalog pricing rule.
 */
export function computeEffectivePrice(price: number, salePrice?: number | null): number {
  if (salePrice != null && salePrice > 0 && salePrice !== price) {
    return Math.min(price, salePrice);
  }
  return price;
}

/**
 * Maps a raw PostgreSQL row to a strongly-typed `ProductRecord`.
 * Converts numeric strings to numbers, preserves arrays, parses JSONB media,
 * and derives virtual fields.
 */
export function mapRowToProduct(row: ProductDbRow): ProductRecord {
  const price = Number(row.price ?? 0);
  const salePrice = row.sale_price != null ? Number(row.sale_price) : null;
  const stock = Number(row.stock ?? 0);

  const effectivePrice = computeEffectivePrice(price, salePrice);
  const isInStock = stock > 0;

  let media: ProductMedia[] = [];
  if (Array.isArray(row.media)) {
    media = row.media;
  } else if (typeof row.media === "string") {
    try {
      media = JSON.parse(row.media);
    } catch {
      media = [];
    }
  }

  return {
    id: row.id,
    _id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    shortDescription: row.short_description ?? null,
    categoryId: row.category_id,
    subcategoryId: row.subcategory_id ?? null,
    price,
    salePrice,
    effectivePrice,
    currency: row.currency || "INR",
    sku: row.sku,
    stock,
    isInStock,
    lowStockThreshold: Number(row.low_stock_threshold ?? 5),
    weightGrams: row.weight_grams != null ? Number(row.weight_grams) : null,
    materialInfo: row.material_info ?? null,
    careInstructions: row.care_instructions ?? null,
    additionalInfo: row.additional_info ?? null,
    media,
    colors: Array.isArray(row.colors) ? row.colors : [],
    materials: Array.isArray(row.materials) ? row.materials : [],
    tags: Array.isArray(row.tags) ? row.tags : [],
    badge: row.badge ?? null,
    isSignaturePiece: Boolean(row.is_signature_piece),
    signatureCategory: row.signature_category || "none",
    isActive: Boolean(row.is_active),
    isCustomizable: Boolean(row.is_customizable),
    averageRating: Number(row.average_rating ?? 0),
    reviewCount: Number(row.review_count ?? 0),
    createdAt: row.created_at instanceof Date ? row.created_at : new Date(row.created_at),
    updatedAt: row.updated_at instanceof Date ? row.updated_at : new Date(row.updated_at),
  };
}

const PRODUCT_SELECT_FIELDS = `
  id,
  name,
  slug,
  description,
  short_description,
  category_id,
  subcategory_id,
  price,
  sale_price,
  currency,
  sku,
  stock,
  low_stock_threshold,
  weight_grams,
  material_info,
  care_instructions,
  additional_info,
  media,
  colors,
  materials,
  tags,
  badge,
  is_signature_piece,
  signature_category,
  is_active,
  is_customizable,
  average_rating,
  review_count,
  created_at,
  updated_at
`;

/**
 * Builds parameterized WHERE conditions from filter options.
 * Reusable between `findAll` and `count` for strict consistency.
 */
function buildProductWhereClause(filters?: ProductFilterOptions): {
  whereClause: string;
  params: any[];
} {
  const conditions: string[] = [];
  const params: any[] = [];

  const addParam = (clause: (paramIndex: number) => string, value: any) => {
    params.push(value);
    conditions.push(clause(params.length));
  };

  if (filters?.isActive !== "all") {
    const activeVal = filters?.isActive === false ? false : true;
    addParam((i) => `is_active = $${i}`, activeVal);
  }

  if (filters?.categoryIds && filters.categoryIds.length > 0) {
    for (const cid of filters.categoryIds) {
      assertValidEntityId(cid, "categoryIds");
    }
    addParam(
      (i) => `(category_id = ANY($${i}::varchar[]) OR subcategory_id = ANY($${i}::varchar[]))`,
      filters.categoryIds
    );
  } else {
    if (filters?.categoryId) {
      assertValidEntityId(filters.categoryId, "categoryId");
      addParam((i) => `category_id = $${i}`, filters.categoryId);
    }

    if (filters?.subcategoryId) {
      assertValidEntityId(filters.subcategoryId, "subcategoryId");
      addParam((i) => `subcategory_id = $${i}`, filters.subcategoryId);
    }
  }

  if (filters?.minPrice !== undefined && Number.isFinite(filters.minPrice)) {
    addParam((i) => `price >= $${i}`, filters.minPrice);
  }

  if (filters?.maxPrice !== undefined && Number.isFinite(filters.maxPrice)) {
    addParam((i) => `price <= $${i}`, filters.maxPrice);
  }

  if (filters?.material && typeof filters.material === "string") {
    addParam((i) => `$${i} = ANY(materials)`, filters.material.trim());
  }

  if (filters?.color && typeof filters.color === "string") {
    addParam((i) => `$${i} = ANY(colors)`, filters.color.trim());
  }

  if (filters?.tag && typeof filters.tag === "string") {
    addParam((i) => `$${i} = ANY(tags)`, filters.tag.trim());
  }

  if (filters?.minRating !== undefined && Number.isFinite(filters.minRating)) {
    addParam((i) => `average_rating >= $${i}`, filters.minRating);
  }

  if (filters?.inStock !== undefined) {
    if (filters.inStock === true) {
      conditions.push("stock > 0");
    } else {
      conditions.push("stock = 0");
    }
  }

  if (filters?.isSignaturePiece !== undefined) {
    addParam((i) => `is_signature_piece = $${i}`, Boolean(filters.isSignaturePiece));
  }

  if (filters?.signatureCategory && typeof filters.signatureCategory === "string") {
    addParam((i) => `signature_category = $${i}`, filters.signatureCategory.trim());
  }

  if (filters?.q && typeof filters.q === "string" && filters.q.trim() !== "") {
    const searchTerm = `%${filters.q.trim()}%`;
    const exactTerm = filters.q.trim();
    params.push(searchTerm);
    const pSearch = params.length;
    params.push(exactTerm);
    const pExact = params.length;
    conditions.push(
      `(name ILIKE $${pSearch} OR description ILIKE $${pSearch} OR sku ILIKE $${pSearch} OR $${pExact} = ANY(tags) OR $${pExact} = ANY(materials))`
    );
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  return { whereClause, params };
}

/**
 * Strictly maps requested sort option to an allowed SQL ORDER BY clause.
 * Prevents arbitrary SQL injection.
 */
function getSortClause(sort?: ProductSortOption): string {
  switch (sort) {
    case "price_asc":
      return "ORDER BY price ASC, id ASC";
    case "price_desc":
      return "ORDER BY price DESC, id ASC";
    case "rating":
      return "ORDER BY average_rating DESC, review_count DESC, id ASC";
    case "name":
      return "ORDER BY name ASC, id ASC";
    case "newest":
    default:
      return "ORDER BY created_at DESC, id ASC";
  }
}

export class PostgresProductRepository {
  constructor(private readonly defaultClient?: IDbClient) {}

  private getClient(overrideClient?: IDbClient): IDbClient {
    return overrideClient ?? this.defaultClient ?? PostgresDatabase.getPool();
  }

  private getPool(): IDbPool {
    if (this.defaultClient && "connect" in (this.defaultClient as any)) {
      return this.defaultClient as unknown as IDbPool;
    }
    return PostgresDatabase.getPool();
  }

  /**
   * Synchronizes media items to the relational `product_media` table.
   * Deletes existing items for the product and re-inserts current items with proper sort order.
   * Must be called within the same transaction client as the product write.
   */
  private async syncProductMedia(
    productId: string,
    media: ProductMedia[],
    client: IDbClient
  ): Promise<void> {
    await client.query("DELETE FROM product_media WHERE product_id = $1;", [productId]);

    if (!media || media.length === 0) {
      return;
    }

    for (let i = 0; i < media.length; i++) {
      const item = media[i];
      if (!item.url || typeof item.url !== "string" || item.url.trim() === "") {
        throw new Error(`Media item at index ${i} is missing required "url" field`);
      }
      const type = item.type === "video" ? "video" : "image";
      const isPrimary = Boolean(item.isPrimary);
      const sortOrder = Number.isInteger(item.sortOrder) ? item.sortOrder! : i;
      const alt = item.alt ?? null;

      await client.query(
        `INSERT INTO product_media (product_id, url, alt, type, is_primary, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6);`,
        [productId, item.url.trim(), alt, type, isPrimary, sortOrder]
      );
    }
  }

  // ==========================================================================
  // Read Operations
  // ==========================================================================

  /**
   * Retrieves products matching filter, pagination, and sorting criteria.
   * Parameterized SQL exclusively.
   */
  public async findAll(
    filters?: ProductFilterOptions,
    pagination?: ProductPaginationOptions,
    sort?: ProductSortOption,
    client?: IDbClient
  ): Promise<ProductRecord[]> {
    const db = this.getClient(client);
    const { whereClause, params } = buildProductWhereClause(filters);
    const sortClause = getSortClause(sort);

    let paginationClause = "";
    if (pagination) {
      const limit = Math.max(1, Math.min(100, pagination.limit ?? 20));
      const offset = Math.max(
        0,
        pagination.offset ?? (pagination.page ? (pagination.page - 1) * limit : 0)
      );
      params.push(limit);
      const pLimit = params.length;
      params.push(offset);
      const pOffset = params.length;
      paginationClause = `LIMIT $${pLimit} OFFSET $${pOffset}`;
    }

    const sql = `
      SELECT ${PRODUCT_SELECT_FIELDS}
      FROM products
      ${whereClause}
      ${sortClause}
      ${paginationClause};
    `;

    const result = await db.query<ProductDbRow>(sql, params);
    return result.rows.map(mapRowToProduct);
  }

  /**
   * Counts products matching filter criteria.
   */
  public async count(
    filters?: ProductFilterOptions,
    client?: IDbClient
  ): Promise<number> {
    const db = this.getClient(client);
    const { whereClause, params } = buildProductWhereClause(filters);

    const sql = `
      SELECT COUNT(*)::int AS count
      FROM products
      ${whereClause};
    `;

    const result = await db.query<{ count: number }>(sql, params);
    return Number(result.rows[0]?.count ?? 0);
  }

  /**
   * Retrieves a single product by its ID.
   * Validates ID using `isValidEntityId`; returns null if invalid or not found.
   */
  public async findById(id: string, client?: IDbClient): Promise<ProductRecord | null> {
    if (!isValidEntityId(id)) {
      return null;
    }
    const db = this.getClient(client);

    const sql = `
      SELECT ${PRODUCT_SELECT_FIELDS}
      FROM products
      WHERE id = $1
      LIMIT 1;
    `;

    const result = await db.query<ProductDbRow>(sql, [id]);
    if (result.rowCount === 0 || !result.rows[0]) {
      return null;
    }
    return mapRowToProduct(result.rows[0]);
  }

  /**
   * Retrieves a single product by its slug (case-insensitive).
   * By default, filters for `is_active = true` to preserve catalog behavior.
   */
  public async findBySlug(
    slug: string,
    options?: { activeOnly?: boolean },
    client?: IDbClient
  ): Promise<ProductRecord | null> {
    if (!slug || typeof slug !== "string" || slug.trim() === "") {
      return null;
    }
    const normalizedSlug = slug.trim().toLowerCase();
    const activeOnly = options?.activeOnly ?? true;
    const db = this.getClient(client);

    const conditions = ["LOWER(slug) = $1"];
    const params: any[] = [normalizedSlug];

    if (activeOnly) {
      conditions.push("is_active = true");
    }

    const sql = `
      SELECT ${PRODUCT_SELECT_FIELDS}
      FROM products
      WHERE ${conditions.join(" AND ")}
      LIMIT 1;
    `;

    const result = await db.query<ProductDbRow>(sql, params);
    if (result.rowCount === 0 || !result.rows[0]) {
      return null;
    }
    return mapRowToProduct(result.rows[0]);
  }

  /**
   * Retrieves a single product by its SKU (case-insensitive, uppercased).
   */
  public async findBySku(sku: string, client?: IDbClient): Promise<ProductRecord | null> {
    if (!sku || typeof sku !== "string" || sku.trim() === "") {
      return null;
    }
    const normalizedSku = sku.trim().toUpperCase();
    const db = this.getClient(client);

    const sql = `
      SELECT ${PRODUCT_SELECT_FIELDS}
      FROM products
      WHERE sku = $1
      LIMIT 1;
    `;

    const result = await db.query<ProductDbRow>(sql, [normalizedSku]);
    if (result.rowCount === 0 || !result.rows[0]) {
      return null;
    }
    return mapRowToProduct(result.rows[0]);
  }

  /**
   * Retrieves active products with low stock.
   * Uses the product's database `low_stock_threshold` when threshold override is not provided.
   */
  public async findLowStock(
    threshold?: number,
    client?: IDbClient
  ): Promise<ProductRecord[]> {
    const db = this.getClient(client);
    const params: any[] = [];
    let condition: string;

    if (threshold !== undefined && Number.isFinite(threshold)) {
      params.push(threshold);
      condition = `stock <= $1`;
    } else {
      condition = `stock <= low_stock_threshold`;
    }

    const sql = `
      SELECT ${PRODUCT_SELECT_FIELDS}
      FROM products
      WHERE is_active = true AND ${condition}
      ORDER BY stock ASC, name ASC;
    `;

    const result = await db.query<ProductDbRow>(sql, params);
    return result.rows.map(mapRowToProduct);
  }

  /**
   * Checks whether a product with the given slug exists, optionally excluding a specific ID.
   * Used for slug uniqueness validation.
   */
  public async existsBySlug(
    slug: string,
    excludeId?: string,
    client?: IDbClient
  ): Promise<boolean> {
    if (!slug || typeof slug !== "string" || slug.trim() === "") {
      return false;
    }
    const normalizedSlug = slug.trim().toLowerCase();
    const db = this.getClient(client);

    if (excludeId) {
      assertValidEntityId(excludeId, "exclude product id");
      const sql = `SELECT 1 FROM products WHERE LOWER(slug) = $1 AND id != $2 LIMIT 1;`;
      const result = await db.query(sql, [normalizedSlug, excludeId]);
      return result.rowCount > 0;
    }

    const sql = `SELECT 1 FROM products WHERE LOWER(slug) = $1 LIMIT 1;`;
    const result = await db.query(sql, [normalizedSlug]);
    return result.rowCount > 0;
  }

  /**
   * Checks whether a product with the given SKU exists, optionally excluding a specific ID.
   * Used for SKU uniqueness validation.
   */
  public async existsBySku(
    sku: string,
    excludeId?: string,
    client?: IDbClient
  ): Promise<boolean> {
    if (!sku || typeof sku !== "string" || sku.trim() === "") {
      return false;
    }
    const normalizedSku = sku.trim().toUpperCase();
    const db = this.getClient(client);

    if (excludeId) {
      assertValidEntityId(excludeId, "exclude product id");
      const sql = `SELECT 1 FROM products WHERE UPPER(sku) = $1 AND id != $2 LIMIT 1;`;
      const result = await db.query(sql, [normalizedSku, excludeId]);
      return result.rowCount > 0;
    }

    const sql = `SELECT 1 FROM products WHERE UPPER(sku) = $1 LIMIT 1;`;
    const result = await db.query(sql, [normalizedSku]);
    return result.rowCount > 0;
  }

  // ==========================================================================
  // Write Operations
  // ==========================================================================

  /**
   * Inserts a new product using parameterized SQL.
   * Synchronizes `products.media` JSONB and relational `product_media` table atomically.
   *
   * - Validates required fields and entity IDs.
   * - Preserves database defaults for optional attributes.
   * - Handles PostgreSQL arrays (colors, materials, tags) natively.
   * - Executes inside a transaction (supplied client reuse or `withTransaction`).
   * - Returns complete mapped `ProductRecord`.
   */
  public async create(
    data: CreateProductData,
    client?: IDbClient
  ): Promise<ProductRecord> {
    if (data.id) {
      assertValidEntityId(data.id, "product id");
    }
    assertValidEntityId(data.categoryId, "categoryId");
    if (data.subcategoryId) {
      assertValidEntityId(data.subcategoryId, "subcategoryId");
    }

    if (!data.name || typeof data.name !== "string" || data.name.trim() === "") {
      throw Object.assign(new Error("Product name is required"), { statusCode: 400 });
    }
    if (!data.slug || typeof data.slug !== "string" || data.slug.trim() === "") {
      throw Object.assign(new Error("Product slug is required"), { statusCode: 400 });
    }
    if (!data.sku || typeof data.sku !== "string" || data.sku.trim() === "") {
      throw Object.assign(new Error("Product SKU is required"), { statusCode: 400 });
    }
    if (data.description === undefined || data.description === null) {
      throw Object.assign(new Error("Product description is required"), { statusCode: 400 });
    }
    if (typeof data.price !== "number" || !Number.isFinite(data.price) || data.price < 0) {
      throw Object.assign(new Error("Product price must be a non-negative number"), { statusCode: 400 });
    }
    if (data.salePrice !== undefined && data.salePrice !== null) {
      if (typeof data.salePrice !== "number" || !Number.isFinite(data.salePrice) || data.salePrice < 0) {
        throw Object.assign(new Error("Product salePrice must be a non-negative number"), { statusCode: 400 });
      }
    }
    if (data.stock !== undefined) {
      if (!Number.isInteger(data.stock) || data.stock < 0) {
        throw Object.assign(new Error("Product stock must be a non-negative integer"), { statusCode: 400 });
      }
    }
    if (data.lowStockThreshold !== undefined) {
      if (!Number.isInteger(data.lowStockThreshold) || data.lowStockThreshold < 0) {
        throw Object.assign(new Error("Product lowStockThreshold must be a non-negative integer"), { statusCode: 400 });
      }
    }
    if (data.averageRating !== undefined) {
      if (
        typeof data.averageRating !== "number" ||
        !Number.isFinite(data.averageRating) ||
        data.averageRating < 0 ||
        data.averageRating > 5
      ) {
        throw Object.assign(new Error("Product averageRating must be between 0 and 5"), { statusCode: 400 });
      }
    }
    if (data.reviewCount !== undefined) {
      if (!Number.isInteger(data.reviewCount) || data.reviewCount < 0) {
        throw Object.assign(new Error("Product reviewCount must be a non-negative integer"), { statusCode: 400 });
      }
    }

    const executeCreate = async (execClient: IDbClient): Promise<ProductRecord> => {
      const normalizedSlug = data.slug.trim().toLowerCase();
      const normalizedSku = data.sku.trim().toUpperCase();
      const normalizedMedia: ProductMedia[] = Array.isArray(data.media) ? data.media : [];

      const columns: string[] = [];
      const placeholders: string[] = [];
      const params: any[] = [];

      const addField = (column: string, value: any) => {
        columns.push(column);
        params.push(value);
        placeholders.push(`$${params.length}`);
      };

      if (data.id) addField("id", data.id);
      addField("name", data.name.trim());
      addField("slug", normalizedSlug);
      addField("description", data.description);
      addField("short_description", data.shortDescription ?? null);
      addField("category_id", data.categoryId);
      addField("subcategory_id", data.subcategoryId ?? null);
      addField("price", data.price);
      addField("sale_price", data.salePrice ?? null);
      addField("currency", data.currency || "INR");
      addField("sku", normalizedSku);
      addField("stock", data.stock ?? 0);
      addField("low_stock_threshold", data.lowStockThreshold ?? 5);
      addField("weight_grams", data.weightGrams ?? null);
      addField("material_info", data.materialInfo ?? null);
      addField("care_instructions", data.careInstructions ?? null);
      addField("additional_info", data.additionalInfo ?? null);
      addField("media", JSON.stringify(normalizedMedia));
      addField("colors", data.colors ?? []);
      addField("materials", data.materials ?? []);
      addField("tags", data.tags ?? []);
      addField("badge", data.badge ?? null);
      addField("is_signature_piece", Boolean(data.isSignaturePiece));
      addField("signature_category", data.signatureCategory || "none");
      addField("is_active", data.isActive !== undefined ? Boolean(data.isActive) : true);
      addField("is_customizable", data.isCustomizable !== undefined ? Boolean(data.isCustomizable) : true);
      addField("average_rating", data.averageRating ?? 0);
      addField("review_count", data.reviewCount ?? 0);

      const sql = `
        INSERT INTO products (${columns.join(", ")})
        VALUES (${placeholders.join(", ")})
        RETURNING ${PRODUCT_SELECT_FIELDS};
      `;

      const result = await execClient.query<ProductDbRow>(sql, params);
      const row = result.rows[0];

      // Synchronize media to relational product_media table
      if (normalizedMedia.length > 0) {
        await this.syncProductMedia(row.id, normalizedMedia, execClient);
      }

      return mapRowToProduct(row);
    };

    if (client) {
      return executeCreate(client);
    }

    return withTransaction(this.getPool(), async (txClient) => {
      return executeCreate(txClient);
    });
  }

  /**
   * Updates an existing product by ID with strict column allowlisting.
   *
   * - Validates ID format and field types.
   * - Rejects any unsupported fields not in `ALLOWED_PRODUCT_UPDATE_COLUMNS`.
   * - Automatically updates `updated_at = NOW()`.
   * - Synchronizes `products.media` JSONB and relational `product_media` table atomically.
   * - Uses RETURNING to return the updated record.
   * - Returns null if the product does not exist.
   */
  public async updateById(
    id: string,
    data: UpdateProductData,
    client?: IDbClient
  ): Promise<ProductRecord | null> {
    assertValidEntityId(id, "product id");

    // Strict allowlist validation — reject unsupported fields
    for (const key of Object.keys(data)) {
      if (!(key in ALLOWED_PRODUCT_UPDATE_COLUMNS)) {
        throw new Error(`Unsupported update field: "${key}"`);
      }
    }

    if (data.categoryId !== undefined) {
      assertValidEntityId(data.categoryId, "categoryId");
    }
    if (data.subcategoryId !== undefined && data.subcategoryId !== null) {
      assertValidEntityId(data.subcategoryId, "subcategoryId");
    }
    if (data.price !== undefined) {
      if (typeof data.price !== "number" || !Number.isFinite(data.price) || data.price < 0) {
        throw Object.assign(new Error("Product price must be a non-negative number"), { statusCode: 400 });
      }
    }
    if (data.salePrice !== undefined && data.salePrice !== null) {
      if (typeof data.salePrice !== "number" || !Number.isFinite(data.salePrice) || data.salePrice < 0) {
        throw Object.assign(new Error("Product salePrice must be a non-negative number"), { statusCode: 400 });
      }
    }
    if (data.stock !== undefined) {
      if (!Number.isInteger(data.stock) || data.stock < 0) {
        throw Object.assign(new Error("Product stock must be a non-negative integer"), { statusCode: 400 });
      }
    }
    if (data.lowStockThreshold !== undefined) {
      if (!Number.isInteger(data.lowStockThreshold) || data.lowStockThreshold < 0) {
        throw Object.assign(new Error("Product lowStockThreshold must be a non-negative integer"), { statusCode: 400 });
      }
    }
    if (data.averageRating !== undefined) {
      if (
        typeof data.averageRating !== "number" ||
        !Number.isFinite(data.averageRating) ||
        data.averageRating < 0 ||
        data.averageRating > 5
      ) {
        throw Object.assign(new Error("Product averageRating must be between 0 and 5"), { statusCode: 400 });
      }
    }
    if (data.reviewCount !== undefined) {
      if (!Number.isInteger(data.reviewCount) || data.reviewCount < 0) {
        throw Object.assign(new Error("Product reviewCount must be a non-negative integer"), { statusCode: 400 });
      }
    }

    const executeUpdate = async (execClient: IDbClient): Promise<ProductRecord | null> => {
      const setClauses: string[] = [];
      const params: any[] = [];

      const addSet = (column: string, value: any) => {
        params.push(value);
        setClauses.push(`${column} = $${params.length}`);
      };

      if (data.name !== undefined) addSet("name", data.name.trim());
      if (data.slug !== undefined) addSet("slug", data.slug.trim().toLowerCase());
      if (data.description !== undefined) addSet("description", data.description);
      if (data.shortDescription !== undefined) addSet("short_description", data.shortDescription);
      if (data.categoryId !== undefined) addSet("category_id", data.categoryId);
      if (data.subcategoryId !== undefined) addSet("subcategory_id", data.subcategoryId);
      if (data.price !== undefined) addSet("price", data.price);
      if (data.salePrice !== undefined) addSet("sale_price", data.salePrice);
      if (data.currency !== undefined) addSet("currency", data.currency);
      if (data.sku !== undefined) addSet("sku", data.sku.trim().toUpperCase());
      if (data.stock !== undefined) addSet("stock", data.stock);
      if (data.lowStockThreshold !== undefined) addSet("low_stock_threshold", data.lowStockThreshold);
      if (data.weightGrams !== undefined) addSet("weight_grams", data.weightGrams);
      if (data.materialInfo !== undefined) addSet("material_info", data.materialInfo);
      if (data.careInstructions !== undefined) addSet("care_instructions", data.careInstructions);
      if (data.additionalInfo !== undefined) addSet("additional_info", data.additionalInfo);
      if (data.media !== undefined) {
        const normalizedMedia = Array.isArray(data.media) ? data.media : [];
        addSet("media", JSON.stringify(normalizedMedia));
      }
      if (data.colors !== undefined) addSet("colors", data.colors);
      if (data.materials !== undefined) addSet("materials", data.materials);
      if (data.tags !== undefined) addSet("tags", data.tags);
      if (data.badge !== undefined) addSet("badge", data.badge);
      if (data.isSignaturePiece !== undefined) addSet("is_signature_piece", Boolean(data.isSignaturePiece));
      if (data.signatureCategory !== undefined) addSet("signature_category", data.signatureCategory);
      if (data.isActive !== undefined) addSet("is_active", Boolean(data.isActive));
      if (data.isCustomizable !== undefined) addSet("is_customizable", Boolean(data.isCustomizable));
      if (data.averageRating !== undefined) addSet("average_rating", data.averageRating);
      if (data.reviewCount !== undefined) addSet("review_count", data.reviewCount);

      // If no fields to update and media was not supplied, return current record
      if (setClauses.length === 0) {
        return this.findById(id, execClient);
      }

      setClauses.push("updated_at = NOW()");

      params.push(id);
      const idParamIndex = params.length;

      const sql = `
        UPDATE products
        SET ${setClauses.join(", ")}
        WHERE id = $${idParamIndex}
        RETURNING ${PRODUCT_SELECT_FIELDS};
      `;

      const result = await execClient.query<ProductDbRow>(sql, params);
      if (result.rowCount === 0 || !result.rows[0]) {
        return null;
      }

      // Synchronize media if media was explicitly provided in the update
      if (data.media !== undefined) {
        const normalizedMedia = Array.isArray(data.media) ? data.media : [];
        await this.syncProductMedia(id, normalizedMedia, execClient);
      }

      return mapRowToProduct(result.rows[0]);
    };

    if (client) {
      return executeUpdate(client);
    }

    if (data.media !== undefined) {
      return withTransaction(this.getPool(), async (txClient) => {
        return executeUpdate(txClient);
      });
    }

    const db = this.getClient();
    return executeUpdate(db);
  }

  /**
   * Deletes a product by its ID.
   *
   * - Validates ID format.
   * - Uses RETURNING to return the deleted record.
   * - Returns null if the record was not found.
   * - Relies on `ON DELETE CASCADE` for `product_media`.
   * - Foreign key constraints on orders/inventory raise 23503 and propagate to caller.
   */
  public async deleteById(
    id: string,
    client?: IDbClient
  ): Promise<ProductRecord | null> {
    assertValidEntityId(id, "product id");
    const db = this.getClient(client);

    const sql = `
      DELETE FROM products
      WHERE id = $1
      RETURNING ${PRODUCT_SELECT_FIELDS};
    `;

    const result = await db.query<ProductDbRow>(sql, [id]);
    if (result.rowCount === 0 || !result.rows[0]) {
      return null;
    }
    return mapRowToProduct(result.rows[0]);
  }

  /**
   * Atomically adjusts the stock of a product by delta.
   *
   * - Validates ID format and ensures delta is an integer.
   * - Positive delta increases stock.
   * - Negative delta decreases stock only if `stock >= |delta|`, preventing negative inventory.
   * - Returns the updated product record.
   * - Throws AppError 404 if product not found.
   * - Throws AppError 400 if insufficient stock.
   */
  public async adjustStock(
    id: string,
    delta: number,
    client?: IDbClient
  ): Promise<ProductRecord> {
    assertValidEntityId(id, "product id");
    if (!Number.isInteger(delta)) {
      throw Object.assign(new Error("Stock delta must be an integer"), { statusCode: 400 });
    }

    const db = this.getClient(client);

    if (delta === 0) {
      const existing = await this.findById(id, client);
      if (!existing) {
        throw new AppError(`Product not found (ID: ${id})`, 404);
      }
      return existing;
    }

    if (delta > 0) {
      const sql = `
        UPDATE products
        SET stock = stock + $1, updated_at = NOW()
        WHERE id = $2
        RETURNING ${PRODUCT_SELECT_FIELDS};
      `;
      const result = await db.query<ProductDbRow>(sql, [delta, id]);
      if (result.rowCount === 0 || !result.rows[0]) {
        throw new AppError(`Product not found (ID: ${id})`, 404);
      }
      return mapRowToProduct(result.rows[0]);
    }

    // delta < 0: atomic conditional decrement
    const qty = Math.abs(delta);
    const sql = `
      UPDATE products
      SET stock = stock - $1, updated_at = NOW()
      WHERE id = $2 AND stock >= $1
      RETURNING ${PRODUCT_SELECT_FIELDS};
    `;
    const result = await db.query<ProductDbRow>(sql, [qty, id]);

    if (result.rowCount === 0 || !result.rows[0]) {
      // Query to determine if product is missing or stock is insufficient
      const checkSql = `SELECT id, stock, sku FROM products WHERE id = $1;`;
      const checkResult = await db.query<{ id: string; stock: number; sku: string }>(checkSql, [id]);

      if (checkResult.rowCount === 0 || !checkResult.rows[0]) {
        throw new AppError(`Product not found (ID: ${id})`, 404);
      }

      const currentStock = Number(checkResult.rows[0].stock ?? 0);
      throw new AppError(
        `Insufficient stock for product "${checkResult.rows[0].sku}". Available: ${currentStock}, requested reduction: ${qty}.`,
        400
      );
    }

    return mapRowToProduct(result.rows[0]);
  }
}

/** Shared singleton instance for dependency injection across services. */
export const postgresProductRepository = new PostgresProductRepository();
