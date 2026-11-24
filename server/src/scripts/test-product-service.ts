/**
 * Phase 3C-3 — Product Service Migration Focused Test Suite
 *
 * Validates:
 *   1.  listProducts maps filter parameters, pagination, and sorting to repository.
 *   2.  listProducts converts isActive "all" and boolean filters correctly.
 *   3.  listProducts returns items with PaginationMeta (page, limit, total, totalPages).
 *   4.  searchProducts delegates to listProducts with query term `q`.
 *   5.  getProductById returns product for valid existing ID.
 *   6.  getProductById throws AppError 404 when product is not found.
 *   7.  getProductById throws AppError 400 for invalid ID format.
 *   8.  getProductBySlug returns product for valid active slug.
 *   9.  getProductBySlug throws AppError 404 for missing slug.
 *  10.  getProductBySlug throws AppError 404 for blank slug without query.
 *  11.  getProductBySku returns product for existing SKU.
 *  12.  getProductBySku throws AppError 404 for missing or blank SKU.
 *  13.  createProduct validates category existence (throws 400 if not found).
 *  14.  createProduct validates subcategory existence (throws 400 if not found).
 *  15.  createProduct auto-generates slug from name and SKU from category productType.
 *  16.  createProduct throws AppError 409 when slug already exists.
 *  17.  createProduct throws AppError 409 when SKU already exists.
 *  18.  createProduct catches 23505 race condition violation and throws AppError 409.
 *  19.  createProduct converts single imageUrl to media array fallback.
 *  20.  updateProduct updates fields and returns updated entity.
 *  21.  updateProduct throws AppError 404 when product not found.
 *  22.  updateProduct throws AppError 400 for invalid ID format.
 *  23.  updateProduct throws AppError 409 if new slug conflicts with another product.
 *  24.  updateProduct throws AppError 409 if new SKU conflicts with another product.
 *  25.  updateProduct validates category and subcategory if updated.
 *  26.  deleteProduct deletes product successfully.
 *  27.  deleteProduct throws AppError 404 if product not found.
 *  28.  deleteProduct throws AppError 400 for invalid ID format.
 *  29.  listLowStockProducts delegates to repository findLowStock with threshold.
 *  30.  adjustStock positive delta increments stock and records inventory_log in transaction.
 *  31.  adjustStock negative delta decrements stock and records inventory_log in transaction.
 *  32.  adjustStock negative delta throws AppError 400 on insufficient stock.
 *  33.  adjustStock throws AppError 404 if product does not exist.
 *  34.  adjustStock throws AppError 400 for non-integer delta or invalid ID.
 *  35.  adjustStock rolls back transaction when inventory log insertion fails.
 *  36.  API compatibility — returned entities provide both id and _id, effectivePrice, isInStock.
 *
 * Run:
 *   node --env-file=server/.env server/node_modules/tsx/dist/cli.mjs \
 *     server/src/scripts/test-product-service.ts
 */

import {
  listProducts,
  searchProducts,
  getProductById,
  getProductBySlug,
  getProductBySku,
  createProduct,
  updateProduct,
  deleteProduct,
  listLowStockProducts,
  adjustStock,
  ProductLean,
} from "../services/product.service.js";
import {
  PostgresProductRepository,
  ProductRecord,
  ProductFilterOptions,
} from "../repositories/postgres-product.repository.js";
import {
  PostgresCategoryRepository,
  CategoryRecord,
} from "../repositories/postgres-category.repository.js";
import { AppError } from "../middleware/errorHandler.js";
import { IDbPool, IDbPoolClient, IQueryResult } from "../types/database.types.js";

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

