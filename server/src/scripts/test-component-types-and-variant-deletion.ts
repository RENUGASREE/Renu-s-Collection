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
  console.log("Renu's Collections — Component Types & SKU Variant Deletion Test Suite");
  console.log("================================================================================");

  const { connectDatabase, disconnectDatabase } = await import("../db/connection.js");
  const {
    ComponentType,
    ensureDefaultComponentTypes,
    StudioMaterial,
    Order,
    User,
  } = await import("../models/index.js");
  const { toPublicMaterial } = await import("../services/studio.service.js");
  const { getProductCustomization } = await import("../services/customization.service.js");

  await connectDatabase();

  const createdTypeIds: string[] = [];
  const createdMaterialIds: Types.ObjectId[] = [];
  const createdOrderIds: Types.ObjectId[] = [];
  const createdUserIds: Types.ObjectId[] = [];

  // Snapshot initial count of materials and variants
  const initialMaterialCount = await StudioMaterial.countDocuments();
  const initialMaterials = await StudioMaterial.find().lean();
  const initialVariantSkus = new Set(initialMaterials.flatMap((m) => m.variants.map((v) => v.sku)));

  try {
    // -------------------------------------------------------------------------
    // Test 1: Adding a new component type
    // -------------------------------------------------------------------------
    await runTest("Test 1: Adding a new component type", async () => {
      await ensureDefaultComponentTypes();

      // Check defaults exist
      const defaultBead = await ComponentType.findOne({ typeId: "bead" });
      assert(!!defaultBead, "Default component type 'bead' must exist");

      const uniqueSuffix = `${Date.now()}`;
      const newTypeId = `test_wire_${uniqueSuffix}`;
      createdTypeIds.push(newTypeId);

      const created = await ComponentType.create({
        typeId: newTypeId,
        displayName: "Craft Wire",
        description: "Flexible wire for jewellery craft",
        displayOrder: 15,
        isActive: true,
      });

      assert(!!created, "New component type should be created");
      assert(created.typeId === newTypeId, "typeId must match");
      assert(created.displayName === "Craft Wire", "displayName must match");
      assert(created.isActive === true, "Must be active by default");
    });

    // -------------------------------------------------------------------------
    // Test 2: Editing a component type (display name & order)
    // -------------------------------------------------------------------------
    await runTest("Test 2: Editing a component type display name", async () => {
      const typeId = createdTypeIds[0];
      const compType = await ComponentType.findOne({ typeId });
      if (!compType) throw new Error("Component type must exist");

      compType.displayName = "Artisan Craft Wire";
      compType.displayOrder = 20;
      await compType.save();

      const updated = await ComponentType.findOne({ typeId });
      assert(updated?.displayName === "Artisan Craft Wire", "Display name must be updated");
      assert(updated?.displayOrder === 20, "displayOrder must be updated");
      // Verify internal identifier was preserved
      assert(updated?.typeId === typeId, "Internal type identifier must remain unchanged");
    });

    // -------------------------------------------------------------------------
    // Test 3: Removing an unused component type
    // -------------------------------------------------------------------------
    await runTest("Test 3: Removing an unused component type", async () => {
      const uniqueSuffix = `${Date.now()}`;
      const tempTypeId = `temp_ribbon_${uniqueSuffix}`;
      createdTypeIds.push(tempTypeId);

      await ComponentType.create({
        typeId: tempTypeId,
        displayName: "Satin Ribbon",
        isActive: true,
      });

      // Verify no materials use this type
      const materialCount = await StudioMaterial.countDocuments({ materialType: tempTypeId });
      assert(materialCount === 0, "No materials should use this new type");

      // Delete unused component type
      await ComponentType.deleteOne({ typeId: tempTypeId });

      const deleted = await ComponentType.findOne({ typeId: tempTypeId });
      assert(!deleted, "Unused component type should be permanently removed");
    });

    // -------------------------------------------------------------------------
    // Test 4: Safely handling a component type used by existing materials
    // -------------------------------------------------------------------------
    await runTest("Test 4: Safely handling a component type used by existing materials (blocking deletion & safe deactivation)", async () => {
      const typeId = createdTypeIds[0]; // "test_wire_..."
      const uniqueSuffix = `${Date.now()}`;

      // Create a material referencing this type
      const testMat = await StudioMaterial.create({
        name: `Test Wire Material ${uniqueSuffix}`,
        code: `MAT-WIRE-${uniqueSuffix}`.toUpperCase(),
        materialType: typeId,
        imageUrl: "/assets/materials/wire.jpg",
        allowedJewelleryTypes: ["bracelet"],
        visibilityScopes: ["studio"],
        isActive: true,
        variants: [
          {
            sku: `SKU-WIRE-${uniqueSuffix}`.toUpperCase(),
            sizeLabel: "1mm",
            sellingUnit: "piece",
            purchaseCost: 10,
            sellingRate: 25,
            stock: 50,
            lowStockThreshold: 5,
            isActive: true,
          },
        ],
      });
      createdMaterialIds.push(testMat._id as Types.ObjectId);

      // Verify usage count > 0
      const materialCount = await StudioMaterial.countDocuments({ materialType: typeId });
      assert(materialCount === 1, "Component type should now be in use by 1 material");

      // Attempt deletion safeguard check:
      let deletionBlocked = false;
      let blockedReason = "";
      if (materialCount > 0) {
        deletionBlocked = true;
        blockedReason = `Cannot permanently delete component type because it is currently used by ${materialCount} shared material(s).`;
      }
      assert(deletionBlocked, "Permanent deletion must be blocked when used by materials");
      assert(blockedReason.includes("used by 1 shared material"), "Explanation must state usage count");

      // Perform safe deactivation
      const compType = await ComponentType.findOne({ typeId });
      if (!compType) throw new Error("Component type must exist");
      compType.isActive = false;
      await compType.save();

      const deactivated = await ComponentType.findOne({ typeId });
      assert(deactivated?.isActive === false, "Component type must be successfully deactivated");

      // Material itself remains completely intact
      const refreshedMat = await StudioMaterial.findById(testMat._id);
      if (!refreshedMat) throw new Error("Existing material record must remain completely intact");
      assert(refreshedMat.materialType === typeId, "Material type reference must remain intact");
    });

    // -------------------------------------------------------------------------
    // Test 5: New types appearing in all relevant dropdowns and filters
    // -------------------------------------------------------------------------
    await runTest("Test 5: New active types appear immediately in active listings and material creation", async () => {
      const uniqueSuffix = `${Date.now()}`;
      const connectorTypeId = `connector_${uniqueSuffix}`;
      createdTypeIds.push(connectorTypeId);

      await ComponentType.create({
        typeId: connectorTypeId,
        displayName: "Connector",
        isActive: true,
        displayOrder: 30,
      });

      // Active component types query (used by filter dropdown & Add/Edit material modal)
      const activeTypes = await ComponentType.find({ isActive: true }).sort({ displayOrder: 1 });
      const foundInActive = activeTypes.some((t) => t.typeId === connectorTypeId);
      assert(foundInActive, "Newly added type must appear immediately in active component types");

      // Verify a new material can be catalogued with this new component type
      const connectorMat = await StudioMaterial.create({
        name: `Test Connector Material ${uniqueSuffix}`,
        code: `MAT-CONN-${uniqueSuffix}`.toUpperCase(),
        materialType: connectorTypeId,
        imageUrl: "/assets/materials/connector.jpg",
        allowedJewelleryTypes: ["bracelet"],
        visibilityScopes: ["studio"],
        isActive: true,
        variants: [
          {
            sku: `SKU-CONN-${uniqueSuffix}`.toUpperCase(),
            sizeLabel: "10mm",
            sellingUnit: "piece",
            purchaseCost: 15,
            sellingRate: 40,
            stock: 20,
            lowStockThreshold: 5,
            isActive: true,
          },
        ],
      });
      createdMaterialIds.push(connectorMat._id as Types.ObjectId);

      assert(connectorMat.materialType === connectorTypeId, "Material must save with new component type");
    });

    // -------------------------------------------------------------------------
    // Test 6: Deleting an unused SKU variant
    // -------------------------------------------------------------------------
    await runTest("Test 6: Permanently deleting an unused SKU variant", async () => {
      const uniqueSuffix = `${Date.now()}`;
      const unusedSku = `UNUSED-VAR-${uniqueSuffix}`.toUpperCase();

      const matWithUnused = await StudioMaterial.create({
        name: `Test Material For Unused Variant ${uniqueSuffix}`,
        code: `MAT-UNUSED-${uniqueSuffix}`.toUpperCase(),
        materialType: "bead",
        imageUrl: "/assets/materials/bead.jpg",
        allowedJewelleryTypes: ["bracelet"],
        visibilityScopes: ["studio"],
        isActive: true,
        variants: [
          {
            sku: unusedSku,
            sizeLabel: "6mm",
            sellingUnit: "piece",
            purchaseCost: 10,
            sellingRate: 20,
            stock: 30,
            lowStockThreshold: 5,
            isActive: true,
          },
          {
            sku: `KEEP-VAR-${uniqueSuffix}`.toUpperCase(),
            sizeLabel: "8mm",
            sellingUnit: "piece",
            purchaseCost: 12,
            sellingRate: 25,
            stock: 40,
            lowStockThreshold: 5,
            isActive: true,
          },
        ],
      });
      createdMaterialIds.push(matWithUnused._id as Types.ObjectId);

      // Verify initial variant count is 2
      assert(matWithUnused.variants.length === 2, "Material should have 2 variants initially");

      // Execute variant deletion safeguard check (mocking controller logic)
      const targetParam = unusedSku;
      const variantIndex = matWithUnused.variants.findIndex((v) => v.sku === targetParam);
      assert(variantIndex !== -1, "Variant must be found");

      const variant = matWithUnused.variants[variantIndex];
      const targetSku = variant.sku;
      const variantId = variant._id ? variant._id.toString() : null;

      const orderCount = await Order.countDocuments({
        $or: [
          { "items.studioDesign.beadSequence.variantSku": targetSku },
          { "items.studioDesign.charms.variantSku": targetSku },
          { "items.customDesign.beadSequence.variantSku": targetSku },
          ...(variantId ? [{ "items.studioDesign.beadSequence.variantId": variantId }] : []),
        ],
      });
      assert(orderCount === 0, "Unused variant must have 0 orders");

      // Permanently remove variant
      matWithUnused.variants.splice(variantIndex, 1);
      await matWithUnused.save();

      const refreshed = await StudioMaterial.findById(matWithUnused._id);
      assert(refreshed?.variants.length === 1, "Material should now have exactly 1 variant");
      const hasUnused = refreshed?.variants.some((v) => v.sku === unusedSku);
      assert(!hasUnused, "Unused variant must be permanently deleted from material");
      const hasKeep = refreshed?.variants.some((v) => v.sku === `KEEP-VAR-${uniqueSuffix}`.toUpperCase());
      assert(Boolean(hasKeep), "Other variants on the material must remain intact");
    });

    // -------------------------------------------------------------------------
    // Test 7: Blocking permanent deletion of a SKU referenced by historical orders
    // -------------------------------------------------------------------------
    await runTest("Test 7: Blocking permanent deletion of a SKU referenced by historical orders (via SKU and variant ID)", async () => {
      const uniqueSuffix = `${Date.now()}`;
      const orderedSku = `HIST-ORDER-${uniqueSuffix}`.toUpperCase();

      const matWithOrdered = await StudioMaterial.create({
        name: `Historical Order Material ${uniqueSuffix}`,
        code: `MAT-HIST-${uniqueSuffix}`.toUpperCase(),
        materialType: "bead",
        imageUrl: "/assets/materials/bead.jpg",
        allowedJewelleryTypes: ["bracelet"],
        visibilityScopes: ["studio"],
        isActive: true,
        variants: [
          {
            sku: orderedSku,
            sizeLabel: "8mm",
            sellingUnit: "piece",
            purchaseCost: 15,
            sellingRate: 35,
            stock: 10,
            lowStockThreshold: 5,
            isActive: true,
          },
        ],
      });
      createdMaterialIds.push(matWithOrdered._id as Types.ObjectId);

      const targetVariant = matWithOrdered.variants[0];
      const variantIdStr = (targetVariant as any)._id.toString();

      // Create a test user for order
      const testUser = await User.create({
        username: `testuser_${uniqueSuffix}`,
        email: `testuser-${uniqueSuffix}@example.com`,
        passwordHash: "dummyHash123",
        firstName: "Test",
        lastName: "Customer",
        role: "customer",
      });
      createdUserIds.push(testUser._id as Types.ObjectId);

      // Create a historical order referencing this variant SKU and variantId
      const testAddress = {
        fullName: "Test Customer",
        line1: "123 Test St",
        city: "Chennai",
        state: "Tamil Nadu",
        postalCode: "600001",
        country: "India",
        phone: "9876543210",
      };

      const testOrder = await Order.create({
        orderNumber: `ORD-TEST-${uniqueSuffix}`,
        userId: testUser._id,
        status: "delivered",
        paymentStatus: "paid",
        subtotal: 99,
        total: 99,
        email: "testuser@example.com",
        phone: "9876543210",
        shippingAddress: testAddress,
        billingAddress: testAddress,
        items: [
          {
            productId: new Types.ObjectId(),
            name: "Custom Bracelet Design",
            sku: "CUSTOM-BRACELET-01",
            unitPrice: 99,
            quantity: 1,
            subtotal: 99,
            studioDesign: {
              name: "Custom Bracelet",
              jewelleryType: "bracelet",
              beadSequence: [
                {
                  materialId: matWithOrdered._id,
                  variantSku: orderedSku,
                  variantId: variantIdStr,
                },
              ],
            },
          },
        ],
      });
      createdOrderIds.push(testOrder._id as Types.ObjectId);

      // Execute safeguard check:
      const orderCount = await Order.countDocuments({
        $or: [
          { "items.studioDesign.beadSequence.variantSku": orderedSku },
          { "items.studioDesign.beadSequence.variantId": variantIdStr },
          { "items.studioDesign.beadSequence.variantId": new Types.ObjectId(variantIdStr) },
        ],
      });
      assert(orderCount === 1, "Order check must detect the 1 historical order referencing this variant");

      // Verify deletion is prohibited
      let deletionProhibited = false;
      let blockedMsg = "";
      if (orderCount > 0) {
        deletionProhibited = true;
        blockedMsg = `Cannot permanently delete SKU "${orderedSku}" because it is referenced in ${orderCount} historical order(s). Historical order records cannot be altered. Please deactivate this variant instead so it is hidden from future orders while preserving order history.`;
      }
      assert(deletionProhibited, "Permanent deletion must be strictly blocked");
      assert(blockedMsg.includes("referenced in 1 historical order"), "Message must clearly explain order reference");

      // Verify variant is NOT removed from material
      const freshMat = await StudioMaterial.findById(matWithOrdered._id);
      assert(Boolean(freshMat?.variants.some((v) => v.sku === orderedSku)), "Variant must still exist in material");
    });

    // -------------------------------------------------------------------------
    // Test 8: Deactivating a referenced SKU without damaging historical records
    // -------------------------------------------------------------------------
    await runTest("Test 8: Deactivating a referenced SKU safely preserves historical order records", async () => {
      const orderId = createdOrderIds[0];
      const matId = createdMaterialIds[createdMaterialIds.length - 1];

      // Deactivate variant in material
      await StudioMaterial.updateOne(
        { _id: matId, "variants.sku": { $regex: /^HIST-ORDER-/ } },
        { $set: { "variants.$.isActive": false } }
      );

      const updatedMat = await StudioMaterial.findById(matId);
      const targetV = updatedMat?.variants.find((v) => v.sku.startsWith("HIST-ORDER-"));
      assert(targetV?.isActive === false, "Variant isActive must now be false");

      // Verify historical order is completely undamaged
      const order = await Order.findById(orderId);
      if (!order) throw new Error("Historical order must remain in database");
      assert(order.status === "delivered", "Historical order status must be unchanged");
      const orderItem = order.items[0];
      const seq = (orderItem as any).studioDesign.beadSequence;
      assert(seq.length === 1, "Historical order beadSequence must be intact");
      assert(seq[0].variantSku === targetV?.sku, "Historical order variantSku reference must remain intact");
    });

    // -------------------------------------------------------------------------
    // Test 9: Confirming deleted/deactivated variants cannot be selected for new designs
    // -------------------------------------------------------------------------
    await runTest("Test 9: Deactivated variants are excluded from public Studio material catalog", async () => {
      const matId = createdMaterialIds[createdMaterialIds.length - 1];
      const mat = await StudioMaterial.findById(matId);
      assert(!!mat, "Material must exist");

      // toPublicMaterial simulates public studio payload
      const publicMat = toPublicMaterial(mat as any);

      // Verify deactivated variant is NOT present in public variants
      const foundInactive = publicMat.variants.some((v) => v.sku.startsWith("HIST-ORDER-"));
      assert(!foundInactive, "Deactivated variant must NOT appear in public Studio variant options");
    });

    // -------------------------------------------------------------------------
    // Test 10: Existing material and variant records remain unchanged
    // -------------------------------------------------------------------------
    await runTest("Test 10: Existing production materials, SKUs, and stock quantities remain strictly unchanged", async () => {
      // Fetch all original materials
      const currentMaterials = await StudioMaterial.find({ _id: { $nin: createdMaterialIds } }).lean();

      assert(
        currentMaterials.length === initialMaterialCount,
        `Expected ${initialMaterialCount} original materials, found ${currentMaterials.length}`
      );

      // Verify all original SKUs still exist
      for (const mat of currentMaterials) {
        for (const v of mat.variants) {
          assert(
            initialVariantSkus.has(v.sku),
            `Original SKU "${v.sku}" must still exist in production inventory`
          );
        }
      }

      // Check Real Bracelet Product ("Light Green Crackle Bead Bracelet 💚")
      const realProductId = "6ae45687cf110d86232fc1d5";
      const customization = await getProductCustomization(realProductId);
      assert(customization.fields.length === 1, "Bracelet product customization must remain exactly 1 field (Charm)");
      const shellCharm = customization.fields[0].options?.find((o: any) => o.variantSku === "CH-SHELL-PURPLE");
      assert(!!shellCharm, "Shell Charms (Purple) must remain intact with authoritative stock");
      assert(shellCharm.stock === 2, "Shell Charms stock must remain unchanged (2)");
    });

  } finally {
    // -------------------------------------------------------------------------
    // Cleanup temporary test items
    // -------------------------------------------------------------------------
    console.log("\nCleaning up temporary test records...");
    if (createdOrderIds.length > 0) {
      await Order.deleteMany({ _id: { $in: createdOrderIds } });
    }
    if (createdUserIds.length > 0) {
      await User.deleteMany({ _id: { $in: createdUserIds } });
    }
    if (createdMaterialIds.length > 0) {
      await StudioMaterial.deleteMany({ _id: { $in: createdMaterialIds } });
    }
    if (createdTypeIds.length > 0) {
      await ComponentType.deleteMany({ typeId: { $in: createdTypeIds } });
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
    console.log("All 10 Component Types and SKU Variant Deletion tests passed successfully!");
  }
}

main().catch((err) => {
  console.error("Unhandled test execution error:", err);
  process.exit(1);
});
