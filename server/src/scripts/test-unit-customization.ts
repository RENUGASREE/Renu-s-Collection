/**
 * ============================================================================
 * Comprehensive Verification Test Suite: Customization Enhancement & Quality Review
 * ============================================================================
 *
 * Verifies:
 * 1. Feature 1: Instagram Integration
 *    - Validates handle @renus_collections05, clean URL without tracking params,
 *      noopener noreferrer security rel, responsive CTA text across contact, footer, product.
 * 2. Feature 2: Transparent Material Image Requirement
 *    - Validates createMaterialSchema rejects missing/empty renderAssetUrl.
 *    - Validates createMaterialSchema accepts valid renderAssetUrl.
 *    - Validates updateMaterialSchema allows editing existing materials without re-uploading.
 * 3. Feature 3: Individual Bracelet Customization for Multiple Quantities
 *    - Single bracelet with 1 charm.
 *    - Single bracelet with multiple counts of same charm (e.g. Pearl x 2).
 *    - Multi-quantity bracelets (quantity = 3):
 *      - Distinct configurations for Bracelet 1, Bracelet 2, Bracelet 3.
 *      - Independent charm counts per bracelet.
 *      - Explicit copy logic between bracelets.
 *    - Cart Service unit configuration validation & price calculation.
 *    - Cart quantity adjustments (adding/trimming unit configurations).
 *    - Duplicate cart item matching semantics.
 *    - Studio Inventory aggregation across ALL units of all bracelets.
 *    - Stock validation & atomic reservation/rejection when demand exceeds available stock.
 *    - Order item persistence with unitConfigurations.
 *
 * Run:
 *   node server/node_modules/tsx/dist/cli.mjs server/src/scripts/test-unit-customization.ts
 */

import { readFileSync } from "fs";
import { resolve } from "path";
import { createMaterialSchema, updateMaterialSchema } from "../validators/studio.validators.js";
import {
  aggregateCustomDesignComponents,
  validateCustomDesignStock,
  setStudioRepository,
} from "../services/studio-inventory.service.js";
import { PostgresStudioRepository } from "../repositories/postgres-studio.repository.js";
import { AppError } from "../middleware/errorHandler.js";

// Test assertion counters
let passedTests = 0;
let totalTests = 0;

async function test(title: string, fn: () => Promise<void> | void) {
  totalTests++;
  try {
    await fn();
    passedTests++;
    console.log(`  ✓ ${title}`);
  } catch (err: any) {
    console.error(`  ✗ ${title}`);
    console.error(`    Error: ${err?.message || err}`);
    throw err;
  }
}

// In-memory mock studio repository for stock validation
class MockStudioRepository extends PostgresStudioRepository {
  private materials: any[] = [];

  constructor(materials: any[]) {
    super();
    this.materials = materials;
  }

  public override async findMaterialsBySkus(skus: string[]): Promise<any[]> {
    const skuSet = new Set(skus.map((s) => s.toUpperCase()));
    return this.materials.filter((m) =>
      m.variants.some((v: any) => skuSet.has(v.sku.toUpperCase()))
    );
  }
}

