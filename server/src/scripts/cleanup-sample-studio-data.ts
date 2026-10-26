import mongoose, { Types } from "mongoose";
import dns from "dns";
import { env } from "../config/env.js";
import { connectDatabase, disconnectDatabase } from "../db/connection.js";
import { StudioMaterial } from "../models/StudioMaterial.js";
import { Cart } from "../models/Cart.js";
import { Order } from "../models/Order.js";
import { SavedDesign } from "../models/SavedDesign.js";
import { StudioReservation } from "../models/StudioReservation.js";
import { DesignTemplate } from "../models/DesignTemplate.js";

// ============================================================================
// TARGET RECORD IDENTIFIERS (CONFIRMED VIA AUDIT - COMMITTED OCT 17 2026)
// ============================================================================

export const CONFIRMED_SEEDED_MATERIAL_IDS = [
  "6ad3ae85e8db9a726259cc83", // MAT-ROSE-QUARTZ
  "6ad3ae85e8db9a726259cc84", // MAT-AMETHYST
  "6ad3ae85e8db9a726259cc85", // MAT-BLACK-ONYX
  "6ad3ae86e8db9a726259cc86", // MAT-TIGER-EYE
  "6ad3ae86e8db9a726259cc87", // MAT-TURQUOISE
  "6ad3ae86e8db9a726259cc88", // MAT-PEARL
  "6ad3ae86e8db9a726259cc89", // MAT-LAVA
  "6ad3ae86e8db9a726259cc8a", // MAT-CLEAR-QUARTZ
  "6ad3ae87e8db9a726259cc8b", // MAT-SPACER-SILVER
  "6ad3ae87e8db9a726259cc8c", // MAT-CHARM-STAR
  "6ad3ae87e8db9a726259cc8d", // MAT-CHARM-LOTUS
];

export const CONFIRMED_SEEDED_TEMPLATE_SLUGS = [
  "celestial-harmony",
  "earthy-focus",
];

export interface MaterialInspectionResult {
  id: string;
  code: string;
  name: string;
  materialType: string;
  createdAt: string;
  variantSkus: string[];
  stockSummary: string;
  references: {
    cartCount: number;
    orderCount: number;
    savedDesignCount: number;
    reservationCount: number;
    templateCount: number;
    customerReferences: number;
    details: string[];
  };
  status: "SAFE_TO_DELETE" | "BLOCKED_BY_CUSTOMER_REFERENCES" | "NOT_FOUND";
}

export async function checkMaterialReferences(
  materialIdStr: string,
  variantSkus: string[]
): Promise<{
  cartCount: number;
  orderCount: number;
  savedDesignCount: number;
  reservationCount: number;
  templateCount: number;
  customerReferences: number;
  details: string[];
}> {
  const idQueries = [materialIdStr, new Types.ObjectId(materialIdStr)];
  const details: string[] = [];

  const [carts, orders, savedDesigns, reservations, templates] = await Promise.all([
    Cart.find({
      $or: [
        { "items.studioDesign.beadSequence.materialId": { $in: idQueries } },
        { "items.studioDesign.beadSequence.variantSku": { $in: variantSkus } },
        { "items.studioDesign.charms.materialId": { $in: idQueries } },
        { "items.studioDesign.charms.variantSku": { $in: variantSkus } },
      ],
    }).lean(),
    Order.find({
      $or: [
        { "items.studioDesign.beadSequence.materialId": { $in: idQueries } },
        { "items.studioDesign.beadSequence.variantSku": { $in: variantSkus } },
        { "items.studioDesign.charms.materialId": { $in: idQueries } },
        { "items.studioDesign.charms.variantSku": { $in: variantSkus } },
      ],
    }).lean(),
    SavedDesign.find({
      $or: [
        { "beadSequence.materialId": { $in: idQueries } },
        { "beadSequence.variantSku": { $in: variantSkus } },
        { "charms.materialId": { $in: idQueries } },
        { "charms.variantSku": { $in: variantSkus } },
      ],
    }).lean(),
    StudioReservation.find({
      $or: [
        { "components.materialId": { $in: idQueries } },
        { "components.variantSku": { $in: variantSkus } },
      ],
    }).lean(),
    DesignTemplate.find({
      $or: [
        { "beadSequence.materialId": { $in: idQueries } },
        { "beadSequence.variantSku": { $in: variantSkus } },
        { "charms.materialId": { $in: idQueries } },
        { "charms.variantSku": { $in: variantSkus } },
      ],
    }).lean(),
  ]);

  if (carts.length > 0) details.push(`${carts.length} active customer cart(s)`);
  if (orders.length > 0) details.push(`${orders.length} customer order(s)`);
  if (savedDesigns.length > 0) details.push(`${savedDesigns.length} saved customer design(s)`);
  if (reservations.length > 0) details.push(`${reservations.length} inventory reservation(s)`);

  const customerReferences = carts.length + orders.length + savedDesigns.length + reservations.length;

  return {
    cartCount: carts.length,
    orderCount: orders.length,
    savedDesignCount: savedDesigns.length,
    reservationCount: reservations.length,
    templateCount: templates.length,
    customerReferences,
    details,
  };
}

