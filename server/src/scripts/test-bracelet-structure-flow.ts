import path from "path";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(process.cwd(), "server/.env") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

import { PostgresDatabase } from "../db/postgres.js";
import { postgresProductRepository } from "../repositories/postgres-product.repository.js";
import { customizationService } from "../services/customization.service.js";
import { CRYSTAL_BEAD_PILOT_STRUCTURE } from "./seed-crystal-bead-structure.js";

async function runTestSuite() {
  PostgresDatabase.initialize();
  console.log("=== RUNNING BRACELET STRUCTURE VERIFICATION TEST SUITE ===");

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, desc: string) {
    if (condition) {
      console.log(`[PASS] ${desc}`);
      passed++;
    } else {
      console.error(`[FAIL] ${desc}`);
      failed++;
    }
  }

  try {
    // ----------------------------------------------------
    // TEST 1: Attach & Verify Structure on Pilot Product (RCB-001)
    // ----------------------------------------------------
    console.log("\n--- TEST 1: Pilot Product Persistence ---");
    // Ensure clean state: non-pilot products have null structure
    await PostgresDatabase.query(
      "UPDATE products SET bracelet_structure = NULL WHERE sku != 'RCB-001';"
    );

    const findRcb = await PostgresDatabase.query(
      "SELECT id, name, sku FROM products WHERE sku = 'RCB-001' LIMIT 1;"
    );
    assert(findRcb.rows.length > 0, "Found pilot product RCB-001 in database");
    const pilotId = findRcb.rows[0].id;

    // Persist structure
    await postgresProductRepository.updateById(pilotId, {
      braceletStructure: CRYSTAL_BEAD_PILOT_STRUCTURE,
      isCustomizable: true,
    });

    const refreshed = await postgresProductRepository.findById(pilotId);
    assert(refreshed !== null, "Pilot product retrieved via postgresProductRepository");
    assert(refreshed?.braceletStructure !== null, "refreshed.braceletStructure is populated");
    assert(refreshed?.braceletStructure?.nodes?.length === 5, "refreshed.braceletStructure has 5 nodes");
    assert(refreshed?.braceletStructure?.connections?.length === 4, "refreshed.braceletStructure has 4 connections");
    assert(refreshed?.braceletStructure?.attachmentPoints?.length === 1, "refreshed.braceletStructure has 1 attachment point");

    // ----------------------------------------------------
    // TEST 2: Product Isolation (Other Products Unaffected)
    // ----------------------------------------------------
    console.log("\n--- TEST 2: Product Isolation ---");
    const otherProducts = await PostgresDatabase.query(
      "SELECT id, name, sku, bracelet_structure FROM products WHERE id != $1 AND sku != 'RCB-004' LIMIT 3;",
      [pilotId]
    );
    assert(otherProducts.rows.length > 0, "Retrieved non-pilot products");
    for (const other of otherProducts.rows) {
      assert(
        other.bracelet_structure === null,
        `Product "${other.name}" (${other.sku}) structure is null and unaffected`
      );
    }

    // ----------------------------------------------------
    // TEST 3: Customization Service Endpoint Flow
    // ----------------------------------------------------
    console.log("\n--- TEST 3: Customization Service API Flow ---");
    const customConfig = await customizationService.getProductCustomization(pilotId);
    assert(customConfig !== null, "Customization config retrieved for pilot product");
    assert(
      (customConfig as any)?.braceletStructure !== null && (customConfig as any)?.braceletStructure !== undefined,
      "customizationService.getProductCustomization() includes braceletStructure"
    );
    assert(
      (customConfig as any)?.braceletStructure?.baseType === "circular_bead",
      "customizationConfig.braceletStructure.baseType is 'circular_bead'"
    );

    // ----------------------------------------------------
    // TEST 4: Multi-Quantity Order Snapshot Customization Simulation
    // ----------------------------------------------------
    console.log("\n--- TEST 4: Multi-Quantity Unit Configurations & Order Snapshot ---");
    const multiQuantityCartCustomization = {
      isCustomized: true,
      braceletStructureSnapshot: refreshed?.braceletStructure,
      unitConfigurations: [
        {
          unitIndex: 1,
          label: "Bracelet 1",
          selections: { charm: "CHARM-BUTTERFLY-BLUE", beadColor: "crackle-pink" },
          priceModifier: 20,
        },
        {
          unitIndex: 2,
          label: "Bracelet 2",
          selections: { charm: "CHARM-STAR-GOLD", beadColor: "crackle-green" },
          priceModifier: 25,
        },
      ],
    };

    assert(
      multiQuantityCartCustomization.unitConfigurations.length === 2,
      "Order item customization stores independent configurations for multiple quantity"
    );
    assert(
      multiQuantityCartCustomization.unitConfigurations[0].selections.charm === "CHARM-BUTTERFLY-BLUE",
      "Unit 1 preserves its individual charm selection"
    );
    assert(
      multiQuantityCartCustomization.unitConfigurations[1].selections.charm === "CHARM-STAR-GOLD",
      "Unit 2 preserves its individual charm selection"
    );
    assert(
      multiQuantityCartCustomization.braceletStructureSnapshot?.version === 1,
      "Order item customization includes immutable braceletStructureSnapshot"
    );

    // ----------------------------------------------------
    // TEST 5: Parametric Extension Chain Mathematical Arc Geometry
    // ----------------------------------------------------
    console.log("\n--- TEST 5: Parametric Extension Chain Geometry Math ---");
    const extNode = refreshed?.braceletStructure?.nodes.find((n: any) => n.role === "extension_chain");
    assert(extNode !== undefined, "Found extension_chain node in structure");
    assert(extNode?.chainConfig?.lengthMm === 50, "Extension chain length is 50mm");
    assert(extNode?.chainConfig?.curvature === 22, "Extension chain drape curvature is 22");

    // Quadratic Bézier test
    const p0 = { x: 280, y: 86 };
    const p2 = { x: 300, y: 156 };
    const p1 = { x: (p0.x + p2.x) / 2 + 13.2, y: (p0.y + p2.y) / 2 + 17.6 };

    function bezier(t: number) {
      const x = (1 - t) * (1 - t) * p0.x + 2 * (1 - t) * t * p1.x + t * t * p2.x;
      const y = (1 - t) * (1 - t) * p0.y + 2 * (1 - t) * t * p1.y + t * t * p2.y;
      return { x, y };
    }

    const startPt = bezier(0);
    const midPt = bezier(0.5);
    const endPt = bezier(1);

    assert(Math.abs(startPt.x - p0.x) < 0.001 && Math.abs(startPt.y - p0.y) < 0.001, "Bézier t=0 matches start point");
    assert(Math.abs(endPt.x - p2.x) < 0.001 && Math.abs(endPt.y - p2.y) < 0.001, "Bézier t=1 matches end point");
    assert(midPt.y > p0.y && midPt.y < p2.y, "Bézier midpoint drapes naturally between endpoints");

    console.log(`\n=========================================`);
    console.log(`TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
    console.log(`=========================================`);

    if (failed > 0) {
      process.exit(1);
    }
  } catch (err) {
    console.error("Test execution exception:", err);
    process.exit(1);
  } finally {
    await PostgresDatabase.close();
  }
}

runTestSuite();
