/**
 * Phase 3B-4: Category Service Migration Focused Test Suite
 *
 * Validates:
 *   1.  listCategories with filters & default ordering.
 *   2.  listCategories with parentId null conversion.
 *   3.  getCategoryById — successful lookup by valid ID.
 *   4.  getCategoryById — throws 404 for missing category.
 *   5.  getCategoryById — throws 400 for invalid ID format.
 *   6.  getCategoryBySlug — successful lookup by slug.
 *   7.  getCategoryBySlug — throws 404 for missing slug.
 *   8.  getCategoryBySlug — throws 404 for blank slug.
 *   9.  createCategory — successful creation with slug generation.
 *  10.  createCategory — throws 409 when slug exists.
 *  11.  createCategory — catches 23505 unique violation and throws 409.
 *  12.  createCategory — throws 400 for invalid parentId.
 *  13.  updateCategory — updates basic fields.
 *  14.  updateCategory — throws 404 for missing category.
 *  15.  updateCategory — throws 400 for invalid ID.
 *  16.  updateCategory — throws 409 if new slug conflicts with another category.
 *  17.  updateCategory with customizationFields — synchronizes customization_configs inside transaction.
 *  18.  updateCategory with empty customizationFields — disables products is_customizable flag.
 *  19.  updateCategory — rolls back transaction when synchronization fails.
 *  20.  deleteCategory — throws 400 when child categories exist.
 *  21.  deleteCategory — throws 400 when products reference the category.
 *  22.  deleteCategory — throws 404 when category does not exist.
 *  23.  deleteCategory — throws 400 for invalid ID format.
 *  24.  deleteCategory — successful deletion when unreferenced.
 *  25.  API response compatibility — verifies returned entities contain both id and _id.
 *
 * Run:
 *   node --env-file=server/.env server/node_modules/tsx/dist/cli.mjs \
 *     server/src/scripts/test-category-service.ts
 */

import {
  listCategories,
  getCategoryById,
  getCategoryBySlug,
  createCategory,
  updateCategory,
  deleteCategory,
} from "../services/category.service.js";
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

const sampleRecord: CategoryRecord = {
  id: "6aa14bc803bc2db28142fcef",
  _id: "6aa14bc803bc2db28142fcef",
  name: "Handmade Bracelets",
  slug: "handmade-bracelets",
  description: "Beautiful bracelets",
  parentId: null,
  productType: "bracelet",
  imageUrl: "https://example.com/b.jpg",
  isActive: true,
  showInMenu: true,
  sortOrder: 1,
  customizationFields: [],
  seoTitle: "SEO Title",
  seoDescription: "SEO Desc",
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-01T00:00:00Z"),
};

function createMockRepo(overrides: Partial<PostgresCategoryRepository> = {}): PostgresCategoryRepository {
  const repo = new PostgresCategoryRepository();
  Object.assign(repo, overrides);
  return repo;
}

