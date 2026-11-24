import path from "path";
import fs from "fs";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(process.cwd(), "server/.env") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

import { PostgresDatabase } from "../db/postgres.js";

async function main() {
  console.log("Applying Migration 003: Strengthened Worker Leases and Fencing Tokens...");
  PostgresDatabase.initialize();

  const migrationSql = fs.readFileSync(
    path.resolve(process.cwd(), "server/src/db/migrations/003_strengthened_worker_leases.sql"),
    "utf8"
  );

  await PostgresDatabase.query(migrationSql);
  console.log("Migration 003 applied successfully.");

  // Verify columns in orders
  const orderCols = await PostgresDatabase.query(
    "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'orders' AND column_name IN ('claim_token', 'claim_expires_at');"
  );
  console.log("Orders columns verified:", orderCols.rows);

  // Verify columns in image_deletion_queue
  const queueCols = await PostgresDatabase.query(
    "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'image_deletion_queue' AND column_name IN ('claim_token', 'claim_expires_at');"
  );
  console.log("Image deletion queue columns verified:", queueCols.rows);

  await PostgresDatabase.close();
}

main().catch(err => {
  console.error("Migration error:", err);
  process.exit(1);
});
