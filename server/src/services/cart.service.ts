/**
 * ============================================================================
 * Cart Service (Phase 3E: PostgreSQL Migration)
 * ============================================================================
 *
 * Implements customer shopping cart operations backed by `carts` and `cart_items`
 * tables on Supabase PostgreSQL.
 *
 * Guarantees:
 * 1. Strict user ownership checks on all cart and item operations.
 * 2. Product availability and real-time stock verification without inventory mutation.
 * 3. Atomic transactions for multi-step cart actions and guest cart merging.
 * 4. Dual ID compatibility (`id` and `_id`, ObjectId and UUID).
 * 5. Full preservation of legacy contracts, pricing rules, customization calculations,
 *    and studio design snapshots.
 */

import { PostgresCartRepository } from "../repositories/postgres-cart.repository.js";
import { PostgresProductRepository } from "../repositories/postgres-product.repository.js";
import { PostgresDatabase, withTransaction } from "../db/postgres.js";
import {
  IDbPool,
  IDbClient,
  ICartRecord,
  ICartItemRecord,
} from "../types/database.types.js";
import { AppError } from "../middleware/errorHandler.js";
import { isValidEntityId } from "../utils/helpers.js";
import { customizationService } from "./customization.service.js";

export interface ICartWithCompatibility extends ICartRecord {
  save: () => Promise<ICartRecord>;
  markModified: (path: string) => void;
}

export interface AddCartItemInput {
  product_id?: string;
  productId?: string;
  name?: string;
  price?: number;
  quantity?: number;
  image_url?: string;
  imageUrl?: string;
  customization?: {
    selections: Record<string, string | string[] | number>;
    previewImageUrl?: string;
    priceModifier?: number;
    engraving?: string;
    breakdown?: Array<{
      field: string;
      option: string;
      modifier?: number;
    }>;
  };
}

export interface AddStudioDesignInput {
  name: string;
  unitPrice: number;
  quantity?: number;
  imageUrl?: string;
  studioDesign: any;
}

export interface CartTotals {
  subtotal: number;
  itemCount: number;
  shipping: number;
  tax: number;
  discount: number;
  total: number;
}

// ---------------------------------------------------------------------------
// Singletons & Dependency Injection
// ---------------------------------------------------------------------------

let activeCartRepo: PostgresCartRepository | null = null;
let activeProductRepo: PostgresProductRepository | null = null;
let activePool: IDbPool | null = null;

let activeCustomizationService: {
  validateCustomization: (productId: string, selections: Record<string, string | string[]>) => Promise<{ valid: boolean; errors: string[] }>;
  calculatePrice: (productId: string, selections: Record<string, string | string[]>) => Promise<{ priceModifier: number; breakdown: any[] }>;
} = customizationService;

export function setCartCustomizationService(service: typeof activeCustomizationService): void {
  activeCustomizationService = service;
}

function getCartPool(): IDbPool {
  if (!activePool) {
    activePool = PostgresDatabase.getPool();
  }
  return activePool;
}

function getCartRepo(): PostgresCartRepository {
  if (!activeCartRepo) {
    activeCartRepo = new PostgresCartRepository(getCartPool());
  }
  return activeCartRepo;
}

function getProductRepo(): PostgresProductRepository {
  if (!activeProductRepo) {
    activeProductRepo = new PostgresProductRepository(getCartPool());
  }
  return activeProductRepo;
}

export function setCartRepository(repo: PostgresCartRepository): void {
  activeCartRepo = repo;
}

export function setCartProductRepository(repo: PostgresProductRepository): void {
  activeProductRepo = repo;
}

