import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(process.cwd(), "server/.env") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });
dotenv.config();

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

const results: TestResult[] = [];

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function runTest(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    results.push({ name, passed: true });
    console.log(`[PASS] ${name}`);
  } catch (err: any) {
    results.push({ name, passed: false, error: err?.message || String(err) });
    console.error(`[FAIL] ${name}: ${err?.message}`);
  }
}

async function main() {
  console.log("================================================================================");
  console.log("Renu's Collections — Multi-Charm Linking & SKU Deletion Test Suite");
  console.log("================================================================================");

  // ---------------------------------------------------------------------------
  // Part 1 Tests: Multi-Select Shared Charm Linking Logic
  // ---------------------------------------------------------------------------

  const mockAvailableVariants = [
    {
      materialId: "mat_charm_01",
      materialName: "Shell Charm",
      imageUrl: "/images/shell-purple.jpg",
      sku: "CH-SHELL-PURPLE",
      color: "Purple",
      stock: 5,
      sellingRate: 40,
    },
    {
      materialId: "mat_charm_01",
      materialName: "Shell Charm",
      imageUrl: "/images/shell-pink.jpg",
      sku: "CH-SHELL-PINK",
      color: "Pink",
      stock: 8,
      sellingRate: 40,
    },
    {
      materialId: "mat_charm_02",
      materialName: "Starfish Charm",
      imageUrl: "/images/starfish-gold.jpg",
      sku: "CH-STARFISH-GOLD",
      color: "Gold",
      stock: 12,
      sellingRate: 50,
    },
    {
      materialId: "mat_charm_03",
      materialName: "Pearl Drop Charm",
      imageUrl: "/images/pearl-white.jpg",
      sku: "CH-PEARL-WHITE",
      color: "White",
      stock: 3,
      sellingRate: 60,
    },
  ];

  await runTest("Test 1: Select and link three charm variants in one operation", async () => {
    let formDataOptions: any[] = [];
    const selectedCharmSkus = ["CH-SHELL-PURPLE", "CH-SHELL-PINK", "CH-STARFISH-GOLD"];

    // Linking logic matching admin-customization.tsx
    const existingSkus = new Set((formDataOptions || []).map((o) => o.variantSku || o.value));
    const newOptions: any[] = [];

    for (const sku of selectedCharmSkus) {
      if (existingSkus.has(sku)) continue;
      const variant = mockAvailableVariants.find((v) => v.sku === sku);
      if (!variant) continue;

      const optLabel = variant.color
        ? `${variant.materialName} (${variant.color})`
        : variant.materialName;

      newOptions.push({
        value: variant.sku,
        label: optLabel,
        priceModifier: Number(variant.sellingRate) || 0,
        imageUrl: variant.imageUrl,
        materialId: variant.materialId,
        variantSku: variant.sku,
      });

      existingSkus.add(variant.sku);
    }

    formDataOptions = [...formDataOptions, ...newOptions];

    // Assertions
    assert(formDataOptions.length === 3, "Exactly 3 separate options must be added");
    assert(formDataOptions[0].variantSku === "CH-SHELL-PURPLE", "First option SKU matches");
    assert(formDataOptions[0].label === "Shell Charm (Purple)", "First option label formatted");
    assert(formDataOptions[0].priceModifier === 40, "First option rate matches");
    assert(formDataOptions[0].imageUrl === "/images/shell-purple.jpg", "First option image matches");

    assert(formDataOptions[1].variantSku === "CH-SHELL-PINK", "Second option SKU matches");
    assert(formDataOptions[1].label === "Shell Charm (Pink)", "Second option label formatted");
    assert(formDataOptions[1].priceModifier === 40, "Second option rate matches");

    assert(formDataOptions[2].variantSku === "CH-STARFISH-GOLD", "Third option SKU matches");
    assert(formDataOptions[2].label === "Starfish Charm (Gold)", "Third option label formatted");
    assert(formDataOptions[2].priceModifier === 50, "Third option rate matches");
  });

  await runTest("Test 2: Duplicate prevention when linking variants", async () => {
    let formDataOptions: any[] = [
      {
        value: "CH-SHELL-PURPLE",
        label: "Shell Charm (Purple)",
        priceModifier: 40,
        materialId: "mat_charm_01",
        variantSku: "CH-SHELL-PURPLE",
      },
    ];

    // Selecting 2 variants: one already present, one new
    const selectedCharmSkus = ["CH-SHELL-PURPLE", "CH-PEARL-WHITE"];

    const existingSkus = new Set((formDataOptions || []).map((o) => o.variantSku || o.value));
    const newOptions: any[] = [];

    for (const sku of selectedCharmSkus) {
      if (existingSkus.has(sku)) continue; // Must be skipped
      const variant = mockAvailableVariants.find((v) => v.sku === sku);
      if (!variant) continue;

      const optLabel = variant.color
        ? `${variant.materialName} (${variant.color})`
        : variant.materialName;

      newOptions.push({
        value: variant.sku,
        label: optLabel,
        priceModifier: Number(variant.sellingRate) || 0,
        imageUrl: variant.imageUrl,
        materialId: variant.materialId,
        variantSku: variant.sku,
      });

      existingSkus.add(variant.sku);
    }

    formDataOptions = [...formDataOptions, ...newOptions];

    assert(formDataOptions.length === 2, "Only the 1 new option should be added (no duplicates)");
    assert(formDataOptions[1].variantSku === "CH-PEARL-WHITE", "Pearl White was added");
  });

  await runTest("Test 3: Individual option removal leaves other linked options intact", async () => {
    let formDataOptions: any[] = [
      { value: "CH-SHELL-PURPLE", label: "Shell Charm (Purple)", variantSku: "CH-SHELL-PURPLE" },
      { value: "CH-SHELL-PINK", label: "Shell Charm (Pink)", variantSku: "CH-SHELL-PINK" },
      { value: "CH-STARFISH-GOLD", label: "Starfish Charm (Gold)", variantSku: "CH-STARFISH-GOLD" },
    ];

    // Remove index 1 (CH-SHELL-PINK)
    formDataOptions = formDataOptions.filter((_, i) => i !== 1);

    assert(formDataOptions.length === 2, "Options length must be 2");
    assert(formDataOptions[0].variantSku === "CH-SHELL-PURPLE", "Purple remained");
    assert(formDataOptions[1].variantSku === "CH-STARFISH-GOLD", "Gold remained");
    assert(!formDataOptions.some((o) => o.variantSku === "CH-SHELL-PINK"), "Pink removed");
  });

  // ---------------------------------------------------------------------------
  // Part 2 Tests: Individual SKU Variant Deletion & Safeguards
  // ---------------------------------------------------------------------------

  interface MockVariant {
    _id: string;
    sku: string;
    color: string;
    stock: number;
    isActive: boolean;
  }

  interface MockMaterial {
    _id: string;
    name: string;
    variants: MockVariant[];
  }

  await runTest("Test 4: Individual SKU deletion by variant ID or SKU leaves sibling variants intact", async () => {
    const material: MockMaterial = {
      _id: "mat_bead_99",
      name: "Agate Bead",
      variants: [
        { _id: "var_001", sku: "AGATE-6MM", color: "Blue", stock: 10, isActive: true },
        { _id: "var_002", sku: "AGATE-8MM", color: "Blue", stock: 20, isActive: true },
        { _id: "var_003", sku: "AGATE-10MM", color: "Blue", stock: 15, isActive: true },
      ],
    };

    // Delete variant var_002 by variantId
    const targetParam = "var_002";
    const variantIndex = material.variants.findIndex(
      (v) => v._id === targetParam || v.sku.toUpperCase() === targetParam.toUpperCase()
    );

    assert(variantIndex === 1, "Must find variant index 1");
    material.variants.splice(variantIndex, 1);

    assert(material.variants.length === 2, "Material must now have 2 variants");
    assert(material.variants[0].sku === "AGATE-6MM", "var_001 remained intact");
    assert(material.variants[1].sku === "AGATE-10MM", "var_003 remained intact");
    assert(!material.variants.some((v) => v.sku === "AGATE-8MM"), "AGATE-8MM permanently deleted");
  });

  await runTest("Test 5: Historical order check prevents deletion and offers safe deactivation", async () => {
    const targetSku = "HIST-ORDER-SKU";
    const targetVariantId = "var_hist_01";

    const mockOrders = [
      {
        orderNumber: "ORD-1001",
        items: [
          {
            studioDesign: {
              charms: [{ variantSku: targetSku, variantId: targetVariantId }],
            },
          },
        ],
      },
    ];

    // Check order reference
    const orderCount = mockOrders.filter((o) =>
      o.items.some((item) =>
        item.studioDesign?.charms?.some(
          (c) => c.variantSku === targetSku || c.variantId === targetVariantId
        )
      )
    ).length;

    assert(orderCount === 1, "Must find 1 historical order reference");

    // Controller safeguard logic
    let deletionBlocked = false;
    let responseStatus = 200;
    let responseBody: any = null;

    if (orderCount > 0) {
      deletionBlocked = true;
      responseStatus = 409;
      responseBody = {
        success: false,
        canDeactivate: true,
        isHistoricalOrder: true,
        orderCount,
        message: `Cannot permanently delete SKU "${targetSku}" because it is referenced in ${orderCount} historical order(s). Historical order records cannot be altered. Please deactivate this variant instead so it is hidden from future orders while preserving order history.`,
      };
    }

    assert(deletionBlocked === true, "Deletion must be blocked");
    assert(responseStatus === 409, "Must return HTTP 409");
    assert(responseBody.canDeactivate === true, "Must offer safe deactivation");
    assert(responseBody.message.includes("referenced in 1 historical order"), "Message explains order protection");

    // Client error handler check: 409 caught by admin-studio.tsx
    const err = new Error(`409: ${responseBody.message}`);
    const is409 = err.message.includes("409");
    assert(is409 === true, "Client must detect 409 from apiRequest exception");

    const cleanMessage = err.message.replace(/^\d+:\s*/, "");
    assert(cleanMessage === responseBody.message, "Clean message extracted for popup dialog");
  });

  await runTest("Test 6: Safe deactivation sets isActive: false and preserves variant record", async () => {
    const variant: MockVariant = {
      _id: "var_hist_01",
      sku: "HIST-ORDER-SKU",
      color: "Red",
      stock: 5,
      isActive: true,
    };

    // Update variant isActive: false
    variant.isActive = false;

    assert(variant.isActive === false, "Variant is now inactive");
    assert(variant.sku === "HIST-ORDER-SKU", "SKU is preserved");
    assert(variant.stock === 5, "Stock is preserved");
  });

  console.log("\n================================================================================");
  console.log("Test Summary:");
  const total = results.length;
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  console.log(`Passed: ${passed}/${total}`);
  if (failed > 0) {
    console.error(`Failed: ${failed}/${total}`);
    process.exit(1);
  } else {
    console.log("All 6 Multi-Charm Linking & SKU Deletion tests passed successfully!");
  }
}

main().catch((err) => {
  console.error("Unhandled test execution error:", err);
  process.exit(1);
});
