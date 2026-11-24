/**
 * Phase 3C-1 / 3C-2 — PostgreSQL Product Repository Comprehensive Test Suite
 *
 * Validates:
 *   1.  Row mapping and type conversion:
 *       - NUMERIC to number (price, sale_price, weight_grams, average_rating).
 *       - Array preservation for TEXT[] (colors, materials, tags).
 *       - JSONB media parsing & fallback.
 *       - Virtual field calculation: effectivePrice, isInStock.
 *       - Dual identifier compatibility: id and _id both present and identical.
 *   2.  Filtering & WHERE clause generation:
 *       - isActive: true (default) / false / "all".
 *       - categoryId & subcategoryId.
 *       - minPrice & maxPrice.
 *       - Array inclusion ($1 = ANY(materials), color, tag).
 *       - minRating.
 *       - inStock: true (stock > 0) / false (stock = 0).
 *       - isSignaturePiece & signatureCategory.
 *       - Search term q (name, description, sku ILIKE + tags/materials ANY).
 *   3.  Sorting clause allowlist:
 *       - price_asc, price_desc, rating, name, newest.
 *       - Protection against arbitrary sort SQL injection.
 *   4.  Pagination:
 *       - page & limit computation.
 *       - offset override.
 *       - Max limit capping (100).
 *   5.  findById / findBySlug / findBySku / findLowStock read lookups.
 *   6.  Write operations:
 *       - create with required & optional fields, defaults, and media sync.
 *       - create validation errors (invalid IDs, empty strings, negative prices/stock).
 *       - create constraint violation propagation (23505 unique, 23503 foreign key).
 *       - updateById with partial fields, null handling, empty arrays.
 *       - updateById with relational media synchronization.
 *       - updateById strict column allowlisting (rejects id, _id, createdAt, unknown).
 *       - updateById missing product & invalid ID handling.
 *       - deleteById with RETURNING and foreign key error propagation.
 *       - adjustStock positive delta (atomic increment).
 *       - adjustStock negative delta (atomic conditional decrement preventing negative stock).
 *       - adjustStock insufficient stock (AppError 400 with available vs requested).
 *       - adjustStock missing product (AppError 404).
 *       - adjustStock delta 0 and validation (non-integer, invalid ID).
 *       - withTransaction atomicity & rollback on failure.
 *       - Supplied transaction client reuse without nested transactions.
 *       - existsBySlug and existsBySku helpers.
 *   7.  Live read-only Supabase PostgreSQL verification (strictly read-only).
 *
 * Run:
 *   node --env-file=server/.env server/node_modules/tsx/dist/cli.mjs \
 *     server/src/scripts/test-product-repository.ts
 */

import path from "path";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(process.cwd(), "server/.env") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

import {
  PostgresProductRepository,
  ProductDbRow,
  mapRowToProduct,
  computeEffectivePrice,
  ProductFilterOptions,
  CreateProductData,
  ALLOWED_PRODUCT_UPDATE_COLUMNS,
} from "../repositories/postgres-product.repository.js";
import { IDbClient, IQueryResult, IDbPool, IDbPoolClient } from "../types/database.types.js";
import { createPostgresPool } from "../db/postgres.js";

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
// Mock IDbClient & IDbPool factories
// ---------------------------------------------------------------------------

interface MockQueryCall {
  sql: string;
  params?: any[];
}

function createMockDbClient(queryHandler?: (sql: string, params?: any[]) => IQueryResult<any>): {
  client: IDbClient;
  calls: MockQueryCall[];
} {
  const calls: MockQueryCall[] = [];
  const client: IDbClient = {
    async query<T = any>(sql: string, params?: any[]): Promise<IQueryResult<T>> {
      calls.push({ sql, params });
      if (queryHandler) {
        return queryHandler(sql, params);
      }
      return { rows: [], rowCount: 0 };
    },
  };
  return { client, calls };
}

