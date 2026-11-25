/**
 * ============================================================================
 * Customization Service (Phase 3H)
 * ============================================================================
 *
 * Implements product customization resolution, option filtering, live variant
 * stock synchronization, price calculation, validation, preview generation,
 * and cart integration for customizable items in Supabase PostgreSQL.
 *
 * Adheres strictly to:
 * - PostgreSQL repositories (`PostgresProductRepository`, `PostgresCategoryRepository`, `PostgresStudioRepository`).
 * - Zero direct Mongoose database queries.
 * - Dynamic option filtering: displays only active and in-stock variants.
 * - Compatibility with legacy contracts and templates.
 */

import { PostgresProductRepository } from "../repositories/postgres-product.repository.js";
import { PostgresCategoryRepository } from "../repositories/postgres-category.repository.js";
import { PostgresStudioRepository } from "../repositories/postgres-studio.repository.js";
import { AppError } from "../middleware/errorHandler.js";
import { IDbClient } from "../types/database.types.js";

const PLACEHOLDER =
  "https://placehold.co/600x600/FF0066/FFFFFF?text=Reyan+Luxe+Preview";

let defaultProductRepo = new PostgresProductRepository();
let defaultCategoryRepo = new PostgresCategoryRepository();
let defaultStudioRepo = new PostgresStudioRepository();

export function setCustomizationProductRepository(repo: PostgresProductRepository): void {
  defaultProductRepo = repo;
}

export function setCustomizationCategoryRepository(repo: PostgresCategoryRepository): void {
  defaultCategoryRepo = repo;
}

export function setCustomizationStudioRepository(repo: PostgresStudioRepository): void {
  defaultStudioRepo = repo;
}

export interface ICustomizationOption {
  value: string;
  label: string;
  priceModifier?: number;
  imageUrl?: string;
  variantSku?: string;
  materialId?: string;
  inStock?: boolean;
  stock?: number;
}

export interface ICustomizationField {
  key: string;
  label: string;
  type: string;
  required: boolean;
  options?: ICustomizationOption[];
  sortOrder?: number;
}

export const customizationService = {
  getProductCustomization,
  calculatePrice,
  validateCustomization,
  generatePreview,
  resolveProductCustomization,
  getCustomizationOptions,
};

function isCharmField(f: { key?: string; label?: string }): boolean {
  const k = (f.key || "").toLowerCase().trim();
  const l = (f.label || "").toLowerCase().trim();
  return (
    k === "charm" ||
    k === "charms" ||
    k === "choose_charm" ||
    k === "chooseyourcharm" ||
    l === "charm" ||
    l === "charms" ||
    l === "choose your charm" ||
    l.includes("charm")
  );
}

function fieldsMatch(f1: { key?: string; label?: string }, f2: { key?: string; label?: string }): boolean {
  const k1 = (f1.key || "").toLowerCase().trim();
  const k2 = (f2.key || "").toLowerCase().trim();
  const l1 = (f1.label || "").toLowerCase().trim();
  const l2 = (f2.label || "").toLowerCase().trim();

  if (k1 && k2 && k1 === k2) return true;
  if (l1 && l2 && l1 === l2) return true;
  if (isCharmField(f1) && isCharmField(f2)) return true;

  return false;
}

export function mergeCustomizationFields(
  baseFields: ICustomizationField[],
  categoryFields: ICustomizationField[]
): ICustomizationField[] {
  if (!categoryFields || categoryFields.length === 0) return baseFields || [];
  if (!baseFields || baseFields.length === 0) return categoryFields;

  const merged: ICustomizationField[] = [];
  const handledCategoryKeys = new Set<string>();

  for (const baseField of baseFields) {
    const overridingCatField = categoryFields.find((catF) => fieldsMatch(baseField, catF));
    if (overridingCatField) {
      merged.push(overridingCatField);
      handledCategoryKeys.add(overridingCatField.key);
    } else {
      merged.push(baseField);
    }
  }

  for (const catField of categoryFields) {
    if (!handledCategoryKeys.has(catField.key)) {
      const alreadyMerged = merged.some((m) => fieldsMatch(m, catField));
      if (!alreadyMerged) {
        merged.push(catField);
      }
    }
  }

  return merged;
}

export interface ResolvedCustomizationConfig {
  product: any;
  category: any;
  fields: ICustomizationField[];
  previewLayers: any[];
  config: any;
}

