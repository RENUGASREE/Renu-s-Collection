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
  console.log("Renu's Collections — Phase 2: Link Charm Variants to Customization Tests");
  console.log("================================================================================");

  const { connectDatabase, disconnectDatabase } = await import("../db/connection.js");
  const { StudioMaterial, Category, Product } = await import("../models/index.js");
  const { getProductCustomization, validateCustomization, calculatePrice } = await import("../services/customization.service.js");

  await connectDatabase();

  const createdMaterialIds: Types.ObjectId[] = [];
  const createdCategoryIds: Types.ObjectId[] = [];
  const createdProductIds: Types.ObjectId[] = [];

  try {
    const uniqueSuffix = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;

    // Setup Test Materials
    // 1. Shared Charm (both studio and bracelet_customization)
    const sharedCharmSku = `TEST-CHM-VAR-${uniqueSuffix}`.toUpperCase();
    const sharedCharm = await StudioMaterial.create({
      name: `Test Silver Star Charm ${uniqueSuffix}`,
      code: `TEST-CHM-${uniqueSuffix}`.toUpperCase(),
      materialType: "charm",
      imageUrl: "/assets/test-star-charm.jpg",
      allowedJewelleryTypes: ["bracelet"],
      visibilityScopes: ["studio", "bracelet_customization"],
      purchaseCost: 45.0, // Private admin cost, must never be exposed
      sellingRate: 75.0,
      variants: [
        {
          sku: sharedCharmSku,
          color: "Silver",
          finish: "Polished",
          sizeLabel: "Standard",
          sellingUnit: "piece",
          purchaseCost: 45.0,
          stock: 12,
          sellingRate: 75.0,
          isActive: true,
        },
      ],
      isActive: true,
    });
    createdMaterialIds.push(sharedCharm._id as Types.ObjectId);

    // 2. Studio-Only Charm (only studio)
    const studioOnlyCharmSku = `TEST-CHM-STUDIO-${uniqueSuffix}`.toUpperCase();
    const studioOnlyCharm = await StudioMaterial.create({
      name: `Test Studio Only Charm ${uniqueSuffix}`,
      code: `TEST-CHM-SO-${uniqueSuffix}`.toUpperCase(),
      materialType: "charm",
      imageUrl: "/assets/test-studio-charm.jpg",
      allowedJewelleryTypes: ["bracelet"],
      visibilityScopes: ["studio"],
      purchaseCost: 30.0,
      sellingRate: 50.0,
      variants: [
        {
          sku: studioOnlyCharmSku,
          color: "Gold",
          sizeLabel: "Standard",
          sellingUnit: "piece",
          purchaseCost: 30.0,
          stock: 8,
          sellingRate: 50.0,
          isActive: true,
        },
      ],
      isActive: true,
    });
    createdMaterialIds.push(studioOnlyCharm._id as Types.ObjectId);

    // 3. Bead Material (studio and bracelet_customization scope, but materialType = 'bead')
    const beadSku = `TEST-BEAD-VAR-${uniqueSuffix}`.toUpperCase();
    const testBead = await StudioMaterial.create({
      name: `Test Glass Bead ${uniqueSuffix}`,
      code: `TEST-BEAD-${uniqueSuffix}`.toUpperCase(),
      materialType: "bead",
      imageUrl: "/assets/test-bead.jpg",
      allowedJewelleryTypes: ["bracelet"],
      visibilityScopes: ["studio", "bracelet_customization"],
      purchaseCost: 10.0,
      sellingRate: 20.0,
      variants: [
        {
          sku: beadSku,
          color: "Blue",
          sizeLabel: "8mm",
          sellingUnit: "piece",
          purchaseCost: 10.0,
          stock: 50,
          sellingRate: 20.0,
          isActive: true,
        },
      ],
      isActive: true,
    });
    createdMaterialIds.push(testBead._id as Types.ObjectId);

    // Setup Test Category and Product
    const testCategory = await Category.create({
      name: `Test Custom Bracelet Category ${uniqueSuffix}`,
      slug: `test-bracelet-${uniqueSuffix}`,
      productType: "other",
      customizationFields: [
        {
          key: "choose_charm",
          label: "Choose Your Charm",
          type: "select",
          required: false,
          sortOrder: 1,
          options: [
            {
              value: sharedCharmSku,
              label: "Silver Star Charm",
              priceModifier: 75.0,
              imageUrl: "/assets/test-star-charm.jpg",
              materialId: sharedCharm._id,
              variantSku: sharedCharmSku,
            },
            {
              value: "surprise_charm",
              label: "Surprise Charm (Artisan Pick)",
              priceModifier: 30.0,
              // Manual option: no materialId, no variantSku
            },
          ],
        },
      ],
      isActive: true,
    });
    createdCategoryIds.push(testCategory._id as Types.ObjectId);

    const testProduct = await Product.create({
      name: `Custom Beaded Bracelet ${uniqueSuffix}`,
      slug: `custom-beaded-bracelet-${uniqueSuffix}`,
      sku: `PROD-BRAC-${uniqueSuffix}`.toUpperCase(),
      description: "Handcrafted personalized beaded bracelet test",
      price: 299.0,
      salePrice: 249.0,
      stock: 10,
      categoryId: testCategory._id,
      isCustomizable: true,
      images: ["/assets/bracelet-main.jpg"],
      status: "active",
      isActive: true,
    });
    createdProductIds.push(testProduct._id as Types.ObjectId);

    // =========================================================================
    // Test 1: Admin charm query filters only active charms with bracelet_customization
    // =========================================================================
    await runTest("Test 1: Admin charm query returns only charm materials with bracelet_customization scope", async () => {
      const eligibleCharms = await StudioMaterial.find({
        materialType: "charm",
        visibilityScopes: "bracelet_customization",
        isActive: true,
      }).lean();

      const foundSharedCharm = eligibleCharms.find((m) => m._id.toString() === sharedCharm._id.toString());
      assert(!!foundSharedCharm, "Shared charm with bracelet_customization scope must be returned");

      const foundStudioOnlyCharm = eligibleCharms.find((m) => m._id.toString() === studioOnlyCharm._id.toString());
      assert(!foundStudioOnlyCharm, "Studio-only charm must NOT be returned in bracelet_customization query");

      const foundBead = eligibleCharms.find((m) => m._id.toString() === testBead._id.toString());
      assert(!foundBead, "Bead material must NOT be returned in charm query even if visibilityScopes has bracelet_customization");
    });

    // =========================================================================
    // Test 2: Customization option data model stores materialId and variantSku without duplicating material record
    // =========================================================================
    await runTest("Test 2: Category customization option stores materialId and variantSku references properly", async () => {
      const fetchedCat = await Category.findById(testCategory._id).lean();
      const field = fetchedCat?.customizationFields?.find((f: any) => f.key === "choose_charm");
      assert(!!field, "Customization field choose_charm must exist");

      const linkedOption = field?.options?.find((o: any) => o.variantSku === sharedCharmSku);
      assert(!!linkedOption, "Linked option must have variantSku saved");
      assert(String(linkedOption?.materialId) === sharedCharm._id.toString(), "Linked option must reference materialId");

      const manualOption = field?.options?.find((o: any) => o.value === "surprise_charm");
      assert(!!manualOption, "Manual option must exist");
      assert(!manualOption?.variantSku, "Manual option must not have variantSku");
    });

    // =========================================================================
    // Test 3: getProductCustomization enriches linked charm with live stock and preserves manual option
    // =========================================================================
    await runTest("Test 3: getProductCustomization enriches live stock, variantSku and preserves manual options", async () => {
      const customization = await getProductCustomization(testProduct._id.toString());
      assert(customization.isCustomizable === true, "Product must be customizable");

      const charmField = customization.fields.find((f: any) => f.key === "choose_charm");
      assert(!!charmField, "charm field must exist in customization config");

      // Verify linked charm option
      const linked = charmField?.options?.find((o: any) => o.variantSku === sharedCharmSku);
      assert(!!linked, "Linked charm option must be returned");
      assert(linked.inStock === true, "Linked charm with stock 12 must have inStock: true");
      assert(linked.stock === 12, "Linked charm must report authoritative live stock: 12");
      assert(linked.priceModifier === 75.0, "Linked charm price modifier must be preserved");

      // Verify manual option
      const manual = charmField?.options?.find((o: any) => o.value === "surprise_charm");
      assert(!!manual, "Manual surprise charm option must be returned");
      assert(manual.inStock === true, "Manual option must have inStock: true");
    });

    // =========================================================================
    // Test 4: Private purchaseCost is never exposed in customer-facing getProductCustomization
    // =========================================================================
    await runTest("Test 4: Private purchaseCost is stripped and never exposed to customers", async () => {
      const customization = await getProductCustomization(testProduct._id.toString());
      const rawJson = JSON.stringify(customization);
      assert(!rawJson.includes("purchaseCost"), "purchaseCost must never appear anywhere in customer customization data");
      assert(!rawJson.includes('"45"'), "Purchase cost value 45 must not appear in customer response");
    });

    // =========================================================================
    // Test 5: Out-of-stock and inactive charm variants are filtered out from getProductCustomization
    // =========================================================================
    await runTest("Test 5: Out-of-stock and inactive charm variants are excluded from customer options", async () => {
      // Set stock to 0
      await StudioMaterial.updateOne(
        { _id: sharedCharm._id, "variants.sku": sharedCharmSku },
        { $set: { "variants.$.stock": 0 } }
      );

      let customization = await getProductCustomization(testProduct._id.toString());
      let charmField = customization.fields.find((f: any) => f.key === "choose_charm");
      let linked = charmField?.options?.find((o: any) => o.variantSku === sharedCharmSku);
      assert(!linked, "Out of stock variant (stock 0) must NOT appear in getProductCustomization options");

      // Restore stock, but set variant isActive to false
      await StudioMaterial.updateOne(
        { _id: sharedCharm._id, "variants.sku": sharedCharmSku },
        { $set: { "variants.$.stock": 10, "variants.$.isActive": false } }
      );

      customization = await getProductCustomization(testProduct._id.toString());
      charmField = customization.fields.find((f: any) => f.key === "choose_charm");
      linked = charmField?.options?.find((o: any) => o.variantSku === sharedCharmSku);
      assert(!linked, "Inactive variant (isActive false) must NOT appear in getProductCustomization options");

      // Restore active and in-stock
      await StudioMaterial.updateOne(
        { _id: sharedCharm._id, "variants.sku": sharedCharmSku },
        { $set: { "variants.$.stock": 10, "variants.$.isActive": true } }
      );
    });

    // =========================================================================
    // Test 6: validateCustomization enforces live stock checks on linked variants
    // =========================================================================
    await runTest("Test 6: validateCustomization accepts in-stock variant and rejects out-of-stock variant", async () => {
      // 1. Valid selection with in-stock linked charm
      const validRes = await validateCustomization(testProduct._id.toString(), {
        choose_charm: sharedCharmSku,
      });
      assert(validRes.valid === true, `In-stock variant should be valid. Errors: ${validRes.errors.join(", ")}`);

      // 2. Valid selection with manual option
      const manualRes = await validateCustomization(testProduct._id.toString(), {
        choose_charm: "surprise_charm",
      });
      assert(manualRes.valid === true, `Manual option should be valid. Errors: ${manualRes.errors.join(", ")}`);

      // 3. Set stock to 0 and validate
      await StudioMaterial.updateOne(
        { _id: sharedCharm._id, "variants.sku": sharedCharmSku },
        { $set: { "variants.$.stock": 0 } }
      );

      const oosRes = await validateCustomization(testProduct._id.toString(), {
        choose_charm: sharedCharmSku,
      });
      assert(oosRes.valid === false, "Out-of-stock variant must fail validation");
      assert(
        oosRes.errors.some((e) => e.toLowerCase().includes("out of stock")),
        `Error message must mention out of stock. Got: ${oosRes.errors.join(", ")}`
      );

      // Restore stock
      await StudioMaterial.updateOne(
        { _id: sharedCharm._id, "variants.sku": sharedCharmSku },
        { $set: { "variants.$.stock": 10 } }
      );
    });

    // =========================================================================
    // Test 7: calculatePrice works accurately with linked variant priceModifier
    // =========================================================================
    await runTest("Test 7: calculatePrice calculates priceModifier accurately without double counting", async () => {
      const priceCalc = await calculatePrice(testProduct._id.toString(), {
        choose_charm: sharedCharmSku,
      });

      // Base price is 249 (salePrice), charm modifier is 75
      assert(priceCalc.basePrice === 249, `Base price must be 249, got ${priceCalc.basePrice}`);
      assert(priceCalc.priceModifier === 75, `Modifier must be 75, got ${priceCalc.priceModifier}`);
      assert(priceCalc.totalPrice === 324, `Total price must be 324 (249 + 75), got ${priceCalc.totalPrice}`);
    });

  } finally {
    // =========================================================================
    // Cleanup: Remove all test records
    // =========================================================================
    console.log("Cleaning up test records...");
    if (createdProductIds.length > 0) {
      await Product.deleteMany({ _id: { $in: createdProductIds } });
    }
    if (createdCategoryIds.length > 0) {
      await Category.deleteMany({ _id: { $in: createdCategoryIds } });
    }
    if (createdMaterialIds.length > 0) {
      await StudioMaterial.deleteMany({ _id: { $in: createdMaterialIds } });
    }
    console.log("Test records cleaned up successfully.");

    await disconnectDatabase();
  }

  console.log("================================================================================");
  console.log("Test Summary:");
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  console.log(`Passed: ${passed}/${results.length}`);
  if (failed > 0) {
    console.error(`Failed: ${failed}/${results.length}`);
    process.exit(1);
  } else {
    console.log("All Phase 2 charm customization tests passed successfully!");
  }
}

main().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