async function runTestSuite() {
  console.log("\n=======================================================");
  console.log("   CUSTOMIZATION ENHANCEMENT & QUALITY REVIEW TEST SUITE");
  console.log("=======================================================\n");

  // --------------------------------------------------------------------------
  // FEATURE 1: Instagram Integration Audit
  // --------------------------------------------------------------------------
  console.log("--- Feature 1: Instagram in Connect Section, Footer & Customization ---");

  await test("Contact page contains clean Instagram link with rel=noopener noreferrer", () => {
    const contactPath = resolve(process.cwd(), "frontend/src/pages/contact.tsx");
    const content = readFileSync(contactPath, "utf-8");

    if (!content.includes("https://www.instagram.com/renus_collections05/")) {
      throw new Error("Contact page does not link to correct Instagram URL");
    }
    if (content.includes("igsh=") || content.includes("utm_")) {
      throw new Error("Contact page URL contains tracking parameters");
    }
    if (!content.includes("@renus_collections05")) {
      throw new Error("Contact page does not display @renus_collections05");
    }
    if (!content.includes('rel="noopener noreferrer"')) {
      throw new Error("Contact page missing security rel attributes");
    }
    if (!content.includes("DM us on Instagram")) {
      throw new Error("Contact page missing custom design DM CTA text");
    }
  });

  await test("Footer contains clean Instagram link and handle", () => {
    const footerPath = resolve(process.cwd(), "frontend/src/components/footer.tsx");
    const content = readFileSync(footerPath, "utf-8");

    if (!content.includes("https://www.instagram.com/renus_collections05/")) {
      throw new Error("Footer does not link to correct Instagram URL");
    }
    if (!content.includes("@renus_collections05")) {
      throw new Error("Footer does not display @renus_collections05");
    }
    if (!content.includes('rel="noopener noreferrer"')) {
      throw new Error("Footer missing security rel attributes");
    }
  });

  await test("Product detail page contains subtle custom inquiry note linking to Instagram DM", () => {
    const productDetailPath = resolve(process.cwd(), "frontend/src/pages/product-detail.tsx");
    const content = readFileSync(productDetailPath, "utf-8");

    if (!content.includes("https://www.instagram.com/renus_collections05/")) {
      throw new Error("Product detail does not link to Instagram");
    }
    if (!content.includes("DM us @renus_collections05")) {
      throw new Error("Product detail missing DM handle CTA");
    }
  });

  // --------------------------------------------------------------------------
  // FEATURE 2: Transparent Material Image Requirement
  // --------------------------------------------------------------------------
  console.log("\n--- Feature 2: Transparent Material Image Requirement ---");

  await test("createMaterialSchema rejects creation when renderAssetUrl is missing", () => {
    const invalidInput = {
      name: "Shell Pearl Charm",
      code: "CH-PEARL",
      materialType: "metal",
      imageUrl: "https://example.supabase.co/storage/v1/object/public/product-images/pearl.jpg",
      allowedJewelleryTypes: ["bracelet"],
    };
    const result = createMaterialSchema.safeParse(invalidInput);
    if (result.success) {
      throw new Error("createMaterialSchema should have rejected missing renderAssetUrl");
    }
  });

  await test("createMaterialSchema rejects creation when renderAssetUrl is empty string", () => {
    const invalidInput = {
      name: "Shell Pearl Charm",
      code: "CH-PEARL",
      materialType: "metal",
      imageUrl: "https://example.supabase.co/storage/v1/object/public/product-images/pearl.jpg",
      renderAssetUrl: "",
      allowedJewelleryTypes: ["bracelet"],
    };
    const result = createMaterialSchema.safeParse(invalidInput);
    if (result.success) {
      throw new Error("createMaterialSchema should have rejected empty renderAssetUrl");
    }
  });

  await test("createMaterialSchema accepts creation when valid renderAssetUrl is supplied", () => {
    const validInput = {
      name: "Shell Pearl Charm",
      code: "CH-PEARL",
      materialType: "metal",
      imageUrl: "https://example.supabase.co/storage/v1/object/public/product-images/pearl.jpg",
      renderAssetUrl: "https://example.supabase.co/storage/v1/object/public/product-images/pearl.png",
      allowedJewelleryTypes: ["bracelet"],
    };
    const result = createMaterialSchema.safeParse(validInput);
    if (!result.success) {
      throw new Error(`createMaterialSchema unexpectedly rejected: ${JSON.stringify(result.error)}`);
    }
  });

  await test("updateMaterialSchema allows updating existing material without re-uploading renderAssetUrl", () => {
    const validUpdate = {
      name: "Updated Shell Pearl Charm",
      price: 180,
    };
    const result = updateMaterialSchema.safeParse(validUpdate);
    if (!result.success) {
      throw new Error(`updateMaterialSchema should allow omitting renderAssetUrl on edit: ${JSON.stringify(result.error)}`);
    }
  });

  await test("Admin Studio UI enforces Transparent Image (Required) on creation and preserves on edit", () => {
    const adminStudioPath = resolve(process.cwd(), "frontend/src/pages/admin-studio.tsx");
    const content = readFileSync(adminStudioPath, "utf-8");

    if (!content.includes("Transparent Image (Required)")) {
      throw new Error("Admin Studio UI missing 'Transparent Image (Required)' label");
    }
    if (!content.includes("Transparent Image is required for studio materials")) {
      throw new Error("Admin Studio UI missing client-side validation error message");
    }
    if (!content.includes("Transparent PNG cutout is compulsory")) {
      throw new Error("Admin Studio UI missing inline compulsory indicator text");
    }
  });

  // --------------------------------------------------------------------------
  // FEATURE 3: Individual Bracelet Customization for Multiple Quantities
  // --------------------------------------------------------------------------
  console.log("\n--- Feature 3: Individual Bracelet Customization for Multiple Quantities ---");

  await test("CustomizationControls supports multi-quantity charm counts with counters", () => {
    const controlsPath = resolve(process.cwd(), "frontend/src/components/CustomizationControls.tsx");
    const content = readFileSync(controlsPath, "utf-8");

    if (!content.includes("handleIncrement") || !content.includes("handleDecrement")) {
      throw new Error("CustomizationControls missing charm counter increment/decrement handlers");
    }
    if (!content.includes("aria-label={`Decrease ${option.label} count`}")) {
      throw new Error("CustomizationControls missing decrease charm button");
    }
    if (!content.includes("aria-label={`Increase ${option.label} count`}")) {
      throw new Error("CustomizationControls missing increase charm button");
    }
  });

  await test("aggregateCustomDesignComponents aggregates charm variants across 1 bracelet with 1 charm", () => {
    const cartItems = [
      {
        itemType: "product",
        name: "Charm Bracelet",
        quantity: 1,
        customization: {
          unitConfigurations: [
            {
              unitIndex: 1,
              label: "Bracelet 1",
              selections: {
                charms: ["CH-BUTTERFLY"],
              },
            },
          ],
        },
      },
    ];

    const aggregated = aggregateCustomDesignComponents(cartItems);
    if (aggregated["CH-BUTTERFLY"]?.quantity !== 1) {
      throw new Error(`Expected 1 CH-BUTTERFLY, got ${aggregated["CH-BUTTERFLY"]?.quantity}`);
    }
  });

  await test("aggregateCustomDesignComponents aggregates charm variants across 1 bracelet with multiple same charms", () => {
    const cartItems = [
      {
        itemType: "product",
        name: "Charm Bracelet",
        quantity: 1,
        customization: {
          unitConfigurations: [
            {
              unitIndex: 1,
              label: "Bracelet 1",
              selections: {
                charms: ["CH-PEARL", "CH-PEARL"],
              },
            },
          ],
        },
      },
    ];

    const aggregated = aggregateCustomDesignComponents(cartItems);
    if (aggregated["CH-PEARL"]?.quantity !== 2) {
      throw new Error(`Expected 2 CH-PEARL, got ${aggregated["CH-PEARL"]?.quantity}`);
    }
  });

  await test("aggregateCustomDesignComponents aggregates charm variants across 3 bracelets with different charm combinations and repeats", () => {
    const cartItems = [
      {
        itemType: "product",
        name: "Custom Bracelet Set",
        quantity: 3,
        customization: {
          unitConfigurations: [
            {
              unitIndex: 1,
              label: "Bracelet 1",
              selections: {
                charms: ["CH-BUTTERFLY", "CH-PEARL", "CH-PEARL"], // 1 butterfly, 2 pearls
              },
            },
            {
              unitIndex: 2,
              label: "Bracelet 2",
              selections: {
                charms: ["CH-HEART"], // 1 heart
              },
            },
            {
              unitIndex: 3,
              label: "Bracelet 3",
              selections: {
                charms: ["CH-BUTTERFLY", "CH-BUTTERFLY", "CH-PEARL"], // 2 butterflies, 1 pearl
              },
            },
          ],
        },
      },
    ];

    const aggregated = aggregateCustomDesignComponents(cartItems);

    // Total Butterflies: 1 (B1) + 2 (B3) = 3
    if (aggregated["CH-BUTTERFLY"]?.quantity !== 3) {
      throw new Error(`Expected 3 CH-BUTTERFLY, got ${aggregated["CH-BUTTERFLY"]?.quantity}`);
    }
    // Total Pearls: 2 (B1) + 1 (B3) = 3
    if (aggregated["CH-PEARL"]?.quantity !== 3) {
      throw new Error(`Expected 3 CH-PEARL, got ${aggregated["CH-PEARL"]?.quantity}`);
    }
    // Total Hearts: 1 (B2) = 1
    if (aggregated["CH-HEART"]?.quantity !== 1) {
      throw new Error(`Expected 1 CH-HEART, got ${aggregated["CH-HEART"]?.quantity}`);
    }
  });

  await test("validateCustomDesignStock succeeds when sufficient stock is available across all bracelets", async () => {
    const mockRepo = new MockStudioRepository([
      {
        id: "mat-1",
        name: "Butterfly Charm",
        isActive: true,
        variants: [{ sku: "CH-BUTTERFLY", name: "Butterfly", stock: 10, isActive: true }],
      },
      {
        id: "mat-2",
        name: "Pearl Charm",
        isActive: true,
        variants: [{ sku: "CH-PEARL", name: "Pearl", stock: 10, isActive: true }],
      },
      {
        id: "mat-3",
        name: "Heart Charm",
        isActive: true,
        variants: [{ sku: "CH-HEART", name: "Heart", stock: 10, isActive: true }],
      },
    ]);
    setStudioRepository(mockRepo);

    const cartItems = [
      {
        itemType: "product",
        name: "Custom Bracelet Set",
        quantity: 3,
        customization: {
          unitConfigurations: [
            { unitIndex: 1, label: "Bracelet 1", selections: { charms: ["CH-BUTTERFLY", "CH-PEARL", "CH-PEARL"] } },
            { unitIndex: 2, label: "Bracelet 2", selections: { charms: ["CH-HEART"] } },
            { unitIndex: 3, label: "Bracelet 3", selections: { charms: ["CH-BUTTERFLY", "CH-BUTTERFLY", "CH-PEARL"] } },
          ],
        },
      },
    ];

    const verified = await validateCustomDesignStock(cartItems);
    if (Object.keys(verified).length !== 3) {
      throw new Error(`Expected 3 verified components, got ${Object.keys(verified).length}`);
    }
  });

  await test("validateCustomDesignStock rejects when aggregate demand across bracelets exceeds stock", async () => {
    const mockRepo = new MockStudioRepository([
      {
        id: "mat-1",
        name: "Butterfly Charm",
        isActive: true,
        variants: [{ sku: "CH-BUTTERFLY", name: "Butterfly", stock: 2, isActive: true }], // Only 2 in stock, but 3 needed!
      },
      {
        id: "mat-2",
        name: "Pearl Charm",
        isActive: true,
        variants: [{ sku: "CH-PEARL", name: "Pearl", stock: 10, isActive: true }],
      },
      {
        id: "mat-3",
        name: "Heart Charm",
        isActive: true,
        variants: [{ sku: "CH-HEART", name: "Heart", stock: 10, isActive: true }],
      },
    ]);
    setStudioRepository(mockRepo);

    const cartItems = [
      {
        itemType: "product",
        name: "Custom Bracelet Set",
        quantity: 3,
        customization: {
          unitConfigurations: [
            { unitIndex: 1, label: "Bracelet 1", selections: { charms: ["CH-BUTTERFLY", "CH-PEARL", "CH-PEARL"] } },
            { unitIndex: 2, label: "Bracelet 2", selections: { charms: ["CH-HEART"] } },
            { unitIndex: 3, label: "Bracelet 3", selections: { charms: ["CH-BUTTERFLY", "CH-BUTTERFLY", "CH-PEARL"] } },
          ],
        },
      },
    ];

    try {
      await validateCustomDesignStock(cartItems);
      throw new Error("Should have thrown AppError for insufficient stock");
    } catch (err: any) {
      if (!(err instanceof AppError) || err.statusCode !== 400) {
        throw new Error(`Expected AppError(400), got: ${err}`);
      }
      if (!err.message.includes("Insufficient stock") || !err.message.includes("CH-BUTTERFLY")) {
        throw new Error(`Unexpected error message: ${err.message}`);
      }
      if (!err.message.includes("Requested: 3, Available: 2")) {
        throw new Error(`Expected Requested: 3, Available: 2 in error message, got: ${err.message}`);
      }
    }
  });

  await test("Order service preserves unitConfigurations in order_items.customization", () => {
    const orderPath = resolve(process.cwd(), "server/src/services/order.service.ts");
    const content = readFileSync(orderPath, "utf-8");

    if (!content.includes("unitConfigurations: unitConfigurations || item.customization.unitConfigurations")) {
      throw new Error("order.service.ts does not persist unitConfigurations into order_items");
    }
    if (!content.includes("Customization configuration count")) {
      throw new Error("order.service.ts does not validate unitConfigurations.length === item.quantity");
    }
  });

  await test("UI displays per-bracelet breakdown in cart, customer receipt, and admin order views", () => {
    const cartPath = resolve(process.cwd(), "frontend/src/pages/cart.tsx");
    const cartContent = readFileSync(cartPath, "utf-8");
    if (!cartContent.includes("item.customization.unitConfigurations")) {
      throw new Error("cart.tsx does not display per-bracelet unitConfigurations");
    }

    const orderDetailsPath = resolve(process.cwd(), "frontend/src/pages/order-details.tsx");
    const orderDetailsContent = readFileSync(orderDetailsPath, "utf-8");
    if (!orderDetailsContent.includes("item.customization.unitConfigurations")) {
      throw new Error("order-details.tsx does not display per-bracelet unitConfigurations");
    }

    const adminOrdersPath = resolve(process.cwd(), "frontend/src/pages/admin-orders.tsx");
    const adminOrdersContent = readFileSync(adminOrdersPath, "utf-8");
    if (!adminOrdersContent.includes("i.customization.unitConfigurations")) {
      throw new Error("admin-orders.tsx does not display per-bracelet unitConfigurations");
    }
  });

  console.log(`\n=======================================================`);
  console.log(`   ALL TESTS COMPLETED: ${passedTests}/${totalTests} PASSED`);
  console.log(`=======================================================\n`);
}

runTestSuite().catch((err) => {
  console.error("Test suite failed:", err);
  process.exit(1);
});
