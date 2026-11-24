import { Request, Response, NextFunction } from "express";
import { Readable } from "stream";
import crypto from "crypto";
import mongoose from "mongoose";
import {
  uploadImageToGridFS,
  getGridFSImageMetadata,
  openGridFSDownloadStream,
  deleteGridFSImage,
} from "../services/gridfs.service.js";
import { detectImageFormat } from "../middleware/upload.js";
import { Product } from "../models/Product.js";
import { AppError } from "../middleware/errorHandler.js";
import {
  IImageMappingRepository,
  PostgresImageMappingRepository,
} from "../repositories/postgres-image-mapping.repository.js";
import {
  ISupabaseStorageClient,
} from "../types/database.types.js";
import { SupabaseStorageAdapter } from "../db/supabase-storage.js";
import { PostgresDatabase } from "../db/postgres.js";
import { env } from "../config/env.js";

/**
 * Tracks pending/ambiguous storage deletions for safe background reconciliation.
 * Durable: persists to PostgreSQL `image_deletion_queue` so pending deletions
 * survive server crashes or restarts, with an in-memory cache for fast access.
 */
export class ImageDeletionReconciler {
  private static pendingDeletions: Map<
    string,
    { bucket: string; path: string; imageId?: string; recordedAt: Date }
  > = new Map();

  public static async recordPendingStorageDeletion(
    bucket: string,
    path: string,
    imageId?: string,
    errorMsg?: string
  ): Promise<void> {
    const key = `${bucket}:${path}`;
    this.pendingDeletions.set(key, { bucket, path, imageId, recordedAt: new Date() });

    if (PostgresDatabase.isInitialized()) {
      try {
        await PostgresDatabase.query(
          `INSERT INTO image_deletion_queue (supabase_bucket, supabase_path, mongodb_id, last_error, updated_at)
           VALUES ($1, $2, $3, $4, NOW())
           ON CONFLICT (supabase_path) DO UPDATE SET
             attempts = image_deletion_queue.attempts + 1,
             last_error = EXCLUDED.last_error,
             updated_at = NOW();`,
          [bucket, path, imageId || null, errorMsg || null]
        );
      } catch (err: any) {
        console.warn(`[ImageDeletionReconciler] Failed to persist pending deletion to queue table: ${err.message}`);
      }
    }
  }

  public static async removePendingStorageDeletion(bucket: string, path: string): Promise<boolean> {
    const inMem = this.pendingDeletions.delete(`${bucket}:${path}`);
    if (PostgresDatabase.isInitialized()) {
      try {
        await PostgresDatabase.query(
          `DELETE FROM image_deletion_queue WHERE supabase_bucket = $1 AND supabase_path = $2;`,
          [bucket, path]
        );
      } catch {}
    }
    return inMem;
  }

  public static getPendingStorageDeletions(): Array<{ bucket: string; path: string; imageId?: string }> {
    return Array.from(this.pendingDeletions.values());
  }

  public static async getDurableQueueItems(): Promise<
    Array<{ id: string; bucket: string; path: string; attempts: number; claimToken?: string; claimExpiresAt?: Date; lastError?: string; createdAt: Date; updatedAt: Date }>
  > {
    if (!PostgresDatabase.isInitialized()) return [];
    try {
      const res = await PostgresDatabase.query<any>(
        `SELECT id, supabase_bucket, supabase_path, attempts, claim_token, claim_expires_at, last_error, created_at, updated_at FROM image_deletion_queue ORDER BY created_at ASC;`
      );
      return res.rows.map((r: any) => ({
        id: r.id,
        bucket: r.supabase_bucket,
        path: r.supabase_path,
        attempts: r.attempts,
        claimToken: r.claim_token || undefined,
        claimExpiresAt: r.claim_expires_at || undefined,
        lastError: r.last_error || undefined,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      }));
    } catch (err: any) {
      console.warn(`[ImageDeletionReconciler] Failed to fetch durable queue items: ${err.message}`);
      return [];
    }
  }