export async function resolveProductCustomization(
  productId: string,
  client?: IDbClient
): Promise<ResolvedCustomizationConfig> {
  const productRepo = defaultProductRepo;
  const categoryRepo = defaultCategoryRepo;
  const studioRepo = defaultStudioRepo;

  const product = await productRepo.findById(productId, client);
  if (!product) {
    throw new AppError("Product not found", 404);
  }

  const category = product.categoryId
    ? await categoryRepo.findById(product.categoryId, client)
    : null;

  // 1. Retrieve category-specific CustomizationConfig first
  const categoryConfig = product.categoryId
    ? await studioRepo.findCustomizationConfig({
        categoryId: product.categoryId,
        isActive: true,
      }, client)
    : null;

  const categoryFields: ICustomizationField[] =
    (categoryConfig?.fields && categoryConfig.fields.length > 0
      ? categoryConfig.fields
      : category?.customizationFields) || [];

  // 2. Authoritative category-specific resolution
  if (categoryFields.length > 0) {
    return {
      product,
      category,
      fields: categoryFields,
      previewLayers: categoryConfig?.previewLayers || [],
      config: categoryConfig,
    };
  }

  // 3. Fallback: Base product-type configuration
  let baseConfig = null;
  if (category?.productType) {
    baseConfig = await studioRepo.findCustomizationConfig(
      {
        productType: category.productType,
        isActive: true,
      },
      client
    );
  }

  return {
    product,
    category,
    fields: baseConfig?.fields || [],
    previewLayers: baseConfig?.previewLayers || [],
    config: baseConfig,
  };
}

export async function getProductCustomization(productId: string, client?: IDbClient) {
  const { product, fields, previewLayers } = await resolveProductCustomization(productId, client);
  const studioRepo = defaultStudioRepo;

  // If product is not customizable, return empty customization config immediately
  if (!product.isCustomizable) {
    return {
      productId: product.id,
      productName: product.name,
      basePrice: product.salePrice ?? product.price ?? product.basePrice,
      fields: [],
      previewLayers: [],
      isCustomizable: false,
    };
  }

  // Gather all linked variant SKUs across fields
  const linkedSkus = new Set<string>();
  for (const field of fields) {
    for (const opt of (field.options || []) as any[]) {
      if (opt.variantSku) {
        linkedSkus.add(String(opt.variantSku).toUpperCase().trim());
      }
    }
  }

  // Fetch live stock and validity from StudioMaterial
  const variantMap = new Map<string, { inStock: boolean; stock: number; imageUrl?: string; materialName: string }>();
  if (linkedSkus.size > 0) {
    const materials = await studioRepo.findMaterialsBySkus(Array.from(linkedSkus), client);

    for (const mat of materials) {
      // Must be active and have bracelet_customization scope
      if (mat.isActive && (mat.visibilityScopes.includes("bracelet_customization") || mat.visibilityScopes.includes("studio"))) {
        for (const v of mat.variants || []) {
          const skuUpper = v.sku.toUpperCase();
          if (linkedSkus.has(skuUpper) && v.isActive) {
            variantMap.set(skuUpper, {
              inStock: typeof v.stock === "number" && v.stock > 0,
              stock: typeof v.stock === "number" ? v.stock : 0,
              imageUrl: mat.imageUrl || undefined,
              materialName: mat.name,
            });
          }
        }
      }
    }
  }

  // Filter and enrich options: only active, in-stock variants are returned
  const enrichedFields = fields.map((field: any) => {
    if (!field.options || field.options.length === 0) return field;

    const filteredOptions = field.options
      .map((opt: any) => {
        if (!opt.variantSku) {
          return {
            ...opt,
            inStock: true,
          };
        }

        const sku = String(opt.variantSku).toUpperCase().trim();
        const vInfo = variantMap.get(sku);

        if (!vInfo || !vInfo.inStock) {
          return {
            ...opt,
            inStock: false,
            stock: vInfo?.stock ?? 0,
          };
        }

        return {
          ...opt,
          inStock: true,
          stock: vInfo.stock,
          imageUrl: opt.imageUrl || vInfo.imageUrl,
          variantSku: sku,
          materialId: opt.materialId,
        };
      })
      .filter((opt: any) => opt.inStock);

    return {
      ...field,
      options: filteredOptions,
    };
  });

  return {
    productId: product.id,
    productName: product.name,
    basePrice: product.salePrice ?? product.price ?? product.basePrice,
    fields: enrichedFields.sort((a: any, b: any) => (a.sortOrder || 0) - (b.sortOrder || 0)),
    previewLayers,
    isCustomizable: product.isCustomizable,
  };
}

