import path from "path";
import fs from "fs";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(process.cwd(), "server/.env") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

import { PostgresDatabase } from "../db/postgres.js";

async function main() {
  console.log("Applying Migration 004: Make Studio Material Image URL Nullable...");
  PostgresDatabase.initialize();

  const migrationSql = fs.readFileSync(
    path.resolve(process.cwd(), "server/src/db/migrations/004_make_material_image_url_nullable.sql"),
    "utf8"
  );

  await PostgresDatabase.query(migrationSql);
  console.log("Migration 004 applied successfully.");

  // Verify column in studio_materials
  const colRes = await PostgresDatabase.query(
    "SELECT column_name, is_nullable, column_default FROM information_schema.columns WHERE table_name = 'studio_materials' AND column_name = 'image_url';"
  );
  console.log("studio_materials.image_url verified:", colRes.rows);

  await PostgresDatabase.close();
}

main().catch(err => {
  console.error("Migration error:", err);
  process.exit(1);
});
