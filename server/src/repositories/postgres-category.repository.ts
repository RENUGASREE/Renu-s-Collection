/**
 * ============================================================================
 * PostgreSQL Category Repository (Phase 3B-2)
 * ============================================================================
 *
 * Provides typed, parameterized read operations for category data stored in
 * the Supabase PostgreSQL `categories` table.
 *
 * Adheres strictly to:
 * - Parameterized SQL queries (preventing SQL injection).
 * - Safe identifier validation (24-char hex ObjectId or 36-char canonical UUID).
 * - Shared PostgreSQL connection pooling via `PostgresDatabase`.
 * - Zero Mongoose dependencies.
 * - Backward-compatible property mapping (both `id` and `_id` populated).
 */

import { IDbClient } from "../types/database.types.js";
import { PostgresDatabase } from "../db/postgres.js";
import { assertValidEntityId } from "../utils/helpers.js";

/** Raw row format returned directly by PostgreSQL query on `categories` table. */
export interface CategoryDbRow {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  parent_id: string | null;
  product_type: string;
  image_url: string | null;
  is_active: boolean;
  show_in_menu: boolean;
  sort_order: number;
  customization_fields: any;
  seo_title: string | null;
  seo_description: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

/** Strongly-typed domain entity for a category. */
export interface CategoryRecord {
  id: string;
  /** Preserved for backward-compatibility with existing templates/contracts expecting `_id`. */
  _id: string;
  name: string;
  slug: string;
  description: string | null;
  parentId: string | null;
  productType: string;
  imageUrl: string | null;
  isActive: boolean;
  showInMenu: boolean;
  sortOrder: number;
  customizationFields: any[];
  seoTitle: string | null;
  seoDescription: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Filtering options for listing categories, matching existing API query parameters. */
export interface CategoryFilterOptions {
  active?: boolean;
  menu?: boolean;
  productType?: string;
  parentId?: string | null;
}

/** Data required to insert a new category record. */
export interface CreateCategoryData {
  id?: string;
  name: string;
  slug: string;
  description?: string | null;
  parentId?: string | null;
  productType: string;
  imageUrl?: string | null;
  isActive?: boolean;
  showInMenu?: boolean;
  sortOrder?: number;
  customizationFields?: any[];
  seoTitle?: string | null;
  seoDescription?: string | null;
}

/** Fields that may be updated on an existing category record. */
export interface UpdateCategoryData {
  name?: string;
  slug?: string;
  description?: string | null;
  parentId?: string | null;
  productType?: string;
  imageUrl?: string | null;
  isActive?: boolean;
  showInMenu?: boolean;
  sortOrder?: number;
  customizationFields?: any[];
  seoTitle?: string | null;
  seoDescription?: string | null;
}

/** Strict allowlist mapping domain property names to SQL column names. */
export const ALLOWED_CATEGORY_UPDATE_COLUMNS: Readonly<Record<string, string>> = Object.freeze({
  name: "name",
  slug: "slug",
  description: "description",
  parentId: "parent_id",
  productType: "product_type",
  imageUrl: "image_url",
  isActive: "is_active",
  showInMenu: "show_in_menu",
  sortOrder: "sort_order",
  customizationFields: "customization_fields",
  seoTitle: "seo_title",
  seoDescription: "seo_description",
});

/**
 * Maps a raw PostgreSQL database row to a typed `CategoryRecord`.
 * Handles nullables, JSON parsing, and camelCase conversion.
 */
export function mapRowToCategory(row: CategoryDbRow): CategoryRecord {
  let customizationFields: any[] = [];
  if (Array.isArray(row.customization_fields)) {
    customizationFields = row.customization_fields;
  } else if (typeof row.customization_fields === "string") {
    try {
      customizationFields = JSON.parse(row.customization_fields);
    } catch {
      customizationFields = [];
    }
  } else if (row.customization_fields && typeof row.customization_fields === "object") {
    customizationFields = [row.customization_fields];
  }

  return {
    id: row.id,
    _id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description ?? null,
    parentId: row.parent_id ?? null,
    productType: row.product_type,
    imageUrl: row.image_url ?? null,
    isActive: Boolean(row.is_active),
    showInMenu: Boolean(row.show_in_menu),
    sortOrder: Number(row.sort_order ?? 0),
    customizationFields,
    seoTitle: row.seo_title ?? null,
    seoDescription: row.seo_description ?? null,
    createdAt: row.created_at instanceof Date ? row.created_at : new Date(row.created_at),
    updatedAt: row.updated_at instanceof Date ? row.updated_at : new Date(row.updated_at),
  };
}

const CATEGORY_SELECT_FIELDS = `
  id,
  name,
  slug,
  description,
  parent_id,
  product_type,
  image_url,
  is_active,
  show_in_menu,
  sort_order,
  customization_fields,
  seo_title,
  seo_description,
  created_at,
  updated_at
`;

export class PostgresCategoryRepository {
  constructor(private readonly defaultClient?: IDbClient) {}