export async function calculatePrice(
  productId: string,
  selections: Record<string, string | string[]>,
  client?: IDbClient
) {
  const { product, fields } = await resolveProductCustomization(productId, client);

  const basePrice =
    product.salePrice && product.salePrice < (product.price ?? product.basePrice)
      ? product.salePrice
      : (product.price ?? product.basePrice);

  let priceModifier = 0;
  const breakdown: { field: string; option: string; modifier: number }[] = [];

  for (const field of fields) {
    const value = selections[field.key];
    if (value === undefined || value === null || value === "") continue;

    if (field.type === "text" || field.type === "number") {
      breakdown.push({
        field: field.label,
        option: String(value),
        modifier: 0,
      });
      continue;
    }

    const values = Array.isArray(value) ? value : [value];
    for (const v of values) {
      if (v === undefined || v === null || v === "") continue;
      const option = field.options?.find((o: { value: string; label: string; priceModifier?: number }) => {
        if (typeof v === "string") {
          return (
            o.value.trim().toLowerCase() === v.trim().toLowerCase() ||
            o.label.trim().toLowerCase() === v.trim().toLowerCase()
          );
        }
        return o.value === v || o.label === v;
      });

      if (option) {
        const mod = option.priceModifier || 0;
        priceModifier += mod;
        breakdown.push({
          field: field.label,
          option: option.label,
          modifier: mod,
        });
      } else {
        breakdown.push({
          field: field.label,
          option: String(v),
          modifier: 0,
        });
      }
    }
  }

  return {
    basePrice,
    priceModifier,
    totalPrice: basePrice + priceModifier,
    breakdown,
  };
}

export async function validateCustomization(
  productId: string,
  selections: Record<string, string | string[]>,
  client?: IDbClient
) {
  const { product, fields } = await resolveProductCustomization(productId, client);
  const studioRepo = defaultStudioRepo;

  if (!product.isCustomizable) {
    throw new AppError("This product is not customizable", 400);
  }

  const errors: string[] = [];
  const warnings: string[] = [];

  for (const field of fields) {
    const rawVal = selections[field.key];
    const hasValue =
      rawVal !== undefined &&
      rawVal !== null &&
      rawVal !== "" &&
      (!Array.isArray(rawVal) || rawVal.length > 0);

    if (field.required && !hasValue) {
      errors.push(`${field.label} is required`);
    }

    if (hasValue) {
      if (["select", "multiselect", "color"].includes(field.type)) {
        if (field.options && field.options.length > 0) {
          const values = Array.isArray(rawVal) ? rawVal : [rawVal];
          for (const v of values) {
            const option = field.options?.find((o: any) => {
              if (typeof v === "string") {
                return (
                  o.value.trim().toLowerCase() === v.trim().toLowerCase() ||
                  o.label.trim().toLowerCase() === v.trim().toLowerCase()
                );
              }
              return o.value === v || o.label === v;
            });
            if (!option) {
              errors.push(`Invalid option for ${field.label}: ${v}`);
            } else if ((option as any).variantSku) {
              const sku = String((option as any).variantSku).toUpperCase().trim();
              const found = await studioRepo.findVariantBySku(sku, client);
              if (
                !found ||
                !found.material.isActive ||
                !found.variant.isActive ||
                typeof found.variant.stock !== "number" ||
                found.variant.stock < 1
              ) {
                errors.push(`${option.label || v} is currently out of stock`);
              }
            }
          }
        }
      }

      if (field.type === "text") {
        const value = String(rawVal);
        if (value.length > 100) {
          warnings.push(`${field.label} is too long (max 100 characters)`);
        }
      }

      if (field.type === "number") {
        const value = Number(rawVal);
        if (isNaN(value) || value < 0) {
          errors.push(`${field.label} must be a valid positive number`);
        }
      }
    }
  }

  for (const key of Object.keys(selections)) {
    const field = fields.find((f: ICustomizationField) => f.key === key);
    if (!field) {
      warnings.push(`Unknown customization field: ${key}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

export async function getCustomizationOptions(productType: string, client?: IDbClient) {
  const categoryRepo = defaultCategoryRepo;
  const studioRepo = defaultStudioRepo;

  const categories = await categoryRepo.findAll({ productType, active: true }, client);
  const category = categories.length > 0 ? categories[0] : null;

  const config = await studioRepo.findCustomizationConfig({ productType, isActive: true }, client);

  const fields = config?.fields?.length ? config.fields : category?.customizationFields ?? [];

  const materials = fields
    .find((f: ICustomizationField) => f.key === "beadColor" || f.key === "stoneColor")
    ?.options?.map((o: { value: string; label: string; priceModifier?: number; imageUrl?: string }, idx: number) => ({
      id: idx + 1,
      name: o.label,
      color: o.value.includes("#") ? o.value : `#${o.value.slice(0, 6).padStart(6, "0")}`,
      price_per_unit: o.priceModifier ?? 0,
      image: o.imageUrl,
    })) ?? [];

  const chainTypes =
    fields.find((f: ICustomizationField) => f.key === "metalFinish")?.options?.map((o: { value: string; label: string; priceModifier?: number }, idx: number) => ({
      id: idx + 1,
      name: o.label,
      description: o.label,
      price_modifier: o.priceModifier ?? 0,
    })) ?? [];

  const braceletSizes =
    fields.find((f: ICustomizationField) => f.key === "braceletSize" || f.key === "size")?.options?.map((o: { value: string; label: string; priceModifier?: number }, idx: number) => ({
      id: idx + 1,
      size: o.label,
      length_cm: parseFloat(o.value) || 18,
      price_modifier: o.priceModifier ?? 0,
    })) ?? [];

  const charms =
    fields.find((f: ICustomizationField) => f.key === "charms")?.options?.map((o: { value: string; label: string; priceModifier?: number; imageUrl?: string }, idx: number) => ({
      id: idx + 1,
      option_type: "charm",
      name: o.label,
      description: o.label,
      price_modifier: o.priceModifier ?? 0,
      image: o.imageUrl,
    })) ?? [];

  return { materials, chainTypes, braceletSizes, charms, fields, config };
}

