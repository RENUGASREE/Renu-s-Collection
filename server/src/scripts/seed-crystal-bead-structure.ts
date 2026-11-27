import path from "path";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(process.cwd(), "server/.env") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

import { PostgresDatabase } from "../db/postgres.js";
import { IBraceletStructure } from "../types/database.types.js";

export const CRYSTAL_BEAD_PILOT_STRUCTURE: IBraceletStructure = {
  version: 1,
  updatedAt: new Date().toISOString(),
  canvas: { width: 480, height: 480, viewBox: "0 0 480 480" },
  baseType: "circular_bead",
  baseConfig: { cordDiameterMm: 160, openGapAngleDeg: 28, rotationDeg: 0 },
  nodes: [
    {
      id: "node-bead-ring",
      role: "bracelet_base",
      displayName: "Crystal Bead Core Ring",
      x: 240,
      y: 240,
      width: 320,
      height: 320,
      rotationDeg: 0,
      zIndex: 1,
      visible: true,
    },
    {
      id: "node-jumpring-left",
      role: "jump_ring",
      displayName: "Left Endpoint Jump Ring",
      x: 200,
      y: 84,
      width: 14,
      height: 14,
      rotationDeg: 0,
      zIndex: 2,
      visible: true,
    },
    {
      id: "node-clasp",
      role: "lobster_clasp",
      displayName: "Gold Lobster Clasp",
      x: 218,
      y: 80,
      width: 24,
      height: 36,
      rotationDeg: 80,
      zIndex: 3,
      visible: true,
    },
    {
      id: "node-jumpring-right",
      role: "jump_ring",
      displayName: "Right Endpoint Jump Ring",
      x: 275,
      y: 84,
      width: 14,
      height: 14,
      rotationDeg: 0,
      zIndex: 2,
      visible: true,
    },
    {
      id: "node-ext-chain",
      role: "extension_chain",
      displayName: "Gold Extension Chain (50mm)",
      x: 280,
      y: 86,
      width: 30,
      height: 80,
      rotationDeg: 15,
      zIndex: 3,
      visible: true,
      chainConfig: {
        lengthMm: 50,
        curvature: 22,
        linkSpacingPx: 7,
        linkWidthPx: 5,
        linkHeightPx: 9,
        color: "#C0A888",
      },
    },
  ],
  connections: [
    { id: "c1", fromNodeId: "node-bead-ring", toNodeId: "node-jumpring-left", connectionType: "endpoint" },
    { id: "c2", fromNodeId: "node-jumpring-left", toNodeId: "node-clasp", connectionType: "jump_ring" },
    { id: "c3", fromNodeId: "node-bead-ring", toNodeId: "node-jumpring-right", connectionType: "endpoint" },
    { id: "c4", fromNodeId: "node-jumpring-right", toNodeId: "node-ext-chain", connectionType: "chain_link" },
  ],
  attachmentPoints: [
    {
      id: "slot-extension-end-charm",
      label: "Extension End Charm",
      parentNodeId: "node-ext-chain",
      x: 288,
      y: 165,
      hangDirectionDeg: 90,
      isCustomerSelectable: true,
      linkedFieldKey: "charm",
      defaultVariantSku: "CHARM-BUTTERFLY-BLUE",
    },
  ],
};

async function seedPilotStructure() {
  PostgresDatabase.initialize();
  try {
    console.log("Connecting to PostgreSQL to seed Crystal Bead Bracelet pilot structure...");

    // 1. Find the Crystal Bead Bracelet
    const findRes = await PostgresDatabase.query(
      `SELECT id, name, sku, is_customizable, bracelet_structure FROM products WHERE name ILIKE '%Crystal%' OR sku ILIKE '%CRYSTAL%' OR name ILIKE '%Bead%' LIMIT 5;`
    );

    console.log(`Found ${findRes.rows.length} matching candidate product(s):`);
    for (const r of findRes.rows) {
      console.log(` - ID: ${r.id}, Name: "${r.name}", SKU: "${r.sku}", Customizable: ${r.is_customizable}`);
    }

    if (findRes.rows.length === 0) {
      console.log("No crystal bead product found. Checking all customizable products...");
      const allCustomRes = await PostgresDatabase.query(
        `SELECT id, name, sku, is_customizable FROM products WHERE is_customizable = true LIMIT 5;`
      );
      for (const r of allCustomRes.rows) {
        console.log(` - Custom product: ID: ${r.id}, Name: "${r.name}", SKU: "${r.sku}"`);
      }
    }

    // Target the first crystal or customizable bracelet
    const target = findRes.rows.find((r: any) => r.name.toLowerCase().includes("crystal")) || findRes.rows[0];

    if (!target) {
      console.error("No suitable target product found to attach pilot structure.");
      return;
    }

    console.log(`Attaching pilot structure to: ${target.name} (${target.id})`);

    const updateRes = await PostgresDatabase.query(
      `UPDATE products 
       SET bracelet_structure = $1::jsonb, is_customizable = true, updated_at = NOW() 
       WHERE id = $2 
       RETURNING id, name, sku, bracelet_structure;`,
      [JSON.stringify(CRYSTAL_BEAD_PILOT_STRUCTURE), target.id]
    );

    console.log("Successfully updated product!");
    const updated = updateRes.rows[0];
    console.log(`Product: ${updated.name}`);
    console.log(`Structure Nodes: ${updated.bracelet_structure?.nodes?.length}`);
    console.log(`Connections: ${updated.bracelet_structure?.connections?.length}`);
    console.log(`Attachment Points: ${updated.bracelet_structure?.attachmentPoints?.length}`);

    // Verify other products remain unaffected
    const otherRes = await PostgresDatabase.query(
      `SELECT count(*) as count FROM products WHERE id != $1 AND bracelet_structure IS NOT NULL;`,
      [target.id]
    );
    console.log(`Other products with bracelet_structure: ${otherRes.rows[0].count} (isolated and unaffected)`);
  } catch (err) {
    console.error("Seed error:", err);
  } finally {
    await PostgresDatabase.close();
  }
}

if (process.argv[1]?.includes('seed-crystal-bead-structure')) {
  seedPilotStructure().catch((e) => {
    console.error("Fatal error in seed:", e);
    process.exit(1);
  });
}