  public static async claimItem(
    bucket: string,
    path: string,
    leaseSeconds: number = 30,
    customToken?: string
  ): Promise<{ claimed: boolean; claimToken?: string }> {
    if (!PostgresDatabase.isInitialized()) return { claimed: false };
    const token = customToken || crypto.randomUUID();
    try {
      const claim = await PostgresDatabase.query(
        `UPDATE image_deletion_queue
         SET attempts = attempts + 1,
             claim_token = $3,
             claim_expires_at = NOW() + ($4 * INTERVAL '1 second'),
             updated_at = NOW()
         WHERE supabase_bucket = $1 AND supabase_path = $2
           AND attempts < 10
           AND (claim_expires_at IS NULL OR claim_expires_at <= NOW())
         RETURNING id, claim_token;`,
        [bucket, path, token, leaseSeconds]
      );
      if (claim.rowCount > 0) {
        return { claimed: true, claimToken: token };
      }
    } catch {}
    return { claimed: false };
  }

  public static async extendLease(
    bucket: string,
    path: string,
    claimToken: string,
    additionalSeconds: number = 30
  ): Promise<boolean> {
    if (!PostgresDatabase.isInitialized() || !claimToken) return false;
    try {
      const res = await PostgresDatabase.query(
        `UPDATE image_deletion_queue
         SET claim_expires_at = NOW() + ($4 * INTERVAL '1 second'), updated_at = NOW()
         WHERE supabase_bucket = $1 AND supabase_path = $2 AND claim_token = $3
         RETURNING id;`,
        [bucket, path, claimToken, additionalSeconds]
      );
      return res.rowCount > 0;
    } catch {
      return false;
    }
  }

  public static async completeItem(
    bucket: string,
    path: string,
    claimToken: string
  ): Promise<boolean> {
    if (!PostgresDatabase.isInitialized() || !claimToken) return false;
    try {
      const res = await PostgresDatabase.query(
        `DELETE FROM image_deletion_queue
         WHERE supabase_bucket = $1 AND supabase_path = $2 AND claim_token = $3
         RETURNING id;`,
        [bucket, path, claimToken]
      );
      return res.rowCount > 0;
    } catch {
      return false;
    }
  }

  public static async releaseItem(
    bucket: string,
    path: string,
    claimToken: string,
    errorMsg?: string
  ): Promise<boolean> {
    if (!PostgresDatabase.isInitialized() || !claimToken) return false;
    try {
      const res = await PostgresDatabase.query(
        `UPDATE image_deletion_queue
         SET claim_token = NULL,
             claim_expires_at = NULL,
             last_error = $4,
             updated_at = NOW()
         WHERE supabase_bucket = $1 AND supabase_path = $2 AND claim_token = $3
         RETURNING id;`,
        [bucket, path, claimToken, errorMsg || null]
      );
      return res.rowCount > 0;
    } catch {
      return false;
    }
  }

  public static async findPendingForImageId(
    imageId: string
  ): Promise<{ bucket: string; path: string } | null> {
    for (const item of this.pendingDeletions.values()) {
      if (item.imageId === imageId || item.path.includes(imageId)) {
        return item;
      }
    }
    if (PostgresDatabase.isInitialized()) {
      try {
        const res = await PostgresDatabase.query<{ supabase_bucket: string; supabase_path: string }>(
          `SELECT supabase_bucket, supabase_path FROM image_deletion_queue WHERE mongodb_id = $1 OR supabase_path LIKE $2 LIMIT 1;`,
          [imageId, `%${imageId}%`]
        );
        if (res.rows.length > 0) {
          return { bucket: res.rows[0].supabase_bucket, path: res.rows[0].supabase_path };
        }
      } catch {}
    }
    return null;
  }

  public static clear(): void {
    this.pendingDeletions.clear();
  }

