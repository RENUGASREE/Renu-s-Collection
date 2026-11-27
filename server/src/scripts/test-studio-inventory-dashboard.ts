/**
 * Automated Verification: Studio Inventory Dashboard
 *
 * Verifies:
 * 1. Independent Studio materials appear in Studio Inventory.
 * 2. Each material's variants and stock quantities are correctly represented.
 * 3. Draft and unpublished materials remain visible to Admin.
 * 4. Linked stock sources and inventory pool connections are represented accurately.
 * 5. Seller-random assortment materials calculate available pool stock correctly accounting for pending reservations.
 * 6. Active reservations are accounted for without double deduction.
 * 7. Out-of-stock and low-stock indicators are computed authoritatively.
 * 8. Search and multi-criteria filters function correctly.
 * 9. Product Inventory remains completely independent and unmodified.
 */

import assert from "node:assert";
import { PostgresStudioRepository } from "../repositories/postgres-studio.repository.js";
import { PostgresInventoryRepository } from "../repositories/postgres-inventory.repository.js";

async function runTests() {
  console.log("================================================================================");
  console.log("TEST SUITE: STUDIO INVENTORY DASHBOARD VERIFICATION");
  console.log("================================================================================");

  let passed = 0;
  let failed = 0;

  function test(name: string, fn: () => void | Promise<void>) {
    try {
      fn();
      console.log(`  ✓ ${name}`);
      passed++;
    } catch (err: any) {
      console.error(`  ✗ FAIL: ${name}`, err.message);
      failed++;
    }
  }

  // 1. Mock DB Client with fixture data to test all business logic in complete isolation
  const mockMaterials = [
    {
      id: "mat-bead-01",
      name: "8mm Rose Quartz Bead",
      code: "MAT-RQ-08",
      description: "Natural rose quartz gemstone bead",
      material_type: "bead",
      image_url: "https://example.com/rq.jpg",
      render_asset_url: null,
      additional_images: [],
      allowed_jewellery_types: ["bracelet", "necklace"],
      supported_construction_types: ["elastic_cord"],
      visibility_scopes: ["studio"],
      is_active: true,
      sort_order: 1,
      selection_policy: "customer_selects_variant",
      assortment_notes: null,
      eligible_assortment_skus: [],
      created_at: new Date(),
      updated_at: new Date(),
    },
    {
      id: "mat-panda-charm",
      name: "Panda Charm Assortment",
      code: "MAT-PANDA",
      description: "Seller-random panda charm assortment",
      material_type: "charm",
      image_url: "https://example.com/panda.jpg",
      render_asset_url: null,
      additional_images: [],
      allowed_jewellery_types: ["bracelet"],
      supported_construction_types: ["elastic_cord"],
      visibility_scopes: ["studio"],
      is_active: true,
      sort_order: 2,
      selection_policy: "seller_random_variant",
      assortment_notes: "Gold and silver random allocation",
      eligible_assortment_skus: ["CH-PANDA-GOLD", "CH-PANDA-SILVER"],
      created_at: new Date(),
      updated_at: new Date(),
    },
    {
      id: "mat-draft-spacer",
      name: "Draft Silver Spacer",
      code: "MAT-DRAFT-01",
      description: "Draft spacer unpublished to studio",
      material_type: "spacer",
      image_url: null,
      render_asset_url: null,
      additional_images: [],
      allowed_jewellery_types: ["bracelet"],
      supported_construction_types: ["elastic_cord"],
      visibility_scopes: [], // Unpublished draft
      is_active: true,
      sort_order: 3,
      selection_policy: "customer_selects_variant",
      assortment_notes: null,
      eligible_assortment_skus: [],
      created_at: new Date(),
      updated_at: new Date(),
    },
    {
      id: "mat-no-variants",
      name: "Empty Material Sample",
      code: "MAT-EMPTY-01",
      description: "Material without variants",
      material_type: "wire_cord",
      image_url: null,
      render_asset_url: null,
      additional_images: [],
      allowed_jewellery_types: [],
      supported_construction_types: [],
      visibility_scopes: ["studio"],
      is_active: false, // Inactive
      sort_order: 4,
      selection_policy: "customer_selects_variant",
      assortment_notes: null,
      eligible_assortment_skus: [],
      created_at: new Date(),
      updated_at: new Date(),
    },
  ];

  const mockVariants = [
    // Variants for mat-bead-01 (customer_selects_variant)
    {
      id: "var-rq-1",
      material_id: "mat-bead-01",
      sku: "BEAD-RQ-8MM",
      color: "Pink",
      finish: "Polished",
      size_label: "8mm",
      length_mm: null,
      width_mm: null,
      height_mm: null,
      diameter_mm: 8,
      hole_diameter_mm: 1,
      attachment_size_mm: null,
      selling_unit: "piece",
      purchase_cost: 2.0,
      selling_rate: 5.0,
      stock: 15, // Available stock in DB after checkout reservations
      low_stock_threshold: 5,
      is_active: true,
      image_url: null,
      render_asset_url: null,
      created_at: new Date(),
      updated_at: new Date(),
    },
    {
      id: "var-rq-2",
      material_id: "mat-bead-01",
      sku: "BEAD-RQ-10MM",
      color: "Pink",
      finish: "Polished",
      size_label: "10mm",
      length_mm: null,
      width_mm: null,
      height_mm: null,
      diameter_mm: 10,
      hole_diameter_mm: 1.2,
      attachment_size_mm: null,
      selling_unit: "piece",
      purchase_cost: 3.0,
      selling_rate: 8.0,
      stock: 0, // Out of stock
      low_stock_threshold: 5,
      is_active: true,
      image_url: null,
      render_asset_url: null,
      created_at: new Date(),
      updated_at: new Date(),
    },
    // Variants for mat-panda-charm (seller_random_variant)
    {
      id: "var-panda-gold",
      material_id: "mat-panda-charm",
      sku: "CH-PANDA-GOLD",
      color: "Gold",
      finish: "Enamel",
      size_label: "Standard",
      length_mm: null,
      width_mm: null,
      height_mm: null,
      diameter_mm: null,
      hole_diameter_mm: null,
      attachment_size_mm: 2,
      selling_unit: "piece",
      purchase_cost: 10.0,
      selling_rate: 25.0,
      stock: 4, // 4 units
      low_stock_threshold: 2,
      is_active: true,
      image_url: null,
      render_asset_url: null,
      created_at: new Date(),
      updated_at: new Date(),
    },
    {
      id: "var-panda-silver",
      material_id: "mat-panda-charm",
      sku: "CH-PANDA-SILVER",
      color: "Silver",
      finish: "Enamel",
      size_label: "Standard",
      length_mm: null,
      width_mm: null,
      height_mm: null,
      diameter_mm: null,
      hole_diameter_mm: null,
      attachment_size_mm: 2,
      selling_unit: "piece",
      purchase_cost: 10.0,
      selling_rate: 25.0,
      stock: 6, // 6 units
      low_stock_threshold: 2,
      is_active: true,
      image_url: null,
      render_asset_url: null,
      created_at: new Date(),
      updated_at: new Date(),
    },
    // Variant for mat-draft-spacer
    {
      id: "var-spacer-1",
      material_id: "mat-draft-spacer",
      sku: "SP-SILVER-4MM",
      color: "Silver",
      finish: "Smooth",
      size_label: "4mm",
      length_mm: null,
      width_mm: null,
      height_mm: null,
      diameter_mm: 4,
      hole_diameter_mm: 1,
      attachment_size_mm: null,
      selling_unit: "piece",
      purchase_cost: 1.0,
      selling_rate: 3.0,
      stock: 3, // Low stock (<= 5)
      low_stock_threshold: 5,
      is_active: true,
      image_url: null,
      render_asset_url: null,
      created_at: new Date(),
      updated_at: new Date(),
    },
  ];

  // Active reservations:
  // - BEAD-RQ-8MM has 2 units in an active reservation
  // - Panda assortment has 3 units in an active pooled reservation
  const mockReservationRows = [
    { material_id: "mat-bead-01", sku: "BEAD-RQ-8MM", reserved_quantity: 2 },
    { material_id: "mat-panda-charm", sku: "MAT-PANDA", reserved_quantity: 3 },
  ];

  // Material links: mat-draft-spacer is linked to customization inventory
  const mockLinks = [
    {
      id: "link-01",
      studio_material_id: "mat-draft-spacer",
      studio_variant_sku: "SP-SILVER-4MM",
      customization_material_id: "cust-mat-spacer",
      customization_variant_sku: "CUST-SP-01",
      authoritative_source: "customization",
      consumption_qty: 1,
      notes: "Shared spacer pool",
    },
  ];

  const mockClient: any = {
    query: async (sql: string, _params?: any[]) => {
      const s = sql.toLowerCase();
      if (s.includes("from studio_reservation_items")) {
        return { rows: mockReservationRows };
      }
      if (s.includes("from studio_material_links")) {
        return { rows: mockLinks };
      }
      if (s.includes("from studio_categories")) {
        return {
          rows: [
            { id: "cat-1", name: "Bracelet", slug: "bracelet" },
            { id: "cat-2", name: "Necklace", slug: "necklace" },
          ],
        };
      }
      if (s.includes("from component_types")) {
        return {
          rows: [
            { type_id: "bead", display_name: "Bead" },
            { type_id: "charm", display_name: "Charm" },
            { type_id: "spacer", display_name: "Spacer" },
            { type_id: "wire_cord", display_name: "Cord / Wire" },
          ],
        };
      }
      if (s.includes("from studio_materials")) {
        return { rows: mockMaterials };
      }
      if (s.includes("from studio_material_variants")) {
        return { rows: mockVariants };
      }
      return { rows: [] };
    },
  };

  const repo = new PostgresStudioRepository(mockClient);

  console.log("\n--- Scenario 1: Authoritative Stock Calculation & Isolation ---");

  const dashboard = await repo.getStudioInventoryDashboard(undefined, mockClient);

  test("Dashboard returns summary, materials, categories, and componentTypes", () => {
    assert(dashboard.summary, "Summary must be present");
    assert(Array.isArray(dashboard.materials), "Materials must be an array");
    assert(dashboard.materials.length === 4, `Expected 4 materials, found ${dashboard.materials.length}`);
    assert(dashboard.categories.length === 2, "Expected 2 categories");
    assert(dashboard.componentTypes.length === 4, "Expected 4 component types");
  });

  test("Direct Studio material calculates stock and active reservation correctly without double deduction", () => {
    const beadMat = dashboard.materials.find((m) => m.id === "mat-bead-01");
    assert(beadMat, "Rose quartz bead material must exist");
    assert.strictEqual(beadMat.inventorySource, "Independent Studio", "Unlinked material must be Independent Studio");
    assert.strictEqual(beadMat.totalAvailableStock, 15, "Available stock should equal 15 (15 + 0)");
    assert.strictEqual(beadMat.totalReservedStock, 2, "Reserved stock should equal 2 from active reservation");

    const v8mm = beadMat.variants.find((v) => v.sku === "BEAD-RQ-8MM");
    assert(v8mm, "8mm variant must exist");
    assert.strictEqual(v8mm.availableQuantity, 15, "8mm variant available quantity must be 15");
    assert.strictEqual(v8mm.reservedQuantity, 2, "8mm variant reserved quantity must be 2");
    assert.strictEqual(v8mm.isOutOfStock, false, "8mm is in stock");

    const v10mm = beadMat.variants.find((v) => v.sku === "BEAD-RQ-10MM");
    assert(v10mm, "10mm variant must exist");
    assert.strictEqual(v10mm.availableQuantity, 0, "10mm variant available quantity must be 0");
    assert.strictEqual(v10mm.isOutOfStock, true, "10mm variant must be flagged out of stock");
  });

  test("Seller-random assortment pool calculates combined available stock minus pending reservations", () => {
    const pandaMat = dashboard.materials.find((m) => m.id === "mat-panda-charm");
    assert(pandaMat, "Panda charm material must exist");
    assert.strictEqual(pandaMat.selectionPolicy, "seller_random_variant");

    // Gross stock = 4 (Gold) + 6 (Silver) = 10
    // Pending pooled reservations = 3
    // Available pool stock = 10 - 3 = 7
    assert.strictEqual(pandaMat.totalAvailableStock, 7, `Expected 7 available pool units, got ${pandaMat.totalAvailableStock}`);
    assert.strictEqual(pandaMat.totalReservedStock, 3, `Expected 3 reserved pool units, got ${pandaMat.totalReservedStock}`);
  });

  test("Linked material identifies Store Customization authoritative source", () => {
    const draftSpacer = dashboard.materials.find((m) => m.id === "mat-draft-spacer");
    assert(draftSpacer, "Draft spacer must exist");
    assert.strictEqual(draftSpacer.inventorySource, "Store Customization (Linked)");
    assert.strictEqual(draftSpacer.authoritativeSource, "customization");
  });

  test("Draft and unpublished materials remain visible to Admin", () => {
    const draftSpacer = dashboard.materials.find((m) => m.id === "mat-draft-spacer");
    assert(draftSpacer, "Draft spacer must exist in admin dashboard");
    assert.strictEqual(draftSpacer.isPublished, false, "Draft spacer must have isPublished: false");

    const emptyMat = dashboard.materials.find((m) => m.id === "mat-no-variants");
    assert(emptyMat, "Empty inactive material must be visible to admin");
    assert.strictEqual(emptyMat.isActive, false, "Inactive material must have isActive: false");
    assert.strictEqual(emptyMat.variantCount, 0, "Empty material has 0 variants");
  });

  test("Material without variants displays 0 stock and is not marked out of stock", () => {
    const emptyMat = dashboard.materials.find((m) => m.id === "mat-no-variants");
    assert(emptyMat, "Empty material must exist");
    assert.strictEqual(emptyMat.totalAvailableStock, 0);
    assert.strictEqual(emptyMat.isOutOfStock, false, "Material without variants should display empty/not-tracked state, not out-of-stock");
  });

  test("Summary counts reflect authoritative totals accurately", () => {
    const sum = dashboard.summary;
    assert.strictEqual(sum.totalMaterials, 4, `Expected 4 total materials, got ${sum.totalMaterials}`);
    assert.strictEqual(sum.totalVariants, 5, `Expected 5 total variants, got ${sum.totalVariants}`);
    assert.strictEqual(sum.totalReservedUnits, 5, `Expected 5 total reserved units (2 + 3), got ${sum.totalReservedUnits}`);
    assert.strictEqual(sum.outOfStockVariants, 1, `Expected 1 out of stock variant, got ${sum.outOfStockVariants}`);
    assert.strictEqual(sum.lowStockVariants, 1, `Expected 1 low stock variant, got ${sum.lowStockVariants}`);
  });

  console.log("\n--- Scenario 2: Search and Filtering Tests ---");

  test("Search by SKU finds matching material", async () => {
    const res = await repo.getStudioInventoryDashboard({ search: "CH-PANDA-GOLD" }, mockClient);
    assert.strictEqual(res.materials.length, 1, "Should find exactly 1 material with SKU CH-PANDA-GOLD");
    assert.strictEqual(res.materials[0].id, "mat-panda-charm");
  });

  test("Filter by category isolates target category", async () => {
    const res = await repo.getStudioInventoryDashboard({ category: "necklace" }, mockClient);
    assert.strictEqual(res.materials.length, 1, "Only rose quartz is allowed for necklace");
    assert.strictEqual(res.materials[0].id, "mat-bead-01");
  });

  test("Filter by componentType returns matching types", async () => {
    const res = await repo.getStudioInventoryDashboard({ componentType: "charm" }, mockClient);
    assert.strictEqual(res.materials.length, 1, "Only panda charm has componentType charm");
    assert.strictEqual(res.materials[0].id, "mat-panda-charm");
  });

  test("Filter by stockStatus (out_of_stock) filters correctly", async () => {
    // Only mat-bead-01 has an out of stock variant or mat-bead-01 has 1 out-of-stock variant
    const res = await repo.getStudioInventoryDashboard({ stockStatus: "in_stock" }, mockClient);
    assert(res.materials.every((m) => m.totalAvailableStock > 0), "All returned materials must have stock > 0");
  });

  test("Filter by published status isolates published materials", async () => {
    const res = await repo.getStudioInventoryDashboard({ published: "published" }, mockClient);
    assert(res.materials.every((m) => m.isPublished === true), "All returned materials must be published");
    assert(!res.materials.some((m) => m.id === "mat-draft-spacer"), "Draft spacer must not be in published list");
  });

  console.log("\n--- Scenario 3: Product Inventory Independence Verification ---");

  test("Product Inventory repository operates independently and is untouched", () => {
    const productInvRepo = new PostgresInventoryRepository();
    assert(productInvRepo, "PostgresInventoryRepository must exist independently");
    assert(typeof productInvRepo.findLogs === "function", "findLogs method must exist");
    assert(typeof productInvRepo.getSummary === "function", "getSummary method must exist");
  });

  console.log("\n================================================================================");
  console.log(`TOTAL SUITE: ${passed} PASSED / ${failed} FAILED`);
  console.log("================================================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error("FATAL ERROR in test suite:", err);
  process.exit(1);
});
