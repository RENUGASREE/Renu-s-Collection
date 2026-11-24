/**
 * Phase 3B-2 — PostgreSQL Category Repository Focused Test Suite
 *
 * Validates:
 *   1.  Successful category retrieval & field mapping (both id and _id present, camelCase).
 *   2.  Empty results handling (returns []).
 *   3.  Lookup by valid ID (parameterized query, returns mapped record).
 *   4.  Invalid ID handling (assertValidEntityId throws 400, prevents query execution).
 *   5.  Missing category behavior by ID (returns null).
 *   6.  Lookup by slug (case-insensitive, parameterized query).
 *   7.  Missing category behavior by slug (returns null).
 *   8.  Active filtering (adds is_active = $1 to WHERE clause).
 *   9.  Inactive filtering (adds is_active = $1 with false).
 *  10.  Menu filtering (adds show_in_menu = $1).
 *  11.  Product type filtering (adds product_type = $1).
 *  12.  Parent ID filtering (parent_id IS NULL vs parent_id = $1).
 *  13.  Combined filter parameterization ($1, $2, $3... indexing).
 *  14.  Default ordering semantics (ORDER BY sort_order ASC, name ASC).
 *  15.  Nullable fields handling (description, parentId, imageUrl, seoTitle, seoDescription).
 *  16.  SQL parameterization (strict separation of SQL and parameter values).
 *  17.  countByParentId and existsBySlug helper methods.
 *  18.  Read-only live database verification (if DATABASE_URL is configured).
 *
 * Run:
 *   node --env-file=server/.env server/node_modules/tsx/dist/cli.mjs \
 *     server/src/scripts/test-category-repository.ts
 */

import path from "path";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(process.cwd(), "server/.env") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

import {
  PostgresCategoryRepository,
  CategoryDbRow,
  mapRowToCategory,
  CreateCategoryData,
  UpdateCategoryData,
} from "../repositories/postgres-category.repository.js";
import { IDbClient, IQueryResult, IDbPool, IDbPoolClient } from "../types/database.types.js";
import { createPostgresPool, withTransaction } from "../db/postgres.js";

// ---------------------------------------------------------------------------
// Test runner
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
// Mock IDbClient factory for unit testing queries & parameters
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

// Sample complete row fixture
const sampleCategoryRow: CategoryDbRow = {
  id: "6aa14bc803bc2db28142fcef",
  name: "Classic Bracelets",
  slug: "classic-bracelets",
  description: "Handcrafted designer bracelets",
  parent_id: null,
  product_type: "bracelet",
  image_url: "https://example.com/images/bracelets.jpg",
  is_active: true,
  show_in_menu: true,
  sort_order: 10,
  customization_fields: [
    { key: "size", label: "Size", type: "select", options: [{ value: "S", label: "Small" }] },
  ],
  seo_title: "Classic Bracelets | Renu's Collections",
  seo_description: "Explore our collection of bracelets.",
  created_at: new Date("2026-01-01T00:00:00Z"),
  updated_at: new Date("2026-01-02T00:00:00Z"),
};

// Sample row with all nullable fields set to null
const sampleNullableCategoryRow: CategoryDbRow = {
  id: "6aa14bc403bc2db28142fcec",
  name: "Minimal Earrings",
  slug: "minimal-earrings",
  description: null,
  parent_id: null,
  product_type: "earring",
  image_url: null,
  is_active: false,
  show_in_menu: false,
  sort_order: 0,
  customization_fields: "[]",
  seo_title: null,
  seo_description: null,
  created_at: "2026-02-01T00:00:00Z",
  updated_at: "2026-02-02T00:00:00Z",
};

// ---------------------------------------------------------------------------
// Main test execution
// ---------------------------------------------------------------------------

