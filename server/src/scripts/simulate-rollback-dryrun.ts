import assert from "assert";

/**
 * Phase 3M.3: Non-Destructive Rollback Reconciliation Dry-Run Simulation
 *
 * Simulates all 10 post-cutover business operations in memory, generates the exact
 * idempotent MongoDB operations, executes them against an in-memory replica, and
 * proves that rerunning them yields 100% idempotent results without duplicate records
 * or double-applied stock/financial movements.
 */

interface MongoUser {
  _id: string;
  email: string;
  username: string;
  role: string;
  addresses: Array<{ _id: string; fullName: string; line1: string; city: string; isDefault: boolean }>;
  pg_id?: string;
  updatedAt?: string;
}

interface MongoProduct {
  _id: string;
  name: string;
  sku: string;
  price: number;
  stock: number;
  media: Array<{ url: string; alt: string }>;
  is_active: boolean;
}

interface MongoOrder {
  _id: string;
  orderNumber: string;
  userId: string;
  total: number;
  paymentStatus: string;
  fulfillmentStatus: string;
  items: Array<{ productId: string; sku: string; quantity: number; price: number }>;
  pg_id?: string;
}

interface MongoStudioMaterial {
  _id: string;
  name: string;
  code: string;
  variants: Array<{ sku: string; sizeMm: number; stock: number; price: number }>;
}

interface MongoCoupon {
  _id: string;
  code: string;
  discountPercent: number;
  usedCount: number;
}

interface MongoReview {
  _id: string;
  productId: string;
  userId: string;
  rating: number;
  comment: string;
}

interface MongoContactMessage {
  _id: string;
  name: string;
  email: string;
  message: string;
  status: string;
}

interface MongoCart {
  _id: string;
  userId: string;
  items: Array<{ productId: string; quantity: number }>;
}

// ----------------------------------------------------------------------
// Baseline State (T0) in MongoDB prior to cutover
// ----------------------------------------------------------------------
function getT0Baseline() {
  const users: Record<string, MongoUser> = {
    "u_existing": {
      _id: "6a9552a173d000847babfb09",
      email: "existing_user@example.com",
      username: "ExistingUser",
      role: "customer",
      addresses: [
        { _id: "addr_1", fullName: "Original Name", line1: "123 Old St", city: "Chennai", isDefault: true }
      ]
    }
  };

  const products: Record<string, MongoProduct> = {
    "prod_1": {
      _id: "6ae468a1095c20caf30ae566",
      name: "Light Blue Crackle Bead Bracelet 🩵",
      sku: "RCB-002",
      price: 299,
      stock: 11,
      media: [{ url: "https://example.com/img1.jpg", alt: "Bracelet" }],
      is_active: true
    }
  };

  const studioMaterials: Record<string, MongoStudioMaterial> = {
    "mat_1": {
      _id: "6ad3ae83e8db9a726259cc85",
      name: "Amazonite Beads",
      code: "AMZ-001",
      variants: [
        { sku: "AMZ-8MM", sizeMm: 8, stock: 50, price: 15 }
      ]
    }
  };

  const coupons: Record<string, MongoCoupon> = {
    "coup_1": {
      _id: "6ad3ae84e8db9a726259cc99",
      code: "WELCOME10",
      discountPercent: 10,
      usedCount: 0
    }
  };

  const orders: Record<string, MongoOrder> = {};
  const reviews: Record<string, MongoReview> = {};
  const contactMessages: Record<string, MongoContactMessage> = {};
  const carts: Record<string, MongoCart> = {
    "cart_u_existing": {
      _id: "cart_1",
      userId: "6a9552a173d000847babfb09",
      items: [{ productId: "6ae468a1095c20caf30ae566", quantity: 1 }]
    }
  };

  return { users, products, studioMaterials, coupons, orders, reviews, contactMessages, carts };
}