const sampleProductRecord: ProductRecord = {
  id: "6ae44c64900e0da3e5b0adf9",
  _id: "6ae44c64900e0da3e5b0adf9",
  name: "Royal Kundan Choker Necklace",
  slug: "royal-kundan-choker-necklace",
  description: "Handcrafted choker necklace featuring authentic Kundan stones.",
  shortDescription: "Exquisite Kundan choker.",
  categoryId: "6ae44c64900e0da3e5b0adfa",
  subcategoryId: null,
  price: 4500,
  salePrice: 3999,
  effectivePrice: 3999,
  currency: "INR",
  sku: "REN-KUN-CHK-001",
  stock: 15,
  isInStock: true,
  lowStockThreshold: 3,
  weightGrams: 125.5,
  materialInfo: "Brass with 22k gold polish",
  careInstructions: "Store in airtight pouch",
  additionalInfo: null,
  media: [
    {
      url: "https://example.com/media/choker-1.jpg",
      alt: "Front view",
      type: "image",
      isPrimary: true,
      sortOrder: 0,
    },
  ],
  colors: ["Gold", "Ruby Red"],
  materials: ["Kundan", "Brass"],
  tags: ["choker", "wedding", "bridal"],
  badge: "Bestseller",
  isSignaturePiece: true,
  signatureCategory: "Bridal",
  isActive: true,
  isCustomizable: true,
  averageRating: 4.85,
  reviewCount: 24,
  createdAt: new Date("2026-01-15T10:00:00.000Z"),
  updatedAt: new Date("2026-02-01T12:00:00.000Z"),
};

const sampleCategoryRecord: CategoryRecord = {
  id: "6ae44c64900e0da3e5b0adfa",
  _id: "6ae44c64900e0da3e5b0adfa",
  name: "Necklaces",
  slug: "necklaces",
  description: "Handcrafted necklaces",
  parentId: null,
  productType: "necklace",
  imageUrl: "https://example.com/necklaces.jpg",
  isActive: true,
  showInMenu: true,
  sortOrder: 1,
  customizationFields: [],
  seoTitle: null,
  seoDescription: null,
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-01T00:00:00Z"),
};

const sampleSubcategoryRecord: CategoryRecord = {
  id: "6ae44c64900e0da3e5b0adfb",
  _id: "6ae44c64900e0da3e5b0adfb",
  name: "Chokers",
  slug: "chokers",
  description: "Choker necklaces",
  parentId: "6ae44c64900e0da3e5b0adfa",
  productType: "necklace",
  imageUrl: null,
  isActive: true,
  showInMenu: true,
  sortOrder: 2,
  customizationFields: [],
  seoTitle: null,
  seoDescription: null,
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-01T00:00:00Z"),
};

function createMockProductRepo(overrides: Partial<Record<keyof PostgresProductRepository, any>> = {}): PostgresProductRepository {
  return {
    findAll: async () => [sampleProductRecord],
    count: async () => 1,
    findById: async (id: string) => (id === sampleProductRecord.id ? sampleProductRecord : null),
    findBySlug: async (slug: string) => (slug === sampleProductRecord.slug ? sampleProductRecord : null),
    findBySku: async (sku: string) => (sku === sampleProductRecord.sku ? sampleProductRecord : null),
    findLowStock: async () => [sampleProductRecord],
    existsBySlug: async () => false,
    existsBySku: async () => false,
    create: async (data: any) => ({ ...sampleProductRecord, ...data, id: data.id || sampleProductRecord.id }),
    updateById: async (id: string, data: any) =>
      id === sampleProductRecord.id ? { ...sampleProductRecord, ...data } : null,
    deleteById: async (id: string) => (id === sampleProductRecord.id ? sampleProductRecord : null),
    adjustStock: async () => sampleProductRecord,
    ...overrides,
  } as unknown as PostgresProductRepository;
}

function createMockCategoryRepo(overrides: Partial<Record<keyof PostgresCategoryRepository, any>> = {}): PostgresCategoryRepository {
  return {
    findById: async (id: string) => {
      if (id === sampleCategoryRecord.id) return sampleCategoryRecord;
      if (id === sampleSubcategoryRecord.id) return sampleSubcategoryRecord;
      return null;
    },
    existsBySlug: async () => false,
    ...overrides,
  } as unknown as PostgresCategoryRepository;
}

