/**
 * ============================================================================
 * Product Type Service
 * ============================================================================
 *
 * Business logic for Product Types in the Product Catalogue.
 * Handles validation, unique constraints, and category usage guards.
 */

import { AppError } from "../middleware/errorHandler.js";
import {
  PostgresProductTypeRepository,
  postgresProductTypeRepository,
} from "../repositories/postgres-product-type.repository.js";
import {
  IProductTypeRecord,
  ICreateProductTypeData,
  IUpdateProductTypeData,
  IDbClient,
} from "../types/database.types.js";
import { toSlug, assertValidEntityId } from "../utils/helpers.js";

let activeProductTypeRepository: PostgresProductTypeRepository = postgresProductTypeRepository;

export function setProductTypeRepository(repo: PostgresProductTypeRepository): void {
  activeProductTypeRepository = repo;
}

export async function listProductTypes(
  options: { activeOnly?: boolean } = {},
  repo: PostgresProductTypeRepository = activeProductTypeRepository,
  client?: IDbClient
): Promise<IProductTypeRecord[]> {
  return repo.findAll(options, client);
}

export async function getProductTypeById(
  id: string,
  repo: PostgresProductTypeRepository = activeProductTypeRepository,
  client?: IDbClient
): Promise<IProductTypeRecord> {
  assertValidEntityId(id);
  const pt = await repo.findById(id, client);
  if (!pt) {
    throw new AppError("Product type not found", 404);
  }
  return pt;
}

export async function getProductTypeBySlug(
  slug: string,
  repo: PostgresProductTypeRepository = activeProductTypeRepository,
  client?: IDbClient
): Promise<IProductTypeRecord> {
  if (!slug || typeof slug !== "string" || !slug.trim()) {
    throw new AppError("Product type slug is required", 400);
  }
  const pt = await repo.findBySlug(slug.trim(), client);
  if (!pt) {
    throw new AppError("Product type not found", 404);
  }
  return pt;
}

export async function createProductType(
  data: ICreateProductTypeData,
  repo: PostgresProductTypeRepository = activeProductTypeRepository,
  client?: IDbClient
): Promise<IProductTypeRecord> {
  const trimmedName = data.name.trim();
  if (!trimmedName) {
    throw new AppError("Product type name is required", 400);
  }

  const slug = data.slug && data.slug.trim() ? toSlug(data.slug) : toSlug(trimmedName);

  // Check unique name (case-insensitive)
  const nameExists = await repo.existsByName(trimmedName, undefined, client);
  if (nameExists) {
    throw new AppError(`Product type with name "${trimmedName}" already exists`, 409);
  }

  // Check unique slug (case-insensitive)
  const slugExists = await repo.existsBySlug(slug, undefined, client);
  if (slugExists) {
    throw new AppError(`Product type with slug "${slug}" already exists`, 409);
  }

  return repo.create(
    {
      ...data,
      name: trimmedName,
      slug,
      displayOrder: data.displayOrder ?? 0,
      isActive: data.isActive ?? true,
    },
    client
  );
}

export async function updateProductType(
  id: string,
  data: IUpdateProductTypeData,
  repo: PostgresProductTypeRepository = activeProductTypeRepository,
  client?: IDbClient
): Promise<IProductTypeRecord> {
  assertValidEntityId(id);
  const existing = await repo.findById(id, client);
  if (!existing) {
    throw new AppError("Product type not found", 404);
  }

  const updates: IUpdateProductTypeData = {};

  if (data.name !== undefined) {
    const trimmedName = data.name.trim();
    if (!trimmedName) {
      throw new AppError("Product type name cannot be blank", 400);
    }
    const nameExists = await repo.existsByName(trimmedName, id, client);
    if (nameExists) {
      throw new AppError(`Product type with name "${trimmedName}" already exists`, 409);
    }
    updates.name = trimmedName;
  }

  if (data.slug !== undefined) {
    const trimmedSlug = toSlug(data.slug);
    if (!trimmedSlug) {
      throw new AppError("Product type slug cannot be blank", 400);
    }
    const slugExists = await repo.existsBySlug(trimmedSlug, id, client);
    if (slugExists) {
      throw new AppError(`Product type with slug "${trimmedSlug}" already exists`, 409);
    }
    updates.slug = trimmedSlug;
  }

  if (data.description !== undefined) {
    updates.description = data.description;
  }
  if (data.displayOrder !== undefined) {
    updates.displayOrder = data.displayOrder;
  }
  if (data.isActive !== undefined) {
    updates.isActive = data.isActive;
  }

  const updated = await repo.update(id, updates, client);
  if (!updated) {
    throw new AppError("Failed to update product type", 500);
  }
  return updated;
}

export async function deleteProductType(
  id: string,
  repo: PostgresProductTypeRepository = activeProductTypeRepository,
  client?: IDbClient
): Promise<{ success: boolean; message: string }> {
  assertValidEntityId(id);
  const existing = await repo.findById(id, client);
  if (!existing) {
    throw new AppError("Product type not found", 404);
  }

  // Safety check: is this product type currently assigned to any categories?
  const usageCount = await repo.countCategoriesUsingSlug(existing.slug, client);
  if (usageCount > 0) {
    throw new AppError(
      `Cannot delete product type "${existing.name}" because it is currently assigned to ${usageCount} category/categories. You may deactivate it instead to hide it from new categories.`,
      400
    );
  }

  const deleted = await repo.delete(id, client);
  if (!deleted) {
    throw new AppError("Failed to delete product type", 500);
  }

  return { success: true, message: `Product type "${existing.name}" deleted successfully.` };
}
