import { AppError } from "../middleware/errorHandler.js";
import { toSlug, isValidEntityId } from "../utils/helpers.js";
import {
  PostgresCategoryRepository,
  postgresCategoryRepository,
  CategoryRecord,
  CategoryFilterOptions,
  UpdateCategoryData,
} from "../repositories/postgres-category.repository.js";
import { PostgresDatabase, withTransaction } from "../db/postgres.js";
import { IDbPool } from "../types/database.types.js";
import type { z } from "zod";
import type {
  createCategorySchema,
  updateCategorySchema,
} from "../validators/catalog.validators.js";

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;

/** Alias preserved for backward compatibility with existing consumers. */
export type CategoryLean = CategoryRecord;

// Default dependencies (can be overridden for unit testing)
let activeRepository: PostgresCategoryRepository = postgresCategoryRepository;
let activePool: IDbPool | null = null;

function getPool(): IDbPool {
  return activePool ?? PostgresDatabase.getPool();
}

/** Allows overriding the repository instance for isolated unit tests. */
export function setCategoryRepository(repo: PostgresCategoryRepository): void {
  activeRepository = repo;
}

/** Allows overriding the database pool for isolated unit tests. */
export function setCategoryDatabasePool(pool: IDbPool | null): void {
  activePool = pool;
}

/**
 * Lists categories matching optional filter criteria, sorted by sort_order and name.
 */
export async function listCategories(
  filters: {
    active?: boolean;
    menu?: boolean;
    productType?: string;
    parentId?: string;
  },
  repo: PostgresCategoryRepository = activeRepository
): Promise<CategoryRecord[]> {
  const repoFilters: CategoryFilterOptions = {};

  if (filters.active !== undefined) repoFilters.active = filters.active;
  if (filters.menu !== undefined) repoFilters.menu = filters.menu;
  if (filters.productType) repoFilters.productType = filters.productType;
  if (filters.parentId === "null" || filters.parentId === "") {
    repoFilters.parentId = null;
  } else if (filters.parentId) {
    repoFilters.parentId = filters.parentId;
  }

  return repo.findAll(repoFilters);
}

/**
 * Retrieves a category by its ID. Throws 400 if ID is invalid, 404 if not found.
 */
export async function getCategoryById(
  id: string,
  repo: PostgresCategoryRepository = activeRepository
): Promise<CategoryRecord> {
  if (!isValidEntityId(id)) {
    throw new AppError("Invalid category id", 400);
  }
  const category = await repo.findById(id);
  if (!category) throw new AppError("Category not found", 404);
  return category;
}

/**
 * Retrieves a category by its slug. Throws 404 if not found.
 */
export async function getCategoryBySlug(
  slug: string,
  repo: PostgresCategoryRepository = activeRepository
): Promise<CategoryRecord> {
  if (!slug || typeof slug !== "string" || slug.trim() === "") {
    throw new AppError("Category not found", 404);
  }
  const category = await repo.findBySlug(slug);
  if (!category) throw new AppError("Category not found", 404);
  return category;
}

/**
 * Creates a new category. Validates slug uniqueness (409) and parentId format (400).
 */
export async function createCategory(
  input: CreateCategoryInput,
  repo: PostgresCategoryRepository = activeRepository
): Promise<CategoryRecord> {
  const slug = input.slug ? toSlug(input.slug) : toSlug(input.name);

  const existing = await repo.existsBySlug(slug);
  if (existing) throw new AppError("Category slug already exists", 409);

  if (input.parentId) {
    if (!isValidEntityId(input.parentId)) {
      throw new AppError("Invalid parent category id", 400);
    }
    const parent = await repo.findById(input.parentId);
    if (!parent) {
      throw new AppError("Parent category not found", 404);
    }
  }

  try {
    const category = await repo.create({
      ...input,
      slug,
      parentId: input.parentId || null,
    });
    return category;
  } catch (err: any) {
    if (err?.code === "23505") {
      throw new AppError("Category slug already exists", 409);
    }
    throw err;
  }
}

/**
 * Updates a category by ID.
 *
 * If customization fields are updated, synchronizes products' `is_customizable`
 * flag and `customization_configs` atomically within a PostgreSQL transaction.
 */