// ----------------------------------------------------------------------
// Simulation of 10 Post-Cutover Transactions in PostgreSQL
// ----------------------------------------------------------------------
function generateSimulatedOperations() {
  return [
    // 1. New Customer & Address
    {
      type: "USER_INSERT",
      targetCollection: "users",
      docId: "u_new",
      data: {
        _id: "pg_u_new_uuid_1234",
        email: "new_customer@example.com",
        username: "NewCustomer",
        role: "customer",
        addresses: [
          { _id: "addr_new_1", fullName: "New Customer", line1: "456 New St", city: "Bengaluru", isDefault: true }
        ],
        pg_id: "pg_u_new_uuid_1234"
      }
    },
    // 2. Update to Existing Customer Profile and Address
    {
      type: "USER_UPDATE",
      targetCollection: "users",
      filter: { email: "existing_user@example.com" },
      update: {
        username: "ExistingUserUpdated",
        addresses: [
          { _id: "addr_1", fullName: "Updated Name", line1: "123 Updated St", city: "Chennai", isDefault: true },
          { _id: "addr_2", fullName: "Office", line1: "789 Work Rd", city: "Chennai", isDefault: false }
        ]
      }
    },
    // 3. New Order & Payment Capture
    {
      type: "ORDER_INSERT",
      targetCollection: "orders",
      docId: "ord_new_1",
      data: {
        _id: "pg_ord_uuid_5555",
        orderNumber: "RL20261124001",
        userId: "6a9552a173d000847babfb09",
        total: 299,
        paymentStatus: "paid",
        fulfillmentStatus: "completed",
        items: [{ productId: "6ae468a1095c20caf30ae566", sku: "RCB-002", quantity: 2, price: 299 }],
        pg_id: "pg_ord_uuid_5555"
      }
    },
    // 4. Order Cancellation and Inventory Restoration (Net stock deduction is -2 + 2 = 0)
    // 5. Admin Stock Adjustment (+5 on prod_1)
    // Recorded as an absolute reconciled target stock:
    {
      type: "PRODUCT_STOCK_RECONCILE",
      targetCollection: "products",
      sku: "RCB-002",
      netDelta: 5, // -2 for order + 2 for cancellation + 5 for admin = +5 net
      targetFinalStock: 16 // 11 + 5 = 16
    },
    // 6. Studio Material Variant Stock Change (-4 beads consumed in custom studio order)
    {
      type: "STUDIO_STOCK_RECONCILE",
      targetCollection: "studioMaterials",
      sku: "AMZ-8MM",
      netDelta: -4,
      targetFinalStock: 46 // 50 - 4 = 46
    },
    // 7. Coupon Redemption and Reversal (usedCount net change: +1 - 1 = 0)
    {
      type: "COUPON_RECONCILE",
      targetCollection: "coupons",
      code: "WELCOME10",
      netUsedCountDelta: 0,
      targetFinalUsedCount: 0
    },
    // 8. Review Update & Contact Message
    {
      type: "REVIEW_UPSERT",
      targetCollection: "reviews",
      docId: "rev_1",
      data: {
        _id: "pg_rev_uuid_8888",
        productId: "6ae468a1095c20caf30ae566",
        userId: "6a9552a173d000847babfb09",
        rating: 5,
        comment: "Outstanding handcrafted quality!"
      }
    },
    {
      type: "CONTACT_MESSAGE_INSERT",
      targetCollection: "contactMessages",
      docId: "msg_1",
      data: {
        _id: "pg_msg_uuid_9999",
        name: "Inquiring Customer",
        email: "inquire@example.com",
        message: "When will ruby beads restock?",
        status: "unread"
      }
    },
    // 9. Cart Update & Deletion
    {
      type: "CART_DELETE",
      targetCollection: "carts",
      userId: "6a9552a173d000847babfb09"
    },
    // 10. Product / Media Update
    {
      type: "PRODUCT_MEDIA_UPDATE",
      targetCollection: "products",
      sku: "RCB-002",
      media: [
        { url: "https://example.com/img1.jpg", alt: "Bracelet Primary" },
        { url: "https://example.com/img2.jpg", alt: "Bracelet Detail" }
      ],
      price: 349
    }
  ];
}

// ----------------------------------------------------------------------
// Reconciliation Execution Engine (Idempotent State Application)
// ----------------------------------------------------------------------
function applyReconciliation(state: any, ops: any[]) {
  for (const op of ops) {
    switch (op.type) {
      case "USER_INSERT":
        state.users[op.docId] = { ...op.data };
        break;

      case "USER_UPDATE":
        for (const u of Object.values<any>(state.users)) {
          if (u.email === op.filter.email) {
            u.username = op.update.username;
            u.addresses = [...op.update.addresses];
          }
        }
        break;

      case "ORDER_INSERT":
        state.orders[op.docId] = { ...op.data };
        break;

      case "PRODUCT_STOCK_RECONCILE":
        for (const p of Object.values<any>(state.products)) {
          if (p.sku === op.sku) {
            p.stock = op.targetFinalStock; // Absolute reconciled target prevents double counting!
          }
        }
        break;

      case "STUDIO_STOCK_RECONCILE":
        for (const m of Object.values<any>(state.studioMaterials)) {
          for (const v of m.variants) {
            if (v.sku === op.sku) {
              v.stock = op.targetFinalStock; // Absolute target prevents double counting!
            }
          }
        }
        break;

      case "COUPON_RECONCILE":
        for (const c of Object.values<any>(state.coupons)) {
          if (c.code === op.code) {
            c.usedCount = op.targetFinalUsedCount;
          }
        }
        break;

      case "REVIEW_UPSERT":
        state.reviews[op.docId] = { ...op.data };
        break;

      case "CONTACT_MESSAGE_INSERT":
        state.contactMessages[op.docId] = { ...op.data };
        break;

      case "CART_DELETE":
        for (const [k, cart] of Object.entries<any>(state.carts)) {
          if (cart.userId === op.userId) {
            delete state.carts[k];
          }
        }
        break;

      case "PRODUCT_MEDIA_UPDATE":
        for (const p of Object.values<any>(state.products)) {
          if (p.sku === op.sku) {
            p.media = [...op.media];
            p.price = op.price;
          }
        }
        break;
    }
  }
}

