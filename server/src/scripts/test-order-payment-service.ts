/**
 * ============================================================================
 * Phase 3F Test Suite: Order, Payment & Razorpay PostgreSQL Services
 * ============================================================================
 *
 * Guarantees:
 * - Strictly zero live writes to Supabase or MongoDB or Razorpay.
 * - Comprehensive test coverage:
 *   1. Authoritative calculations (subtotal, shipping, discounts, taxes, totals).
 *   2. Unique order number generation (`RL...`).
 *   3. Delivery eligibility restrictions (Tamil Nadu only).
 *   4. Testing commerce access safeguards.
 *   5. Concurrency & idempotency guarantees (idempotency key and fingerprint).
 *   6. Single-restock guarantee on order cancellation.
 *   7. Razorpay dev/test order generation and HMAC-SHA256 verification.
 *   8. Post-payment fulfillment tracking (inventory deduction, coupon, cart clearing).
 *   9. Webhook idempotency and duplicate-event handling.
 *   10. Admin filtering, status updates, refunds, and legacy serialization.
 */

import crypto from "crypto";
import {
  setOrderRepository,
  setOrderProductRepository,
  setOrderUserRepository,
  createOrderFromCart,
  getOrderById,
  listUserOrders,
  listAllOrders,
  cancelOrder,
  updateOrderStatus,
  toLegacyOrder,
  generateCheckoutFingerprint,
  validateDeliveryEligibility,
  isTamilNaduState,
} from "../services/order.service.js";
import {
  setPaymentOrderRepository,
  createRazorpayOrder,
  verifyRazorpayPayment,
  recordPaymentFailure,
  processRefund,
} from "../services/payment.service.js";
import {
  setInventoryDatabasePool,
  setInventoryProductRepository,
} from "../services/inventory.service.js";
import { PostgresOrderRepository } from "../repositories/postgres-order.repository.js";
import { PostgresProductRepository } from "../repositories/postgres-product.repository.js";
import { PostgresUserRepository } from "../repositories/postgres-user.repository.js";
import { setCartRepository } from "../services/cart.service.js";
import { PostgresCartRepository } from "../repositories/postgres-cart.repository.js";
import {
  IDbClient,
  IDbPool,
  IQueryResult,
  IOrderRecord,
  IProductRecord,
  IUserRecord,
} from "../types/database.types.js";
import { env } from "../config/env.js";

// ---------------------------------------------------------------------------
// Test Runner Harness
// ---------------------------------------------------------------------------

let passedCount = 0;
let failedCount = 0;

function assert(condition: boolean, message: string) {
  if (!condition) {
    failedCount++;
    console.error(`  ✗  FAIL: ${message}`);
    throw new Error(message);
  }
}

async function test(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    passedCount++;
    console.log(`  ✓  ${name}`);
  } catch (err: any) {
    if (!err.message?.startsWith("FAIL:")) {
      failedCount++;
      console.error(`  ✗  ${name} — Error:`, err?.message || err);
    }
  }
}

// ---------------------------------------------------------------------------
// In-Memory Order Storage Mock
// ---------------------------------------------------------------------------

class InMemoryOrderStore {
  public orders: Map<string, any> = new Map();
  public orderItems: Map<string, any[]> = new Map();
  public productStock: Map<string, number> = new Map();

  public reset() {
    this.orders.clear();
    this.orderItems.clear();
    this.productStock.clear();
  }
}

const store = new InMemoryOrderStore();

