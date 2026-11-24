/**
 * ============================================================================
 * Phase 3E: Cart & Wishlist Services Test Suite
 * ============================================================================
 *
 * Verifies that the migrated Cart and Wishlist services operate on Supabase
 * PostgreSQL while preserving customer shopping features, real-time stock
 * validation, pricing rules, customization calculations, guest cart merging,
 * and API response contracts.
 *
 * Test Coverage:
 *  1.  getOrCreateCart creates new cart for user if none exists.
 *  2.  getOrCreateCart retrieves existing cart with compatibility methods (save, markModified).
 *  3.  getCartItems returns only active items (filters out savedForLater: true).
 *  4.  addCartItem resolves product details (name, SKU, image, effective sale price) and adds item.
 *  5.  addCartItem merges quantity when adding identical product with identical customizations.
 *  6.  addCartItem keeps distinct items when customization selections differ.
 *  7.  addCartItem validates product existence (throws AppError 404 when product not found).
 *  8.  addCartItem validates product availability (throws AppError 400 when isActive: false).
 *  9.  addCartItem validates product stock (throws AppError 400 when product is out of stock).
 *  10. addCartItem validates insufficient stock for requested quantity (throws AppError 400).
 *  11. addCartItem validates insufficient stock when merging existing quantity + new quantity (throws 400).
 *  12. addCartItem recalculates customization priceModifier and breakdown from database.
 *  13. addCartItem throws AppError 400 on invalid customization selections.
 *  14. updateCartItemQuantity updates item quantity when stock is sufficient.
 *  15. updateCartItemQuantity removes item when quantity < 1.
 *  16. updateCartItemQuantity throws AppError 400 when quantity exceeds available stock.
 *  17. updateCartItemQuantity verifies cart ownership (throws AppError 404 for other user's item).
 *  18. removeCartItem removes item and verifies cart ownership (throws AppError 404 for unowned item).
 *  19. clearCart clears all active items and preserves saved-for-later items.
 *  20. addStudioDesignToCart creates custom_design item with studioDesign snapshot and formatted SKU.
 *  21. calculateCartTotals calculates subtotal, free shipping threshold (>= ₹1000), and final total.
 *  22. mergeGuestCart transfers and merges items from guest session cart into user cart.
 *  23. toLegacyCartItem preserves legacy response shape with itemType, product_type, price, product.
 *  24. Cart transaction rollback — multi-step cart operation rolls back atomically on failure.
 *  25. getWishlist retrieves wishlist with populated product details and array of productIds.
 *  26. addToWishlist adds product to wishlist and verifies product exists (throws 404 if missing).
 *  27. addToWishlist prevents duplicate items via idempotent upsert (ON CONFLICT).
 *  28. removeFromWishlist removes item by wishlist item ID and verifies user ownership.
 *  29. removeFromWishlist removes item by product ID.
 *  30. clearWishlist clears all wishlist items for a user.
 *  31. isProductInWishlist returns true for existing item and false for missing.
 *  32. Dual ID compatibility — verifies 24-char hex MongoDB ObjectIds and 36-char UUIDs.
 *
 * Run:
 *   node --env-file=server/.env server/node_modules/tsx/dist/cli.mjs \
 *     server/src/scripts/test-cart-wishlist-service.ts
 */

import {
  getOrCreateCart,
  getCartItems,
  addCartItem,
  updateCartItemQuantity,
  removeCartItem,
  clearCart,
  addStudioDesignToCart,
  calculateCartTotals,
  mergeGuestCart,
  toLegacyCartItem,
  setCartRepository,
  setCartProductRepository,
  setCartDatabasePool,
  setCartCustomizationService,
} from "../services/cart.service.js";
import {
  getWishlist,
  getWishlistItems,
  addToWishlist,
  removeFromWishlist,
  clearWishlist,
  isProductInWishlist,
  setWishlistRepository,
  setWishlistProductRepository,
  setWishlistDatabasePool,
} from "../services/wishlist.service.js";
import {
  PostgresCartRepository,
  mapRowToCart,
  mapRowToCartItem,
} from "../repositories/postgres-cart.repository.js";
import {
  PostgresWishlistRepository,
  mapRowToWishlistItem,
} from "../repositories/postgres-wishlist.repository.js";
import {
  PostgresProductRepository,
} from "../repositories/postgres-product.repository.js";
import {
  ICartRecord,
  ICartItemRecord,
  IWishlistItemRecord,
  IProductRecord,
  IDbPool,
  IDbPoolClient,
  IQueryResult,
} from "../types/database.types.js";
import { AppError } from "../middleware/errorHandler.js";

