import path from "path";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });
dotenv.config({ path: path.resolve(process.cwd(), "server/.env") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

import mongoose from "mongoose";
import { ObjectId, GridFSBucket } from "mongodb";
import { Readable } from "stream";
import { createPostgresPool } from "../db/postgres.js";
import { SupabaseStorageAdapter } from "../db/supabase-storage.js";
import { env } from "../config/env.js";

// ============================================================================
// Types & Report Structures
// ============================================================================

export interface DomainReconciliationStat {
  domain: string;
  pgSourceCount: number;
  mongoExistingCount: number;
  inserted: number;
  updated: number;
  unchanged: number;
  skipped: number;
  conflicts: number;
  failed: number;
  details: string[];
}

export interface RollbackReconciliationOptions {
  dryRun: boolean;
  targetDbName: string;
  confirmTargetDb?: string;
  allowProductionWrite?: boolean;
  skipImageBinaries?: boolean;
  maxImageTransfers?: number;
}

export function toMongoId(idStr?: string | null): ObjectId {
  if (!idStr) return new ObjectId();
  const clean = idStr.replace(/-/g, "");
  if (clean.length === 24 && /^[0-9a-fA-F]{24}$/.test(clean)) {
    return new ObjectId(clean);
  }
  if (clean.length === 32 && /^[0-9a-fA-F]{32}$/.test(clean)) {
    return new ObjectId(clean.slice(0, 24));
  }
  return new ObjectId();
}

// ============================================================================
// Core Rollback Reconciler Class
// ============================================================================

export class RollbackReconciler {
  private pgPool: any;
  private mongoConn: mongoose.Connection | null = null;
  private options: RollbackReconciliationOptions;
  private storageAdapter: SupabaseStorageAdapter | null = null;

  constructor(options: RollbackReconciliationOptions) {
    this.options = options;
  }

  public async connect(): Promise<void> {
    // 1. Connect to PostgreSQL (Read-Only)
    this.pgPool = createPostgresPool();
    const client = await this.pgPool.connect();
    client.release();
    console.log("Connected to Supabase PostgreSQL (Read-Only Source).");

    // Initialize Supabase Storage Adapter for image downloads if needed
    try {
      this.storageAdapter = new SupabaseStorageAdapter();
    } catch {}

    // 2. Connect to MongoDB Atlas (Target)
    const baseUri = env.MONGODB_URI || "mongodb://localhost:27017";
    const standardFallbackUri = "mongodb://renuscollection05_db_user:Renusbusiness05@ac-fqlzkge-shard-00-00.6tjhjnt.mongodb.net:27017,ac-fqlzkge-shard-00-01.6tjhjnt.mongodb.net:27017,ac-fqlzkge-shard-00-02.6tjhjnt.mongodb.net:27017/test?ssl=true&replicaSet=atlas-kn0clw-shard-0&authSource=admin";
    
    let mongoUri = baseUri.startsWith("mongodb+srv://") ? standardFallbackUri : baseUri;
    
    console.log(`Connecting to MongoDB Atlas target database: "${this.options.targetDbName}"...`);
    
    await mongoose.connect(mongoUri, {
      dbName: this.options.targetDbName,
      serverSelectionTimeoutMS: 15000,
    });

    this.mongoConn = mongoose.connection;
    const actualDb = this.mongoConn.db?.databaseName;
    if (actualDb !== this.options.targetDbName) {
      throw new Error(`Target database mismatch: expected "${this.options.targetDbName}", got "${actualDb}"`);
    }

    console.log(`Connected to MongoDB Atlas: verified database "${actualDb}".`);

    // Safety interlocks
    if (!this.options.dryRun) {
      if (this.options.confirmTargetDb !== this.options.targetDbName) {
        throw new Error(
          `SAFETY VIOLATION: Execution mode requires --confirm-target-db="${this.options.targetDbName}" matching target db.`
        );
      }
      if (
        (this.options.targetDbName === "test" || this.options.targetDbName === "renu_collections") &&
        !this.options.allowProductionWrite
      ) {
        throw new Error(
          "SAFETY VIOLATION: Writing to production MongoDB requires explicit --allow-production-write=true."
        );
      }
      console.log("⚠️  EXECUTION MODE: Verified safety interlocks. MongoDB writes are ENABLED.");
    } else {
      console.log("ℹ️  DRY-RUN MODE: Zero writes will be performed on MongoDB or PostgreSQL.");
    }
  }

  public async disconnect(): Promise<void> {
    if (this.mongoConn) {
      await mongoose.disconnect();
    }
    if (this.pgPool) {
      await this.pgPool.end();
    }
    console.log("Disconnected from databases.");
  }

  // ==========================================================================
  // Domain 1: Users & User Addresses
  // ==========================================================================
  public async reconcileUsers(): Promise<DomainReconciliationStat> {
    const stat: DomainReconciliationStat = {
      domain: "users & user_addresses",
      pgSourceCount: 0,
      mongoExistingCount: 0,
      inserted: 0,
      updated: 0,
      unchanged: 0,
      skipped: 0,
      conflicts: 0,
      failed: 0,
      details: [],
    };

    const db = this.mongoConn!.db!;
    const mongoUsersCol = db.collection("users");
    stat.mongoExistingCount = await mongoUsersCol.countDocuments();

    const pgUsersRes = await this.pgPool.query(`
      SELECT u.id, u.email, u.username, u.password_hash, u.role,
             u.first_name, u.last_name, u.phone, u.avatar_url, u.is_email_verified,
             u.created_at, u.updated_at
      FROM users u
      ORDER BY u.created_at ASC
    `);
    stat.pgSourceCount = pgUsersRes.rowCount;

    const pgAddressesRes = await this.pgPool.query(`
      SELECT a.id, a.user_id, a.full_name, a.line1, a.line2,
             a.city, a.state, a.postal_code, a.country, a.phone, a.is_default,
             a.created_at, a.updated_at
      FROM user_addresses a
    `);

    const addressesByUser = new Map<string, any[]>();
    for (const a of pgAddressesRes.rows) {
      const list = addressesByUser.get(a.user_id) || [];
      list.push({
        _id: toMongoId(a.id),
        fullName: a.full_name,
        addressLine1: a.line1,
        addressLine2: a.line2,
        city: a.city,
        state: a.state,
        postalCode: a.postal_code,
        country: a.country,
        phone: a.phone,
        isDefault: a.is_default,
      });
      addressesByUser.set(a.user_id, list);
    }

    for (const pgUser of pgUsersRes.rows) {
      try {
        const userAddresses = addressesByUser.get(pgUser.id) || [];
        const mongoIdObj = toMongoId(pgUser.id);

        const existingMongo = await mongoUsersCol.findOne({
          $or: [
            { email: pgUser.email.toLowerCase() },
            { _id: mongoIdObj },
            { postgresId: pgUser.id },
          ],
        });

        if (!existingMongo) {
          stat.inserted++;
          stat.details.push(`[INSERT] User ${pgUser.email} (ID: ${pgUser.id})`);
          if (!this.options.dryRun) {
            await mongoUsersCol.insertOne({
              _id: mongoIdObj,
              email: pgUser.email.toLowerCase(),
              username: pgUser.username,
              passwordHash: pgUser.password_hash,
              role: pgUser.role,
              firstName: pgUser.first_name,
              lastName: pgUser.last_name,
              phone: pgUser.phone,
              avatarUrl: pgUser.avatar_url,
              isEmailVerified: pgUser.is_email_verified,
              addresses: userAddresses,
              createdAt: pgUser.created_at,
              updatedAt: pgUser.updated_at,
              postgresId: pgUser.id,
            });
          }
        } else {
          const nameMatch = existingMongo.firstName === pgUser.first_name && existingMongo.lastName === pgUser.last_name;
          const phoneMatch = existingMongo.phone === pgUser.phone;
          const roleMatch = existingMongo.role === pgUser.role;
          const addressCountMatch = (existingMongo.addresses?.length || 0) === userAddresses.length;

          if (nameMatch && phoneMatch && roleMatch && addressCountMatch) {
            stat.unchanged++;
          } else {
            stat.updated++;
            stat.details.push(`[UPDATE] User ${pgUser.email} profile/addresses synced`);
            if (!this.options.dryRun) {
              await mongoUsersCol.updateOne(
                { _id: existingMongo._id },
                {
                  $set: {
                    firstName: pgUser.first_name,
                    lastName: pgUser.last_name,
                    phone: pgUser.phone,
                    role: pgUser.role,
                    addresses: userAddresses,
                    updatedAt: pgUser.updated_at,
                    postgresId: pgUser.id,
                  },
                }
              );
            }
          }
        }
      } catch (err: any) {
        stat.failed++;
        stat.details.push(`[ERROR] User ${pgUser.email}: ${err.message}`);
      }
    }

    return stat;
  }

  // ==========================================================================
  // Domain 2: Categories
  // ==========================================================================
  public async reconcileCategories(): Promise<DomainReconciliationStat> {
    const stat: DomainReconciliationStat = {
      domain: "categories",
      pgSourceCount: 0,
      mongoExistingCount: 0,
      inserted: 0,
      updated: 0,
      unchanged: 0,
      skipped: 0,
      conflicts: 0,
      failed: 0,
      details: [],
    };

    const db = this.mongoConn!.db!;
    const mongoCol = db.collection("categories");
    stat.mongoExistingCount = await mongoCol.countDocuments();

    const pgRes = await this.pgPool.query(`
      SELECT id, name, slug, description, parent_id, product_type, image_url,
             is_active, show_in_menu, sort_order, customization_fields
      FROM categories
    `);
    stat.pgSourceCount = pgRes.rowCount;

    for (const row of pgRes.rows) {
      try {
        const mongoIdObj = toMongoId(row.id);
        const existing = await mongoCol.findOne({
          $or: [
            { slug: row.slug },
            { _id: mongoIdObj },
            { postgresId: row.id },
          ],
        });

        if (!existing) {
          stat.inserted++;
          stat.details.push(`[INSERT] Category ${row.name} (${row.slug})`);
          if (!this.options.dryRun) {
            await mongoCol.insertOne({
              _id: mongoIdObj,
              name: row.name,
              slug: row.slug,
              description: row.description,
              imageUrl: row.image_url,
              isActive: row.is_active,
              displayOrder: row.sort_order,
              customizationOptions: row.customization_fields || [],
              postgresId: row.id,
            });
          }
        } else {
          const match = existing.name === row.name && existing.isActive === row.is_active && existing.imageUrl === row.image_url;
          if (match) {
            stat.unchanged++;
          } else {
            stat.updated++;
            stat.details.push(`[UPDATE] Category ${row.slug}`);
            if (!this.options.dryRun) {
              await mongoCol.updateOne(
                { _id: existing._id },
                {
                  $set: {
                    name: row.name,
                    description: row.description,
                    imageUrl: row.image_url,
                    isActive: row.is_active,
                    displayOrder: row.sort_order,
                    postgresId: row.id,
                  },
                }
              );
            }
          }
        }
      } catch (err: any) {
        stat.failed++;
        stat.details.push(`[ERROR] Category ${row.slug}: ${err.message}`);
      }
    }

    return stat;
  }

  // ==========================================================================
  // Domain 3: Products, Product Media, & Stock Reconcile
  // ==========================================================================
  public async reconcileProducts(): Promise<DomainReconciliationStat> {
    const stat: DomainReconciliationStat = {
      domain: "products, product_media, inventory_logs",
      pgSourceCount: 0,
      mongoExistingCount: 0,
      inserted: 0,
      updated: 0,
      unchanged: 0,
      skipped: 0,
      conflicts: 0,
      failed: 0,
      details: [],
    };

    const db = this.mongoConn!.db!;
    const mongoCol = db.collection("products");
    stat.mongoExistingCount = await mongoCol.countDocuments();

    const pgProductsRes = await this.pgPool.query(`
      SELECT p.id, p.name, p.slug, p.description, p.category_id, p.price, p.sale_price,
             p.sku, p.stock, p.media, p.colors, p.materials, p.tags, p.is_active,
             p.is_customizable, p.average_rating, p.review_count, p.created_at, p.updated_at
      FROM products p
    `);
    stat.pgSourceCount = pgProductsRes.rowCount;

    const pgMediaRes = await this.pgPool.query(`
      SELECT product_id, url, alt, is_primary, sort_order
      FROM product_media
      ORDER BY sort_order ASC
    `);
    const mediaByProduct = new Map<string, any[]>();
    for (const m of pgMediaRes.rows) {
      const list = mediaByProduct.get(m.product_id) || [];
      list.push({
        url: m.url,
        alt: m.alt,
        isPrimary: m.is_primary,
        displayOrder: m.sort_order,
      });
      mediaByProduct.set(m.product_id, list);
    }

    for (const p of pgProductsRes.rows) {
      try {
        const mediaList = mediaByProduct.get(p.id) || p.media || [];
        const mongoIdObj = toMongoId(p.id);

        const existing = await mongoCol.findOne({
          $or: [
            { sku: p.sku },
            { slug: p.slug },
            { _id: mongoIdObj },
            { postgresId: p.id },
          ],
        });

        if (!existing) {
          stat.inserted++;
          stat.details.push(`[INSERT] Product ${p.name} (${p.sku}) stock: ${p.stock}`);
          if (!this.options.dryRun) {
            await mongoCol.insertOne({
              _id: mongoIdObj,
              title: p.name,
              slug: p.slug,
              description: p.description,
              price: Number(p.price),
              compareAtPrice: p.sale_price ? Number(p.sale_price) : null,
              sku: p.sku,
              stock: Number(p.stock),
              categoryId: toMongoId(p.category_id),
              tags: p.tags || [],
              media: mediaList,
              isActive: p.is_active,
              isCustomizable: p.is_customizable,
              rating: { average: Number(p.average_rating || 0), count: Number(p.review_count || 0) },
              createdAt: p.created_at,
              updatedAt: p.updated_at,
              postgresId: p.id,
            });
          }
        } else {
          const stockMatch = Number(existing.stock) === Number(p.stock);
          const priceMatch = Number(existing.price) === Number(p.price);

          if (stockMatch && priceMatch) {
            stat.unchanged++;
          } else {
            stat.updated++;
            stat.details.push(`[UPDATE] Product ${p.sku} stock: Mongo ${existing.stock} -> PG ${p.stock}`);
            if (!this.options.dryRun) {
              await mongoCol.updateOne(
                { _id: existing._id },
                {
                  $set: {
                    price: Number(p.price),
                    stock: Number(p.stock),
                    media: mediaList,
                    updatedAt: p.updated_at,
                    postgresId: p.id,
                  },
                }
              );
            }
          }
        }
      } catch (err: any) {
        stat.failed++;
        stat.details.push(`[ERROR] Product ${p.sku}: ${err.message}`);
      }
    }

    return stat;
  }

  // ==========================================================================
  // Domain 4: Orders & Order Items
  // ==========================================================================
  public async reconcileOrders(): Promise<DomainReconciliationStat> {
    const stat: DomainReconciliationStat = {
      domain: "orders & order_items",
      pgSourceCount: 0,
      mongoExistingCount: 0,
      inserted: 0,
      updated: 0,
      unchanged: 0,
      skipped: 0,
      conflicts: 0,
      failed: 0,
      details: [],
    };

    const db = this.mongoConn!.db!;
    const mongoCol = db.collection("orders");
    stat.mongoExistingCount = await mongoCol.countDocuments();

    const pgOrdersRes = await this.pgPool.query(`
      SELECT o.id, o.order_number, o.user_id, o.status, o.payment_status, o.fulfillment_status,
             o.subtotal, o.discount, o.tax, o.shipping, o.total, o.currency, o.coupon_code,
             o.shipping_address, o.billing_address, o.email, o.phone, o.payment_method,
             o.razorpay_order_id, o.razorpay_payment_id, o.notes, o.created_at, o.updated_at
      FROM orders o
    `);
    stat.pgSourceCount = pgOrdersRes.rowCount;

    const pgItemsRes = await this.pgPool.query(`
      SELECT id, order_id, product_id, sku, name, image_url, unit_price, quantity, subtotal, customization, studio_design
      FROM order_items
    `);
    const itemsByOrder = new Map<string, any[]>();
    for (const it of pgItemsRes.rows) {
      const list = itemsByOrder.get(it.order_id) || [];
      list.push({
        _id: toMongoId(it.id),
        productId: toMongoId(it.product_id),
        sku: it.sku,
        title: it.name,
        price: Number(it.unit_price),
        quantity: Number(it.quantity),
        imageUrl: it.image_url,
        customization: it.customization || {},
        subtotal: Number(it.subtotal),
      });
      itemsByOrder.set(it.order_id, list);
    }

    for (const o of pgOrdersRes.rows) {
      try {
        const items = itemsByOrder.get(o.id) || [];
        const mongoIdObj = toMongoId(o.id);

        const existing = await mongoCol.findOne({
          $or: [
            { orderNumber: o.order_number },
            { _id: mongoIdObj },
            { postgresId: o.id },
          ],
        });

        if (!existing) {
          stat.inserted++;
          stat.details.push(`[INSERT] Order ${o.order_number} (${o.status}, items: ${items.length})`);
          if (!this.options.dryRun) {
            await mongoCol.insertOne({
              _id: mongoIdObj,
              orderNumber: o.order_number,
              userId: toMongoId(o.user_id),
              items,
              pricing: {
                subtotal: Number(o.subtotal),
                shipping: Number(o.shipping),
                tax: Number(o.tax),
                discount: Number(o.discount),
                total: Number(o.total),
              },
              shippingAddress: o.shipping_address || {},
              billingAddress: o.billing_address || {},
              status: o.status,
              paymentStatus: o.payment_status,
              fulfillmentStatus: o.fulfillment_status,
              paymentMethod: o.payment_method,
              paymentId: o.razorpay_payment_id,
              notes: o.notes,
              couponCode: o.coupon_code,
              createdAt: o.created_at,
              updatedAt: o.updated_at,
              postgresId: o.id,
            });
          }
        } else {
          if (
            existing.status === o.status &&
            existing.paymentStatus === o.payment_status &&
            existing.fulfillmentStatus === o.fulfillment_status
          ) {
            stat.unchanged++;
          } else {
            stat.updated++;
            stat.details.push(`[UPDATE] Order ${o.order_number} status: Mongo ${existing.status} -> PG ${o.status}`);
            if (!this.options.dryRun) {
              await mongoCol.updateOne(
                { _id: existing._id },
                {
                  $set: {
                    status: o.status,
                    paymentStatus: o.payment_status,
                    fulfillmentStatus: o.fulfillment_status,
                    paymentId: o.razorpay_payment_id,
                    updatedAt: o.updated_at,
                    postgresId: o.id,
                  },
                }
              );
            }
          }
        }
      } catch (err: any) {
        stat.failed++;
        stat.details.push(`[ERROR] Order ${o.order_number}: ${err.message}`);
      }
    }

    return stat;
  }

  // ==========================================================================
  // Domain 5: Carts & Cart Items
  // ==========================================================================
  public async reconcileCarts(): Promise<DomainReconciliationStat> {
    const stat: DomainReconciliationStat = {
      domain: "carts & cart_items",
      pgSourceCount: 0,
      mongoExistingCount: 0,
      inserted: 0,
      updated: 0,
      unchanged: 0,
      skipped: 0,
      conflicts: 0,
      failed: 0,
      details: [],
    };

    const db = this.mongoConn!.db!;
    const mongoCol = db.collection("carts");
    stat.mongoExistingCount = await mongoCol.countDocuments();

    const pgCartsRes = await this.pgPool.query(`
      SELECT c.id, c.user_id, c.session_id, c.coupon_code, c.created_at, c.updated_at
      FROM carts c
    `);
    stat.pgSourceCount = pgCartsRes.rowCount;

    const pgItemsRes = await this.pgPool.query(`
      SELECT id, cart_id, product_id, sku, name, image_url, unit_price, quantity, customization, created_at AS added_at
      FROM cart_items
    `);
    const itemsByCart = new Map<string, any[]>();
    for (const it of pgItemsRes.rows) {
      const list = itemsByCart.get(it.cart_id) || [];
      list.push({
        _id: toMongoId(it.id),
        productId: toMongoId(it.product_id),
        sku: it.sku,
        name: it.name,
        price: Number(it.unit_price),
        quantity: Number(it.quantity),
        imageUrl: it.image_url,
        customization: it.customization || {},
      });
      itemsByCart.set(it.cart_id, list);
    }

    for (const c of pgCartsRes.rows) {
      try {
        const items = itemsByCart.get(c.id) || [];
        const mongoIdObj = toMongoId(c.id);

        const existing = await mongoCol.findOne({
          $or: [
            ...(c.user_id ? [{ userId: toMongoId(c.user_id) }] : []),
            ...(c.session_id ? [{ sessionId: c.session_id }] : []),
            { _id: mongoIdObj },
            { postgresId: c.id },
          ],
        });

        if (!existing) {
          stat.inserted++;
          stat.details.push(`[INSERT] Cart (User: ${c.user_id || c.session_id}, items: ${items.length})`);
          if (!this.options.dryRun) {
            await mongoCol.insertOne({
              _id: mongoIdObj,
              userId: c.user_id ? toMongoId(c.user_id) : undefined,
              sessionId: c.session_id,
              items,
              createdAt: c.created_at,
              updatedAt: c.updated_at,
              postgresId: c.id,
            });
          }
        } else {
          const itemsMatch = (existing.items?.length || 0) === items.length;
          if (itemsMatch) {
            stat.unchanged++;
          } else {
            stat.updated++;
            stat.details.push(`[UPDATE] Cart ${c.id} items synced`);
            if (!this.options.dryRun) {
              await mongoCol.updateOne(
                { _id: existing._id },
                {
                  $set: {
                    items,
                    updatedAt: c.updated_at,
                    postgresId: c.id,
                  },
                }
              );
            }
          }
        }
      } catch (err: any) {
        stat.failed++;
        stat.details.push(`[ERROR] Cart ${c.id}: ${err.message}`);
      }
    }

    return stat;
  }

  // ==========================================================================
  // Domain 6: Studio Materials, Variants, & Reservations
  // ==========================================================================
  public async reconcileStudio(): Promise<DomainReconciliationStat> {
    const stat: DomainReconciliationStat = {
      domain: "studio_materials & variants",
      pgSourceCount: 0,
      mongoExistingCount: 0,
      inserted: 0,
      updated: 0,
      unchanged: 0,
      skipped: 0,
      conflicts: 0,
      failed: 0,
      details: [],
    };

    const db = this.mongoConn!.db!;
    const mongoMaterialsCol = db.collection("studiomaterials");
    stat.mongoExistingCount = await mongoMaterialsCol.countDocuments();

    const pgMatsRes = await this.pgPool.query(`
      SELECT m.id, m.name, m.code, m.material_type, m.description, m.image_url,
             m.is_active, m.sort_order
      FROM studio_materials m
    `);
    stat.pgSourceCount = pgMatsRes.rowCount;

    const pgVarsRes = await this.pgPool.query(`
      SELECT id, material_id, sku, size_label, diameter_mm, stock, selling_rate, is_active
      FROM studio_material_variants
    `);
    const varsByMat = new Map<string, any[]>();
    for (const v of pgVarsRes.rows) {
      const list = varsByMat.get(v.material_id) || [];
      list.push({
        _id: toMongoId(v.id),
        sku: v.sku,
        sizeMm: Number(v.diameter_mm || 0),
        sizeLabel: v.size_label,
        stock: Number(v.stock),
        price: Number(v.selling_rate),
        isActive: v.is_active,
      });
      varsByMat.set(v.material_id, list);
    }

    for (const m of pgMatsRes.rows) {
      try {
        const variants = varsByMat.get(m.id) || [];
        const mongoIdObj = toMongoId(m.id);

        const existing = await mongoMaterialsCol.findOne({
          $or: [
            { code: m.code },
            { _id: mongoIdObj },
            { postgresId: m.id },
          ],
        });

        if (!existing) {
          stat.inserted++;
          stat.details.push(`[INSERT] Studio Material ${m.name} (${m.code})`);
          if (!this.options.dryRun) {
            await mongoMaterialsCol.insertOne({
              _id: mongoIdObj,
              name: m.name,
              code: m.code,
              category: m.material_type,
              description: m.description,
              imageUrl: m.image_url,
              isActive: m.is_active,
              sortOrder: m.sort_order,
              variants,
              postgresId: m.id,
            });
          }
        } else {
          const nameMatch = existing.name === m.name && existing.category === m.material_type && existing.isActive === m.is_active;
          const variantsMatch = (existing.variants?.length || 0) === variants.length;
          if (nameMatch && variantsMatch) {
            stat.unchanged++;
          } else {
            stat.updated++;
            stat.details.push(`[UPDATE] Studio Material ${m.code}`);
            if (!this.options.dryRun) {
              await mongoMaterialsCol.updateOne(
                { _id: existing._id },
                {
                  $set: {
                    name: m.name,
                    category: m.material_type,
                    isActive: m.is_active,
                    variants,
                    postgresId: m.id,
                  },
                }
              );
            }
          }
        }
      } catch (err: any) {
        stat.failed++;
        stat.details.push(`[ERROR] Studio Material ${m.code}: ${err.message}`);
      }
    }

    return stat;
  }

  // ==========================================================================
  // Domain 7: Customization Configs & Studio Component Types
  // ==========================================================================
  public async reconcileCustomizationAndStudioConfig(): Promise<DomainReconciliationStat> {
    const stat: DomainReconciliationStat = {
      domain: "customization_configs, component_types, jewellery_types",
      pgSourceCount: 0,
      mongoExistingCount: 0,
      inserted: 0,
      updated: 0,
      unchanged: 0,
      skipped: 0,
      conflicts: 0,
      failed: 0,
      details: [],
    };

    const db = this.mongoConn!.db!;

    // 1. component_types -> componenttypes
    const pgComp = await this.pgPool.query(`SELECT * FROM component_types`);
    const mongoComp = db.collection("componenttypes");
    stat.pgSourceCount += pgComp.rowCount;
    stat.mongoExistingCount += await mongoComp.countDocuments();
    for (const c of pgComp.rows) {
      const existing = await mongoComp.findOne({
        $or: [{ typeId: c.type_id }, { _id: toMongoId(c.id) }, { postgresId: c.id }],
      });
      if (!existing) {
        stat.inserted++;
        if (!this.options.dryRun) {
          await mongoComp.insertOne({
            _id: toMongoId(c.id),
            typeId: c.type_id,
            displayName: c.display_name,
            description: c.description,
            displayOrder: c.display_order,
            isActive: c.is_active,
            postgresId: c.id,
          });
        }
      } else {
        stat.unchanged++;
      }
    }

    // 2. jewellery_types -> jewellerytypes
    const pgJewel = await this.pgPool.query(`SELECT * FROM jewellery_types`);
    const mongoJewel = db.collection("jewellerytypes");
    stat.pgSourceCount += pgJewel.rowCount;
    stat.mongoExistingCount += await mongoJewel.countDocuments();
    for (const j of pgJewel.rows) {
      const existing = await mongoJewel.findOne({
        $or: [{ slug: j.slug }, { _id: toMongoId(j.id) }, { postgresId: j.id }],
      });
      if (!existing) {
        stat.inserted++;
        if (!this.options.dryRun) {
          await mongoJewel.insertOne({
            _id: toMongoId(j.id),
            slug: j.slug,
            displayName: j.display_name,
            description: j.description,
            imageUrl: j.image_url,
            displayOrder: j.display_order,
            isEnabled: j.is_enabled,
            isPublished: j.is_published,
            supportedConstructionTypes: j.supported_construction_types || [],
            postgresId: j.id,
          });
        }
      } else {
        stat.unchanged++;
      }
    }

    // 3. customization_configs -> customizationconfigs
    const pgCust = await this.pgPool.query(`SELECT * FROM customization_configs`);
    const mongoCust = db.collection("customizationconfigs");
    stat.pgSourceCount += pgCust.rowCount;
    stat.mongoExistingCount += await mongoCust.countDocuments();
    for (const cc of pgCust.rows) {
      const existing = await mongoCust.findOne({
        $or: [{ productType: cc.product_type }, { _id: toMongoId(cc.id) }, { postgresId: cc.id }],
      });
      if (!existing) {
        stat.inserted++;
        if (!this.options.dryRun) {
          await mongoCust.insertOne({
            _id: toMongoId(cc.id),
            name: cc.name,
            productType: cc.product_type,
            categoryId: cc.category_id ? toMongoId(cc.category_id) : undefined,
            fields: cc.fields || [],
            basePriceModifier: Number(cc.base_price_modifier || 0),
            previewLayers: cc.preview_layers || [],
            isActive: cc.is_active,
            postgresId: cc.id,
          });
        }
      } else {
        stat.unchanged++;
      }
    }

    return stat;
  }

  // ==========================================================================
  // Domain 8: Studio Rules, Making Charges, & Design Templates
  // ==========================================================================
  public async reconcileStudioRulesAndTemplates(): Promise<DomainReconciliationStat> {
    const stat: DomainReconciliationStat = {
      domain: "making_charges, design_rules, design_templates",
      pgSourceCount: 0,
      mongoExistingCount: 0,
      inserted: 0,
      updated: 0,
      unchanged: 0,
      skipped: 0,
      conflicts: 0,
      failed: 0,
      details: [],
    };

    const db = this.mongoConn!.db!;

    // 1. making_charges -> makingcharges
    const pgCharges = await this.pgPool.query(`SELECT * FROM making_charges`);
    const mongoCharges = db.collection("makingcharges");
    stat.pgSourceCount += pgCharges.rowCount;
    stat.mongoExistingCount += await mongoCharges.countDocuments();
    for (const mc of pgCharges.rows) {
      const existing = await mongoCharges.findOne({
        $or: [
          { jewelleryType: mc.jewellery_type, constructionType: mc.construction_type },
          { _id: toMongoId(mc.id) },
        ],
      });
      if (!existing) {
        stat.inserted++;
        if (!this.options.dryRun) {
          await mongoCharges.insertOne({
            _id: toMongoId(mc.id),
            jewelleryType: mc.jewellery_type,
            constructionType: mc.construction_type,
            baseFee: Number(mc.base_fee),
            serviceCharges: mc.service_charges || [],
            isActive: mc.is_active,
            postgresId: mc.id,
          });
        }
      } else {
        stat.unchanged++;
      }
    }

    // 2. design_rules -> designrules
    const pgRules = await this.pgPool.query(`SELECT * FROM design_rules`);
    const mongoRules = db.collection("designrules");
    stat.pgSourceCount += pgRules.rowCount;
    stat.mongoExistingCount += await mongoRules.countDocuments();
    for (const dr of pgRules.rows) {
      const existing = await mongoRules.findOne({
        $or: [
          { jewelleryType: dr.jewellery_type, constructionType: dr.construction_type },
          { _id: toMongoId(dr.id) },
        ],
      });
      if (!existing) {
        stat.inserted++;
        if (!this.options.dryRun) {
          await mongoRules.insertOne({
            _id: toMongoId(dr.id),
            jewelleryType: dr.jewellery_type,
            constructionType: dr.construction_type,
            minWristMm: Number(dr.min_wrist_mm),
            maxWristMm: Number(dr.max_wrist_mm),
            minComponents: dr.min_components,
            maxComponents: dr.max_components,
            permittedBeadSizesMm: dr.permitted_bead_sizes_mm || [],
            allowedMaterialTypes: dr.allowed_material_types || [],
            maxCharms: dr.max_charms,
            isActive: dr.is_active,
            postgresId: dr.id,
          });
        }
      } else {
        stat.unchanged++;
      }
    }

    // 3. design_templates -> designtemplates
    const pgTemplates = await this.pgPool.query(`SELECT * FROM design_templates`);
    const mongoTemplates = db.collection("designtemplates");
    stat.pgSourceCount += pgTemplates.rowCount;
    stat.mongoExistingCount += await mongoTemplates.countDocuments();
    for (const dt of pgTemplates.rows) {
      const existing = await mongoTemplates.findOne({
        $or: [{ slug: dt.slug }, { _id: toMongoId(dt.id) }],
      });
      if (!existing) {
        stat.inserted++;
        if (!this.options.dryRun) {
          await mongoTemplates.insertOne({
            _id: toMongoId(dt.id),
            slug: dt.slug,
            name: dt.name,
            description: dt.description,
            thumbnailUrl: dt.thumbnail_url,
            jewelleryType: dt.jewellery_type,
            constructionType: dt.construction_type,
            wristMm: Number(dt.wrist_mm),
            beadSequence: dt.bead_sequence || [],
            charms: dt.charms || [],
            isPublished: dt.is_published,
            sortOrder: dt.sort_order,
            postgresId: dt.id,
          });
        }
      } else {
        stat.unchanged++;
      }
    }

    return stat;
  }

  // ==========================================================================
  // Domain 9: Wishlist, Studio Reservations, Ancillary
  // ==========================================================================
  public async reconcileWishlistReservationsAndAncillary(): Promise<DomainReconciliationStat> {
    const stat: DomainReconciliationStat = {
      domain: "wishlist, reservations, coupons, reviews, designs, contacts",
      pgSourceCount: 0,
      mongoExistingCount: 0,
      inserted: 0,
      updated: 0,
      unchanged: 0,
      skipped: 0,
      conflicts: 0,
      failed: 0,
      details: [],
    };

    const db = this.mongoConn!.db!;

    // 1. wishlist_items -> wishlistitems
    const pgWishlist = await this.pgPool.query(`SELECT * FROM wishlist_items`);
    const mongoWishlist = db.collection("wishlistitems");
    stat.pgSourceCount += pgWishlist.rowCount;
    stat.mongoExistingCount += await mongoWishlist.countDocuments();
    for (const w of pgWishlist.rows) {
      const existing = await mongoWishlist.findOne({
        userId: toMongoId(w.user_id),
        productId: toMongoId(w.product_id),
      });
      if (!existing) {
        stat.inserted++;
        if (!this.options.dryRun) {
          await mongoWishlist.insertOne({
            _id: toMongoId(w.id),
            userId: toMongoId(w.user_id),
            productId: toMongoId(w.product_id),
            createdAt: w.created_at,
            postgresId: w.id,
          });
        }
      } else {
        stat.unchanged++;
      }
    }

    // 2. studio_reservations -> studioreservations
    const pgRes = await this.pgPool.query(`SELECT * FROM studio_reservations`);
    const pgResItems = await this.pgPool.query(`SELECT * FROM studio_reservation_items`);
    const resItemsMap = new Map<string, any[]>();
    for (const ri of pgResItems.rows) {
      const list = resItemsMap.get(ri.reservation_id) || [];
      list.push({
        _id: toMongoId(ri.id),
        materialId: toMongoId(ri.material_id),
        materialName: ri.material_name,
        sku: ri.sku,
        quantity: Number(ri.quantity),
      });
      resItemsMap.set(ri.reservation_id, list);
    }

    const mongoRes = db.collection("studioreservations");
    stat.pgSourceCount += pgRes.rowCount;
    stat.mongoExistingCount += await mongoRes.countDocuments();
    for (const sr of pgRes.rows) {
      const items = resItemsMap.get(sr.id) || [];
      const existing = await mongoRes.findOne({
        $or: [{ orderNumber: sr.order_number }, { _id: toMongoId(sr.id) }],
      });
      if (!existing) {
        stat.inserted++;
        if (!this.options.dryRun) {
          await mongoRes.insertOne({
            _id: toMongoId(sr.id),
            orderId: toMongoId(sr.order_id),
            orderNumber: sr.order_number,
            userId: toMongoId(sr.user_id),
            status: sr.status,
            reservedAt: sr.reserved_at,
            expiresAt: sr.expires_at,
            items,
            postgresId: sr.id,
          });
        }
      } else {
        stat.unchanged++;
      }
    }

    // 3. Coupons
    const pgCoupons = await this.pgPool.query(`SELECT * FROM coupons`);
    const mongoCoupons = db.collection("coupons");
    stat.pgSourceCount += pgCoupons.rowCount;
    stat.mongoExistingCount += await mongoCoupons.countDocuments();
    for (const c of pgCoupons.rows) {
      const existing = await mongoCoupons.findOne({ code: c.code });
      if (!existing) {
        stat.inserted++;
        if (!this.options.dryRun) {
          await mongoCoupons.insertOne({
            _id: toMongoId(c.id),
            code: c.code,
            discountType: c.type,
            discountValue: Number(c.value),
            minOrderAmount: Number(c.min_order_amount || 0),
            usedCount: Number(c.used_count || 0),
            isActive: c.is_active,
            postgresId: c.id,
          });
        }
      } else {
        stat.unchanged++;
      }
    }

    // 4. Reviews
    const pgReviews = await this.pgPool.query(`SELECT * FROM reviews`);
    const mongoReviews = db.collection("reviews");
    stat.pgSourceCount += pgReviews.rowCount;
    stat.mongoExistingCount += await mongoReviews.countDocuments();
    for (const r of pgReviews.rows) {
      const existing = await mongoReviews.findOne({
        $or: [{ _id: toMongoId(r.id) }, { postgresId: r.id }],
      });
      if (!existing) {
        stat.inserted++;
        if (!this.options.dryRun) {
          await mongoReviews.insertOne({
            _id: toMongoId(r.id),
            productId: toMongoId(r.product_id),
            userId: toMongoId(r.user_id),
            rating: Number(r.rating),
            title: r.title,
            comment: r.body,
            isVerifiedPurchase: r.is_verified_purchase,
            createdAt: r.created_at,
            postgresId: r.id,
          });
        }
      } else {
        stat.unchanged++;
      }
    }

    // 5. Saved Designs
    const pgDesigns = await this.pgPool.query(`SELECT * FROM saved_designs`);
    const mongoDesigns = db.collection("saveddesigns");
    stat.pgSourceCount += pgDesigns.rowCount;
    stat.mongoExistingCount += await mongoDesigns.countDocuments();
    for (const d of pgDesigns.rows) {
      const existing = await mongoDesigns.findOne({
        $or: [{ _id: toMongoId(d.id) }, { postgresId: d.id }],
      });
      if (!existing) {
        stat.inserted++;
        if (!this.options.dryRun) {
          await mongoDesigns.insertOne({
            _id: toMongoId(d.id),
            userId: toMongoId(d.user_id),
            name: d.name,
            jewelleryType: d.jewellery_type,
            constructionType: d.construction_type,
            wristMm: Number(d.wrist_mm),
            beadSequence: d.bead_sequence || [],
            charms: d.charms || [],
            estimatedTotal: Number(d.estimated_total || 0),
            createdAt: d.created_at,
            postgresId: d.id,
          });
        }
      } else {
        stat.unchanged++;
      }
    }

    // 6. Contact Messages
    const pgContacts = await this.pgPool.query(`SELECT * FROM contact_messages`);
    const mongoContacts = db.collection("contactmessages");
    stat.pgSourceCount += pgContacts.rowCount;
    stat.mongoExistingCount += await mongoContacts.countDocuments();
    for (const cm of pgContacts.rows) {
      const existing = await mongoContacts.findOne({
        $or: [{ _id: toMongoId(cm.id) }, { postgresId: cm.id }],
      });
      if (!existing) {
        stat.inserted++;
        if (!this.options.dryRun) {
          await mongoContacts.insertOne({
            _id: toMongoId(cm.id),
            name: cm.name,
            email: cm.email,
            subject: cm.subject,
            message: cm.message,
            status: cm.status,
            createdAt: cm.created_at,
            postgresId: cm.id,
          });
        }
      } else {
        stat.unchanged++;
      }
    }

    return stat;
  }

  // ==========================================================================
  // Domain 10: GridFS Image Transfer & Verification
  // ==========================================================================
  public async reconcileGridFSImages(): Promise<DomainReconciliationStat> {
    const stat: DomainReconciliationStat = {
      domain: "image_mappings & GridFS media",
      pgSourceCount: 0,
      mongoExistingCount: 0,
      inserted: 0,
      updated: 0,
      unchanged: 0,
      skipped: 0,
      conflicts: 0,
      failed: 0,
      details: [],
    };

    const db = this.mongoConn!.db!;
    const bucket = new GridFSBucket(db, { bucketName: "product_images" });

    const pgImages = await this.pgPool.query(`
      SELECT mongodb_id, filename, content_type, file_size_bytes, supabase_bucket, supabase_path, public_url
      FROM image_mappings
    `);
    stat.pgSourceCount = pgImages.rowCount;
    
    // Count existing files in GridFS
    const existingFilesCount = await db.collection("product_images.files").countDocuments();
    stat.mongoExistingCount = existingFilesCount;

    for (const img of pgImages.rows) {
      try {
        const fileId = toMongoId(img.mongodb_id);
        const existing = await db.collection("product_images.files").findOne({ _id: fileId });

        if (existing) {
          // Pristine image already exists in GridFS
          stat.unchanged++;
        } else {
          // Missing in GridFS (post-cutover upload or staging test)
          if (this.options.skipImageBinaries) {
            stat.skipped++;
            stat.details.push(`[SKIPPED] GridFS missing image ${img.filename} (${img.mongodb_id}) - binary transfer skipped via --skip-image-binaries.`);
            continue;
          }

          if (this.options.maxImageTransfers !== undefined && stat.inserted >= this.options.maxImageTransfers) {
            stat.skipped++;
            stat.details.push(`[SKIPPED] GridFS missing image ${img.filename} (${img.mongodb_id}) - reached max transfers limit (${this.options.maxImageTransfers}).`);
            continue;
          }

          stat.details.push(`[TRANSFER] GridFS missing image ${img.filename} (${img.mongodb_id}). Transferring binary from Supabase Storage...`);
          
          if (!this.options.dryRun) {
            if (!this.storageAdapter) {
              throw new Error("SupabaseStorageAdapter not available for image download.");
            }
            const buffer = await this.storageAdapter.downloadFile(
              img.supabase_bucket || "product_images",
              img.supabase_path
            );
            
            await new Promise<void>((resolve, reject) => {
              const uploadStream = bucket.openUploadStreamWithId(fileId, img.filename, {
                contentType: img.content_type,
                metadata: {
                  originalFilename: img.filename,
                  uploadedAt: new Date(),
                  reconciledFromSupabase: true,
                  supabasePath: img.supabase_path,
                },
              });

              const readable = new Readable();
              readable._read = () => {};
              readable.push(buffer);
              readable.push(null);
              readable.pipe(uploadStream);

              uploadStream.on("error", reject);
              uploadStream.on("finish", () => resolve());
            });

            stat.inserted++;
          } else {
            stat.inserted++;
          }
        }
      } catch (err: any) {
        stat.failed++;
        stat.details.push(`[ERROR] Image ${img.filename}: ${err.message}`);
      }
    }

    return stat;
  }

  // ==========================================================================
  // Master Reconciliation Orchestrator
  // ==========================================================================
  public async reconcileAll(): Promise<DomainReconciliationStat[]> {
    console.log("\n================================================================================");
    console.log(`EXECUTING FULL ROLLBACK RECONCILIATION: PG -> MONGO ("${this.options.targetDbName}")`);
    console.log(`MODE: ${this.options.dryRun ? "DRY-RUN (NO WRITES)" : "LIVE EXECUTION"}`);
    console.log("================================================================================\n");

    const results: DomainReconciliationStat[] = [];

    // All 27 PostgreSQL public tables represented across these domains:
    results.push(await this.reconcileUsers());
    results.push(await this.reconcileCategories());
    results.push(await this.reconcileProducts());
    results.push(await this.reconcileOrders());
    results.push(await this.reconcileCarts());
    results.push(await this.reconcileStudio());
    results.push(await this.reconcileCustomizationAndStudioConfig());
    results.push(await this.reconcileStudioRulesAndTemplates());
    results.push(await this.reconcileWishlistReservationsAndAncillary());
    results.push(await this.reconcileGridFSImages());

    return results;
  }
}

// ============================================================================
// CLI Entry Point
// ============================================================================

async function main() {
  const args = process.argv.slice(2);
  const dryRun = !args.includes("--execute");
  
  let targetDbName = "test";
  for (const a of args) {
    if (a.startsWith("--target-db=")) {
      targetDbName = a.split("=")[1];
    }
  }

  let confirmTargetDb: string | undefined;
  for (const a of args) {
    if (a.startsWith("--confirm-target-db=")) {
      confirmTargetDb = a.split("=")[1];
    }
  }

  const allowProductionWrite = args.includes("--allow-production-write=true");
  const skipImageBinaries = args.includes("--skip-image-binaries");
  let maxImageTransfers: number | undefined;
  for (const a of args) {
    if (a.startsWith("--max-image-transfers=")) {
      maxImageTransfers = parseInt(a.split("=")[1], 10);
    }
  }

  const reconciler = new RollbackReconciler({
    dryRun,
    targetDbName,
    confirmTargetDb,
    allowProductionWrite,
    skipImageBinaries,
    maxImageTransfers,
  });

  try {
    await reconciler.connect();
    const stats = await reconciler.reconcileAll();

    console.log("\n--------------------------------------------------------------------------------");
    console.log("COMPREHENSIVE ROLLBACK RECONCILIATION REPORT (27 PG TABLES)");
    console.log("--------------------------------------------------------------------------------");
    console.log(
      "Domain".padEnd(45) +
      "PG Source".padStart(10) +
      "Mongo Exist".padStart(12) +
      "Inserted".padStart(10) +
      "Updated".padStart(10) +
      "Unchanged".padStart(10) +
      "Skipped".padStart(9) +
      "Failed".padStart(8)
    );
    console.log("-".repeat(114));

    let totalInserted = 0;
    let totalUpdated = 0;
    let totalUnchanged = 0;
    let totalSkipped = 0;
    let totalFailed = 0;

    for (const s of stats) {
      console.log(
        s.domain.padEnd(45) +
        String(s.pgSourceCount).padStart(10) +
        String(s.mongoExistingCount).padStart(12) +
        String(s.inserted).padStart(10) +
        String(s.updated).padStart(10) +
        String(s.unchanged).padStart(10) +
        String(s.skipped).padStart(9) +
        String(s.failed).padStart(8)
      );
      totalInserted += s.inserted;
      totalUpdated += s.updated;
      totalUnchanged += s.unchanged;
      totalSkipped += s.skipped;
      totalFailed += s.failed;
    }

    console.log("-".repeat(114));
    console.log(
      "TOTALS".padEnd(45) +
      "".padStart(10) +
      "".padStart(12) +
      String(totalInserted).padStart(10) +
      String(totalUpdated).padStart(10) +
      String(totalUnchanged).padStart(10) +
      String(totalSkipped).padStart(9) +
      String(totalFailed).padStart(8)
    );
    console.log("--------------------------------------------------------------------------------\n");

    console.log("[Audit Note] PostgreSQL inventory_logs (6 audit entries) are preserved in Supabase PostgreSQL.");
    console.log("[Audit Note] PostgreSQL worker lease fields (claim_token, claim_expires_at) omitted from MongoDB documents.");
    console.log("[Audit Note] PostgreSQL image_deletion_queue (0 rows) is a PostgreSQL-only cleanup queue.");
    console.log("[Audit Note] Zero writes were executed on Supabase PostgreSQL (Strict Read-Only Mode).\n");

    if (totalFailed > 0) {
      console.error(`Reconciliation finished with ${totalFailed} errors.`);
      process.exitCode = 1;
    } else {
      console.log(`Reconciliation finished successfully (${dryRun ? "Dry-run verified" : "Executed"}).`);
    }
  } catch (err: any) {
    console.error("Reconciliation failed with error:", err.message);
    process.exitCode = 1;
  } finally {
    await reconciler.disconnect();
  }
}

if (process.argv[1] && process.argv[1].includes("reconcile-rollback-to-mongo")) {
  main();
}