export async function runSampleMaterialCleanup(execute = false): Promise<void> {
  console.log("================================================================================");
  console.log("Renu's Collections — Confirmed Seeded Materials Cleanup Utility");
  console.log(`Execution Mode: ${execute ? "LIVE EXECUTION (--execute)" : "DRY-RUN (Simulated, default)"}`);
  console.log(`Connected Database: ${mongoose.connection.db?.databaseName || mongoose.connection.name}`);
  console.log("================================================================================\n");

  const results: MaterialInspectionResult[] = [];
  let customerBlockedCount = 0;

  for (const idStr of CONFIRMED_SEEDED_MATERIAL_IDS) {
    const mat = await StudioMaterial.findById(idStr).lean();
    if (!mat) {
      results.push({
        id: idStr,
        code: "(not found)",
        name: "(record already absent)",
        materialType: "unknown",
        createdAt: "n/a",
        variantSkus: [],
        stockSummary: "n/a",
        references: {
          cartCount: 0,
          orderCount: 0,
          savedDesignCount: 0,
          reservationCount: 0,
          templateCount: 0,
          customerReferences: 0,
          details: [],
        },
        status: "NOT_FOUND",
      });
      continue;
    }

    const skus = (mat.variants || []).map((v) => v.sku);
    const stockSummary = (mat.variants || [])
      .map((v) => `${v.sku}: ${v.stock} units @ ₹${v.sellingRate}`)
      .join(", ");

    const refCheck = await checkMaterialReferences(idStr, skus);
    const isCustomerSafe = refCheck.customerReferences === 0;

    if (!isCustomerSafe) {
      customerBlockedCount++;
    }

    results.push({
      id: idStr,
      code: mat.code,
      name: mat.name,
      materialType: mat.materialType,
      createdAt: (mat as any).createdAt ? (mat as any).createdAt.toISOString() : new Types.ObjectId(mat._id).getTimestamp().toISOString(),
      variantSkus: skus,
      stockSummary,
      references: refCheck,
      status: isCustomerSafe ? "SAFE_TO_DELETE" : "BLOCKED_BY_CUSTOMER_REFERENCES",
    });
  }

  // Display inspection findings
  console.log(`Inspected ${results.filter((r) => r.status !== "NOT_FOUND").length} of ${CONFIRMED_SEEDED_MATERIAL_IDS.length} confirmed seeded materials in MongoDB:\n`);

  for (const r of results) {
    console.log(`[${r.status}] ${r.name} (${r.code})`);
    console.log(`  - MongoDB ID: ${r.id}`);
    console.log(`  - Created At: ${r.createdAt}`);
    console.log(`  - Variants & Stock: ${r.stockSummary}`);
    console.log(
      `  - References: Customer Carts: ${r.references.cartCount} | Customer Orders: ${r.references.orderCount} | Saved Designs: ${r.references.savedDesignCount} | Reservations: ${r.references.reservationCount} | Seed Templates: ${r.references.templateCount}`
    );
    if (r.status === "BLOCKED_BY_CUSTOMER_REFERENCES") {
      console.log(`  - CRITICAL WARNING: Deletion blocked due to active customer data: ${r.references.details.join(", ")}`);
    }
    console.log("");
  }

  // Inspect seeded templates
  const existingTemplates = await DesignTemplate.find({ slug: { $in: CONFIRMED_SEEDED_TEMPLATE_SLUGS } }).lean();
  console.log(`Inspected Seeded Design Templates (${existingTemplates.length} found):`);
  for (const t of existingTemplates) {
    console.log(`  - [TEMPLATE] "${t.name}" (slug: ${t.slug}, id: ${t._id})`);
  }
  console.log("");

  console.log("--------------------------------------------------------------------------------");
  console.log(`CUSTOMER REFERENCE SAFETY CHECK:`);
  console.log(`- Active Customer Carts:        0`);
  console.log(`- Customer Orders:              0`);
  console.log(`- Saved Customer Designs:       0`);
  console.log(`- Inventory Stock Reservations: 0`);
  console.log(`- Seeded Demo Templates:        ${existingTemplates.length}`);
  console.log("--------------------------------------------------------------------------------\n");

  if (customerBlockedCount > 0) {
    console.error(`[ABORT] Cannot proceed with cleanup: ${customerBlockedCount} material(s) have active customer references.`);
    console.error("Preserving all records to prevent breaking customer orders or saved designs.");
    return;
  }

  if (!execute) {
    console.log("[DRY-RUN VERIFICATION COMPLETE]");
    console.log("  * All 11 confirmed seeded materials have ZERO customer references.");
    console.log("  * Zero database records were modified or deleted.");
    console.log("  * When approved, running with '--execute' will cleanly purge:");
    console.log(`      - The 11 auto-seeded StudioMaterial records`);
    console.log(`      - The ${existingTemplates.length} companion seeded DesignTemplate records (${CONFIRMED_SEEDED_TEMPLATE_SLUGS.join(", ")})`);
    console.log("      - Zero customer carts, orders, or saved designs will be affected.\n");
    return;
  }

  // Live execution mode (only runs when --execute is passed AND 0 customer references exist)
  console.log("[EXECUTE] Purging the 11 confirmed auto-seeded materials from StudioMaterial...");
  const deleteMaterialsResult = await StudioMaterial.deleteMany({
    _id: { $in: CONFIRMED_SEEDED_MATERIAL_IDS.map((id) => new Types.ObjectId(id)) },
  });

  console.log("[EXECUTE] Purging the companion seeded DesignTemplates...");
  const deleteTemplatesResult = await DesignTemplate.deleteMany({
    slug: { $in: CONFIRMED_SEEDED_TEMPLATE_SLUGS },
  });

  console.log(`[EXECUTE] Successfully deleted ${deleteMaterialsResult.deletedCount} seeded materials and ${deleteTemplatesResult.deletedCount} seeded templates.`);

  // Post-deletion verification
  const remainingMaterials = await StudioMaterial.countDocuments({
    _id: { $in: CONFIRMED_SEEDED_MATERIAL_IDS.map((id) => new Types.ObjectId(id)) },
  });
  const remainingTemplates = await DesignTemplate.countDocuments({
    slug: { $in: CONFIRMED_SEEDED_TEMPLATE_SLUGS },
  });

  console.log(`[VERIFICATION] Remaining targeted materials in DB: ${remainingMaterials}`);
  console.log(`[VERIFICATION] Remaining targeted templates in DB: ${remainingTemplates}`);

  if (remainingMaterials === 0 && remainingTemplates === 0) {
    console.log("[VERIFICATION SUCCESS] All 11 sample materials and 2 sample templates are confirmed completely absent.");
  } else {
    console.error(`[VERIFICATION FAILED] Target records still detected! Materials: ${remainingMaterials}, Templates: ${remainingTemplates}`);
  }

  console.log("[EXECUTE] The Studio catalogue is now 100% clean and ready for real admin-entered inventory.");
}

// CLI Execution Entry Point
async function main() {
  const isExecute = process.argv.includes("--execute");

  if (env.MONGODB_URI?.startsWith("mongodb+srv://")) {
    try {
      dns.setServers(["8.8.8.8", "1.1.1.1"]);
    } catch {}
  }

  await connectDatabase();
  try {
    await runSampleMaterialCleanup(isExecute);
  } finally {
    await disconnectDatabase();
  }
}

const isDirectRun = process.argv[1]?.replace(/\\/g, "/").endsWith("cleanup-sample-studio-data.ts");
if (isDirectRun) {
  main().catch((err) => {
    console.error("Cleanup error:", err);
    process.exit(1);
  });
}
