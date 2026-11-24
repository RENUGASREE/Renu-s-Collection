import { PostgresDatabase } from "../db/postgres.js";
import { listLowStockProducts } from "./product.service.js";
import { AppError } from "../middleware/errorHandler.js";

/**
 * Retrieves administrative dashboard statistics exclusively from Supabase PostgreSQL.
 * Strict PostgreSQL-only implementation — does not query MongoDB under any circumstances.
 * On PostgreSQL failure, propagates a controlled AppError rather than fabricating zero-valued stats.
 */
export async function getDashboardStats() {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  try {
    const [
      totalRevRes,
      revLast30Res,
      totalOrdersRes,
      pendingOrdersRes,
      ordersLast30Res,
      usersGroupRes,
      productsCountRes,
      topProductsRes,
      lowStock,
    ] = await Promise.all([
      PostgresDatabase.query<{ total: string | number }>(
        `SELECT COALESCE(SUM(total), 0) AS total FROM orders WHERE payment_status = 'paid';`
      ),
      PostgresDatabase.query<{ total: string | number }>(
        `SELECT COALESCE(SUM(total), 0) AS total FROM orders WHERE payment_status = 'paid' AND created_at >= $1;`,
        [thirtyDaysAgo]
      ),
      PostgresDatabase.query<{ count: string | number }>(
        `SELECT COUNT(*) AS count FROM orders;`
      ),
      PostgresDatabase.query<{ count: string | number }>(
        `SELECT COUNT(*) AS count FROM orders WHERE status = 'pending';`
      ),
      PostgresDatabase.query<{ count: string | number }>(
        `SELECT COUNT(*) AS count FROM orders WHERE created_at >= $1;`,
        [thirtyDaysAgo]
      ),
      PostgresDatabase.query<{ role: string; count: string | number }>(
        `SELECT role, COUNT(*) AS count FROM users GROUP BY role;`
      ),
      PostgresDatabase.query<{ total: string | number; active: string | number }>(
        `SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE is_active = TRUE) AS active FROM products;`
      ),
      PostgresDatabase.query<{
        product_id: string;
        name: string;
        quantity_sold: string | number;
        revenue: string | number;
      }>(
        `SELECT 
           oi.product_id,
           oi.name,
           SUM(oi.quantity) as quantity_sold,
           SUM(oi.subtotal) as revenue
         FROM order_items oi
         JOIN orders o ON o.id = oi.order_id
         WHERE o.payment_status = 'paid'
         GROUP BY oi.product_id, oi.name
         ORDER BY quantity_sold DESC
         LIMIT 5;`
      ),
      listLowStockProducts(),
    ]);

    const totalRevenue = Number(totalRevRes.rows[0]?.total || 0);
    const revenueLast30 = Number(revLast30Res.rows[0]?.total || 0);
    const totalOrders = Number(totalOrdersRes.rows[0]?.count || 0);
    const pendingOrders = Number(pendingOrdersRes.rows[0]?.count || 0);
    const ordersLast30 = Number(ordersLast30Res.rows[0]?.count || 0);

    let totalUsers = 0;
    let customerCount = 0;
    let adminCount = 0;
    for (const row of usersGroupRes.rows) {
      const count = Number(row.count);
      totalUsers += count;
      if (row.role === "admin") adminCount += count;
      else if (row.role === "customer") customerCount += count;
    }

    const totalProducts = Number(productsCountRes.rows[0]?.total || 0);
    const activeProducts = Number(productsCountRes.rows[0]?.active || 0);

    const topProducts = topProductsRes.rows.map((p, index) => ({
      id: p.product_id || `product-${index}`,
      _id: p.product_id,
      name: p.name,
      sku: "",
      reviewCount: 0,
      averageRating: 0,
    }));

    return {
      revenue: {
        total: totalRevenue,
        last30Days: revenueLast30,
      },
      orders: {
        total: totalOrders,
        pending: pendingOrders,
        last30Days: ordersLast30,
      },
      products: {
        total: totalProducts,
        active: activeProducts,
        lowStock: lowStock.length,
      },
      users: {
        total: totalUsers,
        customers: customerCount,
        admins: adminCount,
      },
      topProducts,
    };
  } catch (pgError: any) {
    console.error("PostgreSQL admin dashboard query failure:", pgError.message);
    throw new AppError(
      `Admin dashboard statistics are currently unavailable: ${pgError.message}`,
      500
    );
  }
}
