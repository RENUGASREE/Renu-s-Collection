import path from "path";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(process.cwd(), "server/.env") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

import { PostgresDatabase } from "../db/postgres.js";

async function main() {
  PostgresDatabase.initialize();
  const orders = await PostgresDatabase.query("SELECT id, order_number, user_id, payment_status, fulfillment_status, created_at FROM orders ORDER BY created_at ASC;");
  console.log("=== ORDERS IN POSTGRESQL ===");
  console.table(orders.rows);

  const carts = await PostgresDatabase.query("SELECT id, user_id, session_id, created_at, updated_at FROM carts;");
  console.log("\n=== CARTS IN POSTGRESQL ===");
  console.table(carts.rows);

  const invLogs = await PostgresDatabase.query("SELECT id, product_id, sku, action, quantity_change, previous_stock, new_stock, reason, created_at FROM inventory_logs;");
  console.log("\n=== INVENTORY LOGS IN POSTGRESQL ===");
  console.table(invLogs.rows);

  await PostgresDatabase.close();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
