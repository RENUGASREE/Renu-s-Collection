import path from "path";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(process.cwd(), "server/.env") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

import { PostgresDatabase } from "../db/postgres.js";

async function main() {
  PostgresDatabase.initialize();

  console.log("Cleaning up temporary test orders...");
  const delOrders = await PostgresDatabase.query(
    "DELETE FROM orders WHERE order_number LIKE 'TEST-CLAIM-%' RETURNING id, order_number;"
  );
  console.log(`Deleted ${delOrders.rowCount} test orders:`, delOrders.rows);

  console.log("Cleaning up temporary test cart from Phase 3L...");
  await PostgresDatabase.query("DELETE FROM cart_items WHERE cart_id = 'dcb7019c-41e6-4ab9-bd64-47c62e0b5367';");
  const delCart = await PostgresDatabase.query(
    "DELETE FROM carts WHERE id = 'dcb7019c-41e6-4ab9-bd64-47c62e0b5367' RETURNING id;"
  );
  console.log(`Deleted ${delCart.rowCount} test carts:`, delCart.rows);

  // Verify counts now
  const orderCount = await PostgresDatabase.query("SELECT COUNT(*) FROM orders;");
  const cartCount = await PostgresDatabase.query("SELECT COUNT(*) FROM carts;");
  console.log(`PostgreSQL Orders Count: ${orderCount.rows[0].count} (Expected: 1)`);
  console.log(`PostgreSQL Carts Count: ${cartCount.rows[0].count} (Expected: 1)`);

  await PostgresDatabase.close();
}

main().catch(err => {
  console.error("Cleanup error:", err);
  process.exit(1);
});