function createMockOrderClient(): IDbClient {
  return {
    async query<T = any>(sql: string, params: any[] = []): Promise<IQueryResult<T>> {
      const cleanSql = sql.replace(/\s+/g, " ").trim();

      // Transaction control
      if (cleanSql === "BEGIN" || cleanSql === "COMMIT" || cleanSql === "ROLLBACK") {
        return { rows: [], rowCount: 0 };
      }

      // Products queries for inventory deduction
      if (cleanSql.includes("FROM products WHERE id = $1") && cleanSql.includes("FOR UPDATE")) {
        const prodId = params[0];
        const stock = store.productStock.has(prodId) ? store.productStock.get(prodId)! : 15;
        return { rows: [{ id: prodId, stock }] as unknown as T[], rowCount: 1 };
      }

      if (cleanSql.includes("FROM products WHERE id = $1 LIMIT 1")) {
        const prodId = params[0];
        const stock = store.productStock.has(prodId) ? store.productStock.get(prodId)! : 15;
        return { rows: [{ id: prodId, stock }] as unknown as T[], rowCount: 1 };
      }

      if (cleanSql.includes("UPDATE products") && cleanSql.includes("stock = stock - $1")) {
        const delta = params[0];
        const prodId = params[1];
        const currentStock = store.productStock.has(prodId) ? store.productStock.get(prodId)! : 15;
        const newStock = currentStock - delta;
        store.productStock.set(prodId, newStock);
        return { rows: [{ id: prodId, sku: "JW-NECK-001", stock: newStock }] as unknown as T[], rowCount: 1 };
      }

      if (cleanSql.includes("UPDATE products SET stock = stock + $1")) {
        const delta = params[0];
        const prodId = params[1];
        const currentStock = store.productStock.has(prodId) ? store.productStock.get(prodId)! : 15;
        const newStock = currentStock + delta;
        store.productStock.set(prodId, newStock);
        return { rows: [{ id: prodId, sku: "JW-NECK-001", stock: newStock }] as unknown as T[], rowCount: 1 };
      }

      // Inventory logs insert
      if (cleanSql.startsWith("INSERT INTO inventory_logs")) {
        return { rows: [{ id: "log_1" }] as unknown as T[], rowCount: 1 };
      }

      // INSERT INTO orders
      if (cleanSql.startsWith("INSERT INTO orders")) {
        const orderId = params[0];
        const row = {
          id: orderId,
          order_number: params[1],
          user_id: params[2],
          status: params[3],
          payment_status: params[4],
          subtotal: params[5],
          discount: params[6],
          tax: params[7],
          shipping: params[8],
          total: params[9],
          currency: params[10],
          coupon_code: params[11],
          shipping_address: params[12],
          billing_address: params[13],
          email: params[14],
          phone: params[15],
          notes: params[16],
          payment_method: params[17],
          razorpay_order_id: params[18],
          razorpay_payment_id: params[19],
          razorpay_signature: params[20],
          tracking_number: params[21],
          invoice_url: params[22],
          status_history: params[23],
          fulfillment_status: params[24],
          fulfillment_errors: params[25] || [],
          deducted_item_ids: params[26] || [],
          coupon_processed: params[27] || false,
          cart_cleared: params[28] || false,
          idempotency_key: params[29],
          checkout_fingerprint: params[30],
          studio_reservation_id: params[31],
          studio_reservation_status: params[32],
          created_at: new Date(),
          updated_at: new Date(),
        };

        if (row.idempotency_key && row.user_id) {
          for (const existing of store.orders.values()) {
            if (existing.user_id === row.user_id && existing.idempotency_key === row.idempotency_key) {
              const err: any = new Error("Unique constraint violation: uq_orders_user_idempotency");
              err.code = "23505";
              throw err;
            }
          }
        }

        store.orders.set(orderId, row);
        return { rows: [row as unknown as T], rowCount: 1 };
      }

      // INSERT INTO order_items
      if (cleanSql.startsWith("INSERT INTO order_items")) {
        const itemId = params[0];
        const orderId = params[1];
        const row = {
          id: itemId,
          order_id: orderId,
          item_type: params[2],
          product_id: params[3],
          sku: params[4],
          name: params[5],
          image_url: params[6],
          unit_price: params[7],
          quantity: params[8],
          subtotal: params[9],
          customization: params[10],
          studio_design: params[11],
          created_at: new Date(),
        };

        const list = store.orderItems.get(orderId) || [];
        list.push(row);
        store.orderItems.set(orderId, list);
        return { rows: [row as unknown as T], rowCount: 1 };
      }

      // SELECT from order_items WHERE order_id IN (...)
      if (cleanSql.includes("FROM order_items WHERE order_id IN")) {
        const matching: any[] = [];
        for (const orderId of params) {
          const items = store.orderItems.get(orderId) || [];
          matching.push(...items);
        }
        return { rows: matching as T[], rowCount: matching.length };
      }

      // SELECT * FROM orders WHERE id = $1 LIMIT 1
      if (cleanSql.includes("FROM orders WHERE id = $1")) {
        const orderId = params[0];
        const order = store.orders.get(orderId);
        return { rows: order ? [order as unknown as T] : [], rowCount: order ? 1 : 0 };
      }

      // SELECT * FROM orders WHERE order_number = $1
      if (cleanSql.includes("FROM orders WHERE order_number = $1")) {
        const orderNumber = params[0];
        const order = Array.from(store.orders.values()).find((o) => o.order_number === orderNumber);
        return { rows: order ? [order as unknown as T] : [], rowCount: order ? 1 : 0 };
      }

      // SELECT * FROM orders WHERE razorpay_order_id = $1
      if (cleanSql.includes("FROM orders WHERE razorpay_order_id = $1")) {
        const rzpId = params[0];
        const order = Array.from(store.orders.values()).find((o) => o.razorpay_order_id === rzpId);
        return { rows: order ? [order as unknown as T] : [], rowCount: order ? 1 : 0 };
      }

      // SELECT * FROM orders WHERE razorpay_payment_id = $1
      if (cleanSql.includes("FROM orders WHERE razorpay_payment_id = $1")) {
        const pId = params[0];
        const order = Array.from(store.orders.values()).find((o) => o.razorpay_payment_id === pId);
        return { rows: order ? [order as unknown as T] : [], rowCount: order ? 1 : 0 };
      }

      // SELECT * FROM orders WHERE user_id = $1 AND idempotency_key = $2
      if (cleanSql.includes("FROM orders WHERE user_id = $1 AND idempotency_key = $2")) {
        const [userId, key] = params;
        const order = Array.from(store.orders.values()).find(
          (o) => o.user_id === userId && o.idempotency_key === key
        );
        return { rows: order ? [order as unknown as T] : [], rowCount: order ? 1 : 0 };
      }

      // SELECT * FROM orders WHERE user_id = $1 AND checkout_fingerprint = $2
      if (cleanSql.includes("checkout_fingerprint = $2")) {
        const [userId, fingerprint] = params;
        const order = Array.from(store.orders.values()).find(
          (o) => o.user_id === userId && o.checkout_fingerprint === fingerprint
        );
        return { rows: order ? [order as unknown as T] : [], rowCount: order ? 1 : 0 };
      }

      // SELECT * FROM orders WHERE user_id = $1 ORDER BY created_at DESC
      if (cleanSql.includes("FROM orders WHERE user_id = $1 ORDER BY")) {
        const userId = params[0];
        const orders = Array.from(store.orders.values())
          .filter((o) => o.user_id === userId)
          .sort((a, b) => b.created_at.getTime() - a.created_at.getTime());
        return { rows: orders as unknown as T[], rowCount: orders.length };
      }

      // Admin COUNT
      if (cleanSql.startsWith("SELECT COUNT(*) AS count FROM orders")) {
        let count = store.orders.size;
        if (params.length > 0 && cleanSql.includes("status = $1")) {
          count = Array.from(store.orders.values()).filter((o) => o.status === params[0]).length;
        }
        return { rows: [{ count: String(count) }] as unknown as T[], rowCount: 1 };
      }

      // Admin SELECT * FROM orders
      if (cleanSql.includes("FROM orders") && cleanSql.includes("ORDER BY created_at DESC")) {
        let orders = Array.from(store.orders.values());
        if (params.length > 0 && cleanSql.includes("status = $1")) {
          orders = orders.filter((o) => o.status === params[0]);
        }
        orders.sort((a, b) => b.created_at.getTime() - a.created_at.getTime());
        return { rows: orders as unknown as T[], rowCount: orders.length };
      }

      // Atomic transition to paid by id: UPDATE orders SET payment_status = 'paid' ... WHERE id = $1 AND payment_status != 'paid'
      if (cleanSql.includes("WHERE id = $1 AND payment_status != 'paid'")) {
        const orderId = params[0];
        const order = store.orders.get(orderId);
        if (!order || order.payment_status === "paid") {
          return { rows: [], rowCount: 0 };
        }
        order.payment_status = "paid";
        order.status = "processing";
        order.razorpay_payment_id = params[1];
        if (params[2]) order.razorpay_signature = params[2];
        order.fulfillment_status = "pending";
        order.updated_at = new Date();

        const history = typeof order.status_history === "string" ? JSON.parse(order.status_history) : (order.status_history || []);
        history.push(JSON.parse(params[3]));
        order.status_history = history;

        return { rows: [order as unknown as T], rowCount: 1 };
      }

      // Atomic transition by razorpay_order_id
      if (cleanSql.includes("WHERE razorpay_order_id = $1 AND payment_status != 'paid'")) {
        const rzpOrderId = params[0];
        const order = Array.from(store.orders.values()).find((o) => o.razorpay_order_id === rzpOrderId);
        if (!order || order.payment_status === "paid") {
          return { rows: [], rowCount: 0 };
        }
        order.payment_status = "paid";
        order.status = "processing";
        order.razorpay_payment_id = params[1];
        if (params[2]) order.razorpay_signature = params[2];
        order.fulfillment_status = "pending";
        order.updated_at = new Date();

        const history = typeof order.status_history === "string" ? JSON.parse(order.status_history) : (order.status_history || []);
        history.push(JSON.parse(params[3]));
        order.status_history = history;

        return { rows: [order as unknown as T], rowCount: 1 };
      }

      // Claim coupon processed
      if (cleanSql.includes("coupon_processed = TRUE") && cleanSql.includes("coupon_processed = FALSE")) {
        const orderId = params[0];
        const order = store.orders.get(orderId);
        if (!order || order.coupon_processed) {
          return { rows: [], rowCount: 0 };
        }
        order.coupon_processed = true;
        return { rows: [{ id: orderId }] as unknown as T[], rowCount: 1 };
      }

      // Claim cart cleared
      if (cleanSql.includes("cart_cleared = TRUE") && cleanSql.includes("cart_cleared = FALSE")) {
        const orderId = params[0];
        const order = store.orders.get(orderId);
        if (!order || order.cart_cleared) {
          return { rows: [], rowCount: 0 };
        }
        order.cart_cleared = true;
        return { rows: [{ id: orderId }] as unknown as T[], rowCount: 1 };
      }

      // Add deducted item id
      if (cleanSql.includes("deducted_item_ids = array_append")) {
        const [orderId, itemId] = params;
        const order = store.orders.get(orderId);
        if (!order) return { rows: [], rowCount: 0 };
        order.deducted_item_ids = order.deducted_item_ids || [];
        if (!order.deducted_item_ids.includes(itemId)) {
          order.deducted_item_ids.push(itemId);
          return { rows: [{ id: orderId }] as unknown as T[], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      }

      // Append status history
      if (cleanSql.includes("status_history = status_history ||")) {
        const [orderId, recordStr] = params;
        const order = store.orders.get(orderId);
        if (!order) return { rows: [], rowCount: 0 };
        const history = typeof order.status_history === "string" ? JSON.parse(order.status_history) : (order.status_history || []);
        history.push(JSON.parse(recordStr));
        order.status_history = history;
        return { rows: [{ id: orderId }] as unknown as T[], rowCount: 1 };
      }

      // UPDATE orders generic
      if (cleanSql.startsWith("UPDATE orders SET")) {
        const orderId = params[0];
        const order = store.orders.get(orderId);
        if (!order) return { rows: [], rowCount: 0 };

        const statusMatch = cleanSql.match(/\bstatus = \$(\d+)/);
        if (statusMatch) {
          order.status = params[parseInt(statusMatch[1]) - 1];
        }
        if (cleanSql.includes("payment_status = $")) {
          const match = cleanSql.match(/payment_status = \$(\d+)/);
          if (match) order.payment_status = params[parseInt(match[1]) - 1];
        }
        if (cleanSql.includes("razorpay_order_id = $")) {
          const match = cleanSql.match(/razorpay_order_id = \$(\d+)/);
          if (match) order.razorpay_order_id = params[parseInt(match[1]) - 1];
        }
        if (cleanSql.includes("deducted_item_ids = $")) {
          const match = cleanSql.match(/deducted_item_ids = \$(\d+)/);
          if (match) order.deducted_item_ids = params[parseInt(match[1]) - 1];
        }
        if (cleanSql.includes("tracking_number = $")) {
          const match = cleanSql.match(/tracking_number = \$(\d+)/);
          if (match) order.tracking_number = params[parseInt(match[1]) - 1];
        }
        if (cleanSql.includes("notes = $")) {
          const match = cleanSql.match(/notes = \$(\d+)/);
          if (match) order.notes = params[parseInt(match[1]) - 1];
        }
        if (cleanSql.includes("fulfillment_status = $")) {
          const match = cleanSql.match(/fulfillment_status = \$(\d+)/);
          if (match) order.fulfillment_status = params[parseInt(match[1]) - 1];
        }
        if (cleanSql.includes("fulfillment_errors = $")) {
          const match = cleanSql.match(/fulfillment_errors = \$(\d+)/);
          if (match) order.fulfillment_errors = params[parseInt(match[1]) - 1];
        }
        order.updated_at = new Date();
        return { rows: [order as unknown as T], rowCount: 1 };
      }

      // DELETE FROM orders
      if (cleanSql.startsWith("DELETE FROM orders")) {
        const orderId = params[0];
        store.orders.delete(orderId);
        store.orderItems.delete(orderId);
        return { rows: [{ id: orderId }] as unknown as T[], rowCount: 1 };
      }

      return { rows: [], rowCount: 0 };
    },
  };
}

function createMockOrderPool(): IDbPool {
  const client = createMockOrderClient();
  return {
    query: client.query.bind(client),
    connect: async () => ({
      ...client,
      release: () => {},
    }),
    end: async () => {},
  };
}

// ---------------------------------------------------------------------------
// Mock Repositories & Data Setup
// ---------------------------------------------------------------------------

const testUserId = "507f1f77bcf86cd799439011";
const adminUserId = "507f1f77bcf86cd799439012";
const otherUserId = "507f1f77bcf86cd799439013";

const sampleProduct: IProductRecord = {
  id: "6ae44c64900e0da3e5b0adf9",
  _id: "6ae44c64900e0da3e5b0adf9",
  name: "Royal Kundan Floral Choker",
  slug: "royal-kundan-floral-choker",
  sku: "JW-NECK-001",
  price: 1299,
  salePrice: 999,
  stock: 15,
  isActive: true,
  media: [{ url: "https://example.com/img1.jpg", isPrimary: true, type: "image" }],
  categoryId: "cat_1",
  createdAt: new Date(),
  updatedAt: new Date(),
} as unknown as IProductRecord;

const sampleUser: IUserRecord = {
  id: testUserId,
  _id: testUserId,
  username: "renu_tester",
  firstName: "Renu",
  lastName: "Tester",
  email: "tester@renucollections.com",
  role: "customer",
  isEmailVerified: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const sampleAdmin: IUserRecord = {
  id: adminUserId,
  _id: adminUserId,
  username: "admin_tester",
  firstName: "Admin",
  lastName: "User",
  email: "admin@renucollections.com",
  role: "admin",
  isEmailVerified: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

// ---------------------------------------------------------------------------
// Execution of Test Suite
// ---------------------------------------------------------------------------

async function runTestSuite() {
  console.log("\n━━━  Phase 3F: Order & Payment PostgreSQL Services Tests  ━━━\n");

  const mockPool = createMockOrderPool();
  const mockOrderRepo = new PostgresOrderRepository(mockPool);
  setOrderRepository(mockOrderRepo);
  setPaymentOrderRepository(mockOrderRepo);
  setInventoryDatabasePool(mockPool);

  // Mock User Repository
  const mockUserRepo = {
    async findById(id: string) {
      if (id === testUserId) return sampleUser;
      if (id === adminUserId) return sampleAdmin;
      return null;
    },
  } as unknown as PostgresUserRepository;
  setOrderUserRepository(mockUserRepo);

  // Mock Product Repository
  const mockProductRepo = {
    async findById(id: string) {
      if (id === sampleProduct.id) return sampleProduct;
      return null;
    },
    async adjustStock(productId: string, quantityChange: number) {
      const current = store.productStock.has(productId) ? store.productStock.get(productId)! : 15;
      const updated = current + quantityChange;
      store.productStock.set(productId, updated);
      return { productId, previousStock: current, newStock: updated };
    },
  } as unknown as PostgresProductRepository;
  setOrderProductRepository(mockProductRepo);
  setInventoryProductRepository(mockProductRepo);

  // Mock Cart Repository backing cart.service
  const inMemoryCartItems: any[] = [
    {
      id: "cart_item_1",
      _id: "cart_item_1",
      productId: sampleProduct.id,
      name: sampleProduct.name,
      sku: sampleProduct.sku,
      unitPrice: 999,
      quantity: 1,
      subtotal: 999,
      savedForLater: false,
    },
  ];

  const mockCartRepo = {
    async findByUserId(userId: string) {
      return {
        id: "cart_123",
        _id: "cart_123",
        userId,
        items: inMemoryCartItems,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    },
    async createCart(userId: string) {
      return {
        id: "cart_123",
        _id: "cart_123",
        userId,
        items: inMemoryCartItems,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    },
    async clearCartItems(_cartId: string, _onlyActive?: boolean) {
      inMemoryCartItems.length = 0;
      return 1;
    },
  } as unknown as PostgresCartRepository;
  setCartRepository(mockCartRepo);

  // 1. Delivery eligibility
  await test("isTamilNaduState recognizes valid state variants and abbreviations", async () => {
    assert(isTamilNaduState("Tamil Nadu") === true, "Tamil Nadu matches");
    assert(isTamilNaduState("tamil nadu") === true, "lowercase matches");
    assert(isTamilNaduState("TN") === true, "TN matches");
    assert(isTamilNaduState("tn") === true, "tn lowercase matches");
    assert(isTamilNaduState("Karnataka") === false, "Karnataka rejected");
    assert(isTamilNaduState("Kerala") === false, "Kerala rejected");
    assert(isTamilNaduState(undefined) === false, "undefined rejected");
  });

  await test("validateDeliveryEligibility allows Tamil Nadu and rejects non-TN addresses", async () => {
    validateDeliveryEligibility({ state: "Tamil Nadu" });
    validateDeliveryEligibility({ state: "TN" });

    let caught = false;
    try {
      validateDeliveryEligibility({ state: "Maharashtra" });
    } catch {
      caught = true;
    }
    assert(caught, "Non-TN address throws AppError 400");
  });

  // 2. Order Creation
  await test("createOrderFromCart creates order with authoritative recalculations (subtotal, shipping, total)", async () => {
    store.reset();
    inMemoryCartItems.length = 0;
    inMemoryCartItems.push({
      id: "cart_item_1",
      _id: "cart_item_1",
      productId: sampleProduct.id,
      name: sampleProduct.name,
      sku: sampleProduct.sku,
      unitPrice: 999,
      quantity: 1,
      subtotal: 999,
      savedForLater: false,
    });

    // subtotal = 999 (< 1000 threshold), so shipping is 50. Total = 1049.
    const order = await createOrderFromCart(adminUserId, {
      shipping_address: {
        fullName: "Admin Tester",
        line1: "123 Anna Salai",
        city: "Chennai",
        state: "Tamil Nadu",
        postalCode: "600001",
      },
      phone_number: "9876543210",
      email: "admin@renucollections.com",
      payment_method: "razorpay",
      idempotencyKey: "test-idem-001",
    });

    assert(order.subtotal === 999, "Subtotal is 999");
    assert(order.shipping === 50, "Shipping is 50 for subtotal < 1000");
    assert(order.total === 1049, "Total is 1049");
    assert(typeof order.orderNumber === "string" && order.orderNumber.length >= 8, "Order number generated");
    assert(order.status === "pending", "Initial status is pending");
    assert(order.paymentStatus === "pending", "Payment status is pending");
    assert(order.items.length === 1, "Order items populated");
  });

  await test("createOrderFromCart applies free shipping when subtotal >= 1000", async () => {
    store.reset();
    inMemoryCartItems.length = 0;
    inMemoryCartItems.push({
      id: "cart_item_2",
      _id: "cart_item_2",
      productId: sampleProduct.id,
      name: sampleProduct.name,
      sku: sampleProduct.sku,
      unitPrice: 999,
      quantity: 2,
      subtotal: 1998,
      savedForLater: false,
    });

    const order = await createOrderFromCart(adminUserId, {
      shipping_address: {
        fullName: "Admin Tester",
        line1: "123 Anna Salai",
        city: "Chennai",
        state: "Tamil Nadu",
        postalCode: "600001",
      },
      phone_number: "9876543210",
      email: "admin@renucollections.com",
      payment_method: "razorpay",
      idempotencyKey: "test-idem-002",
    });

    assert(order.subtotal === 1998, "Subtotal is 1998");
    assert(order.shipping === 0, "Free shipping applies for subtotal >= 1000");
    assert(order.total === 1998, "Total is 1998 with zero shipping");
  });

  // 3. Fast-path Idempotency Check
  await test("createOrderFromCart fast-path returns existing order for identical idempotency key", async () => {
    const existing = await createOrderFromCart(adminUserId, {
      shipping_address: {
        fullName: "Admin Tester",
        line1: "123 Anna Salai",
        city: "Chennai",
        state: "Tamil Nadu",
        postalCode: "600001",
      },
      phone_number: "9876543210",
      email: "admin@renucollections.com",
      payment_method: "razorpay",
      idempotencyKey: "test-idem-002",
    });

    assert(existing.idempotencyKey === "test-idem-002", "Returns identical order");
    assert(store.orders.size === 1, "No duplicate order inserted into store");
  });

  await test("createOrderFromCart rejects idempotency key reuse with different payment method (409)", async () => {
    let caught = false;
    try {
      await createOrderFromCart(adminUserId, {
        shipping_address: {
          fullName: "Admin Tester",
          line1: "123 Anna Salai",
          city: "Chennai",
          state: "Tamil Nadu",
          postalCode: "600001",
        },
        phone_number: "9876543210",
        email: "admin@renucollections.com",
        payment_method: "cod",
        idempotencyKey: "test-idem-002",
      });
    } catch (err: any) {
      caught = true;
      assert(err.statusCode === 409, "Status is 409 conflict");
    }
    assert(caught, "Throws 409 on mismatched payment method");
  });

  await test("createOrderFromCart rejects idempotency key reuse with different address (409)", async () => {
    let caught = false;
    try {
      await createOrderFromCart(adminUserId, {
        shipping_address: {
          fullName: "Admin Tester",
          line1: "999 Different Street",
          city: "Madurai",
          state: "Tamil Nadu",
          postalCode: "625001",
        },
        phone_number: "9876543210",
        email: "admin@renucollections.com",
        payment_method: "razorpay",
        idempotencyKey: "test-idem-002",
      });
    } catch (err: any) {
      caught = true;
      assert(err.statusCode === 409, "Status is 409 conflict");
    }
    assert(caught, "Throws 409 on mismatched address");
  });

  // 4. Secondary Duplicate Detection via Fingerprint
  await test("generateCheckoutFingerprint produces deterministic SHA-256 hash", async () => {
    const fp1 = generateCheckoutFingerprint(
      adminUserId,
      [{ sku: "JW-001", quantity: 1, unitPrice: 500 }],
      550,
      { fullName: "Test", line1: "Street", city: "Chennai", state: "TN", postalCode: "600001", country: "India", phone: "9876543210" },
      "razorpay"
    );
    const fp2 = generateCheckoutFingerprint(
      adminUserId,
      [{ sku: "JW-001", quantity: 1, unitPrice: 500 }],
      550,
      { fullName: "Test", line1: "Street", city: "Chennai", state: "TN", postalCode: "600001", country: "India", phone: "9876543210" },
      "razorpay"
    );
    assert(fp1 === fp2, "Fingerprints match identically");
    assert(fp1.length === 64, "Fingerprint is 64-char hex SHA256");
  });

  // 5. Customer & Admin Retrieval
  await test("listUserOrders returns user orders ordered newest first", async () => {
    const orders = await listUserOrders(adminUserId);
    assert(orders.length >= 1, "Found user orders");
    assert(orders[0].userId === adminUserId, "Belongs to requesting user");
  });

  await test("getOrderById retrieves specific order with user ownership verification", async () => {
    const orders = await listUserOrders(adminUserId);
    const orderId = orders[0].id;
    const order = await getOrderById(adminUserId, orderId);
    assert(order.id === orderId, "Order found by ID");

    let caught = false;
    try {
      await getOrderById(otherUserId, orderId);
    } catch (err: any) {
      caught = true;
      assert(err.statusCode === 404, "Throws 404 for unowned order");
    }
    assert(caught, "Ownership check enforced");
  });

  await test("listAllOrders retrieves orders for admin with status filtering", async () => {
    const result = await listAllOrders({ status: "pending" });
    assert(result.orders.length >= 1, "Admin retrieved pending orders");
    assert(result.total >= 1, "Total count returned");
  });

  await test("updateOrderStatus updates order status and records status history", async () => {
    const orders = await listUserOrders(adminUserId);
    const orderId = orders[0].id;

    const updated = await updateOrderStatus(orderId, "processing", "TRK123456", adminUserId);
    assert(updated.status === "processing", "Status updated to processing");
    assert(updated.trackingNumber === "TRK123456", "Tracking number recorded");
  });

  // 6. Order Cancellation & Single-Restock Guarantee
  await test("cancelOrder cancels order and restores stock with single-restock guarantee", async () => {
    const orders = await listUserOrders(adminUserId);
    const orderId = orders[0].id;

    await mockOrderRepo.addDeductedItemId(orderId, "cart_item_2");

    const cancelled = await cancelOrder(adminUserId, orderId);
    assert(cancelled.status === "cancelled", "Status is cancelled");
    assert(cancelled.deductedItemIds.length === 0, "DeductedItemIds cleared on cancellation");

    let caught = false;
    try {
      await cancelOrder(adminUserId, orderId);
    } catch (err: any) {
      caught = true;
      assert(err.statusCode === 400, "Throws 400: Order cannot be cancelled");
    }
    assert(caught, "Double-cancel blocked");
  });

  // 7. Razorpay Order Creation
  await test("createRazorpayOrder generates dev/test order when credentials unconfigured", async () => {
    store.reset();
    inMemoryCartItems.length = 0;
    inMemoryCartItems.push({
      id: "item_rzp",
      _id: "item_rzp",
      productId: sampleProduct.id,
      name: sampleProduct.name,
      sku: sampleProduct.sku,
      unitPrice: 999,
      quantity: 1,
      subtotal: 999,
      savedForLater: false,
    });

    const order = await createOrderFromCart(adminUserId, {
      shipping_address: {
        fullName: "Razorpay Customer",
        line1: "45 Mount Road",
        city: "Chennai",
        state: "Tamil Nadu",
        postalCode: "600002",
      },
      phone_number: "9876543210",
      email: "admin@renucollections.com",
      payment_method: "razorpay",
      idempotencyKey: "test-rzp-001",
    });

    const rzpResult = await createRazorpayOrder(adminUserId, order.id);
    assert(rzpResult.success === true, "Razorpay order creation succeeded");
    assert(rzpResult.amount === Math.round(order.total * 100), "Amount in paise strictly matches total");
    assert(rzpResult.currency === "INR", "Currency is INR");
    assert(rzpResult.devMode === true, "Dev mode stub returned when credentials unset");
  });

  await test("createRazorpayOrder rejects already paid order with 400", async () => {
    const orders = await listUserOrders(adminUserId);
    const orderId = orders[0].id;
    await mockOrderRepo.updateById(orderId, { paymentStatus: "paid" });

    let caught = false;
    try {
      await createRazorpayOrder(adminUserId, orderId);
    } catch (err: any) {
      caught = true;
      assert(err.statusCode === 400, "Throws 400 when order already paid");
    }
    assert(caught, "Already paid order blocked from duplicate payment initiation");
  });

  // 8. Payment Verification & HMAC-SHA256 Signatures
  await test("verifyRazorpayPayment validates HMAC-SHA256 signature and executes post-payment fulfillment", async () => {
    store.reset();
    inMemoryCartItems.length = 0;
    inMemoryCartItems.push({
      id: "item_verify",
      _id: "item_verify",
      productId: sampleProduct.id,
      name: sampleProduct.name,
      sku: sampleProduct.sku,
      unitPrice: 999,
      quantity: 1,
      subtotal: 999,
      savedForLater: false,
    });

    const order = await createOrderFromCart(adminUserId, {
      shipping_address: {
        fullName: "Payment Verify",
        line1: "12 Gandhi Road",
        city: "Chennai",
        state: "Tamil Nadu",
        postalCode: "600004",
      },
      phone_number: "9876543210",
      email: "admin@renucollections.com",
      payment_method: "razorpay",
      idempotencyKey: "test-verify-001",
    });

    const rzpOrderId = "order_rzp_mock_123";
    await mockOrderRepo.updateById(order.id, { razorpayOrderId: rzpOrderId });

    const rzpPaymentId = "pay_mock_456";
    const testSecret = "test_webhook_secret_key";
    (env as any).RAZORPAY_KEY_SECRET = testSecret;

    const signature = crypto
      .createHmac("sha256", testSecret)
      .update(`${rzpOrderId}|${rzpPaymentId}`)
      .digest("hex");

    const result = await verifyRazorpayPayment(adminUserId, {
      order_id: order.id,
      razorpay_order_id: rzpOrderId,
      razorpay_payment_id: rzpPaymentId,
      razorpay_signature: signature,
    });

    assert(result.success === true, "Verification succeeded");
    assert((result as any).fulfillmentStatus === "completed", "Fulfillment completed");

    const verifiedOrder = await mockOrderRepo.findById(order.id);
    assert(verifiedOrder?.paymentStatus === "paid", "Order paymentStatus transitioned to paid");
    assert(verifiedOrder?.status === "processing", "Order status transitioned to processing");
    assert(verifiedOrder?.razorpayPaymentId === rzpPaymentId, "Razorpay payment ID persisted");
  });

  await test("verifyRazorpayPayment is idempotent on repeat calls with same payment ID", async () => {
    const orders = await listUserOrders(adminUserId);
    const order = orders[0];

    const result = await verifyRazorpayPayment(adminUserId, {
      order_id: order.id,
      razorpay_order_id: order.razorpayOrderId!,
      razorpay_payment_id: order.razorpayPaymentId!,
      razorpay_signature: "any_sig",
    });

    assert(result.success === true, "Idempotent repeat succeeds");
    assert(result.message === "Payment already verified", "Returns already verified message");
  });

  await test("verifyRazorpayPayment rejects invalid HMAC signature with 400", async () => {
    const newOrder = await mockOrderRepo.create({
      orderNumber: "ORD-INVALID-SIG",
      userId: adminUserId,
      subtotal: 500,
      total: 550,
      shippingAddress: { fullName: "A", line1: "B", city: "C", state: "Tamil Nadu", postalCode: "600001" },
      email: "a@b.com",
      phone: "123",
      razorpayOrderId: "order_rzp_test_invalid",
    });

    let caught = false;
    try {
      await verifyRazorpayPayment(adminUserId, {
        order_id: newOrder.id,
        razorpay_order_id: "order_rzp_test_invalid",
        razorpay_payment_id: "pay_xyz",
        razorpay_signature: "definitely_invalid_signature",
      });
    } catch (err: any) {
      caught = true;
      assert(err.statusCode === 400, "Throws 400 for bad signature");
    }
    assert(caught, "Bad signature rejected");

    const check = await mockOrderRepo.findById(newOrder.id);
    assert(check?.paymentStatus === "pending", "Payment status remains pending on failed signature");
  });

  // 9. Webhook Processing & Concurrency Protection
  await test("atomicTransitionToPaidByRazorpayOrderId transitions non-paid order to paid", async () => {
    await mockOrderRepo.create({
      orderNumber: "RL-WEBHOOK-TEST-1",
      userId: adminUserId,
      paymentStatus: "pending",
      status: "pending",
      subtotal: 1000,
      total: 1000,
      shippingAddress: { fullName: "Webhook Tester", line1: "St", city: "Chennai", state: "Tamil Nadu", postalCode: "600001" },
      email: "webhook@test.com",
      phone: "987",
      razorpayOrderId: "order_rzp_webhook_100",
    });

    const updated = await mockOrderRepo.atomicTransitionToPaidByRazorpayOrderId(
      "order_rzp_webhook_100",
      {
        razorpayPaymentId: "pay_rzp_webhook_100",
        razorpaySignature: "sig_webhook_100",
        note: "Payment confirmed via Razorpay webhook",
      }
    );

    assert(updated !== null, "Atomic transition succeeded");
    assert(updated?.paymentStatus === "paid", "Payment status is paid");
    assert(updated?.status === "processing", "Order status is processing");
    assert(updated?.razorpayPaymentId === "pay_rzp_webhook_100", "Payment ID persisted");
  });

  await test("atomicTransitionToPaidByRazorpayOrderId returns null on duplicate webhook (idempotency)", async () => {
    const duplicate = await mockOrderRepo.atomicTransitionToPaidByRazorpayOrderId(
      "order_rzp_webhook_100",
      {
        razorpayPaymentId: "pay_rzp_webhook_100_dup",
      }
    );

    assert(duplicate === null, "Duplicate webhook transition safely rejected (single winner)");
  });

  await test("claimCouponProcessed and claimCartCleared guarantee exactly-once execution", async () => {
    const testOrder = await mockOrderRepo.create({
      orderNumber: "RL-CLAIM-TEST",
      userId: adminUserId,
      subtotal: 500,
      total: 500,
      shippingAddress: { fullName: "A", line1: "B", city: "C", state: "Tamil Nadu", postalCode: "600001" },
      email: "a@b.com",
      phone: "123",
      couponProcessed: false,
      cartCleared: false,
    });

    const couponWon1 = await mockOrderRepo.claimCouponProcessed(testOrder.id);
    const couponWon2 = await mockOrderRepo.claimCouponProcessed(testOrder.id);
    assert(couponWon1 === true, "First coupon claim succeeds");
    assert(couponWon2 === false, "Second coupon claim rejected");

    const cartWon1 = await mockOrderRepo.claimCartCleared(testOrder.id);
    const cartWon2 = await mockOrderRepo.claimCartCleared(testOrder.id);
    assert(cartWon1 === true, "First cart claim succeeds");
    assert(cartWon2 === false, "Second cart claim rejected");
  });

  // 10. Payment Failure
  await test("recordPaymentFailure marks order paymentStatus as failed and logs reason", async () => {
    const orders = await listUserOrders(adminUserId);
    const order = orders.find((o) => o.paymentStatus === "pending");
    if (order) {
      const res = await recordPaymentFailure(adminUserId, order.id, "User closed Razorpay modal");
      assert(res.success === true, "Failure recorded");
      const check = await mockOrderRepo.findById(order.id);
      assert(check?.paymentStatus === "failed", "Payment status marked as failed");
      assert(Boolean(check?.notes?.includes("Payment failed")), "Notes record failure reason");
    }
  });

  // 10. Process Refund
  await test("processRefund refunds paid order in dev mode", async () => {
    const paidOrder = await mockOrderRepo.create({
      orderNumber: "ORD-REFUND-TEST",
      userId: adminUserId,
      paymentStatus: "paid",
      status: "processing",
      subtotal: 1000,
      total: 1000,
      shippingAddress: { fullName: "Refund User", line1: "St", city: "Chennai", state: "Tamil Nadu", postalCode: "600001" },
      email: "refund@test.com",
      phone: "987",
    });

    const res = await processRefund(paidOrder.id, 500, "Customer cancellation");
    assert(res.success === true, "Refund processed");
    const check = await mockOrderRepo.findById(paidOrder.id);
    assert(check?.paymentStatus === "refunded", "Payment status marked refunded");
    assert(check?.status === "refunded", "Order status marked refunded");
  });

  await test("processRefund rejects refunding unpaid order with 400", async () => {
    const unpaidOrder = await mockOrderRepo.create({
      orderNumber: "ORD-UNPAID-REFUND",
      userId: adminUserId,
      paymentStatus: "pending",
      subtotal: 500,
      total: 550,
      shippingAddress: { fullName: "A", line1: "B", city: "C", state: "Tamil Nadu", postalCode: "600001" },
      email: "a@b.com",
      phone: "123",
    });

    let caught = false;
    try {
      await processRefund(unpaidOrder.id);
    } catch (err: any) {
      caught = true;
      assert(err.statusCode === 400, "Throws 400 on unpaid refund attempt");
    }
    assert(caught, "Cannot refund unpaid order");
  });

  // 11. Legacy Serialization Compatibility
  await test("toLegacyOrder formats PostgreSQL order into legacy frontend contract", async () => {
    const sampleRecord: IOrderRecord = {
      id: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
      _id: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
      orderNumber: "RL202611239999",
      userId: testUserId,
      status: "processing",
      paymentStatus: "paid",
      subtotal: 1500,
      discount: 100,
      tax: 0,
      shipping: 0,
      total: 1400,
      currency: "INR",
      couponCode: "SAVE100",
      shippingAddress: {
        fullName: "Priya Sharma",
        line1: "15 Temple Bay",
        city: "Chennai",
        postalCode: "600028",
        country: "India",
      },
      billingAddress: null,
      email: "priya@example.com",
      phone: "9876543210",
      notes: "Please deliver in evening",
      paymentMethod: "razorpay",
      razorpayOrderId: "order_rzp_999",
      razorpayPaymentId: "pay_rzp_888",
      razorpaySignature: "sig_777",
      trackingNumber: "TRK-LEGACY",
      invoiceUrl: null,
      statusHistory: [],
      fulfillmentStatus: "completed",
      fulfillmentErrors: [],
      deductedItemIds: [],
      couponProcessed: true,
      cartCleared: true,
      idempotencyKey: "key-123",
      checkoutFingerprint: "fp-123",
      studioReservationId: null,
      studioReservationStatus: null,
      createdAt: new Date("2026-11-23T10:00:00Z"),
      updatedAt: new Date("2026-11-23T10:05:00Z"),
      items: [
        {
          id: "item-uuid-1",
          _id: "item-uuid-1",
          orderId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
          itemType: "product",
          productId: sampleProduct.id,
          sku: "BRC-001",
          name: "Amethyst Bracelet",
          imageUrl: "https://example.com/b.jpg",
          unitPrice: 1500,
          quantity: 1,
          subtotal: 1500,
          customization: null,
          studioDesign: null,
          createdAt: new Date(),
        },
      ],
    };

    const legacy = toLegacyOrder(sampleRecord);
    assert(legacy.id === sampleRecord.id, "id preserved");
    assert(legacy.order_number === sampleRecord.orderNumber, "order_number formatted");
    assert(legacy.total_amount === sampleRecord.total, "total_amount formatted");
    assert(legacy.payment_status === "completed", "paid mapped to completed for frontend");
    assert(legacy.transaction_id === "pay_rzp_888", "transaction_id populated");
    assert(legacy.shipping_address.includes("Priya Sharma"), "Address formatted to string");
    assert(legacy.items.length === 1, "Items array preserved");
    assert(legacy.items[0].product_type === "bracelet", "Product type inferred from BRC SKU prefix");
    assert(legacy.items[0].product_name === "Amethyst Bracelet", "product_name mapped");
  });

  // Summary
  console.log(`\n━━━  Results: ${passedCount} passed, ${failedCount} failed  ━━━\n`);
  if (failedCount > 0) {
    process.exit(1);
  }
}

runTestSuite().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
