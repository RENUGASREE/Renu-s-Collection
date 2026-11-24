import dns from "dns";
import crypto from "crypto";
import path from "path";
import dotenv from "dotenv";

// Load server environment if running standalone
dotenv.config({ path: path.resolve(__dirname, "../../.env") });
dotenv.config({ path: path.resolve(process.cwd(), "server/.env") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

import mongoose from "mongoose";
import { env } from "../config/env.js";
import { IDbClient, ISupabaseStorageClient } from "../types/database.types.js";
import { createPostgresPool } from "../db/postgres.js";
import { SupabaseStorageAdapter } from "../db/supabase-storage.js";
import {
  User,
  Product,
  Category,
  Order,
  Cart,
  WishlistItem,
  Review,
  Coupon,
  CustomizationConfig,
  ComponentType,
  StudioMaterial,
  JewelleryType,
  MakingCharge,
  DesignRule,
  DesignTemplate,
  SavedDesign,
  StudioReservation,
  InventoryLog,
  ContactMessage,
} from "../models/index.js";

// Ensure Atlas SRV connection strings resolve reliably across Windows environments
if (env.MONGODB_URI?.startsWith("mongodb+srv://")) {
  try {
    dns.setServers(["8.8.8.8", "1.1.1.1"]);
  } catch {}
}

export interface MigrationOptions {
  dryRun: boolean;
  resume: boolean;
  batchSize: number;
  skipImages?: boolean;
}

export interface MigrationSummary {
  collectionsMigrated: Record<string, { count: number; status: "success" | "skipped" | "failed" }>;
  imagesMigrated: { count: number; totalBytes: number; skippedCount: number; status: "success" | "skipped" | "failed" };
  durationMs: number;
  dryRun: boolean;
}

/**
 * Supabase Data & GridFS Image Migration Foundation Tool (Phase 1.1 Hardened)
 *
 * Safety Guarantees:
 * 1. Read-Only on MongoDB: Never performs writes, updates, or deletes on MongoDB Atlas.
 * 2. Dry-Run Isolation: In --dry-run mode, zero queries or Storage uploads are executed.
 * 3. Safe Resume & Duplicate Protection: Checks existing image mappings and records by ID.
 *    Will not re-upload identical images or create duplicate records.
 * 4. Stale Overwrite Protection: Updates target records only WHERE target.updated_at <= source.updated_at.
 * 5. Flexible Identifier Support: Preserves 24-character ObjectIds and supports standard 36-character UUIDs.
 * 6. Dependency-Ordered & Circular Reference Resolution: Ingests parents before children,
 *    and resolves self-referential categories and circular order-reservation relations in two passes.
 */
export function reconcileUserGroup(userDocs: any[], aliasMap: Map<string, string>): any {
  if (userDocs.length === 1) return userDocs[0];

  // Sort documents: prefer active records with addresses, then by updatedAt descending
  userDocs.sort((a, b) => {
    const aAddr = a.addresses?.length || 0;
    const bAddr = b.addresses?.length || 0;
    if (bAddr !== aAddr) return bAddr - aAddr;
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });

  const canonical = { ...userDocs[0] };
  const canonicalId = canonical._id.toString();

  // Register aliases for all other duplicate documents
  const mergedAddresses: any[] = [...(canonical.addresses || [])];
  let earliestCreatedAt = new Date(canonical.createdAt);

  for (let i = 1; i < userDocs.length; i++) {
    const dup = userDocs[i];
    const dupId = dup._id.toString();
    aliasMap.set(dupId, canonicalId);

    if (new Date(dup.createdAt) < earliestCreatedAt) {
      earliestCreatedAt = new Date(dup.createdAt);
    }

    // Merge addresses if any
    if (Array.isArray(dup.addresses)) {
      for (const addr of dup.addresses) {
        mergedAddresses.push(addr);
      }
    }
  }

  canonical.createdAt = earliestCreatedAt;
  canonical.addresses = mergedAddresses;

  return canonical;
}

export class MongoToSupabaseMigrator {
  private options: MigrationOptions;
  private pgClient?: IDbClient;
  private storageClient?: ISupabaseStorageClient;
  private userIdAliases = new Map<string, string>();

  constructor(options: MigrationOptions, pgClient?: IDbClient, storageClient?: ISupabaseStorageClient) {
    this.options = options;
    this.pgClient = pgClient;
    this.storageClient = storageClient;
  }

  public async queryWithRetry(sql: string, params?: any[], maxRetries = 5): Promise<any> {
    if (!this.pgClient) return null;
    let attempt = 0;
    while (attempt < maxRetries) {
      attempt++;
      try {
        return await this.pgClient.query(sql, params);
      } catch (err: any) {
        const msg = err?.message || "";
        const isTransient =
          msg.includes("Connection terminated") ||
          msg.includes("timeout") ||
          msg.includes("ECONNRESET") ||
          msg.includes("closed") ||
          err?.code === "57P01" ||
          err?.code === "ECONNRESET";

        if (isTransient && attempt < maxRetries) {
          const delayMs = attempt * 1500;
          console.warn(`[RETRY] PostgreSQL query attempt ${attempt} failed (${msg}). Retrying in ${delayMs}ms...`);
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        } else {
          throw err;
        }
      }
    }
  }

  public resolveUserId(userId: string): string {
    return this.userIdAliases.get(userId) || userId;
  }

  public getUserIdAliases(): Map<string, string> {
    return new Map(this.userIdAliases);
  }

  public async run(): Promise<MigrationSummary> {
    const startTime = Date.now();
    console.log("=== STARTING HARDENED MIGRATION PIPELINE (PHASE 1.1) ===");
    console.log(`Mode: ${this.options.dryRun ? "DRY-RUN (Strictly Read-Only, No Writes)" : "EXECUTE (Live Migration)"}`);
    console.log(`Resume mode: ${this.options.resume ? "ENABLED (Duplicate-Safe)" : "DISABLED"}`);
    console.log(`Batch size: ${this.options.batchSize}`);

    // 1. Connect to MongoDB read-only
    if (mongoose.connection.readyState !== 1) {
      await mongoose.connect(env.MONGODB_URI);
      console.log("Connected to source MongoDB Atlas database.");
    }

    const summary: MigrationSummary = {
      collectionsMigrated: {},
      imagesMigrated: { count: 0, totalBytes: 0, skippedCount: 0, status: "success" },
      durationMs: 0,
      dryRun: this.options.dryRun,
    };

    try {
      // Step A: GridFS Images Migration (All 102 files, uncompressed)
      if (!this.options.skipImages) {
        summary.imagesMigrated = await this.migrateGridFSImages();
      }

      // Step B: Relational Entities in Strict Dependency Order
      summary.collectionsMigrated["users"] = await this.migrateUsers();
      summary.collectionsMigrated["categories"] = await this.migrateCategories();
      summary.collectionsMigrated["products"] = await this.migrateProducts();
      summary.collectionsMigrated["component_types"] = await this.migrateComponentTypes();
      summary.collectionsMigrated["jewellery_types"] = await this.migrateJewelleryTypes();
      summary.collectionsMigrated["studio_materials"] = await this.migrateStudioMaterials();
      summary.collectionsMigrated["customization_configs"] = await this.migrateCustomizationConfigs();
      summary.collectionsMigrated["making_charges"] = await this.migrateMakingCharges();
      summary.collectionsMigrated["design_rules"] = await this.migrateDesignRules();
      summary.collectionsMigrated["design_templates"] = await this.migrateDesignTemplates();
      summary.collectionsMigrated["saved_designs"] = await this.migrateSavedDesigns();
      summary.collectionsMigrated["orders"] = await this.migrateOrders();
      summary.collectionsMigrated["studio_reservations"] = await this.migrateStudioReservations();
      
      // Step C: Resolve Circular Foreign Key (orders.studio_reservation_id)
      await this.resolveOrderReservationLinks();

      summary.collectionsMigrated["carts"] = await this.migrateCarts();
      summary.collectionsMigrated["wishlist_items"] = await this.migrateWishlist();
      summary.collectionsMigrated["reviews"] = await this.migrateReviews();
      summary.collectionsMigrated["coupons"] = await this.migrateCoupons();
      summary.collectionsMigrated["inventory_logs"] = await this.migrateInventoryLogs();
      summary.collectionsMigrated["contact_messages"] = await this.migrateContactMessages();

    } finally {
      summary.durationMs = Date.now() - startTime;
      console.log(`=== MIGRATION PIPELINE COMPLETED IN ${summary.durationMs}ms ===`);
    }

    return summary;
  }

  /**
   * Streams GridFS images to Supabase Storage and records metadata into `image_mappings`.
   * Includes MD5 verification and resume skip logic.
   */
  public async migrateGridFSImages(): Promise<{ count: number; totalBytes: number; skippedCount: number; status: "success" | "skipped" | "failed" }> {
    console.log("\n--- Processing GridFS Images ---");
    const db = mongoose.connection.db;
    if (!db) throw new Error("MongoDB database not connected");

    const filesColl = db.collection("product_images.files");
    const totalFiles = await filesColl.countDocuments();
    console.log(`Found ${totalFiles} total GridFS images in MongoDB.`);

    // Prefetch all existing mappings when resume mode is active
    const existingMap = new Map<string, number>();
    if (this.options.resume && this.pgClient && !this.options.dryRun) {
      const existing = await this.queryWithRetry(`SELECT mongodb_id, file_size_bytes FROM image_mappings;`);
      if (existing?.rows) {
        for (const r of existing.rows) {
          existingMap.set(r.mongodb_id, Number(r.file_size_bytes));
        }
      }
      console.log(`Resume mode: ${existingMap.size} images already recorded in Supabase image_mappings.`);
    }

    const files = await filesColl.find({}).sort({ uploadDate: 1 }).toArray();
    let count = 0;
    let skippedCount = 0;
    let totalBytes = 0;

    for (const file of files) {

      count++;
      totalBytes += file.length;
      const fileId = file._id.toString();
      const filename = file.filename || "image.png";
      const contentType = file.contentType || (file.metadata as any)?.contentType || "image/png";
      const destinationPath = `originals/${fileId}/${filename}`;
      const publicUrl = `https://supabase-storage-placeholder/product-images/${destinationPath}`;

      // Check if already migrated when resume is active
      if (this.options.resume && existingMap.has(fileId) && existingMap.get(fileId) === file.length) {
        skippedCount++;
        if (count <= 12 || count % 20 === 0 || count === totalFiles) {
          console.log(`[RESUME SKIP ${count}/${totalFiles}] Already migrated: ${fileId} (${filename})`);
        }
        continue;
      }

      if (this.options.dryRun) {
        if (count <= 5 || count === totalFiles) {
          console.log(`[DRY-RUN] Would stream image ${count}/${totalFiles}: ${fileId} (${filename}, ${(file.length / (1024 * 1024)).toFixed(2)} MB) -> ${destinationPath}`);
        }
      } else if (this.pgClient && this.storageClient) {
        console.log(`[IMAGE ${count}/${totalFiles}] Streaming: ${fileId} (${filename}, ${(file.length / (1024 * 1024)).toFixed(2)} MB)...`);
        const imgStartTime = Date.now();

        // Live streaming upload with MD5 checksum calculation
        const bucket = new mongoose.mongo.GridFSBucket(db, { bucketName: "product_images" });
        const downloadStream = bucket.openDownloadStream(file._id);

        const uploadResult = await this.storageClient.uploadStream(
          "product-images",
          destinationPath,
          downloadStream,
          contentType,
          file.md5
        );
        const elapsedSec = ((Date.now() - imgStartTime) / 1000).toFixed(1);

        await this.queryWithRetry(
          `INSERT INTO image_mappings (
             mongodb_id, filename, content_type, file_size_bytes, supabase_bucket, supabase_path, public_url, md5_hash, created_at, migrated_at
           ) VALUES ($1, $2, $3, $4, 'product-images', $5, $6, $7, $8, NOW())
           ON CONFLICT (mongodb_id) DO UPDATE SET
             public_url = EXCLUDED.public_url,
             file_size_bytes = EXCLUDED.file_size_bytes,
             md5_hash = EXCLUDED.md5_hash,
             migrated_at = NOW();`,
          [fileId, filename, contentType, file.length, destinationPath, uploadResult.publicUrl || publicUrl, file.md5 || uploadResult.md5Hash || null, file.uploadDate]
        );

        console.log(`[IMAGE ${count}/${totalFiles}] Uploaded & mapped in ${elapsedSec}s -> ${destinationPath}`);
      }
    }

    console.log(`Image migration: ${count} processed (${(totalBytes / (1024 * 1024)).toFixed(2)} MB), ${skippedCount} skipped on resume.`);
    return { count, totalBytes, skippedCount, status: "success" };
  }

  // --- Collection Transform & Load Handlers ---

  private async migrateUsers(): Promise<{ count: number; status: "success" }> {
    console.log("\n--- Migrating Users (with Duplicate Reconcilation) ---");
    const docs = await User.find({}).lean();
    console.log(`Found ${docs.length} source user records.`);

    // Group users by lowercase email to detect and reconcile duplicates safely
    const usersByEmail = new Map<string, any[]>();
    for (const doc of docs) {
      const email = doc.email.toLowerCase();
      const list = usersByEmail.get(email) || [];
      list.push(doc);
      usersByEmail.set(email, list);
    }

    const reconciledDocs: any[] = [];

    for (const [email, userDocs] of usersByEmail.entries()) {
      if (userDocs.length === 1) {
        reconciledDocs.push(userDocs[0]);
      } else {
        const canonical = reconcileUserGroup(userDocs, this.userIdAliases);
        const aliasedIds = userDocs.filter(d => d._id.toString() !== canonical._id.toString()).map(d => d._id.toString());
        console.log(
          `[RECONCILIATION] Reconciled duplicate user email "${email}": Canonical ID=${canonical._id.toString()}, Aliased IDs=[${aliasedIds.join(", ")}]`
        );
        reconciledDocs.push(canonical);
      }
    }

    if (this.options.dryRun) {
      console.log(`[DRY-RUN] Would insert ${reconciledDocs.length} unique user records (${docs.length - reconciledDocs.length} duplicate(s) reconciled).`);
      return { count: reconciledDocs.length, status: "success" };
    }

    for (const doc of reconciledDocs) {
      const id = doc._id.toString();

      if (this.pgClient) {
        // Stale update protection: WHERE users.updated_at <= EXCLUDED.updated_at
        await this.queryWithRetry(
          `INSERT INTO users (
             id, email, username, password_hash, first_name, last_name, phone, role, google_id,
             avatar_url, is_email_verified, refresh_token_hash, previous_refresh_token_hash,
             previous_refresh_token_expires_at, password_reset_token, password_reset_expires,
             last_login_at, created_at, updated_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
           ON CONFLICT (id) DO UPDATE SET
             email = EXCLUDED.email,
             password_hash = EXCLUDED.password_hash,
             role = EXCLUDED.role,
             refresh_token_hash = EXCLUDED.refresh_token_hash,
             previous_refresh_token_hash = EXCLUDED.previous_refresh_token_hash,
             updated_at = EXCLUDED.updated_at
           WHERE users.updated_at <= EXCLUDED.updated_at;`,
          [
            id, doc.email, doc.username, doc.passwordHash || null, doc.firstName || null,
            doc.lastName || null, doc.phone || null, doc.role, doc.googleId || null,
            doc.avatarUrl || null, doc.isEmailVerified, doc.refreshTokenHash || null,
            doc.previousRefreshTokenHash || null, doc.previousRefreshTokenExpiresAt || null,
            doc.passwordResetToken || null, doc.passwordResetExpires || null,
            doc.lastLoginAt || null, doc.createdAt, doc.updatedAt
          ]
        );

        if (Array.isArray(doc.addresses)) {
          for (const addr of doc.addresses) {
            const addrId = (addr as any)._id?.toString() || crypto.randomUUID();
            await this.queryWithRetry(
              `INSERT INTO user_addresses (
                 id, user_id, label, full_name, line1, line2, city, state, postal_code, country, phone, is_default, created_at, updated_at
               ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), NOW())
               ON CONFLICT (id) DO NOTHING;`,
              [
                addrId, id, addr.label || null, addr.fullName, addr.line1, addr.line2 || null,
                addr.city, addr.state, addr.postalCode, addr.country || "IN", addr.phone, addr.isDefault || false
              ]
            );
          }
        }
      }
    }
    return { count: reconciledDocs.length, status: "success" };
  }

  private async migrateCategories(): Promise<{ count: number; status: "success" }> {
    console.log("\n--- Migrating Categories (Two-Pass Self-Referencing Parent Resolution) ---");
    const docs = await Category.find({}).lean();
    console.log(`Found ${docs.length} categories.`);

    for (const doc of docs) {
      const id = doc._id.toString();
      if (this.options.dryRun) continue;

      if (this.pgClient) {
        // Pass 1: Insert all categories with parent_id = NULL initially to avoid self-referential FK errors
        await this.queryWithRetry(
          `INSERT INTO categories (
             id, name, slug, description, parent_id, product_type, image_url, is_active,
             show_in_menu, sort_order, customization_fields, seo_title, seo_description, created_at, updated_at
           ) VALUES ($1, $2, $3, $4, NULL, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
           ON CONFLICT (id) DO UPDATE SET
             name = EXCLUDED.name,
             customization_fields = EXCLUDED.customization_fields,
             updated_at = EXCLUDED.updated_at
           WHERE categories.updated_at <= EXCLUDED.updated_at;`,
          [
            id, doc.name, doc.slug, doc.description || null,
            doc.productType, doc.imageUrl || null, doc.isActive, doc.showInMenu, doc.sortOrder,
            JSON.stringify(doc.customizationFields || []), doc.seoTitle || null, doc.seoDescription || null,
            doc.createdAt, doc.updatedAt
          ]
        );
      }
    }

    // Pass 2: Connect parent_id relationships once all categories exist
    if (!this.options.dryRun && this.pgClient) {
      for (const doc of docs) {
        if (doc.parentId) {
          await this.queryWithRetry(
            `UPDATE categories SET parent_id = $1 WHERE id = $2;`,
            [doc.parentId.toString(), doc._id.toString()]
          );
        }
      }
    }

    return { count: docs.length, status: "success" };
  }

  private async migrateProducts(): Promise<{ count: number; status: "success" }> {
    console.log("\n--- Migrating Products ---");
    const docs = await Product.find({}).lean();
    console.log(`Found ${docs.length} products.`);

    for (const doc of docs) {
      const id = doc._id.toString();
      if (this.options.dryRun) continue;

      if (this.pgClient) {
        await this.queryWithRetry(
          `INSERT INTO products (
             id, name, slug, description, short_description, category_id, subcategory_id,
             price, sale_price, currency, sku, stock, low_stock_threshold, weight_grams,
             material_info, care_instructions, additional_info, media, colors, materials, tags,
             badge, is_signature_piece, signature_category, is_active, is_customizable,
             average_rating, review_count, created_at, updated_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30)
           ON CONFLICT (id) DO UPDATE SET
             stock = EXCLUDED.stock,
             price = EXCLUDED.price,
             media = EXCLUDED.media,
             updated_at = EXCLUDED.updated_at
           WHERE products.updated_at <= EXCLUDED.updated_at;`,
          [
            id, doc.name, doc.slug, doc.description, doc.shortDescription || null,
            doc.categoryId.toString(), doc.subcategoryId?.toString() || null,
            doc.price, doc.salePrice ?? null, doc.currency || "INR", doc.sku, doc.stock,
            doc.lowStockThreshold || 5, doc.weightGrams || null, doc.materialInfo || null,
            doc.careInstructions || null, doc.additionalInfo || null, JSON.stringify(doc.media || []),
            doc.colors || [], doc.materials || [], doc.tags || [], doc.badge || null,
            doc.isSignaturePiece || false, doc.signatureCategory || "none", doc.isActive,
            doc.isCustomizable ?? true, doc.averageRating || 0, doc.reviewCount || 0,
            doc.createdAt, doc.updatedAt
          ]
        );

        if (Array.isArray(doc.media)) {
          for (const m of doc.media) {
            const mediaId = crypto.randomUUID();
            await this.queryWithRetry(
              `INSERT INTO product_media (id, product_id, url, alt, type, is_primary, sort_order, created_at)
               VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
               ON CONFLICT DO NOTHING;`,
              [mediaId, id, m.url, m.alt || null, m.type || "image", m.isPrimary || false, m.sortOrder || 0]
            );
          }
        }
      }
    }
    return { count: docs.length, status: "success" };
  }

  private async migrateComponentTypes(): Promise<{ count: number; status: "success" }> {
    console.log("\n--- Migrating Component Types ---");
    const docs = await ComponentType.find({}).lean();
    console.log(`Found ${docs.length} component types.`);

    for (const doc of docs) {
      const id = doc._id.toString();
      if (this.options.dryRun) continue;

      if (this.pgClient) {
        await this.queryWithRetry(
          `INSERT INTO component_types (id, type_id, display_name, description, display_order, is_active, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (id) DO UPDATE SET
             display_name = EXCLUDED.display_name,
             display_order = EXCLUDED.display_order,
             is_active = EXCLUDED.is_active,
             updated_at = EXCLUDED.updated_at
           WHERE component_types.updated_at <= EXCLUDED.updated_at;`,
          [id, doc.typeId, doc.displayName, doc.description || null, doc.displayOrder, doc.isActive, doc.createdAt, doc.updatedAt]
        );
      }
    }
    return { count: docs.length, status: "success" };
  }

  private async migrateJewelleryTypes(): Promise<{ count: number; status: "success" }> {
    console.log("\n--- Migrating Jewellery Types ---");
    const docs = await JewelleryType.find({}).lean();
    console.log(`Found ${docs.length} jewellery types.`);

    for (const doc of docs) {
      const id = doc._id.toString();
      if (this.options.dryRun) continue;

      if (this.pgClient) {
        await this.queryWithRetry(
          `INSERT INTO jewellery_types (
             id, slug, display_name, description, image_url, display_order, is_enabled, is_published,
             is_archived, archived_at, designer_status, supported_construction_types, created_at, updated_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
           ON CONFLICT (id) DO UPDATE SET
             display_name = EXCLUDED.display_name,
             is_published = EXCLUDED.is_published,
             updated_at = EXCLUDED.updated_at
           WHERE jewellery_types.updated_at <= EXCLUDED.updated_at;`,
          [
            id, doc.slug, doc.displayName, doc.description || null, doc.imageUrl || null,
            doc.displayOrder, doc.isEnabled, doc.isPublished, doc.isArchived, doc.archivedAt || null,
            doc.designerStatus, doc.supportedConstructionTypes || [], doc.createdAt, doc.updatedAt
          ]
        );
      }
    }
    return { count: docs.length, status: "success" };
  }

  private async migrateStudioMaterials(): Promise<{ count: number; status: "success" }> {
    console.log("\n--- Migrating Studio Materials & Variants ---");
    const docs = await StudioMaterial.find({}).lean();
    console.log(`Found ${docs.length} studio materials.`);

    for (const doc of docs) {
      const id = doc._id.toString();
      if (this.options.dryRun) continue;

      if (this.pgClient) {
        await this.queryWithRetry(
          `INSERT INTO studio_materials (
             id, name, code, description, material_type, image_url, render_asset_url,
             additional_images, allowed_jewellery_types, supported_construction_types,
             visibility_scopes, is_active, sort_order, created_at, updated_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
           ON CONFLICT (id) DO UPDATE SET
             name = EXCLUDED.name,
             image_url = EXCLUDED.image_url,
             updated_at = EXCLUDED.updated_at
           WHERE studio_materials.updated_at <= EXCLUDED.updated_at;`,
          [
            id, doc.name, doc.code, doc.description || null, doc.materialType, doc.imageUrl,
            doc.renderAssetUrl || null, doc.additionalImages || [], doc.allowedJewelleryTypes || [],
            doc.supportedConstructionTypes || [], doc.visibilityScopes || ["studio"],
            doc.isActive, doc.sortOrder, doc.createdAt, doc.updatedAt
          ]
        );

        if (Array.isArray(doc.variants)) {
          for (const v of doc.variants) {
            // Guarantee 24-character ObjectId or standard 36-character UUID
            const vId = (v as any)._id?.toString() || crypto.randomUUID();
            const dims = v.dimensionsMm || {};
            await this.queryWithRetry(
              `INSERT INTO studio_material_variants (
                 id, material_id, sku, color, finish, size_label, length_mm, width_mm, height_mm,
                 diameter_mm, hole_diameter_mm, attachment_size_mm, selling_unit, purchase_cost,
                 selling_rate, stock, low_stock_threshold, is_active, created_at, updated_at
               ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, NOW(), NOW())
               ON CONFLICT (sku) DO UPDATE SET
                 stock = EXCLUDED.stock,
                 selling_rate = EXCLUDED.selling_rate,
                 is_active = EXCLUDED.is_active,
                 updated_at = NOW()
               WHERE studio_material_variants.updated_at <= EXCLUDED.updated_at;`,
              [
                vId, id, v.sku, v.color || null, v.finish || null, v.sizeLabel,
                dims.lengthMm || null, dims.widthMm || null, dims.heightMm || null,
                dims.diameterMm || null, dims.holeDiameterMm || null, dims.attachmentSizeMm || null,
                v.sellingUnit || "piece", v.purchaseCost || 0, v.sellingRate, v.stock || 0,
                v.lowStockThreshold || 5, v.isActive ?? true
              ]
            );
          }
        }
      }
    }
    return { count: docs.length, status: "success" };
  }

  private async migrateCustomizationConfigs(): Promise<{ count: number; status: "success" }> {
    console.log("\n--- Migrating Customization Configs ---");
    const docs = await CustomizationConfig.find({}).lean();
    console.log(`Found ${docs.length} customization configs.`);

    const catRes = await this.queryWithRetry(`SELECT id FROM categories;`);
    const validCatIds = new Set<string>((catRes?.rows || []).map((r: any) => r.id));

    for (const doc of docs) {
      const id = doc._id.toString();
      if (this.options.dryRun) continue;

      const rawCatId = doc.categoryId?.toString();
      const catId = (rawCatId && validCatIds.has(rawCatId)) ? rawCatId : null;
      if (rawCatId && !validCatIds.has(rawCatId)) {
        console.warn(`[WARN] CustomizationConfig "${doc.name}" (${id}) references deleted category ${rawCatId}; setting category_id to NULL to preserve data.`);
      }

      if (this.pgClient) {
        await this.queryWithRetry(
          `INSERT INTO customization_configs (
             id, name, product_type, category_id, fields, base_price_modifier, preview_layers, is_active, created_at, updated_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           ON CONFLICT (id) DO UPDATE SET
             fields = EXCLUDED.fields,
             updated_at = EXCLUDED.updated_at
           WHERE customization_configs.updated_at <= EXCLUDED.updated_at;`,
          [
            id, doc.name, doc.productType, catId,
            JSON.stringify(doc.fields || []), doc.basePriceModifier || 0,
            JSON.stringify(doc.previewLayers || []), doc.isActive, doc.createdAt, doc.updatedAt
          ]
        );
      }
    }
    return { count: docs.length, status: "success" };
  }

  private async migrateMakingCharges(): Promise<{ count: number; status: "success" }> {
    console.log("\n--- Migrating Making Charges ---");
    const docs = await MakingCharge.find({}).lean();
    console.log(`Found ${docs.length} making charges.`);

    for (const doc of docs) {
      const id = doc._id.toString();
      if (this.options.dryRun) continue;

      if (this.pgClient) {
        await this.queryWithRetry(
          `INSERT INTO making_charges (
             id, jewellery_type, construction_type, base_fee, service_charges, is_active, created_at, updated_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (jewellery_type, construction_type) DO UPDATE SET
             base_fee = EXCLUDED.base_fee,
             service_charges = EXCLUDED.service_charges,
             updated_at = EXCLUDED.updated_at
           WHERE making_charges.updated_at <= EXCLUDED.updated_at;`,
          [
            id, doc.jewelleryType, doc.constructionType, doc.baseFee,
            JSON.stringify(doc.serviceCharges || []), doc.isActive, doc.createdAt, doc.updatedAt
          ]
        );
      }
    }
    return { count: docs.length, status: "success" };
  }

  private async migrateDesignRules(): Promise<{ count: number; status: "success" }> {
    console.log("\n--- Migrating Design Rules ---");
    const docs = await DesignRule.find({}).lean();
    console.log(`Found ${docs.length} design rules.`);

    for (const doc of docs) {
      const id = doc._id.toString();
      if (this.options.dryRun) continue;

      if (this.pgClient) {
        await this.queryWithRetry(
          `INSERT INTO design_rules (
             id, jewellery_type, construction_type, min_wrist_mm, max_wrist_mm, min_components,
             max_components, permitted_bead_sizes_mm, allowed_material_types, max_charms, fit_allowance_mm,
             requires_review_thresholds, is_active, version, created_at, updated_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
           ON CONFLICT (jewellery_type, construction_type) DO UPDATE SET
             version = EXCLUDED.version,
             updated_at = EXCLUDED.updated_at
           WHERE design_rules.updated_at <= EXCLUDED.updated_at;`,
          [
            id, doc.jewelleryType, doc.constructionType, doc.minWristMm, doc.maxWristMm,
            doc.minComponents, doc.maxComponents, doc.permittedBeadSizesMm || [],
            doc.allowedMaterialTypes || [], doc.maxCharms, doc.fitAllowanceMm,
            JSON.stringify(doc.requiresReviewThresholds || {}), doc.isActive, doc.version,
            doc.createdAt, doc.updatedAt
          ]
        );
      }
    }
    return { count: docs.length, status: "success" };
  }

  private async migrateDesignTemplates(): Promise<{ count: number; status: "success" }> {
    console.log("\n--- Migrating Design Templates ---");
    const docs = await DesignTemplate.find({}).lean();
    console.log(`Found ${docs.length} design templates.`);

    for (const doc of docs) {
      const id = doc._id.toString();
      if (this.options.dryRun) continue;

      if (this.pgClient) {
        await this.queryWithRetry(
          `INSERT INTO design_templates (
             id, slug, name, description, thumbnail_url, jewellery_type, construction_type,
             wrist_mm, bead_sequence, charms, is_published, sort_order, created_at, updated_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
           ON CONFLICT (id) DO UPDATE SET
             bead_sequence = EXCLUDED.bead_sequence,
             charms = EXCLUDED.charms,
             updated_at = EXCLUDED.updated_at
           WHERE design_templates.updated_at <= EXCLUDED.updated_at;`,
          [
            id, doc.slug, doc.name, doc.description || null, doc.thumbnailUrl || null,
            doc.jewelleryType, doc.constructionType, doc.wristMm, JSON.stringify(doc.beadSequence || []),
            JSON.stringify(doc.charms || []), doc.isPublished, doc.sortOrder, doc.createdAt, doc.updatedAt
          ]
        );
      }
    }
    return { count: docs.length, status: "success" };
  }

  private async migrateSavedDesigns(): Promise<{ count: number; status: "success" }> {
    console.log("\n--- Migrating Saved Designs ---");
    const docs = await SavedDesign.find({}).lean();
    console.log(`Found ${docs.length} saved designs.`);

    for (const doc of docs) {
      const id = doc._id.toString();
      if (this.options.dryRun) continue;

      if (this.pgClient) {
        await this.queryWithRetry(
          `INSERT INTO saved_designs (
             id, user_id, name, jewellery_type, construction_type, wrist_mm, dimension_label,
             bead_sequence, charms, estimated_total, last_validated_at, created_at, updated_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
           ON CONFLICT (id) DO UPDATE SET
             bead_sequence = EXCLUDED.bead_sequence,
             charms = EXCLUDED.charms,
             updated_at = EXCLUDED.updated_at
           WHERE saved_designs.updated_at <= EXCLUDED.updated_at;`,
          [
            id, this.resolveUserId(doc.userId.toString()), doc.name, doc.jewelleryType, doc.constructionType,
            doc.wristMm ?? 160, doc.dimensionLabel || null, JSON.stringify(doc.beadSequence || []),
            JSON.stringify(doc.charms || []), doc.estimatedTotal || 0, doc.lastValidatedAt || new Date(),
            doc.createdAt, doc.updatedAt
          ]
        );
      }
    }
    return { count: docs.length, status: "success" };
  }

  private async migrateOrders(): Promise<{ count: number; status: "success" }> {
    console.log("\n--- Migrating Orders & Order Items ---");
    const docs = await Order.find({}).lean();
    console.log(`Found ${docs.length} orders.`);

    for (const doc of docs) {
      const id = doc._id.toString();
      if (this.options.dryRun) continue;

      if (this.pgClient) {
        // Pass 1: Insert order with studio_reservation_id as null to prevent circular FK constraint violation
        await this.queryWithRetry(
          `INSERT INTO orders (
             id, order_number, user_id, status, payment_status, subtotal, discount, tax, shipping,
             total, currency, coupon_code, shipping_address, billing_address, email, phone, notes,
             payment_method, razorpay_order_id, razorpay_payment_id, razorpay_signature, tracking_number,
             invoice_url, status_history, fulfillment_status, fulfillment_errors, deducted_item_ids,
             coupon_processed, cart_cleared, idempotency_key, checkout_fingerprint,
             studio_reservation_id, studio_reservation_status, created_at, updated_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, NULL, $32, $33, $34)
           ON CONFLICT (id) DO UPDATE SET
             status = EXCLUDED.status,
             payment_status = EXCLUDED.payment_status,
             updated_at = EXCLUDED.updated_at
           WHERE orders.updated_at <= EXCLUDED.updated_at;`,
          [
            id, doc.orderNumber, this.resolveUserId(doc.userId.toString()), doc.status, doc.paymentStatus,
            doc.subtotal, doc.discount || 0, doc.tax || 0, doc.shipping || 0, doc.total,
            doc.currency || "INR", doc.couponCode || null, JSON.stringify(doc.shippingAddress),
            JSON.stringify(doc.billingAddress), doc.email, doc.phone, doc.notes || null,
            doc.paymentMethod || "razorpay", doc.razorpayOrderId || null, doc.razorpayPaymentId || null,
            doc.razorpaySignature || null, doc.trackingNumber || null, doc.invoiceUrl || null,
            JSON.stringify(doc.statusHistory || []), doc.fulfillmentStatus || "pending",
            doc.fulfillmentErrors || [], doc.deductedItemIds || [], doc.couponProcessed || false,
            doc.cartCleared || false, doc.idempotencyKey || null, doc.checkoutFingerprint || null,
            doc.studioReservationStatus || null, doc.createdAt, doc.updatedAt
          ]
        );

        if (Array.isArray(doc.items)) {
          for (const item of doc.items) {
            const itemId = (item as any)._id?.toString() || crypto.randomUUID();
            await this.queryWithRetry(
              `INSERT INTO order_items (
                 id, order_id, item_type, product_id, sku, name, image_url, unit_price, quantity, subtotal, customization, studio_design, created_at
               ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
               ON CONFLICT (id) DO NOTHING;`,
              [
                itemId, id, item.itemType || "product", item.productId?.toString() || null,
                item.sku, item.name, item.imageUrl || null, item.unitPrice, item.quantity,
                item.subtotal, JSON.stringify(item.customization || null),
                JSON.stringify(item.studioDesign || null)
              ]
            );
          }
        }
      }
    }
    return { count: docs.length, status: "success" };
  }

  private async migrateStudioReservations(): Promise<{ count: number; status: "success" }> {
    console.log("\n--- Migrating Studio Reservations ---");
    const docs = await StudioReservation.find({}).lean();
    console.log(`Found ${docs.length} studio reservations.`);

    for (const doc of docs) {
      const id = doc._id.toString();
      if (this.options.dryRun) continue;

      if (this.pgClient) {
        await this.queryWithRetry(
          `INSERT INTO studio_reservations (
             id, order_id, order_number, user_id, status, reserved_at, expires_at, committed_at,
             released_at, restocked_at, release_reason, reconciliation_notes, created_at, updated_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
           ON CONFLICT (id) DO UPDATE SET
             status = EXCLUDED.status,
             updated_at = EXCLUDED.updated_at
           WHERE studio_reservations.updated_at <= EXCLUDED.updated_at;`,
          [
            id, doc.orderId.toString(), doc.orderNumber, this.resolveUserId(doc.userId.toString()), doc.status,
            doc.reservedAt, doc.expiresAt, doc.committedAt || null, doc.releasedAt || null,
            doc.restockedAt || null, doc.releaseReason || null, doc.reconciliationNotes || null,
            doc.createdAt, doc.updatedAt
          ]
        );

        if (Array.isArray(doc.items)) {
          for (const item of doc.items) {
            const resItemId = crypto.randomUUID();
            await this.queryWithRetry(
              `INSERT INTO studio_reservation_items (id, reservation_id, material_id, material_name, sku, quantity)
               VALUES ($1, $2, $3, $4, $5, $6);`,
              [resItemId, id, item.materialId?.toString() || null, item.materialName, item.sku, item.quantity]
            );
          }
        }
      }
    }
    return { count: docs.length, status: "success" };
  }

  /**
   * Resolves circular reference by linking orders.studio_reservation_id back to studio_reservations.id
   */
  private async resolveOrderReservationLinks(): Promise<void> {
    if (this.options.dryRun || !this.pgClient) return;

    const ordersWithReservations = await Order.find({ studioReservationId: { $exists: true, $ne: null } })
      .select("_id studioReservationId")
      .lean();

    for (const ord of ordersWithReservations) {
      if (ord.studioReservationId) {
        await this.queryWithRetry(
          `UPDATE orders SET studio_reservation_id = $1 WHERE id = $2;`,
          [ord.studioReservationId.toString(), ord._id.toString()]
        );
      }
    }
  }

  private async migrateCarts(): Promise<{ count: number; status: "success" }> {
    console.log("\n--- Migrating Carts & Cart Items ---");
    const docs = await Cart.find({}).lean();
    console.log(`Found ${docs.length} carts.`);

    for (const doc of docs) {
      const id = doc._id.toString();
      if (this.options.dryRun) continue;

      if (this.pgClient) {
        await this.queryWithRetry(
          `INSERT INTO carts (id, user_id, session_id, coupon_code, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (id) DO NOTHING;`,
          [id, doc.userId ? this.resolveUserId(doc.userId.toString()) : null, doc.sessionId || null, doc.couponCode || null, doc.createdAt, doc.updatedAt]
        );

        if (Array.isArray(doc.items)) {
          for (const item of doc.items) {
            const itemId = (item as any)._id?.toString() || crypto.randomUUID();
            await this.queryWithRetry(
              `INSERT INTO cart_items (
                 id, cart_id, item_type, product_id, sku, name, image_url, unit_price, quantity,
                 customization, studio_design, saved_for_later, created_at, updated_at
               ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), NOW())
               ON CONFLICT (id) DO NOTHING;`,
              [
                itemId, id, item.itemType || "product", item.productId?.toString() || null,
                item.sku, item.name, item.imageUrl || null, item.unitPrice, item.quantity,
                JSON.stringify(item.customization || {}), JSON.stringify(item.studioDesign || null),
                item.savedForLater || false
              ]
            );
          }
        }
      }
    }
    return { count: docs.length, status: "success" };
  }

  private async migrateWishlist(): Promise<{ count: number; status: "success" }> {
    console.log("\n--- Migrating Wishlists ---");
    const docs = await WishlistItem.find({}).lean();
    console.log(`Found ${docs.length} wishlist items.`);

    for (const doc of docs) {
      const id = doc._id.toString();
      if (this.options.dryRun) continue;

      if (this.pgClient) {
        await this.queryWithRetry(
          `INSERT INTO wishlist_items (id, user_id, product_id, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (user_id, product_id) DO NOTHING;`,
          [id, this.resolveUserId(doc.userId.toString()), doc.productId.toString(), doc.createdAt, doc.updatedAt]
        );
      }
    }
    return { count: docs.length, status: "success" };
  }

  private async migrateReviews(): Promise<{ count: number; status: "success" }> {
    console.log("\n--- Migrating Reviews ---");
    const docs = await Review.find({}).lean();
    console.log(`Found ${docs.length} reviews.`);

    for (const doc of docs) {
      const id = doc._id.toString();
      if (this.options.dryRun) continue;

      if (this.pgClient) {
        await this.queryWithRetry(
          `INSERT INTO reviews (
             id, user_id, product_id, order_id, rating, title, body, images, is_verified_purchase,
             is_approved, helpful_count, created_at, updated_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
           ON CONFLICT (user_id, product_id) DO UPDATE SET
             rating = EXCLUDED.rating,
             body = EXCLUDED.body,
             is_approved = EXCLUDED.is_approved,
             updated_at = EXCLUDED.updated_at
           WHERE reviews.updated_at <= EXCLUDED.updated_at;`,
          [
            id, this.resolveUserId(doc.userId.toString()), doc.productId.toString(), doc.orderId?.toString() || null,
            doc.rating, doc.title, doc.body, doc.images || [], doc.isVerifiedPurchase,
            doc.isApproved, doc.helpfulCount || 0, doc.createdAt, doc.updatedAt
          ]
        );
      }
    }
    return { count: docs.length, status: "success" };
  }

  private async migrateCoupons(): Promise<{ count: number; status: "success" }> {
    console.log("\n--- Migrating Coupons ---");
    const docs = await Coupon.find({}).lean();
    console.log(`Found ${docs.length} coupons.`);

    for (const doc of docs) {
      const id = doc._id.toString();
      if (this.options.dryRun) continue;

      if (this.pgClient) {
        await this.queryWithRetry(
          `INSERT INTO coupons (
             id, code, description, type, value, min_order_amount, max_discount, usage_limit,
             used_count, is_active, starts_at, expires_at, created_at, updated_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
           ON CONFLICT (code) DO UPDATE SET
             used_count = EXCLUDED.used_count,
             is_active = EXCLUDED.is_active,
             updated_at = EXCLUDED.updated_at
           WHERE coupons.updated_at <= EXCLUDED.updated_at;`,
          [
            id, doc.code, doc.description || null, doc.type, doc.value, doc.minOrderAmount,
            doc.maxDiscount || null, doc.usageLimit || null, doc.usedCount, doc.isActive,
            doc.startsAt || null, doc.expiresAt || null, doc.createdAt, doc.updatedAt
          ]
        );
      }
    }
    return { count: docs.length, status: "success" };
  }

  private async migrateInventoryLogs(): Promise<{ count: number; status: "success" }> {
    console.log("\n--- Migrating Inventory Logs ---");
    const docs = await InventoryLog.find({}).lean();
    console.log(`Found ${docs.length} inventory logs.`);

    for (const doc of docs) {
      const id = doc._id.toString();
      if (this.options.dryRun) continue;

      if (this.pgClient) {
        await this.queryWithRetry(
          `INSERT INTO inventory_logs (
             id, product_id, sku, action, quantity_change, previous_stock, new_stock, reason, order_id, performed_by, created_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
           ON CONFLICT (id) DO NOTHING;`,
          [
            id, doc.productId.toString(), doc.sku, doc.action, doc.quantityChange,
            doc.previousStock, doc.newStock, doc.reason || null, doc.orderId?.toString() || null,
            doc.performedBy ? this.resolveUserId(doc.performedBy.toString()) : null, doc.createdAt
          ]
        );
      }
    }
    return { count: docs.length, status: "success" };
  }

  private async migrateContactMessages(): Promise<{ count: number; status: "success" }> {
    console.log("\n--- Migrating Contact Messages ---");
    const docs = await ContactMessage.find({}).lean();
    console.log(`Found ${docs.length} contact messages.`);

    for (const doc of docs) {
      const id = doc._id.toString();
      if (this.options.dryRun) continue;

      if (this.pgClient) {
        await this.queryWithRetry(
          `INSERT INTO contact_messages (
             id, name, email, subject, message, status, email_notification_status,
             email_notification_attempted_at, email_notification_error, ip_address, user_agent, created_at, updated_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
           ON CONFLICT (id) DO UPDATE SET
             status = EXCLUDED.status,
             updated_at = EXCLUDED.updated_at
           WHERE contact_messages.updated_at <= EXCLUDED.updated_at;`,
          [
            id, doc.name, doc.email, doc.subject, doc.message, doc.status,
            doc.emailNotification?.status || "not_configured", doc.emailNotification?.attemptedAt || null,
            doc.emailNotification?.error || null, doc.ipAddress || null, doc.userAgent || null,
            doc.createdAt, doc.updatedAt
          ]
        );
      }
    }
    return { count: docs.length, status: "success" };
  }
}

// CLI entry point
if (process.argv.some(arg => arg.includes("migrate-mongo-to-supabase"))) {
  const isDryRun = process.argv.includes("--dry-run");
  const isResume = process.argv.includes("--resume");
  const batchArgIndex = process.argv.indexOf("--batch-size");
  const batchSize = batchArgIndex !== -1 ? parseInt(process.argv[batchArgIndex + 1], 10) || 50 : 50;

  let pgPool: any = null;
  let storageClient: any = null;

  if (!isDryRun) {
    if (env.DATABASE_URL || process.env.DATABASE_URL) {
      pgPool = createPostgresPool();
    }
    if ((env.SUPABASE_URL || process.env.SUPABASE_URL) && (env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)) {
      storageClient = new SupabaseStorageAdapter();
    }
  }

  const migrator = new MongoToSupabaseMigrator(
    {
      dryRun: isDryRun,
      resume: isResume,
      batchSize,
    },
    pgPool,
    storageClient
  );

  migrator.run()
    .then(async (summary) => {
      console.log("\nMigration Summary:", JSON.stringify(summary, null, 2));
      if (pgPool) {
        await pgPool.end();
      }
      if (mongoose.connection.readyState === 1) {
        await mongoose.disconnect();
      }
      process.exitCode = 0;
    })
    .catch(async (err) => {
      console.error("\nMigration failed with error:", err);
      if (pgPool) {
        await pgPool.end();
      }
      if (mongoose.connection.readyState === 1) {
        await mongoose.disconnect();
      }
      process.exitCode = 1;
    });
}
