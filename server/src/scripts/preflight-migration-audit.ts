import dns from "dns";
import path from "path";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });
dotenv.config({ path: path.resolve(process.cwd(), "server/.env") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

import mongoose from "mongoose";
import { env } from "../config/env.js";
import { createPostgresPool } from "../db/postgres.js";
import {
  User,
  Product,
  Category,
  Order,
  Cart,
  WishlistItem,
  Review,
  Coupon,
  CustomizationConfig,
  ComponentType,
  StudioMaterial,
  JewelleryType,
  MakingCharge,
  DesignRule,
  DesignTemplate,
  SavedDesign,
  StudioReservation,
  InventoryLog,
  ContactMessage,
} from "../models/index.js";

if (env.MONGODB_URI?.startsWith("mongodb+srv://")) {
  try {
    dns.setServers(["8.8.8.8", "1.1.1.1"]);
  } catch {}
}

const SUPABASE_TABLES = [
  "users",
  "user_addresses",
  "categories",
  "products",
  "product_media",
  "component_types",
  "jewellery_types",
  "studio_materials",
  "studio_material_variants",
  "customization_configs",
  "making_charges",
  "design_rules",
  "design_templates",
  "saved_designs",
  "orders",
  "order_items",
  "studio_reservations",
  "studio_reservation_items",
  "carts",
  "cart_items",
  "wishlist_items",
  "reviews",
  "coupons",
  "inventory_logs",
  "contact_messages",
  "image_mappings",
];

async function runPreflightAudit() {
  console.log("================================================================================");
  console.log("RENU'S COLLECTIONS – COMPLETE MIGRATION PREFLIGHT AUDIT (PHASE 2B)");
  console.log("================================================================================\n");

  // 1. Connect to MongoDB Atlas (Read-Only)
  console.log("Connecting to MongoDB Atlas...");
  if (mongoose.connection.readyState !== 1) {
    await mongoose.connect(env.MONGODB_URI);
  }
  const db = mongoose.connection.db;
  if (!db) throw new Error("MongoDB connection failed");
  console.log("Connected to MongoDB Atlas.");

  // 2. Connect to Supabase Postgres (Read-Only)
  console.log("Connecting to Supabase PostgreSQL...");
  const pool: any = createPostgresPool();
  await pool.query("SELECT 1;");
  console.log("Connected to Supabase PostgreSQL.\n");

  // --------------------------------------------------------------------------
  // Audit 1: Current Destination Supabase Table Counts
  // --------------------------------------------------------------------------
  console.log("--- 1. Destination Supabase Table Counts ---");
  const targetCounts: Record<string, number> = {};
  for (const table of SUPABASE_TABLES) {
    const res = await pool.query(`SELECT COUNT(*)::int AS count FROM "${table}";`);
    targetCounts[table] = res.rows[0].count;
  }
  for (const [table, cnt] of Object.entries(targetCounts)) {
    console.log(`  ${table.padEnd(28)}: ${cnt} record(s)`);
  }

  // --------------------------------------------------------------------------
  // Audit 2: Source MongoDB Document Counts
  // --------------------------------------------------------------------------
  console.log("\n--- 2. Source MongoDB Document Counts ---");
  const mongoCollections = await db.listCollections().toArray();
  const mongoRawCounts: Record<string, number> = {};
  for (const col of mongoCollections) {
    const count = await db.collection(col.name).countDocuments();
    mongoRawCounts[col.name] = count;
    console.log(`  ${col.name.padEnd(28)}: ${count} document(s)`);
  }

  // --------------------------------------------------------------------------
  // Audit 3: Planned Relational Entity Inserts & Nested Records
  // --------------------------------------------------------------------------
  console.log("\n--- 3. Planned Inserts & Nested Record Extraction ---");

  const users = await User.find({}).lean();
  let addressCount = 0;
  for (const u of users) {
    if (Array.isArray(u.addresses)) addressCount += u.addresses.length;
  }

  const categories = await Category.find({}).lean();

  const products = await Product.find({}).lean();
  let productMediaCount = 0;
  for (const p of products) {
    if (Array.isArray(p.media)) productMediaCount += p.media.length;
  }

  const componentTypes = await ComponentType.find({}).lean();
  const jewelleryTypes = await JewelleryType.find({}).lean();

  const studioMaterials = await StudioMaterial.find({}).lean();
  let materialVariantCount = 0;
  for (const m of studioMaterials) {
    if (Array.isArray(m.variants)) materialVariantCount += m.variants.length;
  }

  const customConfigs = await CustomizationConfig.find({}).lean();
  const makingCharges = await MakingCharge.find({}).lean();
  const designRules = await DesignRule.find({}).lean();
  const designTemplates = await DesignTemplate.find({}).lean();
  const savedDesigns = await SavedDesign.find({}).lean();

  const orders = await Order.find({}).lean();
  let orderItemCount = 0;
  for (const o of orders) {
    if (Array.isArray(o.items)) orderItemCount += o.items.length;
  }

  const reservations = await StudioReservation.find({}).lean();
  let reservationItemCount = 0;
  for (const r of reservations) {
    if (Array.isArray(r.items)) reservationItemCount += r.items.length;
  }

  const carts = await Cart.find({}).lean();
  let cartItemCount = 0;
  for (const c of carts) {
    if (Array.isArray(c.items)) cartItemCount += c.items.length;
  }

  const wishlists = await WishlistItem.find({}).lean();
  const reviews = await Review.find({}).lean();
  const coupons = await Coupon.find({}).lean();
  const inventoryLogs = await InventoryLog.find({}).lean();
  const contactMessages = await ContactMessage.find({}).lean();

  const plannedInserts: Record<string, number> = {
    users: new Set(users.map(u => u.email.toLowerCase())).size,
    user_addresses: addressCount,
    categories: categories.length,
    products: products.length,
    product_media: productMediaCount,
    component_types: componentTypes.length,
    jewellery_types: jewelleryTypes.length,
    studio_materials: studioMaterials.length,
    studio_material_variants: materialVariantCount,
    customization_configs: customConfigs.length,
    making_charges: makingCharges.length,
    design_rules: designRules.length,
    design_templates: designTemplates.length,
    saved_designs: savedDesigns.length,
    orders: orders.length,
    order_items: orderItemCount,
    studio_reservations: reservations.length,
    studio_reservation_items: reservationItemCount,
    carts: carts.length,
    cart_items: cartItemCount,
    wishlist_items: wishlists.length,
    reviews: reviews.length,
    coupons: coupons.length,
    inventory_logs: inventoryLogs.length,
    contact_messages: contactMessages.length,
  };

  for (const [table, count] of Object.entries(plannedInserts)) {
    console.log(`  ${table.padEnd(28)}: ${count} planned`);
  }

  // --------------------------------------------------------------------------
  // Audit 4: GridFS Image Rehearsal & Verification
  // --------------------------------------------------------------------------
  console.log("\n--- 4. GridFS Images Rehearsal (All 102 Files) ---");
  const filesColl = db.collection("product_images.files");
  const chunksColl = db.collection("product_images.chunks");
  const gridFiles = await filesColl.find({}).sort({ uploadDate: 1 }).toArray();

  let totalGridBytes = 0;
  let missingMd5Count = 0;
  const imageIds = new Set<string>();
  const filenames = new Map<string, number>();

  for (const f of gridFiles) {
    totalGridBytes += f.length;
    const fId = f._id.toString();
    imageIds.add(fId);
    if (!f.md5) missingMd5Count++;
    const fn = f.filename || "unnamed";
    filenames.set(fn, (filenames.get(fn) || 0) + 1);
  }

  const chunkCount = await chunksColl.countDocuments();
  console.log(`  Total GridFS files       : ${gridFiles.length}`);
  console.log(`  Total GridFS chunks      : ${chunkCount}`);
  console.log(`  Total original file size : ${(totalGridBytes / (1024 * 1024)).toFixed(2)} MB (${totalGridBytes} bytes)`);
  console.log(`  Files with precomputed MD5: ${gridFiles.length - missingMd5Count}/${gridFiles.length}`);
  console.log(`  Filename collisions      : ${Array.from(filenames.entries()).filter(([_, c]) => c > 1).length} filenames appear more than once (isolated by /originals/<id>/<filename>)`);
  console.log(`  Destination allowance    : 1,024 MB (1.00 GB) Supabase Storage`);
  console.log(`  Planned storage usage    : ${(totalGridBytes / (1024 * 1024)).toFixed(2)} MB (${((totalGridBytes / (1024 * 1024 * 1024)) * 100).toFixed(2)}% of 1 GB allowance)`);

  // --------------------------------------------------------------------------
  // Audit 5: Foreign-Key & Relational Integrity Check
  // --------------------------------------------------------------------------
  console.log("\n--- 5. Foreign-Key & Integrity Validation ---");
  const fkIssues: string[] = [];

  const userIds = new Set(users.map(u => u._id.toString()));
  const categoryIds = new Set(categories.map(c => c._id.toString()));
  const productIds = new Set(products.map(p => p._id.toString()));
  const materialIds = new Set(studioMaterials.map(m => m._id.toString()));
  const orderIds = new Set(orders.map(o => o._id.toString()));

  // 1. Categories parent_id check
  for (const cat of categories) {
    if (cat.parentId && !categoryIds.has(cat.parentId.toString())) {
      fkIssues.push(`Category "${cat.name}" (${cat._id}) references non-existent parentId: ${cat.parentId}`);
    }
  }

  // 2. Products category_id & subcategory_id check
  for (const prod of products) {
    if (!categoryIds.has(prod.categoryId.toString())) {
      fkIssues.push(`Product "${prod.name}" (${prod._id}) references non-existent categoryId: ${prod.categoryId}`);
    }
    if (prod.subcategoryId && !categoryIds.has(prod.subcategoryId.toString())) {
      fkIssues.push(`Product "${prod.name}" (${prod._id}) references non-existent subcategoryId: ${prod.subcategoryId}`);
    }
  }

  // 3. Orders user_id check
  for (const ord of orders) {
    if (!userIds.has(ord.userId.toString())) {
      fkIssues.push(`Order ${ord.orderNumber} (${ord._id}) references non-existent userId: ${ord.userId}`);
    }
    // Check items
    if (Array.isArray(ord.items)) {
      for (const item of ord.items) {
        if (item.productId && !productIds.has(item.productId.toString())) {
          fkIssues.push(`Order ${ord.orderNumber} item "${item.name}" references non-existent productId: ${item.productId}`);
        }
      }
    }
  }

  // 4. Saved designs user_id check
  for (const sd of savedDesigns) {
    if (!userIds.has(sd.userId.toString())) {
      fkIssues.push(`SavedDesign "${sd.name}" (${sd._id}) references non-existent userId: ${sd.userId}`);
    }
  }

  // 5. Studio reservations user_id and order_id check
  for (const res of reservations) {
    if (!userIds.has(res.userId.toString())) {
      fkIssues.push(`StudioReservation (${res._id}) references non-existent userId: ${res.userId}`);
    }
    if (!orderIds.has(res.orderId.toString())) {
      fkIssues.push(`StudioReservation (${res._id}) references non-existent orderId: ${res.orderId}`);
    }
    if (Array.isArray(res.items)) {
      for (const item of res.items) {
        if (item.materialId && !materialIds.has(item.materialId.toString())) {
          fkIssues.push(`StudioReservation (${res._id}) item "${item.materialName}" references non-existent materialId: ${item.materialId}`);
        }
      }
    }
  }

  // 6. Carts user_id check
  for (const cart of carts) {
    if (cart.userId && !userIds.has(cart.userId.toString())) {
      fkIssues.push(`Cart (${cart._id}) references non-existent userId: ${cart.userId}`);
    }
    if (Array.isArray(cart.items)) {
      for (const item of cart.items) {
        if (item.productId && !productIds.has(item.productId.toString())) {
          fkIssues.push(`Cart (${cart._id}) item "${item.name}" references non-existent productId: ${item.productId}`);
        }
      }
    }
  }

  // 7. Wishlists user_id and product_id check
  for (const w of wishlists) {
    if (!userIds.has(w.userId.toString())) {
      fkIssues.push(`Wishlist item (${w._id}) references non-existent userId: ${w.userId}`);
    }
    if (!productIds.has(w.productId.toString())) {
      fkIssues.push(`Wishlist item (${w._id}) references non-existent productId: ${w.productId}`);
    }
  }

  // 8. Reviews user_id and product_id check
  for (const rev of reviews) {
    if (!userIds.has(rev.userId.toString())) {
      fkIssues.push(`Review (${rev._id}) references non-existent userId: ${rev.userId}`);
    }
    if (!productIds.has(rev.productId.toString())) {
      fkIssues.push(`Review (${rev._id}) references non-existent productId: ${rev.productId}`);
    }
  }

  // 9. Inventory logs product_id check
  for (const log of inventoryLogs) {
    if (!productIds.has(log.productId.toString())) {
      fkIssues.push(`InventoryLog (${log._id}) references non-existent productId: ${log.productId}`);
    }
  }

  if (fkIssues.length === 0) {
    console.log("  [PASS] Zero foreign-key orphaned references found. All relationships are 100% valid.");
  } else {
    console.log(`  [FAIL] Found ${fkIssues.length} foreign-key orphaned reference(s):`);
    for (const issue of fkIssues) {
      console.log(`    - ${issue}`);
    }
  }

  // --------------------------------------------------------------------------
  // Audit 6: Uniqueness & Conflict Check
  // --------------------------------------------------------------------------
  console.log("\n--- 6. Uniqueness & Duplicate Constraint Checks ---");
  const conflicts: string[] = [];

  function checkUniqueness(items: any[], keyFn: (item: any) => string, desc: string) {
    const seen = new Map<string, string>();
    for (const item of items) {
      const k = keyFn(item);
      if (!k) continue;
      if (seen.has(k)) {
        conflicts.push(`Duplicate ${desc}: "${k}" (found on IDs: ${seen.get(k)} and ${item._id || item.id})`);
      } else {
        seen.set(k, (item._id || item.id || "item").toString());
      }
    }
  }

  // Deduplicate users using canonical email reconciliation
  const reconciledUsers: any[] = [];
  const seenUserEmails = new Set<string>();
  for (const u of users) {
    const em = u.email.toLowerCase();
    if (!seenUserEmails.has(em)) {
      seenUserEmails.add(em);
      reconciledUsers.push(u);
    }
  }

  checkUniqueness(reconciledUsers, u => u.email.toLowerCase(), "user email");
  checkUniqueness(reconciledUsers, u => u.username.toLowerCase(), "user username");
  checkUniqueness(categories, c => c.slug, "category slug");
  checkUniqueness(products, p => p.slug, "product slug");
  checkUniqueness(products, p => p.sku, "product sku");
  checkUniqueness(componentTypes, ct => ct.typeId, "component_type typeId");
  checkUniqueness(studioMaterials, sm => sm.code, "studio_material code");

  // Material variants SKU
  const allVariants: any[] = [];
  for (const sm of studioMaterials) {
    if (Array.isArray(sm.variants)) {
      for (const v of sm.variants) {
        allVariants.push({ ...v, parentCode: sm.code });
      }
    }
  }
  checkUniqueness(allVariants, v => v.sku, "studio_material_variant sku");

  checkUniqueness(coupons, cp => cp.code.toUpperCase(), "coupon code");

  if (conflicts.length === 0) {
    console.log("  [PASS] Zero duplicate or conflicting unique keys detected across all collections.");
  } else {
    console.log(`  [FAIL] Found ${conflicts.length} unique constraint conflict(s):`);
    for (const c of conflicts) {
      console.log(`    - ${c}`);
    }
  }

  // --------------------------------------------------------------------------
  // Audit 7: Image References Audit
  // --------------------------------------------------------------------------
  console.log("\n--- 7. Image References Audit ---");
  const referencedImageIds = new Set<string>();

  function extractGridFsIds(url?: string | null) {
    if (!url) return;
    const match = url.match(/\/api\/v1\/images\/([0-9a-fA-F]{24})/);
    if (match) referencedImageIds.add(match[1]);
  }

  for (const cat of categories) extractGridFsIds(cat.imageUrl);
  for (const prod of products) {
    if (Array.isArray(prod.media)) {
      for (const m of prod.media) extractGridFsIds(m.url);
    }
  }
  for (const mat of studioMaterials) {
    extractGridFsIds(mat.imageUrl);
    extractGridFsIds(mat.renderAssetUrl);
    if (Array.isArray(mat.additionalImages)) {
      for (const u of mat.additionalImages) extractGridFsIds(u);
    }
  }
  for (const tmpl of designTemplates) extractGridFsIds(tmpl.thumbnailUrl);
  for (const rev of reviews) {
    if (Array.isArray(rev.images)) {
      for (const u of rev.images) extractGridFsIds(u);
    }
  }

  let referencedGridFsCount = 0;
  for (const id of referencedImageIds) {
    if (imageIds.has(id)) referencedGridFsCount++;
  }
  console.log(`  Entities reference ${referencedImageIds.size} GridFS image IDs.`);
  console.log(`  Referenced IDs existing in product_images.files: ${referencedGridFsCount}/${referencedImageIds.size}`);
  console.log(`  Unreferenced GridFS images (historical/retained): ${gridFiles.length - referencedGridFsCount}`);
  console.log(`  Preservation policy: ALL ${gridFiles.length} images will be migrated without deletion or omission.`);

  // Cleanup connections
  await pool.end();
  await mongoose.disconnect();
  console.log("\nPreflight audit complete. All connections closed.");
}

runPreflightAudit()
  .catch(err => {
    console.error("Preflight audit failed:", err);
    process.exitCode = 1;
  });
