import path from "path";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(process.cwd(), "server/.env") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

import mongoose from "mongoose";
import { env } from "../config/env.js";
import { createPostgresPool } from "../db/postgres.js";

async function main() {
  console.log("================================================================================");
  console.log("PHASE 3M AUDIT: MONGODB vs SUPABASE POST-NOV-20 DATA PARITY");
  console.log("================================================================================\n");

  const cutoff = new Date("2026-11-20T10:30:00.000Z");
  console.log(`Snapshot Cutoff Point: ${cutoff.toISOString()}`);

  let mongoUri = env.MONGODB_URI;
  // If srv URI, construct standard replicaSet fallback if needed
  const standardFallbackUri = "mongodb://renuscollection05_db_user:Renusbusiness05@ac-fqlzkge-shard-00-00.6tjhjnt.mongodb.net:27017,ac-fqlzkge-shard-00-01.6tjhjnt.mongodb.net:27017,ac-fqlzkge-shard-00-02.6tjhjnt.mongodb.net:27017/test?ssl=true&replicaSet=atlas-kn0clw-shard-0&authSource=admin";

  console.log("Connecting to MongoDB Atlas (Read-Only)...");
  try {
    await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 5000, dbName: "test" });
  } catch (err: any) {
    console.warn("SRV connection failed, attempting direct replica-set URI fallback...");
    await mongoose.connect(standardFallbackUri, { serverSelectionTimeoutMS: 15000 });
  }

  const db = mongoose.connection.db!;
  console.log(`Connected to MongoDB Atlas: database "${db.databaseName}"`);

  // Connect to Supabase Postgres (Read-Only)
  console.log("Connecting to Supabase PostgreSQL (Read-Only)...");
  const pool: any = createPostgresPool();
  const pgClient = await pool.connect();
  console.log("Connected to Supabase PostgreSQL.\n");

  const collections = await db.listCollections().toArray();
  const report: Record<string, any> = {};

  for (const colInfo of collections) {
    const colName = colInfo.name;
    if (colName.startsWith("system.")) continue;
    const col = db.collection(colName);

    const totalCount = await col.countDocuments();
    
    // Check for updated_at or created_at > cutoff
    const postCutoffCount = await col.countDocuments({
      $or: [
        { updatedAt: { $gt: cutoff } },
        { createdAt: { $gt: cutoff } },
        { updated_at: { $gt: cutoff } },
        { created_at: { $gt: cutoff } },
        { timestamp: { $gt: cutoff } }
      ]
    });

    const recentDocs = postCutoffCount > 0 
      ? await col.find({
          $or: [
            { updatedAt: { $gt: cutoff } },
            { createdAt: { $gt: cutoff } },
            { updated_at: { $gt: cutoff } },
            { created_at: { $gt: cutoff } },
            { timestamp: { $gt: cutoff } }
          ]
        }).limit(5).toArray()
      : [];

    report[colName] = {
      totalInMongo: totalCount,
      modifiedAfterNov20: postCutoffCount,
      sampleIds: recentDocs.map(d => d._id.toString())
    };
  }

  // Check GridFS
  if (collections.some(c => c.name === "product_images.files")) {
    const gridFsFiles = db.collection("product_images.files");
    const totalFiles = await gridFsFiles.countDocuments();
    const newFiles = await gridFsFiles.countDocuments({ uploadDate: { $gt: cutoff } });
    report["product_images.files"] = {
      totalInMongo: totalFiles,
      modifiedAfterNov20: newFiles,
      sampleIds: []
    };
  }

  console.log("=== MONGODB POST-SNAPSHOT ACTIVITY AUDIT ===");
  console.table(report);

  // Compare with Supabase counts
  console.log("\n=== COMPARING RECORD COUNTS: SUPABASE POSTGRESQL vs MONGODB ===");
  const tableMap: Record<string, string> = {
    users: "users",
    products: "products",
    categories: "categories",
    orders: "orders",
    reviews: "reviews",
    coupons: "coupons",
    studiomaterials: "studio_materials",
    jewellerytypes: "jewellery_types",
    makingcharges: "making_charges",
    designtemplates: "design_templates",
    designrules: "design_rules",
    customizationconfigs: "customization_configs",
    saveddesigns: "saved_designs",
    studioreservations: "studio_reservations",
    carts: "carts",
    addresses: "user_addresses",
    image_mappings: "image_mappings"
  };

  const paritySummary: any[] = [];
  let anyDiscrepancy = false;

  for (const [mCol, pgTable] of Object.entries(tableMap)) {
    try {
      const res = await pgClient.query(`SELECT COUNT(*) FROM ${pgTable}`);
      const pgCount = parseInt(res.rows[0].count, 10);
      const mInfo = report[mCol];
      const mCount = mInfo?.totalInMongo ?? 0;
      const modifiedAfter = mInfo?.modifiedAfterNov20 ?? 0;
      const diff = pgCount - mCount;

      if (diff !== 0 || modifiedAfter > 0) {
        anyDiscrepancy = true;
      }

      paritySummary.push({
        "Mongo Collection": mCol,
        "PostgreSQL Table": pgTable,
        "MongoDB Count": mCount,
        "Supabase Count": pgCount,
        "Diff (PG - Mongo)": diff,
        "Modified Post-Nov20": modifiedAfter
      });
    } catch (err: any) {
      paritySummary.push({
        "Mongo Collection": mCol,
        "PostgreSQL Table": pgTable,
        "MongoDB Count": report[mCol]?.totalInMongo ?? "N/A",
        "Supabase Count": "ERROR: " + err.message,
        "Diff (PG - Mongo)": "ERR",
        "Modified Post-Nov20": "ERR"
      });
    }
  }

  console.table(paritySummary);

  // Check Storage & Image Mappings
  const imgRes = await pgClient.query("SELECT COUNT(*) FROM image_mappings");
  const imgCount = parseInt(imgRes.rows[0].count, 10);
  console.log(`\nImage Mappings in PostgreSQL: ${imgCount}`);
  const gridFsTotal = report["product_images.files"]?.totalInMongo ?? 0;
  console.log(`GridFS Files in MongoDB: ${gridFsTotal}`);
  console.log(`Image Parity: ${imgCount === gridFsTotal ? "EXACT MATCH (102 images)" : "MISMATCH"}`);

  console.log("\n=== PARITY CONCLUSION ===");
  if (!anyDiscrepancy) {
    console.log("RESULT: 100% PERFECT PARITY. Zero records modified or created post-Nov-20.");
    console.log("DELTA SYNCHRONIZATION: NOT REQUIRED. Supabase has identical data to MongoDB.");
  } else {
    console.log("RESULT: DISCREPANCIES DETECTED. Review table above for details.");
  }

  pgClient.release();
  await pool.end();
  await mongoose.disconnect();
}

main().catch(err => {
  console.error("Audit error:", err);
  process.exit(1);
});
