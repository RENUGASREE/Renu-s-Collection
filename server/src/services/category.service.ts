import { FilterQuery, Types, FlattenMaps } from "mongoose";
import { Category, ICategory } from "../models/Category.js";
import { AppError } from "../middleware/errorHandler.js";
import { toSlug } from "../utils/helpers.js";
import type { z } from "zod";
import type { createCategorySchema, updateCategorySchema } from "../validators/catalog.validators.js";

type CreateCategoryInput = z.infer<typeof createCategorySchema>;
type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
type CategoryLean = FlattenMaps<ICategory> & { _id: Types.ObjectId };

export async function listCategories(filters: {
  active?: boolean;
  menu?: boolean;
  productType?: string;
  parentId?: string;
}): Promise<CategoryLean[]> {
  const query: FilterQuery<ICategory> = {};

  if (filters.active !== undefined) query.isActive = filters.active;
  if (filters.menu !== undefined) query.showInMenu = filters.menu;
  if (filters.productType) query.productType = filters.productType;
  if (filters.parentId === "null" || filters.parentId === "") {
    query.parentId = null;
  } else if (filters.parentId) {
    query.parentId = new Types.ObjectId(filters.parentId);
  }

  return Category.find(query).sort({ sortOrder: 1, name: 1 }).lean();
}

export async function getCategoryById(id: string): Promise<CategoryLean> {
  if (!Types.ObjectId.isValid(id)) {
    throw new AppError("Invalid category id", 400);
  }
  const category = await Category.findById(id).lean();
  if (!category) throw new AppError("Category not found", 404);
  return category;
}

export async function getCategoryBySlug(slug: string): Promise<CategoryLean> {
  const category = await Category.findOne({ slug: slug.toLowerCase() }).lean();
  if (!category) throw new AppError("Category not found", 404);
  return category;
}

export async function createCategory(input: CreateCategoryInput): Promise<CategoryLean> {
  const slug = input.slug ? toSlug(input.slug) : toSlug(input.name);

  const existing = await Category.findOne({ slug });
  if (existing) throw new AppError("Category slug already exists", 409);

  const category = await Category.create({
    ...input,
    slug,
    parentId: input.parentId ? new Types.ObjectId(input.parentId) : null,
  });

  return category.toObject() as CategoryLean;
}

export async function updateCategory(id: string, input: UpdateCategoryInput): Promise<CategoryLean> {
  if (!Types.ObjectId.isValid(id)) throw new AppError("Invalid category id", 400);

  const update: Record<string, unknown> = { ...input };
  if (input.slug) update.slug = toSlug(input.slug);
  if (input.parentId !== undefined) {
    update.parentId = input.parentId ? new Types.ObjectId(input.parentId) : null;
  }

  const category = await Category.findByIdAndUpdate(id, update, {
    new: true,
    runValidators: true,
  }).lean();

  if (!category) throw new AppError("Category not found", 404);

  // If customization fields were updated, synchronize CustomizationConfig and Product isCustomizable flag
  if (input.customizationFields !== undefined) {
    const hasFields = Boolean(input.customizationFields && input.customizationFields.length > 0);
    const { Product } = await import("../models/Product.js");
    const { CustomizationConfig } = await import("../models/CustomizationConfig.js");

    // Synchronize isCustomizable flag across all products in this category
    await Product.updateMany(
      { categoryId: new Types.ObjectId(id) },
      { isCustomizable: hasFields }
    );

    // Keep CustomizationConfig in sync
    await CustomizationConfig.findOneAndUpdate(
      { categoryId: new Types.ObjectId(id) },
      {
        name: `${category.name} Configurator`,
        productType: category.productType,
        categoryId: category._id,
        fields: input.customizationFields as any,
        isActive: hasFields,
      },
      { upsert: true, new: true }
    );
  }

  return category;
}

export async function deleteCategory(id: string): Promise<void> {
  if (!Types.ObjectId.isValid(id)) throw new AppError("Invalid category id", 400);

  const childCount = await Category.countDocuments({ parentId: id });
  if (childCount > 0) {
    throw new AppError("Cannot delete category with subcategories", 400);
  }

  const result = await Category.findByIdAndDelete(id);
  if (!result) throw new AppError("Category not found", 404);
}