function createMockDbPool(queryHandler?: (sql: string, params?: any[]) => Promise<IQueryResult<any>> | IQueryResult<any>): {
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
// Main test execution
// ---------------------------------------------------------------------------

async function run(): Promise<void> {
  console.log("\n━━━  Phase 3C-3: Product Service Migration Tests  ━━━\n");

  // 1. listProducts — maps query filters and pagination
  await test("listProducts maps filter parameters, pagination, and sorting to repository", async () => {
    let capturedFilters: ProductFilterOptions | undefined;
    let capturedPagination: any;
    let capturedSort: any;

    const mockRepo = createMockProductRepo({
      findAll: async (filters: any, pagination: any, sort: any) => {
        capturedFilters = filters;
        capturedPagination = pagination;
        capturedSort = sort;
        return [sampleProductRecord];
      },
      count: async () => 42,
    });

    const result = await listProducts(
      {
        page: 2,
        limit: 10,
        categoryId: "6ae44c64900e0da3e5b0adfa",
        minPrice: 1000,
        maxPrice: 5000,
        inStock: "true",
        sort: "price_asc",
      },
      mockRepo
    );

    assertEqual(result.items.length, 1, "items length");
    assertEqual(result.meta.page, 2, "meta.page");
    assertEqual(result.meta.limit, 10, "meta.limit");
    assertEqual(result.meta.total, 42, "meta.total");
    assertEqual(result.meta.totalPages, 5, "meta.totalPages");

    assertEqual(capturedFilters?.categoryId, "6ae44c64900e0da3e5b0adfa", "categoryId filter");
    assertEqual(capturedFilters?.minPrice, 1000, "minPrice filter");
    assertEqual(capturedFilters?.maxPrice, 5000, "maxPrice filter");
    assertEqual(capturedFilters?.inStock, true, "inStock filter boolean");
    assertEqual(capturedPagination?.page, 2, "pagination page");
    assertEqual(capturedPagination?.limit, 10, "pagination limit");
    assertEqual(capturedSort, "price_asc", "sort option");
  });

  // 2. listProducts — isActive filtering
  await test("listProducts converts isActive 'all' and boolean filters correctly", async () => {
    let capturedFilters: ProductFilterOptions | undefined;
    const mockRepo = createMockProductRepo({
      findAll: async (filters: any) => {
        capturedFilters = filters;
        return [];
      },
    });

    await listProducts({ page: 1, limit: 10, isActive: "all" }, mockRepo);
    assertEqual(capturedFilters?.isActive, "all", "isActive is 'all'");

    await listProducts({ page: 1, limit: 10, isActive: "false" }, mockRepo);
    assertEqual(capturedFilters?.isActive, false, "isActive is false");

    await listProducts({ page: 1, limit: 10 }, mockRepo);
    assertEqual(capturedFilters?.isActive, true, "isActive defaults to true");
  });

  // 3. searchProducts
  await test("searchProducts delegates to listProducts with query term `q`", async () => {
    let capturedFilters: ProductFilterOptions | undefined;
    const mockRepo = createMockProductRepo({
      findAll: async (filters: any) => {
        capturedFilters = filters;
        return [sampleProductRecord];
      },
    });

    const result = await searchProducts("kundan", { page: 1, limit: 5 }, mockRepo);
    assertEqual(result.items.length, 1, "returned search results");
    assertEqual(capturedFilters?.q, "kundan", "q filter passed");
  });

  // 4. getProductById — success
  await test("getProductById returns product for valid existing ID", async () => {
    const mockRepo = createMockProductRepo();
    const product = await getProductById(sampleProductRecord.id, mockRepo);
    assertEqual(product.id, sampleProductRecord.id, "product id");
    assertEqual(product.name, sampleProductRecord.name, "product name");
    assertEqual(product.isInStock, true, "isInStock virtual");
    assertEqual(product.effectivePrice, 3999, "effectivePrice virtual");
  });

  // 5. getProductById — 404 missing
  await test("getProductById throws AppError 404 when product is not found", async () => {
    const mockRepo = createMockProductRepo({ findById: async () => null });
    let error: any = null;
    try {
      await getProductById("6ae44c64900e0da3e5b0adfa", mockRepo);
    } catch (e) {
      error = e;
    }
    assert(error instanceof AppError, "is AppError");
    assertEqual(error.statusCode, 404, "status 404");
  });

  // 6. getProductById — 400 invalid ID format
  await test("getProductById throws AppError 400 for invalid ID format", async () => {
    const mockRepo = createMockProductRepo();
    let error: any = null;
    try {
      await getProductById("invalid-id", mockRepo);
    } catch (e) {
      error = e;
    }
    assert(error instanceof AppError, "is AppError");
    assertEqual(error.statusCode, 400, "status 400");
  });

  // 7. getProductBySlug — success
  await test("getProductBySlug returns product for valid active slug", async () => {
    const mockRepo = createMockProductRepo();
    const product = await getProductBySlug("royal-kundan-choker-necklace", mockRepo);
    assertEqual(product.slug, sampleProductRecord.slug, "product slug");
  });

  // 8. getProductBySlug — 404 missing
  await test("getProductBySlug throws AppError 404 for missing slug", async () => {
    const mockRepo = createMockProductRepo({ findBySlug: async () => null });
    let error: any = null;
    try {
      await getProductBySlug("missing-slug", mockRepo);
    } catch (e) {
      error = e;
    }
    assert(error instanceof AppError, "is AppError");
    assertEqual(error.statusCode, 404, "status 404");
  });

  // 9. getProductBySlug — 404 blank slug without query
  await test("getProductBySlug throws AppError 404 for blank slug without query", async () => {
    const mockRepo = createMockProductRepo({
      findBySlug: async () => {
        throw new Error("Should not be called");
      },
    });
    let error: any = null;
    try {
      await getProductBySlug("   ", mockRepo);
    } catch (e) {
      error = e;
    }
    assert(error instanceof AppError, "is AppError");
    assertEqual(error.statusCode, 404, "status 404");
  });

  // 10. getProductBySku — success and 404
  await test("getProductBySku returns product for existing SKU and throws 404 when missing", async () => {
    const mockRepo = createMockProductRepo();
    const product = await getProductBySku("REN-KUN-CHK-001", mockRepo);
    assertEqual(product.sku, "REN-KUN-CHK-001", "product SKU");

    let missingError: any = null;
    try {
      await getProductBySku("MISSING-SKU", createMockProductRepo({ findBySku: async () => null }));
    } catch (e) {
      missingError = e;
    }
    assert(missingError instanceof AppError && missingError.statusCode === 404, "404 on missing SKU");
  });

  // 11. createProduct — category validation
  await test("createProduct validates category existence (throws 400 if not found)", async () => {
    const mockProductRepo = createMockProductRepo();
    const mockCategoryRepo = createMockCategoryRepo({ findById: async () => null });

    let error: any = null;
    try {
      await createProduct(
        {
          name: "Test Necklace",
          description: "Desc",
          categoryId: "6ae44c64900e0da3e5b0adfa",
          price: 1000,
        },
        mockProductRepo,
        mockCategoryRepo
      );
    } catch (e) {
      error = e;
    }
    assert(error instanceof AppError, "is AppError");
    assertEqual(error.statusCode, 400, "status 400");
    assertEqual(error.message, "Category not found", "error message");
  });

  // 12. createProduct — subcategory validation
  await test("createProduct validates subcategory existence (throws 400 if not found)", async () => {
    const mockProductRepo = createMockProductRepo();
    const mockCategoryRepo = createMockCategoryRepo({
      findById: async (id: string) => (id === sampleCategoryRecord.id ? sampleCategoryRecord : null),
    });

    let error: any = null;
    try {
      await createProduct(
        {
          name: "Test Necklace",
          description: "Desc",
          categoryId: sampleCategoryRecord.id,
          subcategoryId: "6ae44c64900e0da3e5b0adfc", // missing subcategory
          price: 1000,
        },
        mockProductRepo,
        mockCategoryRepo
      );
    } catch (e) {
      error = e;
    }
    assert(error instanceof AppError, "is AppError");
    assertEqual(error.statusCode, 400, "status 400");
    assertEqual(error.message, "Subcategory not found", "error message");
  });

  // 13. createProduct — auto slug and SKU generation
  await test("createProduct auto-generates slug from name and SKU from category productType", async () => {
    let capturedData: any;
    const mockProductRepo = createMockProductRepo({
      create: async (data: any) => {
        capturedData = data;
        return { ...sampleProductRecord, ...data };
      },
    });
    const mockCategoryRepo = createMockCategoryRepo();

    const created = await createProduct(
      {
        name: "Emerald Green Choker",
        description: "Handcrafted choker",
        categoryId: sampleCategoryRecord.id,
        price: 2500,
      },
      mockProductRepo,
      mockCategoryRepo
    );

    assertEqual(capturedData.slug, "emerald-green-choker", "generated slug");
    assert(capturedData.sku.startsWith("NEC-"), `generated SKU prefix should be NEC, got ${capturedData.sku}`);
    assertEqual(created.name, "Emerald Green Choker", "created name");
  });

  // 14. createProduct — duplicate slug check (409)
  await test("createProduct throws AppError 409 when slug already exists", async () => {
    const mockProductRepo = createMockProductRepo({ existsBySlug: async () => true });
    const mockCategoryRepo = createMockCategoryRepo();

    let error: any = null;
    try {
      await createProduct(
        {
          name: "Duplicate Necklace",
          slug: "royal-kundan-choker-necklace",
          description: "Desc",
          categoryId: sampleCategoryRecord.id,
          price: 2000,
        },
        mockProductRepo,
        mockCategoryRepo
      );
    } catch (e) {
      error = e;
    }
    assert(error instanceof AppError, "is AppError");
    assertEqual(error.statusCode, 409, "status 409");
    assertEqual(error.message, "Product slug already exists", "error message");
  });

  // 15. createProduct — duplicate SKU check (409)
  await test("createProduct throws AppError 409 when SKU already exists", async () => {
    const mockProductRepo = createMockProductRepo({
      existsBySlug: async () => false,
      existsBySku: async () => true,
    });
    const mockCategoryRepo = createMockCategoryRepo();

    let error: any = null;
    try {
      await createProduct(
        {
          name: "New Necklace",
          sku: "REN-KUN-CHK-001",
          description: "Desc",
          categoryId: sampleCategoryRecord.id,
          price: 2000,
        },
        mockProductRepo,
        mockCategoryRepo
      );
    } catch (e) {
      error = e;
    }
    assert(error instanceof AppError, "is AppError");
    assertEqual(error.statusCode, 409, "status 409");
    assertEqual(error.message, "SKU already exists", "error message");
  });

  // 16. createProduct — catches 23505 race condition
  await test("createProduct catches 23505 race condition violation and throws AppError 409", async () => {
    const mockProductRepo = createMockProductRepo({
      create: async () => {
        const err = new Error("duplicate key value violates unique constraint");
        (err as any).code = "23505";
        throw err;
      },
    });
    const mockCategoryRepo = createMockCategoryRepo();

    let error: any = null;
    try {
      await createProduct(
        {
          name: "Race Condition Piece",
          description: "Desc",
          categoryId: sampleCategoryRecord.id,
          price: 1500,
        },
        mockProductRepo,
        mockCategoryRepo
      );
    } catch (e) {
      error = e;
    }
    assert(error instanceof AppError, "is AppError");
    assertEqual(error.statusCode, 409, "status 409");
  });

  // 17. createProduct — imageUrl fallback to media array
  await test("createProduct converts single imageUrl to media array fallback", async () => {
    let capturedData: any;
    const mockProductRepo = createMockProductRepo({
      create: async (data: any) => {
        capturedData = data;
        return { ...sampleProductRecord, ...data };
      },
    });
    const mockCategoryRepo = createMockCategoryRepo();

    await createProduct(
      {
        name: "Single Image Product",
        description: "Desc",
        categoryId: sampleCategoryRecord.id,
        price: 1000,
        imageUrl: "https://example.com/single.jpg",
      },
      mockProductRepo,
      mockCategoryRepo
    );

    assertEqual(capturedData.media.length, 1, "media length");
    assertEqual(capturedData.media[0].url, "https://example.com/single.jpg", "media url");
    assertEqual(capturedData.media[0].isPrimary, true, "isPrimary true");
  });

  // 18. updateProduct — basic updates
  await test("updateProduct updates fields and returns updated entity", async () => {
    let capturedData: any;
    const mockProductRepo = createMockProductRepo({
      updateById: async (id: string, data: any) => {
        capturedData = data;
        return { ...sampleProductRecord, ...data, id };
      },
    });
    const mockCategoryRepo = createMockCategoryRepo();

    const updated = await updateProduct(
      sampleProductRecord.id,
      {
        name: "Updated Kundan Choker",
        price: 5200,
        stock: 30,
      },
      mockProductRepo,
      mockCategoryRepo
    );

    assertEqual(capturedData.name, "Updated Kundan Choker", "updated name");
    assertEqual(capturedData.price, 5200, "updated price");
    assertEqual(capturedData.stock, 30, "updated stock");
    assertEqual(updated.price, 5200, "returned price");
  });

  // 19. updateProduct — 404 missing
  await test("updateProduct throws AppError 404 when product not found", async () => {
    const mockProductRepo = createMockProductRepo({ updateById: async () => null });
    const mockCategoryRepo = createMockCategoryRepo();

    let error: any = null;
    try {
      await updateProduct("6ae44c64900e0da3e5b0adfa", { name: "Missing" }, mockProductRepo, mockCategoryRepo);
    } catch (e) {
      error = e;
    }
    assert(error instanceof AppError && error.statusCode === 404, "throws 404");
  });

  // 20. updateProduct — 400 invalid ID
  await test("updateProduct throws AppError 400 for invalid ID format", async () => {
    const mockProductRepo = createMockProductRepo();
    const mockCategoryRepo = createMockCategoryRepo();

    let error: any = null;
    try {
      await updateProduct("bad-id", { name: "Bad" }, mockProductRepo, mockCategoryRepo);
    } catch (e) {
      error = e;
    }
    assert(error instanceof AppError && error.statusCode === 400, "throws 400");
  });

  // 21. updateProduct — 409 slug conflict
  await test("updateProduct throws AppError 409 if new slug conflicts with another product", async () => {
    const mockProductRepo = createMockProductRepo({ existsBySlug: async () => true });
    const mockCategoryRepo = createMockCategoryRepo();

    let error: any = null;
    try {
      await updateProduct(
        sampleProductRecord.id,
        { slug: "already-taken-slug" },
        mockProductRepo,
        mockCategoryRepo
      );
    } catch (e) {
      error = e;
    }
    assert(error instanceof AppError && error.statusCode === 409, "throws 409 on slug conflict");
  });

  // 22. updateProduct — 409 SKU conflict
  await test("updateProduct throws AppError 409 if new SKU conflicts with another product", async () => {
    const mockProductRepo = createMockProductRepo({ existsBySku: async () => true });
    const mockCategoryRepo = createMockCategoryRepo();

    let error: any = null;
    try {
      await updateProduct(
        sampleProductRecord.id,
        { sku: "EXISTING-SKU-001" },
        mockProductRepo,
        mockCategoryRepo
      );
    } catch (e) {
      error = e;
    }
    assert(error instanceof AppError && error.statusCode === 409, "throws 409 on SKU conflict");
  });

  // 23. updateProduct — category and subcategory validation
  await test("updateProduct validates category and subcategory if updated", async () => {
    const mockProductRepo = createMockProductRepo();
    const mockCategoryRepo = createMockCategoryRepo({ findById: async () => null });

    let errCat: any = null;
    try {
      await updateProduct(
        sampleProductRecord.id,
        { categoryId: "6ae44c64900e0da3e5b0adfc" },
        mockProductRepo,
        mockCategoryRepo
      );
    } catch (e) {
      errCat = e;
    }
    assert(errCat instanceof AppError && errCat.statusCode === 400, "throws 400 on missing updated category");
  });

  // 24. deleteProduct — success and 404
  await test("deleteProduct deletes product successfully and throws 404 when missing", async () => {
    let deletedId: string | undefined;
    const mockProductRepo = createMockProductRepo({
      deleteById: async (id: string) => {
        deletedId = id;
        return sampleProductRecord;
      },
    });

    await deleteProduct(sampleProductRecord.id, mockProductRepo);
    assertEqual(deletedId, sampleProductRecord.id, "deleted ID matches");

    let error404: any = null;
    try {
      await deleteProduct(
        "6ae44c64900e0da3e5b0adfc",
        createMockProductRepo({ deleteById: async () => null })
      );
    } catch (e) {
      error404 = e;
    }
    assert(error404 instanceof AppError && error404.statusCode === 404, "throws 404 on missing delete");
  });

  // 25. listLowStockProducts
  await test("listLowStockProducts delegates to repository findLowStock with threshold", async () => {
    let capturedThreshold: number | undefined;
    const mockProductRepo = createMockProductRepo({
      findLowStock: async (threshold?: number) => {
        capturedThreshold = threshold;
        return [sampleProductRecord];
      },
    });

    const products = await listLowStockProducts(5, mockProductRepo);
    assertEqual(products.length, 1, "low stock items returned");
    assertEqual(capturedThreshold, 5, "threshold passed to repository");
  });

  // 26. adjustStock — positive delta & inventory_log inside transaction
  await test("adjustStock positive delta increments stock and records inventory_log in transaction", async () => {
    const { pool, queries, released } = createMockDbPool((sql) => {
      if (sql.includes("UPDATE products")) {
        return { rows: [{ id: sampleProductRecord.id, sku: sampleProductRecord.sku, stock: 25 }], rowCount: 1 };
      }
      if (sql.includes("INSERT INTO inventory_logs")) {
        return { rows: [{ id: "log-1" }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });

    const result = await adjustStock(
      sampleProductRecord.id,
      {
        quantityChange: 10,
        action: "add",
        reason: "Supplier shipment",
      },
      createMockProductRepo(),
      pool
    );

    assertEqual(result.previousStock, 15, "previousStock");
    assertEqual(result.newStock, 25, "newStock");

    // Verify transaction statements executed
    const hasBegin = queries.some((q) => q.sql === "BEGIN");
    const hasUpdate = queries.some((q) => q.sql.includes("UPDATE products") && q.sql.includes("stock = stock + $1"));
    const hasLog = queries.some((q) => q.sql.includes("INSERT INTO inventory_logs"));
    const hasCommit = queries.some((q) => q.sql === "COMMIT");

    assert(hasBegin, "BEGIN executed");
    assert(hasUpdate, "atomic stock increment executed");
    assert(hasLog, "inventory_logs inserted");
    assert(hasCommit, "COMMIT executed");
    assert(released[0] === true, "client released back to pool");
  });

  // 27. adjustStock — negative delta & conditional atomic decrement
  await test("adjustStock negative delta decrements stock and records inventory_log in transaction", async () => {
    const { pool, queries } = createMockDbPool((sql) => {
      if (sql.includes("UPDATE products")) {
        return { rows: [{ id: sampleProductRecord.id, sku: sampleProductRecord.sku, stock: 10 }], rowCount: 1 };
      }
      if (sql.includes("INSERT INTO inventory_logs")) {
        return { rows: [{ id: "log-2" }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });

    const result = await adjustStock(
      sampleProductRecord.id,
      {
        quantityChange: -5,
        action: "deduct",
        reason: "Online sale",
      },
      createMockProductRepo(),
      pool
    );

    assertEqual(result.previousStock, 15, "previousStock");
    assertEqual(result.newStock, 10, "newStock");

    const updateQuery = queries.find((q) => q.sql.includes("UPDATE products"));
    assert(updateQuery !== undefined && updateQuery.sql.includes("stock = stock - $1"), "decrements stock");
    assert(updateQuery !== undefined && updateQuery.sql.includes("stock >= $1"), "protects against negative stock");
  });

  // 28. adjustStock — negative delta throws 400 on insufficient stock
  await test("adjustStock negative delta throws AppError 400 on insufficient stock", async () => {
    const { pool } = createMockDbPool((sql) => {
      if (sql.includes("UPDATE products")) {
        // Atomic condition stock >= $1 failed
        return { rows: [], rowCount: 0 };
      }
      if (sql.includes("SELECT id, stock, sku FROM products")) {
        return { rows: [{ id: sampleProductRecord.id, stock: 2, sku: sampleProductRecord.sku }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });

    let error: any = null;
    try {
      await adjustStock(
        sampleProductRecord.id,
        {
          quantityChange: -10,
          action: "deduct",
        },
        createMockProductRepo(),
        pool
      );
    } catch (e) {
      error = e;
    }

    assert(error instanceof AppError, "is AppError");
    assertEqual(error.statusCode, 400, "status 400");
    assertEqual(error.message, "Insufficient stock", "error message matches existing service");
  });

  // 29. adjustStock — missing product throws 404
  await test("adjustStock throws AppError 404 if product does not exist", async () => {
    const { pool } = createMockDbPool(() => ({ rows: [], rowCount: 0 }));

    let error: any = null;
    try {
      await adjustStock(
        sampleProductRecord.id,
        {
          quantityChange: -5,
          action: "deduct",
        },
        createMockProductRepo(),
        pool
      );
    } catch (e) {
      error = e;
    }

    assert(error instanceof AppError, "is AppError");
    assertEqual(error.statusCode, 404, "status 404");
    assertEqual(error.message, "Product not found", "error message");
  });

  // 30. adjustStock — invalid ID and non-integer delta validation
  await test("adjustStock throws AppError 400 for non-integer delta or invalid ID", async () => {
    const { pool } = createMockDbPool();

    let errId: any = null;
    try {
      await adjustStock("invalid-id", { quantityChange: 5, action: "adjust" }, createMockProductRepo(), pool);
    } catch (e) {
      errId = e;
    }
    assert(errId instanceof AppError && errId.statusCode === 400, "rejects invalid ID format");

    let errDelta: any = null;
    try {
      await adjustStock(sampleProductRecord.id, { quantityChange: 2.5, action: "adjust" }, createMockProductRepo(), pool);
    } catch (e) {
      errDelta = e;
    }
    assert(errDelta instanceof AppError && errDelta.statusCode === 400, "rejects float delta");
  });

  // 31. adjustStock — transaction rollback on log insertion failure
  await test("adjustStock rolls back transaction when inventory log insertion fails", async () => {
    const { pool, queries, released } = createMockDbPool((sql) => {
      if (sql.includes("UPDATE products")) {
        return { rows: [{ id: sampleProductRecord.id, sku: sampleProductRecord.sku, stock: 20 }], rowCount: 1 };
      }
      if (sql.includes("INSERT INTO inventory_logs")) {
        throw new Error("Simulated log failure");
      }
      return { rows: [], rowCount: 0 };
    });

    let error: any = null;
    try {
      await adjustStock(
        sampleProductRecord.id,
        { quantityChange: 5, action: "add" },
        createMockProductRepo(),
        pool
      );
    } catch (e) {
      error = e;
    }

    assert(error !== null && error.message.includes("Simulated log failure"), "error propagated");
    const hasRollback = queries.some((q) => q.sql === "ROLLBACK");
    assert(hasRollback, "ROLLBACK executed on failure");
    assert(released[0] === true, "client released back to pool");
  });

  // 32. API response compatibility — id and _id, virtuals
  await test("API compatibility — returned entities provide both id and _id, effectivePrice, isInStock", async () => {
    const mockProductRepo = createMockProductRepo();
    const product: ProductLean = await getProductById(sampleProductRecord.id, mockProductRepo);

    assertEqual(typeof product.id, "string", "product.id is string");
    assertEqual(typeof product._id, "string", "product._id is string");
    assertEqual(product.id, product._id, "id equals _id");
    assertEqual(typeof product.price, "number", "price is number");
    assertEqual(typeof product.effectivePrice, "number", "effectivePrice is number");
    assertEqual(typeof product.isInStock, "boolean", "isInStock is boolean");
    assertEqual(Array.isArray(product.media), true, "media is array");
  });

  // ── Results Summary ───────────────────────────────────────────────────────
  console.log(`\n━━━  Results: ${passed} passed, ${failed} failed  ━━━\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

run().catch((err) => {
  console.error("\n[FATAL] Test runner crashed:", err);
  process.exit(1);
});
