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
  console.log("Renu's Collections — Category-Specific Customization Resolution Test Suite");
  console.log("================================================================================");

  const { connectDatabase, disconnectDatabase } = await import("../db/connection.js");
  const { StudioMaterial, Category, CustomizationConfig, Product } = await import("../models/index.js");
  const {
    getProductCustomization,
    calculatePrice,
    validateCustomization,
    generatePreview,
  } = await import("../services/customization.service.js");

  await connectDatabase();

  const createdMaterialIds: Types.ObjectId[] = [];
  const createdCategoryIds: Types.ObjectId[] = [];
  const createdProductIds: Types.ObjectId[] = [];
  const createdConfigIds: Types.ObjectId[] = [];

  try {
    // -------------------------------------------------------------------------
    // Setup Live Real Bracelet Product Test Check
    // Product: "Light Green Crackle Bead Bracelet 💚" (6ae45687cf110d86232fc1d5)
    // Category: "Bracelet" (6ae19b088a7a052d741b9127)
    // -------------------------------------------------------------------------
    const realProductId = "6ae45687cf110d86232fc1d5";

    await runTest("Test 1: Real bracelet product customization resolves ONLY 'Choose Your Charm' with linked variants", async () => {
      const customization = await getProductCustomization(realProductId);
      assert(customization.isCustomizable === true, "Product must be customizable");

      // Verify fields present
      const fieldKeys = customization.fields.map((f: any) => f.key);
      console.log("   Resolved field keys for real bracelet:", fieldKeys);

      // Requirement: Regular bracelet product page must display ONLY "Choose Your Charm"
      assert(
        customization.fields.length === 1,
        `Expected exactly 1 customization field ('Choose Your Charm'), got ${customization.fields.length}: ${fieldKeys.join(", ")}`
      );

      // Verify Bead Colour is NOT present
      const beadField = customization.fields.find(
        (f: any) => f.key.toLowerCase().includes("bead") || f.label.toLowerCase().includes("bead")
      );
      assert(!beadField, "Bead Colour must NOT appear on regular bracelet product page");

      // Verify Bracelet Size is NOT present
      const sizeField = customization.fields.find(
        (f: any) => f.key.toLowerCase().includes("size") || f.label.toLowerCase().includes("size")
      );
      assert(!sizeField, "Bracelet Size must NOT appear on regular bracelet product page");

      // Verify Charm field is present with linked variants
      const charmFields = customization.fields.filter(
        (f: any) =>
          f.key.toLowerCase().includes("charm") || f.label.toLowerCase().includes("charm")
      );
      assert(charmFields.length === 1, `Expected exactly 1 charm field, got ${charmFields.length}`);

      const charmField = charmFields[0];
      const charmOptions = charmField.options || [];
      console.log(
        "   Resolved charm options:",
        charmOptions.map((o: any) => ({ label: o.label, value: o.value, sku: o.variantSku }))
      );

      // Verify linked Shell Charms (Purple) is present
      const shellCharm = charmOptions.find((o: any) => o.variantSku === "CH-SHELL-PURPLE");
      assert(!!shellCharm, "Linked Shell Charms (Purple) must be present in charm options");
      assert(shellCharm.inStock === true, "Shell Charms must be marked inStock: true");
      assert(shellCharm.stock === 2, "Shell Charms must report authoritative stock: 2");

      // Verify old Heart Charm and Butterfly Charm are GONE
      const hasHeart = charmOptions.some((o: any) => o.value === "heart" || o.label === "Heart Charm");
      assert(!hasHeart, "Old Heart Charm must NOT appear in resolved options");

      const hasButterfly = charmOptions.some((o: any) => o.value === "butterfly" || o.label === "Butterfly Charm");
      assert(!hasButterfly, "Old Butterfly Charm must NOT appear in resolved options");
    });

    // -------------------------------------------------------------------------
    // Test 2: Price calculation and validation use the same resolved fields
    // -------------------------------------------------------------------------
    await runTest("Test 2: Price calculation uses resolved category fields (Linked Charm)", async () => {
      // Shell Charms (Purple) has priceModifier: 12 in category
      const priceRes = await calculatePrice(realProductId, {
        Charm: ["CH-SHELL-PURPLE"],
      });

      console.log("   Price calculation result:", priceRes);
      assert(priceRes.priceModifier === 12, `Expected total priceModifier 12, got ${priceRes.priceModifier}`);
      assert(priceRes.totalPrice === priceRes.basePrice + 12, "Total price must equal base price + modifier");
    });

    await runTest("Test 3: Validation uses resolved category fields (validates linked charm live stock)", async () => {
      // Valid selection
      const validRes = await validateCustomization(realProductId, {
        Charm: ["CH-SHELL-PURPLE"],
      });
      assert(validRes.valid === true, `Expected validation to pass. Errors: ${validRes.errors.join(", ")}`);

      // Invalid selection (old heart charm is no longer a valid option)
      const invalidHeartRes = await validateCustomization(realProductId, {
        Charm: ["heart"],
      });
      assert(invalidHeartRes.valid === false, "Old Heart Charm must be rejected by validator");
      assert(
        invalidHeartRes.errors.some((e: string) => e.toLowerCase().includes("invalid option")),
        "Error message must indicate invalid option for charm"
      );
    });

    // -------------------------------------------------------------------------
    // Test 4: Out-of-stock shared charm variants remain unavailable
    // -------------------------------------------------------------------------
    await runTest("Test 4: Out-of-stock linked charm variant is excluded from product options and rejected in validation", async () => {
      // Temporarily set stock of CH-SHELL-PURPLE to 0
      await StudioMaterial.updateOne(
        { "variants.sku": "CH-SHELL-PURPLE" },
        { $set: { "variants.$.stock": 0 } }
      );

      try {
        const customOos = await getProductCustomization(realProductId);
        const charmField = customOos.fields.find(
          (f: any) => f.key.toLowerCase().includes("charm") || f.label.toLowerCase().includes("charm")
        );
        const shellCharmOos = charmField?.options?.find((o: any) => o.variantSku === "CH-SHELL-PURPLE");
        assert(!shellCharmOos, "Out of stock charm variant must be filtered out from getProductCustomization");

        const valOos = await validateCustomization(realProductId, {
          Charm: ["CH-SHELL-PURPLE"],
        });
        assert(valOos.valid === false, "Out of stock charm variant must fail validation");
        assert(
          valOos.errors.some((e: string) => e.toLowerCase().includes("out of stock")),
          `Error must state out of stock. Got: ${valOos.errors.join(", ")}`
        );
      } finally {
        // Restore stock back to 2
        await StudioMaterial.updateOne(
          { "variants.sku": "CH-SHELL-PURPLE" },
          { $set: { "variants.$.stock": 2 } }
        );
      }
    });

    // -------------------------------------------------------------------------
    // Test 5: Isolation: Other categories do not inherit unrelated category-specific fields
    // -------------------------------------------------------------------------
    await runTest("Test 5: Other product categories do not accidentally inherit unrelated category-specific fields", async () => {
      const uniqueSuffix = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;

      // Create an Earring category with productType: "earring"
      const earringCategory = await Category.create({
        name: `Test Earring Category ${uniqueSuffix}`,
        slug: `test-earrings-${uniqueSuffix}`,
        productType: "earring",
        customizationFields: [],
        isActive: true,
      });
      createdCategoryIds.push(earringCategory._id as Types.ObjectId);

      const earringProduct = await Product.create({
        name: `Test Kundan Earrings ${uniqueSuffix}`,
        slug: `test-kundan-earrings-${uniqueSuffix}`,
        sku: `TEST-EAR-${uniqueSuffix}`.toUpperCase(),
        description: "Handcrafted test kundan earrings",
        price: 899,
        categoryId: earringCategory._id,
        isCustomizable: true,
        images: ["/assets/earring.jpg"],
        status: "active",
        isActive: true,
      });
      createdProductIds.push(earringProduct._id as Types.ObjectId);

      const earringCustomization = await getProductCustomization(earringProduct._id.toString());
      console.log(
        "   Earring product fields:",
        earringCustomization.fields.map((f: any) => f.key)
      );

      // Verify it does NOT contain the bracelet category's Shell Charms or bracelet fields
      const hasShellCharms = earringCustomization.fields.some((f: any) =>
        f.options?.some((o: any) => o.variantSku === "CH-SHELL-PURPLE")
      );
      assert(!hasShellCharms, "Earring product must NEVER inherit bracelet category's linked charm");

      const hasBraceletSize = earringCustomization.fields.some(
        (f: any) => f.key === "Bracelet Size" || f.key === "braceletSize"
      );
      assert(!hasBraceletSize, "Earring product must NEVER inherit Bracelet Size");
    });

    // -------------------------------------------------------------------------
    // Test 6: Products without category-specific configurations continue working
    // -------------------------------------------------------------------------
    await runTest("Test 6: Products without category-specific configurations continue working with base fields", async () => {
      const uniqueSuffix = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;

      // Category for bangle with no category-specific customizationFields
      const bangleCategory = await Category.create({
        name: `Test Plain Bangle Category ${uniqueSuffix}`,
        slug: `test-bangle-${uniqueSuffix}`,
        productType: "bangle",
        customizationFields: [],
        isActive: true,
      });
      createdCategoryIds.push(bangleCategory._id as Types.ObjectId);

      const bangleProduct = await Product.create({
        name: `Test Bangles ${uniqueSuffix}`,
        slug: `test-bangles-${uniqueSuffix}`,
        sku: `TEST-BNG-${uniqueSuffix}`.toUpperCase(),
        description: "Handcrafted test bangles",
        price: 499,
        categoryId: bangleCategory._id,
        isCustomizable: true,
        images: ["/assets/bangle.jpg"],
        status: "active",
        isActive: true,
      });
      createdProductIds.push(bangleProduct._id as Types.ObjectId);

      const bangleCustomization = await getProductCustomization(bangleProduct._id.toString());
      console.log(
        "   Bangle product fields count:",
        bangleCustomization.fields.length
      );
      assert(bangleCustomization.isCustomizable === true, "Bangle product should be customizable");
      // Does not crash, resolves safely
    });

    // -------------------------------------------------------------------------
    // Test 7: generatePreview uses resolved fields and layers
    // -------------------------------------------------------------------------
    await runTest("Test 7: generatePreview works with resolved category fields", async () => {
      const previewRes = await generatePreview(realProductId, {
        Charm: ["CH-SHELL-PURPLE"],
      });

      console.log("   Preview URL generated:", previewRes.previewUrl);
      assert(typeof previewRes.previewUrl === "string", "previewUrl must be returned");
      assert(previewRes.totalPrice >= 40, "totalPrice must reflect product pricing");
    });

  } finally {
    // -------------------------------------------------------------------------
    // Cleanup temporary test items
    // -------------------------------------------------------------------------
    console.log("\nCleaning up temporary test records...");
    if (createdProductIds.length > 0) {
      await Product.deleteMany({ _id: { $in: createdProductIds } });
    }
    if (createdCategoryIds.length > 0) {
      await Category.deleteMany({ _id: { $in: createdCategoryIds } });
    }
    if (createdConfigIds.length > 0) {
      await CustomizationConfig.deleteMany({ _id: { $in: createdConfigIds } });
    }
    if (createdMaterialIds.length > 0) {
      await StudioMaterial.deleteMany({ _id: { $in: createdMaterialIds } });
    }
    console.log("Cleanup complete.");

    await disconnectDatabase();
  }

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
    console.log("All category-specific customization resolution tests passed successfully!");
  }
}

main().catch((err) => {
  console.error("Unhandled test execution error:", err);
  process.exit(1);
});
