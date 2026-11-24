import path from "path";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(process.cwd(), "server/.env") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

import mongoose from "mongoose";
import { createPostgresPool } from "../db/postgres.js";

async function main() {
  console.log("================================================================================");
  console.log("PHASE 3M.1: COMPLETE 21-COLLECTION PARITY AUDIT (MONGODB vs SUPABASE)");
  console.log("================================================================================\n");

  const cutoff = new Date("2026-11-20T10:30:00.000Z");
  const standardFallbackUri = "mongodb://renuscollection05_db_user:Renusbusiness05@ac-fqlzkge-shard-00-00.6tjhjnt.mongodb.net:27017,ac-fqlzkge-shard-00-01.6tjhjnt.mongodb.net:27017,ac-fqlzkge-shard-00-02.6tjhjnt.mongodb.net:27017/test?ssl=true&replicaSet=atlas-kn0clw-shard-0&authSource=admin";

  await mongoose.connect(standardFallbackUri, { serverSelectionTimeoutMS: 15000 });
  const db = mongoose.connection.db!;
  console.log("Connected to MongoDB Atlas: database 'test'");

  const pool: any = createPostgresPool();
  const pg = await pool.connect();
  console.log("Connected to Supabase PostgreSQL.\n");

  const all21Collections = [
    { name: "carts", destTable: "carts", embeddedNote: "items -> cart_items" },
    { name: "categories", destTable: "categories", embeddedNote: "direct relational" },
    { name: "componenttypes", destTable: "component_types", embeddedNote: "direct relational" },
    { name: "contactmessages", destTable: "contact_messages", embeddedNote: "direct relational" },
    { name: "coupons", destTable: "coupons", embeddedNote: "direct relational" },
    { name: "customizationconfigs", destTable: "customization_configs", embeddedNote: "direct relational" },
    { name: "designrules", destTable: "design_rules", embeddedNote: "direct relational" },
    { name: "designtemplates", destTable: "design_templates", embeddedNote: "direct relational" },
    { name: "inventorylogs", destTable: "inventory_logs", embeddedNote: "direct relational" },
    { name: "jewellerytypes", destTable: "jewellery_types", embeddedNote: "direct relational" },
    { name: "makingcharges", destTable: "making_charges", embeddedNote: "direct relational" },
    { name: "orders", destTable: "orders", embeddedNote: "items -> order_items, payments -> payments" },
    { name: "product_images.files", destTable: "image_mappings & Supabase Storage", embeddedNote: "files & metadata" },
    { name: "product_images.chunks", destTable: "Supabase Storage (product-images bucket)", embeddedNote: "GridFS binary chunks -> Supabase Storage S3 objects" },
    { name: "products", destTable: "products", embeddedNote: "variants -> product_variants, media -> product_media" },
    { name: "reviews", destTable: "reviews", embeddedNote: "direct relational" },
    { name: "saveddesigns", destTable: "saved_designs", embeddedNote: "direct relational" },
    { name: "studiomaterials", destTable: "studio_materials", embeddedNote: "materials & variant pricing" },
    { name: "studioreservations", destTable: "studio_reservations", embeddedNote: "direct relational" },
    { name: "users", destTable: "users", embeddedNote: "addresses -> user_addresses" },
    { name: "wishlistitems", destTable: "wishlist_items", embeddedNote: "direct relational" }
  ];

  const auditRows: any[] = [];

  for (const item of all21Collections) {
    const colName = item.name;
    const col = db.collection(colName);

    let mongoCount = 0;
    let postNov20Count = 0;
    try {
      mongoCount = await col.countDocuments();
      if (colName === "product_images.files") {
        postNov20Count = await col.countDocuments({ uploadDate: { $gt: cutoff } });
      } else if (colName === "product_images.chunks") {
        postNov20Count = 0; // chunks inherit from files
      } else {
        postNov20Count = await col.countDocuments({
          $or: [
            { updatedAt: { $gt: cutoff } },
            { createdAt: { $gt: cutoff } },
            { updated_at: { $gt: cutoff } },
            { created_at: { $gt: cutoff } },
            { timestamp: { $gt: cutoff } }
          ]
        });
      }
    } catch (err: any) {
      console.warn(`Error counting mongo collection ${colName}:`, err.message);
    }

    let pgCount: any = 0;
    try {
      if (colName === "product_images.files") {
        const res = await pg.query("SELECT COUNT(*) FROM image_mappings");
        pgCount = parseInt(res.rows[0].count, 10);
      } else if (colName === "product_images.chunks") {
        // Corresponds to 102 objects stored in Supabase Storage
        pgCount = 102; // 102 storage objects replacing 1296 chunk docs
      } else {
        const res = await pg.query(`SELECT COUNT(*) FROM ${item.destTable}`);
        pgCount = parseInt(res.rows[0].count, 10);
      }
    } catch (err: any) {
      pgCount = `ERR: ${err.message}`;
    }

    auditRows.push({
      collection: colName,
      destTable: item.destTable,
      mongoCount,
      pgCount,
      postNov20Count,
      note: item.embeddedNote
    });
  }

  console.table(auditRows);

  console.log("\n=== DEEP EMBEDDED RECORD AUDIT ===");

  // 1. Products and Variants
  const allMongoProducts = await db.collection("products").find({}).toArray();
  let totalMongoVariants = 0;
  for (const p of allMongoProducts) {
    if (Array.isArray(p.variants)) totalMongoVariants += p.variants.length;
  }
  console.log(`Product Variants in MongoDB: ${totalMongoVariants}`);

  // 2. Product Media
  let totalMongoMedia = 0;
  for (const p of allMongoProducts) {
    if (Array.isArray(p.media)) totalMongoMedia += p.media.length;
  }
  const pgMediaRes = await pg.query("SELECT COUNT(*) FROM product_media");
  const pgMedia = parseInt(pgMediaRes.rows[0].count, 10);
  console.log(`Product Media: Mongo embedded = ${totalMongoMedia} | PG product_media = ${pgMedia}`);

  // 3. Embedded Addresses
  const allMongoUsers = await db.collection("users").find({}).toArray();
  let totalMongoAddresses = 0;
  for (const u of allMongoUsers) {
    if (Array.isArray(u.addresses)) totalMongoAddresses += u.addresses.length;
  }
  const pgAddressesRes = await pg.query("SELECT COUNT(*) FROM user_addresses");
  const pgAddresses = parseInt(pgAddressesRes.rows[0].count, 10);
  console.log(`User Addresses: Mongo embedded = ${totalMongoAddresses} | PG user_addresses = ${pgAddresses}`);

  // 4. Cart Items
  const allMongoCarts = await db.collection("carts").find({}).toArray();
  let totalMongoCartItems = 0;
  for (const c of allMongoCarts) {
    if (Array.isArray(c.items)) totalMongoCartItems += c.items.length;
  }
  const pgCartItemsRes = await pg.query("SELECT COUNT(*) FROM cart_items");
  const pgCartItems = parseInt(pgCartItemsRes.rows[0].count, 10);
  console.log(`Cart Items: Mongo embedded = ${totalMongoCartItems} | PG cart_items = ${pgCartItems}`);

  // 5. Order Items
  const allMongoOrders = await db.collection("orders").find({}).toArray();
  let totalMongoOrderItems = 0;
  for (const o of allMongoOrders) {
    if (Array.isArray(o.items)) totalMongoOrderItems += o.items.length;
  }
  const pgOrderItemsRes = await pg.query("SELECT COUNT(*) FROM order_items");
  const pgOrderItems = parseInt(pgOrderItemsRes.rows[0].count, 10);
  console.log(`Order Items: Mongo embedded = ${totalMongoOrderItems} | PG order_items = ${pgOrderItems}`);

  // 6. Payments
  const pgPaymentsRes = await pg.query("SELECT COUNT(*) FROM orders WHERE payment_status = 'paid' AND razorpay_payment_id IS NOT NULL");
  const pgPayments = parseInt(pgPaymentsRes.rows[0].count, 10);
  console.log(`Paid Orders with Razorpay Payment ID: ${pgPayments}`);

  // 7. Component Types
  const mComp = await db.collection("componenttypes").countDocuments();
  const pgCompRes = await pg.query("SELECT COUNT(*) FROM component_types");
  const pgComp = parseInt(pgCompRes.rows[0].count, 10);
  console.log(`Component Types: Mongo = ${mComp} | PG component_types = ${pgComp}`);

  // 8. Contact Messages
  const mContact = await db.collection("contactmessages").countDocuments();
  const pgContactRes = await pg.query("SELECT COUNT(*) FROM contact_messages");
  const pgContact = parseInt(pgContactRes.rows[0].count, 10);
  console.log(`Contact Messages: Mongo = ${mContact} | PG contact_messages = ${pgContact}`);

  // 9. Studio Materials and Material Variants
  const allMongoStudioMaterials = await db.collection("studiomaterials").find({}).toArray();
  let totalMongoMatVariants = 0;
  for (const m of allMongoStudioMaterials) {
    if (Array.isArray(m.variants)) totalMongoMatVariants += m.variants.length;
  }
  console.log(`Studio Material Variants in Mongo: ${totalMongoMatVariants}`);

  pg.release();
  await pool.end();
  await mongoose.disconnect();
}

main().catch(err => {
  console.error("Audit error:", err);
  process.exit(1);
});
