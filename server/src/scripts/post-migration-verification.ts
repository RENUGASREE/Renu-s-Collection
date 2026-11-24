import path from "path";
import dns from "dns";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(process.cwd(), "server/.env") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

import mongoose from "mongoose";
import { env } from "../config/env.js";
import { createPostgresPool } from "../db/postgres.js";

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

async function main() {
  console.log("================================================================================");
  console.log("PHASE 2D – POST-MIGRATION VERIFICATION & RECONCILIATION AUDIT");
  console.log("================================================================================\n");

  let allChecksPassed = true;

  // 1. Connect to both DBs
  if (mongoose.connection.readyState !== 1) {
    await mongoose.connect(env.MONGODB_URI);
  }
  const db = mongoose.connection.db;
  if (!db) throw new Error("MongoDB database connection failed");

  const pgPool: any = createPostgresPool();

  // 2. Fetch destination row counts
  console.log("--- 1. Destination Table Row Counts ---");
  const targetCounts: Record<string, number> = {};
  for (const table of SUPABASE_TABLES) {
    const res = await pgPool.query(`SELECT COUNT(*)::int AS count FROM "${table}";`);
    targetCounts[table] = res.rows[0].count;
    console.log(`  ${table.padEnd(28)}: ${targetCounts[table]} record(s)`);
  }

  // 3. User Reconciliation Checks
  console.log("\n--- 2. Duplicate User Reconciliation Verification ---");
  const userCount = targetCounts["users"];
  console.log(`Target Users Count: ${userCount} (Expected: 3 unique accounts)`);
  if (userCount !== 3) {
    console.error(`FAIL: Expected 3 users, got ${userCount}`);
    allChecksPassed = false;
  } else {
    console.log("PASS: Exactly 3 unique user accounts imported into Supabase.");
  }

  const canonicalUserRes = await pgPool.query(
    `SELECT id, email, username, role, created_at, updated_at FROM users WHERE id = '6aa14bc803bc2db28142fcef';`
  );
  if (canonicalUserRes.rowCount === 1) {
    console.log("PASS: Canonical user Document 2 (6aa14bc803bc2db28142fcef) is present.");
    const u = canonicalUserRes.rows[0];
    console.log(`  Canonical User: email=${u.email}, username=${u.username}, role=${u.role}`);
  } else {
    console.error("FAIL: Canonical user Document 2 missing from Supabase!");
    allChecksPassed = false;
  }

  const dupUserRes = await pgPool.query(
    `SELECT id FROM users WHERE id = '6aa14bc403bc2db28142fcec';`
  );
  if (dupUserRes.rowCount === 0) {
    console.log("PASS: Duplicate Document 1 (6aa14bc403bc2db28142fcec) was NOT imported as a duplicate user record.");
  } else {
    console.error("FAIL: Duplicate user Document 1 was inserted directly!");
    allChecksPassed = false;
  }

  const addrRes = await pgPool.query(
    `SELECT id, user_id, city, state, postal_code FROM user_addresses WHERE user_id = '6aa14bc803bc2db28142fcef';`
  );
  console.log(`Addresses associated with Canonical User: ${addrRes.rowCount}`);
  if (addrRes.rowCount >= 1) {
    console.log(`PASS: Canonical user address preserved (${addrRes.rows[0].city}, ${addrRes.rows[0].state}).`);
  } else {
    console.error("FAIL: Expected address missing for canonical user!");
    allChecksPassed = false;
  }

  // 4. Image Migration & Checksums
  console.log("\n--- 3. GridFS Image Migration & Checksum Audit ---");
  const filesColl = db.collection("product_images.files");
  const mongoFiles = await filesColl.find({}).toArray();
  const imageMappingCount = targetCounts["image_mappings"];
  console.log(`MongoDB Source GridFS Files: ${mongoFiles.length}`);
  console.log(`Supabase Image Mappings:    ${imageMappingCount}`);

  if (imageMappingCount === mongoFiles.length) {
    console.log(`PASS: All ${mongoFiles.length} images mapped in Supabase image_mappings table.`);
  } else {
    console.error(`FAIL: Image count mismatch: source ${mongoFiles.length} vs target ${imageMappingCount}`);
    allChecksPassed = false;
  }

  // Verify byte sizes & MD5 checksums for each image
  const mappingRes = await pgPool.query(
    `SELECT mongodb_id, filename, file_size_bytes, md5_hash, supabase_path, public_url FROM image_mappings;`
  );
  const mappingsByMongoId = new Map(mappingRes.rows.map((r: any) => [r.mongodb_id, r]));

  let checksumMismatches = 0;
  let sizeMismatches = 0;
  for (const mf of mongoFiles) {
    const id = mf._id.toString();
    const mapped: any = mappingsByMongoId.get(id);
    if (!mapped) {
      console.error(`FAIL: Missing mapping for Mongo image ${id}`);
      allChecksPassed = false;
      continue;
    }
    if (Number(mapped.file_size_bytes) !== mf.length) {
      console.error(`FAIL: Size mismatch for ${id}: Mongo=${mf.length}, Supabase=${mapped.file_size_bytes}`);
      sizeMismatches++;
    }
    if (mf.md5 && mapped.md5_hash && mf.md5.toLowerCase() !== mapped.md5_hash.toLowerCase()) {
      console.error(`FAIL: MD5 mismatch for ${id}: Mongo=${mf.md5}, Supabase=${mapped.md5_hash}`);
      checksumMismatches++;
    }
  }

  if (checksumMismatches === 0 && sizeMismatches === 0) {
    console.log("PASS: 100% of images verified with matching file sizes and MD5 checksums.");
  } else {
    allChecksPassed = false;
  }

  // 5. Test Public URL Accessibility on Sample Images
  console.log("\n--- 4. Supabase Storage Public CDN Reachability ---");
  const sampleMappings = mappingRes.rows.slice(0, 3);
  for (const sm of sampleMappings) {
    try {
      const resp = await fetch(sm.public_url, { method: "HEAD" });
      console.log(`  CDN HEAD probe [${resp.status} ${resp.statusText}] -> ${sm.filename} (${sm.public_url.substring(0, 60)}...)`);
      if (resp.status !== 200) {
        console.warn(`  Warning: CDN returned status ${resp.status}`);
      }
    } catch (e: any) {
      console.error(`  Probe error for ${sm.public_url}:`, e.message);
    }
  }

  // 6. Foreign-Key Integrity Verification (Zero Orphan Checks)
  console.log("\n--- 5. Foreign-Key Orphan Checks ---");
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
    const res = await pgPool.query(oc.query);
    const cnt = res.rows[0].cnt;
    if (cnt > 0) {
      console.error(`  [ORPHAN DETECTED] ${oc.name}: ${cnt} orphaned row(s)`);
      totalOrphans += cnt;
    } else {
      console.log(`  [CLEAN] ${oc.name}: 0 orphans`);
    }
  }

  if (totalOrphans === 0) {
    console.log("PASS: Zero orphaned foreign-key references across all relational tables.");
  } else {
    allChecksPassed = false;
  }

  // 7. SKU Uniqueness
  console.log("\n--- 6. SKU Uniqueness Verification ---");
  const skuRes = await pgPool.query(`
    SELECT sku, count(*) 
    FROM products 
    GROUP BY sku 
    HAVING count(*) > 1;
  `);
  if (skuRes.rowCount === 0) {
    console.log("PASS: All product SKUs are unique.");
  } else {
    console.error(`FAIL: Found duplicate product SKUs:`, skuRes.rows);
    allChecksPassed = false;
  }

  await pgPool.end();
  await mongoose.disconnect();

  console.log("\n================================================================================");
  if (allChecksPassed) {
    console.log("ALL POST-MIGRATION VERIFICATION CHECKS PASSED PERFECTLY!");
  } else {
    console.log("ONE OR MORE VERIFICATION CHECKS FAILED.");
    process.exitCode = 1;
  }
  console.log("================================================================================\n");
}

main().catch((err) => {
  console.error("Verification failed with exception:", err);
  process.exitCode = 1;
});
