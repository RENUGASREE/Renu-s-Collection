import path from "path";
import fs from "fs";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(process.cwd(), "server/.env") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

import { PostgresDatabase } from "../db/postgres.js";

async function main() {
  console.log("Applying Migration 005: Add Bracelet Structure to Products...");
  PostgresDatabase.initialize();

  const migrationSql = fs.readFileSync(
    path.resolve(process.cwd(), "server/src/db/migrations/005_add_bracelet_structure_to_products.sql"),
    "utf8"
  );

  await PostgresDatabase.query(migrationSql);
  console.log("Migration 005 applied successfully.");

  // Verify column in products
  const colRes = await PostgresDatabase.query(
    "SELECT column_name, is_nullable, data_type, column_default FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'bracelet_structure';"
  );
  console.log("products.bracelet_structure verified:", colRes.rows);

  await PostgresDatabase.close();
}

main().catch(err => {
  console.error("Migration error:", err);
  process.exit(1);
});