  public static async reconcilePending(
    storageClient: ISupabaseStorageClient,
    imageMappingRepo?: IImageMappingRepository
  ): Promise<{ attempted: number; succeeded: number }> {
    let succeeded = 0;
    const itemsMap = new Map<string, { bucket: string; path: string; imageId?: string }>();

    // 1. Load from in-memory cache
    for (const [key, item] of this.pendingDeletions.entries()) {
      itemsMap.set(key, item);
    }

    // 2. Load from durable PostgreSQL queue
    if (PostgresDatabase.isInitialized()) {
      try {
        const res = await PostgresDatabase.query<{ supabase_bucket: string; supabase_path: string; mongodb_id: string }>(
          `SELECT supabase_bucket, supabase_path, mongodb_id FROM image_deletion_queue ORDER BY created_at ASC;`
        );
        for (const row of res.rows) {
          const key = `${row.supabase_bucket}:${row.supabase_path}`;
          if (!itemsMap.has(key)) {
            itemsMap.set(key, {
              bucket: row.supabase_bucket,
              path: row.supabase_path,
              imageId: row.mongodb_id,
            });
          }
        }
      } catch (err: any) {
        console.warn(`[ImageDeletionReconciler] Failed to read image_deletion_queue: ${err.message}`);
      }
    }

    const items = Array.from(itemsMap.values());

    for (const item of items) {
      const key = `${item.bucket}:${item.path}`;

      // CRITICAL SAFETY CHECK: Never delete if an active mapping exists!
      if (imageMappingRepo) {
        try {
          const existingMapping = await imageMappingRepo.findByPath(item.path);
          if (existingMapping) {
            console.warn(
              `[ImageDeletionReconciler] Aborting deletion of ${item.path}: active mapping still exists in image_mappings.`
            );
            this.pendingDeletions.delete(key);
            if (PostgresDatabase.isInitialized()) {
              await PostgresDatabase.query(
                `DELETE FROM image_deletion_queue WHERE supabase_bucket = $1 AND supabase_path = $2;`,
                [item.bucket, item.path]
              ).catch(() => {});
            }
            continue;
          }
        } catch {}
      }

      // Atomic claiming with fencing token: prevent concurrent deletion attempts across multiple backend instances
      let claimToken: string | undefined;
      if (PostgresDatabase.isInitialized()) {
        const claimResult = await this.claimItem(item.bucket, item.path, 30);
        if (!claimResult.claimed) {
          continue;
        }
        claimToken = claimResult.claimToken;
      }

      if (storageClient.deleteFile) {
        try {
          const ok = await storageClient.deleteFile(item.bucket, item.path);
          if (ok) {
            this.pendingDeletions.delete(key);
            if (claimToken) {
              await this.completeItem(item.bucket, item.path, claimToken);
            } else if (PostgresDatabase.isInitialized()) {
              await PostgresDatabase.query(
                `DELETE FROM image_deletion_queue WHERE supabase_bucket = $1 AND supabase_path = $2;`,
                [item.bucket, item.path]
              ).catch(() => {});
            }
            succeeded++;
          }
        } catch (err: any) {
          if (claimToken) {
            await this.releaseItem(item.bucket, item.path, claimToken, err.message);
          } else if (PostgresDatabase.isInitialized()) {
            await PostgresDatabase.query(
              `UPDATE image_deletion_queue SET attempts = attempts + 1, last_error = $1, updated_at = NOW() WHERE supabase_path = $2;`,
              [err.message, item.path]
            ).catch(() => {});
          }
        }
      }
    }
    return { attempted: items.length, succeeded };
  }
}

export class UploadController {
  private imageMappingRepo: IImageMappingRepository;
  private storageAdapter?: ISupabaseStorageClient;

