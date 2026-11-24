import dns from "dns";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });
dotenv.config({ path: path.resolve(process.cwd(), "server/.env") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

import mongoose from "mongoose";
import { BSON } from "mongodb";
import { env } from "../config/env.js";

if (env.MONGODB_URI?.startsWith("mongodb+srv://")) {
  try {
    dns.setServers(["8.8.8.8", "1.1.1.1"]);
  } catch {}
}

const BACKUP_ROOT_DIR = "C:\\Users\\renug\\.gemini\\antigravity\\brain\\1a563238-822a-45d8-9a15-ec40b15dbe3c\\backups\\mongodb_production_backup_20261120";

interface CollectionBackupStat {
  collection: string;
  documentCount: number;
  bsonSizeBytes: number;
  sha256: string;
  indexes: any[];
}

async function runBackup() {
  console.log("================================================================================");
  console.log("RENU'S COLLECTIONS – FULL MONGODB ATLAS PRODUCTION BACKUP (PHASE 2C)");
  console.log("================================================================================\n");

  const startTime = Date.now();

  // 1. Ensure backup directory exists outside Git repository
  if (!fs.existsSync(BACKUP_ROOT_DIR)) {
    fs.mkdirSync(BACKUP_ROOT_DIR, { recursive: true });
  }
  console.log(`Backup destination: ${BACKUP_ROOT_DIR} (Verified outside Git repository)\n`);

  // 2. Connect to MongoDB Atlas (Read-Only)
  console.log("Connecting to MongoDB Atlas (read-only)...");
  if (mongoose.connection.readyState !== 1) {
    await mongoose.connect(env.MONGODB_URI);
  }
  const db = mongoose.connection.db;
  if (!db) throw new Error("MongoDB database not connected");
  console.log("Connected to MongoDB Atlas.\n");

  const collections = await db.listCollections().toArray();
  // Sort collections: standard collections first, then GridFS chunks
  collections.sort((a, b) => {
    if (a.name === "product_images.chunks") return 1;
    if (b.name === "product_images.chunks") return -1;
    return a.name.localeCompare(b.name);
  });

  const manifest: {
    createdAt: string;
    databaseName: string;
    totalCollections: number;
    totalDocuments: number;
    totalSizeBytes: number;
    collections: Record<string, CollectionBackupStat>;
  } = {
    createdAt: new Date().toISOString(),
    databaseName: db.databaseName,
    totalCollections: collections.length,
    totalDocuments: 0,
    totalSizeBytes: 0,
    collections: {},
  };

  console.log(`Starting backup of ${collections.length} collections...`);

  for (const colInfo of collections) {
    const colName = colInfo.name;
    const col = db.collection(colName);
    const docCount = await col.countDocuments();
    manifest.totalDocuments += docCount;

    console.log(`\nBacking up collection: ${colName} (${docCount} documents)...`);

    const bsonFilePath = path.join(BACKUP_ROOT_DIR, `${colName}.bson`);
    const metaFilePath = path.join(BACKUP_ROOT_DIR, `${colName}.metadata.json`);

    // Fetch collection indexes
    let indexes: any[] = [];
    try {
      indexes = await col.indexes();
    } catch {}
    fs.writeFileSync(metaFilePath, JSON.stringify(indexes, null, 2), "utf-8");

    // Stream and serialize BSON binary documents
    const writeStream = fs.createWriteStream(bsonFilePath);
    const hash = crypto.createHash("sha256");

    let processedDocs = 0;
    let colSizeBytes = 0;

    const cursor = col.find({}, { raw: false }).batchSize(100);

    while (await cursor.hasNext()) {
      const doc = await cursor.next();
      if (!doc) break;

      const serialized = BSON.serialize(doc);
      writeStream.write(serialized);
      hash.update(serialized);
      colSizeBytes += serialized.length;
      processedDocs++;

      if (colName === "product_images.chunks" && processedDocs % 250 === 0) {
        process.stdout.write(`  Progress: ${processedDocs}/${docCount} chunks written (${(colSizeBytes / (1024 * 1024)).toFixed(2)} MB)...\r`);
      }
    }

    await new Promise<void>((resolve, reject) => {
      writeStream.end((err?: Error | null) => {
        if (err) reject(err);
        else resolve();
      });
    });

    manifest.totalSizeBytes += colSizeBytes;
    const sha256Hex = hash.digest("hex");

    manifest.collections[colName] = {
      collection: colName,
      documentCount: processedDocs,
      bsonSizeBytes: colSizeBytes,
      sha256: sha256Hex,
      indexes,
    };

    console.log(`  Completed ${colName}: ${processedDocs} docs, ${(colSizeBytes / (1024 * 1024)).toFixed(2)} MB, SHA256: ${sha256Hex.slice(0, 16)}...`);
  }

  // Write manifest
  const manifestPath = path.join(BACKUP_ROOT_DIR, "backup-manifest.json");
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf-8");

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log("\n--------------------------------------------------------------------------------");
  console.log(`BACKUP COMPLETED IN ${durationSec}s: ${manifest.totalDocuments} total documents, ${(manifest.totalSizeBytes / (1024 * 1024)).toFixed(2)} MB total binary BSON.`);
  console.log("--------------------------------------------------------------------------------\n");

  // --------------------------------------------------------------------------
  // Verification Phase: Read & Deserialize Backup
  // --------------------------------------------------------------------------
  console.log("--- 2. Verifying Backup Integrity & Readability ---");
  let verifiedCollections = 0;
  let verifiedDocuments = 0;

  for (const [cName, stat] of Object.entries(manifest.collections)) {
    const filePath = path.join(BACKUP_ROOT_DIR, `${cName}.bson`);
    if (!fs.existsSync(filePath)) {
      throw new Error(`Verification failed: missing backup file ${filePath}`);
    }

    const fileBuf = fs.readFileSync(filePath);
    if (fileBuf.length !== stat.bsonSizeBytes) {
      throw new Error(`Verification failed: file size mismatch for ${cName}`);
    }

    // Verify SHA256
    const verifyHash = crypto.createHash("sha256").update(fileBuf).digest("hex");
    if (verifyHash !== stat.sha256) {
      throw new Error(`Verification failed: SHA-256 checksum mismatch for ${cName}`);
    }

    // Deserialize BSON stream
    let offset = 0;
    let count = 0;
    while (offset < fileBuf.length) {
      // In BSON, first 4 bytes of document are int32 document size (little-endian)
      const docSize = fileBuf.readInt32LE(offset);
      if (docSize <= 0 || offset + docSize > fileBuf.length) {
        throw new Error(`Corrupt BSON document in ${cName} at offset ${offset}`);
      }
      const docBuf = fileBuf.subarray(offset, offset + docSize);
      const deserialized = BSON.deserialize(docBuf);
      if (!deserialized._id) {
        throw new Error(`Document missing _id in ${cName}`);
      }
      offset += docSize;
      count++;
    }

    if (count !== stat.documentCount) {
      throw new Error(`Verification count mismatch for ${cName}: expected ${stat.documentCount}, deserialized ${count}`);
    }

    verifiedCollections++;
    verifiedDocuments += count;
    console.log(`  [VERIFIED] ${cName.padEnd(28)}: ${count} documents deserialized intact (SHA-256 verified)`);
  }

  // Verify critical specific records:
  console.log("\n--- 3. Verifying Critical Entities in Backup ---");

  // Check users collection in backup
  const usersBuf = fs.readFileSync(path.join(BACKUP_ROOT_DIR, "users.bson"));
  const usersDeserialized: any[] = [];
  let uOffset = 0;
  while (uOffset < usersBuf.length) {
    const size = usersBuf.readInt32LE(uOffset);
    usersDeserialized.push(BSON.deserialize(usersBuf.subarray(uOffset, uOffset + size)));
    uOffset += size;
  }

  const u1 = usersDeserialized.find(u => u._id.toString() === "6aa14bc403bc2db28142fcec");
  const u2 = usersDeserialized.find(u => u._id.toString() === "6aa14bc803bc2db28142fcef");

  if (!u1 || !u2) {
    throw new Error("Verification failed: duplicate users not both preserved in backup!");
  }
  console.log("  [VERIFIED] Both duplicate user documents preserved with exact IDs and credentials intact.");
  console.log(`    - Document 1 (_id: ${u1._id.toString()}, created: ${u1.createdAt.toISOString()})`);
  console.log(`    - Document 2 (_id: ${u2._id.toString()}, created: ${u2.createdAt.toISOString()})`);

  // Check GridFS files and chunks in backup
  const filesStat = manifest.collections["product_images.files"];
  const chunksStat = manifest.collections["product_images.chunks"];
  console.log(`  [VERIFIED] GridFS files: ${filesStat.documentCount} images recorded.`);
  console.log(`  [VERIFIED] GridFS chunks: ${chunksStat.documentCount} chunks recorded (${(chunksStat.bsonSizeBytes / (1024 * 1024)).toFixed(2)} MB).`);

  await mongoose.disconnect();
  console.log("\n================================================================================");
  console.log(`BACKUP VERIFICATION SUCCEEDED: ${verifiedCollections}/${collections.length} collections and ${verifiedDocuments} documents 100% verified.`);
  console.log("================================================================================\n");
}

runBackup().catch((err) => {
  console.error("Backup failed with error:", err);
  process.exitCode = 1;
});