  private getClient(overrideClient?: IDbClient): IDbClient {
    return overrideClient ?? this.defaultClient ?? PostgresDatabase.getPool();
  }

  /**
   * Retrieves categories matching optional filter criteria.
   * Orders by `sort_order ASC, name ASC` to preserve application ordering semantics.
   */
  public async findAll(
    filters?: CategoryFilterOptions,
    client?: IDbClient
  ): Promise<CategoryRecord[]> {
    const db = this.getClient(client);
    const conditions: string[] = [];
    const params: any[] = [];

    if (filters?.active !== undefined) {
      params.push(filters.active);
      conditions.push(`is_active = $${params.length}`);
    }

    if (filters?.menu !== undefined) {
      params.push(filters.menu);
      conditions.push(`show_in_menu = $${params.length}`);
    }

    if (filters?.productType) {
      params.push(filters.productType);
      conditions.push(`product_type = $${params.length}`);
    }

    if (filters?.parentId === "null" || filters?.parentId === "" || filters?.parentId === null) {
      conditions.push(`parent_id IS NULL`);
    } else if (filters?.parentId) {
      assertValidEntityId(filters.parentId, "parent category id");
      params.push(filters.parentId);
      conditions.push(`parent_id = $${params.length}`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const sql = `
      SELECT ${CATEGORY_SELECT_FIELDS}
      FROM categories
      ${whereClause}
      ORDER BY sort_order ASC, name ASC;
    `;

    const result = await db.query<CategoryDbRow>(sql, params);
    return result.rows.map(mapRowToCategory);
  }

  /**
   * Convenience helper to retrieve only active categories.
   */
  public async findActive(client?: IDbClient): Promise<CategoryRecord[]> {
    return this.findAll({ active: true }, client);
  }

  /**
   * Retrieves a single category by its ID.
   * Throws 400 if ID is invalid format; returns null if category not found.
   */
  public async findById(id: string, client?: IDbClient): Promise<CategoryRecord | null> {
    assertValidEntityId(id, "category id");
    const db = this.getClient(client);

    const sql = `
      SELECT ${CATEGORY_SELECT_FIELDS}
      FROM categories
      WHERE id = $1
      LIMIT 1;
    `;

    const result = await db.query<CategoryDbRow>(sql, [id]);
    if (result.rowCount === 0 || !result.rows[0]) {
      return null;
    }
    return mapRowToCategory(result.rows[0]);
  }

  /**
   * Retrieves a single category by its slug (case-insensitive).
   * Returns null if category not found or slug is empty.
   */
  public async findBySlug(slug: string, client?: IDbClient): Promise<CategoryRecord | null> {
    if (!slug || typeof slug !== "string" || slug.trim() === "") {
      return null;
    }
    const normalizedSlug = slug.trim().toLowerCase();
    const db = this.getClient(client);

    const sql = `
      SELECT ${CATEGORY_SELECT_FIELDS}
      FROM categories
      WHERE LOWER(slug) = $1
      LIMIT 1;
    `;

    const result = await db.query<CategoryDbRow>(sql, [normalizedSlug]);
    if (result.rowCount === 0 || !result.rows[0]) {
      return null;
    }
    return mapRowToCategory(result.rows[0]);
  }

  /**
   * Counts child categories belonging to a parent category.
   * Used to check if a category can safely be deleted.
   */
  public async countByParentId(parentId: string, client?: IDbClient): Promise<number> {
    assertValidEntityId(parentId, "parent category id");
    const db = this.getClient(client);

    const sql = `SELECT COUNT(*)::int AS count FROM categories WHERE parent_id = $1;`;
    const result = await db.query<{ count: number }>(sql, [parentId]);
    return Number(result.rows[0]?.count ?? 0);
  }

  /**
   * Inserts a new category record into PostgreSQL.
   *
   * - Validates IDs if provided (preserving explicit IDs for migrations/tests).
   * - Omits `id` column if not provided, allowing PostgreSQL's DEFAULT (gen_random_uuid) to generate it.
   * - Uses parameterized SQL exclusively.
   * - Uses RETURNING to return the created entity.
   */
  public async create(
    data: CreateCategoryData,
    client?: IDbClient
  ): Promise<CategoryRecord> {
    if (data.id) {
      assertValidEntityId(data.id, "category id");
    }
    if (data.parentId) {
      assertValidEntityId(data.parentId, "parent category id");
    }

    const db = this.getClient(client);
    const normalizedSlug = data.slug.trim().toLowerCase();
    const columns: string[] = [];
    const placeholders: string[] = [];
    const params: any[] = [];

    const addField = (column: string, value: any) => {
      columns.push(column);
      params.push(value);
      placeholders.push(`$${params.length}`);
    };

    if (data.id) {
      addField("id", data.id);
    }
    addField("name", data.name.trim());
    addField("slug", normalizedSlug);
    addField("product_type", data.productType);
    addField("description", data.description ?? null);
    addField("parent_id", data.parentId ?? null);
    addField("image_url", data.imageUrl ?? null);
    addField("is_active", data.isActive ?? true);
    addField("show_in_menu", data.showInMenu ?? true);
    addField("sort_order", data.sortOrder ?? 0);
    addField("customization_fields", JSON.stringify(data.customizationFields ?? []));
    addField("seo_title", data.seoTitle ?? null);
    addField("seo_description", data.seoDescription ?? null);

    const sql = `
      INSERT INTO categories (${columns.join(", ")})
      VALUES (${placeholders.join(", ")})
      RETURNING ${CATEGORY_SELECT_FIELDS};
    `;

    const result = await db.query<CategoryDbRow>(sql, params);
    return mapRowToCategory(result.rows[0]);
  }

  /**
   * Updates an existing category by ID with strict column allowlisting.
   *
   * - Validates ID format.
   * - Rejects any unsupported fields not in the strict ALLOWED_CATEGORY_UPDATE_COLUMNS allowlist.
   * - Automatically updates `updated_at = NOW()`.
   * - Uses RETURNING to return the updated record.
   * - Returns null if the category does not exist.
   */
  public async updateById(
    id: string,
    data: UpdateCategoryData,
    client?: IDbClient
  ): Promise<CategoryRecord | null> {
    assertValidEntityId(id, "category id");

    // Strict allowlist validation — reject unsupported fields
    for (const key of Object.keys(data)) {
      if (!(key in ALLOWED_CATEGORY_UPDATE_COLUMNS)) {
        throw new Error(`Unsupported update field: "${key}"`);
      }
    }

    if (data.parentId !== undefined && data.parentId !== null) {
      assertValidEntityId(data.parentId, "parent category id");
    }

    const db = this.getClient(client);
    const setClauses: string[] = [];
    const params: any[] = [];

    const addSet = (column: string, value: any) => {
      params.push(value);
      setClauses.push(`${column} = $${params.length}`);
    };

    if (data.name !== undefined) addSet("name", data.name.trim());
    if (data.slug !== undefined) addSet("slug", data.slug.trim().toLowerCase());
    if (data.description !== undefined) addSet("description", data.description);
    if (data.parentId !== undefined) addSet("parent_id", data.parentId);
    if (data.productType !== undefined) addSet("product_type", data.productType);
    if (data.imageUrl !== undefined) addSet("image_url", data.imageUrl);
    if (data.isActive !== undefined) addSet("is_active", data.isActive);
    if (data.showInMenu !== undefined) addSet("show_in_menu", data.showInMenu);
    if (data.sortOrder !== undefined) addSet("sort_order", data.sortOrder);
    if (data.customizationFields !== undefined) {
      addSet("customization_fields", JSON.stringify(data.customizationFields));
    }
    if (data.seoTitle !== undefined) addSet("seo_title", data.seoTitle);
    if (data.seoDescription !== undefined) addSet("seo_description", data.seoDescription);

    // Always bump updated_at timestamp
    setClauses.push("updated_at = NOW()");

    params.push(id);
    const idParamIndex = params.length;

    const sql = `
      UPDATE categories
      SET ${setClauses.join(", ")}
      WHERE id = $${idParamIndex}
      RETURNING ${CATEGORY_SELECT_FIELDS};
    `;

    const result = await db.query<CategoryDbRow>(sql, params);
    if (result.rowCount === 0 || !result.rows[0]) {
      return null;
    }
    return mapRowToCategory(result.rows[0]);
  }

  /**
   * Deletes a category by its ID.
   *
   * - Validates ID format.
   * - Uses RETURNING to return the deleted record.
   * - Returns null if the record was not found.
   * - Respects existing foreign-key constraints (e.g. products referencing category raise 23503).
   */
  public async deleteById(
    id: string,
    client?: IDbClient
  ): Promise<CategoryRecord | null> {
    assertValidEntityId(id, "category id");
    const db = this.getClient(client);

    const sql = `
      DELETE FROM categories
      WHERE id = $1
      RETURNING ${CATEGORY_SELECT_FIELDS};
    `;

    const result = await db.query<CategoryDbRow>(sql, [id]);
    if (result.rowCount === 0 || !result.rows[0]) {
      return null;
    }
    return mapRowToCategory(result.rows[0]);
  }

  /**
   * Checks whether a category with the given slug exists, optionally excluding a specific ID.
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
      assertValidEntityId(excludeId, "exclude category id");
      const sql = `SELECT 1 FROM categories WHERE LOWER(slug) = $1 AND id != $2 LIMIT 1;`;
      const result = await db.query(sql, [normalizedSlug, excludeId]);
      return result.rowCount > 0;
    }

    const sql = `SELECT 1 FROM categories WHERE LOWER(slug) = $1 LIMIT 1;`;
    const result = await db.query(sql, [normalizedSlug]);
    return result.rowCount > 0;
  }
}

/** Shared singleton instance for dependency injection across services. */
export const postgresCategoryRepository = new PostgresCategoryRepository();
