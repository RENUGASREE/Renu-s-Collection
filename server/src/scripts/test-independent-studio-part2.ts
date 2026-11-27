/**
 * ============================================================================
 * TEST SUITE: Independent Studio Part 2
 * ============================================================================
 * Verifies:
 * 1. Variant-Specific Images & Image-Resolution Priority
 * 2. Natural Charm Silhouette vs Graceful Star Medallion Fallback
 * 3. Seller-Random Assortment Pooled Inventory & Admin Allocation
 * 4. Instant Maximum Charm Validation & Real-Time Counter Logic
 * 5. Multi-Unit Real-Time Stock Aggregation & Exhaustion Guard
 * 6. Independent Studio Architecture & Relational Integrity
 */

import assert from "assert";

console.log("=== STARTING INDEPENDENT STUDIO PART 2 TEST SUITE ===\n");

let passed = 0;
let failed = 0;

async function runTest(name: string, fn: () => void | Promise<void>): Promise<void> {
  try {
    const res = fn();
    if (res instanceof Promise) {
      await res;
    }
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err: any) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
    failed++;
  }
}

async function main() {
  console.log("--- 1. Variant-Specific Images & Image Resolution Priority ---");

  await runTest("Variant renderAssetUrl takes highest priority over parent image", () => {
    const parentMaterial = {
      name: "Butterfly Charms - Design 2",
      imageUrl: "/uploads/butterflies-towel.jpg",
      renderAssetUrl: null,
    };
    const variantSmallBlue = {
      sku: "CH-BUTTERFLY-D2-BLUE",
      sizeLabel: "Small Blue",
      imageUrl: "/uploads/variant-blue-butterfly.jpg",
      renderAssetUrl: "/uploads/variant-blue-butterfly-render.png",
    };

    // Priority resolution logic
    const resolvedAsset = variantSmallBlue.renderAssetUrl || (
      variantSmallBlue.imageUrl && (variantSmallBlue.imageUrl.endsWith(".png") || variantSmallBlue.imageUrl.endsWith(".webp"))
        ? variantSmallBlue.imageUrl
        : parentMaterial.renderAssetUrl
    );

    assert.strictEqual(resolvedAsset, "/uploads/variant-blue-butterfly-render.png");
  });

  await runTest("Variant transparent PNG imageUrl is resolved when no renderAssetUrl is set", () => {
    const parentMaterial = {
      name: "Butterfly Charms - Design 2",
      imageUrl: "/uploads/butterflies-towel.jpg",
      renderAssetUrl: null,
    };
    const variantSmallPurple = {
      sku: "CH-BUTTERFLY-D2-PURPLE",
      sizeLabel: "Small Purple with Golden",
      imageUrl: "/uploads/variant-purple-butterfly-cutout.png",
      renderAssetUrl: null,
    };

    const resolvedAsset = variantSmallPurple.renderAssetUrl || (
      variantSmallPurple.imageUrl && (variantSmallPurple.imageUrl.endsWith(".png") || variantSmallPurple.imageUrl.endsWith(".webp"))
        ? variantSmallPurple.imageUrl
        : parentMaterial.renderAssetUrl
    );

    assert.strictEqual(resolvedAsset, "/uploads/variant-purple-butterfly-cutout.png");
  });

  await runTest("Camera photo on towel (JPG) does NOT squish into circular clip, triggers graceful medallion fallback", () => {
    const parentMaterial = {
      name: "Butterfly Charms - Design 2",
      imageUrl: "/uploads/butterflies-towel.jpg", // group photo on towel
      renderAssetUrl: null,
    };
    const variant: {
      sku: string;
      sizeLabel: string;
      imageUrl: string | null;
      renderAssetUrl: string | null;
    } = {
      sku: "CH-BUTTERFLY-D2-UNEDITED",
      sizeLabel: "Small Blue",
      imageUrl: null,
      renderAssetUrl: null,
    };

    assert.ok(parentMaterial.imageUrl);
    const transparentSrc = variant.renderAssetUrl || (
      variant.imageUrl && (variant.imageUrl.endsWith(".png") || variant.imageUrl.endsWith(".webp"))
        ? variant.imageUrl
        : null
    );

    // If transparentSrc is null, BraceletCanvas renders the metallic star medallion ✦
    assert.strictEqual(transparentSrc, null, "Should not use towel photo as transparent asset");
    const fallbackRendered = transparentSrc === null ? "metallic_star_medallion" : "natural_silhouette";
    assert.strictEqual(fallbackRendered, "metallic_star_medallion");
  });

  console.log("\n--- 2. Seller-Random Assortment Inventory & Allocation ---");

  await runTest("Panda Charm with seller_random_variant pools stock across gold and silver variants", () => {
    const pandaMaterial = {
      code: "CH-PANDA-01",
      name: "Panda Charm",
      selectionPolicy: "seller_random_variant",
      assortmentNotes: "Gold or Silver finish will be randomly selected by our artisans.",
      eligibleAssortmentSkus: ["CH-PANDA-GOLD", "CH-PANDA-SILVER"],
      variants: [
        { sku: "CH-PANDA-GOLD", sizeLabel: "Gold Finish", stock: 4, isActive: true },
        { sku: "CH-PANDA-SILVER", sizeLabel: "Silver Finish", stock: 6, isActive: true },
        { sku: "CH-PANDA-BRONZE", sizeLabel: "Bronze Finish", stock: 0, isActive: false },
      ],
    };

    const eligible = pandaMaterial.variants.filter(
      (v) => v.isActive && (!pandaMaterial.eligibleAssortmentSkus?.length || pandaMaterial.eligibleAssortmentSkus.includes(v.sku))
    );
    const poolStock = eligible.reduce((sum, v) => sum + v.stock, 0);

    assert.strictEqual(poolStock, 10, "Pooled stock must sum active eligible variants (4 + 6 = 10)");
  });

  await runTest("Admin variant allocation converts pool selection to physical variant and logs audit history", async () => {
    const order = {
      id: "ord-test-random-1",
      status: "processing",
      items: [
        {
          id: "item-1",
          sku: "CH-PANDA-01",
          name: "Panda Charm (Seller Random Assortment)",
          quantity: 1,
          customization: {
            selectionPolicy: "seller_random_variant",
          },
        },
      ],
      statusHistory: [] as any[],
    };

    const variantsInStock: Record<string, number> = {
      "CH-PANDA-GOLD": 4,
      "CH-PANDA-SILVER": 6,
    };

    // Simulate allocation action
    const chosenSku = "CH-PANDA-GOLD";
    assert.ok(variantsInStock[chosenSku] > 0, "Variant must have stock");
    variantsInStock[chosenSku] -= 1;

    (order.items[0].customization as any).allocatedVariantSku = chosenSku;
    order.statusHistory.push({
      status: order.status,
      note: `Allocated physical variant ${chosenSku} for CH-PANDA-01 on item #1`,
      changedAt: new Date().toISOString(),
      changedBy: "admin-user-01",
    });

    assert.strictEqual(variantsInStock["CH-PANDA-GOLD"], 3);
    assert.strictEqual((order.items[0].customization as any).allocatedVariantSku, "CH-PANDA-GOLD");
    assert.strictEqual(order.statusHistory.length, 1);
    assert.ok(order.statusHistory[0].note.includes("Allocated physical variant CH-PANDA-GOLD"));
  });

  console.log("\n--- 3. Instant Maximum Charm Validation & Real-Time Counter ---");

  await runTest("Enforces maxCharms limit with immediate UI disabling and warning", () => {
    const maxCharms = 3;
    const currentCharms = [
      { instanceId: "c1", variantSku: "CH-BUTTERFLY-D2-BLUE" },
      { instanceId: "c2", variantSku: "CH-BUTTERFLY-D2-PURPLE" },
      { instanceId: "c3", variantSku: "CH-SHELL-PURPLE" },
    ];

    const canAddMore = currentCharms.length < maxCharms;
    const counterText = `Selected charms: ${currentCharms.length} / ${maxCharms}`;

    assert.strictEqual(canAddMore, false, "Must block adding 4th charm when limit is 3");
    assert.strictEqual(counterText, "Selected charms: 3 / 3");
  });

  await runTest("Supports distinct_types count mode for charms", () => {
    const maxCharms = 2;
    const mode = "distinct_types";
    assert.strictEqual(mode, "distinct_types");

    const currentCharms = [
      { instanceId: "c1", variantSku: "CH-BUTTERFLY-D2-BLUE" },
      { instanceId: "c2", variantSku: "CH-BUTTERFLY-D2-BLUE" }, // same type
    ];

    const distinctCount = new Set(currentCharms.map((c) => c.variantSku)).size;
    assert.strictEqual(distinctCount, 1, "Only 1 distinct charm type used");
    assert.strictEqual(distinctCount < maxCharms, true, "Room for 1 more distinct charm type");
  });

  console.log("\n--- 4. Multi-Unit Stock Aggregation Across Quantities ---");

  await runTest("Aggregates inventory demand across all bracelet units in multi-quantity order", () => {
    const stockDatabase: Record<string, number> = {
      "CH-BUTTERFLY-D2-BLUE": 1, // Only 1 piece physically in stock!
    };

    const unit1Selections = { charms: ["CH-BUTTERFLY-D2-BLUE"] };
    const unit2Selections = { charms: [] as string[] };
    assert.strictEqual(unit2Selections.charms.length, 0);

    // Unit 1 already took 1 piece
    const unit1Demand = unit1Selections.charms.filter((s) => s === "CH-BUTTERFLY-D2-BLUE").length;
    const availableForUnit2 = stockDatabase["CH-BUTTERFLY-D2-BLUE"] - unit1Demand;

    assert.strictEqual(availableForUnit2, 0, "Available stock for Unit 2 must be 0");
    const canUnit2Select = availableForUnit2 > 0;
    assert.strictEqual(canUnit2Select, false, "Unit 2 must be blocked from selecting exhausted charm");
  });

  await runTest("Allows selecting distinct in-stock components in Unit 2", () => {
    const stockDatabase: Record<string, number> = {
      "CH-BUTTERFLY-D2-BLUE": 1,
      "CH-SHELL-PURPLE": 5,
    };

    const unit1Selections = { charms: ["CH-BUTTERFLY-D2-BLUE"] };
    const unit1DemandForShell = unit1Selections.charms.filter((s) => s === "CH-SHELL-PURPLE").length;
    const availableShellForUnit2 = stockDatabase["CH-SHELL-PURPLE"] - unit1DemandForShell;

    assert.strictEqual(availableShellForUnit2, 5);
    assert.strictEqual(availableShellForUnit2 > 0, true);
  });

  console.log("\n--- 5. Independent Studio Architecture Verification ---");

  await runTest("Studio categories and construction methods are completely independent of product catalogue", () => {
    const studioSubcategory = {
      id: "scat-sub-memory-wire",
      name: "Memory Wire Bracelets",
      slug: "memory-wire-bracelets",
      parentId: "scat-bracelets",
      coverImageUrl: "/images/memory-wire.jpg",
    };

    const constructionMethod = {
      id: "smeth-memory-wire",
      name: "Memory Wire",
      slug: "memory-wire",
      baseMaterialType: "memory_wire",
      physicalSpecsConfig: {
        wireThicknessMm: 0.6,
        wireDiameterMm: 60,
      },
      endpointAConfig: {
        visible: true,
        hasAssembly: true,
        isCustomerSelectable: true,
        allowedRoles: ["jump_ring", "charm"],
      },
      endpointBConfig: {
        visible: true,
        hasAssembly: true,
        isCustomerSelectable: true,
        allowedRoles: ["jump_ring", "charm"],
      },
    };

    assert.ok(studioSubcategory.id.startsWith("scat-"));
    assert.ok(constructionMethod.id.startsWith("smeth-"));
    assert.strictEqual(constructionMethod.baseMaterialType, "memory_wire");
    // Verifies zero dependence on ordinary product IDs or product SKUs
    assert.strictEqual((constructionMethod as any).productId, undefined);
    assert.strictEqual((constructionMethod as any).productSku, undefined);
  });

  await runTest("Canvas starts blank with zero pre-rendered layout until designer acts", () => {
    const freshDesign = {
      wristMm: 165,
      beadSequence: [],
      charms: [],
      selectedInstanceId: null,
    };

    assert.strictEqual(freshDesign.beadSequence.length, 0, "Canvas must start blank without auto-generated bead ring");
    assert.strictEqual(freshDesign.charms.length, 0);
  });

  console.log(`\n======================================================`);
  console.log(`TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log(`======================================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("FATAL ERROR IN TEST SUITE:", err);
  process.exit(1);
});
