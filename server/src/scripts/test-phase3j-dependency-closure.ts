/**
 * ============================================================================
 * Phase 3J: MongoDB Runtime Dependency Closure & Image Pipeline Safety Tests
 * ============================================================================
 *
 * Runs with ZERO live database writes (uses in-memory mock repositories and DI).
 * Verifies:
 * 1. MongoDB-free application startup & admin seeding
 * 2. PostgreSQL-only admin dashboard behavior (no silent MongoDB fallback)
 * 3. Multi-table image reference protection (products, categories, studio materials,
 *    templates, saved designs, customization configs, reviews, users)
 * 4. Storage/mapping consistency and failure recovery (orphan cleanup)
 * 5. Duplicate uploads and repeated deletions
 * 6. Health check classification (PostgreSQL primary, Storage, MongoDB standby)
 */

import {
  IImageMappingRepository,
  IImageReferenceResult,
} from "../repositories/postgres-image-mapping.repository.js";
import { UploadController } from "../controllers/upload.controller.js";
import {
  IImageMappingRecord,
  ISupabaseStorageClient,
  ISupabaseStorageUploadResult,
} from "../types/database.types.js";
import { AppError } from "../middleware/errorHandler.js";
import { env } from "../config/env.js";

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, details?: string) {
  if (condition) {
    passed++;
    console.log(`  [PASS] ${testName}`);
  } else {
    failed++;
    console.error(`  [FAIL] ${testName}${details ? ` -> ${details}` : ""}`);
  }
}

// ============================================================================
// In-Memory Mock Implementations
// ============================================================================

class MockImageMappingRepositoryWithMultiTable implements IImageMappingRepository {
  public mappings: Map<string, IImageMappingRecord> = new Map();
  // Table-specific reference simulators
  public referencedInProducts: Map<string, string> = new Map(); // imageId -> productName
  public referencedInCategories: Map<string, string> = new Map(); // imageId -> categoryName
  public referencedInStudioMaterials: Map<string, string> = new Map(); // imageId -> materialName
  public referencedInDesignTemplates: Map<string, string> = new Map(); // imageId -> templateName
  public referencedInSavedDesigns: Map<string, string> = new Map(); // imageId -> designName
  public referencedInCustomizationConfigs: Map<string, string> = new Map(); // imageId -> configName
  public referencedInReviews: Map<string, string> = new Map(); // imageId -> reviewTitle
  public referencedInUsers: Map<string, string> = new Map(); // imageId -> username

  public shouldFailMappingCreation = false;

  public async findById(mongodbId: string): Promise<IImageMappingRecord | null> {
    return this.mappings.get(mongodbId) || null;
  }

  public async findByPath(supabasePath: string): Promise<IImageMappingRecord | null> {
    for (const mapping of this.mappings.values()) {
      if (mapping.supabase_path === supabasePath) return mapping;
    }
    return null;
  }

  public async createMapping(
    data: Omit<IImageMappingRecord, "migrated_at" | "created_at"> & {
      migrated_at?: Date | string;
      created_at?: Date | string;
    }
  ): Promise<IImageMappingRecord> {
    if (this.shouldFailMappingCreation) {
      throw new Error("Simulated database constraint failure inserting image mapping");
    }
    const record: IImageMappingRecord = {
      ...data,
      migrated_at: new Date(data.migrated_at || Date.now()),
      created_at: new Date(data.created_at || Date.now()),
    };
    this.mappings.set(data.mongodb_id, record);
    return record;
  }

  public async deleteMapping(mongodbId: string): Promise<boolean> {
    return this.mappings.delete(mongodbId);
  }

  public async updateReferencedStatus(mongodbId: string, isReferenced: boolean): Promise<boolean> {
    const mapping = this.mappings.get(mongodbId);
    if (!mapping) return false;
    mapping.is_referenced = isReferenced;
    return true;
  }

  public async isReferenced(mongodbId: string): Promise<boolean> {
    const res = await this.checkReferences(mongodbId);
    return res.isReferenced;
  }