  constructor(options?: {
    imageMappingRepo?: IImageMappingRepository;
    storageAdapter?: ISupabaseStorageClient;
  }) {
    this.imageMappingRepo = options?.imageMappingRepo || new PostgresImageMappingRepository();
    if (options && "storageAdapter" in options) {
      this.storageAdapter = options.storageAdapter;
    } else if (env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) {
      try {
        this.storageAdapter = new SupabaseStorageAdapter();
      } catch (err: any) {
        console.warn("Supabase Storage adapter not initialized:", err.message);
      }
    }
  }

  /**
   * Handle multipart image upload from admin dashboard.
   * Validates binary magic numbers on each buffer (JPEG, PNG, WebP).
   * Stores image binaries into Supabase Storage and records metadata in `image_mappings`.
   * Enforces consistency: if mapping insertion fails after upload, rolls back the storage object.
   * Explicitly falls back to MongoDB GridFS only if ENABLE_MONGODB_FALLBACK is enabled.
   */
  public uploadProductImages = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const rawFiles = req.files as Express.Multer.File[] | undefined;
      const singleFile = req.file as Express.Multer.File | undefined;

      const files: Express.Multer.File[] = [];
      if (Array.isArray(rawFiles) && rawFiles.length > 0) {
        files.push(...rawFiles);
      } else if (singleFile) {
        files.push(singleFile);
      }

      if (files.length === 0) {
        throw new AppError("No image files provided for upload.", 400);
      }

      // Verify magic bytes on every file buffer
      for (const file of files) {
        const verifiedFormat = detectImageFormat(file.buffer);
        if (!verifiedFormat) {
          throw new AppError(
            `File "${file.originalname}" is not a valid JPEG, PNG, or WebP image. The file content does not match image binary signatures.`,
            400
          );
        }
        file.mimetype = verifiedFormat;
      }

      // 1. Primary path: Supabase Storage
      if (this.storageAdapter) {
        const bucket = "product-images";
        const uploadPromises = files.map(async (file) => {
          const imageId = crypto.randomUUID().replace(/-/g, "").substring(0, 24);
          const sanitizedFilename = (file.originalname || "image")
            .replace(/[^a-zA-Z0-9._-]/g, "_");
          const destinationPath = `products/${imageId}-${sanitizedFilename}`;

          const stream = Readable.from(file.buffer);
          let uploadResult;
          try {
            uploadResult = await this.storageAdapter!.uploadStream(
              bucket,
              destinationPath,
              stream,
              file.mimetype
            );
          } catch (uploadErr: any) {
            throw new AppError(
              `Failed to upload image "${file.originalname}" to storage: ${uploadErr.message}`,
              502
            );
          }

          // Atomic reconciliation safeguard: if mapping insertion fails, purge the uploaded storage object
          try {
            await this.imageMappingRepo.createMapping({
              mongodb_id: imageId,
              filename: file.originalname || sanitizedFilename,
              content_type: file.mimetype,
              file_size_bytes: file.size || file.buffer.length,
              supabase_bucket: bucket,
              supabase_path: uploadResult.path,
              public_url: uploadResult.publicUrl,
              md5_hash: uploadResult.md5Hash,
              is_referenced: false,
            });
          } catch (mappingErr: any) {
            if (this.storageAdapter?.deleteFile) {
              await this.storageAdapter.deleteFile(bucket, destinationPath).catch(() => {});
            }
            throw new AppError(
              `Failed to record image mapping for "${file.originalname}": ${mappingErr.message}`,
              500
            );
          }

          return {
            id: imageId,
            url: `/api/v1/products/images/${imageId}`,
            publicUrl: uploadResult.publicUrl,
            contentType: file.mimetype,
            length: file.size || file.buffer.length,
            originalFilename: file.originalname,
          };
        });

        const storedFiles = await Promise.all(uploadPromises);

        res.status(201).json({
          success: true,
          data: storedFiles,
          message: `Successfully uploaded and stored ${storedFiles.length} image(s) in Supabase Storage.`,
        });
        return;
      }

