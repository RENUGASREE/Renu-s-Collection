import fs from "fs";
import path from "path";
import crypto from "crypto";
import mongoose from "mongoose";
import dotenv from "dotenv";
import pg from "pg";

const { BSON } = mongoose.mongo;

dotenv.config({ path: path.resolve(process.cwd(), "server/.env") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const BACKUP_PATH = "C:\\Users\\renug\\.gemini\\antigravity\\brain\\1a563238-822a-45d8-9a15-ec40b15dbe3c\\backups\\mongodb_production_backup_cutover_final_20261124\\users.bson";

function hashForComparison(str?: string | null): string {
  if (!str) return "[NONE]";
  return crypto.createHash("sha256").update(str).digest("hex").slice(0, 16);
}

async function repairAdmin() {
  console.log("=== STEP 1: READING ORIGINAL ADMIN FROM VERIFIED BACKUP ===");
  if (!fs.existsSync(BACKUP_PATH)) {
    throw new Error(`Backup file not found at: ${BACKUP_PATH}`);
  }

  const fileBuf = fs.readFileSync(BACKUP_PATH);
  let offset = 0;
  let adminDoc: any = null;
  while (offset < fileBuf.length) {
    const size = fileBuf.readInt32LE(offset);
    if (size <= 0 || offset + size > fileBuf.length) break;
    const docBuf = fileBuf.subarray(offset, offset + size);
    const doc = BSON.deserialize(docBuf);
    offset += size;
    if (doc.role === "admin") {
      adminDoc = doc;
      break;
    }
  }

  if (!adminDoc) {
    throw new Error("Admin record not found in MongoDB backup.");
  }

  const adminId = adminDoc._id.toString();
  const passwordHash = adminDoc.passwordHash;
  const refreshTokenHash = adminDoc.refreshTokenHash || null;
  const previousRefreshTokenHash = adminDoc.previousRefreshTokenHash || null;
  const previousRefreshTokenExpiresAt = adminDoc.previousRefreshTokenExpiresAt ? new Date(adminDoc.previousRefreshTokenExpiresAt) : null;
  const lastLoginAt = adminDoc.lastLoginAt ? new Date(adminDoc.lastLoginAt) : null;
  const isEmailVerified = Boolean(adminDoc.isEmailVerified);

  if (!passwordHash || passwordHash.length !== 60 || !passwordHash.startsWith("$2b$")) {
    throw new Error("Invalid password hash format on backup admin record.");
  }

  const backupPwdDigest = hashForComparison(passwordHash);
  const backupEmailDigest = hashForComparison(adminDoc.email?.toLowerCase().trim());

  console.log("Admin record verified from backup:");
  console.log(`  ID: ${adminId}`);
  console.log(`  Role: ${adminDoc.role}`);
  console.log(`  Username: ${adminDoc.username}`);
  console.log(`  Email len: ${adminDoc.email?.length}, SHA256: ${backupEmailDigest}`);
  console.log(`  PasswordHash len: ${passwordHash.length}, prefix: ${passwordHash.slice(0, 7)}, SHA256: ${backupPwdDigest}`);

  console.log("\n=== STEP 2: CONNECTING TO SUPABASE POSTGRESQL ===");
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set.");
  }

  const pool = new pg.Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });

  const client = await pool.connect();
  try {
    console.log("Checking existing record in PostgreSQL before update...");
    const preCheck = await client.query(
      `SELECT id, email, username, role, password_hash, is_email_verified
       FROM users
       WHERE id = $1 AND role = 'admin';`,
      [adminId]
    );

    if (preCheck.rowCount === 0) {
      throw new Error(`Admin record with ID ${adminId} not found in PostgreSQL.`);
    }

    const currentPgRow = preCheck.rows[0];
    const currentPgPwd = currentPgRow.password_hash || "";
    console.log(`  Current PG password_hash len: ${currentPgPwd.length}`);

    console.log("\n=== STEP 3: PERFORMING PARAMETERIZED UPDATE OF EXISTING ADMIN RECORD ===");
    const updateResult = await client.query(
      `UPDATE users
       SET password_hash = $1,
           refresh_token_hash = $2,
           previous_refresh_token_hash = $3,
           previous_refresh_token_expires_at = $4,
           last_login_at = $5,
           is_email_verified = $6,
           updated_at = NOW()
       WHERE id = $7 AND role = 'admin'
       RETURNING id, email, username, role, password_hash, is_email_verified, updated_at;`,
      [
        passwordHash,
        refreshTokenHash,
        previousRefreshTokenHash,
        previousRefreshTokenExpiresAt,
        lastLoginAt,
        isEmailVerified,
        adminId,
      ]
    );

    if (updateResult.rowCount !== 1) {
      throw new Error(`Expected exactly 1 row updated, got ${updateResult.rowCount}`);
    }

    const updatedRow = updateResult.rows[0];
    const updatedPwd = String(updatedRow.password_hash || "");
    const updatedPwdDigest = hashForComparison(updatedPwd);
    const updatedEmailDigest = hashForComparison(String(updatedRow.email || "").toLowerCase().trim());

    console.log("\n=== STEP 4: VERIFYING POSTGRESQL ADMIN RECORD ===");
    console.log(`  ID: ${updatedRow.id}`);
    console.log(`  Role: ${updatedRow.role}`);
    console.log(`  Username: ${updatedRow.username}`);
    console.log(`  Email len: ${updatedRow.email?.length}, SHA256: ${updatedEmailDigest}`);
    console.log(`  PasswordHash len: ${updatedPwd.length}, prefix: ${updatedPwd.slice(0, 7)}, SHA256: ${updatedPwdDigest}`);
    console.log(`  isEmailVerified: ${updatedRow.is_email_verified}`);
    console.log(`  updated_at: ${updatedRow.updated_at}`);

    if (updatedPwdDigest !== backupPwdDigest) {
      throw new Error("Verification failed: updated password_hash SHA256 does not match backup!");
    }
    if (updatedEmailDigest !== backupEmailDigest) {
      throw new Error("Verification failed: updated email SHA256 does not match backup!");
    }

    console.log("\nSUCCESS: Admin record in Supabase PostgreSQL is restored with original credentials!");
  } finally {
    client.release();
    await pool.end();
  }
}

repairAdmin().catch((err) => {
  console.error("Repair failed:", err);
  process.exit(1);
});
