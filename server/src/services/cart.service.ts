import { Types } from "mongoose";
import { Cart, ICartItem } from "../models/Cart.js";
import { Product } from "../models/Product.js";
import { AppError } from "../middleware/errorHandler.js";

export async function getOrCreateCart(userId: string) {
  let cart = await Cart.findOne({ userId: new Types.ObjectId(userId) });
  if (!cart) {
    cart = await Cart.create({ userId: new Types.ObjectId(userId), items: [] });
  }
  return cart;
}

export async function getCartItems(userId: string) {
  const cart = await getOrCreateCart(userId);
  return cart.items.filter((i) => !i.savedForLater);
}

export async function addCartItem(
  userId: string,
  input: {
    product_id?: string;
    productId?: string;
    name?: string;
    price?: number;
    quantity?: number;
    image_url?: string;
    customization?: ICartItem["customization"];
  }
) {
  console.log('addCartItem called with userId:', userId, 'input:', input);
  const cart = await getOrCreateCart(userId);
  console.log('Cart found/created:', cart);
  let productObjectId: Types.ObjectId | null = null;
  let sku = "CUSTOM";
  let resolvedName = input.name;
  let imageUrl = input.image_url;
  let unitPrice = input.price;

  const rawId = input.productId ?? input.product_id ?? "";
  const mongoId = rawId.includes("-") ? rawId.split("-").pop()! : rawId;
  console.log('Processing product ID:', rawId, '->', mongoId);

  if (Types.ObjectId.isValid(mongoId)) {
    const product = await Product.findById(mongoId);
    console.log('Product found:', product);
    if (product) {
      productObjectId = product._id as Types.ObjectId;
      sku = product.sku;
      resolvedName = resolvedName || product.name;
      const primary = product.media.find((m) => m.isPrimary) ?? product.media[0];
      imageUrl = imageUrl || primary?.url;
      unitPrice = unitPrice || (product.salePrice && product.salePrice < product.price ? product.salePrice : product.price);
    }
  }

  if (!productObjectId) {
    throw new AppError("Product not found", 404);
  }

  if (!resolvedName) {
    throw new AppError("Product name is required", 400);
  }

  if (unitPrice === undefined || unitPrice === null) {
    throw new AppError("Product price is required", 400);
  }

  // Check for existing item with same product and same customization
  const existing = cart.items.find((i) => {
    if (!i.productId.equals(productObjectId!) || i.savedForLater) return false;
    
    // If neither has customization, they can be merged
    if (!i.customization && !input.customization) return true;
    
    // If one has customization and the other doesn't, they're different
    if (!i.customization || !input.customization) return false;
    
    // Compare customization selections
    const selectionsMatch = JSON.stringify(i.customization.selections) === JSON.stringify(input.customization.selections);
    return selectionsMatch;
  });

  if (existing) {
    existing.quantity += input.quantity ?? 1;
    console.log('Updated existing item quantity:', existing.quantity);
  } else {
    const newItem = {
      productId: productObjectId,
      sku,
      name: resolvedName,
      imageUrl,
      unitPrice: unitPrice!,
      quantity: input.quantity ?? 1,
      customization: input.customization,
      savedForLater: false,
    };
    cart.items.push(newItem);
    console.log('Added new item to cart:', newItem);
  }

  console.log('Cart before save:', cart);
  await cart.save();
  console.log('Cart saved successfully');
  const result = cart.items.filter((i) => !i.savedForLater);
  console.log('Returning cart items:', result);
  return result;
}

export async function updateCartItemQuantity(userId: string, itemId: string, quantity: number) {
  const cart = await getOrCreateCart(userId);
  const item = (cart.items as any).id(itemId);
  if (!item) throw new AppError("Cart item not found", 404);
  if (quantity < 1) {
    item.deleteOne();
  } else {
    item.quantity = quantity;
  }
  await cart.save();
  return cart.items.filter((i) => !i.savedForLater);
}

export async function removeCartItem(userId: string, itemId: string) {
  const cart = await getOrCreateCart(userId);
  const item = (cart.items as any).id(itemId);
  if (!item) throw new AppError("Cart item not found", 404);
  item.deleteOne();
  await cart.save();
  return cart.items.filter((i) => !i.savedForLater);
}

export async function clearCart(userId: string) {
  const cart = await getOrCreateCart(userId);
  cart.items = cart.items.filter((i) => i.savedForLater);
  await cart.save();
}

export function toLegacyCartItem(item: ICartItem & { _id?: Types.ObjectId }, index: number) {
  const id = item._id?.toString() ?? String(index);
  const productType = item.sku.startsWith("BRC") ? "bracelet" : "chain";
  return {
    id,
    product_id: item.productId.toString(),
    product_type: productType,
    name: item.name,
    price: item.unitPrice,
    quantity: item.quantity,
    image_url: item.imageUrl,
    imageUrl: item.imageUrl,
    product: {
      name: item.name,
      image: item.imageUrl,
    },
  };
}