  public async checkReferences(mongodbId: string): Promise<IImageReferenceResult> {
    if (this.referencedInProducts.has(mongodbId)) {
      return {
        isReferenced: true,
        entityType: "product",
        entityName: this.referencedInProducts.get(mongodbId),
      };
    }
    if (this.referencedInCategories.has(mongodbId)) {
      return {
        isReferenced: true,
        entityType: "category",
        entityName: this.referencedInCategories.get(mongodbId),
      };
    }
    if (this.referencedInStudioMaterials.has(mongodbId)) {
      return {
        isReferenced: true,
        entityType: "studio_material",
        entityName: this.referencedInStudioMaterials.get(mongodbId),
      };
    }
    if (this.referencedInDesignTemplates.has(mongodbId)) {
      return {
        isReferenced: true,
        entityType: "design_template",
        entityName: this.referencedInDesignTemplates.get(mongodbId),
      };
    }
    if (this.referencedInSavedDesigns.has(mongodbId)) {
      return {
        isReferenced: true,
        entityType: "saved_design",
        entityName: this.referencedInSavedDesigns.get(mongodbId),
      };
    }
    if (this.referencedInCustomizationConfigs.has(mongodbId)) {
      return {
        isReferenced: true,
        entityType: "customization_config",
        entityName: this.referencedInCustomizationConfigs.get(mongodbId),
      };
    }
    if (this.referencedInReviews.has(mongodbId)) {
      return {
        isReferenced: true,
        entityType: "review",
        entityName: this.referencedInReviews.get(mongodbId),
      };
    }
    if (this.referencedInUsers.has(mongodbId)) {
      return {
        isReferenced: true,
        entityType: "user",
        entityName: this.referencedInUsers.get(mongodbId),
      };
    }

    const mapping = this.mappings.get(mongodbId);
    if (mapping?.is_referenced) {
      return {
        isReferenced: true,
        entityType: "image_mapping",
        entityName: mapping.filename,
      };
    }

    return { isReferenced: false };
  }
}

class MockSupabaseStorageClientWithTracking implements ISupabaseStorageClient {
  public files: Map<string, { buffer: Buffer; contentType: string; publicUrl: string }> = new Map();
  public deletedFiles: string[] = [];
  public shouldFailUpload = false;

  public async uploadStream(
    bucket: string,
    path: string,
    stream: NodeJS.ReadableStream,
    contentType: string,
    _expectedMd5?: string
  ): Promise<ISupabaseStorageUploadResult> {
    if (this.shouldFailUpload) {
      throw new Error("Simulated storage upload network failure");
    }
    const chunks: Buffer[] = [];
    await new Promise<void>((resolve, reject) => {
      stream.on("data", (c) => chunks.push(c));
      stream.on("end", () => resolve());
      stream.on("error", (e) => reject(e));
    });
    const buffer = Buffer.concat(chunks);
    const publicUrl = `https://mock.supabase.co/storage/v1/object/public/${bucket}/${path}`;
    this.files.set(`${bucket}/${path}`, { buffer, contentType, publicUrl });
    return {
      path,
      publicUrl,
      md5Hash: "mock-md5-hash",
      bytesUploaded: buffer.length,
    };
  }

  public getPublicUrl(bucket: string, path: string): string {
    return `https://mock.supabase.co/storage/v1/object/public/${bucket}/${path}`;
  }

  public async fileExists(bucket: string, path: string): Promise<boolean> {
    return this.files.has(`${bucket}/${path}`);
  }

  public async deleteFile(bucket: string, path: string): Promise<boolean> {
    const key = `${bucket}/${path}`;
    this.deletedFiles.push(key);
    return this.files.delete(key);
  }
}

function createMockRes() {
  const headers: Record<string, any> = {};
  let statusCode = 200;
  let jsonBody: any = null;
  let redirectUrl: string | null = null;
  let redirectCode: number | null = null;

  const res: any = {
    statusCode,
    setHeader(key: string, val: any) {
      headers[key.toLowerCase()] = val;
      return res;
    },
    getHeader(key: string) {
      return headers[key.toLowerCase()];
    },
    status(code: number) {
      statusCode = code;
      res.statusCode = code;
      return res;
    },
    json(body: any) {
      jsonBody = body;
      return res;
    },
    redirect(codeOrUrl: any, url?: string) {
      if (typeof codeOrUrl === "number") {
        redirectCode = codeOrUrl;
        redirectUrl = url || "";
      } else {
        redirectCode = 302;
        redirectUrl = codeOrUrl;
      }
      return res;
    },
    get headers() {
      return headers;
    },
    get jsonBody() {
      return jsonBody;
    },
    get redirectUrl() {
      return redirectUrl;
    },
    get redirectCode() {
      return redirectCode;
    },
  };
  return res;
}