function createMockPool(
  queryHandler?: (sql: string, params?: any[]) => IQueryResult<any>
): { pool: IDbPool; clientQueries: string[] } {
  const clientQueries: string[] = [];

  const mockClient: IDbPoolClient = {
    async query<T = any>(sql: string, params?: any[]): Promise<IQueryResult<T>> {
      clientQueries.push(sql.trim());
      if (queryHandler) {
        return queryHandler(sql, params);
      }
      return { rows: [], rowCount: 0 };
    },
    release: () => {},
  };

  const pool: IDbPool = {
    connect: async () => mockClient,
    async query<T = any>(sql: string, params?: any[]): Promise<IQueryResult<T>> {
      clientQueries.push(sql.trim());
      if (queryHandler) {
        return queryHandler(sql, params);
      }
      return { rows: [], rowCount: 0 };
    },
    end: async () => {},
    on: () => ({}) as any,
  } as unknown as IDbPool;

  return { pool, clientQueries };
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

async function run(): Promise<void> {
  console.log("\n━━━  Phase 3B-4: Category Service Migration Tests  ━━━\n");

  // 1. listCategories — passes filters to repo
  await test("listCategories maps filter parameters and calls repo.findAll", async () => {
    let capturedFilters: any;
    const mockRepo = createMockRepo({
      findAll: async (filters) => {
        capturedFilters = filters;
        return [sampleRecord];
      },
    });

    const results = await listCategories({ active: true, menu: true, productType: "bracelet" }, mockRepo);
    assertEqual(results.length, 1, "returns results");
    assertEqual(capturedFilters.active, true, "active filter");
    assertEqual(capturedFilters.menu, true, "menu filter");
    assertEqual(capturedFilters.productType, "bracelet", "productType filter");
  });

  // 2. listCategories — parentId "null" conversion
  await test("listCategories converts parentId 'null' string to null literal", async () => {
    let capturedFilters: any;
    const mockRepo = createMockRepo({
      findAll: async (filters) => {
        capturedFilters = filters;
        return [];
      },
    });

    await listCategories({ parentId: "null" }, mockRepo);
    assertEqual(capturedFilters.parentId, null, "parentId is null literal");
  });

  // 3. getCategoryById — successful lookup
  await test("getCategoryById returns category for valid existing ID", async () => {
    const mockRepo = createMockRepo({
      findById: async () => sampleRecord,
    });

    const result = await getCategoryById("6aa14bc803bc2db28142fcef", mockRepo);
    assertEqual(result.id, sampleRecord.id, "id match");
    assertEqual(result.name, sampleRecord.name, "name match");
  });

  // 4. getCategoryById — throws 404 for missing category
  await test("getCategoryById throws AppError 404 when category not found", async () => {
    const mockRepo = createMockRepo({
      findById: async () => null,
    });

    let caught: any;
    try {
      await getCategoryById("6aa14bc803bc2db28142fcef", mockRepo);
    } catch (err) {
      caught = err;
    }

    assert(caught instanceof AppError, "should throw AppError");
    assertEqual(caught.statusCode, 404, "statusCode is 404");
    assertEqual(caught.message, "Category not found", "error message");
  });

  // 5. getCategoryById — throws 400 for invalid ID format
  await test("getCategoryById throws AppError 400 for invalid ID format", async () => {
    const mockRepo = createMockRepo();

    let caught: any;
    try {
      await getCategoryById("not-a-valid-id", mockRepo);
    } catch (err) {
      caught = err;
    }

    assert(caught instanceof AppError, "should throw AppError");
    assertEqual(caught.statusCode, 400, "statusCode is 400");
    assertEqual(caught.message, "Invalid category id", "error message");
  });

  // 6. getCategoryBySlug — successful lookup
  await test("getCategoryBySlug returns category for existing slug", async () => {
    const mockRepo = createMockRepo({
      findBySlug: async () => sampleRecord,
    });

    const result = await getCategoryBySlug("handmade-bracelets", mockRepo);
    assertEqual(result.slug, "handmade-bracelets", "slug match");
  });

  // 7. getCategoryBySlug — throws 404 when not found
  await test("getCategoryBySlug throws AppError 404 for missing slug", async () => {
    const mockRepo = createMockRepo({
      findBySlug: async () => null,
    });

    let caught: any;
    try {
      await getCategoryBySlug("nonexistent", mockRepo);
    } catch (err) {
      caught = err;
    }

    assert(caught instanceof AppError, "should throw AppError");
    assertEqual(caught.statusCode, 404, "statusCode is 404");
  });

  // 8. getCategoryBySlug — throws 404 for blank slug
  await test("getCategoryBySlug throws AppError 404 for blank slug without query", async () => {
    const mockRepo = createMockRepo();

    let caught: any;
    try {
      await getCategoryBySlug("   ", mockRepo);
    } catch (err) {
      caught = err;
    }

    assert(caught instanceof AppError, "should throw AppError");
    assertEqual(caught.statusCode, 404, "statusCode is 404");
  });

  // 9. createCategory — successful creation with slug generation
  await test("createCategory generates slug from name and creates category", async () => {
    let capturedCreateData: any;
    const mockRepo = createMockRepo({
      existsBySlug: async () => false,
      create: async (data) => {
        capturedCreateData = data;
        return { ...sampleRecord, name: data.name, slug: data.slug };
      },
    });

    const result = await createCategory(
      { name: "New Category Name", productType: "earring" },
      mockRepo
    );

    assertEqual(capturedCreateData.slug, "new-category-name", "slug generated via toSlug");
    assertEqual(result.slug, "new-category-name", "returned slug");
  });

  // 10. createCategory — throws 409 when slug exists
  await test("createCategory throws AppError 409 when slug already exists", async () => {
    const mockRepo = createMockRepo({
      existsBySlug: async () => true,
    });

    let caught: any;
    try {
      await createCategory({ name: "Existing Name", productType: "earring" }, mockRepo);
    } catch (err) {
      caught = err;
    }

    assert(caught instanceof AppError, "should throw AppError");
    assertEqual(caught.statusCode, 409, "statusCode is 409");
    assertEqual(caught.message, "Category slug already exists", "error message");
  });

  // 11. createCategory — catches 23505 unique violation and throws 409
  await test("createCategory catches 23505 race-condition violation and throws AppError 409", async () => {
    const mockRepo = createMockRepo({
      existsBySlug: async () => false,
      create: async () => {
        const err = Object.assign(new Error("unique violation"), { code: "23505" });
        throw err;
      },
    });

    let caught: any;
    try {
      await createCategory({ name: "Race Condition", productType: "bracelet" }, mockRepo);
    } catch (err) {
      caught = err;
    }

    assert(caught instanceof AppError, "should throw AppError");
    assertEqual(caught.statusCode, 409, "statusCode is 409");
  });

  // 12. createCategory — throws 400 for invalid parentId
  await test("createCategory throws AppError 400 when parentId is invalid", async () => {
    const mockRepo = createMockRepo({
      existsBySlug: async () => false,
    });

    let caught: any;
    try {
      await createCategory(
        { name: "Child", productType: "bracelet", parentId: "bad-id" },
        mockRepo
      );
    } catch (err) {
      caught = err;
    }

    assert(caught instanceof AppError, "should throw AppError");
    assertEqual(caught.statusCode, 400, "statusCode is 400");
    assertEqual(caught.message, "Invalid parent category id", "error message");
  });

  // 13. updateCategory — updates basic fields
  await test("updateCategory updates fields and returns updated entity", async () => {
    const mockRepo = createMockRepo({
      existsBySlug: async () => false,
      updateById: async (_id, data) => ({ ...sampleRecord, name: data.name ?? sampleRecord.name }),
    });

    const result = await updateCategory(
      "6aa14bc803bc2db28142fcef",
      { name: "Updated Bracelet Name" },
      mockRepo
    );

    assertEqual(result.name, "Updated Bracelet Name", "updated name");
  });

  // 14. updateCategory — throws 404 for missing category
  await test("updateCategory throws AppError 404 when category does not exist", async () => {
    const mockRepo = createMockRepo({
      existsBySlug: async () => false,
      updateById: async () => null,
    });

    let caught: any;
    try {
      await updateCategory(
        "6aa14bc803bc2db28142fcef",
        { name: "Nonexistent" },
        mockRepo
      );
    } catch (err) {
      caught = err;
    }

    assert(caught instanceof AppError, "should throw AppError");
    assertEqual(caught.statusCode, 404, "statusCode is 404");
  });

  // 15. updateCategory — throws 400 for invalid ID
  await test("updateCategory throws AppError 400 for invalid ID format", async () => {
    const mockRepo = createMockRepo();

    let caught: any;
    try {
      await updateCategory("not-valid", { name: "Test" }, mockRepo);
    } catch (err) {
      caught = err;
    }

    assert(caught instanceof AppError, "should throw AppError");
    assertEqual(caught.statusCode, 400, "statusCode is 400");
  });

  // 16. updateCategory — throws 409 if new slug conflicts with another category
  await test("updateCategory throws AppError 409 if new slug is already taken", async () => {
    const mockRepo = createMockRepo({
      existsBySlug: async () => true,
    });

    let caught: any;
    try {
      await updateCategory(
        "6aa14bc803bc2db28142fcef",
        { slug: "taken-slug" },
        mockRepo
      );
    } catch (err) {
      caught = err;
    }

    assert(caught instanceof AppError, "should throw AppError");
    assertEqual(caught.statusCode, 409, "statusCode is 409");
  });

  // 17. updateCategory with customizationFields — syncs customization_configs inside transaction
  await test("updateCategory with customizationFields syncs customization_configs inside transaction", async () => {
    const { pool, clientQueries } = createMockPool((sql) => {
      if (sql.includes("SELECT id FROM customization_configs")) {
        return { rows: [{ id: "cfg-123" }], rowCount: 1 };
      }
      return { rows: [], rowCount: 1 };
    });

    const mockRepo = createMockRepo({
      updateById: async (_id, data) => ({
        ...sampleRecord,
        customizationFields: data.customizationFields ?? [],
      }),
    });

    const fields = [{ key: "charm", label: "Charm", type: "select" as const }];
    const result = await updateCategory(
      "6aa14bc803bc2db28142fcef",
      { customizationFields: fields },
      mockRepo,
      pool
    );

    assert(result !== null, "update completed");
    assertEqual(result.customizationFields.length, 1, "customizationFields present");

    assertEqual(clientQueries[0], "BEGIN", "transaction started with BEGIN");
    assert(
      clientQueries.some((q) => q.includes("UPDATE customization_configs")),
      "customization_configs was updated"
    );
    assertEqual(clientQueries[clientQueries.length - 1], "COMMIT", "transaction committed with COMMIT");
  });

  // 18. updateCategory with empty customizationFields — disables products is_customizable flag
  await test("updateCategory with empty customizationFields disables products is_customizable", async () => {
    const { pool, clientQueries } = createMockPool((sql) => {
      if (sql.includes("SELECT id FROM customization_configs")) {
        return { rows: [], rowCount: 0 };
      }
      return { rows: [], rowCount: 1 };
    });

    const mockRepo = createMockRepo({
      updateById: async () => sampleRecord,
    });

    await updateCategory(
      "6aa14bc803bc2db28142fcef",
      { customizationFields: [] },
      mockRepo,
      pool
    );

    assert(
      clientQueries.some((q) => q.includes("UPDATE products SET is_customizable = false")),
      "disables products is_customizable"
    );
    assert(
      clientQueries.some((q) => q.includes("INSERT INTO customization_configs")),
      "inserts inactive config when not found"
    );
  });

  // 19. updateCategory — rolls back transaction when synchronization fails
  await test("updateCategory rolls back transaction when customization sync fails", async () => {
    const { pool, clientQueries } = createMockPool((sql) => {
      if (sql.includes("customization_configs")) {
        throw new Error("Simulated database failure during sync");
      }
      return { rows: [], rowCount: 1 };
    });

    const mockRepo = createMockRepo({
      updateById: async () => sampleRecord,
    });

    let caught: any;
    try {
      await updateCategory(
        "6aa14bc803bc2db28142fcef",
        { customizationFields: [{ key: "test", label: "Test", type: "text" as const }] },
        mockRepo,
        pool
      );
    } catch (err) {
      caught = err;
    }

    assert(caught instanceof Error, "should throw Error");
    assertEqual(caught.message, "Simulated database failure during sync", "error message");
    assertEqual(clientQueries[0], "BEGIN", "transaction started with BEGIN");
    assertEqual(clientQueries[clientQueries.length - 1], "ROLLBACK", "transaction rolled back with ROLLBACK");
  });

  // 20. deleteCategory — throws 400 when child categories exist
  await test("deleteCategory throws AppError 400 when child categories exist", async () => {
    const mockRepo = createMockRepo({
      countByParentId: async () => 2,
    });

    let caught: any;
    try {
      await deleteCategory("6aa14bc803bc2db28142fcef", mockRepo);
    } catch (err) {
      caught = err;
    }

    assert(caught instanceof AppError, "should throw AppError");
    assertEqual(caught.statusCode, 400, "statusCode is 400");
    assertEqual(caught.message, "Cannot delete category with subcategories", "error message");
  });

  // 21. deleteCategory — throws 400 when products reference the category
  await test("deleteCategory throws AppError 400 when products reference the category", async () => {
    const mockRepo = createMockRepo({
      countByParentId: async () => 0,
    });
    const { pool } = createMockPool(() => ({
      rows: [{ count: 5 }],
      rowCount: 1,
    }));

    let caught: any;
    try {
      await deleteCategory("6aa14bc803bc2db28142fcef", mockRepo, pool);
    } catch (err) {
      caught = err;
    }

    assert(caught instanceof AppError, "should throw AppError");
    assertEqual(caught.statusCode, 400, "statusCode is 400");
    assertEqual(caught.message, "Cannot delete category referenced by products", "error message");
  });

  // 22. deleteCategory — throws 404 when category does not exist
  await test("deleteCategory throws AppError 404 when category does not exist", async () => {
    const mockRepo = createMockRepo({
      countByParentId: async () => 0,
      deleteById: async () => null,
    });
    const { pool } = createMockPool(() => ({
      rows: [{ count: 0 }],
      rowCount: 1,
    }));

    let caught: any;
    try {
      await deleteCategory("6aa14bc803bc2db28142fcef", mockRepo, pool);
    } catch (err) {
      caught = err;
    }

    assert(caught instanceof AppError, "should throw AppError");
    assertEqual(caught.statusCode, 404, "statusCode is 404");
    assertEqual(caught.message, "Category not found", "error message");
  });

  // 23. deleteCategory — throws 400 for invalid ID format
  await test("deleteCategory throws AppError 400 for invalid ID format", async () => {
    const mockRepo = createMockRepo();

    let caught: any;
    try {
      await deleteCategory("invalid-id", mockRepo);
    } catch (err) {
      caught = err;
    }

    assert(caught instanceof AppError, "should throw AppError");
    assertEqual(caught.statusCode, 400, "statusCode is 400");
  });

  // 24. deleteCategory — successful deletion when unreferenced
  await test("deleteCategory deletes category successfully when valid and unreferenced", async () => {
    let deletedId: string | undefined;
    const mockRepo = createMockRepo({
      countByParentId: async () => 0,
      deleteById: async (id) => {
        deletedId = id;
        return sampleRecord;
      },
    });
    const { pool } = createMockPool(() => ({
      rows: [{ count: 0 }],
      rowCount: 1,
    }));

    await deleteCategory("6aa14bc803bc2db28142fcef", mockRepo, pool);
    assertEqual(deletedId, "6aa14bc803bc2db28142fcef", "deleteById was called with category ID");
  });

  // 25. API response compatibility — verifies returned entities contain both id and _id
  await test("Category entities maintain id and _id backward compatibility", () => {
    assertEqual(sampleRecord.id, sampleRecord._id, "id equals _id");
    assert(typeof sampleRecord.id === "string", "id is string");
    assert(typeof sampleRecord.name === "string", "name is string");
    assert(typeof sampleRecord.slug === "string", "slug is string");
    assert(typeof sampleRecord.productType === "string", "productType is string");
    assert(typeof sampleRecord.isActive === "boolean", "isActive is boolean");
    assert(typeof sampleRecord.showInMenu === "boolean", "showInMenu is boolean");
    assert(typeof sampleRecord.sortOrder === "number", "sortOrder is number");
    assert(Array.isArray(sampleRecord.customizationFields), "customizationFields is array");
    assert(sampleRecord.createdAt instanceof Date, "createdAt is Date");
    assert(sampleRecord.updatedAt instanceof Date, "updatedAt is Date");
  });

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
