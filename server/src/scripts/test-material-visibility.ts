import dotenv from "dotenv";
import path from "path";
import { Types } from "mongoose";

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
  console.log("Renu's Collections — Shared Material Visibility Controls Test Suite");
  console.log("================================================================================");

  const { connectDatabase, disconnectDatabase } = await import("../db/connection.js");
  const { StudioMaterial } = await import("../models/index.js");

  await connectDatabase();

  const createdMaterialIds: Types.ObjectId[] = [];

  try {
    const createTestMaterial = async (data: {
      codePrefix: string;
      materialType: any;
      allowedJewelleryTypes: string[];
      visibilityScopes?: any[];
    }) => {
      const uniqueSuffix = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
      const code = `TEST-${data.codePrefix}-${uniqueSuffix}`.toUpperCase();
      const mat = await StudioMaterial.create({
        name: `Test Material ${data.codePrefix} ${uniqueSuffix}`,
        code,
        materialType: data.materialType,
        imageUrl: "/assets/test.jpg",
        allowedJewelleryTypes: data.allowedJewelleryTypes,
        visibilityScopes: data.visibilityScopes,
        isActive: true,
        variants: [
          {
            sku: `${code}-STD`,
            sizeLabel: "Standard",
            sellingUnit: "piece",
            purchaseCost: 10,
            sellingRate: 25,
            stock: 50,
            isActive: true,
          },
        ],
      });
      createdMaterialIds.push(mat._id as Types.ObjectId);
      return mat;
    };

    // Helper to query materials using the same logic as listMaterials
    const queryMaterials = async (params: { scope?: string; jewelleryType?: string }) => {
      const andClauses: any[] = [{ isActive: true }];

      if (params.scope === "studio" || !params.scope) {
        andClauses.push({
          $or: [
            { visibilityScopes: "studio" },
            { visibilityScopes: { $exists: false } },
            { visibilityScopes: { $size: 0 } },
          ],
        });
      } else if (params.scope && params.scope !== "all") {
        andClauses.push({ visibilityScopes: params.scope });
      }

      if (params.jewelleryType) {
        andClauses.push({ allowedJewelleryTypes: params.jewelleryType });
      }

      const query = andClauses.length === 1 ? andClauses[0] : { $and: andClauses };
      return StudioMaterial.find(query).lean();
    };

    // -------------------------------------------------------------------------
    // Test 1: Backward compatibility for legacy materials without visibilityScopes
    // -------------------------------------------------------------------------
    await runTest("Test 1: Existing materials without visibilityScopes remain available in Studio", async () => {
      const mat = await createTestMaterial({
        codePrefix: "LEGACY",
        materialType: "bead",
        allowedJewelleryTypes: ["bracelet"],
      });

      // Force remove visibilityScopes field to simulate a legacy pre-migration document
      await StudioMaterial.collection.updateOne(
        { _id: mat._id },
        { $unset: { visibilityScopes: 1 } }
      );

      // Verify the field is indeed missing in MongoDB
      const raw = await StudioMaterial.collection.findOne({ _id: mat._id });
      assert(raw?.visibilityScopes === undefined, "visibilityScopes must be missing to simulate legacy document");

      // Query for Studio
      const studioList = await queryMaterials({ scope: "studio", jewelleryType: "bracelet" });
      const foundInStudio = studioList.some((m) => m._id.toString() === mat._id.toString());
      assert(foundInStudio, "Legacy material without visibilityScopes must be returned in Studio queries");
    });

    // -------------------------------------------------------------------------
    // Test 2: Studio-only materials are hidden from Bracelet Customization
    // -------------------------------------------------------------------------
    await runTest("Test 2: Studio-only materials are hidden from Bracelet Customization material queries", async () => {
      const mat = await createTestMaterial({
        codePrefix: "STUDIO-ONLY",
        materialType: "bead",
        allowedJewelleryTypes: ["bracelet"],
        visibilityScopes: ["studio"],
      });

      // Query for Studio: must be present
      const studioList = await queryMaterials({ scope: "studio", jewelleryType: "bracelet" });
      const foundInStudio = studioList.some((m) => m._id.toString() === mat._id.toString());
      assert(foundInStudio, "Studio-only material must appear in Studio");

      // Query for Bracelet Customization: must be hidden
      const customList = await queryMaterials({ scope: "bracelet_customization", jewelleryType: "bracelet" });
      const foundInCustom = customList.some((m) => m._id.toString() === mat._id.toString());
      assert(!foundInCustom, "Studio-only material must NOT appear in Bracelet Customization queries");
    });

    // -------------------------------------------------------------------------
    // Test 3: Materials enabled for both scopes retain both permissions
    // -------------------------------------------------------------------------
    await runTest("Test 3: Materials enabled for both scopes retain both permissions", async () => {
      const mat = await createTestMaterial({
        codePrefix: "DUAL-SCOPE",
        materialType: "charm",
        allowedJewelleryTypes: ["bracelet"],
        visibilityScopes: ["studio", "bracelet_customization"],
      });

      // Query for Studio
      const studioList = await queryMaterials({ scope: "studio", jewelleryType: "bracelet" });
      const foundInStudio = studioList.some((m) => m._id.toString() === mat._id.toString());
      assert(foundInStudio, "Dual-scope charm must appear in Studio");

      // Query for Bracelet Customization
      const customList = await queryMaterials({ scope: "bracelet_customization", jewelleryType: "bracelet" });
      const foundInCustom = customList.some((m) => m._id.toString() === mat._id.toString());
      assert(foundInCustom, "Dual-scope charm must appear in Bracelet Customization");
    });

    // -------------------------------------------------------------------------
    // Test 4: Admin can save and edit visibility settings
    // -------------------------------------------------------------------------
    await runTest("Test 4: Admin can save and edit visibility settings", async () => {
      // 1. Create with initial scope studio only
      const mat = await createTestMaterial({
        codePrefix: "EDIT-SCOPE",
        materialType: "charm",
        allowedJewelleryTypes: ["bracelet"],
        visibilityScopes: ["studio"],
      });

      assert(mat.visibilityScopes.length === 1 && mat.visibilityScopes[0] === "studio", "Initial scope must be studio");

      // 2. Admin edits material to add bracelet_customization
      await StudioMaterial.findByIdAndUpdate(
        mat._id,
        { visibilityScopes: ["studio", "bracelet_customization"] },
        { new: true }
      );

      const refreshed1 = await StudioMaterial.findById(mat._id);
      assert(
        refreshed1!.visibilityScopes.includes("studio") &&
          refreshed1!.visibilityScopes.includes("bracelet_customization"),
        "Material must have both scopes after admin update"
      );

      // 3. Admin switches to bracelet_customization ONLY
      await StudioMaterial.findByIdAndUpdate(
        mat._id,
        { visibilityScopes: ["bracelet_customization"] },
        { new: true }
      );

      const refreshed2 = await StudioMaterial.findById(mat._id);
      assert(
        !refreshed2!.visibilityScopes.includes("studio") &&
          refreshed2!.visibilityScopes.includes("bracelet_customization"),
        "Material must now only have bracelet_customization scope"
      );

      // Verify Studio now excludes it
      const studioList = await queryMaterials({ scope: "studio", jewelleryType: "bracelet" });
      assert(
        !studioList.some((m) => m._id.toString() === mat._id.toString()),
        "Material must not appear in Studio when studio scope is removed"
      );

      // Verify Bracelet Customization includes it
      const customList = await queryMaterials({ scope: "bracelet_customization", jewelleryType: "bracelet" });
      assert(
        customList.some((m) => m._id.toString() === mat._id.toString()),
        "Material must appear in Bracelet Customization when its scope is enabled"
      );
    });

    // -------------------------------------------------------------------------
    // Test 5: Existing Studio jewellery-type filtering still works
    // -------------------------------------------------------------------------
    await runTest("Test 5: Existing Studio jewellery-type filtering still works", async () => {
      const matNecklace = await createTestMaterial({
        codePrefix: "NECKLACE-ONLY",
        materialType: "bead",
        allowedJewelleryTypes: ["necklace"],
        visibilityScopes: ["studio"],
      });

      // Query Studio for bracelets: should NOT include matNecklace
      const braceletStudioList = await queryMaterials({ scope: "studio", jewelleryType: "bracelet" });
      assert(
        !braceletStudioList.some((m) => m._id.toString() === matNecklace._id.toString()),
        "Necklace-only material must not appear when jewelleryType=bracelet"
      );

      // Query Studio for necklaces: SHOULD include matNecklace
      const necklaceStudioList = await queryMaterials({ scope: "studio", jewelleryType: "necklace" });
      assert(
        necklaceStudioList.some((m) => m._id.toString() === matNecklace._id.toString()),
        "Necklace-only material must appear when jewelleryType=necklace"
      );
    });

  } finally {
    // Clean up temporary test materials
    console.log("\nCleaning up test artifacts...");
    if (createdMaterialIds.length > 0) {
      await StudioMaterial.deleteMany({ _id: { $in: createdMaterialIds } });
      console.log(`Deleted ${createdMaterialIds.length} test materials.`);
    }
    await disconnectDatabase();
    console.log("Database disconnected.");
  }

  // Summary
  console.log("\n================================================================================");
  console.log("Test Summary:");
  const total = results.length;
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  results.forEach((r, idx) => {
    console.log(`  ${idx + 1}. [${r.passed ? "PASS" : "FAIL"}] ${r.name}`);
    if (r.error) console.log(`     Error: ${r.error}`);
  });

  console.log(`\nTotal: ${total} | Passed: ${passed} | Failed: ${failed}`);
  console.log("================================================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch(async (err) => {
  console.error("Unhandled test suite execution error:", err);
  const { disconnectDatabase } = await import("../db/connection.js");
  await disconnectDatabase();
  process.exit(1);
});
