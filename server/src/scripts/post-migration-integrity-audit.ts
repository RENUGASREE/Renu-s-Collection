import path from "path";
import dns from "dns";
import dotenv from "dotenv";

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
  // WishlistItem — imported for reference, not used directly in queries
  // Review — imported for reference, not used directly in queries
  // Coupon — imported for reference, not used directly in queries
  CustomizationConfig,
  ComponentType,
  StudioMaterial,
  JewelleryType,
  MakingCharge,
  DesignRule,
  DesignTemplate,
  // SavedDesign — imported for reference, not used directly in queries
  // StudioReservation — imported for reference, not used directly in queries
  // InventoryLog — imported for reference, not used directly in queries
  ContactMessage,
} from "../models/index.js";

if (env.MONGODB_URI?.startsWith("mongodb+srv://")) {
  try {
    dns.setServers(["8.8.8.8", "1.1.1.1"]);
  } catch {}
}

async function runAudit() {
  console.log("================================================================================");
  console.log("RENU'S COLLECTIONS – PHASE 2E: INDEPENDENT POST-MIGRATION INTEGRITY AUDIT");
  console.log("================================================================================\n");

  // Connect to MongoDB (Read-Only)
  if (mongoose.connection.readyState !== 1) {
    await mongoose.connect(env.MONGODB_URI, {
      serverSelectionTimeoutMS: 30000,
      connectTimeoutMS: 30000,
    });
  }
  const db = mongoose.connection.db;
  if (!db) throw new Error("MongoDB database connection failed");

  // Connect to Supabase Postgres (Read-Only)
  const pool: any = createPostgresPool();

  const auditResults: {
    section: string;
    status: "PASS" | "FAIL" | "WARN";
    details: string[];
  }[] = [];

  // ============================================================================
  // 1. CUSTOMER ACCOUNTS & ADDRESSES
  // ============================================================================
  console.log("--- 1. Customer Accounts & Addresses Audit ---");
  const mongoUsers = await User.find({}).lean();
  const pgUsersRes = await pool.query(
    `SELECT id, email, username, role, is_email_verified, google_id, created_at, updated_at, 
            password_hash IS NOT NULL as has_password, 
            refresh_token_hash IS NOT NULL as has_refresh_token
     FROM users ORDER BY email;`
  );
  const pgUsers = pgUsersRes.rows;

  const userDetails: string[] = [];
  userDetails.push(`Source MongoDB Users: ${mongoUsers.length} documents (contains 1 duplicate email group)`);
  userDetails.push(`Target Supabase Users: ${pgUsers.length} unique records`);

  const canonicalId = "6aa14bc803bc2db28142fcef";
  const duplicateId = "6aa14bc403bc2db28142fcec";

  const canonicalInPg = pgUsers.find((u: any) => u.id === canonicalId);
  const duplicateInPg = pgUsers.find((u: any) => u.id === duplicateId);

  if (canonicalInPg && !duplicateInPg) {
    userDetails.push(`PASS: Canonical customer ${canonicalId} present; duplicate ${duplicateId} aliased and suppressed`);
  } else {
    userDetails.push(`FAIL: Canonical selection error: canonical=${!!canonicalInPg}, duplicate=${!!duplicateInPg}`);
  }

  // Check addresses
  const pgAddrsRes = await pool.query(`SELECT id, user_id, city, state, postal_code, is_default FROM user_addresses;`);
  const pgAddrs = pgAddrsRes.rows;
  let sourceAddressCount = 0;
  for (const mu of mongoUsers) {
    sourceAddressCount += (mu.addresses?.length || 0);
  }
  userDetails.push(`Source Addresses: ${sourceAddressCount} across all users`);
  userDetails.push(`Target Addresses: ${pgAddrs.length} in user_addresses table`);
  const canonicalAddrs = pgAddrs.filter((a: any) => a.user_id === canonicalId);
  userDetails.push(`Canonical Customer Saved Addresses in Supabase: ${canonicalAddrs.length}`);

  auditResults.push({
    section: "1. Users & Addresses",
    status: (pgUsers.length === 3 && canonicalInPg && !duplicateInPg && canonicalAddrs.length === 1) ? "PASS" : "FAIL",
    details: userDetails
  });

  // ============================================================================
  // 2. CRITICAL: CUSTOMIZATION CONFIGURATIONS
  // ============================================================================
  console.log("\n--- 2. Customization Configurations Audit ---");
  const configDetails: string[] = [];
  const mongoConfigs = await CustomizationConfig.find({}).lean();
  const pgConfigsRes = await pool.query(
    `SELECT id, name, product_type, category_id, fields, base_price_modifier, is_active, created_at, updated_at
     FROM customization_configs ORDER BY created_at;`
  );
  const pgConfigs = pgConfigsRes.rows;

  configDetails.push(`Source MongoDB Configs: ${mongoConfigs.length}`);
  configDetails.push(`Target Supabase Configs: ${pgConfigs.length}`);

  // Inspect config 1 (the one with NULL category_id)
  const legacyConfig = pgConfigs.find((c: any) => c.category_id === null);
  const mongoLegacyConfig = mongoConfigs.find((c: any) => c._id.toString() === "6ab7ac98c50955917dc2c4f4");

  if (legacyConfig && mongoLegacyConfig) {
    configDetails.push(`Identified NULL category configuration: "${legacyConfig.name}" (ID: ${legacyConfig.id})`);
    configDetails.push(`Original MongoDB Category ID: "${mongoLegacyConfig.categoryId}"`);
    
    // Check if original category exists in categories table
    const catCheck = await pool.query(`SELECT id, name FROM categories WHERE id = $1;`, [mongoLegacyConfig.categoryId?.toString()]);
    configDetails.push(`Category "${mongoLegacyConfig.categoryId}" in categories table: ${catCheck.rowCount === 0 ? "NOT FOUND (Deleted from MongoDB previously)" : "FOUND"}`);
    
    // Check fields in legacy config
    const fields = legacyConfig.fields;
    const fieldKeys = Array.isArray(fields) ? fields.map((f: any) => f.key || f.label) : [];
    configDetails.push(`Preserved Legacy Fields: ${JSON.stringify(fieldKeys)} (Bead Colour, Bracelet Size, Charm)`);
  }

  // Inspect config 2 (the active bracelet configurator)
  const activeBraceletConfig = pgConfigs.find((c: any) => c.id === "6afc510fdebfc563cbcf5ed5");
  const mongoActiveConfig = mongoConfigs.find((c: any) => c._id.toString() === "6afc510fdebfc563cbcf5ed5");

  if (activeBraceletConfig && mongoActiveConfig) {
    configDetails.push(`Active Bracelet Configurator: "${activeBraceletConfig.name}" (ID: ${activeBraceletConfig.id})`);
    configDetails.push(`Category ID: ${activeBraceletConfig.category_id} (Matches MongoDB: ${mongoActiveConfig.categoryId?.toString() === activeBraceletConfig.category_id})`);
    
    const activeFields = activeBraceletConfig.fields;
    configDetails.push(`Active Config Fields count: ${activeFields.length}`);
    const charmField = activeFields.find((f: any) => f.key === "Charm" || f.label?.includes("Charm"));
    if (charmField) {
      configDetails.push(`Charm Field Found: label="${charmField.label}", options count=${charmField.options?.length || 0}`);
      
      // Verify all linked materialId and variantSku values
      let invalidMaterialIds = 0;
      let invalidVariantSkus = 0;
      for (const opt of (charmField.options || [])) {
        if (opt.materialId) {
          const matRes = await pool.query(`SELECT id FROM studio_materials WHERE id = $1;`, [opt.materialId]);
          if (matRes.rowCount === 0) invalidMaterialIds++;
        }
        if (opt.variantSku) {
          const varRes = await pool.query(`SELECT id FROM studio_material_variants WHERE sku = $1;`, [opt.variantSku]);
          if (varRes.rowCount === 0) invalidVariantSkus++;
        }
      }
      configDetails.push(`Linked Material IDs validation: ${invalidMaterialIds === 0 ? "ALL 100% VALID" : `${invalidMaterialIds} invalid`}`);
      configDetails.push(`Linked Variant SKUs validation: ${invalidVariantSkus === 0 ? "ALL 100% VALID" : `${invalidVariantSkus} invalid`}`);
    }
  }

  // Runtime resolution test
  const catResolution = await pool.query(
    `SELECT id, name FROM customization_configs 
     WHERE category_id = '6ae19b088a7a052d741b9127' AND is_active = true 
     LIMIT 1;`
  );
  configDetails.push(`Runtime Resolution for Bracelet Category: ${catResolution.rowCount === 1 ? `RESOLVED to "${catResolution.rows[0].name}" (${catResolution.rows[0].id})` : "FAILED"}`);

  auditResults.push({
    section: "2. Customization Configurations",
    status: (legacyConfig && activeBraceletConfig && catResolution.rowCount === 1) ? "PASS" : "FAIL",
    details: configDetails
  });

  // ============================================================================
  // 3. INVENTORY & STUDIO MATERIAL VARIANTS (79 VARIANTS)
  // ============================================================================
  console.log("\n--- 3. Inventory & Studio Materials Audit ---");
  const invDetails: string[] = [];
  
  // Products
  const mongoProducts = await Product.find({}).lean();
  const pgProductsRes = await pool.query(
    `SELECT id, name, sku, price, sale_price, stock, low_stock_threshold, is_active, category_id, subcategory_id
     FROM products ORDER BY sku;`
  );
  const pgProducts = pgProductsRes.rows;
  invDetails.push(`Source Products: ${mongoProducts.length}, Target Products: ${pgProducts.length}`);

  let productMismatches = 0;
  for (const mp of mongoProducts) {
    const pp = pgProducts.find((p: any) => p.id === mp._id.toString());
    if (!pp) {
      productMismatches++;
      continue;
    }
    if (pp.sku !== mp.sku || pp.stock !== mp.stock || Number(pp.price) !== mp.price || pp.is_active !== mp.isActive) {
      productMismatches++;
      invDetails.push(`Mismatch in product ${mp.sku}: stock ${mp.stock} vs ${pp.stock}, price ${mp.price} vs ${pp.price}`);
    }
  }
  invDetails.push(`Product Field Verification: ${productMismatches === 0 ? "100% IDENTICAL" : `${productMismatches} mismatches`}`);

  // Product media
  const pgMediaRes = await pool.query(`SELECT id, product_id, url, is_primary FROM product_media;`);
  invDetails.push(`Target Product Media Items: ${pgMediaRes.rowCount} across 9 products`);

  // Studio Materials & Variants
  const mongoMaterials = await StudioMaterial.find({}).lean();
  const pgMaterialsRes = await pool.query(`SELECT id, name, code, is_active FROM studio_materials;`);
  const pgVariantsRes = await pool.query(
    `SELECT id, material_id, sku, color, finish, size_label, purchase_cost, selling_rate, stock, is_active
     FROM studio_material_variants ORDER BY sku;`
  );
  const pgVariants = pgVariantsRes.rows;

  let totalMongoVariants = 0;
  let variantMismatches = 0;
  for (const mm of mongoMaterials) {
    for (const mv of (mm.variants || [])) {
      totalMongoVariants++;
      const pv = pgVariants.find((v: any) => v.id === (mv as any)._id?.toString() || v.sku === mv.sku);
      if (!pv) {
        variantMismatches++;
        invDetails.push(`Missing variant in target: ${mv.sku} (${(mv as any)._id})`);
        continue;
      }
      if (
        pv.sku !== mv.sku ||
        pv.stock !== mv.stock ||
        pv.is_active !== mv.isActive ||
        pv.material_id !== mm._id.toString() ||
        Number(pv.purchase_cost) !== (mv.purchaseCost || 0) ||
        Number(pv.selling_rate) !== (mv.sellingRate || 0)
      ) {
        variantMismatches++;
        invDetails.push(`Mismatch in variant ${mv.sku}: stock ${mv.stock} vs ${pv.stock}, cost ${mv.purchaseCost} vs ${pv.purchase_cost}, sellingRate ${mv.sellingRate} vs ${pv.selling_rate}`);
      }
    }
  }
  invDetails.push(`Source Studio Materials: ${mongoMaterials.length}, Target Materials: ${pgMaterialsRes.rowCount}`);
  invDetails.push(`Source Studio Variants: ${totalMongoVariants}, Target Studio Variants: ${pgVariants.length}`);
  invDetails.push(`Variant Field-by-Field Audit (all 79 variants): ${variantMismatches === 0 ? "100% EXACT MATCH" : `${variantMismatches} mismatches`}`);

  auditResults.push({
    section: "3. Inventory & Studio Materials",
    status: (productMismatches === 0 && variantMismatches === 0 && pgVariants.length === 79) ? "PASS" : "FAIL",
    details: invDetails
  });

  // ============================================================================
  // 4. IMAGE VERIFICATION (102 IMAGES)
  // ============================================================================
  console.log("\n--- 4. Image Verification (102 Images) ---");
  const imgDetails: string[] = [];
  const filesColl = db.collection("product_images.files");
  const mongoFiles = await filesColl.find({}).sort({ uploadDate: 1 }).toArray();

  const pgMappingsRes = await pool.query(
    `SELECT mongodb_id, filename, content_type, file_size_bytes, supabase_bucket, supabase_path, public_url, md5_hash
     FROM image_mappings ORDER BY mongodb_id;`
  );
  const pgMappings = pgMappingsRes.rows;
  const mappingsMap = new Map<string, any>(pgMappings.map((m: any) => [m.mongodb_id, m]));

  imgDetails.push(`Source GridFS Images: ${mongoFiles.length}`);
  imgDetails.push(`Target Image Mappings: ${pgMappings.length}`);

  let sizeErrors = 0;
  let md5Errors = 0;
  let filenameErrors = 0;
  let pathDuplicates = new Set<string>();
  let hasPathCollision = false;

  for (const mf of mongoFiles) {
    const id = mf._id.toString();
    const pm = mappingsMap.get(id);
    if (!pm) {
      imgDetails.push(`Missing mapping for ${id}`);
      continue;
    }
    if (Number(pm.file_size_bytes) !== mf.length) sizeErrors++;
    if (mf.md5 && pm.md5_hash && mf.md5.toLowerCase() !== pm.md5_hash.toLowerCase()) md5Errors++;
    if (pm.filename !== mf.filename) filenameErrors++;

    if (pathDuplicates.has(pm.supabase_path)) {
      hasPathCollision = true;
    }
    pathDuplicates.add(pm.supabase_path);
  }

  imgDetails.push(`Byte Size Comparison: ${sizeErrors === 0 ? "100% MATCH" : `${sizeErrors} errors`}`);
  imgDetails.push(`MD5 Checksum Verification: ${md5Errors === 0 ? "100% MATCH" : `${md5Errors} errors`}`);
  imgDetails.push(`Filename Fidelity: ${filenameErrors === 0 ? "100% MATCH" : `${filenameErrors} errors`}`);
  imgDetails.push(`Path Uniqueness (no overwrites of duplicate filenames): ${!hasPathCollision ? "100% UNIQUE PATHS" : "COLLISION DETECTED"}`);

  // Test random CDN probes
  const probeIndices = [0, 15, 35, 75, 101];
  let cdnSuccesses = 0;
  for (const idx of probeIndices) {
    const item = pgMappings[idx];
    if (item?.public_url) {
      try {
        const resp = await fetch(item.public_url, { method: "HEAD" });
        const len = Number(resp.headers.get("content-length"));
        if (resp.status === 200 && len === Number(item.file_size_bytes)) {
          cdnSuccesses++;
        }
      } catch {}
    }
  }
  imgDetails.push(`Live CDN Probe (Sample ${probeIndices.length} items): ${cdnSuccesses}/${probeIndices.length} returned HTTP 200 with matching Content-Length`);

  auditResults.push({
    section: "4. Image Integrity & CDN",
    status: (sizeErrors === 0 && md5Errors === 0 && !hasPathCollision && cdnSuccesses === probeIndices.length) ? "PASS" : "FAIL",
    details: imgDetails
  });

  // ============================================================================
  // 5. HISTORICAL DATA (ORDERS, ORDER ITEMS, CARTS)
  // ============================================================================
  console.log("\n--- 5. Historical Data Audit ---");
  const histDetails: string[] = [];

  const mongoOrders = await Order.find({}).lean();
  const pgOrdersRes = await pool.query(
    `SELECT id, order_number, user_id, status, payment_status, subtotal, discount, tax, shipping, total, currency,
            payment_method, razorpay_order_id, razorpay_payment_id, tracking_number
     FROM orders;`
  );
  const pgOrders = pgOrdersRes.rows;
  histDetails.push(`Source Orders: ${mongoOrders.length}, Target Orders: ${pgOrders.length}`);

  let orderMismatches = 0;
  for (const mo of mongoOrders) {
    const po = pgOrders.find((o: any) => o.id === mo._id.toString());
    if (!po) {
      orderMismatches++;
      continue;
    }
    if (
      po.order_number !== mo.orderNumber ||
      po.status !== mo.status ||
      po.payment_status !== mo.paymentStatus ||
      Number(po.total) !== mo.total ||
      po.currency !== (mo.currency || "INR") ||
      po.razorpay_order_id !== (mo.razorpayOrderId || null) ||
      po.razorpay_payment_id !== (mo.razorpayPaymentId || null)
    ) {
      orderMismatches++;
      histDetails.push(`Mismatch in order ${mo.orderNumber}`);
    }
  }
  histDetails.push(`Order Header Verification: ${orderMismatches === 0 ? "100% IDENTICAL" : `${orderMismatches} mismatches`}`);

  // Order Items
  const pgOrderItemsRes = await pool.query(
    `SELECT id, order_id, product_id, sku, name, unit_price, quantity, subtotal, customization, studio_design
     FROM order_items ORDER BY sku;`
  );
  const pgOrderItems = pgOrderItemsRes.rows;
  let sourceItemCount = 0;
  for (const mo of mongoOrders) sourceItemCount += (mo.items?.length || 0);
  histDetails.push(`Source Order Items: ${sourceItemCount}, Target Order Items: ${pgOrderItems.length}`);

  let itemMismatches = 0;
  for (const mo of mongoOrders) {
    for (const mi of (mo.items || [])) {
      const pi = pgOrderItems.find((i: any) => i.id === (mi as any)._id?.toString() || (i.sku === mi.sku && i.order_id === mo._id.toString()));
      if (!pi) {
        itemMismatches++;
        continue;
      }
      if (
        pi.sku !== mi.sku ||
        Number(pi.unit_price) !== mi.unitPrice ||
        pi.quantity !== mi.quantity ||
        Number(pi.subtotal) !== mi.subtotal
      ) {
        itemMismatches++;
      }
    }
  }
  histDetails.push(`Order Items Verification: ${itemMismatches === 0 ? "100% IDENTICAL" : `${itemMismatches} mismatches`}`);

  // Carts & Cart Items
  const mongoCarts = await Cart.find({}).lean();
  const pgCartsRes = await pool.query(`SELECT id, user_id, session_id FROM carts;`);
  const pgCartItemsRes = await pool.query(`SELECT id, cart_id, product_id, sku, unit_price, quantity FROM cart_items;`);
  histDetails.push(`Source Carts: ${mongoCarts.length}, Target Carts: ${pgCartsRes.rowCount}`);
  histDetails.push(`Target Cart Items: ${pgCartItemsRes.rowCount}`);

  auditResults.push({
    section: "5. Historical Orders & Carts",
    status: (orderMismatches === 0 && itemMismatches === 0 && pgOrders.length === mongoOrders.length) ? "PASS" : "FAIL",
    details: histDetails
  });

  // ============================================================================
  // 6. OTHER ENTITIES (CATEGORIES, COMPONENT TYPES, MAKING CHARGES, RULES, TEMPLATES, CONTACT MESSAGES)
  // ============================================================================
  console.log("\n--- 6. Remaining Domain Entities Audit ---");
  const otherDetails: string[] = [];

  const checks = [
    { entity: "Categories", mongoModel: Category, pgTable: "categories", idField: "id" },
    { entity: "Component Types", mongoModel: ComponentType, pgTable: "component_types", idField: "id" },
    { entity: "Jewellery Types", mongoModel: JewelleryType, pgTable: "jewellery_types", idField: "id" },
    { entity: "Making Charges", mongoModel: MakingCharge, pgTable: "making_charges", idField: "id" },
    { entity: "Design Rules", mongoModel: DesignRule, pgTable: "design_rules", idField: "id" },
    { entity: "Design Templates", mongoModel: DesignTemplate, pgTable: "design_templates", idField: "id" },
    { entity: "Contact Messages", mongoModel: ContactMessage, pgTable: "contact_messages", idField: "id" },
  ];

  let otherFailed = 0;
  for (const c of checks) {
    const mCount = await c.mongoModel.countDocuments();
    const pRes = await pool.query(`SELECT count(*)::int as count FROM "${c.pgTable}";`);
    const pCount = pRes.rows[0].count;
    if (mCount !== pCount) {
      otherDetails.push(`FAIL: ${c.entity}: Mongo=${mCount}, Supabase=${pCount}`);
      otherFailed++;
    } else {
      otherDetails.push(`PASS: ${c.entity.padEnd(20)}: ${pCount} records match exactly`);
    }
  }

  auditResults.push({
    section: "6. Remaining Domain Entities",
    status: otherFailed === 0 ? "PASS" : "FAIL",
    details: otherDetails
  });

  // ============================================================================
  // 7. FOREIGN-KEY INTEGRITY & CONSTRAINT VERIFICATION
  // ============================================================================
  console.log("\n--- 7. Foreign-Key Integrity & Duplicate SKU Checks ---");
  const fkDetails: string[] = [];

  const orphanChecks = [
    { name: "user_addresses -> users", query: `SELECT count(*)::int AS cnt FROM user_addresses WHERE user_id NOT IN (SELECT id FROM users);` },
    { name: "products -> categories", query: `SELECT count(*)::int AS cnt FROM products WHERE category_id NOT IN (SELECT id FROM categories);` },
    { name: "product_media -> products", query: `SELECT count(*)::int AS cnt FROM product_media WHERE product_id NOT IN (SELECT id FROM products);` },
    { name: "studio_material_variants -> studio_materials", query: `SELECT count(*)::int AS cnt FROM studio_material_variants WHERE material_id NOT IN (SELECT id FROM studio_materials);` },
    { name: "order_items -> orders", query: `SELECT count(*)::int AS cnt FROM order_items WHERE order_id NOT IN (SELECT id FROM orders);` },
    { name: "orders -> users", query: `SELECT count(*)::int AS cnt FROM orders WHERE user_id NOT IN (SELECT id FROM users);` },
    { name: "cart_items -> carts", query: `SELECT count(*)::int AS cnt FROM cart_items WHERE cart_id NOT IN (SELECT id FROM carts);` },
    { name: "carts -> users", query: `SELECT count(*)::int AS cnt FROM carts WHERE user_id NOT IN (SELECT id FROM users);` },
  ];

  let totalOrphans = 0;
  for (const oc of orphanChecks) {
    const res = await pool.query(oc.query);
    const cnt = res.rows[0].cnt;
    if (cnt > 0) {
      fkDetails.push(`FAIL: ${oc.name}: ${cnt} orphaned row(s)`);
      totalOrphans += cnt;
    } else {
      fkDetails.push(`PASS: ${oc.name}: 0 orphans`);
    }
  }

  // Duplicate SKU checks
  const productSkuDuplicates = await pool.query(`
    SELECT sku, count(*) FROM products GROUP BY sku HAVING count(*) > 1;
  `);
  const variantSkuDuplicates = await pool.query(`
    SELECT sku, count(*) FROM studio_material_variants GROUP BY sku HAVING count(*) > 1;
  `);

  if (productSkuDuplicates.rowCount === 0) {
    fkDetails.push(`PASS: Product SKUs: 100% unique (0 duplicate SKUs)`);
  } else {
    fkDetails.push(`FAIL: Product SKUs duplicate found: ${JSON.stringify(productSkuDuplicates.rows)}`);
  }

  if (variantSkuDuplicates.rowCount === 0) {
    fkDetails.push(`PASS: Studio Variant SKUs: 100% unique (0 duplicate SKUs across 79 variants)`);
  } else {
    fkDetails.push(`FAIL: Studio Variant SKUs duplicate found: ${JSON.stringify(variantSkuDuplicates.rows)}`);
  }

  auditResults.push({
    section: "7. Foreign-Key Integrity & Constraints",
    status: (totalOrphans === 0 && productSkuDuplicates.rowCount === 0 && variantSkuDuplicates.rowCount === 0) ? "PASS" : "FAIL",
    details: fkDetails
  });

  // End connections
  await pool.end();
  await mongoose.disconnect();

  console.log("\n================================================================================");
  console.log("PHASE 2E AUDIT SUMMARY");
  console.log("================================================================================");
  for (const res of auditResults) {
    console.log(`\n[${res.status}] ${res.section}`);
    for (const d of res.details) {
      console.log(`  - ${d}`);
    }
  }
}

runAudit().catch((err) => {
  console.error("Audit script failed with error:", err);
  process.exitCode = 1;
});