async function run(): Promise<void> {
  console.log("\n━━━  Phase 3B-2: PostgreSQL Category Repository Tests  ━━━\n");

  // 1. Successful row mapping
  await test("mapRowToCategory correctly maps columns to entity properties", () => {
    const record = mapRowToCategory(sampleCategoryRow);
    assertEqual(record.id, "6aa14bc803bc2db28142fcef", "record.id");
    assertEqual(record._id, "6aa14bc803bc2db28142fcef", "record._id (backward compatibility)");
    assertEqual(record.name, "Classic Bracelets", "record.name");
    assertEqual(record.slug, "classic-bracelets", "record.slug");
    assertEqual(record.description, "Handcrafted designer bracelets", "record.description");
    assertEqual(record.parentId, null, "record.parentId");
    assertEqual(record.productType, "bracelet", "record.productType");
    assertEqual(record.imageUrl, "https://example.com/images/bracelets.jpg", "record.imageUrl");
    assertEqual(record.isActive, true, "record.isActive");
    assertEqual(record.showInMenu, true, "record.showInMenu");
    assertEqual(record.sortOrder, 10, "record.sortOrder");
    assertEqual(record.customizationFields.length, 1, "customizationFields length");
    assertEqual(record.customizationFields[0].key, "size", "customizationFields[0].key");
    assertEqual(record.seoTitle, "Classic Bracelets | Renu's Collections", "record.seoTitle");
    assertEqual(record.seoDescription, "Explore our collection of bracelets.", "record.seoDescription");
    assert(record.createdAt instanceof Date, "createdAt instanceof Date");
    assert(record.updatedAt instanceof Date, "updatedAt instanceof Date");
  });

  // 2. Nullable fields mapping
  await test("mapRowToCategory handles nullable fields gracefully", () => {
    const record = mapRowToCategory(sampleNullableCategoryRow);
    assertEqual(record.description, null, "description should be null");
    assertEqual(record.parentId, null, "parentId should be null");
    assertEqual(record.imageUrl, null, "imageUrl should be null");
    assertEqual(record.seoTitle, null, "seoTitle should be null");
    assertEqual(record.seoDescription, null, "seoDescription should be null");
    assertEqual(record.isActive, false, "isActive should be false");
    assertEqual(record.showInMenu, false, "showInMenu should be false");
    assert(Array.isArray(record.customizationFields), "customizationFields should be parsed array");
    assertEqual(record.customizationFields.length, 0, "customizationFields empty array");
  });

  // 3. findAll — Successful retrieval
  await test("findAll returns array of mapped categories", async () => {
    const { client } = createMockDbClient(() => ({
      rows: [sampleCategoryRow, sampleNullableCategoryRow],
      rowCount: 2,
    }));
    const repo = new PostgresCategoryRepository(client);
    const results = await repo.findAll();

    assertEqual(results.length, 2, "result count");
    assertEqual(results[0].id, sampleCategoryRow.id, "first item id");
    assertEqual(results[1].id, sampleNullableCategoryRow.id, "second item id");
  });

  // 4. findAll — Empty results
  await test("findAll returns empty array when query returns 0 rows", async () => {
    const { client } = createMockDbClient(() => ({ rows: [], rowCount: 0 }));
    const repo = new PostgresCategoryRepository(client);
    const results = await repo.findAll();

    assert(Array.isArray(results), "should be an array");
    assertEqual(results.length, 0, "should be empty");
  });

  // 5. Default ordering semantics
  await test("findAll enforces ORDER BY sort_order ASC, name ASC", async () => {
    const { client, calls } = createMockDbClient();
    const repo = new PostgresCategoryRepository(client);
    await repo.findAll();

    assert(calls.length === 1, "expected 1 query");
    assert(calls[0].sql.includes("ORDER BY sort_order ASC, name ASC"), "SQL contains ordering clause");
  });

  // 6. Active filtering
  await test("findAll with active:true adds is_active = $1 parameter", async () => {
    const { client, calls } = createMockDbClient();
    const repo = new PostgresCategoryRepository(client);
    await repo.findAll({ active: true });

    assert(calls.length === 1, "expected 1 query");
    assert(calls[0].sql.includes("is_active = $1"), "SQL includes is_active condition");
    assertEqual(calls[0].params?.[0], true, "param value is true");
  });

  // 7. Inactive filtering
  await test("findAll with active:false adds is_active = $1 parameter with false", async () => {
    const { client, calls } = createMockDbClient();
    const repo = new PostgresCategoryRepository(client);
    await repo.findAll({ active: false });

    assert(calls[0].sql.includes("is_active = $1"), "SQL includes is_active condition");
    assertEqual(calls[0].params?.[0], false, "param value is false");
  });

  // 8. findActive convenience helper
  await test("findActive delegates to findAll with active: true", async () => {
    const { client, calls } = createMockDbClient();
    const repo = new PostgresCategoryRepository(client);
    await repo.findActive();

    assert(calls[0].sql.includes("is_active = $1"), "SQL includes is_active condition");
    assertEqual(calls[0].params?.[0], true, "param value is true");
  });

  // 9. Menu & ProductType filtering
  await test("findAll with menu and productType adds parameterized clauses", async () => {
    const { client, calls } = createMockDbClient();
    const repo = new PostgresCategoryRepository(client);
    await repo.findAll({ menu: true, productType: "bracelet" });

    assert(calls[0].sql.includes("show_in_menu = $1"), "SQL includes show_in_menu");
    assert(calls[0].sql.includes("product_type = $2"), "SQL includes product_type");
    assertEqual(calls[0].params?.[0], true, "param 1 is true");
    assertEqual(calls[0].params?.[1], "bracelet", "param 2 is 'bracelet'");
  });

  // 10. ParentId filtering: null
  await test("findAll with parentId: null adds parent_id IS NULL clause", async () => {
    const { client, calls } = createMockDbClient();
    const repo = new PostgresCategoryRepository(client);
    await repo.findAll({ parentId: null });

    assert(calls[0].sql.includes("parent_id IS NULL"), "SQL includes parent_id IS NULL");
    assertEqual(calls[0].params?.length ?? 0, 0, "no params for IS NULL clause");
  });

  // 11. ParentId filtering: specific valid ID
  await test("findAll with parentId: <id> adds parameterized parent_id clause", async () => {
    const { client, calls } = createMockDbClient();
    const repo = new PostgresCategoryRepository(client);
    await repo.findAll({ parentId: "6aa14bc803bc2db28142fcef" });

    assert(calls[0].sql.includes("parent_id = $1"), "SQL includes parent_id = $1");
    assertEqual(calls[0].params?.[0], "6aa14bc803bc2db28142fcef", "param value matches ID");
  });

  // 12. Combined filters with strict parameter indexing
  await test("findAll with all filters combines conditions with indexed parameters", async () => {
    const { client, calls } = createMockDbClient();
    const repo = new PostgresCategoryRepository(client);
    await repo.findAll({
      active: true,
      menu: false,
      productType: "earring",
      parentId: "6aa14bc803bc2db28142fcef",
    });

    const sql = calls[0].sql;
    assert(sql.includes("is_active = $1"), "has $1");
    assert(sql.includes("show_in_menu = $2"), "has $2");
    assert(sql.includes("product_type = $3"), "has $3");
    assert(sql.includes("parent_id = $4"), "has $4");
    assertEqual(calls[0].params?.length, 4, "param count is 4");
    assertEqual(calls[0].params?.[0], true, "param 1");
    assertEqual(calls[0].params?.[1], false, "param 2");
    assertEqual(calls[0].params?.[2], "earring", "param 3");
    assertEqual(calls[0].params?.[3], "6aa14bc803bc2db28142fcef", "param 4");
  });

  // 13. findById — Lookup by valid ObjectId
  await test("findById executes parameterized query with valid ObjectId", async () => {
    const { client, calls } = createMockDbClient(() => ({
      rows: [sampleCategoryRow],
      rowCount: 1,
    }));
    const repo = new PostgresCategoryRepository(client);
    const result = await repo.findById("6aa14bc803bc2db28142fcef");

    assert(result !== null, "result should not be null");
    assertEqual(result?.id, "6aa14bc803bc2db28142fcef", "result id");
    assert(calls[0].sql.includes("WHERE id = $1"), "WHERE id = $1");
    assertEqual(calls[0].params?.[0], "6aa14bc803bc2db28142fcef", "param is id");
  });

  // 14. findById — Lookup by valid UUID
  await test("findById executes parameterized query with valid UUID", async () => {
    const uuid = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
    const uuidRow = { ...sampleCategoryRow, id: uuid };
    const { client, calls } = createMockDbClient(() => ({
      rows: [uuidRow],
      rowCount: 1,
    }));
    const repo = new PostgresCategoryRepository(client);
    const result = await repo.findById(uuid);

    assert(result !== null, "result should not be null");
    assertEqual(result?.id, uuid, "result id is UUID");
    assertEqual(calls[0].params?.[0], uuid, "param is UUID");
  });

  // 15. findById — Invalid ID throws 400 error and skips SQL execution
  await test("findById rejects invalid ID and throws statusCode 400", async () => {
    const { client, calls } = createMockDbClient();
    const repo = new PostgresCategoryRepository(client);

    let caught: any;
    try {
      await repo.findById("invalid-category-id-123");
    } catch (err) {
      caught = err;
    }

    assert(caught instanceof Error, "should throw Error");
    assertEqual(caught.statusCode, 400, "statusCode is 400");
    assertEqual(calls.length, 0, "no SQL query should have been executed");
  });

  // 16. findById — Missing category returns null
  await test("findById returns null when row does not exist", async () => {
    const { client } = createMockDbClient(() => ({ rows: [], rowCount: 0 }));
    const repo = new PostgresCategoryRepository(client);
    const result = await repo.findById("6aa14bc803bc2db28142fcef");

    assertEqual(result, null, "should return null for missing category");
  });

  // 17. findBySlug — Lookup by slug
  await test("findBySlug executes parameterized LOWER(slug) query", async () => {
    const { client, calls } = createMockDbClient(() => ({
      rows: [sampleCategoryRow],
      rowCount: 1,
    }));
    const repo = new PostgresCategoryRepository(client);
    const result = await repo.findBySlug("Classic-Bracelets");

    assert(result !== null, "result should not be null");
    assertEqual(result?.slug, "classic-bracelets", "slug match");
    assert(calls[0].sql.includes("WHERE LOWER(slug) = $1"), "LOWER(slug) = $1");
    assertEqual(calls[0].params?.[0], "classic-bracelets", "slug is lowercased in param");
  });

  // 18. findBySlug — Missing slug returns null
  await test("findBySlug returns null when slug does not exist", async () => {
    const { client } = createMockDbClient(() => ({ rows: [], rowCount: 0 }));
    const repo = new PostgresCategoryRepository(client);
    const result = await repo.findBySlug("nonexistent-slug");

    assertEqual(result, null, "should return null");
  });

  // 19. findBySlug — Empty/blank slug returns null without query
  await test("findBySlug returns null for empty slug without executing query", async () => {
    const { client, calls } = createMockDbClient();
    const repo = new PostgresCategoryRepository(client);
    const result = await repo.findBySlug("   ");

    assertEqual(result, null, "blank slug returns null");
    assertEqual(calls.length, 0, "no query executed");
  });

  // 20. countByParentId
  await test("countByParentId executes parameterized COUNT query", async () => {
    const { client, calls } = createMockDbClient(() => ({
      rows: [{ count: 3 }],
      rowCount: 1,
    }));
    const repo = new PostgresCategoryRepository(client);
    const count = await repo.countByParentId("6aa14bc803bc2db28142fcef");

    assertEqual(count, 3, "child count");
    assert(calls[0].sql.includes("WHERE parent_id = $1"), "WHERE parent_id = $1");
    assertEqual(calls[0].params?.[0], "6aa14bc803bc2db28142fcef", "param value");
  });

  // 21. existsBySlug
  await test("existsBySlug checks existence with and without excludeId", async () => {
    const { client, calls } = createMockDbClient(() => ({
      rows: [{ 1: 1 }],
      rowCount: 1,
    }));
    const repo = new PostgresCategoryRepository(client);

    const exists1 = await repo.existsBySlug("bracelets");
    assertEqual(exists1, true, "exists1 is true");
    assert(calls[0].sql.includes("LOWER(slug) = $1"), "has LOWER(slug)");

    const exists2 = await repo.existsBySlug("bracelets", "6aa14bc803bc2db28142fcef");
    assertEqual(exists2, true, "exists2 is true");
    assert(calls[1].sql.includes("id != $2"), "has id != $2");
    assertEqual(calls[1].params?.[1], "6aa14bc803bc2db28142fcef", "param 2 is excludeId");
  });

  // 22. create — inserts category with explicit ID and all fields mapped
  await test("create inserts category with explicit ID and returns mapped entity", async () => {
    const inputData: CreateCategoryData = {
      id: "6aa14bc803bc2db28142fcef",
      name: "Designer Bangles",
      slug: "Designer-Bangles",
      productType: "bangle",
      description: "Handcrafted bangles",
      imageUrl: "https://example.com/bangle.jpg",
      isActive: true,
      showInMenu: true,
      sortOrder: 5,
      customizationFields: [{ key: "finish", label: "Finish", type: "select" }],
      seoTitle: "Bangles SEO",
      seoDescription: "Bangles Description",
    };

    const returnedRow: CategoryDbRow = {
      id: inputData.id!,
      name: "Designer Bangles",
      slug: "designer-bangles",
      product_type: "bangle",
      description: "Handcrafted bangles",
      parent_id: null,
      image_url: "https://example.com/bangle.jpg",
      is_active: true,
      show_in_menu: true,
      sort_order: 5,
      customization_fields: inputData.customizationFields,
      seo_title: "Bangles SEO",
      seo_description: "Bangles Description",
      created_at: new Date(),
      updated_at: new Date(),
    };

    const { client, calls } = createMockDbClient(() => ({
      rows: [returnedRow],
      rowCount: 1,
    }));
    const repo = new PostgresCategoryRepository(client);
    const created = await repo.create(inputData);

    assert(calls.length === 1, "executed 1 insert query");
    const sql = calls[0].sql;
    assert(sql.includes("INSERT INTO categories"), "is INSERT statement");
    assert(sql.includes("RETURNING"), "includes RETURNING");
    assert(calls[0].params?.[0] === inputData.id, "param 0 is explicit id");
    assertEqual(created.id, inputData.id, "created id");
    assertEqual(created._id, inputData.id, "created _id");
    assertEqual(created.slug, "designer-bangles", "slug normalized to lowercase");
    assertEqual(created.productType, "bangle", "productType");
    assertEqual(created.customizationFields.length, 1, "customizationFields preserved");
  });

  // 23. create — inserts category without explicit ID, letting PostgreSQL DEFAULT generate it
  await test("create inserts category without explicit ID and omits id column from INSERT", async () => {
    const inputData: CreateCategoryData = {
      name: "Auto ID Category",
      slug: "auto-id-category",
      productType: "other",
    };

    const autoUuid = "c9bf9e57-1685-4c89-bafb-ff5af830be8a";
    const returnedRow: CategoryDbRow = {
      id: autoUuid,
      name: "Auto ID Category",
      slug: "auto-id-category",
      product_type: "other",
      description: null,
      parent_id: null,
      image_url: null,
      is_active: true,
      show_in_menu: true,
      sort_order: 0,
      customization_fields: [],
      seo_title: null,
      seo_description: null,
      created_at: new Date(),
      updated_at: new Date(),
    };

    const { client, calls } = createMockDbClient(() => ({
      rows: [returnedRow],
      rowCount: 1,
    }));
    const repo = new PostgresCategoryRepository(client);
    const created = await repo.create(inputData);

    const sql = calls[0].sql;
    // When id is not provided, columns list must NOT include 'id'
    assert(!sql.includes("(id,"), "columns list does not include id");
    assertEqual(created.id, autoUuid, "created id matches generated UUID");
    assertEqual(created.description, null, "description defaults to null");
    assertEqual(created.isActive, true, "isActive defaults to true");
  });

  // 24. create — rejects invalid explicit ID format and skips query
  await test("create rejects invalid explicit ID format and skips query", async () => {
    const { client, calls } = createMockDbClient();
    const repo = new PostgresCategoryRepository(client);

    let caught: any;
    try {
      await repo.create({
        id: "invalid-not-hex-or-uuid",
        name: "Test",
        slug: "test",
        productType: "bracelet",
      });
    } catch (err) {
      caught = err;
    }

    assert(caught instanceof Error, "should throw error");
    assertEqual(caught.statusCode, 400, "statusCode is 400");
    assertEqual(calls.length, 0, "no query executed");
  });

  // 25. create — rejects invalid parent ID format and skips query
  await test("create rejects invalid parent ID format and skips query", async () => {
    const { client, calls } = createMockDbClient();
    const repo = new PostgresCategoryRepository(client);

    let caught: any;
    try {
      await repo.create({
        name: "Test",
        slug: "test",
        productType: "bracelet",
        parentId: "bad-parent-id",
      });
    } catch (err) {
      caught = err;
    }

    assert(caught instanceof Error, "should throw error");
    assertEqual(caught.statusCode, 400, "statusCode is 400");
    assertEqual(calls.length, 0, "no query executed");
  });

  // 26. create — propagates unique slug constraint error (code 23505)
  await test("create propagates unique constraint error (23505) to caller", async () => {
    const { client } = createMockDbClient(() => {
      const err = Object.assign(new Error("duplicate key value violates unique constraint"), {
        code: "23505",
      });
      throw err;
    });
    const repo = new PostgresCategoryRepository(client);

    let caught: any;
    try {
      await repo.create({
        name: "Duplicate Category",
        slug: "duplicate-category",
        productType: "bracelet",
      });
    } catch (err) {
      caught = err;
    }

    assert(caught instanceof Error, "should throw error");
    assertEqual(caught.code, "23505", "propagates pgCode 23505");
  });

  // 27. updateById — updates supported fields and updates updated_at timestamp
  await test("updateById updates supported fields with parameterized SQL and bumps updated_at", async () => {
    const categoryId = "6aa14bc803bc2db28142fcef";
    const updateData: UpdateCategoryData = {
      name: "Updated Name",
      slug: "Updated-Slug",
      isActive: false,
      sortOrder: 20,
    };

    const returnedRow: CategoryDbRow = {
      ...sampleCategoryRow,
      id: categoryId,
      name: "Updated Name",
      slug: "updated-slug",
      is_active: false,
      sort_order: 20,
      updated_at: new Date(),
    };

    const { client, calls } = createMockDbClient(() => ({
      rows: [returnedRow],
      rowCount: 1,
    }));
    const repo = new PostgresCategoryRepository(client);
    const updated = await repo.updateById(categoryId, updateData);

    assert(updated !== null, "updated entity is returned");
    assertEqual(updated?.name, "Updated Name", "name updated");
    assertEqual(updated?.slug, "updated-slug", "slug normalized to lowercase");
    assertEqual(updated?.isActive, false, "isActive updated");
    assertEqual(updated?.sortOrder, 20, "sortOrder updated");

    const sql = calls[0].sql;
    assert(sql.includes("UPDATE categories") && sql.includes("SET"), "is UPDATE statement");
    assert(sql.includes("name = $1"), "has name = $1");
    assert(sql.includes("slug = $2"), "has slug = $2");
    assert(sql.includes("is_active = $3"), "has is_active = $3");
    assert(sql.includes("sort_order = $4"), "has sort_order = $4");
    assert(sql.includes("updated_at = NOW()"), "has updated_at = NOW()");
    assert(sql.includes("WHERE id = $5"), "WHERE id uses parameter");
    assertEqual(calls[0].params?.[4], categoryId, "id is last parameter");
  });

  // 28. updateById — handles nullable fields set to null and JSONB customization fields
  await test("updateById handles nullable fields set to null and serializes JSONB fields", async () => {
    const categoryId = "6aa14bc803bc2db28142fcef";
    const updateData: UpdateCategoryData = {
      description: null,
      imageUrl: null,
      customizationFields: [{ key: "charm", label: "Charm", type: "select" }],
    };

    const returnedRow: CategoryDbRow = {
      ...sampleCategoryRow,
      id: categoryId,
      description: null,
      image_url: null,
      customization_fields: updateData.customizationFields,
    };

    const { client, calls } = createMockDbClient(() => ({
      rows: [returnedRow],
      rowCount: 1,
    }));
    const repo = new PostgresCategoryRepository(client);
    const updated = await repo.updateById(categoryId, updateData);

    assert(updated !== null, "updated entity returned");
    assertEqual(updated?.description, null, "description is null");
    assertEqual(updated?.imageUrl, null, "imageUrl is null");
    assertEqual(updated?.customizationFields.length, 1, "customizationFields updated");

    const sql = calls[0].sql;
    assert(sql.includes("description = $1"), "has description = $1");
    assert(sql.includes("image_url = $2"), "has image_url = $2");
    assert(sql.includes("customization_fields = $3"), "has customization_fields = $3");
    assertEqual(calls[0].params?.[0], null, "param 1 is null");
    assertEqual(calls[0].params?.[1], null, "param 2 is null");
    assertEqual(
      calls[0].params?.[2],
      JSON.stringify(updateData.customizationFields),
      "param 3 is JSON string"
    );
  });

  // 29. updateById — rejects unsupported fields without executing query
  await test("updateById rejects unsupported fields without executing query", async () => {
    const categoryId = "6aa14bc803bc2db28142fcef";
    const { client, calls } = createMockDbClient();
    const repo = new PostgresCategoryRepository(client);

    let caught: any;
    try {
      await repo.updateById(categoryId, {
        name: "Valid",
        maliciousColumn: "injected-value",
      } as any);
    } catch (err) {
      caught = err;
    }

    assert(caught instanceof Error, "should throw error");
    assert(caught.message.includes('Unsupported update field: "maliciousColumn"'), "error identifies column");
    assertEqual(calls.length, 0, "no SQL query executed");
  });

  // 30. updateById — returns null when category does not exist
  await test("updateById returns null when category row does not exist", async () => {
    const categoryId = "6aa14bc803bc2db28142fcef";
    const { client } = createMockDbClient(() => ({
      rows: [],
      rowCount: 0,
    }));
    const repo = new PostgresCategoryRepository(client);
    const result = await repo.updateById(categoryId, { name: "Nonexistent" });

    assertEqual(result, null, "returns null for missing category");
  });

  // 31. updateById — rejects invalid category ID and skips query
  await test("updateById rejects invalid category ID and skips query", async () => {
    const { client, calls } = createMockDbClient();
    const repo = new PostgresCategoryRepository(client);

    let caught: any;
    try {
      await repo.updateById("not-valid-id", { name: "Test" });
    } catch (err) {
      caught = err;
    }

    assert(caught instanceof Error, "should throw error");
    assertEqual(caught.statusCode, 400, "statusCode is 400");
    assertEqual(calls.length, 0, "no query executed");
  });

  // 32. deleteById — deletes category and returns deleted record
  await test("deleteById deletes category with parameterized query and returns deleted entity", async () => {
    const categoryId = "6aa14bc803bc2db28142fcef";
    const { client, calls } = createMockDbClient(() => ({
      rows: [{ ...sampleCategoryRow, id: categoryId }],
      rowCount: 1,
    }));
    const repo = new PostgresCategoryRepository(client);
    const deleted = await repo.deleteById(categoryId);

    assert(deleted !== null, "deleted entity returned");
    assertEqual(deleted?.id, categoryId, "deleted category id");
    assertEqual(calls.length, 1, "executed 1 delete query");
    assert(calls[0].sql.includes("DELETE FROM categories") && calls[0].sql.includes("WHERE id = $1"), "SQL is DELETE with $1");
    assertEqual(calls[0].params?.[0], categoryId, "param is categoryId");
  });

  // 33. deleteById — returns null when category does not exist
  await test("deleteById returns null when category row does not exist", async () => {
    const categoryId = "6aa14bc803bc2db28142fcef";
    const { client } = createMockDbClient(() => ({
      rows: [],
      rowCount: 0,
    }));
    const repo = new PostgresCategoryRepository(client);
    const result = await repo.deleteById(categoryId);

    assertEqual(result, null, "returns null for missing category");
  });

  // 34. deleteById — rejects invalid category ID and skips query
  await test("deleteById rejects invalid category ID and skips query", async () => {
    const { client, calls } = createMockDbClient();
    const repo = new PostgresCategoryRepository(client);

    let caught: any;
    try {
      await repo.deleteById("bad-id");
    } catch (err) {
      caught = err;
    }

    assert(caught instanceof Error, "should throw error");
    assertEqual(caught.statusCode, 400, "statusCode is 400");
    assertEqual(calls.length, 0, "no query executed");
  });

  // 35. deleteById — propagates foreign key constraint error (code 23503)
  await test("deleteById propagates foreign key violation error (23503)", async () => {
    const categoryId = "6aa14bc803bc2db28142fcef";
    const { client } = createMockDbClient(() => {
      const err = Object.assign(new Error("update or delete on table violates foreign key constraint"), {
        code: "23503",
      });
      throw err;
    });
    const repo = new PostgresCategoryRepository(client);

    let caught: any;
    try {
      await repo.deleteById(categoryId);
    } catch (err) {
      caught = err;
    }

    assert(caught instanceof Error, "should throw error");
    assertEqual(caught.code, "23503", "propagates foreign key violation code");
  });

  // 36. withTransaction — executes multi-statement category operations on single client
  await test("withTransaction executes multi-statement operations atomically on single client", async () => {
    const queriesExecuted: string[] = [];
    let releaseWasCalled = false;

    const mockPoolClient: IDbPoolClient = {
      async query<T = any>(sql: string): Promise<IQueryResult<T>> {
        queriesExecuted.push(sql.trim());
        if (sql.includes("INSERT")) {
          return { rows: [sampleCategoryRow as any], rowCount: 1 };
        }
        if (sql.includes("UPDATE")) {
          return { rows: [sampleCategoryRow as any], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      },
      release: () => {
        releaseWasCalled = true;
      },
    };

    const mockPool: IDbPool = {
      connect: async () => mockPoolClient,
      query: async () => ({ rows: [], rowCount: 0 }),
      end: async () => {},
      on: () => ({}) as any,
    } as unknown as IDbPool;

    const repo = new PostgresCategoryRepository();

    const result = await withTransaction(mockPool, async (txClient) => {
      const created = await repo.create(
        { name: "Tx Category", slug: "tx-cat", productType: "bracelet" },
        txClient
      );
      const updated = await repo.updateById(created.id, { sortOrder: 99 }, txClient);
      return updated;
    });

    assert(result !== null, "transaction completed and returned entity");
    assertEqual(queriesExecuted[0], "BEGIN", "first statement was BEGIN");
    assert(queriesExecuted[1].includes("INSERT INTO categories"), "second was INSERT");
    assert(queriesExecuted[2].includes("UPDATE categories"), "third was UPDATE");
    assertEqual(queriesExecuted[3], "COMMIT", "final was COMMIT");
    assert(releaseWasCalled, "client was released back to pool");
  });

  // 37. Live Read-Only Supabase Database Verification (if configured)
  let livePool: any = null;
  try {
    livePool = createPostgresPool();
  } catch {
    // DATABASE_URL not present
  }

  if (livePool) {
    try {
      await test("Live Supabase Integration: Read categories safely from PostgreSQL (strictly read-only)", async () => {
        try {
          const repo = new PostgresCategoryRepository(livePool);
          const categories = await repo.findAll();
          assert(Array.isArray(categories), "live categories is array");
          assert(categories.length > 0, `expected migrated categories, got ${categories.length}`);

          // Verify structure of first live category
          const first = categories[0];
          assert(typeof first.id === "string" && first.id.length > 0, "live category id is non-empty");
          assert(first.id === first._id, "live category id matches _id");
          assert(typeof first.name === "string", "live category name is string");
          assert(typeof first.slug === "string", "live category slug is string");
          assert(typeof first.isActive === "boolean", "live category isActive is boolean");
          assert(first.createdAt instanceof Date, "live category createdAt is Date");

          // Verify findBySlug on a live category
          const bySlug = await repo.findBySlug(first.slug);
          assert(bySlug !== null, "findBySlug found record");
          assertEqual(bySlug?.id, first.id, "findBySlug matched ID");

          // Verify findById on a live category
          const byId = await repo.findById(first.id);
          assert(byId !== null, "findById found record");
          assertEqual(byId?.slug, first.slug, "findById matched slug");

          // Verify active categories query
          const activeOnly = await repo.findActive();
          assert(activeOnly.every((c) => c.isActive === true), "all items in findActive have isActive === true");
        } catch (err: any) {
          if (err?.code === "ENOTFOUND" || err?.message?.includes("ENOTFOUND")) {
            console.log(`       [INFO] Network isolated in sandbox mode (${err?.message})`);
            return;
          }
          throw err;
        }
      });
    } finally {
      try {
        await livePool.end();
      } catch {}
    }
  }

  // ── Results Summary ───────────────────────────────────────────────────────
  console.log(`\n━━━  Results: ${passed} passed, ${failed} failed  ━━━\n`);

  if (failed > 0) {
    process.exitCode = 1;
  }
}

run().catch((err) => {
  console.error("\n[FATAL] Test runner crashed:", err);
  process.exitCode = 1;
});
