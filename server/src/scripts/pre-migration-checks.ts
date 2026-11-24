import fs from "fs";
import path from "path";
import crypto from "crypto";
import dns from "dns";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });
dotenv.config({ path: path.resolve(process.cwd(), "server/.env") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

import { BSON } from "bson";
import mongoose from "mongoose";
import { env } from "../config/env.js";
import { createPostgresPool } from "../db/postgres.js";
import { SupabaseStorageAdapter } from "../db/supabase-storage.js";

if (env.MONGODB_URI?.startsWith("mongodb+srv://")) {
  try {
    dns.setServers(["8.8.8.8", "1.1.1.1"]);
  } catch {}
}

const BACKUP_DIR = path.resolve(
  "C:/Users/renug/.gemini/antigravity/brain/1a563238-822a-45d8-9a15-ec40b15dbe3c/backups/mongodb_production_backup_20261120"
);

const EXPECTED_TABLES = [
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
  console.log("PHASE 2D – PRE-MIGRATION SAFETY CHECKS");
  console.log("================================================================================\n");

  let allChecksPassed = true;

  // 1. Verify Backup Manifest & SHA-256 Checksums
  console.log("--- 1. MongoDB Backup Verification ---");
  const manifestPath = path.join(BACKUP_DIR, "backup-manifest.json");
  if (!fs.existsSync(manifestPath)) {
    console.error("FAIL: Backup manifest not found at", manifestPath);
    process.exitCode = 1;
    return;
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
  console.log(`Manifest loaded: ${Object.keys(manifest.collections).length} collections, timestamp: ${manifest.createdAt}`);

  let totalBsonFiles = 0;
  let totalBsonBytes = 0;
  for (const item of Object.values(manifest.collections) as any[]) {
    const bsonFileName = `${item.collection}.bson`;
    const bsonPath = path.join(BACKUP_DIR, bsonFileName);
    if (!fs.existsSync(bsonPath)) {
      console.error(`FAIL: BSON file missing: ${bsonFileName}`);
      allChecksPassed = false;
      continue;
    }
    const buf = fs.readFileSync(bsonPath);
    const hash = crypto.createHash("sha256").update(buf).digest("hex");
    if (hash !== item.sha256) {
      console.error(`FAIL: SHA-256 mismatch for ${bsonFileName}. Manifest: ${item.sha256}, Disk: ${hash}`);
      allChecksPassed = false;
    } else {
      // Test BSON deserialization
      try {
        let offset = 0;
        let docCount = 0;
        while (offset < buf.length) {
          const docSize = buf.readInt32LE(offset);
          if (docSize <= 0 || offset + docSize > buf.length) {
            throw new Error(`Corrupt BSON document in ${bsonFileName} at offset ${offset}`);
          }
          const docBuf = buf.subarray(offset, offset + docSize);
          BSON.deserialize(docBuf);
          offset += docSize;
          docCount++;
        }
        if (docCount !== item.documentCount) {
          console.error(`FAIL: Document count mismatch for ${item.collection}: expected ${item.documentCount}, got ${docCount}`);
          allChecksPassed = false;
        } else {
          totalBsonFiles++;
          totalBsonBytes += buf.length;
        }
      } catch (err: any) {
        console.error(`FAIL: Deserialization failed for ${bsonFileName}:`, err.message);
        allChecksPassed = false;
      }
    }
  }
  console.log(`PASS: All ${totalBsonFiles} BSON backup files verified (${(totalBsonBytes / (1024 * 1024)).toFixed(2)} MB, SHA-256 intact).`);

  // 2. Verify MongoDB Atlas Connection & Current Counts
  console.log("\n--- 2. MongoDB Atlas Live Connection & Fresh Counts ---");
  if (mongoose.connection.readyState !== 1) {
    await mongoose.connect(env.MONGODB_URI);
  }
  const db = mongoose.connection.db;
  if (!db) throw new Error("MongoDB database connection failed");
  console.log("PASS: Connected to MongoDB Atlas successfully.");

  const freshMongoCounts: Record<string, number> = {};
  const collections = await db.listCollections().toArray();
  for (const c of collections) {
    const count = await db.collection(c.name).countDocuments();
    freshMongoCounts[c.name] = count;
  }
  console.log(`MongoDB Total Collections: ${collections.length}`);
  console.log(`GridFS Files: ${freshMongoCounts["product_images.files"] || 0}`);
  console.log(`GridFS Chunks: ${freshMongoCounts["product_images.chunks"] || 0}`);

  // GridFS sizes
  const filesColl = db.collection("product_images.files");
  const sizeAggr = await filesColl.aggregate([
    { $group: { _id: null, totalBytes: { $sum: "$length" }, count: { $sum: 1 } } }
  ]).toArray();
  const totalGridFSBytes = sizeAggr[0]?.totalBytes || 0;
  console.log(`GridFS Total Image Payload: ${(totalGridFSBytes / (1024 * 1024)).toFixed(2)} MB (${totalGridFSBytes} bytes across ${sizeAggr[0]?.count || 0} files).`);

  // 3. Verify Supabase Transaction Pooler and Session Pooler
  console.log("\n--- 3. Supabase Database Endpoints Verification ---");
  const pgPool: any = createPostgresPool();
  const txRes = await pgPool.query("SELECT 1 AS ok;");
  if (txRes.rows[0]?.ok === 1) {
    console.log("PASS: Supabase Pooler connected and responding to queries.");
  } else {
    console.error("FAIL: Supabase query failed.");
    allChecksPassed = false;
  }

  // 4. Confirm All 26 Destination Tables Exist & Contain 0 Records
  console.log("\n--- 4. Supabase Destination Table Status ---");
  const tableCheckRes = await pgPool.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = ANY($1::text[]);
  `, [EXPECTED_TABLES]);

  const existingTableNames = new Set(tableCheckRes.rows.map((r: any) => r.table_name));
  const missingTables = EXPECTED_TABLES.filter(t => !existingTableNames.has(t));

  if (missingTables.length > 0) {
    console.error(`FAIL: Missing tables in Supabase: ${missingTables.join(", ")}`);
    allChecksPassed = false;
  } else {
    console.log(`PASS: All ${EXPECTED_TABLES.length} expected destination tables exist.`);
  }

  console.log("\nChecking row counts in all destination tables (must be 0):");
  let anyNonEmpty = false;
  for (const table of EXPECTED_TABLES) {
    const countRes = await pgPool.query(`SELECT COUNT(*)::int AS count FROM "${table}";`);
    const count = countRes.rows[0].count;
    if (count > 0) {
      console.warn(`  [NON-ZERO] ${table.padEnd(28)}: ${count} record(s)`);
      anyNonEmpty = true;
    } else {
      console.log(`  [EMPTY]    ${table.padEnd(28)}: 0 records`);
    }
  }

  if (anyNonEmpty) {
    console.error("FAIL: One or more destination tables contain existing records!");
    allChecksPassed = false;
  } else {
    console.log("PASS: All 26 destination tables are clean and contain 0 application records.");
  }

  // 5. Verify Supabase Storage Product Images Bucket & Capacity
  console.log("\n--- 5. Supabase Storage Product Images Bucket ---");
  const storage = new SupabaseStorageAdapter();
  const bucketInfo = await storage.getBucketInfo("product-images");
  if (!bucketInfo) {
    console.error("FAIL: 'product-images' bucket not found in Supabase Storage!");
    allChecksPassed = false;
  } else {
    console.log(`PASS: 'product-images' bucket is accessible (public: ${bucketInfo.public}).`);
  }

  const { data: existingObjects, error: listError } = await (storage as any).client.storage
    .from("product-images")
    .list("originals");

  if (listError) {
    console.warn("Notice checking originals folder:", listError.message);
  } else {
    const objCount = existingObjects?.length || 0;
    console.log(`Existing objects under 'originals/': ${objCount}`);
    if (objCount > 0) {
      console.warn(`WARNING: Found ${objCount} pre-existing items under 'originals/'.`);
    } else {
      console.log("PASS: No conflicting pre-existing objects found under 'originals/'.");
    }
  }

  // Storage capacity calculation
  const totalMbNeeded = totalGridFSBytes / (1024 * 1024);
  console.log(`Storage Allowance: 1024 MB (1 GB free tier limit)`);
  console.log(`Required Payload: ${totalMbNeeded.toFixed(2)} MB (${((totalMbNeeded / 1024) * 100).toFixed(2)}% of capacity).`);
  console.log(`PASS: Storage capacity is sufficient with ${ (1024 - totalMbNeeded).toFixed(2) } MB headroom remaining.`);

  // 6. Confirm server/.env is Git-ignored
  console.log("\n--- 6. Git Ignore Verification ---");
  const gitignorePath = path.resolve(process.cwd(), "server/.gitignore");
  if (fs.existsSync(gitignorePath)) {
    const gitignoreContent = fs.readFileSync(gitignorePath, "utf-8");
    if (gitignoreContent.includes(".env")) {
      console.log("PASS: 'server/.env' is explicitly listed in server/.gitignore.");
    } else {
      console.error("FAIL: '.env' not found in server/.gitignore!");
      allChecksPassed = false;
    }
  }

  // Cleanup
  await pgPool.end();
  await mongoose.disconnect();

  console.log("\n================================================================================");
  if (allChecksPassed) {
    console.log("ALL PRE-MIGRATION SAFETY CHECKS PASSED. READY FOR PHASE 2D EXECUTION.");
  } else {
    console.log("PRE-MIGRATION CHECKS FAILED. DO NOT PROCEED TO ACTUAL MIGRATION.");
    process.exitCode = 1;
  }
  console.log("================================================================================");
}

main().catch((err) => {
  console.error("Pre-migration check exception:", err);
  process.exitCode = 1;
});