export async function generatePreview(
  productId: string,
  selections: Record<string, string | string[]>,
  client?: IDbClient
) {
  const { product, fields, previewLayers } = await resolveProductCustomization(productId, client);

  const basePrice = product.salePrice ?? product.price ?? product.basePrice;
  let modifier = 0;

  for (const field of fields) {
    const value = selections[field.key];
    if (!value) continue;
    const values = Array.isArray(value) ? value : [value];
    for (const v of values) {
      const opt = field.options?.find((o: { value: string; label: string; priceModifier?: number }) => o.value === v || o.label === v);
      if (opt?.priceModifier) modifier += opt.priceModifier;
    }
  }

  const color =
    (selections.color as string) ??
    (selections.beadColor as string) ??
    (selections.stoneColor as string) ??
    "FF0066";

  const previewUrl = `${PLACEHOLDER}&text=${encodeURIComponent(product.name)}&color=${color.replace("#", "")}`;

  return {
    previewUrl,
    totalPrice: basePrice + modifier,
    layers: previewLayers || [],
  };
}

export async function generatePreviewLegacy(
  input: {
    product_type: string;
    customization_data: Record<string, unknown>;
    base_product_id?: string | number;
  },
  client?: IDbClient
) {
  let basePrice = 500;
  if (input.base_product_id) {
    const product = await defaultProductRepo.findById(String(input.base_product_id), client);
    if (product) basePrice = product.salePrice ?? product.price;
  }

  const { fields } = await getCustomizationOptions(input.product_type, client);
  let modifier = 0;
  for (const field of fields) {
    const val = input.customization_data[field.key];
    if (!val) continue;
    const values = Array.isArray(val) ? val : [val];
    for (const v of values) {
      const opt = field.options?.find((o: { value: string; label: string; priceModifier?: number }) => o.value === v || o.label === v);
      if (opt?.priceModifier) modifier += opt.priceModifier;
    }
  }

  const color =
    (input.customization_data.color as string) ??
    (input.customization_data.beadColor as string) ??
    (input.customization_data.stoneColor as string) ??
    "FF0066";

  const previewUrl = `${PLACEHOLDER}&text=${encodeURIComponent(input.product_type)}&color=${color.replace("#", "")}`;

  return {
    preview_url: previewUrl,
    total_price: basePrice + modifier,
    message: "Preview generated successfully",
  };
}

export async function saveCustomizedProduct(
  userId: string,
  input: {
    product_type: string;
    base_product_id?: string | number;
    customization_data: Record<string, unknown>;
    total_price: number;
  },
  client?: IDbClient
) {
  const preview = await generatePreviewLegacy(
    {
      product_type: input.product_type,
      customization_data: input.customization_data,
      base_product_id: input.base_product_id,
    },
    client
  );

  return {
    id: Date.now(),
    user: userId,
    product_type: input.product_type,
    base_product_id: input.base_product_id,
    customization_data: input.customization_data,
    total_price: input.total_price || preview.total_price,
    preview_image_url: preview.preview_url,
    created_at: new Date().toISOString(),
  };
}

export async function addCustomizedToCart(
  userId: string,
  customized: {
    product_type: string;
    base_product_id?: string | number;
    customization_data: Record<string, unknown>;
    total_price: number;
    preview_image_url?: string;
  },
  client?: IDbClient
) {
  const { addCartItem } = await import("./cart.service.js");
  const productId = customized.base_product_id
    ? String(customized.base_product_id)
    : undefined;

  if (!productId) throw new AppError("Base product required", 400);

  const product = await defaultProductRepo.findById(productId, client);
  if (!product) throw new AppError("Product not found", 404);

  const effectiveBase = product.salePrice ?? product.price;

  await addCartItem(
    userId,
    {
      productId,
      name: `Custom ${product.name}`,
      price: customized.total_price,
      quantity: 1,
      image_url: customized.preview_image_url,
      customization: {
        selections: customized.customization_data as Record<string, string | string[] | number>,
        previewImageUrl: customized.preview_image_url,
        priceModifier: customized.total_price - effectiveBase,
      },
    },
    client
  );

  return { message: "Customized product added to cart successfully" };
}