      // 2. Explicit fallback to MongoDB GridFS only if ENABLE_MONGODB_FALLBACK is active
      if (env.ENABLE_MONGODB_FALLBACK && mongoose.connection.readyState === 1) {
        const uploadPromises = files.map((file) =>
          uploadImageToGridFS(
            file.buffer,
            file.originalname || "product-image",
            file.mimetype
          )
        );

        const storedFiles = await Promise.all(uploadPromises);

        res.status(201).json({
          success: true,
          data: storedFiles.map((item) => ({
            id: item.id,
            url: `/api/v1/products/images/${item.id}`,
            contentType: item.contentType,
            length: item.length,
            originalFilename: item.filename,
          })),
          message: `Successfully uploaded and stored ${storedFiles.length} image(s) in MongoDB GridFS fallback.`,
        });
        return;
      }

      throw new AppError("Supabase Storage service is currently unavailable.", 503);
    } catch (error) {
      next(error);
    }
  };

  /**
   * Serve an image endpoint: `/api/v1/products/images/:imageId`
   * Checks PostgreSQL `image_mappings` first. If mapped to Supabase Storage,
   * redirects to the CDN public URL with 302 and cache headers.
   * If not mapped, explicitly falls back to MongoDB GridFS only if ENABLE_MONGODB_FALLBACK is active.
   */
  public serveImage = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { imageId } = req.params;

      // 1. Primary path: PostgreSQL image_mappings table
      try {
        const mapping = await this.imageMappingRepo.findById(imageId);
        if (mapping && mapping.public_url) {
          res.setHeader("Cache-Control", "public, max-age=2592000, immutable");
          res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
          res.redirect(302, mapping.public_url);
          return;
        }
      } catch (pgErr: any) {
        console.warn("PostgreSQL image_mappings lookup warning:", pgErr.message);
      }

      // 2. Explicit fallback to MongoDB GridFS only if ENABLE_MONGODB_FALLBACK is active
      if (env.ENABLE_MONGODB_FALLBACK && mongoose.connection.readyState === 1) {
        const file = await getGridFSImageMetadata(imageId);
        if (file) {
          const contentType = file.contentType || (file.metadata as any)?.contentType || "image/jpeg";
          res.setHeader("Content-Type", contentType);
          res.setHeader("Content-Length", file.length);
          res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
          res.setHeader("Cache-Control", "public, max-age=2592000, immutable");
          res.setHeader("Accept-Ranges", "bytes");

          const downloadStream = openGridFSDownloadStream(imageId);
          let streamDestroyed = false;

          res.on("close", () => {
            if (!res.writableFinished && !streamDestroyed) {
              streamDestroyed = true;
              downloadStream.destroy();
            }
          });

          downloadStream.on("error", (err) => {
            streamDestroyed = true;
            if (!res.headersSent) {
              next(err);
            } else {
              res.end();
            }
          });

          downloadStream.on("end", () => {
            streamDestroyed = true;
          });

          downloadStream.pipe(res);
          return;
        }
      }

      throw new AppError("Image not found", 404);
    } catch (error) {
      next(error);
    }
  };

  /**
   * Admin-only delete an image.
   * Checks multi-table references across ALL PostgreSQL tables:
   * products, product_media, categories, studio_materials, component_types,
   * custom_component_pricing, customization_configs, design_templates,
   * saved_designs, reviews, users.
   * If referenced, returns HTTP 409 Conflict with referencing details.
   * Guarantees deletion consistency and prevents stale mappings pointing to missing files.
   */
  public deleteImage = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { imageId } = req.params;

      const mapping = await this.imageMappingRepo.findById(imageId).catch(() => null);
      let gridFsFile = null;
      if (env.ENABLE_MONGODB_FALLBACK && mongoose.connection.readyState === 1) {
        gridFsFile = await getGridFSImageMetadata(imageId).catch(() => null);
      }

      // If mapping is missing, check if there is an unmapped pending storage object for this imageId
      if (!mapping && !gridFsFile) {
        const pending = await ImageDeletionReconciler.findPendingForImageId(imageId);
        if (pending && this.storageAdapter?.deleteFile) {
          await this.storageAdapter.deleteFile(pending.bucket, pending.path).catch(() => {});
          await ImageDeletionReconciler.removePendingStorageDeletion(pending.bucket, pending.path);
          res.json({
            success: true,
            message: "Orphaned storage object successfully deleted during reconciliation.",
          });
          return;
        }
        throw new AppError("Image not found", 404);
      }

      // Check multi-table references across ALL PostgreSQL tables
      const referenceInfo = await this.imageMappingRepo.checkReferences(imageId);
      if (referenceInfo.isReferenced) {
        throw new AppError(
          `Cannot delete image because it is referenced by ${referenceInfo.entityType || "an existing entity"} "${referenceInfo.entityName || referenceInfo.entityId || imageId}". Please remove or replace the image in that record before deleting.`,
          409
        );
      }

      // Check MongoDB references only if fallback is explicitly enabled
      if (env.ENABLE_MONGODB_FALLBACK && mongoose.connection.readyState === 1) {
        const imageUrlRegex = new RegExp(`/api/v1/products/images/${imageId}`, "i");
        const referencingProduct = await Product.findOne({
          $or: [
            { imageUrl: { $regex: imageUrlRegex } },
            { "media.url": { $regex: imageUrlRegex } },
          ],
        }).select("name sku isActive");

        if (referencingProduct) {
          throw new AppError(
            `Cannot delete image because it is referenced by product "${referencingProduct.name}" (SKU: ${referencingProduct.sku}, Status: ${referencingProduct.isActive ? "Active" : "Inactive"}). Please remove or replace the image in that product before deleting.`,
            409
          );
        }
      }

      // Safe deletion protocol:
      // 1. Delete mapping record from PostgreSQL first so no stale mapping can ever point to a missing file
      if (mapping) {
        const mappingDeleted = await this.imageMappingRepo.deleteMapping(imageId);
        if (!mappingDeleted) {
          throw new AppError("Failed to delete image mapping from database", 500);
        }

        // 2. Delete file from Supabase Storage with retry logic
        if (this.storageAdapter?.deleteFile) {
          let storageDeleted = false;
          for (let attempt = 1; attempt <= 3; attempt++) {
            try {
              storageDeleted = await this.storageAdapter.deleteFile(
                mapping.supabase_bucket,
                mapping.supabase_path
              );
              if (storageDeleted) break;
            } catch (err: any) {
              if (attempt === 3) {
                console.warn(
                  `[deleteImage] Storage deletion ambiguous on final attempt for ${mapping.supabase_path}:`,
                  err.message
                );
              }
              await new Promise((r) => setTimeout(r, 20 * attempt));
            }
          }

          if (!storageDeleted) {
            // Record pending deletion for background/administrative reconciliation
            await ImageDeletionReconciler.recordPendingStorageDeletion(
              mapping.supabase_bucket,
              mapping.supabase_path,
              imageId
            );
          }
        }
      }

      if (gridFsFile && env.ENABLE_MONGODB_FALLBACK && mongoose.connection.readyState === 1) {
        await deleteGridFSImage(imageId);
      }

      res.json({
        success: true,
        message: "Image successfully deleted.",
      });
    } catch (error) {
      next(error);
    }
  };
}

let defaultUploadController: UploadController | null = null;
function getDefaultUploadController(): UploadController {
  if (!defaultUploadController) {
    defaultUploadController = new UploadController();
  }
  return defaultUploadController;
}

export const uploadProductImagesHandler = (req: Request, res: Response, next: NextFunction) =>
  getDefaultUploadController().uploadProductImages(req, res, next);

export const serveGridFSImageHandler = (req: Request, res: Response, next: NextFunction) =>
  getDefaultUploadController().serveImage(req, res, next);

export const deleteGridFSImageHandler = (req: Request, res: Response, next: NextFunction) =>
  getDefaultUploadController().deleteImage(req, res, next);