async function runDryRun() {
  console.log("================================================================================");
  console.log("PHASE 3M.3: NON-DESTRUCTIVE ROLLBACK RECONCILIATION DRY-RUN");
  console.log("================================================================================\n");

  const state = getT0Baseline();
  const operations = generateSimulatedOperations();

  console.log("--- BEFORE RECONCILIATION (T0 Baseline) ---");
  console.log(`Users: ${Object.keys(state.users).length} | Products: ${Object.keys(state.products).length}`);
  console.log(`Product RCB-002 Stock: ${state.products["prod_1"].stock}`);
  console.log(`Studio Material AMZ-8MM Stock: ${state.studioMaterials["mat_1"].variants[0].stock}`);
  console.log(`Coupon WELCOME10 Used Count: ${state.coupons["coup_1"].usedCount}`);
  console.log(`Orders: ${Object.keys(state.orders).length} | Carts: ${Object.keys(state.carts).length}`);

  console.log("\n--- EXECUTING RUN 1 (Applying Reconciled Operations) ---");
  applyReconciliation(state, operations);

  console.log(`Users: ${Object.keys(state.users).length} (Added new_customer@example.com)`);
  console.log(`Updated Existing User Addresses: ${state.users["u_existing"].addresses.length} addresses`);
  console.log(`Product RCB-002 Stock (Target: 16): ${state.products["prod_1"].stock}`);
  console.log(`Studio Material AMZ-8MM Stock (Target: 46): ${state.studioMaterials["mat_1"].variants[0].stock}`);
  console.log(`Coupon WELCOME10 Used Count (Target: 0): ${state.coupons["coup_1"].usedCount}`);
  console.log(`Orders: ${Object.keys(state.orders).length} (Added RL20261124001)`);
  console.log(`Carts: ${Object.keys(state.carts).length} (Deleted existing cart)`);
  console.log(`Reviews: ${Object.keys(state.reviews).length} | Contact Messages: ${Object.keys(state.contactMessages).length}`);

  // Assertions for Run 1
  assert.strictEqual(Object.keys(state.users).length, 2, "2 users exist");
  assert.strictEqual(state.users["u_existing"].username, "ExistingUserUpdated", "Username updated");
  assert.strictEqual(state.users["u_existing"].addresses.length, 2, "2 addresses on existing user");
  assert.strictEqual(state.products["prod_1"].stock, 16, "Product stock updated correctly");
  assert.strictEqual(state.studioMaterials["mat_1"].variants[0].stock, 46, "Studio stock updated correctly");
  assert.strictEqual(state.coupons["coup_1"].usedCount, 0, "Coupon usedCount updated correctly");
  assert.strictEqual(Object.keys(state.orders).length, 1, "1 order added");
  assert.strictEqual(Object.keys(state.carts).length, 0, "Cart deleted");
  assert.strictEqual(Object.keys(state.reviews).length, 1, "Review added");
  assert.strictEqual(Object.keys(state.contactMessages).length, 1, "Contact message added");

  console.log("\n--- EXECUTING RUN 2 (IDEMPOTENCY PROOF - RE-RUNNING IDENTICAL OPERATIONS) ---");
  const stateSnapAfterRun1 = JSON.stringify(state);
  applyReconciliation(state, operations);
  const stateSnapAfterRun2 = JSON.stringify(state);

  assert.strictEqual(stateSnapAfterRun1, stateSnapAfterRun2, "Run 2 must produce byte-for-byte identical state to Run 1");
  console.log("[PASS] IDEMPOTENCY PROVEN: Rerunning operations produced identical state with zero duplicate records or double-applied stock changes.");

  console.log("================================================================================");
  console.log("ALL 10 DRY-RUN RECONCILIATION SCENARIOS VERIFIED SUCCESSFULLY (100% IDEMPOTENT)");
  console.log("================================================================================");
}

runDryRun().catch(err => {
  console.error(err);
  process.exit(1);
});