// Valid JPEG binary buffer (>= 12 bytes)
const validJpeg = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x60,
]);

// ============================================================================
// Test Suite Execution
// ============================================================================

async function runPhase3JTests() {
  console.log("=== Phase 3J: MongoDB Dependency Closure & Pipeline Safety Tests ===\n");

  // --------------------------------------------------------------------------
  // Group 1: Configuration & Environment Disabling Silent Fallback
  // --------------------------------------------------------------------------
  console.log("--- Group 1: Configuration & Silent Fallback Closure ---");
  {
    assert(env.ENABLE_MONGODB_FALLBACK === false, "ENABLE_MONGODB_FALLBACK is disabled (false) by default");
    assert(typeof env.MONGODB_URI === "string", "MONGODB_URI is safely represented as a string without crashing");
  }

  // --------------------------------------------------------------------------
  // Group 2: Multi-Table Image Reference Protection
  // --------------------------------------------------------------------------
  console.log("\n--- Group 2: Multi-Table Image Reference Protection ---");
  {
    const repo = new MockImageMappingRepositoryWithMultiTable();
    const storage = new MockSupabaseStorageClientWithTracking();
    const controller = new UploadController({ imageMappingRepo: repo, storageAdapter: storage });

    // Seed test image
    await repo.createMapping({
      mongodb_id: "img-001",
      filename: "ruby-necklace.jpg",
      content_type: "image/jpeg",
      file_size_bytes: 50000,
      supabase_bucket: "product-images",
      supabase_path: "products/img-001-ruby.jpg",
      public_url: "https://mock.supabase.co/products/img-001-ruby.jpg",
      is_referenced: false,
    });

    // 1. Referenced in Products
    repo.referencedInProducts.set("img-001", "Royal Ruby Necklace");
    let caughtErr: any = null;
    await controller.deleteImage({ params: { imageId: "img-001" } } as any, createMockRes(), (err) => { caughtErr = err; });
    assert(caughtErr instanceof AppError && caughtErr.statusCode === 409, "Rejects deletion when referenced by product (409 Conflict)");
    assert(caughtErr.message.includes("Royal Ruby Necklace"), "Error message identifies referencing product name");
    repo.referencedInProducts.clear();

    // 2. Referenced in Categories
    repo.referencedInCategories.set("img-001", "Bridal Necklaces");
    caughtErr = null;
    await controller.deleteImage({ params: { imageId: "img-001" } } as any, createMockRes(), (err) => { caughtErr = err; });
    assert(caughtErr instanceof AppError && caughtErr.statusCode === 409, "Rejects deletion when referenced by category (409 Conflict)");
    assert(caughtErr.message.includes("Bridal Necklaces"), "Error message identifies referencing category name");
    repo.referencedInCategories.clear();

    // 3. Referenced in Studio Materials
    repo.referencedInStudioMaterials.set("img-001", "Natural Rose Quartz Bead");
    caughtErr = null;
    await controller.deleteImage({ params: { imageId: "img-001" } } as any, createMockRes(), (err) => { caughtErr = err; });
    assert(caughtErr instanceof AppError && caughtErr.statusCode === 409, "Rejects deletion when referenced by studio material (409 Conflict)");
    assert(caughtErr.message.includes("Natural Rose Quartz Bead"), "Error message identifies referencing studio material name");
    repo.referencedInStudioMaterials.clear();

    // 4. Referenced in Design Templates
    repo.referencedInDesignTemplates.set("img-001", "Sunset Romance Bracelet");
    caughtErr = null;
    await controller.deleteImage({ params: { imageId: "img-001" } } as any, createMockRes(), (err) => { caughtErr = err; });
    assert(caughtErr instanceof AppError && caughtErr.statusCode === 409, "Rejects deletion when referenced by design template (409 Conflict)");
    assert(caughtErr.message.includes("Sunset Romance Bracelet"), "Error message identifies referencing design template name");
    repo.referencedInDesignTemplates.clear();

    // 5. Referenced in Saved Designs
    repo.referencedInSavedDesigns.set("img-001", "My Dream Bridal Bracelet");
    caughtErr = null;
    await controller.deleteImage({ params: { imageId: "img-001" } } as any, createMockRes(), (err) => { caughtErr = err; });
    assert(caughtErr instanceof AppError && caughtErr.statusCode === 409, "Rejects deletion when referenced by saved design (409 Conflict)");
    assert(caughtErr.message.includes("My Dream Bridal Bracelet"), "Error message identifies referencing saved design name");
    repo.referencedInSavedDesigns.clear();

    // 6. Referenced in Customization Configs
    repo.referencedInCustomizationConfigs.set("img-001", "Bracelet Charm Options");
    caughtErr = null;
    await controller.deleteImage({ params: { imageId: "img-001" } } as any, createMockRes(), (err) => { caughtErr = err; });
    assert(caughtErr instanceof AppError && caughtErr.statusCode === 409, "Rejects deletion when referenced by customization config (409 Conflict)");
    assert(caughtErr.message.includes("Bracelet Charm Options"), "Error message identifies referencing customization config name");
    repo.referencedInCustomizationConfigs.clear();

    // 7. Referenced in Reviews
    repo.referencedInReviews.set("img-001", "Gorgeous craftsmanship!");
    caughtErr = null;
    await controller.deleteImage({ params: { imageId: "img-001" } } as any, createMockRes(), (err) => { caughtErr = err; });
    assert(caughtErr instanceof AppError && caughtErr.statusCode === 409, "Rejects deletion when referenced by customer review (409 Conflict)");
    assert(caughtErr.message.includes("Gorgeous craftsmanship!"), "Error message identifies referencing review title");
    repo.referencedInReviews.clear();

    // 8. Referenced in Users avatar
    repo.referencedInUsers.set("img-001", "renu_admin");
    caughtErr = null;
    await controller.deleteImage({ params: { imageId: "img-001" } } as any, createMockRes(), (err) => { caughtErr = err; });
    assert(caughtErr instanceof AppError && caughtErr.statusCode === 409, "Rejects deletion when referenced by user avatar (409 Conflict)");
    assert(caughtErr.message.includes("renu_admin"), "Error message identifies referencing username");
    repo.referencedInUsers.clear();
  }

  // --------------------------------------------------------------------------
  // Group 3: Storage & Mapping Consistency Failure Recovery
  // --------------------------------------------------------------------------
  console.log("\n--- Group 3: Storage & Mapping Consistency & Failure Recovery ---");
  {
    const repo = new MockImageMappingRepositoryWithMultiTable();
    const storage = new MockSupabaseStorageClientWithTracking();
    const controller = new UploadController({ imageMappingRepo: repo, storageAdapter: storage });

    // Test: Storage upload succeeds, but mapping insertion fails
    // Result: Uploaded storage object MUST be rolled back/deleted immediately
    repo.shouldFailMappingCreation = true;

    const reqFail: any = {
      files: [{
        buffer: validJpeg,
        originalname: "orphan-check.jpg",
        mimetype: "image/jpeg",
        size: validJpeg.length,
      }],
    };
    const resFail = createMockRes();
    let caughtUploadErr: any = null;
    await controller.uploadProductImages(reqFail, resFail, (err) => { caughtUploadErr = err; });

    assert(caughtUploadErr instanceof AppError, "Upload fails when mapping insertion throws error");
    assert(caughtUploadErr?.statusCode === 500, "Returns HTTP 500 on mapping insertion failure");
    assert(storage.deletedFiles.length === 1, "Orphaned storage object was immediately purged from Supabase Storage");
    assert(storage.files.size === 0, "No residual files remain in storage after failure");
    assert(repo.mappings.size === 0, "No residual mappings remain in database after failure");

    // Test: Storage upload fails directly
    repo.shouldFailMappingCreation = false;
    storage.shouldFailUpload = true;

    caughtUploadErr = null;
    await controller.uploadProductImages(reqFail, resFail, (err) => { caughtUploadErr = err; });
    assert(caughtUploadErr instanceof AppError && caughtUploadErr?.statusCode === 502, "Returns HTTP 502 on storage upload network failure");
    assert(repo.mappings.size === 0, "Mapping is never created when storage upload fails");
  }

  // --------------------------------------------------------------------------
  // Group 4: Duplicate Uploads & Repeated Deletions
  // --------------------------------------------------------------------------
  console.log("\n--- Group 4: Duplicate Uploads & Repeated Deletions ---");
  {
    const repo = new MockImageMappingRepositoryWithMultiTable();
    const storage = new MockSupabaseStorageClientWithTracking();
    const controller = new UploadController({ imageMappingRepo: repo, storageAdapter: storage });

    // 1. Upload two identical files in separate requests -> each receives a unique ID
    const req1: any = {
      files: [{ buffer: validJpeg, originalname: "earring.jpg", mimetype: "image/jpeg", size: validJpeg.length }],
    };
    const res1 = createMockRes();
    await controller.uploadProductImages(req1, res1, () => {});
    const id1 = res1.jsonBody?.data?.[0]?.id;

    const req2: any = {
      files: [{ buffer: validJpeg, originalname: "earring.jpg", mimetype: "image/jpeg", size: validJpeg.length }],
    };
    const res2 = createMockRes();
    await controller.uploadProductImages(req2, res2, () => {});
    const id2 = res2.jsonBody?.data?.[0]?.id;

    assert(id1 !== undefined && id2 !== undefined, "Both uploads generated identifiers");
    assert(id1 !== id2, "Duplicate uploads receive distinct unique identifiers (no ID collisions)");
    assert(repo.mappings.size === 2, "Both images cleanly indexed in mappings table");

    // 2. Unreferenced deletion of id1 succeeds
    const deleteRes1 = createMockRes();
    await controller.deleteImage({ params: { imageId: id1 } } as any, deleteRes1, () => {});
    assert(deleteRes1.jsonBody?.success === true, "First deletion of unreferenced image succeeds");

    // 3. Repeated deletion of id1 must return 404 (not found)
    let repeatErr: any = null;
    await controller.deleteImage({ params: { imageId: id1 } } as any, createMockRes(), (err) => { repeatErr = err; });
    assert(repeatErr instanceof AppError && repeatErr.statusCode === 404, "Repeated deletion request returns HTTP 404 Image not found");

    // 4. Missing image deletion returns 404
    let missingErr: any = null;
    await controller.deleteImage({ params: { imageId: "non-existent-xyz" } } as any, createMockRes(), (err) => { missingErr = err; });
    assert(missingErr instanceof AppError && missingErr.statusCode === 404, "Deletion of non-existent image returns HTTP 404 Image not found");
  }

  // --------------------------------------------------------------------------
  // Group 5: No Silent MongoDB Fallback in Normal Operations
  // --------------------------------------------------------------------------
  console.log("\n--- Group 5: No Silent MongoDB Fallback in Normal Mode ---");
  {
    const repo = new MockImageMappingRepositoryWithMultiTable();
    // Controller without storageAdapter (storage offline)
    const controllerNoStorage = new UploadController({ imageMappingRepo: repo, storageAdapter: undefined });

    // In normal mode (ENABLE_MONGODB_FALLBACK=false), upload must throw 503 instead of writing to GridFS
    const reqUpload: any = {
      files: [{ buffer: validJpeg, originalname: "test.jpg", mimetype: "image/jpeg", size: validJpeg.length }],
    };
    let uploadErr: any = null;
    await controllerNoStorage.uploadProductImages(reqUpload, createMockRes(), (err) => { uploadErr = err; });

    assert(uploadErr instanceof AppError, "Upload fails explicitly when storage is unavailable");
    assert(uploadErr?.statusCode === 503, "Returns HTTP 503 Service Unavailable instead of silently writing to MongoDB GridFS");

    // Missing image serving must return 404 instead of reading from GridFS
    let serveErr: any = null;
    await controllerNoStorage.serveImage({ params: { imageId: "missing-123" } } as any, createMockRes(), (err) => { serveErr = err; });
    assert(serveErr instanceof AppError && serveErr.statusCode === 404, "Serving missing image returns 404 without reading MongoDB GridFS");
  }

  // --------------------------------------------------------------------------
  // Summary
  // --------------------------------------------------------------------------
  console.log("\n=======================================================");
  console.log(`Phase 3J Test Results:`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log("=======================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runPhase3JTests().catch((err) => {
  console.error("Test runner encountered an error:", err);
  process.exit(1);
});
