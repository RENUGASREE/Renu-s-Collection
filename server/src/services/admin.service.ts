import { Order } from "../models/Order.js";
import { Product } from "../models/Product.js";
import { User } from "../models/User.js";
import { listLowStockProducts } from "./product.service.js";

export async function getDashboardStats() {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  try {
    const [
      totalRevenueAgg,
      ordersLast30,
      totalOrders,
      totalUsers,
      totalProducts,
      topProducts,
      lowStock,
    ] = await Promise.all([
      Order.aggregate([
        { $match: { paymentStatus: "paid" } },
        { $group: { _id: null, total: { $sum: "$total" } } },
      ]),
      Order.countDocuments({ createdAt: { $gte: thirtyDaysAgo } }),
      Order.countDocuments(),
      User.countDocuments(),
      Product.countDocuments({ isActive: true }),
      Order.aggregate([
        { $match: { paymentStatus: "paid" } },
        { $unwind: "$items" },
        {
          $group: {
            _id: "$items.productId",
            name: { $first: "$items.name" },
            quantitySold: { $sum: "$items.quantity" },
            revenue: { $sum: "$items.subtotal" },
          },
        },
        { $sort: { quantitySold: -1 } },
        { $limit: 5 },
      ]),
      listLowStockProducts(),
    ]);

    const revenueLast30Agg = await Order.aggregate([
      {
        $match: {
          paymentStatus: "paid",
          createdAt: { $gte: thirtyDaysAgo },
        },
      },
      { $group: { _id: null, total: { $sum: "$total" } } },
    ]);

    return {
      revenue: {
        total: totalRevenueAgg[0]?.total ?? 0,
        last30Days: revenueLast30Agg[0]?.total ?? 0,
      },
      orders: {
        total: totalOrders,
        pending: await Order.countDocuments({ status: "pending" }),
        last30Days: ordersLast30,
      },
      products: {
        total: await Product.countDocuments(),
        active: totalProducts,
        lowStock: lowStock.length,
      },
      users: {
        total: totalUsers,
        customers: await User.countDocuments({ role: "customer" }),
        admins: await User.countDocuments({ role: "admin" }),
      },
      topProducts: topProducts.map((p) => ({
        id: p._id?.toString() || `product-${Math.random()}`,
        _id: p._id?.toString(),
        name: p.name,
        sku: p.sku || "",
        reviewCount: 0,
        averageRating: 0,
      })),
    };
  } catch (error) {
    console.error("Error fetching dashboard stats:", error);
    // Return default values if there's an error
    return {
      revenue: { total: 0, last30Days: 0 },
      orders: { total: 0, pending: 0, last30Days: 0 },
      products: { total: 0, active: 0, lowStock: 0 },
      users: { total: 0, customers: 0, admins: 0 },
      topProducts: [],
    };
  }
}