export function setCartDatabasePool(pool: IDbPool): void {
  activePool = pool;
  activeCartRepo = new PostgresCartRepository(pool);
  activeProductRepo = new PostgresProductRepository(pool);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function attachCompatibility(cart: ICartRecord, repo: PostgresCartRepository, client?: IDbClient): ICartWithCompatibility {
  const enhanced = { ...cart } as ICartWithCompatibility;

  enhanced.markModified = (_path: string) => {
    // No-op for Mongoose backward-compatibility
  };

  enhanced.save = async () => {
    // If any items were updated on the in-memory array, persist changes
    if (Array.isArray(enhanced.items)) {
      for (const item of enhanced.items) {
        if (item.id) {
          await repo.updateItem(
            item.id,
            {
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              customization: item.customization,
              studioDesign: item.studioDesign,
              savedForLater: item.savedForLater,
            },
            client
          );
        }
      }
    }
    const reloaded = await repo.findById(enhanced.id, client);
    return reloaded || enhanced;
  };

  // Attach deleteOne() helper to items for Mongoose array subdocument compatibility
  if (Array.isArray(enhanced.items)) {
    enhanced.items.forEach((item) => {
      (item as any).deleteOne = async () => {
        await repo.deleteItem(item.id, client);
      };
    });
  }

  return enhanced;
}

// ---------------------------------------------------------------------------
// Service Methods
// ---------------------------------------------------------------------------

/**
 * Retrieves an existing cart for a user or session, or creates a new one.
 */
export async function getOrCreateCart(
  userIdOrSessionId: string,
  isSession = false,
  client?: IDbClient
): Promise<ICartWithCompatibility> {
  const repo = getCartRepo();
  let cart: ICartRecord | null = null;

  if (isSession) {
    cart = await repo.findBySessionId(userIdOrSessionId, client);
    if (!cart) {
      cart = await repo.create({ sessionId: userIdOrSessionId }, client);
    }
  } else {
    if (!isValidEntityId(userIdOrSessionId)) {
      throw new AppError("Invalid user id", 400);
    }
    cart = await repo.findByUserId(userIdOrSessionId, client);
    if (!cart) {
      cart = await repo.create({ userId: userIdOrSessionId }, client);
    }
  }

  return attachCompatibility(cart, repo, client);
}

/**
 * Retrieves all active (non-saved-for-later) items in the customer's cart.
 */
export async function getCartItems(
  userId: string,
  client?: IDbClient
): Promise<ICartItemRecord[]> {
  const cart = await getOrCreateCart(userId, false, client);
  return cart.items.filter((item) => !item.savedForLater);
}

/**
 * Adds an item to the user's cart.
 * Validates product availability and stock, computes authoritative pricing,
 * recalculates customizations, and merges duplicates with identical options.
 */
export async function addCartItem(
  userId: string,
  input: AddCartItemInput,
  clientOrPool?: IDbClient | IDbPool
): Promise<ICartItemRecord[]> {
  if (!isValidEntityId(userId)) {
    throw new AppError("Invalid user id", 400);
  }

  const executeAdd = async (client: IDbClient) => {
    const cart = await getOrCreateCart(userId, false, client);

    const rawId = input.productId ?? input.product_id ?? "";
    const cleanId = rawId.includes("-") ? rawId.split("-").pop()! : rawId;

    let product = null;
    if (isValidEntityId(rawId)) {
      product = await getProductRepo().findById(rawId, client);
    } else if (isValidEntityId(cleanId)) {
      product = await getProductRepo().findById(cleanId, client);
    }

    if (!product && rawId) {
      product = await getProductRepo().findBySlug(rawId, { activeOnly: false }, client);
    }

    if (!product) {
      throw new AppError("Product not found", 404);
    }

    // Availability check
    if (product.isActive === false) {
      throw new AppError("Product is currently unavailable", 400);
    }

    // Stock check
    const requestedQty = input.quantity && input.quantity > 0 ? input.quantity : 1;
    if (product.stock <= 0) {
      throw new AppError("Product is out of stock", 400);
    }
    if (product.stock < requestedQty) {
      throw new AppError(`Only ${product.stock} items available in stock`, 400);
    }

    const resolvedName = input.name || product.name;
    const primary = product.media.find((m) => m.isPrimary) ?? product.media[0];
    const imageUrl = input.image_url || input.imageUrl || primary?.url;
    const unitPrice = product.salePrice && product.salePrice < product.price
      ? product.salePrice
      : product.price;

    const customizationData = input.customization ? { ...input.customization } : undefined;

    // Securely validate and recalculate customization price modifier from database
    if (
      customizationData &&
      customizationData.selections &&
      Object.keys(customizationData.selections).length > 0
    ) {
      if (!product.isCustomizable) {
        throw new AppError("This product is not customizable", 400);
      }

      const validation = await activeCustomizationService.validateCustomization(
        product.id,
        customizationData.selections as Record<string, string | string[]>
      );
      if (!validation.valid) {
        throw new AppError(validation.errors.join(", "), 400);
      }

      try {
        const priceResult = await activeCustomizationService.calculatePrice(
          product.id,
          customizationData.selections as Record<string, string | string[]>
        );
        customizationData.priceModifier = priceResult.priceModifier;
        customizationData.breakdown = priceResult.breakdown;
      } catch (err: any) {
        if (err instanceof AppError) throw err;
        console.warn("Could not calculate customization price modifier:", err);
        customizationData.priceModifier = customizationData.priceModifier || 0;
      }
    }

    // Check for existing item with same product and matching customization selections
    const existing = cart.items.find((i) => {
      if (!i.productId || i.productId !== product!.id || i.savedForLater) return false;

      if (!i.customization && !customizationData) return true;
      if (!i.customization || !customizationData) return false;

      const existingSelections = JSON.stringify(i.customization.selections || {});
      const newSelections = JSON.stringify(customizationData.selections || {});
      return existingSelections === newSelections;
    });

    if (existing) {
      const newTotalQty = existing.quantity + requestedQty;
      if (product.stock < newTotalQty) {
        throw new AppError(`Only ${product.stock} items available in stock`, 400);
      }

      await getCartRepo().updateItem(
        existing.id,
        {
          quantity: newTotalQty,
          unitPrice,
        },
        client
      );
    } else {
      await getCartRepo().addItem(
        {
          cartId: cart.id,
          itemType: "product",
          productId: product.id,
          sku: product.sku,
          name: resolvedName,
          imageUrl,
          unitPrice,
          quantity: requestedQty,
          customization: customizationData,
          savedForLater: false,
        },
        client
      );
    }

    return getCartItems(userId, client);
  };

  // If a client was directly provided, run within that client; otherwise run in transaction
  if (clientOrPool && typeof (clientOrPool as any).query === "function" && typeof (clientOrPool as any).connect !== "function") {
    return executeAdd(clientOrPool as IDbClient);
  }

  const pool = clientOrPool ? (clientOrPool as IDbPool) : getCartPool();
  return withTransaction(pool, executeAdd);
}

/**
 * Updates the quantity of an item in the cart.
 * If quantity < 1, the item is removed.
 * Validates available product stock without mutating inventory.
 */
export async function updateCartItemQuantity(
  userId: string,
  itemId: string,
  quantity: number,
  clientOrPool?: IDbClient | IDbPool
): Promise<ICartItemRecord[]> {
  if (!isValidEntityId(userId)) {
    throw new AppError("Invalid user id", 400);
  }
  if (!isValidEntityId(itemId)) {
    throw new AppError("Invalid item id", 400);
  }

  const executeUpdate = async (client: IDbClient) => {
    const cart = await getOrCreateCart(userId, false, client);
    const item = await getCartRepo().getItemById(itemId, client);

    if (!item || item.cartId !== cart.id) {
      throw new AppError("Cart item not found", 404);
    }

    if (quantity < 1) {
      await getCartRepo().deleteItem(itemId, client);
    } else {
      // Validate stock for product items
      if (item.productId) {
        const product = await getProductRepo().findById(item.productId, client);
        if (product) {
          if (product.isActive === false) {
            throw new AppError("Product is currently unavailable", 400);
          }
          if (product.stock < quantity) {
            throw new AppError(`Only ${product.stock} items available in stock`, 400);
          }
        }
      }

      await getCartRepo().updateItem(itemId, { quantity }, client);
    }

    return getCartItems(userId, client);
  };

  if (clientOrPool && typeof (clientOrPool as any).query === "function" && typeof (clientOrPool as any).connect !== "function") {
    return executeUpdate(clientOrPool as IDbClient);
  }

  const pool = clientOrPool ? (clientOrPool as IDbPool) : getCartPool();
  return withTransaction(pool, executeUpdate);
}

/**
 * Removes an item from the customer's cart after verifying ownership.
 */
export async function removeCartItem(
  userId: string,
  itemId: string,
  client?: IDbClient
): Promise<ICartItemRecord[]> {
  if (!isValidEntityId(userId)) {
    throw new AppError("Invalid user id", 400);
  }
  if (!isValidEntityId(itemId)) {
    throw new AppError("Invalid item id", 400);
  }

  const cart = await getOrCreateCart(userId, false, client);
  const item = await getCartRepo().getItemById(itemId, client);

  if (!item || item.cartId !== cart.id) {
    throw new AppError("Cart item not found", 404);
  }

  await getCartRepo().deleteItem(itemId, client);
  return getCartItems(userId, client);
}

/**
 * Clears active items from the customer's cart (preserving saved-for-later items).
 */
export async function clearCart(userId: string, client?: IDbClient): Promise<void> {
  if (!isValidEntityId(userId)) {
    throw new AppError("Invalid user id", 400);
  }

  const cart = await getOrCreateCart(userId, false, client);
  await getCartRepo().clearCartItems(cart.id, true, client);
}

/**
 * Adds a custom studio design to the user's cart.
 */
export async function addStudioDesignToCart(
  userId: string,
  input: AddStudioDesignInput,
  client?: IDbClient
): Promise<ICartItemRecord[]> {
  if (!isValidEntityId(userId)) {
    throw new AppError("Invalid user id", 400);
  }

  const cart = await getOrCreateCart(userId, false, client);
  const qty = input.quantity && input.quantity > 0 ? input.quantity : 1;
  const jewelleryType = input.studioDesign?.jewelleryType || "BRACELET";
  const sku = `STUDIO-${jewelleryType.toUpperCase()}-${Date.now().toString().slice(-4)}`;

  await getCartRepo().addItem(
    {
      cartId: cart.id,
      itemType: "custom_design",
      sku,
      name: input.name || "Custom Studio Design",
      imageUrl: input.imageUrl,
      unitPrice: input.unitPrice,
      quantity: qty,
      studioDesign: input.studioDesign,
      savedForLater: false,
    },
    client
  );

  return getCartItems(userId, client);
}

/**
 * Calculates subtotal, discounts, shipping, tax, and grand totals for a cart.
 */
export function calculateCartTotals(
  items: ICartItemRecord[],
  _couponCode?: string
): CartTotals {
  let subtotal = 0;
  let itemCount = 0;

  for (const item of items) {
    if (item.savedForLater) continue;
    const modifier = item.customization?.priceModifier ?? 0;
    const effectiveUnitPrice = Number(item.unitPrice) + modifier;
    subtotal += effectiveUnitPrice * item.quantity;
    itemCount += item.quantity;
  }

  // Free shipping on orders >= ₹1,000, otherwise ₹100
  const shipping = subtotal >= 1000 || subtotal === 0 ? 0 : 100;
  const tax = 0; // Tax included in item prices per COMMERCE_MODE
  const discount = 0;
  const total = Math.max(0, subtotal - discount + shipping + tax);

  return {
    subtotal: Math.round(subtotal * 100) / 100,
    itemCount,
    shipping,
    tax,
    discount,
    total: Math.round(total * 100) / 100,
  };
}

/**
 * Merges a guest cart into an authenticated customer's cart atomically.
 */
export async function mergeGuestCart(
  sessionId: string,
  userId: string,
  clientOrPool?: IDbClient | IDbPool
): Promise<ICartItemRecord[]> {
  if (!sessionId || !isValidEntityId(userId)) {
    return getCartItems(userId);
  }

  const executeMerge = async (client: IDbClient) => {
    const guestCart = await getCartRepo().findBySessionId(sessionId, client);
    if (!guestCart || guestCart.items.length === 0) {
      return getCartItems(userId, client);
    }

    const userCart = await getOrCreateCart(userId, false, client);

    for (const guestItem of guestCart.items) {
      // Find matching item in user cart
      const existing = userCart.items.find((i) => {
        if (i.itemType !== guestItem.itemType) return false;
        if (i.productId !== guestItem.productId) return false;

        const gSelections = JSON.stringify(guestItem.customization?.selections || {});
        const uSelections = JSON.stringify(i.customization?.selections || {});
        return gSelections === uSelections;
      });

      if (existing) {
        await getCartRepo().updateItem(
          existing.id,
          { quantity: existing.quantity + guestItem.quantity },
          client
        );
      } else {
        await getCartRepo().addItem(
          {
            cartId: userCart.id,
            itemType: guestItem.itemType,
            productId: guestItem.productId,
            sku: guestItem.sku,
            name: guestItem.name,
            imageUrl: guestItem.imageUrl,
            unitPrice: guestItem.unitPrice,
            quantity: guestItem.quantity,
            customization: guestItem.customization,
            studioDesign: guestItem.studioDesign,
            savedForLater: guestItem.savedForLater,
          },
          client
        );
      }
    }

    // Delete guest cart
    await getCartRepo().deleteById(guestCart.id, client);
    return getCartItems(userId, client);
  };

  if (clientOrPool && typeof (clientOrPool as any).query === "function" && typeof (clientOrPool as any).connect !== "function") {
    return executeMerge(clientOrPool as IDbClient);
  }

  const pool = clientOrPool ? (clientOrPool as IDbPool) : getCartPool();
  return withTransaction(pool, executeMerge);
}

/**
 * Maps a cart item to the legacy response structure expected by older routes.
 */
export function toLegacyCartItem(
  item: ICartItemRecord | (any & { _id?: string }),
  index: number
) {
  const id = item.id ?? item._id ?? String(index);
  const isCustomDesign = item.itemType === "custom_design" || !!item.studioDesign;
  const productType = isCustomDesign
    ? (item.studioDesign?.jewelleryType ?? "bracelet")
    : (String(item.sku || "").startsWith("BRC") ? "bracelet" : "chain");

  const priceModifier = item.customization?.priceModifier ?? 0;
  const price = Number(item.unitPrice) + priceModifier;

  return {
    id,
    itemType: isCustomDesign ? "custom_design" : "product",
    product_id: item.productId ? String(item.productId) : undefined,
    productId: item.productId ? String(item.productId) : undefined,
    product_type: productType,
    name: item.name,
    price,
    quantity: item.quantity,
    image_url: item.imageUrl,
    imageUrl: item.imageUrl,
    customization: item.customization,
    studioDesign: item.studioDesign,
    product: {
      name: item.name,
      image: item.imageUrl,
    },
  };
}