// ---------------------------------------------------------------------------
// Test runner helpers
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => Promise<void> | void): Promise<void> {
  try {
    await fn();
    console.log(`  ✓  ${name}`);
    passed++;
  } catch (err: any) {
    console.error(`  ✗  ${name}`);
    console.error(`       ${err?.message ?? err}`);
    failed++;
  }
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

// ---------------------------------------------------------------------------
// Test fixtures & mock factories
// ---------------------------------------------------------------------------

const sampleUserId = "6ae44c64900e0da3e5b0adfd"; // 24-char hex MongoDB ID
const sampleUuidUserId = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11"; // 36-char UUID
const sampleCartId = "6ae44c64900e0da3e5b0adfc";
const sampleItemId = "6ae44c64900e0da3e5b0adfb";
const sampleProductId = "6ae44c64900e0da3e5b0adfa";
const sampleWishlistId = "6ae44c64900e0da3e5b0adf8";

const sampleProductRecord: IProductRecord = {
  id: sampleProductId,
  _id: sampleProductId,
  slug: "rudraksha-silver-bracelet",
  sku: "BRC-RUD-001",
  name: "Rudraksha Silver Bracelet",
  description: "Handcrafted silver bracelet with sacred Rudraksha beads",
  shortDescription: "Sacred Rudraksha bracelet",
  categoryId: "6ae44c64900e0da3e5b0adf0",
  subcategoryId: null,
  price: 2499,
  salePrice: 1999, // Active sale price
  effectivePrice: 1999,
  currency: "INR",
  stock: 15,
  isInStock: true,
  lowStockThreshold: 3,
  weightGrams: 45.0,
  materialInfo: "Pure silver with authentic 5-mukhi Rudraksha",
  careInstructions: "Avoid contact with water and perfume",
  additionalInfo: null,
  media: [
    { url: "https://example.com/rudraksha-primary.jpg", isPrimary: true, type: "image", sortOrder: 0 },
    { url: "https://example.com/rudraksha-side.jpg", isPrimary: false, type: "image", sortOrder: 1 },
  ],
  colors: ["Silver", "Brown"],
  materials: ["silver", "rudraksha"],
  tags: ["spiritual", "handmade"],
  badge: "Bestseller",
  isSignaturePiece: false,
  signatureCategory: "none",
  isCustomizable: false,
  isActive: true,
  averageRating: 4.8,
  reviewCount: 15,
  createdAt: new Date("2026-01-01T10:00:00Z"),
  updatedAt: new Date("2026-01-01T10:00:00Z"),
};

const sampleCartItem: ICartItemRecord = {
  id: sampleItemId,
  _id: sampleItemId,
  cartId: sampleCartId,
  itemType: "product",
  productId: sampleProductId,
  sku: "BRC-RUD-001",
  name: "Rudraksha Silver Bracelet",
  imageUrl: "https://example.com/rudraksha-primary.jpg",
  unitPrice: 1999,
  quantity: 2,
  savedForLater: false,
  createdAt: new Date("2026-01-01T10:00:00Z"),
  updatedAt: new Date("2026-01-01T10:00:00Z"),
};

const sampleCartRecord: ICartRecord = {
  id: sampleCartId,
  _id: sampleCartId,
  userId: sampleUserId,
  sessionId: null,
  couponCode: null,
  items: [sampleCartItem],
  createdAt: new Date("2026-01-01T10:00:00Z"),
  updatedAt: new Date("2026-01-01T10:00:00Z"),
};

const sampleWishlistItem: IWishlistItemRecord = {
  id: sampleWishlistId,
  _id: sampleWishlistId,
  userId: sampleUserId,
  productId: sampleProductId,
  createdAt: new Date("2026-01-01T10:00:00Z"),
  updatedAt: new Date("2026-01-01T10:00:00Z"),
  product: {
    id: sampleProductId,
    _id: sampleProductId,
    name: sampleProductRecord.name,
    sku: sampleProductRecord.sku,
    price: sampleProductRecord.price,
    salePrice: sampleProductRecord.salePrice,
    media: sampleProductRecord.media,
    stock: sampleProductRecord.stock,
    isActive: sampleProductRecord.isActive,
  },
};

function createMockDbPool(
  queryHandler?: (sql: string, params?: any[]) => Promise<IQueryResult<any>> | IQueryResult<any>
): {
  pool: IDbPool;
  queries: Array<{ sql: string; params?: any[] }>;
  released: boolean[];
} {
  const queries: Array<{ sql: string; params?: any[] }> = [];
  const released: boolean[] = [];

  const client: IDbPoolClient = {
    async query<T = any>(sql: string, params?: any[]): Promise<IQueryResult<T>> {
      queries.push({ sql: sql.trim(), params });
      if (queryHandler) {
        return queryHandler(sql, params);
      }
      return { rows: [], rowCount: 0 };
    },
    release: () => {
      released.push(true);
    },
  };

  const pool: IDbPool = {
    connect: async () => client,
    query: async (sql, params) => client.query(sql, params),
    end: async () => {},
  };

  return { pool, queries, released };
}

// ---------------------------------------------------------------------------
// Main test runner
// ---------------------------------------------------------------------------

async function run(): Promise<void> {
  console.log("\n━━━  Phase 3E: Cart & Wishlist Services Tests  ━━━\n");

  // 1. getOrCreateCart creates new cart if none exists
  await test("getOrCreateCart creates new cart for user if none exists", async () => {
    let created = false;
    const mockCartRepo = {
      findByUserId: async () => null,
      create: async (data: any) => {
        created = true;
        return { ...sampleCartRecord, ...data, id: sampleCartId, _id: sampleCartId, items: [] };
      },
    } as unknown as PostgresCartRepository;

    setCartRepository(mockCartRepo);

    const cart = await getOrCreateCart(sampleUserId);
    assert(created, "cart was created");
    assertEqual(cart.userId, sampleUserId, "user id assigned");
    assertEqual(cart.items.length, 0, "initial items empty");
  });

  // 2. getOrCreateCart retrieves existing cart with compatibility methods
  await test("getOrCreateCart retrieves existing cart with compatibility methods (save, markModified)", async () => {
    const mockCartRepo = {
      findByUserId: async () => sampleCartRecord,
      findById: async () => sampleCartRecord,
      updateItem: async () => sampleCartItem,
    } as unknown as PostgresCartRepository;

    setCartRepository(mockCartRepo);

    const cart = await getOrCreateCart(sampleUserId);
    assertEqual(cart.id, sampleCartId, "cart id matches");
    assert(typeof cart.save === "function", "has save() compatibility method");
    assert(typeof cart.markModified === "function", "has markModified() method");

    // Call save and markModified without error
    cart.markModified("items");
    const saved = await cart.save();
    assertEqual(saved.id, sampleCartId, "save() returned cart");
  });

  // 3. getCartItems returns active items only
  await test("getCartItems returns only active items (filters out savedForLater: true)", async () => {
    const activeItem: ICartItemRecord = { ...sampleCartItem, id: "item-1", savedForLater: false };
    const savedItem: ICartItemRecord = { ...sampleCartItem, id: "item-2", savedForLater: true };

    const mockCartRepo = {
      findByUserId: async () => ({
        ...sampleCartRecord,
        items: [activeItem, savedItem],
      }),
    } as unknown as PostgresCartRepository;

    setCartRepository(mockCartRepo);

    const items = await getCartItems(sampleUserId);
    assertEqual(items.length, 1, "only active items returned");
    assertEqual(items[0].id, "item-1", "active item id matches");
    assertEqual(items[0].savedForLater, false, "savedForLater is false");
  });

  // 4. addCartItem resolves product details and price
  await test("addCartItem resolves product details (name, SKU, image, effective sale price) and adds item", async () => {
    let capturedItem: any;
    const { pool } = createMockDbPool();

    const mockCartRepo = {
      findByUserId: async () => ({ ...sampleCartRecord, items: [] }),
      addItem: async (data: any) => {
        capturedItem = data;
        return { ...sampleCartItem, ...data };
      },
    } as unknown as PostgresCartRepository;

    const mockProductRepo = {
      findById: async () => ({ ...sampleProductRecord, isCustomizable: true }),
    } as unknown as PostgresProductRepository;

    setCartCustomizationService({
      validateCustomization: async () => ({ valid: true, errors: [] }),
      calculatePrice: async () => ({ priceModifier: 0, breakdown: [] }),
    });

    setCartDatabasePool(pool);
    setCartRepository(mockCartRepo);
    setCartProductRepository(mockProductRepo);

    const items = await addCartItem(sampleUserId, {
      productId: sampleProductId,
      quantity: 3,
    });

    assertEqual(capturedItem.productId, sampleProductId, "product id matches");
    assertEqual(capturedItem.sku, "BRC-RUD-001", "sku resolved from product");
    assertEqual(capturedItem.name, "Rudraksha Silver Bracelet", "name resolved from product");
    assertEqual(capturedItem.unitPrice, 1999, "effective sale price applied (1999 < 2499)");
    assertEqual(capturedItem.quantity, 3, "quantity matches");
    assertEqual(capturedItem.imageUrl, "https://example.com/rudraksha-primary.jpg", "primary image resolved");
    assert(Array.isArray(items), "returns items array");
  });

  // 5. addCartItem merges quantity for duplicate items with identical customization
  await test("addCartItem merges quantity when adding identical product with identical customizations", async () => {
    let updatedQty: number | undefined;
    const { pool } = createMockDbPool();

    const existingItem: ICartItemRecord = {
      ...sampleCartItem,
      productId: sampleProductId,
      quantity: 2,
      savedForLater: false,
    };

    const mockCartRepo = {
      findByUserId: async () => ({ ...sampleCartRecord, items: [existingItem] }),
      updateItem: async (_id: string, data: any) => {
        updatedQty = data.quantity;
        return { ...existingItem, ...data };
      },
      addItem: async () => {
        throw new Error("Should not add new item for duplicate");
      },
    } as unknown as PostgresCartRepository;

    const mockProductRepo = {
      findById: async () => sampleProductRecord, // stock: 15
    } as unknown as PostgresProductRepository;

    setCartDatabasePool(pool);
    setCartRepository(mockCartRepo);
    setCartProductRepository(mockProductRepo);

    await addCartItem(sampleUserId, {
      productId: sampleProductId,
      quantity: 3, // 2 existing + 3 new = 5 total (<= 15 stock)
    });

    assertEqual(updatedQty, 5, "quantity merged to 5");
  });

  // 6. addCartItem keeps distinct items when customizations differ
  await test("addCartItem keeps distinct items when customization selections differ", async () => {
    let addedDistinct = false;
    const { pool } = createMockDbPool();

    const existingItem: ICartItemRecord = {
      ...sampleCartItem,
      productId: sampleProductId,
      customization: { selections: { size: "medium" } },
      savedForLater: false,
    };

    const mockCartRepo = {
      findByUserId: async () => ({ ...sampleCartRecord, items: [existingItem] }),
      addItem: async (data: any) => {
        addedDistinct = true;
        return { ...sampleCartItem, ...data };
      },
      updateItem: async () => {
        throw new Error("Should not update existing item when customization differs");
      },
    } as unknown as PostgresCartRepository;

    const mockProductRepo = {
      findById: async () => ({ ...sampleProductRecord, isCustomizable: true }),
    } as unknown as PostgresProductRepository;

    setCartCustomizationService({
      validateCustomization: async () => ({ valid: true, errors: [] }),
      calculatePrice: async () => ({ priceModifier: 0, breakdown: [] }),
    });

    setCartDatabasePool(pool);
    setCartRepository(mockCartRepo);
    setCartProductRepository(mockProductRepo);

    await addCartItem(sampleUserId, {
      productId: sampleProductId,
      quantity: 1,
      customization: { selections: { size: "large" } } as any,
    });

    assert(addedDistinct, "added distinct item for different customization");
  });

  // 7. addCartItem throws 404 when product not found
  await test("addCartItem validates product existence (throws AppError 404 when product not found)", async () => {
    const { pool } = createMockDbPool();
    const mockCartRepo = {
      findByUserId: async () => sampleCartRecord,
    } as unknown as PostgresCartRepository;
    const mockProductRepo = {
      findById: async () => null,
      findBySlug: async () => null,
    } as unknown as PostgresProductRepository;

    setCartDatabasePool(pool);
    setCartRepository(mockCartRepo);
    setCartProductRepository(mockProductRepo);

    let error: any = null;
    try {
      await addCartItem(sampleUserId, { productId: "6ae44c64900e0da3e5b0ad00" });
    } catch (e) {
      error = e;
    }

    assert(error instanceof AppError && error.statusCode === 404, "throws 404 on missing product");
  });

  // 8. addCartItem throws 400 when product isActive is false
  await test("addCartItem validates product availability (throws AppError 400 when isActive: false)", async () => {
    const { pool } = createMockDbPool();
    const mockCartRepo = {
      findByUserId: async () => sampleCartRecord,
    } as unknown as PostgresCartRepository;
    const mockProductRepo = {
      findById: async () => ({ ...sampleProductRecord, isActive: false }),
    } as unknown as PostgresProductRepository;

    setCartDatabasePool(pool);
    setCartRepository(mockCartRepo);
    setCartProductRepository(mockProductRepo);

    let error: any = null;
    try {
      await addCartItem(sampleUserId, { productId: sampleProductId });
    } catch (e) {
      error = e;
    }

    assert(error instanceof AppError && error.statusCode === 400, "throws 400 for inactive product");
    assert(error.message.includes("unavailable"), "message explains unavailable");
  });

  // 9. addCartItem throws 400 when product is out of stock (stock <= 0)
  await test("addCartItem validates product stock (throws AppError 400 when product is out of stock)", async () => {
    const { pool } = createMockDbPool();
    const mockCartRepo = {
      findByUserId: async () => sampleCartRecord,
    } as unknown as PostgresCartRepository;
    const mockProductRepo = {
      findById: async () => ({ ...sampleProductRecord, stock: 0 }),
    } as unknown as PostgresProductRepository;

    setCartDatabasePool(pool);
    setCartRepository(mockCartRepo);
    setCartProductRepository(mockProductRepo);

    let error: any = null;
    try {
      await addCartItem(sampleUserId, { productId: sampleProductId, quantity: 1 });
    } catch (e) {
      error = e;
    }

    assert(error instanceof AppError && error.statusCode === 400, "throws 400 for 0 stock");
    assert(error.message.includes("out of stock"), "message notes out of stock");
  });

  // 10. addCartItem throws 400 when requested quantity exceeds available stock
  await test("addCartItem validates insufficient stock for requested quantity (throws AppError 400)", async () => {
    const { pool } = createMockDbPool();
    const mockCartRepo = {
      findByUserId: async () => ({ ...sampleCartRecord, items: [] }),
    } as unknown as PostgresCartRepository;
    const mockProductRepo = {
      findById: async () => ({ ...sampleProductRecord, stock: 3 }),
    } as unknown as PostgresProductRepository;

    setCartDatabasePool(pool);
    setCartRepository(mockCartRepo);
    setCartProductRepository(mockProductRepo);

    let error: any = null;
    try {
      await addCartItem(sampleUserId, { productId: sampleProductId, quantity: 5 });
    } catch (e) {
      error = e;
    }

    assert(error instanceof AppError && error.statusCode === 400, "throws 400 for insufficient stock");
    assert(error.message.includes("Only 3 items available"), "indicates available count");
  });

  // 11. addCartItem validates stock on merge with existing cart items
  await test("addCartItem validates insufficient stock when merging existing quantity + new quantity (throws 400)", async () => {
    const { pool } = createMockDbPool();
    const existingItem: ICartItemRecord = {
      ...sampleCartItem,
      productId: sampleProductId,
      quantity: 4,
      savedForLater: false,
    };

    const mockCartRepo = {
      findByUserId: async () => ({ ...sampleCartRecord, items: [existingItem] }),
    } as unknown as PostgresCartRepository;
    const mockProductRepo = {
      findById: async () => ({ ...sampleProductRecord, stock: 5 }),
    } as unknown as PostgresProductRepository;

    setCartDatabasePool(pool);
    setCartRepository(mockCartRepo);
    setCartProductRepository(mockProductRepo);

    let error: any = null;
    try {
      // 4 in cart + 2 requested = 6 (> 5 available)
      await addCartItem(sampleUserId, { productId: sampleProductId, quantity: 2 });
    } catch (e) {
      error = e;
    }

    assert(error instanceof AppError && error.statusCode === 400, "throws 400 on merge exceeding stock");
  });

  // 12. addCartItem recalculates customization priceModifier and breakdown
  await test("addCartItem recalculates customization priceModifier and breakdown from database", async () => {
    let capturedItem: any;
    const { pool } = createMockDbPool();

    const mockCartRepo = {
      findByUserId: async () => ({ ...sampleCartRecord, items: [] }),
      addItem: async (data: any) => {
        capturedItem = data;
        return { ...sampleCartItem, ...data };
      },
    } as unknown as PostgresCartRepository;

    const mockProductRepo = {
      findById: async () => ({ ...sampleProductRecord, isCustomizable: true }),
    } as unknown as PostgresProductRepository;

    setCartCustomizationService({
      validateCustomization: async () => ({ valid: true, errors: [] }),
      calculatePrice: async () => ({
        priceModifier: 250,
        breakdown: [{ field: "charm", option: "om-silver", modifier: 250 }],
      }),
    });

    setCartDatabasePool(pool);
    setCartRepository(mockCartRepo);
    setCartProductRepository(mockProductRepo);

    await addCartItem(sampleUserId, {
      productId: sampleProductId,
      quantity: 1,
      customization: {
        selections: { charm: "om-silver" },
        engraving: "Renu",
      } as any,
    });

    assert(capturedItem.customization !== undefined, "customization preserved");
    assertEqual(capturedItem.customization.priceModifier, 250, "priceModifier calculated as 250");
    assertEqual(capturedItem.customization.engraving, "Renu", "engraving preserved");
  });

  // 13. addCartItem throws 400 on invalid customization
  await test("addCartItem throws AppError 400 on invalid customization selections", async () => {
    const { pool } = createMockDbPool();
    const mockCartRepo = {
      findByUserId: async () => ({ ...sampleCartRecord, items: [] }),
    } as unknown as PostgresCartRepository;
    const mockProductRepo = {
      findById: async () => ({ ...sampleProductRecord, isCustomizable: true }),
    } as unknown as PostgresProductRepository;

    setCartCustomizationService({
      validateCustomization: async () => ({ valid: false, errors: ["Invalid charm option selected"] }),
      calculatePrice: async () => ({ priceModifier: 0, breakdown: [] }),
    });

    setCartDatabasePool(pool);
    setCartRepository(mockCartRepo);
    setCartProductRepository(mockProductRepo);

    let error: any = null;
    try {
      await addCartItem(sampleUserId, {
        productId: sampleProductId,
        customization: { selections: { nonExistentField: "value" } } as any,
      });
    } catch (e) {
      error = e;
    }

    assert(error instanceof AppError && error.statusCode === 400, "throws 400 on invalid customization");
  });

  // 14. updateCartItemQuantity updates quantity when stock is sufficient
  await test("updateCartItemQuantity updates item quantity when stock is sufficient", async () => {
    let updatedQty: number | undefined;
    const { pool } = createMockDbPool();

    const mockCartRepo = {
      findByUserId: async () => sampleCartRecord,
      getItemById: async () => sampleCartItem,
      updateItem: async (_id: string, data: any) => {
        updatedQty = data.quantity;
        return { ...sampleCartItem, ...data };
      },
    } as unknown as PostgresCartRepository;

    const mockProductRepo = {
      findById: async () => sampleProductRecord, // stock: 15
    } as unknown as PostgresProductRepository;

    setCartDatabasePool(pool);
    setCartRepository(mockCartRepo);
    setCartProductRepository(mockProductRepo);

    await updateCartItemQuantity(sampleUserId, sampleItemId, 5);
    assertEqual(updatedQty, 5, "quantity updated to 5");
  });

  // 15. updateCartItemQuantity removes item when quantity < 1
  await test("updateCartItemQuantity removes item when quantity < 1", async () => {
    let deleted = false;
    const { pool } = createMockDbPool();

    const mockCartRepo = {
      findByUserId: async () => sampleCartRecord,
      getItemById: async () => sampleCartItem,
      deleteItem: async () => {
        deleted = true;
        return true;
      },
    } as unknown as PostgresCartRepository;

    setCartDatabasePool(pool);
    setCartRepository(mockCartRepo);

    await updateCartItemQuantity(sampleUserId, sampleItemId, 0);
    assert(deleted, "item was deleted when quantity set to 0");
  });

  // 16. updateCartItemQuantity throws 400 when quantity exceeds available stock
  await test("updateCartItemQuantity throws AppError 400 when quantity exceeds available stock", async () => {
    const { pool } = createMockDbPool();
    const mockCartRepo = {
      findByUserId: async () => sampleCartRecord,
      getItemById: async () => sampleCartItem,
    } as unknown as PostgresCartRepository;

    const mockProductRepo = {
      findById: async () => ({ ...sampleProductRecord, stock: 5 }),
    } as unknown as PostgresProductRepository;

    setCartDatabasePool(pool);
    setCartRepository(mockCartRepo);
    setCartProductRepository(mockProductRepo);

    let error: any = null;
    try {
      await updateCartItemQuantity(sampleUserId, sampleItemId, 10);
    } catch (e) {
      error = e;
    }

    assert(error instanceof AppError && error.statusCode === 400, "throws 400 when quantity > stock");
  });

  // 17. updateCartItemQuantity verifies ownership (throws 404 for item in another user's cart)
  await test("updateCartItemQuantity verifies cart ownership (throws AppError 404 for other user's item)", async () => {
    const { pool } = createMockDbPool();
    const otherUserCartId = "6ae44c64900e0da3e5b0ad99";
    const otherCartItem: ICartItemRecord = { ...sampleCartItem, cartId: otherUserCartId };

    const mockCartRepo = {
      findByUserId: async () => sampleCartRecord, // user's cart id: sampleCartId
      getItemById: async () => otherCartItem, // item belongs to otherUserCartId
    } as unknown as PostgresCartRepository;

    setCartDatabasePool(pool);
    setCartRepository(mockCartRepo);

    let error: any = null;
    try {
      await updateCartItemQuantity(sampleUserId, sampleItemId, 2);
    } catch (e) {
      error = e;
    }

    assert(error instanceof AppError && error.statusCode === 404, "throws 404 for unowned item");
  });

  // 18. removeCartItem removes item and verifies ownership
  await test("removeCartItem removes item and verifies cart ownership (throws AppError 404 for unowned item)", async () => {
    let deleted = false;
    const { pool } = createMockDbPool();

    const mockCartRepo = {
      findByUserId: async () => sampleCartRecord,
      getItemById: async (_id: string) => sampleCartItem,
      deleteItem: async () => {
        deleted = true;
        return true;
      },
    } as unknown as PostgresCartRepository;

    setCartDatabasePool(pool);
    setCartRepository(mockCartRepo);

    await removeCartItem(sampleUserId, sampleItemId);
    assert(deleted, "item was deleted");

    // Unowned item test
    const unownedRepo = {
      findByUserId: async () => sampleCartRecord,
      getItemById: async () => ({ ...sampleCartItem, cartId: "other-cart-id" }),
    } as unknown as PostgresCartRepository;
    setCartRepository(unownedRepo);

    let error: any = null;
    try {
      await removeCartItem(sampleUserId, sampleItemId);
    } catch (e) {
      error = e;
    }
    assert(error instanceof AppError && error.statusCode === 404, "throws 404 for unowned item");
  });

  // 19. clearCart clears active items and preserves saved-for-later items
  await test("clearCart clears all active items and preserves saved-for-later items", async () => {
    let preserveFlagPassed: boolean | undefined;
    const mockCartRepo = {
      findByUserId: async () => sampleCartRecord,
      clearCartItems: async (_cartId: string, preserveSaved: boolean) => {
        preserveFlagPassed = preserveSaved;
        return 1;
      },
    } as unknown as PostgresCartRepository;

    setCartRepository(mockCartRepo);

    await clearCart(sampleUserId);
    assertEqual(preserveFlagPassed, true, "clearCart preserves saved for later items");
  });

  // 20. addStudioDesignToCart creates custom_design item with studioDesign snapshot
  await test("addStudioDesignToCart creates custom_design item with studioDesign snapshot and formatted SKU", async () => {
    let capturedItem: any;
    const mockCartRepo = {
      findByUserId: async () => sampleCartRecord,
      addItem: async (data: any) => {
        capturedItem = data;
        return { ...sampleCartItem, ...data };
      },
    } as unknown as PostgresCartRepository;

    setCartRepository(mockCartRepo);

    await addStudioDesignToCart(sampleUserId, {
      name: "Custom Healing Bracelet",
      unitPrice: 3200,
      quantity: 1,
      studioDesign: {
        jewelleryType: "bracelet",
        wristMm: 160,
        beadSequence: [{ materialId: "mat-1", displayName: "Amethyst" }],
      },
    });

    assertEqual(capturedItem.itemType, "custom_design", "itemType is custom_design");
    assert(capturedItem.sku.startsWith("STUDIO-BRACELET-"), "sku formatted with STUDIO prefix");
    assertEqual(capturedItem.unitPrice, 3200, "custom price matches");
    assertEqual(capturedItem.studioDesign.wristMm, 160, "studioDesign snapshot preserved");
  });

  // 21. calculateCartTotals calculates subtotal, free shipping, tax, total
  await test("calculateCartTotals calculates subtotal, free shipping threshold (>= ₹1000), and final total", async () => {
    // Under ₹1000: ₹800 + ₹100 shipping = ₹900
    const underThresholdItems: ICartItemRecord[] = [
      { ...sampleCartItem, unitPrice: 400, quantity: 2, savedForLater: false },
    ];
    const totalsUnder = calculateCartTotals(underThresholdItems);
    assertEqual(totalsUnder.subtotal, 800, "subtotal under 1000");
    assertEqual(totalsUnder.shipping, 100, "shipping fee applied");
    assertEqual(totalsUnder.total, 900, "total includes shipping");

    // Over ₹1000: ₹2400 -> free shipping = ₹2400
    const overThresholdItems: ICartItemRecord[] = [
      { ...sampleCartItem, unitPrice: 1200, quantity: 2, savedForLater: false },
    ];
    const totalsOver = calculateCartTotals(overThresholdItems);
    assertEqual(totalsOver.subtotal, 2400, "subtotal over 1000");
    assertEqual(totalsOver.shipping, 0, "free shipping over ₹1000");
    assertEqual(totalsOver.total, 2400, "total without shipping fee");

    // Saved for later items ignored
    const mixedItems: ICartItemRecord[] = [
      { ...sampleCartItem, unitPrice: 500, quantity: 1, savedForLater: false },
      { ...sampleCartItem, unitPrice: 2000, quantity: 1, savedForLater: true },
    ];
    const totalsMixed = calculateCartTotals(mixedItems);
    assertEqual(totalsMixed.subtotal, 500, "saved for later items excluded from subtotal");
  });

  // 22. mergeGuestCart transfers and merges items from session cart into user cart
  await test("mergeGuestCart transfers and merges items from guest session cart into user cart", async () => {
    const { pool } = createMockDbPool();
    let guestCartDeleted = false;
    let userCartAddedItem: any = null;

    const guestItem: ICartItemRecord = {
      ...sampleCartItem,
      id: "guest-item-1",
      cartId: "guest-cart-1",
      quantity: 1,
    };

    const guestCart: ICartRecord = {
      id: "guest-cart-1",
      _id: "guest-cart-1",
      userId: null,
      sessionId: "guest-session-123",
      items: [guestItem],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const mockCartRepo = {
      findBySessionId: async () => guestCart,
      findByUserId: async () => ({ ...sampleCartRecord, items: [] }),
      addItem: async (data: any) => {
        userCartAddedItem = data;
        return { ...sampleCartItem, ...data };
      },
      deleteById: async () => {
        guestCartDeleted = true;
        return true;
      },
    } as unknown as PostgresCartRepository;

    setCartDatabasePool(pool);
    setCartRepository(mockCartRepo);

    await mergeGuestCart("guest-session-123", sampleUserId);

    assert(userCartAddedItem !== null, "item transferred to user cart");
    assertEqual(userCartAddedItem.cartId, sampleCartId, "transferred to user cart id");
    assert(guestCartDeleted, "guest cart deleted after merge");
  });

  // 23. toLegacyCartItem preserves legacy response shape
  await test("toLegacyCartItem preserves legacy response shape with itemType, product_type, price, product", () => {
    const legacy = toLegacyCartItem(sampleCartItem, 0);

    assertEqual(legacy.id, sampleItemId, "item id matches");
    assertEqual(legacy.itemType, "product", "itemType is product");
    assertEqual(legacy.product_type, "bracelet", "product_type derived from BRC prefix");
    assertEqual(legacy.name, "Rudraksha Silver Bracelet", "name matches");
    assertEqual(legacy.price, 1999, "price matches");
    assertEqual(legacy.quantity, 2, "quantity matches");
    assertEqual(legacy.product.name, "Rudraksha Silver Bracelet", "product.name present");
    assertEqual(legacy.product.image, "https://example.com/rudraksha-primary.jpg", "product.image present");
  });

  // 24. Cart transaction rollback on error
  await test("Cart transaction rollback — multi-step cart operation rolls back atomically on failure", async () => {
    const { pool, queries, released } = createMockDbPool((sql) => {
      if (sql.includes("FROM carts")) return { rows: [sampleCartRecord], rowCount: 1 };
      if (sql.includes("FROM cart_items WHERE cart_id")) return { rows: [], rowCount: 0 };
      if (sql.includes("INSERT INTO cart_items")) {
        throw new Error("Simulated cart item insert failure");
      }
      return { rows: [], rowCount: 0 };
    });

    const mockProductRepo = {
      findById: async () => sampleProductRecord,
    } as unknown as PostgresProductRepository;

    setCartDatabasePool(pool);
    setCartRepository(new PostgresCartRepository(pool));
    setCartProductRepository(mockProductRepo);

    let error: any = null;
    try {
      await addCartItem(sampleUserId, {
        productId: sampleProductId,
        quantity: 1,
      });
    } catch (e) {
      error = e;
    }

    assert(error !== null && error.message.includes("Simulated cart item insert failure"), "error propagated");
    const hasRollback = queries.some((q) => q.sql === "ROLLBACK");
    assert(hasRollback, "ROLLBACK executed on failure");
    assert(released[0] === true, "client released back to pool");
  });

  // 25. getWishlist retrieves wishlist with product details and productIds
  await test("getWishlist retrieves wishlist with populated product details and array of productIds", async () => {
    const mockWishlistRepo = {
      findByUserId: async () => [sampleWishlistItem],
    } as unknown as PostgresWishlistRepository;

    setWishlistRepository(mockWishlistRepo);

    const result = await getWishlist(sampleUserId);
    assertEqual(result.items.length, 1, "items length is 1");
    assertEqual(result.items[0].id, sampleWishlistId, "item id matches");
    assertEqual(result.items[0].productId, sampleProductId, "product id matches");
    assertEqual(result.items[0].product.name, "Rudraksha Silver Bracelet", "product name populated");
    assertEqual(result.productIds.length, 1, "productIds array has 1 item");
    assertEqual(result.productIds[0], sampleProductId, "productIds has correct id");

    const rawItems = await getWishlistItems(sampleUserId);
    assertEqual(rawItems.length, 1, "raw wishlist items length is 1");
  });

  // 26. addToWishlist validates product existence
  await test("addToWishlist adds product to wishlist and verifies product exists (throws 404 if missing)", async () => {
    let itemAdded = false;
    const mockWishlistRepo = {
      addItem: async () => {
        itemAdded = true;
        return sampleWishlistItem;
      },
    } as unknown as PostgresWishlistRepository;

    const mockProductRepo = {
      findById: async (id: string) => (id === sampleProductId ? sampleProductRecord : null),
    } as unknown as PostgresProductRepository;

    setWishlistRepository(mockWishlistRepo);
    setWishlistProductRepository(mockProductRepo);

    const added = await addToWishlist(sampleUserId, sampleProductId);
    assert(itemAdded, "item was added to wishlist");
    assertEqual(added.productId, sampleProductId, "product id returned");

    // Missing product throws 404
    let error: any = null;
    try {
      await addToWishlist(sampleUserId, "6ae44c64900e0da3e5b0ad00");
    } catch (e) {
      error = e;
    }
    assert(error instanceof AppError && error.statusCode === 404, "throws 404 for missing product");
  });

  // 27. addToWishlist duplicate prevention via ON CONFLICT
  await test("addToWishlist prevents duplicate items via idempotent upsert (ON CONFLICT)", async () => {
    const { pool, queries } = createMockDbPool((sql) => {
      if (sql.includes("INSERT INTO wishlist_items")) {
        return { rows: [sampleWishlistItem], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });

    const mockProductRepo = {
      findById: async () => sampleProductRecord,
    } as unknown as PostgresProductRepository;

    setWishlistDatabasePool(pool);
    setWishlistRepository(new PostgresWishlistRepository(pool));
    setWishlistProductRepository(mockProductRepo);

    await addToWishlist(sampleUserId, sampleProductId);
    const insertQuery = queries.find((q) => q.sql.includes("INSERT INTO wishlist_items"));
    assert(insertQuery !== undefined, "executed insert query");
    assert(
      insertQuery!.sql.includes("ON CONFLICT (user_id, product_id)") &&
        insertQuery!.sql.includes("DO UPDATE"),
      "contains ON CONFLICT DO UPDATE for idempotency"
    );
  });

  // 28. removeFromWishlist by item ID
  await test("removeFromWishlist removes item by wishlist item ID and verifies user ownership", async () => {
    let deletedId: string | undefined;
    let deletedUserId: string | undefined;

    const mockWishlistRepo = {
      deleteByIdAndUserId: async (id: string, uid: string) => {
        deletedId = id;
        deletedUserId = uid;
        return true;
      },
    } as unknown as PostgresWishlistRepository;

    setWishlistRepository(mockWishlistRepo);

    const removed = await removeFromWishlist(sampleUserId, { itemId: sampleWishlistId });
    assert(removed, "removed returns true");
    assertEqual(deletedId, sampleWishlistId, "item id passed");
    assertEqual(deletedUserId, sampleUserId, "user id passed for ownership");
  });

  // 29. removeFromWishlist by product ID
  await test("removeFromWishlist removes item by product ID", async () => {
    let deletedProductId: string | undefined;
    let deletedUserId: string | undefined;

    const mockWishlistRepo = {
      deleteByUserAndProduct: async (uid: string, pid: string) => {
        deletedUserId = uid;
        deletedProductId = pid;
        return true;
      },
    } as unknown as PostgresWishlistRepository;

    setWishlistRepository(mockWishlistRepo);

    const removed = await removeFromWishlist(sampleUserId, { productId: sampleProductId });
    assert(removed, "removed returns true");
    assertEqual(deletedProductId, sampleProductId, "product id passed");
    assertEqual(deletedUserId, sampleUserId, "user id passed");
  });

  // 30. clearWishlist clears all items for a user
  await test("clearWishlist clears all wishlist items for a user", async () => {
    let clearedUserId: string | undefined;

    const mockWishlistRepo = {
      clearByUserId: async (uid: string) => {
        clearedUserId = uid;
        return 5;
      },
    } as unknown as PostgresWishlistRepository;

    setWishlistRepository(mockWishlistRepo);

    const count = await clearWishlist(sampleUserId);
    assertEqual(count, 5, "cleared count is 5");
    assertEqual(clearedUserId, sampleUserId, "user id passed");
  });

  // 31. isProductInWishlist checks existence
  await test("isProductInWishlist returns true for existing item and false for missing", async () => {
    const mockWishlistRepo = {
      findByUserAndProduct: async (_uid: string, pid: string) => {
        if (pid === sampleProductId) return sampleWishlistItem;
        return null;
      },
    } as unknown as PostgresWishlistRepository;

    setWishlistRepository(mockWishlistRepo);

    const present = await isProductInWishlist(sampleUserId, sampleProductId);
    assertEqual(present, true, "existing item returns true");

    const missing = await isProductInWishlist(sampleUserId, "6ae44c64900e0da3e5b0ad00");
    assertEqual(missing, false, "missing item returns false");
  });

  // 32. Dual ID compatibility — verifies ObjectId and UUID
  await test("Dual ID compatibility — verifies 24-char hex MongoDB ObjectIds and 36-char UUIDs", () => {
    // MongoDB hex ObjectId
    const mongoCart = mapRowToCart({
      id: sampleCartId,
      user_id: sampleUserId,
      session_id: null,
      coupon_code: null,
      created_at: new Date(),
      updated_at: new Date(),
    });
    assertEqual(mongoCart.id, sampleCartId, "mongo cart id");
    assertEqual(mongoCart._id, sampleCartId, "mongo cart _id");

    const mongoItem = mapRowToCartItem({
      id: sampleItemId,
      cart_id: sampleCartId,
      item_type: "product",
      product_id: sampleProductId,
      sku: "BRC-001",
      name: "Bracelet",
      image_url: null,
      unit_price: "1500.00",
      quantity: 1,
      customization: null,
      studio_design: null,
      saved_for_later: false,
      created_at: new Date(),
      updated_at: new Date(),
    });
    assertEqual(mongoItem.id, sampleItemId, "mongo item id");
    assertEqual(mongoItem._id, sampleItemId, "mongo item _id");
    assertEqual(mongoItem.unitPrice, 1500, "unit price parsed to number");

    // UUID
    const uuidCart = mapRowToCart({
      id: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
      user_id: sampleUuidUserId,
      session_id: null,
      coupon_code: null,
      created_at: new Date(),
      updated_at: new Date(),
    });
    assertEqual(uuidCart.id, "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11", "uuid cart id");
    assertEqual(uuidCart._id, "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11", "uuid cart _id");

    const uuidWishlist = mapRowToWishlistItem({
      id: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22",
      user_id: sampleUuidUserId,
      product_id: sampleProductId,
      created_at: new Date(),
      updated_at: new Date(),
      product_name: "Silver Bangle",
      product_sku: "BNG-001",
      product_price: "2999.00",
      product_sale_price: "2499.00",
      product_media: '[{"url":"https://example.com/bangle.jpg"}]',
      product_stock: 8,
      product_is_active: true,
    });
    assertEqual(uuidWishlist.id, "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22", "uuid wishlist id");
    assertEqual(uuidWishlist._id, "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22", "uuid wishlist _id");
    assertEqual(uuidWishlist.product?.name, "Silver Bangle", "product name parsed");
    assertEqual(uuidWishlist.product?.salePrice, 2499, "sale price parsed");
    assertEqual(uuidWishlist.product?.media.length, 1, "media array parsed");
  });

  // ── Results Summary ───────────────────────────────────────────────────────
  console.log(`\n━━━  Results: ${passed} passed, ${failed} failed  ━━━\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

run().catch((err) => {
  console.error("Test runner encountered an unhandled error:", err);
  process.exit(1);
});