export async function updateCategory(
  id: string,
  input: UpdateCategoryInput,
  repo: PostgresCategoryRepository = activeRepository,
  pool: IDbPool = getPool()
): Promise<CategoryRecord> {
  if (!isValidEntityId(id)) throw new AppError("Invalid category id", 400);

  const updateData: UpdateCategoryData = { ...input };
  if (input.slug) {
    updateData.slug = toSlug(input.slug);
    const slugExists = await repo.existsBySlug(updateData.slug, id);
    if (slugExists) throw new AppError("Category slug already exists", 409);
  }
  if (input.parentId !== undefined) {
    if (input.parentId === id) {
      throw new AppError("A category cannot be its own parent", 400);
    }
    if (input.parentId) {
      if (!isValidEntityId(input.parentId)) {
        throw new AppError("Invalid parent category id", 400);
      }
      const parent = await repo.findById(input.parentId);
      if (!parent) {
        throw new AppError("Parent category not found", 404);
      }
      const descendantsOfId = typeof repo.getDescendantIds === "function"
        ? await repo.getDescendantIds(id)
        : [id];
      if (descendantsOfId.includes(input.parentId)) {
        throw new AppError("Circular category relationship detected: a category cannot be a descendant of itself", 400);
      }
    }
    updateData.parentId = input.parentId ? input.parentId : null;
  }

  // If customization fields are updated, synchronize related tables atomically
  if (input.customizationFields !== undefined) {
    return withTransaction(pool, async (client) => {
      const category = await repo.updateById(id, updateData, client);
      if (!category) throw new AppError("Category not found", 404);

      const hasFields = Boolean(
        input.customizationFields && input.customizationFields.length > 0
      );

      // If a category has its customization completely removed, disable isCustomizable for its products.
      if (!hasFields) {
        await client.query(
          "UPDATE products SET is_customizable = false WHERE category_id = $1;",
          [id]
        );
      }

      // Synchronize CustomizationConfig in PostgreSQL
      const configCheck = await client.query<{ id: string }>(
        "SELECT id FROM customization_configs WHERE category_id = $1 LIMIT 1;",
        [id]
      );

      if (configCheck.rowCount && configCheck.rowCount > 0) {
        await client.query(
          `UPDATE customization_configs
           SET name = $1,
               product_type = $2,
               fields = $3::jsonb,
               is_active = $4,
               updated_at = NOW()
           WHERE category_id = $5;`,
          [
            `${category.name} Configurator`,
            category.productType,
            JSON.stringify(input.customizationFields),
            hasFields,
            id,
          ]
        );
      } else {
        await client.query(
          `INSERT INTO customization_configs (
             name, product_type, category_id, fields, is_active
           ) VALUES ($1, $2, $3, $4::jsonb, $5);`,
          [
            `${category.name} Configurator`,
            category.productType,
            id,
            JSON.stringify(input.customizationFields),
            hasFields,
          ]
        );
      }

      return category;
    });
  }

  const category = await repo.updateById(id, updateData);
  if (!category) throw new AppError("Category not found", 404);
  return category;
}

/**
 * Deletes a category by ID.
 *
 * Enforces:
 * 1. Valid ID format (400)
 * 2. Cannot delete category with child categories (400)
 * 3. Cannot delete category referenced by products (400)
 * 4. 404 if category does not exist
 */
export async function deleteCategory(
  id: string,
  repo: PostgresCategoryRepository = activeRepository,
  pool: IDbPool = getPool()
): Promise<void> {
  if (!isValidEntityId(id)) throw new AppError("Invalid category id", 400);

  // 1. Check child categories
  const childCount = await repo.countByParentId(id);
  if (childCount > 0) {
    throw new AppError("Cannot delete category with subcategories", 400);
  }

  // 2. Check referencing products (enforcing foreign key integrity)
  const productCheck = await pool.query<{ count: number }>(
    `SELECT COUNT(*)::int AS count FROM products WHERE category_id = $1;`,
    [id]
  );
  if (Number(productCheck.rows[0]?.count ?? 0) > 0) {
    throw new AppError("Cannot delete category referenced by products", 400);
  }

  // 3. Delete category
  const result = await repo.deleteById(id);
  if (!result) throw new AppError("Category not found", 404);
}

/**
 * Retrieves all descendant category IDs (including the target category itself).
 */
export async function getCategoryDescendantIds(
  id: string,
  repo: PostgresCategoryRepository = activeRepository
): Promise<string[]> {
  if (!isValidEntityId(id)) throw new AppError("Invalid category id", 400);
  if (typeof repo.getDescendantIds === "function") {
    return repo.getDescendantIds(id);
  }
  return [id];
}
