/**
 * ============================================================================
 * Wishlist Service (Phase 3E: PostgreSQL Migration)
 * ============================================================================
 *
 * Implements customer wishlist management backed by the `wishlist_items` table
 * on Supabase PostgreSQL.
 *
 * Guarantees:
 * 1. Dual identifier support (`id` and `_id`, ObjectId and UUID).
 * 2. Strict product validation ensuring products exist before adding to wishlist.
 * 3. Customer ownership enforcement on all modifications and queries.
 * 4. Duplicate prevention with idempotent upsert.
 * 5. Full preservation of API contracts for `/api/v1/users/wishlist` and legacy endpoints.
 */

import { PostgresWishlistRepository } from "../repositories/postgres-wishlist.repository.js";
import { PostgresProductRepository } from "../repositories/postgres-product.repository.js";
import { PostgresDatabase } from "../db/postgres.js";
import { IDbPool, IDbClient, IWishlistItemRecord } from "../types/database.types.js";
import { AppError } from "../middleware/errorHandler.js";
import { isValidEntityId } from "../utils/helpers.js";

// ---------------------------------------------------------------------------
// Singletons & Dependency Injection
// ---------------------------------------------------------------------------

let activeWishlistRepo: PostgresWishlistRepository | null = null;
let activeProductRepo: PostgresProductRepository | null = null;
let activePool: IDbPool | null = null;

function getWishlistPool(): IDbPool {
  if (!activePool) {
    activePool = PostgresDatabase.getPool();
  }
  return activePool;
}

function getWishlistRepo(): PostgresWishlistRepository {
  if (!activeWishlistRepo) {
    activeWishlistRepo = new PostgresWishlistRepository(getWishlistPool());
  }
  return activeWishlistRepo;
}

function getProductRepo(): PostgresProductRepository {
  if (!activeProductRepo) {
    activeProductRepo = new PostgresProductRepository(getWishlistPool());
  }
  return activeProductRepo;
}

export function setWishlistRepository(repo: PostgresWishlistRepository): void {
  activeWishlistRepo = repo;
}

export function setWishlistProductRepository(repo: PostgresProductRepository): void {
  activeProductRepo = repo;
}

export function setWishlistDatabasePool(pool: IDbPool): void {
  activePool = pool;
  activeWishlistRepo = new PostgresWishlistRepository(pool);
  activeProductRepo = new PostgresProductRepository(pool);
}

// ---------------------------------------------------------------------------
// Service Methods
// ---------------------------------------------------------------------------

export interface WishlistResponse {
  items: Array<{
    id: string;
    _id: string;
    productId: string;
    product?: any;
    createdAt: Date;
  }>;
  productIds: string[];
}

/**
 * Retrieves the full wishlist for a customer, including populated product details
 * and a list of product IDs for fast lookups.
 */
export async function getWishlist(
  userId: string,
  client?: IDbClient
): Promise<WishlistResponse> {
  if (!isValidEntityId(userId)) {
    throw new AppError("Invalid user id", 400);
  }

  const items = await getWishlistRepo().findByUserId(userId, client);

  const wishlistItems = items.map((item) => ({
    id: item.id,
    _id: item.id,
    productId: item.productId,
    product: item.product,
    createdAt: item.createdAt,
  }));

  const productIds = items.map((item) => item.productId);

  return {
    items: wishlistItems,
    productIds,
  };
}

/**
 * Retrieves wishlist records directly.
 */
export async function getWishlistItems(
  userId: string,
  client?: IDbClient
): Promise<IWishlistItemRecord[]> {
  if (!isValidEntityId(userId)) {
    throw new AppError("Invalid user id", 400);
  }

  return getWishlistRepo().findByUserId(userId, client);
}

/**
 * Adds a product to a user's wishlist.
 * Validates product existence and enforces duplicate prevention.
 */
export async function addToWishlist(
  userId: string,
  productId: string,
  client?: IDbClient
): Promise<{ id: string; productId: string; product?: any }> {
  if (!isValidEntityId(userId)) {
    throw new AppError("Invalid user id", 400);
  }
  if (!isValidEntityId(productId)) {
    throw new AppError("Invalid product id", 400);
  }

  const product = await getProductRepo().findById(productId, client);
  if (!product) {
    throw new AppError("Product not found", 404);
  }

  const item = await getWishlistRepo().addItem(userId, productId, undefined, client);

  return {
    id: item.id,
    productId: item.productId,
    product: item.product || {
      id: product.id,
      _id: product.id,
      name: product.name,
      sku: product.sku,
      price: product.price,
      salePrice: product.salePrice,
      media: product.media,
      stock: product.stock,
      isActive: product.isActive,
    },
  };
}

/**
 * Removes an item from the user's wishlist by item ID or by product ID.
 */
export async function removeFromWishlist(
  userId: string,
  identifier: { itemId?: string; productId?: string },
  client?: IDbClient
): Promise<boolean> {
  if (!isValidEntityId(userId)) {
    throw new AppError("Invalid user id", 400);
  }

  if (identifier.productId) {
    if (!isValidEntityId(identifier.productId)) {
      throw new AppError("Invalid product id", 400);
    }
    return getWishlistRepo().deleteByUserAndProduct(userId, identifier.productId, client);
  }

  if (identifier.itemId) {
    if (!isValidEntityId(identifier.itemId)) {
      throw new AppError("Invalid item id", 400);
    }
    return getWishlistRepo().deleteByIdAndUserId(identifier.itemId, userId, client);
  }

  throw new AppError("Either itemId or productId must be provided", 400);
}

/**
 * Clears all items in the customer's wishlist.
 */
export async function clearWishlist(
  userId: string,
  client?: IDbClient
): Promise<number> {
  if (!isValidEntityId(userId)) {
    throw new AppError("Invalid user id", 400);
  }

  return getWishlistRepo().clearByUserId(userId, client);
}

/**
 * Checks whether a product exists in a user's wishlist.
 */
export async function isProductInWishlist(
  userId: string,
  productId: string,
  client?: IDbClient
): Promise<boolean> {
  if (!isValidEntityId(userId) || !isValidEntityId(productId)) {
    return false;
  }

  const existing = await getWishlistRepo().findByUserAndProduct(userId, productId, client);
  return existing !== null;
}
