import { Category, ICustomizationField } from "../models/Category.js";
import { CustomizationConfig } from "../models/CustomizationConfig.js";
import { Product } from "../models/Product.js";
import { AppError } from "../middleware/errorHandler.js";

const PLACEHOLDER =
  "https://placehold.co/600x600/FF0066/FFFFFF?text=Reyan+Luxe+Preview";

export const customizationService = {
  getProductCustomization,
  calculatePrice,
  validateCustomization,
  generatePreview,
};

export async function getProductCustomization(productId: string) {
  const product = await Product.findById(productId).lean();
  if (!product) {
    throw new AppError("Product not found", 404);
  }

  const category = await Category.findById(product.categoryId).lean();
  const config = await CustomizationConfig.findOne({
    $or: [
      { categoryId: product.categoryId },
      { productType: category?.productType }
    ],
    isActive: true
  }).lean();

  const fields = config?.fields?.length ? config.fields : category?.customizationFields ?? [];

  // If product is not customizable and has no fields, return empty customization config gracefully
  if (!product.isCustomizable && fields.length === 0) {
    return {
      productId: product._id,
      productName: product.name,
      basePrice: product.salePrice ?? product.price,
      fields: [],
      previewLayers: [],
      isCustomizable: false,
    };
  }

  return {
    productId: product._id,
    productName: product.name,
    basePrice: product.salePrice ?? product.price,
    fields: fields.sort((a: ICustomizationField, b: ICustomizationField) => (a.sortOrder || 0) - (b.sortOrder || 0)),
    previewLayers: config?.previewLayers || [],
    isCustomizable: product.isCustomizable,
  };
}

export async function calculatePrice(productId: string, selections: Record<string, string | string[]>) {
  const product = await Product.findById(productId).lean();
  if (!product) {
    throw new AppError("Product not found", 404);
  }

  const category = await Category.findById(product.categoryId).lean();
  const config = await CustomizationConfig.findOne({ 
    $or: [
      { categoryId: product.categoryId },
      { productType: category?.productType }
    ],
    isActive: true 
  }).lean();

  const fields = config?.fields?.length ? config.fields : category?.customizationFields ?? [];
  const basePrice = product.salePrice ?? product.price;
  let priceModifier = 0;
  const breakdown: { field: string; option: string; modifier: number }[] = [];

  for (const field of fields) {
    const value = selections[field.key];
    if (!value) continue;

    const values = Array.isArray(value) ? value : [value];
    for (const v of values) {
      const option = field.options?.find((o: { value: string; label: string }) => o.value === v || o.label === v);
      if (option) {
        priceModifier += option.priceModifier || 0;
        breakdown.push({
          field: field.label,
          option: option.label,
          modifier: option.priceModifier || 0,
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

export async function validateCustomization(productId: string, selections: Record<string, string | string[]>) {
  const product = await Product.findById(productId).lean();
  if (!product) {
    throw new AppError("Product not found", 404);
  }

  if (!product.isCustomizable) {
    throw new AppError("This product is not customizable", 400);
  }

  const category = await Category.findById(product.categoryId).lean();
  const config = await CustomizationConfig.findOne({ 
    $or: [
      { categoryId: product.categoryId },
      { productType: category?.productType }
    ],
    isActive: true 
  }).lean();

  const fields = config?.fields?.length ? config.fields : category?.customizationFields ?? [];
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check required fields
  for (const field of fields) {
    if (field.required && !selections[field.key]) {
      errors.push(`${field.label} is required`);
    }

    // Validate option values
    if (selections[field.key]) {
      const values = Array.isArray(selections[field.key]) ? selections[field.key] : [selections[field.key]];
      for (const v of values) {
        const option = field.options?.find((o: { value: string; label: string }) => o.value === v || o.label === v);
        if (!option) {
          errors.push(`Invalid option for ${field.label}: ${v}`);
        }
      }
    }

    // Validate text input length
    if (field.type === "text" && selections[field.key]) {
      const value = String(selections[field.key]);
      if (value.length > 100) {
        warnings.push(`${field.label} is too long (max 100 characters)`);
      }
    }

    // Validate number input range
    if (field.type === "number" && selections[field.key]) {
      const value = Number(selections[field.key]);
      if (isNaN(value) || value < 0) {
        errors.push(`${field.label} must be a valid positive number`);
      }
    }
  }

  // Check for extra fields not in configuration
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

export async function getCustomizationOptions(productType: string) {
  const category = await Category.findOne({ productType, isActive: true }).sort({ sortOrder: 1 }).lean();
  const config = await CustomizationConfig.findOne({ productType, isActive: true }).lean();

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

export async function generatePreview(productId: string, selections: Record<string, string | string[]>) {
  const product = await Product.findById(productId).lean();
  if (!product) {
    throw new AppError("Product not found", 404);
  }

  const category = await Category.findById(product.categoryId).lean();
  const config = await CustomizationConfig.findOne({ 
    $or: [
      { categoryId: product.categoryId },
      { productType: category?.productType }
    ],
    isActive: true 
  }).lean();

  const fields = config?.fields?.length ? config.fields : category?.customizationFields ?? [];
  const basePrice = product.salePrice ?? product.price;
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
    layers: config?.previewLayers || [],
  };
}

export async function generatePreviewLegacy(input: {
  product_type: string;
  customization_data: Record<string, unknown>;
  base_product_id?: number;
}) {
  let basePrice = 500;
  if (input.base_product_id) {
    const product = await Product.findById(input.base_product_id);
    if (product) basePrice = product.salePrice ?? product.price;
  }

  const { fields } = await getCustomizationOptions(input.product_type);
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
    base_product_id?: number;
    customization_data: Record<string, unknown>;
    total_price: number;
  }
) {
  const preview = await generatePreviewLegacy({
    product_type: input.product_type,
    customization_data: input.customization_data,
    base_product_id: input.base_product_id,
  });

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
    base_product_id?: number;
    customization_data: Record<string, unknown>;
    total_price: number;
    preview_image_url?: string;
  }
) {
  const { addCartItem } = await import("./cart.service.js");
  const productId = customized.base_product_id
    ? String(customized.base_product_id)
    : undefined;

  if (!productId) throw new AppError("Base product required", 400);

  const product = await Product.findById(productId);
  if (!product) throw new AppError("Product not found", 404);

  await addCartItem(userId, {
    productId,
    name: `Custom ${product.name}`,
    price: customized.total_price,
    quantity: 1,
    image_url: customized.preview_image_url,
    customization: {
      selections: customized.customization_data as Record<string, string | string[] | number>,
      previewImageUrl: customized.preview_image_url,
      priceModifier: customized.total_price - (product.salePrice ?? product.price),
    },
  });

  return { message: "Customized product added to cart successfully" };
}
