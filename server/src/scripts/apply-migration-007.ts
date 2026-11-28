import path from "path";
import fs from "fs";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(process.cwd(), "server/.env") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

import { PostgresDatabase } from "../db/postgres.js";

async function main() {
  console.log("Applying Migration 007: Product Types Management Table and Category Foreign Key...");
  PostgresDatabase.initialize();

  const migrationSql = fs.readFileSync(
    path.resolve(process.cwd(), "server/src/db/migrations/007_product_types.sql"),
    "utf8"
  );

  await PostgresDatabase.query(migrationSql);
  console.log("Migration 007 applied successfully.");

  // Verify product_types table and initial records
  const ptRes = await PostgresDatabase.query(
    "SELECT id, name, slug, display_order, is_active FROM product_types ORDER BY display_order ASC;"
  );
  console.log("product_types records verified (" + ptRes.rows.length + " rows):");
  console.table(ptRes.rows);

  // Verify foreign key on categories
  const fkRes = await PostgresDatabase.query(
    "SELECT conname, confrelid::regclass, contype FROM pg_constraint WHERE conname = 'fk_categories_product_type';"
  );
  console.log("Foreign key fk_categories_product_type verified:", fkRes.rows);

  await PostgresDatabase.close();
}

main().catch(err => {
  console.error("Migration error:", err);
  process.exit(1);
});
