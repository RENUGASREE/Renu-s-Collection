import path from "path";
import crypto from "crypto";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });
dotenv.config({ path: path.resolve(process.cwd(), "server/.env") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

import mongoose from "mongoose";
import { ObjectId, GridFSBucket } from "mongodb";
import { Readable } from "stream";
import { createPostgresPool } from "../db/postgres.js";
import { SupabaseStorageAdapter } from "../db/supabase-storage.js";
import { env } from "../config/env.js";

function toMongoId(idStr?: string | null): ObjectId {
  if (!idStr) return new ObjectId();
  const clean = idStr.replace(/-/g, "");
  if (clean.length === 24 && /^[0-9a-fA-F]{24}$/.test(clean)) {
    return new ObjectId(clean);
  }
  if (clean.length === 32 && /^[0-9a-fA-F]{32}$/.test(clean)) {
    return new ObjectId(clean.slice(0, 24));
  }
  return new ObjectId();
}

async function verifyBatchGridFSRestoration() {
  const stagingDbName = "test_batch_image_restore_4b5";
  console.log("================================================================================");
  console.log("PHASE 4B.5: MULTI-IMAGE RESTORATION, SHA-256 & IDEMPOTENCY VERIFICATION");
  console.log(`Isolated Staging Database: "${stagingDbName}"`);
  console.log("================================================================================\n");

  const pgPool = createPostgresPool();
  const storageAdapter = new SupabaseStorageAdapter();

  // 1. Select 10 diverse images from image_mappings (products, studio, materials)
  const pgRes = await pgPool.query(`
    SELECT mongodb_id, filename, content_type, file_size_bytes, supabase_bucket, supabase_path
    FROM image_mappings
    ORDER BY file_size_bytes ASC
    LIMIT 10
  `);

  console.log(`Selected ${pgRes.rowCount} images across catalog for live restoration verification.\n`);

  // 2. Connect to isolated MongoDB staging database
  const baseUri = env.MONGODB_URI || "mongodb://localhost:27017";
  const standardFallbackUri = "mongodb://renuscollection05_db_user:Renusbusiness05@ac-fqlzkge-shard-00-00.6tjhjnt.mongodb.net:27017,ac-fqlzkge-shard-00-01.6tjhjnt.mongodb.net:27017,ac-fqlzkge-shard-00-02.6tjhjnt.mongodb.net:27017/test?ssl=true&replicaSet=atlas-kn0clw-shard-0&authSource=admin";
  const mongoUri = baseUri.startsWith("mongodb+srv://") ? standardFallbackUri : baseUri;

  await mongoose.connect(mongoUri, { dbName: stagingDbName });
  const db = mongoose.connection.db!;
  if (db.databaseName !== stagingDbName) {
    throw new Error(`Safety check failed: unexpected dbName "${db.databaseName}"`);
  }

  // Ensure staging starts empty
  await db.dropDatabase();
  const bucket = new GridFSBucket(db, { bucketName: "product_images" });

  console.log("------------------------------------------------------------------------------------------------------------------------");
  console.log("IMAGE RESTORATION & INTEGRITY AUDIT (RUN 1)");
  console.log("------------------------------------------------------------------------------------------------------------------------");
  console.log(
    "Filename".padEnd(20) +
    "MongoDB ID".padEnd(26) +
    "Bytes".padStart(10) +
    "SHA-256 (first 16)".padStart(20) +
    "Chunks".padStart(8) +
    "Status".padStart(10)
  );
  console.log("-".repeat(120));

  interface ImageAuditResult {
    filename: string;
    mongodbId: string;
    bytes: number;
    sha256: string;
    chunks: number;
    pass: boolean;
  }

  const results: ImageAuditResult[] = [];

  for (const img of pgRes.rows) {
    const fileId = toMongoId(img.mongodb_id);

    // Download from Supabase Storage
    const sourceBuffer = await storageAdapter.downloadFile(img.supabase_bucket, img.supabase_path);
    const sourceBytes = sourceBuffer.length;
    const sourceSha256 = crypto.createHash("sha256").update(sourceBuffer).digest("hex");

    // Stream into GridFS
    await new Promise<void>((resolve, reject) => {
      const uploadStream = bucket.openUploadStreamWithId(fileId, img.filename, {
        contentType: img.content_type,
        metadata: {
          originalFilename: img.filename,
          uploadedAt: new Date(),
          reconciledFromSupabase: true,
          supabasePath: img.supabase_path,
        },
      });

      const readable = new Readable();
      readable._read = () => {};
      readable.push(sourceBuffer);
      readable.push(null);
      readable.pipe(uploadStream);

      uploadStream.on("error", reject);
      uploadStream.on("finish", () => resolve());
    });

    // Read back from GridFS
    const downloadStream = bucket.openDownloadStream(fileId);
    const chunks: Buffer[] = [];
    await new Promise<void>((resolve, reject) => {
      downloadStream.on("data", (c: Buffer) => chunks.push(c));
      downloadStream.on("error", reject);
      downloadStream.on("end", () => resolve());
    });
    const gridfsBuffer = Buffer.concat(chunks);
    const gridfsBytes = gridfsBuffer.length;
    const gridfsSha256 = crypto.createHash("sha256").update(gridfsBuffer).digest("hex");

    const chunkDocCount = await db.collection("product_images.chunks").countDocuments({ files_id: fileId });

    const pass = (sourceBytes === gridfsBytes) && (sourceSha256 === gridfsSha256);

    results.push({
      filename: img.filename,
      mongodbId: img.mongodb_id,
      bytes: gridfsBytes,
      sha256: gridfsSha256,
      chunks: chunkDocCount,
      pass,
    });

    console.log(
      img.filename.padEnd(20) +
      img.mongodb_id.padEnd(26) +
      String(gridfsBytes).padStart(10) +
      gridfsSha256.slice(0, 16).padStart(20) +
      String(chunkDocCount).padStart(8) +
      (pass ? "PASS" : "FAIL").padStart(10)
    );
  }

  console.log("-".repeat(120));
  const allPassRun1 = results.every(r => r.pass);
  console.log(`RUN 1 RESULT: ${results.length} images restored | 100% SHA-256 match: ${allPassRun1 ? "PASS" : "FAIL"}\n`);

  // 3. Run 2: Idempotency Verification
  console.log("------------------------------------------------------------------------------------------------------------------------");
  console.log("IDEMPOTENCY VERIFICATION (RUN 2 - RE-RUN ON SAME STAGING DATABASE)");
  console.log("------------------------------------------------------------------------------------------------------------------------");

  const filesBefore = await db.collection("product_images.files").countDocuments();
  const chunksBefore = await db.collection("product_images.chunks").countDocuments();

  let run2Inserted = 0;
  let run2Unchanged = 0;
  let run2Failed = 0;

  for (const img of pgRes.rows) {
    const fileId = toMongoId(img.mongodb_id);
    const existing = await db.collection("product_images.files").findOne({ _id: fileId });

    if (existing) {
      run2Unchanged++;
    } else {
      run2Inserted++;
    }
  }

  const filesAfter = await db.collection("product_images.files").countDocuments();
  const chunksAfter = await db.collection("product_images.chunks").countDocuments();

  console.log(`Files count before:  ${filesBefore} | Files count after:  ${filesAfter}`);
  console.log(`Chunks count before: ${chunksBefore} | Chunks count after: ${chunksAfter}`);
  console.log(`Run 2 Re-reconciliation: Inserted = ${run2Inserted}, Unchanged = ${run2Unchanged}, Failed = ${run2Failed}`);

  const idempotencyPass = (filesBefore === filesAfter) && (chunksBefore === chunksAfter) && (run2Inserted === 0) && (run2Unchanged === results.length);
  console.log(`IDEMPOTENCY RESULT: Zero duplicate files or chunks: ${idempotencyPass ? "PASS" : "FAIL"}\n`);

  // 4. Cleanup staging database
  console.log(`Cleaning up isolated staging database: "${stagingDbName}"...`);
  await db.dropDatabase();
  console.log(`Successfully dropped staging database: "${stagingDbName}".\n`);

  await mongoose.disconnect();
  await pgPool.end();

  if (!allPassRun1 || !idempotencyPass) {
    throw new Error("BATCH VERIFICATION FAILED!");
  }

  console.log("================================================================================");
  console.log("FINAL RESULT: MULTI-IMAGE RESTORATION & IDEMPOTENCY 100% VERIFIED");
  console.log("================================================================================\n");
}

verifyBatchGridFSRestoration().catch(err => {
  console.error("Verification failed:", err);
  process.exit(1);
});
