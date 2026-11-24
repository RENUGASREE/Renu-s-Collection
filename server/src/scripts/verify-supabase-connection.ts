import path from "path";
import dotenv from "dotenv";

// Load server environment
dotenv.config({ path: path.resolve(__dirname, "../../.env") });
dotenv.config({ path: path.resolve(process.cwd(), "server/.env") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

import { env } from "../config/env.js";
import { createPostgresPool, createDirectMigrationClient } from "../db/postgres.js";
import { SupabaseStorageAdapter } from "../db/supabase-storage.js";

const EXPECTED_APPLICATION_TABLES = [
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

async function verifySupabaseConnection(): Promise<void> {
  console.log("================================================================================");
  console.log("RENU'S COLLECTIONS – SUPABASE CONNECTION VERIFICATION (PHASE 2A)");
  console.log("================================================================================\n");

  let totalChecks = 0;
  let passedChecks = 0;

  function report(status: "PASS" | "FAIL" | "SKIP", title: string, details?: string) {
    totalChecks++;
    if (status === "PASS") {
      passedChecks++;
      console.log(`[PASS] ${title}`);
    } else if (status === "SKIP") {
      console.log(`[SKIP] ${title}`);
    } else {
      console.error(`[FAIL] ${title}`);
    }
    if (details) {
      console.log(`       ${details}`);
    }
  }

  // --------------------------------------------------------------------------
  // 1. PostgreSQL Connection Verification (Transaction Pooler - Port 6543)
  // --------------------------------------------------------------------------
  console.log("--- 1. Testing PostgreSQL Connection (DATABASE_URL) ---");
  const databaseUrl = env.DATABASE_URL || process.env.DATABASE_URL;

  if (!databaseUrl) {
    report(
      "SKIP",
      "PostgreSQL DATABASE_URL not configured in environment",
      "Please set DATABASE_URL (Transaction Pooler - Port 6543) in server/.env when ready."
    );
  } else {
    let pool: any = null;
    try {
      pool = createPostgresPool();
      
      // Test basic connectivity and retrieve version
      const testResult = await pool.query(
        "SELECT 1 AS ok, current_database() AS db_name, version() AS pg_version;"
      );

      if (testResult.rows.length > 0 && testResult.rows[0].ok === 1) {
        const row = testResult.rows[0];
        const shortVersion = (row.pg_version as string).split(" on ")[0] || "PostgreSQL";
        report(
          "PASS",
          "PostgreSQL query execution (SELECT 1)",
          `Connected to database "${row.db_name}" (${shortVersion})`
        );
      } else {
        report("FAIL", "PostgreSQL query execution did not return expected result");
      }

      // Check application tables
      const tablesResult = await pool.query(
        `SELECT table_name 
         FROM information_schema.tables 
         WHERE table_schema = 'public' AND table_type = 'BASE TABLE';`
      );

      const existingTables = new Set<string>(
        tablesResult.rows.map((r: any) => (r.table_name as string).toLowerCase())
      );

      const missingTables = EXPECTED_APPLICATION_TABLES.filter((t) => !existingTables.has(t));

      if (missingTables.length === 0) {
        report(
          "PASS",
          `Schema verification: All ${EXPECTED_APPLICATION_TABLES.length} expected application tables exist in public schema`,
          `Tables confirmed: ${EXPECTED_APPLICATION_TABLES.slice(0, 5).join(", ")}, ... (${EXPECTED_APPLICATION_TABLES.length} total)`
        );
      } else {
        report(
          "FAIL",
          `Schema verification: Missing ${missingTables.length} tables`,
          `Missing tables: ${missingTables.join(", ")}`
        );
      }

      // Check Primary-Key and Foreign-Key column compatibility with VARCHAR(36)
      const columnsResult = await pool.query(
        `SELECT table_name, column_name, data_type, character_maximum_length, is_nullable
         FROM information_schema.columns
         WHERE table_schema = 'public'
           AND (
             column_name = 'id'
             OR column_name = 'mongodb_id'
             OR column_name LIKE '%_id'
           )
         ORDER BY table_name, column_name;`
      );

      const idColumns = columnsResult.rows;
      const schemaMismatches: string[] = [];
      let checkedColumnsCount = 0;

      // External third-party IDs and natural slugs intentionally wider than 36 chars
      const EXTERNAL_OR_SLUG_ID_COLUMNS = new Set([
        "session_id",           // carts: guest session identifier (VARCHAR(100))
        "type_id",              // component_types: slug / natural key (VARCHAR(50))
        "razorpay_order_id",    // orders: Razorpay payment gateway order ID (VARCHAR(100))
        "razorpay_payment_id",  // orders: Razorpay payment gateway transaction ID (VARCHAR(100))
        "google_id",            // users: Google OAuth sub / account ID (VARCHAR(255))
      ]);

      for (const col of idColumns) {
        if (EXTERNAL_OR_SLUG_ID_COLUMNS.has(col.column_name)) {
          continue;
        }
        // Exclude system or non-string IDs if any (e.g. bigserial or numeric IDs)
        if (col.data_type === 'character varying') {
          checkedColumnsCount++;
          if (col.character_maximum_length !== 36) {
            schemaMismatches.push(
              `${col.table_name}.${col.column_name}: Expected VARCHAR(36), found VARCHAR(${col.character_maximum_length})`
            );
          }
        }
      }

      if (schemaMismatches.length === 0) {
        report(
          "PASS",
          `Identifier compatibility: All ${checkedColumnsCount} ID and foreign-key columns match VARCHAR(36)`,
          "Preserves 24-character MongoDB ObjectIds and supports 36-character standard UUIDs"
        );
      } else {
        report(
          "FAIL",
          `Identifier schema mismatch: ${schemaMismatches.length} column(s) do not match VARCHAR(36)`,
          schemaMismatches.join("; ")
        );
      }

    } catch (err: any) {
      report(
        "FAIL",
        "PostgreSQL connection failed",
        `Error: ${err.message || "Unknown error connecting to database"}`
      );
    } finally {
      if (pool) {
        try {
          await pool.end();
        } catch {}
      }
    }
  }

  // --------------------------------------------------------------------------
  // 2. Direct / Session Pooler Connection Verification (DIRECT_URL - Port 5432)
  // --------------------------------------------------------------------------
  console.log("\n--- 2. Testing Session Pooler Connection & DDL Support (Port 5432) ---");
  const directUrl = env.DIRECT_URL || process.env.DIRECT_URL;

  if (!directUrl) {
    report(
      "SKIP",
      "DIRECT_URL not configured in environment",
      "DIRECT_URL (Port 5432) is required when executing DDL migrations."
    );
  } else {
    let client: any = null;
    try {
      client = createDirectMigrationClient();
      await client.connect();

      const directRes = await client.query("SELECT 1 AS ok, current_database() AS db_name;");
      if (directRes.rows.length > 0 && directRes.rows[0].ok === 1) {
        report("PASS", "Session Pooler connection (Port 5432) verified successfully", `Connected to database "${directRes.rows[0].db_name}"`);
      } else {
        report("FAIL", "Session Pooler query failed");
      }

      // Test DDL support in an isolated transaction that is strictly rolled back
      try {
        await client.query("BEGIN;");
        await client.query(
          "CREATE TEMP TABLE __ddl_capability_test (id VARCHAR(36) PRIMARY KEY, test_name VARCHAR(100) NOT NULL);"
        );
        await client.query(
          "ALTER TABLE __ddl_capability_test ADD COLUMN created_at TIMESTAMPTZ DEFAULT NOW();"
        );
        await client.query(
          "CREATE INDEX __idx_ddl_test ON __ddl_capability_test (test_name);"
        );
        await client.query("ROLLBACK;");

        report(
          "PASS",
          "Session Pooler DDL operations capability verified",
          "Successfully verified CREATE TABLE, ALTER TABLE, CREATE INDEX, and transaction rollback without modifying persistent schema"
        );
      } catch (ddlErr: any) {
        try {
          await client.query("ROLLBACK;");
        } catch {}
        report(
          "FAIL",
          "Session Pooler DDL operations check failed",
          `DDL Error: ${ddlErr.message}`
        );
      }

    } catch (err: any) {
      let detail = `Error: ${err.message}`;
      if (err.message?.includes("ETIMEDOUT") || err.message?.includes("2406:")) {
        detail += "\n       Note: Direct connection (db.*.supabase.co:5432) resolves via IPv6. If your network does not route IPv6, configure DIRECT_URL with the Session Pooler endpoint on Port 5432: postgresql://postgres.<ref>:<password>@<region>.pooler.supabase.com:5432/postgres";
      }
      report("FAIL", "Session Pooler connection failed", detail);
    } finally {
      if (client) {
        try {
          await client.end();
        } catch {}
      }
    }
  }

  // --------------------------------------------------------------------------
  // 3. Supabase Storage Verification
  // --------------------------------------------------------------------------
  console.log("\n--- 3. Testing Supabase Storage (product-images bucket) ---");
  const supabaseUrl = env.SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  const targetBucket = env.SUPABASE_STORAGE_BUCKET || "product-images";

  if (!supabaseUrl || !serviceKey) {
    report(
      "SKIP",
      "Supabase Storage credentials not configured",
      "Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in server/.env when ready."
    );
  } else {
    try {
      const storageAdapter = new SupabaseStorageAdapter(supabaseUrl, serviceKey);

      // Verify bucket exists and is public
      const bucketInfo = await storageAdapter.getBucketInfo(targetBucket);

      if (!bucketInfo) {
        report(
          "FAIL",
          `Storage bucket "${targetBucket}" not found`,
          "Ensure the bucket has been created in your Supabase project dashboard."
        );
      } else {
        report(
          "PASS",
          `Storage bucket "${targetBucket}" exists`,
          `Bucket ID: "${bucketInfo.id}", Public Access: ${bucketInfo.public ? "TRUE (Publicly readable)" : "FALSE (Private)"}`
        );

        if (bucketInfo.public) {
          report("PASS", `Public CDN URL access confirmed for bucket "${targetBucket}"`);
        } else {
          report(
            "FAIL",
            `Bucket "${targetBucket}" is marked private`,
            "Product images must be in a Public bucket for customer and storefront CDN access."
          );
        }
      }

    } catch (err: any) {
      report(
        "FAIL",
        "Supabase Storage connection failed",
        `Error: ${err.message || "Failed to inspect storage"}`
      );
    }
  }

  // --------------------------------------------------------------------------
  // Summary
  // --------------------------------------------------------------------------
  console.log("\n================================================================================");
  console.log(`VERIFICATION SUMMARY: ${passedChecks}/${totalChecks} CHECKS PASSED.`);
  console.log("Strictly read-only: No database records were modified, and no files were uploaded.");
  console.log("================================================================================\n");
}

if (process.argv[1]?.endsWith("verify-supabase-connection.ts") || process.argv[1]?.endsWith("verify-supabase-connection.js")) {
  verifySupabaseConnection()
    .catch((err) => {
      console.error("Verification script encountered an unhandled error:", err.message);
      process.exitCode = 1;
    });
}