// Sample mock row
function createSampleRow(overrides?: Partial<ProductDbRow>): ProductDbRow {
  return {
    id: "6ae44c64900e0da3e5b0adf9",
    name: "Royal Kundan Choker Necklace",
    slug: "royal-kundan-choker-necklace",
    description: "Handcrafted choker necklace featuring authentic Kundan stones.",
    short_description: "Exquisite Kundan choker.",
    category_id: "6ae44c64900e0da3e5b0adfa",
    subcategory_id: null,
    price: "4500.00",
    sale_price: "3999.00",
    currency: "INR",
    sku: "REN-KUN-CHK-001",
    stock: 15,
    low_stock_threshold: 3,
    weight_grams: "125.50",
    material_info: "Brass with 22k gold polish",
    care_instructions: "Store in airtight pouch",
    additional_info: null,
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
    is_signature_piece: true,
    signature_category: "Bridal",
    is_active: true,
    is_customizable: true,
    average_rating: "4.85",
    review_count: 24,
    created_at: new Date("2026-01-15T10:00:00.000Z"),
    updated_at: new Date("2026-02-01T12:00:00.000Z"),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Unit Test Suites (Read Operations)
// ---------------------------------------------------------------------------

async function runReadUnitTests(): Promise<void> {
  console.log("\n--- Suite 1: Pricing Calculation & Row Mapper ---");

  await test("computeEffectivePrice should handle regular, sale, and edge prices", () => {
    assertEqual(computeEffectivePrice(5000, 4000), 4000, "lower sale price");
    assertEqual(computeEffectivePrice(5000, null), 5000, "null sale price");
    assertEqual(computeEffectivePrice(5000, undefined), 5000, "undefined sale price");
    assertEqual(computeEffectivePrice(5000, 0), 5000, "zero sale price");
    assertEqual(computeEffectivePrice(5000, -100), 5000, "negative sale price");
    assertEqual(computeEffectivePrice(5000, 5000), 5000, "equal price");
    assertEqual(computeEffectivePrice(5000, 6000), 5000, "higher sale price clamped to price");
  });

  await test("mapRowToProduct should convert numeric strings, preserve arrays, parse JSONB, and compute virtuals", () => {
    const row = createSampleRow();
    const record = mapRowToProduct(row);

    assertEqual(record.id, "6ae44c64900e0da3e5b0adf9", "id");
    assertEqual(record._id, "6ae44c64900e0da3e5b0adf9", "_id matches id");
    assertEqual(record.name, "Royal Kundan Choker Necklace", "name");
    assertEqual(record.slug, "royal-kundan-choker-necklace", "slug");
    assertEqual(record.price, 4500, "numeric price");
    assertEqual(record.salePrice, 3999, "numeric salePrice");
    assertEqual(record.effectivePrice, 3999, "derived effectivePrice");
    assertEqual(record.weightGrams, 125.5, "numeric weightGrams");
    assertEqual(record.averageRating, 4.85, "numeric averageRating");
    assertEqual(record.stock, 15, "stock");
    assertEqual(record.isInStock, true, "isInStock (stock 15)");
    assertEqual(record.isSignaturePiece, true, "isSignaturePiece");
    assertEqual(record.signatureCategory, "Bridal", "signatureCategory");

    assertEqual(record.colors.length, 2, "colors count");
    assertEqual(record.colors[0], "Gold", "colors[0]");
    assertEqual(record.materials.length, 2, "materials count");
    assertEqual(record.tags.length, 3, "tags count");

    assertEqual(record.media.length, 1, "media count");
    assertEqual(record.media[0].url, "https://example.com/media/choker-1.jpg", "media url");
    assertEqual(record.media[0].isPrimary, true, "media isPrimary");
  });

  await test("mapRowToProduct should handle null sale price, zero stock, and string media gracefully", () => {
    const row = createSampleRow({
      sale_price: null,
      stock: 0,
      weight_grams: null,
      media: JSON.stringify([{ url: "https://example.com/item.jpg", type: "image" }]),
    });
    const record = mapRowToProduct(row);

    assertEqual(record.salePrice, null, "null salePrice");
    assertEqual(record.effectivePrice, 4500, "effectivePrice defaults to regular price");
    assertEqual(record.stock, 0, "zero stock");
    assertEqual(record.isInStock, false, "isInStock is false when stock is 0");
    assertEqual(record.weightGrams, null, "weightGrams is null");
    assertEqual(record.media.length, 1, "string media parsed as array");
    assertEqual(record.media[0].url, "https://example.com/item.jpg", "parsed media url");
  });

  console.log("\n--- Suite 2: Filter Options & WHERE Clause Generation ---");

  await test("findAll default filters should filter by is_active = true and order by created_at DESC", async () => {
    const { client, calls } = createMockDbClient(() => ({ rows: [], rowCount: 0 }));
    const repo = new PostgresProductRepository(client);

    await repo.findAll(undefined, { page: 1, limit: 20 });

    assertEqual(calls.length, 1, "one query called");
    assert(calls[0].sql.includes("WHERE is_active = $1"), "contains is_active filter");
    assert(calls[0].sql.includes("ORDER BY created_at DESC, id ASC"), "default sort created_at DESC, id ASC");
    assert(calls[0].sql.includes("LIMIT $2 OFFSET $3"), "pagination params");
    assertEqual(calls[0].params?.[0], true, "$1 param is_active");
    assertEqual(calls[0].params?.[1], 20, "$2 limit");
    assertEqual(calls[0].params?.[2], 0, "$3 offset");
  });

  await test("findAll with isActive: 'all' should omit active filter", async () => {
    const { client, calls } = createMockDbClient(() => ({ rows: [], rowCount: 0 }));
    const repo = new PostgresProductRepository(client);

    await repo.findAll({ isActive: "all" });

    assertEqual(calls.length, 1, "one query called");
    assert(!calls[0].sql.includes("WHERE is_active"), "omits is_active filter from WHERE when isActive: 'all'");
  });

  await test("findAll with isActive: false should query is_active = false", async () => {
    const { client, calls } = createMockDbClient(() => ({ rows: [], rowCount: 0 }));
    const repo = new PostgresProductRepository(client);

    await repo.findAll({ isActive: false });

    assertEqual(calls.length, 1, "one query called");
    assert(calls[0].sql.includes("is_active = $1"), "contains is_active filter");
    assertEqual(calls[0].params?.[0], false, "$1 is false");
  });

  await test("findAll should build parameterized filters for category, prices, materials, tags, stock", async () => {
    const { client, calls } = createMockDbClient(() => ({ rows: [], rowCount: 0 }));
    const repo = new PostgresProductRepository(client);

    const filter: ProductFilterOptions = {
      categoryId: "6ae44c64900e0da3e5b0adfa",
      subcategoryId: "6ae44c64900e0da3e5b0adfb",
      minPrice: 1000,
      maxPrice: 5000,
      material: "Kundan",
      color: "Gold",
      tag: "bridal",
      minRating: 4.5,
      inStock: true,
      isSignaturePiece: true,
      signatureCategory: "Bridal",
      q: "choker",
    };

    await repo.findAll(filter, { page: 2, limit: 15 }, "price_asc");

    assertEqual(calls.length, 1, "one query executed");
    const { sql, params } = calls[0];

    assert(sql.includes("is_active = $1"), "active filter");
    assert(sql.includes("category_id = $2"), "category_id filter");
    assert(sql.includes("subcategory_id = $3"), "subcategory_id filter");
    assert(sql.includes("price >= $4"), "minPrice filter");
    assert(sql.includes("price <= $5"), "maxPrice filter");
    assert(sql.includes("$6 = ANY(materials)"), "material ANY filter");
    assert(sql.includes("$7 = ANY(colors)"), "color ANY filter");
    assert(sql.includes("$8 = ANY(tags)"), "tag ANY filter");
    assert(sql.includes("average_rating >= $9"), "minRating filter");
    assert(sql.includes("stock > 0"), "inStock filter");
    assert(sql.includes("is_signature_piece = $10"), "is_signature_piece filter");
    assert(sql.includes("signature_category = $11"), "signature_category filter");
    assert(sql.includes("(name ILIKE $12 OR description ILIKE $12 OR sku ILIKE $12 OR $13 = ANY(tags) OR $13 = ANY(materials))"), "search term filter");

    assert(sql.includes("ORDER BY price ASC, id ASC"), "price_asc sort");
    assert(sql.includes("LIMIT $14 OFFSET $15"), "pagination limit and offset");

    assertEqual(params?.[1], "6ae44c64900e0da3e5b0adfa", "categoryId param");
    assertEqual(params?.[3], 1000, "minPrice param");
    assertEqual(params?.[4], 5000, "maxPrice param");
    assertEqual(params?.[5], "Kundan", "material param");
    assertEqual(params?.[6], "Gold", "color param");
    assertEqual(params?.[7], "bridal", "tag param");
    assertEqual(params?.[8], 4.5, "minRating param");
    assertEqual(params?.[9], true, "isSignaturePiece param");
    assertEqual(params?.[10], "Bridal", "signatureCategory param");
    assertEqual(params?.[11], "%choker%", "search param wildcard");
    assertEqual(params?.[12], "choker", "exact search term for tags/materials");
    assertEqual(params?.[13], 15, "limit param");
    assertEqual(params?.[14], 15, "offset param (page 2 * limit 15)");
  });

  await test("count should use matching WHERE parameters without pagination or order clauses", async () => {
    const { client, calls } = createMockDbClient(() => ({
      rows: [{ count: 42 }],
      rowCount: 1,
    }));
    const repo = new PostgresProductRepository(client);

    const count = await repo.count({
      categoryId: "6ae44c64900e0da3e5b0adfa",
      inStock: false,
    });

    assertEqual(count, 42, "returns total count");
    assertEqual(calls.length, 1, "one query executed");
    assert(calls[0].sql.includes("SELECT COUNT(*)::int AS count"), "count select");
    assert(calls[0].sql.includes("is_active = $1"), "is_active included");
    assert(calls[0].sql.includes("category_id = $2"), "category_id included");
    assert(calls[0].sql.includes("stock = 0"), "stock = 0 included for inStock: false");
    assert(!calls[0].sql.includes("ORDER BY"), "no ORDER BY in count");
    assert(!calls[0].sql.includes("LIMIT"), "no LIMIT in count");
  });

  console.log("\n--- Suite 3: Sorting Allowlist & SQL Injection Protection ---");

  await test("sorting options should map strictly to allowlisted columns", async () => {
    const sortTests: Array<{ sort: string; expectedClause: string }> = [
      { sort: "price_asc", expectedClause: "ORDER BY price ASC, id ASC" },
      { sort: "price_desc", expectedClause: "ORDER BY price DESC, id ASC" },
      { sort: "rating", expectedClause: "ORDER BY average_rating DESC, review_count DESC, id ASC" },
      { sort: "name", expectedClause: "ORDER BY name ASC, id ASC" },
      { sort: "newest", expectedClause: "ORDER BY created_at DESC, id ASC" },
      { sort: "; DROP TABLE products; --", expectedClause: "ORDER BY created_at DESC, id ASC" },
      { sort: "random_unknown_field", expectedClause: "ORDER BY created_at DESC, id ASC" },
    ];

    for (const { sort, expectedClause } of sortTests) {
      const { client, calls } = createMockDbClient(() => ({ rows: [], rowCount: 0 }));
      const repo = new PostgresProductRepository(client);

      await repo.findAll({}, {}, sort);
      assert(calls[0].sql.includes(expectedClause), `Sort "${sort}" should result in "${expectedClause}"`);
    }
  });

  console.log("\n--- Suite 4: Lookups (findById, findBySlug, findBySku, findLowStock) ---");

  await test("findById with valid ID should query by id", async () => {
    const mockRow = createSampleRow({ id: "6ae44c64900e0da3e5b0adf9" });
    const { client, calls } = createMockDbClient(() => ({ rows: [mockRow], rowCount: 1 }));
    const repo = new PostgresProductRepository(client);

    const product = await repo.findById("6ae44c64900e0da3e5b0adf9");

    assertEqual(calls.length, 1, "one query");
    assert(calls[0].sql.includes("WHERE id = $1"), "queries by id");
    assertEqual(calls[0].params?.[0], "6ae44c64900e0da3e5b0adf9", "id param");
    assert(product !== null, "product returned");
    assertEqual(product?.id, "6ae44c64900e0da3e5b0adf9", "product id matches");
  });

  await test("findById with invalid format should return null without running queries", async () => {
    const { client, calls } = createMockDbClient();
    const repo = new PostgresProductRepository(client);

    const result = await repo.findById("invalid-id-format");

    assertEqual(result, null, "returns null");
    assertEqual(calls.length, 0, "no SQL executed for invalid ID");
  });

  await test("findBySlug should normalize slug to lowercase and filter active by default", async () => {
    const mockRow = createSampleRow({ slug: "royal-kundan-choker" });
    const { client, calls } = createMockDbClient(() => ({ rows: [mockRow], rowCount: 1 }));
    const repo = new PostgresProductRepository(client);

    const product = await repo.findBySlug("  Royal-Kundan-Choker  ");

    assertEqual(calls.length, 1, "one query");
    assert(calls[0].sql.includes("WHERE LOWER(slug) = $1 AND is_active = true"), "queries slug and active");
    assertEqual(calls[0].params?.[0], "royal-kundan-choker", "normalized slug");
    assert(product !== null, "returns product");
  });

  await test("findBySlug with activeOnly: false should omit active filter", async () => {
    const mockRow = createSampleRow({ slug: "archived-piece", is_active: false });
    const { client, calls } = createMockDbClient(() => ({ rows: [mockRow], rowCount: 1 }));
    const repo = new PostgresProductRepository(client);

    const product = await repo.findBySlug("archived-piece", { activeOnly: false });

    assertEqual(calls.length, 1, "one query");
    assert(calls[0].sql.includes("WHERE LOWER(slug) = $1"), "slug filter without active requirement");
    assert(!calls[0].sql.includes("is_active = true"), "no is_active requirement when activeOnly: false");
    assertEqual(calls[0].params?.[0], "archived-piece", "slug param");
    assert(product !== null, "returns product");
  });

  await test("findBySku should normalize SKU to uppercase and query accurately", async () => {
    const mockRow = createSampleRow({ sku: "REN-KUN-CHK-001" });
    const { client, calls } = createMockDbClient(() => ({ rows: [mockRow], rowCount: 1 }));
    const repo = new PostgresProductRepository(client);

    const product = await repo.findBySku("  ren-kun-chk-001  ");

    assertEqual(calls.length, 1, "one query");
    assert(calls[0].sql.includes("WHERE sku = $1"), "sku query");
    assertEqual(calls[0].params?.[0], "REN-KUN-CHK-001", "uppercase SKU");
    assert(product !== null, "returns product");
  });

  await test("findLowStock should query products with stock below threshold", async () => {
    // Default threshold uses column
    {
      const { client, calls } = createMockDbClient(() => ({ rows: [], rowCount: 0 }));
      const repo = new PostgresProductRepository(client);

      await repo.findLowStock();

      assertEqual(calls.length, 1, "one query");
      assert(calls[0].sql.includes("stock <= low_stock_threshold"), "uses column threshold");
      assert(calls[0].sql.includes("ORDER BY stock ASC"), "ordered by stock ASC");
      assertEqual(calls[0].params?.length ?? 0, 0, "no extra params");
    }

    // Explicit threshold uses parameterized filter
    {
      const { client, calls } = createMockDbClient(() => ({ rows: [], rowCount: 0 }));
      const repo = new PostgresProductRepository(client);

      await repo.findLowStock(5);

      assertEqual(calls.length, 1, "one query");
      assert(calls[0].sql.includes("stock <= $1"), "uses parameterized threshold");
      assertEqual(calls[0].params?.[0], 5, "threshold param 5");
    }
  });
}

// ---------------------------------------------------------------------------
// Unit Test Suites (Write Operations — Phase 3C-2)
// ---------------------------------------------------------------------------

async function runWriteUnitTests(): Promise<void> {
  console.log("\n--- Suite 5: Product Creation (`create`) ---");

  await test("create inserts product with parameterized SQL and preserves database defaults", async () => {
    const sampleRow = createSampleRow();
    const { client, calls } = createMockDbClient((sql) => {
      if (sql.includes("INSERT INTO products")) {
        return { rows: [sampleRow], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });
    const repo = new PostgresProductRepository(client);

    const input: CreateProductData = {
      name: "  Bridal Kundan Necklace  ",
      slug: "  BRIDAL-KUNDAN-NECKLACE  ",
      sku: "  ren-kun-001  ",
      description: "Handcrafted choker.",
      categoryId: "6ae44c64900e0da3e5b0adfa",
      price: 3500,
    };

    const created = await repo.create(input, client);

    assertEqual(calls.length, 1, "one INSERT query");
    assert(calls[0].sql.includes("INSERT INTO products"), "contains INSERT statement");
    assert(calls[0].sql.includes("RETURNING"), "contains RETURNING clause");

    // Verify parameter normalizations and defaults
    const params = calls[0].params!;
    assertEqual(params[0], "Bridal Kundan Necklace", "trimmed name");
    assertEqual(params[1], "bridal-kundan-necklace", "normalized lowercase slug");
    assertEqual(params[2], "Handcrafted choker.", "description");
    assertEqual(params[3], null, "shortDescription defaults to null");
    assertEqual(params[4], "6ae44c64900e0da3e5b0adfa", "categoryId");
    assertEqual(params[5], null, "subcategoryId defaults to null");
    assertEqual(params[6], 3500, "price");
    assertEqual(params[7], null, "salePrice defaults to null");
    assertEqual(params[8], "INR", "currency defaults to INR");
    assertEqual(params[9], "REN-KUN-001", "normalized uppercase SKU");
    assertEqual(params[10], 0, "stock defaults to 0");
    assertEqual(params[11], 5, "lowStockThreshold defaults to 5");
    assertEqual(params[12], null, "weight_grams defaults to null");
    assertEqual(params[13], null, "material_info defaults to null");
    assertEqual(params[14], null, "care_instructions defaults to null");
    assertEqual(params[15], null, "additional_info defaults to null");
    assertEqual(params[16], "[]", "empty media JSON string");
    assertEqual(params[20], null, "badge defaults to null");
    assertEqual(params[21], false, "isSignaturePiece defaults to false");
    assertEqual(params[22], "none", "signatureCategory defaults to none");
    assertEqual(params[23], true, "isActive defaults to true");
    assertEqual(params[24], true, "isCustomizable defaults to true");
    assertEqual(params[25], 0, "averageRating defaults to 0");
    assertEqual(params[26], 0, "reviewCount defaults to 0");

    assertEqual(created.id, sampleRow.id, "returned created product");
  });

  await test("create with explicit ID passes ID into insert columns", async () => {
    const explicitId = "6ae44c64900e0da3e5b0adfc";
    const sampleRow = createSampleRow({ id: explicitId });
    const { client, calls } = createMockDbClient(() => ({ rows: [sampleRow], rowCount: 1 }));
    const repo = new PostgresProductRepository(client);

    await repo.create(
      {
        id: explicitId,
        name: "Explicit ID Necklace",
        slug: "explicit-id-necklace",
        sku: "REN-EXP-001",
        description: "Test description.",
        categoryId: "6ae44c64900e0da3e5b0adfa",
        price: 2500,
      },
      client
    );

    assertEqual(calls.length, 1, "one query");
    assert(calls[0].sql.includes("id,"), "includes id in column list");
    assertEqual(calls[0].params?.[0], explicitId, "first parameter is explicit id");
  });

  await test("create with media synchronizes both products.media JSONB and product_media rows", async () => {
    const sampleRow = createSampleRow();
    const { client, calls } = createMockDbClient((sql) => {
      if (sql.includes("INSERT INTO products")) {
        return { rows: [sampleRow], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });
    const repo = new PostgresProductRepository(client);

    await repo.create(
      {
        name: "Multi-Image Ring",
        slug: "multi-image-ring",
        sku: "REN-RNG-001",
        description: "Ring with multiple images.",
        categoryId: "6ae44c64900e0da3e5b0adfa",
        price: 1200,
        media: [
          { url: "https://example.com/ring-1.jpg", alt: "Top view", type: "image", isPrimary: true, sortOrder: 0 },
          { url: "https://example.com/ring-2.jpg", alt: "Side view", type: "image", isPrimary: false, sortOrder: 1 },
        ],
      },
      client
    );

    // Call 0: INSERT INTO products
    // Call 1: DELETE FROM product_media WHERE product_id = $1
    // Call 2: INSERT INTO product_media item 1
    // Call 3: INSERT INTO product_media item 2
    assertEqual(calls.length, 4, "4 queries executed: 1 product insert, 1 media clear, 2 media inserts");
    assert(calls[0].sql.includes("INSERT INTO products"), "call 0 is product insert");
    assert(calls[1].sql.includes("DELETE FROM product_media"), "call 1 clears existing media");
    assert(calls[2].sql.includes("INSERT INTO product_media"), "call 2 is media item 1 insert");
    assertEqual(calls[2].params?.[1], "https://example.com/ring-1.jpg", "media 1 URL");
    assertEqual(calls[2].params?.[4], true, "media 1 isPrimary");
    assertEqual(calls[3].params?.[1], "https://example.com/ring-2.jpg", "media 2 URL");
    assertEqual(calls[3].params?.[4], false, "media 2 isPrimary");
  });

  await test("create validates required fields and entity IDs", async () => {
    const { client } = createMockDbClient();
    const repo = new PostgresProductRepository(client);

    const validBase: CreateProductData = {
      name: "Valid Product",
      slug: "valid-product",
      sku: "REN-VAL-001",
      description: "Valid description",
      categoryId: "6ae44c64900e0da3e5b0adfa",
      price: 1000,
    };

    // Invalid category ID
    let errCat: any = null;
    try {
      await repo.create({ ...validBase, categoryId: "invalid-id" }, client);
    } catch (e) {
      errCat = e;
    }
    assert(errCat !== null && errCat.statusCode === 400, "rejects invalid category ID");

    // Invalid subcategory ID
    let errSub: any = null;
    try {
      await repo.create({ ...validBase, subcategoryId: "bad-sub-id" }, client);
    } catch (e) {
      errSub = e;
    }
    assert(errSub !== null && errSub.statusCode === 400, "rejects invalid subcategory ID");

    // Blank name
    let errName: any = null;
    try {
      await repo.create({ ...validBase, name: "   " }, client);
    } catch (e) {
      errName = e;
    }
    assert(errName !== null && errName.statusCode === 400, "rejects blank name");

    // Blank slug
    let errSlug: any = null;
    try {
      await repo.create({ ...validBase, slug: "" }, client);
    } catch (e) {
      errSlug = e;
    }
    assert(errSlug !== null && errSlug.statusCode === 400, "rejects blank slug");

    // Blank SKU
    let errSku: any = null;
    try {
      await repo.create({ ...validBase, sku: "" }, client);
    } catch (e) {
      errSku = e;
    }
    assert(errSku !== null && errSku.statusCode === 400, "rejects blank SKU");

    // Negative price
    let errPrice: any = null;
    try {
      await repo.create({ ...validBase, price: -50 }, client);
    } catch (e) {
      errPrice = e;
    }
    assert(errPrice !== null && errPrice.statusCode === 400, "rejects negative price");

    // Negative stock
    let errStock: any = null;
    try {
      await repo.create({ ...validBase, stock: -1 }, client);
    } catch (e) {
      errStock = e;
    }
    assert(errStock !== null && errStock.statusCode === 400, "rejects negative stock");

    // Invalid rating (> 5)
    let errRating: any = null;
    try {
      await repo.create({ ...validBase, averageRating: 6 }, client);
    } catch (e) {
      errRating = e;
    }
    assert(errRating !== null && errRating.statusCode === 400, "rejects rating > 5");
  });

  await test("create propagates unique constraint (23505) and foreign key (23503) errors", async () => {
    // Unique violation (e.g. duplicate SKU)
    const { client: clientUnique } = createMockDbClient(() => {
      const err = new Error("duplicate key value violates unique constraint 'products_sku_key'");
      (err as any).code = "23505";
      throw err;
    });
    const repoUnique = new PostgresProductRepository(clientUnique);

    let caughtUnique: any = null;
    try {
      await repoUnique.create(
        {
          name: "Dup SKU Product",
          slug: "dup-sku-product",
          sku: "REN-DUP-001",
          description: "Desc",
          categoryId: "6ae44c64900e0da3e5b0adfa",
          price: 100,
        },
        clientUnique
      );
    } catch (e) {
      caughtUnique = e;
    }
    assert(caughtUnique !== null && caughtUnique.code === "23505", "propagates 23505 duplicate error");

    // Foreign key violation (e.g. category does not exist)
    const { client: clientFk } = createMockDbClient(() => {
      const err = new Error('insert or update on table "products" violates foreign key constraint "products_category_id_fkey"');
      (err as any).code = "23503";
      throw err;
    });
    const repoFk = new PostgresProductRepository(clientFk);

    let caughtFk: any = null;
    try {
      await repoFk.create(
        {
          name: "Nonexistent Cat Product",
          slug: "nonexistent-cat-product",
          sku: "REN-NON-001",
          description: "Desc",
          categoryId: "6ae44c64900e0da3e5b0adfa",
          price: 100,
        },
        clientFk
      );
    } catch (e) {
      caughtFk = e;
    }
    assert(caughtFk !== null && caughtFk.code === "23503", "propagates 23503 foreign key error");
  });

  console.log("\n--- Suite 6: Product Updates (`updateById`) ---");

  await test("updateById updates partial fields with parameterized SQL and bumps updated_at", async () => {
    const sampleRow = createSampleRow({ name: "Updated Choker", price: "4800.00", stock: 20 });
    const { client, calls } = createMockDbClient((sql) => {
      if (sql.includes("UPDATE products")) {
        return { rows: [sampleRow], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });
    const repo = new PostgresProductRepository(client);

    const updated = await repo.updateById(
      "6ae44c64900e0da3e5b0adf9",
      {
        name: "  Updated Choker  ",
        price: 4800,
        stock: 20,
      },
      client
    );

    assertEqual(calls.length, 1, "one UPDATE query executed");
    const { sql, params } = calls[0];

    assert(sql.includes("UPDATE products"), "contains UPDATE");
    assert(sql.includes("name = $1"), "updates name");
    assert(sql.includes("price = $2"), "updates price");
    assert(sql.includes("stock = $3"), "updates stock");
    assert(sql.includes("updated_at = NOW()"), "bumps updated_at timestamp");
    assert(sql.includes("WHERE id = $4"), "WHERE id parameter index");

    assertEqual(params?.[0], "Updated Choker", "trimmed name");
    assertEqual(params?.[1], 4800, "numeric price");
    assertEqual(params?.[2], 20, "stock");
    assertEqual(params?.[3], "6ae44c64900e0da3e5b0adf9", "id param");

    assert(updated !== null, "returned updated product");
    assertEqual(updated?.name, "Updated Choker", "updated name matches");
    assertEqual(updated?.price, 4800, "updated price matches");
  });

  await test("updateById handles null values and empty arrays correctly", async () => {
    const sampleRow = createSampleRow({ sale_price: null, short_description: null, colors: [] });
    const { client, calls } = createMockDbClient((sql) => {
      if (sql.includes("UPDATE products")) {
        return { rows: [sampleRow], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });
    const repo = new PostgresProductRepository(client);

    await repo.updateById(
      "6ae44c64900e0da3e5b0adf9",
      {
        salePrice: null,
        shortDescription: null,
        colors: [],
      },
      client
    );

    assertEqual(calls.length, 1, "one UPDATE query executed");
    const { params } = calls[0];
    assertEqual(params?.[0], null, "sale_price set to null");
    assertEqual(params?.[1], null, "short_description set to null");
    assertEqual(Array.isArray(params?.[2]) && params?.[2].length === 0, true, "colors set to empty array");
  });

  await test("updateById with media synchronizes product_media relational rows", async () => {
    const sampleRow = createSampleRow();
    const { client, calls } = createMockDbClient((sql) => {
      if (sql.includes("UPDATE products")) {
        return { rows: [sampleRow], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });
    const repo = new PostgresProductRepository(client);

    await repo.updateById(
      "6ae44c64900e0da3e5b0adf9",
      {
        media: [
          { url: "https://example.com/new-1.jpg", alt: "New Image", type: "image", isPrimary: true, sortOrder: 0 },
        ],
      },
      client
    );

    // Call 0: UPDATE products
    // Call 1: DELETE FROM product_media WHERE product_id = $1
    // Call 2: INSERT INTO product_media (url: new-1.jpg)
    assertEqual(calls.length, 3, "UPDATE products, DELETE media, and INSERT media");
    assert(calls[0].sql.includes("UPDATE products"), "call 0 is product update");
    assert(calls[1].sql.includes("DELETE FROM product_media"), "call 1 deletes old media");
    assert(calls[2].sql.includes("INSERT INTO product_media"), "call 2 inserts new media");
    assertEqual(calls[2].params?.[1], "https://example.com/new-1.jpg", "inserted media URL");
  });

  await test("updateById enforces strict column allowlist and rejects immutable or arbitrary fields", async () => {
    assert(!("id" in ALLOWED_PRODUCT_UPDATE_COLUMNS), "id is not in update allowlist");
    assert(!("_id" in ALLOWED_PRODUCT_UPDATE_COLUMNS), "_id is not in update allowlist");
    assert(!("createdAt" in ALLOWED_PRODUCT_UPDATE_COLUMNS), "createdAt is not in update allowlist");
    assert(!("updatedAt" in ALLOWED_PRODUCT_UPDATE_COLUMNS), "updatedAt is not in update allowlist");
    assert("name" in ALLOWED_PRODUCT_UPDATE_COLUMNS, "name is in update allowlist");
    assert("price" in ALLOWED_PRODUCT_UPDATE_COLUMNS, "price is in update allowlist");
    assert("stock" in ALLOWED_PRODUCT_UPDATE_COLUMNS, "stock is in update allowlist");

    const { client } = createMockDbClient();
    const repo = new PostgresProductRepository(client);

    // Test rejection of immutable primary keys
    const invalidAttempts = [
      { id: "6ae44c64900e0da3e5b0adfa" },
      { _id: "6ae44c64900e0da3e5b0adfa" },
      { createdAt: new Date() },
      { updatedAt: new Date() },
      { unknownField: "malicious_injection" },
      { "stock = 100; --": "sql injection" },
    ];

    for (const badInput of invalidAttempts) {
      let rejected = false;
      try {
        await repo.updateById("6ae44c64900e0da3e5b0adf9", badInput as any, client);
      } catch (err: any) {
        rejected = err.message.includes("Unsupported update field");
      }
      assert(rejected, `Should reject unsupported update field in ${JSON.stringify(badInput)}`);
    }
  });

  await test("updateById returns null when product does not exist", async () => {
    const { client } = createMockDbClient(() => ({ rows: [], rowCount: 0 }));
    const repo = new PostgresProductRepository(client);

    const result = await repo.updateById("6ae44c64900e0da3e5b0adf9", { name: "Ghost" }, client);
    assertEqual(result, null, "returns null for non-existent product");
  });

  await test("updateById rejects invalid entity ID without executing SQL", async () => {
    const { client, calls } = createMockDbClient();
    const repo = new PostgresProductRepository(client);

    let rejected = false;
    try {
      await repo.updateById("invalid-id-format", { name: "Test" }, client);
    } catch (err: any) {
      rejected = err.statusCode === 400;
    }
    assert(rejected, "rejects invalid ID with statusCode 400");
    assertEqual(calls.length, 0, "no query executed");
  });

  console.log("\n--- Suite 7: Product Deletion (`deleteById`) ---");

  await test("deleteById deletes product using RETURNING and returns mapped entity", async () => {
    const sampleRow = createSampleRow();
    const { client, calls } = createMockDbClient(() => ({ rows: [sampleRow], rowCount: 1 }));
    const repo = new PostgresProductRepository(client);

    const deleted = await repo.deleteById("6ae44c64900e0da3e5b0adf9", client);

    assertEqual(calls.length, 1, "one DELETE query executed");
    assert(calls[0].sql.includes("DELETE FROM products") && calls[0].sql.includes("WHERE id = $1"), "contains DELETE query");
    assert(calls[0].sql.includes("RETURNING"), "contains RETURNING clause");
    assertEqual(calls[0].params?.[0], "6ae44c64900e0da3e5b0adf9", "id param");

    assert(deleted !== null, "returned deleted entity");
    assertEqual(deleted?.id, "6ae44c64900e0da3e5b0adf9", "deleted product ID matches");
  });

  await test("deleteById returns null when product does not exist", async () => {
    const { client } = createMockDbClient(() => ({ rows: [], rowCount: 0 }));
    const repo = new PostgresProductRepository(client);

    const result = await repo.deleteById("6ae44c64900e0da3e5b0adf9", client);
    assertEqual(result, null, "returns null when product not found");
  });

  await test("deleteById propagates foreign key violation (23503) directly to caller", async () => {
    const { client } = createMockDbClient(() => {
      const err = new Error('update or delete on table "products" violates foreign key constraint "order_items_product_id_fkey"');
      (err as any).code = "23503";
      throw err;
    });
    const repo = new PostgresProductRepository(client);

    let caughtFk: any = null;
    try {
      await repo.deleteById("6ae44c64900e0da3e5b0adf9", client);
    } catch (e) {
      caughtFk = e;
    }
    assert(caughtFk !== null && caughtFk.code === "23503", "propagates foreign key constraint error");
  });

  console.log("\n--- Suite 8: Inventory & Stock Adjustments (`adjustStock`) ---");

  await test("adjustStock with positive delta increments stock atomically", async () => {
    const sampleRow = createSampleRow({ stock: 25 });
    const { client, calls } = createMockDbClient(() => ({ rows: [sampleRow], rowCount: 1 }));
    const repo = new PostgresProductRepository(client);

    const result = await repo.adjustStock("6ae44c64900e0da3e5b0adf9", 10, client);

    assertEqual(calls.length, 1, "one UPDATE query executed");
    assert(calls[0].sql.includes("SET stock = stock + $1"), "stock increment SQL");
    assert(calls[0].sql.includes("updated_at = NOW()"), "bumps updated_at");
    assertEqual(calls[0].params?.[0], 10, "delta param 10");
    assertEqual(calls[0].params?.[1], "6ae44c64900e0da3e5b0adf9", "id param");
    assertEqual(result.stock, 25, "returned stock is 25");
  });

  await test("adjustStock with negative delta decrements stock atomically when sufficient", async () => {
    const sampleRow = createSampleRow({ stock: 10 });
    const { client, calls } = createMockDbClient(() => ({ rows: [sampleRow], rowCount: 1 }));
    const repo = new PostgresProductRepository(client);

    const result = await repo.adjustStock("6ae44c64900e0da3e5b0adf9", -5, client);

    assertEqual(calls.length, 1, "one UPDATE query executed");
    assert(calls[0].sql.includes("SET stock = stock - $1"), "stock decrement SQL");
    assert(calls[0].sql.includes("stock >= $1"), "prevents negative stock with condition");
    assertEqual(calls[0].params?.[0], 5, "absolute delta 5");
    assertEqual(calls[0].params?.[1], "6ae44c64900e0da3e5b0adf9", "id param");
    assertEqual(result.stock, 10, "returned stock is 10");
  });

  await test("adjustStock with negative delta throws AppError 400 when stock is insufficient", async () => {
    // When stock < requested, atomic update matches 0 rows. Secondary check returns current stock.
    const { client, calls } = createMockDbClient((sql) => {
      if (sql.includes("UPDATE products")) {
        return { rows: [], rowCount: 0 }; // Condition stock >= $1 failed
      }
      if (sql.includes("SELECT id, stock, sku FROM products")) {
        return { rows: [{ id: "6ae44c64900e0da3e5b0adf9", stock: 3, sku: "REN-KUN-CHK-001" }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });
    const repo = new PostgresProductRepository(client);

    let caughtErr: any = null;
    try {
      await repo.adjustStock("6ae44c64900e0da3e5b0adf9", -10, client);
    } catch (e) {
      caughtErr = e;
    }

    assertEqual(calls.length, 2, "2 queries: failed update followed by check query");
    assert(caughtErr !== null, "error thrown");
    assertEqual(caughtErr.statusCode, 400, "error statusCode is 400");
    assert(caughtErr.message.includes("Insufficient stock"), "error message mentions insufficient stock");
    assert(caughtErr.message.includes("Available: 3"), "error message mentions available stock");
    assert(caughtErr.message.includes("requested reduction: 10"), "error message mentions requested reduction");
  });

  await test("adjustStock throws AppError 404 when product is missing", async () => {
    const { client } = createMockDbClient(() => ({ rows: [], rowCount: 0 }));
    const repo = new PostgresProductRepository(client);

    let caughtErr: any = null;
    try {
      await repo.adjustStock("6ae44c64900e0da3e5b0adf9", -5, client);
    } catch (e) {
      caughtErr = e;
    }

    assert(caughtErr !== null, "error thrown");
    assertEqual(caughtErr.statusCode, 404, "error statusCode is 404");
    assert(caughtErr.message.includes("Product not found"), "error message mentions product not found");
  });

  await test("adjustStock with delta 0 returns existing product without update", async () => {
    const sampleRow = createSampleRow({ stock: 15 });
    const { client, calls } = createMockDbClient(() => ({ rows: [sampleRow], rowCount: 1 }));
    const repo = new PostgresProductRepository(client);

    const result = await repo.adjustStock("6ae44c64900e0da3e5b0adf9", 0, client);

    assertEqual(calls.length, 1, "only findById query executed");
    assert(calls[0].sql.includes("SELECT"), "query was a SELECT, not an UPDATE");
    assertEqual(result.stock, 15, "stock remains 15");
  });

  await test("adjustStock rejects non-integer deltas and invalid IDs", async () => {
    const { client } = createMockDbClient();
    const repo = new PostgresProductRepository(client);

    let errNonInt: any = null;
    try {
      await repo.adjustStock("6ae44c64900e0da3e5b0adf9", 2.5, client);
    } catch (e) {
      errNonInt = e;
    }
    assert(errNonInt !== null && errNonInt.statusCode === 400, "rejects float delta with statusCode 400");

    let errId: any = null;
    try {
      await repo.adjustStock("invalid-id", 5, client);
    } catch (e) {
      errId = e;
    }
    assert(errId !== null && errId.statusCode === 400, "rejects invalid ID with statusCode 400");
  });

  console.log("\n--- Suite 9: Transaction Safety & Supplied Client Reuse ---");

  await test("create automatically uses withTransaction when no client is supplied and rolls back on media failure", async () => {
    const sampleRow = createSampleRow();
    const queriesExecuted: string[] = [];
    let releaseCalled = false;

    const mockPoolClient: IDbPoolClient = {
      async query<T = any>(sql: string): Promise<IQueryResult<T>> {
        queriesExecuted.push(sql.trim());
        if (sql.includes("BEGIN") || sql.includes("ROLLBACK")) {
          return { rows: [], rowCount: 0 };
        }
        if (sql.includes("INSERT INTO products")) {
          return { rows: [sampleRow as any], rowCount: 1 };
        }
        if (sql.includes("DELETE FROM product_media")) {
          // Simulate media error triggering rollback
          throw new Error("Simulated media failure during sync");
        }
        return { rows: [], rowCount: 0 };
      },
      release: () => {
        releaseCalled = true;
      },
    };

    const mockPool: IDbPool = {
      connect: async () => mockPoolClient,
      query: async () => ({ rows: [], rowCount: 0 }),
      end: async () => {},
    };

    const repo = new PostgresProductRepository(mockPool as any);

    let caughtErr: any = null;
    try {
      await repo.create({
        name: "Failing Tx Product",
        slug: "failing-tx-product",
        sku: "REN-FAIL-001",
        description: "Desc",
        categoryId: "6ae44c64900e0da3e5b0adfa",
        price: 1000,
        media: [{ url: "https://example.com/fail.jpg", type: "image" }],
      });
    } catch (e) {
      caughtErr = e;
    }

    assert(caughtErr !== null, "error propagated");
    assert(caughtErr.message.includes("Simulated media failure"), "contains media failure message");
    assertEqual(queriesExecuted[0], "BEGIN", "first statement was BEGIN");
    assert(queriesExecuted[1].includes("INSERT INTO products"), "second was product insert");
    assert(queriesExecuted[2].includes("DELETE FROM product_media"), "third was media clear");
    assertEqual(queriesExecuted[3], "ROLLBACK", "final statement was ROLLBACK");
    assert(releaseCalled, "client was released back to pool in finally block");
  });

  await test("supplied client is reused directly without opening nested transactions", async () => {
    const sampleRow = createSampleRow();
    const { client, calls } = createMockDbClient((sql) => {
      if (sql.includes("INSERT INTO products")) {
        return { rows: [sampleRow], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });
    const repo = new PostgresProductRepository();

    await repo.create(
      {
        name: "Reused Client Product",
        slug: "reused-client-product",
        sku: "REN-REUSE-001",
        description: "Desc",
        categoryId: "6ae44c64900e0da3e5b0adfa",
        price: 1500,
      },
      client
    );

    // Assert that no BEGIN or COMMIT queries were sent to the supplied client
    const hasBegin = calls.some((c) => c.sql.includes("BEGIN"));
    const hasCommit = calls.some((c) => c.sql.includes("COMMIT"));
    assert(!hasBegin, "does not send BEGIN to supplied client (avoids nested transaction)");
    assert(!hasCommit, "does not send COMMIT to supplied client");
  });

  await test("existsBySlug and existsBySku check existence with and without excludeId", async () => {
    const { client, calls } = createMockDbClient(() => ({ rows: [{ "?column?": 1 }], rowCount: 1 }));
    const repo = new PostgresProductRepository(client);

    const slugExists = await repo.existsBySlug("royal-kundan-choker");
    assertEqual(slugExists, true, "slug exists");
    assert(calls[0].sql.includes("LOWER(slug) = $1"), "case-insensitive slug check");

    const slugExistsExclude = await repo.existsBySlug("royal-kundan-choker", "6ae44c64900e0da3e5b0adfa");
    assertEqual(slugExistsExclude, true, "slug exists with exclude");
    assert(calls[1].sql.includes("id != $2"), "excludes specified ID");

    const skuExists = await repo.existsBySku("ren-kun-001");
    assertEqual(skuExists, true, "sku exists");
    assert(calls[2].sql.includes("UPPER(sku) = $1"), "uppercase SKU check");

    const skuExistsExclude = await repo.existsBySku("ren-kun-001", "6ae44c64900e0da3e5b0adfa");
    assertEqual(skuExistsExclude, true, "sku exists with exclude");
    assert(calls[3].sql.includes("id != $2"), "excludes specified ID");
  });
}

// ---------------------------------------------------------------------------
// Live Read-Only Supabase Database Verification (Strictly Read-Only!)
// ---------------------------------------------------------------------------

async function runLiveVerification(): Promise<void> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.log("\n[SKIP] DATABASE_URL not set — skipping live Supabase verification.");
    return;
  }

  console.log("\n--- Suite 10: Live Read-Only Supabase Database Verification ---");

  let pool;
  try {
    pool = createPostgresPool({ connectionTimeoutMillis: 45000 });
    const repo = new PostgresProductRepository(pool);

    // 1. Fetch total count (read-only)
    const totalCount = await repo.count({ isActive: "all" });
    console.log(`  Live products count (all): ${totalCount}`);
    assert(totalCount > 0, "Live database has migrated products");

    // 2. Fetch first page of products (read-only)
    const products = await repo.findAll({ isActive: "all" }, { page: 1, limit: 5 });
    assert(products.length > 0, "findAll returned migrated products");
    console.log(`  Live findAll returned ${products.length} products`);

    const first = products[0];
    console.log(`  Sample product: [${first.sku}] "${first.name}" — Price: ₹${first.price}, Effective: ₹${first.effectivePrice}, Stock: ${first.stock}`);

    // Verify properties
    assert(typeof first.id === "string" && first.id.length > 0, "id is string");
    assertEqual(first.id, first._id, "id equals _id");
    assert(typeof first.price === "number", "price is number");
    assert(typeof first.effectivePrice === "number", "effectivePrice is number");
    assert(typeof first.isInStock === "boolean", "isInStock is boolean");
    assert(Array.isArray(first.colors), "colors is array");
    assert(Array.isArray(first.materials), "materials is array");
    assert(Array.isArray(first.tags), "tags is array");
    assert(Array.isArray(first.media), "media is array");

    // 3. Lookup by ID (read-only)
    const byId = await repo.findById(first.id);
    assert(byId !== null, "findById returned product");
    assertEqual(byId?.id, first.id, "findById returned matching product ID");

    // 4. Lookup by Slug (read-only)
    const bySlug = await repo.findBySlug(first.slug, { activeOnly: false });
    assert(bySlug !== null, "findBySlug returned product");
    assertEqual(bySlug?.slug, first.slug, "findBySlug matched slug");

    // 5. Lookup by SKU (read-only)
    const bySku = await repo.findBySku(first.sku);
    assert(bySku !== null, "findBySku returned product");
    assertEqual(bySku?.sku, first.sku, "findBySku matched SKU");

    // 6. Test low stock query (read-only)
    const lowStock = await repo.findLowStock(100);
    console.log(`  Live lowStock products (<=100): ${lowStock.length}`);
    assert(Array.isArray(lowStock), "findLowStock returned array");

    // 7. Test exists queries (read-only)
    const slugExists = await repo.existsBySlug(first.slug);
    assertEqual(slugExists, true, "live existsBySlug confirmed");

    const skuExists = await repo.existsBySku(first.sku);
    assertEqual(skuExists, true, "live existsBySku confirmed");

    console.log("  ✓  All live Supabase read-only operations succeeded (0 database writes performed)!");
    passed++;
  } catch (err: any) {
    if (err?.code === "ENOTFOUND" || err?.message?.includes("ENOTFOUND")) {
      console.log(`  [INFO] Network isolated in current sandbox mode (${err?.message})`);
      console.log(`  [INFO] Unit tests verify all SQL and mapping. Run with BypassSandbox for live pool.`);
    } else {
      console.error("  ✗  Live Supabase verification failed:", err?.message ?? err);
      failed++;
    }
  } finally {
    if (pool) {
      await pool.end();
    }
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log("============================================================");
  console.log("Phase 3C-1 / 3C-2: PostgreSQL Product Repository Test Suite");
  console.log("============================================================");

  await runReadUnitTests();
  await runWriteUnitTests();
  await runLiveVerification();

  console.log("\n============================================================");
  console.log(`Tests completed: ${passed} passed, ${failed} failed`);
  console.log("============================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
