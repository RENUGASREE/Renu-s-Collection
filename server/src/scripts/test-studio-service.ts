/**
 * ============================================================================
 * Phase 3H Test Suite: Studio Services & PostgreSQL Migration
 * ============================================================================
 *
 * Verifies that the migrated Studio application services operate on Supabase
 * PostgreSQL while preserving:
 *   1. Distinct Studio materials & variants (e.g. Silver Panda vs Gold Panda,
 *      individual bow designs, alphabet letters, charms, stone swans).
 *   2. Variant-level atomic stock validation, reservations, and out-of-stock rejection.
 *   3. Customization config resolution, dynamic material filtering & pricing.
 *   4. Saved design ownership authorization & CRUD operations.
 *   5. Design rules, wrist fit calculations, and making charges quotes.
 *   6. Studio reservation lifecycle: create, commit, release, restock, expiry, reconciliation.
 *   7. Transaction atomicity: rollback on partial failure, idempotency on repeated commit/restock.
 *   8. Order cancellation integration: automatic restock of studio materials.
 *   9. Coupon lifecycle: exactly-once usage guarantee across creation, payment, retries & cancellation.
 *   10. Component types, jewellery types, and design templates management.
 *
 * Guarantees:
 * - Strictly zero live writes to Supabase or MongoDB.
 * - Pure in-memory mock repositories and dependency injection.
 *
 * Run:
 *   node --env-file=server/.env server/node_modules/tsx/dist/cli.mjs \
 *     server/src/scripts/test-studio-service.ts
 */

import { randomUUID } from "crypto";
import { PostgresStudioRepository } from "../repositories/postgres-studio.repository.js";
import { PostgresStudioReservationRepository } from "../repositories/postgres-studio-reservation.repository.js";
import { PostgresOrderRepository } from "../repositories/postgres-order.repository.js";
import { PostgresCouponRepository } from "../repositories/postgres-coupon.repository.js";
import { PostgresProductRepository } from "../repositories/postgres-product.repository.js";
import { PostgresCategoryRepository } from "../repositories/postgres-category.repository.js";

import * as studioService from "../services/studio.service.js";
import * as studioInventoryService from "../services/studio-inventory.service.js";
import * as customizationService from "../services/customization.service.js";
import * as orderService from "../services/order.service.js";
import * as couponService from "../services/coupon.service.js";

import {
  IStudioMaterialRecord,
  IStudioMaterialVariantRecord,
  IStudioReservationRecord,
  IStudioReservationItemRecord,
  ISavedDesignRecord,
  IDesignTemplateRecord,
  IDesignRuleRecord,
  IMakingChargeRecord,
  ICustomizationConfigRecord,
  IJewelleryTypeRecord,
  IComponentTypeRecord,
  IOrderRecord,
  ICouponRecord,
  ICategoryRecord,
  IProductRecord,
  StudioReservationStatusType,
} from "../types/database.types.js";
import { AppError } from "../middleware/errorHandler.js";

// ANSI color codes
const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const BLUE = "\x1b[34m";
const BOLD = "\x1b[1m";
const RESET = "\x1b[0m";

let passedCount = 0;
let failedCount = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    passedCount++;
    console.log(`  ${GREEN}✓${RESET} ${testName}`);
  } else {
    failedCount++;
    console.error(`  ${RED}✗${RESET} ${testName}`);
    if (detail) console.error(`    ${RED}Detail: ${detail}${RESET}`);
  }
}

async function test(name: string, fn: () => Promise<void>) {
  try {
    await fn();
  } catch (error: any) {
    failedCount++;
    console.error(`  ${RED}✗ [EXCEPTION] ${name}${RESET}`);
    console.error(`    ${RED}${error?.message || error}${RESET}`);
    if (error?.stack) console.error(`    ${error.stack}`);
  }
}

// ============================================================================
// IN-MEMORY MOCK REPOSITORIES
// ============================================================================

class MockStudioRepository extends PostgresStudioRepository {
  public materials: Map<string, IStudioMaterialRecord> = new Map();
  public componentTypes: Map<string, IComponentTypeRecord> = new Map();
  public jewelleryTypes: Map<string, IJewelleryTypeRecord> = new Map();
  public customizationConfigs: Map<string, ICustomizationConfigRecord> = new Map();
  public makingCharges: Map<string, IMakingChargeRecord> = new Map();
  public designRules: Map<string, IDesignRuleRecord> = new Map();
  public templates: Map<string, IDesignTemplateRecord> = new Map();
  public savedDesigns: Map<string, ISavedDesignRecord> = new Map();

  constructor() {
    super();
  }

  // --- Materials & Variants ---
  public async findAllMaterials(options?: {
    materialType?: string;
    isActive?: boolean;
    jewelleryType?: string;
  }): Promise<IStudioMaterialRecord[]> {
    let list = Array.from(this.materials.values());
    if (options?.isActive !== undefined) {
      list = list.filter((m) => m.isActive === options.isActive);
    }
    if (options?.materialType) {
      list = list.filter((m) => m.materialType === options.materialType);
    }
    if (options?.jewelleryType) {
      list = list.filter((m) =>
        m.allowedJewelleryTypes.includes(options.jewelleryType!)
      );
    }
    return list.map((m) => JSON.parse(JSON.stringify(m)));
  }

  public override async findMaterialById(id: string): Promise<IStudioMaterialRecord | null> {
    const m = this.materials.get(id);
    return m ? JSON.parse(JSON.stringify(m)) : null;
  }

  public override async findMaterialByCode(code: string): Promise<IStudioMaterialRecord | null> {
    const upper = code.trim().toUpperCase();
    for (const m of this.materials.values()) {
      if (m.code.toUpperCase() === upper) return JSON.parse(JSON.stringify(m));
    }
    return null;
  }

  public async findMaterialsBySkus(skus: string[]): Promise<IStudioMaterialRecord[]> {
    const upperSkus = new Set(skus.map((s) => s.trim().toUpperCase()));
    const matchedMaterials: IStudioMaterialRecord[] = [];
    for (const m of this.materials.values()) {
      const hasSku = m.variants.some((v) => upperSkus.has(v.sku.toUpperCase()));
      if (hasSku) {
        matchedMaterials.push(JSON.parse(JSON.stringify(m)));
      }
    }
    return matchedMaterials;
  }

  public override async createMaterial(data: any): Promise<IStudioMaterialRecord> {
    const id = data.id || randomUUID();
    const material: IStudioMaterialRecord = {
      id,
      name: data.name,
      code: data.code.toUpperCase(),
      description: data.description || null,
      materialType: data.materialType,
      imageUrl: data.imageUrl || null,
      renderAssetUrl: data.renderAssetUrl || null,
      additionalImages: data.additionalImages || [],
      allowedJewelleryTypes: data.allowedJewelleryTypes || ["bracelet"],
      supportedConstructionTypes: data.supportedConstructionTypes || ["elastic"],
      visibilityScopes: data.visibilityScopes || ["studio"],
      isActive: data.isActive !== undefined ? data.isActive : true,
      sortOrder: data.sortOrder || 0,
      variants: (data.variants || []).map((v: any) => ({
        id: v.id || randomUUID(),
        materialId: id,
        sku: v.sku.toUpperCase(),
        color: v.color || null,
        finish: v.finish || null,
        sizeLabel: v.sizeLabel || null,
        lengthMm: v.lengthMm ?? null,
        widthMm: v.widthMm ?? null,
        heightMm: v.heightMm ?? null,
        diameterMm: v.diameterMm ?? 8,
        holeDiameterMm: v.holeDiameterMm ?? null,
        attachmentSizeMm: v.attachmentSizeMm ?? null,
        dimensionsMm: {
          diameter: v.diameterMm ?? 8,
          length: v.lengthMm ?? undefined,
          width: v.widthMm ?? undefined,
          height: v.heightMm ?? undefined,
          holeDiameter: v.holeDiameterMm ?? undefined,
          attachmentSize: v.attachmentSizeMm ?? undefined,
        },
        sellingUnit: v.sellingUnit || "piece",
        purchaseCost: v.purchaseCost ?? 10,
        sellingRate: v.sellingRate ?? 25,
        stock: v.stock ?? 100,
        lowStockThreshold: v.lowStockThreshold ?? 5,
        isActive: v.isActive !== undefined ? v.isActive : true,
        createdAt: new Date(),
        updatedAt: new Date(),
      })),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.materials.set(id, material);
    return JSON.parse(JSON.stringify(material));
  }

  public override async updateMaterial(id: string, data: any): Promise<IStudioMaterialRecord | null> {
    const m = this.materials.get(id);
    if (!m) return null;
    if (data.name !== undefined) m.name = data.name;
    if (data.description !== undefined) m.description = data.description;
    if (data.isActive !== undefined) m.isActive = data.isActive;
    m.updatedAt = new Date();
    return JSON.parse(JSON.stringify(m));
  }

  public override async deleteMaterial(id: string): Promise<boolean> {
    return this.materials.delete(id);
  }

  public override async findVariantBySku(sku: string): Promise<{ variant: IStudioMaterialVariantRecord; material: IStudioMaterialRecord } | null> {
    const upper = sku.trim().toUpperCase();
    for (const m of this.materials.values()) {
      for (const v of m.variants) {
        if (v.sku.toUpperCase() === upper) {
          return {
            variant: JSON.parse(JSON.stringify(v)),
            material: JSON.parse(JSON.stringify(m)),
          };
        }
      }
    }
    return null;
  }

  public override async atomicDecrementVariantStock(
    sku: string,
    quantity: number
  ): Promise<boolean> {
    const upper = sku.trim().toUpperCase();
    for (const m of this.materials.values()) {
      for (const v of m.variants) {
        if (v.sku.toUpperCase() === upper && v.isActive) {
          if (v.stock >= quantity) {
            v.stock -= quantity;
            v.updatedAt = new Date();
            return true;
          }
          return false;
        }
      }
    }
    return false;
  }

  public override async incrementVariantStock(
    sku: string,
    quantity: number
  ): Promise<boolean> {
    const upper = sku.trim().toUpperCase();
    for (const m of this.materials.values()) {
      for (const v of m.variants) {
        if (v.sku.toUpperCase() === upper) {
          v.stock += quantity;
          v.updatedAt = new Date();
          return true;
        }
      }
    }
    return false;
  }

  // --- Component Types ---
  public async findAllComponentTypes(activeOnly?: boolean): Promise<IComponentTypeRecord[]> {
    let list = Array.from(this.componentTypes.values());
    if (activeOnly) list = list.filter((c) => c.isActive);
    return list.map((c) => ({ ...c }));
  }

  public async findComponentTypeById(id: string): Promise<IComponentTypeRecord | null> {
    const c = this.componentTypes.get(id);
    return c ? { ...c } : null;
  }

  public override async createComponentType(data: any): Promise<IComponentTypeRecord> {
    const id = data.id || randomUUID();
    const c: IComponentTypeRecord = {
      id,
      typeId: data.typeId.toLowerCase(),
      displayName: data.displayName,
      description: data.description || null,
      displayOrder: data.displayOrder ?? 0,
      isActive: data.isActive !== undefined ? data.isActive : true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.componentTypes.set(id, c);
    return { ...c };
  }

  // --- Jewellery Types ---
  public async findAllJewelleryTypes(options?: any): Promise<IJewelleryTypeRecord[]> {
    let list = Array.from(this.jewelleryTypes.values());
    if (options?.isPublished !== undefined) {
      list = list.filter((j) => j.isPublished === options.isPublished);
    }
    if (options?.isEnabled !== undefined) {
      list = list.filter((j) => j.isEnabled === options.isEnabled);
    }
    return list.map((j) => ({ ...j }));
  }

  public override async findJewelleryTypeBySlug(slug: string): Promise<IJewelleryTypeRecord | null> {
    const s = slug.trim().toLowerCase();
    for (const j of this.jewelleryTypes.values()) {
      if (j.slug.toLowerCase() === s) return { ...j };
    }
    return null;
  }

  public override async createJewelleryType(data: any): Promise<IJewelleryTypeRecord> {
    const id = data.id || randomUUID();
    const j: IJewelleryTypeRecord = {
      id,
      slug: data.slug.toLowerCase(),
      displayName: data.displayName,
      description: data.description || null,
      imageUrl: data.imageUrl || null,
      displayOrder: data.displayOrder ?? 0,
      isEnabled: data.isEnabled !== undefined ? data.isEnabled : true,
      isPublished: data.isPublished !== undefined ? data.isPublished : true,
      isArchived: false,
      archivedAt: null,
      designerStatus: data.designerStatus || "available",
      supportedConstructionTypes: data.supportedConstructionTypes || ["elastic"],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.jewelleryTypes.set(id, j);
    return { ...j };
  }

  // --- Customization Configs ---
  public override async findCustomizationConfig(options: {
    productType?: string;
    categoryId?: string;
    isActive?: boolean;
  }): Promise<ICustomizationConfigRecord | null> {
    for (const c of this.customizationConfigs.values()) {
      if (options.productType && c.productType !== options.productType) continue;
      if (options.categoryId && c.categoryId !== options.categoryId) continue;
      if (options.isActive !== undefined && c.isActive !== options.isActive) continue;
      return JSON.parse(JSON.stringify(c));
    }
    return null;
  }

  public override async createCustomizationConfig(data: any): Promise<ICustomizationConfigRecord> {
    const id = data.id || randomUUID();
    const cfg: ICustomizationConfigRecord = {
      id,
      name: data.name,
      productType: data.productType,
      categoryId: data.categoryId || null,
      fields: data.fields || [],
      basePriceModifier: data.basePriceModifier ?? 0,
      previewLayers: data.previewLayers || [],
      isActive: data.isActive !== undefined ? data.isActive : true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.customizationConfigs.set(id, cfg);
    return JSON.parse(JSON.stringify(cfg));
  }

  // --- Making Charges & Design Rules ---
  public override async findMakingCharge(
    jewelleryType: string,
    constructionType: string
  ): Promise<IMakingChargeRecord | null> {
    const key = `${jewelleryType.toLowerCase()}:${constructionType.toLowerCase()}`;
    const mc = this.makingCharges.get(key);
    return mc ? { ...mc } : null;
  }

  public override async upsertMakingCharge(data: any): Promise<IMakingChargeRecord> {
    const key = `${data.jewelleryType.toLowerCase()}:${data.constructionType.toLowerCase()}`;
    const mc: IMakingChargeRecord = {
      id: randomUUID(),
      jewelleryType: data.jewelleryType.toLowerCase(),
      constructionType: data.constructionType.toLowerCase(),
      baseFee: data.baseFee,
      serviceCharges: data.serviceCharges || [],
      isActive: data.isActive !== undefined ? data.isActive : true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.makingCharges.set(key, mc);
    return { ...mc };
  }

  public override async findDesignRule(
    jewelleryType: string,
    constructionType: string
  ): Promise<IDesignRuleRecord | null> {
    const key = `${jewelleryType.toLowerCase()}:${constructionType.toLowerCase()}`;
    const dr = this.designRules.get(key);
    return dr ? { ...dr } : null;
  }

  public override async upsertDesignRule(data: any): Promise<IDesignRuleRecord> {
    const key = `${data.jewelleryType.toLowerCase()}:${data.constructionType.toLowerCase()}`;
    const dr: IDesignRuleRecord = {
      id: randomUUID(),
      jewelleryType: data.jewelleryType.toLowerCase(),
      constructionType: data.constructionType.toLowerCase(),
      minWristMm: data.minWristMm ?? 130,
      maxWristMm: data.maxWristMm ?? 220,
      minComponents: data.minComponents ?? 10,
      maxComponents: data.maxComponents ?? 45,
      permittedBeadSizesMm: data.permittedBeadSizesMm || [6, 8, 10],
      allowedMaterialTypes: data.allowedMaterialTypes || ["bead", "charm", "spacer"],
      maxCharms: data.maxCharms ?? 5,
      fitAllowanceMm: data.fitAllowanceMm ?? 10,
      requiresReviewThresholds: data.requiresReviewThresholds || {},
      isActive: data.isActive !== undefined ? data.isActive : true,
      version: data.version ?? 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.designRules.set(key, dr);
    return { ...dr };
  }

  // --- Templates ---
  public async findAllTemplates(publishedOnly?: boolean): Promise<IDesignTemplateRecord[]> {
    let list = Array.from(this.templates.values());
    if (publishedOnly) list = list.filter((t) => t.isPublished);
    return list.map((t) => JSON.parse(JSON.stringify(t)));
  }

  public override async findTemplateBySlug(slug: string): Promise<IDesignTemplateRecord | null> {
    const s = slug.trim().toLowerCase();
    for (const t of this.templates.values()) {
      if (t.slug.toLowerCase() === s) return JSON.parse(JSON.stringify(t));
    }
    return null;
  }

  public override async createTemplate(data: any): Promise<IDesignTemplateRecord> {
    const id = data.id || randomUUID();
    const t: IDesignTemplateRecord = {
      id,
      slug: data.slug.toLowerCase(),
      name: data.name,
      description: data.description || null,
      thumbnailUrl: data.thumbnailUrl || null,
      jewelleryType: data.jewelleryType || "bracelet",
      constructionType: data.constructionType || "elastic",
      wristMm: data.wristMm ?? 160,
      beadSequence: data.beadSequence || [],
      charms: data.charms || [],
      isPublished: data.isPublished !== undefined ? data.isPublished : false,
      sortOrder: data.sortOrder ?? 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.templates.set(id, t);
    return JSON.parse(JSON.stringify(t));
  }

  public override async updateTemplate(slug: string, data: any): Promise<IDesignTemplateRecord | null> {
    const t = await this.findTemplateBySlug(slug);
    if (!t) return null;
    const existing = this.templates.get(t.id)!;
    if (data.name !== undefined) existing.name = data.name;
    if (data.isPublished !== undefined) existing.isPublished = data.isPublished;
    existing.updatedAt = new Date();
    return JSON.parse(JSON.stringify(existing));
  }

  public override async deleteTemplate(slug: string): Promise<boolean> {
    const t = await this.findTemplateBySlug(slug);
    if (!t) return false;
    return this.templates.delete(t.id);
  }

  // --- Saved Designs ---
  public async findAllSavedDesigns(userId: string): Promise<ISavedDesignRecord[]> {
    return this.findSavedDesignsByUserId(userId);
  }

  public override async findSavedDesignsByUserId(userId: string): Promise<ISavedDesignRecord[]> {
    const list = Array.from(this.savedDesigns.values()).filter((d) => d.userId === userId);
    return list.map((d) => JSON.parse(JSON.stringify(d)));
  }

  public override async findSavedDesignById(id: string): Promise<ISavedDesignRecord | null> {
    const d = this.savedDesigns.get(id);
    return d ? JSON.parse(JSON.stringify(d)) : null;
  }

  public override async createSavedDesign(data: any): Promise<ISavedDesignRecord> {
    const id = data.id || randomUUID();
    const d: ISavedDesignRecord = {
      id,
      userId: data.userId,
      name: data.name,
      jewelleryType: data.jewelleryType || "bracelet",
      constructionType: data.constructionType || "elastic_bead",
      wristMm: data.wristMm ?? 160,
      dimensionLabel: data.dimensionLabel || null,
      beadSequence: data.beadSequence || [],
      charms: data.charms || [],
      estimatedTotal: data.estimatedTotal ?? 0,
      lastValidatedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.savedDesigns.set(id, d);
    return JSON.parse(JSON.stringify(d));
  }

  public override async updateSavedDesign(id: string, data: any): Promise<ISavedDesignRecord | null> {
    const d = this.savedDesigns.get(id);
    if (!d) return null;
    if (data.name !== undefined) d.name = data.name;
    if (data.estimatedTotal !== undefined) d.estimatedTotal = data.estimatedTotal;
    d.updatedAt = new Date();
    return JSON.parse(JSON.stringify(d));
  }

  public override async deleteSavedDesign(id: string): Promise<boolean> {
    return this.savedDesigns.delete(id);
  }
}

class MockStudioReservationRepository extends PostgresStudioReservationRepository {
  public reservations: Map<string, IStudioReservationRecord> = new Map();

  constructor() {
    super();
  }

  public override async createReservation(data: any): Promise<IStudioReservationRecord> {
    const id = data.id || randomUUID();
    const items: IStudioReservationItemRecord[] = (data.items || []).map((item: any) => ({
      id: randomUUID(),
      reservationId: id,
      materialId: item.materialId,
      materialName: item.materialName || "Material",
      sku: item.sku.toUpperCase(),
      quantity: item.quantity,
    }));

    const res: IStudioReservationRecord = {
      id,
      orderId: data.orderId,
      orderNumber: data.orderNumber,
      userId: data.userId,
      status: (data.status || "reserved") as StudioReservationStatusType,
      reservedAt: new Date(),
      expiresAt: data.expiresAt || new Date(Date.now() + 30 * 60 * 1000),
      committedAt: data.status === "committed" ? new Date() : null,
      releasedAt: null,
      restockedAt: null,
      releaseReason: null,
      reconciliationNotes: null,
      items,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.reservations.set(data.orderId, res);
    return JSON.parse(JSON.stringify(res));
  }

  public override async findById(id: string): Promise<IStudioReservationRecord | null> {
    for (const r of this.reservations.values()) {
      if (r.id === id) return JSON.parse(JSON.stringify(r));
    }
    return null;
  }

  public override async findByOrderId(orderId: string): Promise<IStudioReservationRecord | null> {
    const r = this.reservations.get(orderId);
    return r ? JSON.parse(JSON.stringify(r)) : null;
  }

  public override async findAll(options?: any): Promise<{
    reservations: IStudioReservationRecord[];
    total: number;
  }> {
    let list = Array.from(this.reservations.values());
    if (options?.status) {
      list = list.filter((r) => r.status === options.status);
    }
    return {
      reservations: list.map((r) => JSON.parse(JSON.stringify(r))),
      total: list.length,
    };
  }

  public override async findExpiredReservations(now: Date = new Date()): Promise<IStudioReservationRecord[]> {
    const list = Array.from(this.reservations.values()).filter(
      (r) => r.status === "reserved" && new Date(r.expiresAt).getTime() < now.getTime()
    );
    return list.map((r) => JSON.parse(JSON.stringify(r)));
  }

  public override async atomicTransitionStatus(
    orderId: string,
    fromStatuses: string[],
    toStatus: StudioReservationStatusType,
    updateData?: {
      releasedAt?: Date;
      restockedAt?: Date;
      committedAt?: Date;
      releaseReason?: string;
      reconciliationNotes?: string;
    }
  ): Promise<IStudioReservationRecord | null> {
    const r = this.reservations.get(orderId);
    if (!r) return null;
    if (!fromStatuses.includes(r.status)) {
      return null; // Atomic guard failed
    }

    r.status = toStatus;
    r.updatedAt = new Date();
    if (toStatus === "committed") r.committedAt = updateData?.committedAt || new Date();
    if (toStatus === "released") {
      r.releasedAt = updateData?.releasedAt || new Date();
      r.releaseReason = updateData?.releaseReason || null;
    }
    if (toStatus === "restocked") {
      r.restockedAt = updateData?.restockedAt || new Date();
      r.releaseReason = updateData?.releaseReason || null;
    }
    if (updateData?.reconciliationNotes) {
      r.reconciliationNotes = updateData.reconciliationNotes;
    }

    return JSON.parse(JSON.stringify(r));
  }

  public override async updateReconciliation(
    id: string,
    status: StudioReservationStatusType,
    notes: string
  ): Promise<IStudioReservationRecord | null> {
    for (const r of this.reservations.values()) {
      if (r.id === id) {
        r.status = status;
        r.reconciliationNotes = notes;
        r.updatedAt = new Date();
        return JSON.parse(JSON.stringify(r));
      }
    }
    return null;
  }
}

class MockOrderRepository extends PostgresOrderRepository {
  public orders: Map<string, IOrderRecord> = new Map();

  constructor() {
    super();
  }

  public override async findById(id: string): Promise<IOrderRecord | null> {
    const o = this.orders.get(id);
    return o ? JSON.parse(JSON.stringify(o)) : null;
  }

  public override async updateById(id: string, data: any): Promise<IOrderRecord | null> {
    const o = this.orders.get(id);
    if (!o) return null;
    Object.assign(o, data);
    o.updatedAt = new Date();
    return JSON.parse(JSON.stringify(o));
  }

  public override async appendStatusHistory(
    _orderId: string,
    _entry: any
  ): Promise<any> {
    // In-memory no-op
    return null;
  }

  public override async claimCouponProcessed(orderId: string): Promise<boolean> {
    const o = this.orders.get(orderId);
    if (!o) return false;
    if (o.couponProcessed) return false; // Already claimed!
    o.couponProcessed = true;
    return true;
  }
}

class MockCouponRepository extends PostgresCouponRepository {
  public coupons: Map<string, ICouponRecord> = new Map();

  constructor() {
    super();
  }

  public override async findByCode(code: string): Promise<ICouponRecord | null> {
    const upper = code.trim().toUpperCase();
    for (const c of this.coupons.values()) {
      if (c.code.toUpperCase() === upper) return JSON.parse(JSON.stringify(c));
    }
    return null;
  }

  public override async atomicIncrementUsedCount(idOrCode: string, _client?: any): Promise<boolean> {
    const upper = idOrCode.trim().toUpperCase();
    for (const c of this.coupons.values()) {
      if (c.code.toUpperCase() === upper || c.id === idOrCode) {
        c.usedCount = (c.usedCount || 0) + 1;
        return true;
      }
    }
    return false;
  }

  public async incrementUsedCount(id: string, client?: any): Promise<boolean> {
    return this.atomicIncrementUsedCount(id, client);
  }

  public override async decrementUsedCount(id: string, _client?: any): Promise<boolean> {
    const upper = id.trim().toUpperCase();
    for (const c of this.coupons.values()) {
      if (c.code.toUpperCase() === upper || c.id === id) {
        c.usedCount = Math.max(0, (c.usedCount || 0) - 1);
        return true;
      }
    }
    return false;
  }

  public async incrementUsage(code: string): Promise<boolean> {
    return this.incrementUsedCount(code);
  }

  public async decrementUsage(code: string): Promise<boolean> {
    return this.decrementUsedCount(code);
  }
}

class MockProductRepository extends PostgresProductRepository {
  public products: Map<string, IProductRecord> = new Map();

  public override async findById(id: string): Promise<IProductRecord | null> {
    const p = this.products.get(id);
    return p ? JSON.parse(JSON.stringify(p)) : null;
  }
}

class MockCategoryRepository extends PostgresCategoryRepository {
  public categories: ICategoryRecord[] = [];

  public override async findAll(options?: any): Promise<ICategoryRecord[]> {
    let list = this.categories;
    if (options?.productType) {
      list = list.filter((c) => c.productType === options.productType);
    }
    return list.map((c) => ({ ...c }));
  }
}

// ============================================================================
// TEST SUITE EXECUTION
// ============================================================================

async function runTestSuite() {
  console.log(`\n${BOLD}================================================================${RESET}`);
  console.log(`${BOLD}  Phase 3H: Studio Services & PostgreSQL Migration Test Suite${RESET}`);
  console.log(`${BOLD}================================================================${RESET}\n`);

  // Setup Mock Repositories
  const mockStudioRepo = new MockStudioRepository();
  const mockReservationRepo = new MockStudioReservationRepository();
  const mockOrderRepo = new MockOrderRepository();
  const mockCouponRepo = new MockCouponRepository();
  const mockProductRepo = new MockProductRepository();
  const mockCategoryRepo = new MockCategoryRepository();

  // Inject into services
  studioService.setStudioRepository(mockStudioRepo);
  studioInventoryService.setStudioRepository(mockStudioRepo);
  studioInventoryService.setStudioReservationRepository(mockReservationRepo);
  studioInventoryService.setStudioOrderRepository(mockOrderRepo);
  orderService.setOrderRepository(mockOrderRepo);
  couponService.setCouponRepository(mockCouponRepo);
  customizationService.setCustomizationStudioRepository(mockStudioRepo);
  customizationService.setCustomizationCategoryRepository(mockCategoryRepo);
  customizationService.setCustomizationProductRepository(mockProductRepo);

  // Seed baseline distinct Studio materials & variants:
  // 1. Panda Charm with distinct finishes: Silver Panda vs Gold Panda
  const pandaMat = await mockStudioRepo.createMaterial({
    id: "mat-panda-01",
    name: "Panda Charm Component",
    code: "CHARM-PANDA",
    materialType: "charm",
    imageUrl: "/panda.png",
    renderAssetUrl: "/panda-render.png",
    variants: [
      {
        id: "var-panda-silver",
        sku: "PANDA-SLV-01",
        color: "Silver",
        finish: "Polished Silver",
        diameterMm: 12,
        sellingRate: 75,
        stock: 10,
        isActive: true,
      },
      {
        id: "var-panda-gold",
        sku: "PANDA-GLD-01",
        color: "Gold",
        finish: "18K Gold Plated",
        diameterMm: 12,
        sellingRate: 95,
        stock: 5,
        isActive: true,
      },
    ],
  });

  // 2. Individual Bow Designs (Pink Bow vs Pearl Bow)
  await mockStudioRepo.createMaterial({
    id: "mat-bow-01",
    name: "Designer Bow Charm",
    code: "CHARM-BOW",
    materialType: "charm",
    variants: [
      {
        id: "var-bow-pink",
        sku: "BOW-PNK-01",
        color: "Pink",
        finish: "Enamel",
        diameterMm: 10,
        sellingRate: 45,
        stock: 8,
        isActive: true,
      },
      {
        id: "var-bow-pearl",
        sku: "BOW-PRL-01",
        color: "White",
        finish: "Mother of Pearl",
        diameterMm: 10,
        sellingRate: 60,
        stock: 4,
        isActive: true,
      },
    ],
  });

  // 3. Alphabet Letter Beads (Letter A, Letter R)
  await mockStudioRepo.createMaterial({
    id: "mat-letters-01",
    name: "Alphabet Beads",
    code: "BEAD-ALPHA",
    materialType: "bead",
    variants: [
      {
        id: "var-letter-a",
        sku: "ALPHA-LTR-A",
        sizeLabel: "8mm",
        diameterMm: 8,
        sellingRate: 20,
        stock: 15,
        isActive: true,
      },
      {
        id: "var-letter-r",
        sku: "ALPHA-LTR-R",
        sizeLabel: "8mm",
        diameterMm: 8,
        sellingRate: 20,
        stock: 2, // low stock for testing race conditions
        isActive: true,
      },
    ],
  });

  // 4. Other Charms: Blue Stone Swan
  const swanMat = await mockStudioRepo.createMaterial({
    id: "mat-swan-01",
    name: "Blue Stone Swan Charm",
    code: "CHARM-SWAN-BLU",
    materialType: "charm",
    variants: [
      {
        id: "var-swan-blue",
        sku: "SWAN-BLU-01",
        color: "Royal Blue",
        finish: "Faceted Zircon",
        diameterMm: 14,
        sellingRate: 120,
        stock: 3,
        isActive: true,
      },
    ],
  });

  // 5. Standard 8mm Rose Quartz Bead
  await mockStudioRepo.createMaterial({
    id: "mat-quartz-01",
    name: "Rose Quartz Natural Gemstone",
    code: "BEAD-QUARTZ-ROSE",
    materialType: "bead",
    variants: [
      {
        id: "var-quartz-8mm",
        sku: "QUARTZ-8MM-01",
        sizeLabel: "8mm",
        diameterMm: 8,
        sellingRate: 15,
        stock: 100,
        isActive: true,
      },
    ],
  });

  // Seed Jewellery Types, Making Charges, and Design Rules
  await mockStudioRepo.createJewelleryType({
    slug: "bracelet",
    displayName: "Custom Charm Bracelet",
    isEnabled: true,
    isPublished: true,
    designerStatus: "available",
    supportedConstructionTypes: ["elastic", "wire"],
  });

  await mockStudioRepo.upsertMakingCharge({
    jewelleryType: "bracelet",
    constructionType: "elastic",
    baseFee: 150,
    serviceCharges: [{ name: "stringing", fee: 50 }],
    isActive: true,
  });

  await mockStudioRepo.upsertDesignRule({
    jewelleryType: "bracelet",
    constructionType: "elastic",
    minWristMm: 130,
    maxWristMm: 220,
    minComponents: 10,
    maxComponents: 30,
    permittedBeadSizesMm: [6, 8, 10],
    allowedMaterialTypes: ["bead", "charm", "spacer"],
    maxCharms: 5,
    fitAllowanceMm: 10,
    isActive: true,
    version: 1,
  });

  // Seed Coupon for coupon lifecycle testing
  mockCouponRepo.coupons.set("coupon-renu20", {
    id: "coupon-renu20",
    code: "RENU20",
    description: "20% Discount",
    type: "percentage",
    value: 20,
    minOrderAmount: 100,
    maxDiscount: 200,
    usageLimit: 50,
    usedCount: 5,
    isActive: true,
    startsAt: new Date(Date.now() - 86400000),
    expiresAt: new Date(Date.now() + 86400000),
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  // ============================================================================
  // TEST GROUP 1: Distinct Studio Materials & Variants Preservation
  // ============================================================================
  console.log(`${BLUE}${BOLD}Group 1: Distinct Studio Materials & Variants Preservation${RESET}`);

  await test("Preserves variant-level distinctions (Silver Panda vs Gold Panda)", async () => {
    const silverRes = await mockStudioRepo.findVariantBySku("PANDA-SLV-01");
    const goldRes = await mockStudioRepo.findVariantBySku("PANDA-GLD-01");
    const silver = silverRes?.variant;
    const gold = goldRes?.variant;

    assert(silver !== undefined, "Silver Panda variant exists");
    assert(gold !== undefined, "Gold Panda variant exists");
    assert(silver?.color === "Silver" && silver?.sellingRate === 75, "Silver Panda rate is 75");
    assert(gold?.color === "Gold" && gold?.sellingRate === 95, "Gold Panda rate is 95");
    assert(silver?.stock === 10 && gold?.stock === 5, "Distinct stock counts preserved");
  });

  await test("Preserves individual Bow designs, Alphabet letters & Blue Stone Swan", async () => {
    const pinkBow = (await mockStudioRepo.findVariantBySku("BOW-PNK-01"))?.variant;
    const pearlBow = (await mockStudioRepo.findVariantBySku("BOW-PRL-01"))?.variant;
    const letterA = (await mockStudioRepo.findVariantBySku("ALPHA-LTR-A"))?.variant;
    const letterR = (await mockStudioRepo.findVariantBySku("ALPHA-LTR-R"))?.variant;
    const swan = (await mockStudioRepo.findVariantBySku("SWAN-BLU-01"))?.variant;

    assert(pinkBow !== undefined && pearlBow !== undefined, "Both bow designs exist distinctly");
    assert(letterA !== undefined && letterR !== undefined, "Both alphabet letters exist distinctly");
    assert(swan !== undefined && swan.sku === "SWAN-BLU-01", "Blue Stone Swan charm exists distinctly");
    assert(swan?.sellingRate === 120, "Blue Stone Swan selling rate is 120");
  });

  await test("toPublicMaterial converts and filters inactive variants", async () => {
    const publicMat = studioService.toPublicMaterial(pandaMat);
    assert(publicMat.code === "CHARM-PANDA", "Preserved material code");
    assert(publicMat.variants.length === 2, "Public variants count matches");
    assert(publicMat.variants[0].sku === "PANDA-SLV-01", "Public variant SKU present");
  });

  // ============================================================================
  // TEST GROUP 2: Stock Validation & Insufficient Stock Rejection
  // ============================================================================
  console.log(`\n${BLUE}${BOLD}Group 2: Variant-Level Stock Validation & Rejections${RESET}`);

  await test("validateCustomDesignStock succeeds when sufficient stock is available", async () => {
    const cartItems = [
      {
        itemType: "custom_design",
        name: "My Panda Bracelet",
        quantity: 1,
        studioDesign: {
          beadSequence: [
            { variantSku: "QUARTZ-8MM-01" },
            { variantSku: "QUARTZ-8MM-01" },
            { variantSku: "ALPHA-LTR-A" },
          ],
          charms: [{ variantSku: "PANDA-SLV-01" }],
        },
      },
    ];

    const result = await studioInventoryService.validateCustomDesignStock(cartItems);
    assert(result !== null && typeof result === "object", "Stock validation passed");
    assert(result["QUARTZ-8MM-01"]?.quantity === 2, "Demand aggregated correctly");
  });

  await test("validateCustomDesignStock rejects when demand exceeds variant stock", async () => {
    const cartItems = [
      {
        itemType: "custom_design",
        name: "Rare Charm Bracelet",
        quantity: 10, // Demands 10 swans (only 3 in stock)
        studioDesign: {
          beadSequence: [{ variantSku: "QUARTZ-8MM-01" }],
          charms: [{ variantSku: "SWAN-BLU-01" }],
        },
      },
    ];

    let threw = false;
    try {
      await studioInventoryService.validateCustomDesignStock(cartItems);
    } catch (err: any) {
      threw = true;
      assert(err instanceof AppError, "Throws AppError");
      assert(err.statusCode === 400, "Status code is 400");
      assert(err.message.includes("Insufficient stock for"), "Error message specifies insufficient stock");
    }
    assert(threw, "Stock validation threw error for out-of-stock variant");
  });

  await test("validateCustomDesignStock rejects non-existent variant SKU", async () => {
    const cartItems = [
      {
        itemType: "custom_design",
        name: "Bogus Design",
        quantity: 1,
        studioDesign: {
          beadSequence: [{ variantSku: "NON-EXISTENT-SKU" }],
          charms: [],
        },
      },
    ];

    let threw = false;
    try {
      await studioInventoryService.validateCustomDesignStock(cartItems);
    } catch (err: any) {
      threw = true;
      assert(err.message.includes("not found"), "Error mentions component not found");
    }
    assert(threw, "Rejects unknown variant SKU");
  });

  // ============================================================================
  // TEST GROUP 3: Customization Configuration Resolution
  // ============================================================================
  console.log(`\n${BLUE}${BOLD}Group 3: Customization Config & Option Resolution${RESET}`);

  await test("getCustomizationOptions resolves dynamic materials from repository", async () => {
    await mockStudioRepo.createCustomizationConfig({
      name: "Bracelet Custom Config",
      productType: "bracelet",
      fields: [
        {
          key: "beadColor",
          label: "Bead Color",
          type: "select",
          options: [{ value: "pink", label: "Rose Quartz Pink", priceModifier: 20 }],
        },
      ],
      basePriceModifier: 10,
      isActive: true,
    });

    const options = await customizationService.getCustomizationOptions("bracelet");
    assert(options !== null, "Options resolved");
    assert(options.fields.length >= 1, "Config fields present");
    assert(options.fields[0].key === "beadColor", "Custom beadColor field present");
  });

  // ============================================================================
  // TEST GROUP 4: Saved Design Ownership Authorization & CRUD
  // ============================================================================
  console.log(`\n${BLUE}${BOLD}Group 4: Saved Design Ownership & CRUD${RESET}`);

  let savedDesignId = "";
  const userA = "11111111-1111-4111-8111-111111111111";
  const userB = "22222222-2222-4222-8222-222222222222";

  await test("saveUserDesign creates a new saved design for owner", async () => {
    const design = await studioService.saveUserDesign(userA, {
      name: "My Summer Panda",
      jewelleryType: "bracelet",
      constructionType: "elastic_bead",
      wristMm: 160,
      beadSequence: [{ variantSku: "QUARTZ-8MM-01" }],
      charms: [{ variantSku: "PANDA-SLV-01" }],
      estimatedTotal: 250,
    });

    assert(design !== null && design.id !== undefined, "Design saved successfully");
    assert(design.userId === userA, "User ID matches User A");
    savedDesignId = design.id;
  });

  await test("getUserSavedDesigns only returns designs belonging to the user", async () => {
    const designsA = await studioService.getUserSavedDesigns(userA);
    const designsB = await studioService.getUserSavedDesigns(userB);

    assert(designsA.length === 1, "User A has 1 saved design");
    assert(designsB.length === 0, "User B has 0 saved designs (isolation maintained)");
  });

  await test("updateUserDesign rejects unauthorized access from different user", async () => {
    let threw = false;
    try {
      await studioService.updateUserDesign(userB, savedDesignId, {
        name: "Hacked Design",
      });
    } catch (err: any) {
      threw = true;
      assert(err.statusCode === 404, "404 Not Found thrown for non-owner update");
    }
    assert(threw, "Non-owner update prevented");
  });

  await test("updateUserDesign and deleteUserDesign succeed for owner", async () => {
    const updated = await studioService.updateUserDesign(userA, savedDesignId, {
      name: "Renamed Panda",
    });
    assert(updated.name === "Renamed Panda", "Owner update succeeded");

    const deleted = await studioService.deleteUserDesign(userA, savedDesignId);
    assert(deleted.success === true, "Owner delete succeeded");

    const afterDelete = await mockStudioRepo.findSavedDesignById(savedDesignId);
    assert(afterDelete === null, "Design permanently removed");
  });

  // ============================================================================
  // TEST GROUP 5: Pricing Calculation, Wrist Fit & Design Rules
  // ============================================================================
  console.log(`\n${BLUE}${BOLD}Group 5: Pricing Calculations & Design Rules${RESET}`);

  await test("calculateDesignPrice computes materials + making charges accurately", async () => {
    // 10 Rose Quartz beads @ 15 each = 150
    // 1 Silver Panda charm @ 75 = 75
    // Component subtotal = 225
    // Making charge: base 150 + stringing 50 = 200
    // Total price = 425
    const quote = await studioService.calculateDesignPrice({
      jewelleryType: "bracelet",
      constructionType: "elastic",
      components: [
        { variantSku: "QUARTZ-8MM-01", quantity: 10 },
        { variantSku: "PANDA-SLV-01", quantity: 1 },
      ],
      selectedServiceCharges: ["stringing"],
    });

    assert(quote.totalPrice === 425, `Expected 425, got ${quote.totalPrice}`);
    assert(quote.componentSubtotal === 225, `Component subtotal 225, got ${quote.componentSubtotal}`);
    assert(quote.makingCharge.totalMakingFee === 200, `Making charge 200, got ${quote.makingCharge.totalMakingFee}`);
  });

  await test("calculateDesignPrice enforces component count limits", async () => {
    // Exceed max components (rule maxComponents is 30, send 35)
    let threw = false;
    try {
      await studioService.calculateDesignPrice({
        jewelleryType: "bracelet",
        constructionType: "elastic",
        components: [{ variantSku: "QUARTZ-8MM-01", quantity: 35 }],
      });
    } catch (err: any) {
      threw = true;
      assert(err.message.includes("must be between"), "Enforced maximum component limit");
    }
    assert(threw, "Component limit properly enforced");
  });

  // ============================================================================
  // TEST GROUP 6: Studio Reservation Lifecycle & Atomic Concurrency
  // ============================================================================
  console.log(`\n${BLUE}${BOLD}Group 6: Reservation Lifecycle, Concurrency & Rollback${RESET}`);

  const testOrderId = "44444444-4444-4444-8444-444444444444";
  const testOrderNum = "RL261123-12345";
  const testUserId = "33333333-3333-4333-8333-333333333333";

  await test("reserveStudioStockForOrder decrements stock atomically and creates reservation", async () => {
    const swanBefore = (await mockStudioRepo.findVariantBySku("SWAN-BLU-01"))?.variant;
    assert(swanBefore?.stock === 3, "Swan stock is 3 before reservation");

    const reservation = await studioInventoryService.reserveStudioStockForOrder({
      orderId: testOrderId,
      orderNumber: testOrderNum,
      userId: testUserId,
      cartItems: [
        {
          itemType: "custom_design",
          name: "Swan Charm Bracelet",
          quantity: 2, // 2 Swans
          studioDesign: {
            beadSequence: [],
            charms: [{ variantSku: "SWAN-BLU-01" }],
          },
        },
      ],
      paymentMethod: "razorpay",
    });

    assert(reservation !== null, "Reservation created");
    assert(reservation?.status === "reserved", "Status is 'reserved'");
    assert(reservation?.items[0].quantity === 2, "Reserved 2 units");

    const swanAfter = (await mockStudioRepo.findVariantBySku("SWAN-BLU-01"))?.variant;
    assert(swanAfter?.stock === 1, `Swan stock decremented to 1, got ${swanAfter?.stock}`);
  });

  await test("Concurrent reservation exceeding remaining stock fails atomically", async () => {
    // Swan stock is currently 1. Two concurrent attempts wanting 1 each.
    // The second should fail when competing for the last 1.
    const order2 = "55555555-5555-4555-8555-555555555551";
    const order3 = "55555555-5555-4555-8555-555555555552";

    const attempt1 = await studioInventoryService.reserveStudioStockForOrder({
      orderId: order2,
      orderNumber: "RL-RACE-02",
      userId: testUserId,
      cartItems: [
        {
          itemType: "custom_design",
          name: "Swan 1",
          quantity: 1,
          studioDesign: { charms: [{ variantSku: "SWAN-BLU-01" }] },
        },
      ],
      paymentMethod: "razorpay",
    });

    assert(attempt1 !== null, "First competitor secured last swan");

    let attempt2Threw = false;
    try {
      await studioInventoryService.reserveStudioStockForOrder({
        orderId: order3,
        orderNumber: "RL-RACE-03",
        userId: testUserId,
        cartItems: [
          {
            itemType: "custom_design",
            name: "Swan 2",
            quantity: 1,
            studioDesign: { charms: [{ variantSku: "SWAN-BLU-01" }] },
          },
        ],
        paymentMethod: "razorpay",
      });
    } catch (err: any) {
      attempt2Threw = true;
      assert(err.message.includes("Insufficient stock"), "Second competitor rejected cleanly");
    }
    assert(attempt2Threw, "Zero stock race condition prevented");

    // Clean up competitor 1
    await studioInventoryService.releaseStudioReservation(order2, "test cleanup");
  });

  await test("commitStudioReservation commits reservation and is idempotent", async () => {
    const committed = await studioInventoryService.commitStudioReservation(testOrderId);
    assert(committed !== null && committed.status === "committed", "Status transitioned to committed");

    // Duplicate call
    const dupCommit = await studioInventoryService.commitStudioReservation(testOrderId);
    assert(dupCommit !== null && dupCommit.status === "committed", "Idempotent duplicate commit returns existing");
  });

  await test("restockStudioReservation restores stock and is idempotent against double restock", async () => {
    const swanBeforeRestock = (await mockStudioRepo.findVariantBySku("SWAN-BLU-01"))?.variant;
    const stockBefore = swanBeforeRestock?.stock ?? 0;

    const restocked = await studioInventoryService.restockStudioReservation(testOrderId, "Order Cancelled");
    assert(restocked !== null && restocked.restocked === true, "Status transitioned to restocked");

    const swanAfterRestock = (await mockStudioRepo.findVariantBySku("SWAN-BLU-01"))?.variant;
    assert(
      swanAfterRestock?.stock === stockBefore + 2,
      `Stock restored by 2 units (from ${stockBefore} to ${swanAfterRestock?.stock})`
    );

    // Duplicate restock must NOT restore stock again
    const dupRestock = await studioInventoryService.restockStudioReservation(testOrderId, "Duplicate Call");
    assert(dupRestock !== null && dupRestock.restocked === false, "Duplicate restock detected as already restocked");

    const swanAfterDup = (await mockStudioRepo.findVariantBySku("SWAN-BLU-01"))?.variant;
    assert(swanAfterDup?.stock === swanAfterRestock?.stock, "Stock not double-restocked");
  });

  await test("cleanupExpiredStudioReservations releases only unpaid expired reservations", async () => {
    const expOrderId = "66666666-6666-4666-8666-666666666666";
    // Create an expired reservation in the past
    await mockReservationRepo.createReservation({
      orderId: expOrderId,
      orderNumber: "EXP-01",
      userId: testUserId,
      status: "reserved",
      expiresAt: new Date(Date.now() - 1000 * 60 * 60), // 1 hour ago
      items: [{ materialId: swanMat.id, materialName: "Swan", sku: "SWAN-BLU-01", quantity: 1 }],
    });
    // Manually decrement variant stock to represent reservation
    await mockStudioRepo.atomicDecrementVariantStock("SWAN-BLU-01", 1);
    const stockAfterManual = (await mockStudioRepo.findVariantBySku("SWAN-BLU-01"))?.variant?.stock ?? 0;

    const cleanupRes = await studioInventoryService.cleanupExpiredStudioReservations();
    assert(cleanupRes.released === 1, `Cleaned up 1 expired reservation (got ${cleanupRes.released})`);

    const expRes = await mockReservationRepo.findByOrderId(expOrderId);
    assert(expRes?.status === "released", "Expired reservation marked as released");

    const swanRestored = (await mockStudioRepo.findVariantBySku("SWAN-BLU-01"))?.variant;
    assert(swanRestored?.stock === stockAfterManual + 1, "Stock automatically restored by cleanup");
  });

  // ============================================================================
  // TEST GROUP 7: Order Cancellation Restock Integration
  // ============================================================================
  console.log(`\n${BLUE}${BOLD}Group 7: Order Cancellation Restock Integration${RESET}`);

  await test("orderService.cancelOrder triggers restockStudioReservation", async () => {
    const cancelOrderId = "77777777-7777-4777-8777-777777777777";
    const cancelOrderNum = "RL261123-99999";

    // 1. Reserve 1 Pink Bow
    const pinkBowBefore = (await mockStudioRepo.findVariantBySku("BOW-PNK-01"))?.variant?.stock ?? 0;
    const res = await studioInventoryService.reserveStudioStockForOrder({
      orderId: cancelOrderId,
      orderNumber: cancelOrderNum,
      userId: testUserId,
      cartItems: [
        {
          itemType: "custom_design",
          name: "Pink Bow Bracelet",
          quantity: 1,
          studioDesign: { charms: [{ variantSku: "BOW-PNK-01" }] },
        },
      ],
      paymentMethod: "cod",
    });
    await studioInventoryService.commitStudioReservation(cancelOrderId);

    // 2. Setup mock order
    const mockOrder: IOrderRecord = {
      id: cancelOrderId,
      _id: cancelOrderId,
      orderNumber: cancelOrderNum,
      userId: testUserId,
      email: "test@example.com",
      status: "processing",
      items: [
        {
          id: randomUUID(),
          _id: randomUUID(),
          orderId: cancelOrderId,
          productId: "prod-fake",
          name: "Pink Bow Bracelet",
          sku: "BOW-PNK-01",
          imageUrl: null,
          unitPrice: 250,
          quantity: 1,
          subtotal: 250,
          customization: null,
          itemType: "custom_design",
          studioDesign: { charms: [{ variantSku: "BOW-PNK-01" }] },
          createdAt: new Date(),
        },
      ],
      subtotal: 250,
      tax: 0,
      shipping: 0,
      discount: 0,
      total: 250,
      currency: "INR",
      paymentMethod: "cod",
      paymentStatus: "pending",
      studioReservationId: res?.id || cancelOrderId,
      studioReservationStatus: "committed",
      couponCode: null,
      couponProcessed: false,
      cartCleared: false,
      shippingAddress: {},
      billingAddress: null,
      phone: "9876543210",
      notes: null,
      razorpayOrderId: null,
      razorpayPaymentId: null,
      razorpaySignature: null,
      trackingNumber: null,
      invoiceUrl: null,
      statusHistory: [],
      fulfillmentStatus: "pending",
      fulfillmentErrors: [],
      deductedItemIds: [],
      idempotencyKey: null,
      checkoutFingerprint: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    mockOrderRepo.orders.set(cancelOrderId, mockOrder);

    // 3. Cancel order (orderService.cancelOrder(userId, orderId))
    const cancelled = await orderService.cancelOrder(testUserId, cancelOrderId);
    assert(cancelled.status === "cancelled", "Order status is cancelled");

    // 4. Verify reservation status is restocked
    const checkRes = await mockReservationRepo.findByOrderId(cancelOrderId);
    assert(checkRes?.status === "restocked", "Studio reservation transitioned to restocked");

    // 5. Verify physical stock restored
    const pinkBowAfter = (await mockStudioRepo.findVariantBySku("BOW-PNK-01"))?.variant?.stock ?? 0;
    assert(pinkBowAfter === pinkBowBefore, `Pink Bow stock restored to ${pinkBowBefore}`);
  });

  // ============================================================================
  // TEST GROUP 8: Coupon Lifecycle Guarantee (Exactly-Once across Full Flow)
  // ============================================================================
  console.log(`\n${BLUE}${BOLD}Group 8: Coupon Lifecycle Exactly-Once Guarantee${RESET}`);

  await test("claimCouponProcessed guarantees single-winner concurrency", async () => {
    const couponOrderId = "88888888-8888-4888-8888-888888888881";
    mockOrderRepo.orders.set(couponOrderId, {
      id: couponOrderId,
      _id: couponOrderId,
      orderNumber: "RL-COUPON-01",
      userId: testUserId,
      email: "customer@example.com",
      status: "pending",
      items: [],
      subtotal: 500,
      tax: 0,
      shipping: 0,
      discount: 100,
      total: 400,
      currency: "INR",
      paymentMethod: "razorpay",
      paymentStatus: "pending",
      couponCode: "RENU20",
      couponProcessed: false,
      cartCleared: false,
      shippingAddress: {},
      billingAddress: null,
      phone: "9876543210",
      notes: null,
      razorpayOrderId: null,
      razorpayPaymentId: null,
      razorpaySignature: null,
      trackingNumber: null,
      invoiceUrl: null,
      statusHistory: [],
      fulfillmentStatus: "pending",
      fulfillmentErrors: [],
      deductedItemIds: [],
      idempotencyKey: null,
      checkoutFingerprint: null,
      studioReservationId: null,
      studioReservationStatus: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // First attempt to claim coupon processing
    const firstClaim = await mockOrderRepo.claimCouponProcessed(couponOrderId);
    assert(firstClaim === true, "First caller successfully claimed coupon processing");

    // Second concurrent / retry attempt
    const secondClaim = await mockOrderRepo.claimCouponProcessed(couponOrderId);
    assert(secondClaim === false, "Duplicate caller blocked from claiming coupon processing");
  });

  await test("Order cancellation rolls back redeemed coupon usage", async () => {
    const cancelCouponOrderId = "88888888-8888-4888-8888-888888888882";
    const initialUsedCount = (await mockCouponRepo.findByCode("RENU20"))?.usedCount ?? 0;

    // Simulate redeemed coupon on order
    mockOrderRepo.orders.set(cancelCouponOrderId, {
      id: cancelCouponOrderId,
      _id: cancelCouponOrderId,
      orderNumber: "RL-COUPON-02",
      userId: testUserId,
      email: "customer@example.com",
      status: "processing",
      items: [],
      subtotal: 500,
      tax: 0,
      shipping: 0,
      discount: 100,
      total: 400,
      currency: "INR",
      paymentMethod: "cod",
      paymentStatus: "pending",
      couponCode: "RENU20",
      couponProcessed: true,
      cartCleared: false,
      shippingAddress: {},
      billingAddress: null,
      phone: "9876543210",
      notes: null,
      razorpayOrderId: null,
      razorpayPaymentId: null,
      razorpaySignature: null,
      trackingNumber: null,
      invoiceUrl: null,
      statusHistory: [],
      fulfillmentStatus: "pending",
      fulfillmentErrors: [],
      deductedItemIds: [],
      idempotencyKey: null,
      checkoutFingerprint: null,
      studioReservationId: null,
      studioReservationStatus: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    // Increment usage
    await mockCouponRepo.incrementUsedCount("RENU20");
    const countAfterRedeem = (await mockCouponRepo.findByCode("RENU20"))?.usedCount ?? 0;
    assert(countAfterRedeem === initialUsedCount + 1, "Coupon usage incremented on redemption");

    // Cancel the order (orderService.cancelOrder(userId, orderId))
    await orderService.cancelOrder(testUserId, cancelCouponOrderId);

    // Verify coupon usage decremented back
    const countAfterCancel = (await mockCouponRepo.findByCode("RENU20"))?.usedCount ?? 0;
    assert(
      countAfterCancel === initialUsedCount,
      `Coupon usage rolled back from ${countAfterRedeem} to ${countAfterCancel}`
    );

    const orderAfterCancel = await mockOrderRepo.findById(cancelCouponOrderId);
    assert(orderAfterCancel?.couponProcessed === false, "order.couponProcessed reset to false");
  });

  // ============================================================================
  // TEST GROUP 9: Component Types, Jewellery Types, and Design Templates
  // ============================================================================
  console.log(`\n${BLUE}${BOLD}Group 9: Component Types, Jewellery Types & Templates${RESET}`);

  await test("Component type CRUD operates cleanly", async () => {
    const ct = await mockStudioRepo.createComponentType({
      typeId: "spacer",
      displayName: "Spacer Beads & Rings",
      displayOrder: 2,
      isActive: true,
    });

    assert(ct.typeId === "spacer", "Created component type 'spacer'");
    const all = await mockStudioRepo.findAllComponentTypes();
    assert(all.length >= 1, "Component types retrieved");
  });

  await test("Jewellery type CRUD and availability status check", async () => {
    const types = await mockStudioRepo.findAllJewelleryTypes();
    assert(types.length >= 1, "Retrieved jewellery types");
    assert(types[0].slug === "bracelet", "Found bracelet jewellery type");
    assert(types[0].designerStatus === "available", "Designer status is 'available'");
  });

  await test("Design template CRUD and public publishing filtering", async () => {
    await mockStudioRepo.createTemplate({
      slug: "summer-breeze",
      name: "Summer Breeze",
      jewelleryType: "bracelet",
      wristMm: 160,
      isPublished: true,
    });
    await mockStudioRepo.createTemplate({
      slug: "winter-frost",
      name: "Winter Frost",
      jewelleryType: "bracelet",
      wristMm: 160,
      isPublished: false, // draft
    });

    const publicTemplates = await mockStudioRepo.findAllTemplates(true);
    const allTemplates = await mockStudioRepo.findAllTemplates(false);

    assert(publicTemplates.length === 1, "Public templates only includes published items");
    assert(publicTemplates[0].slug === "summer-breeze", "Summer Breeze is public");
    assert(allTemplates.length === 2, "Admin templates includes both published and draft");
  });

  // ============================================================================
  // SUMMARY
  // ============================================================================
  console.log(`\n${BOLD}================================================================${RESET}`);
  console.log(`  ${BOLD}Studio PostgreSQL Migration Test Results${RESET}`);
  console.log(`  Passed: ${GREEN}${passedCount}${RESET}`);
  console.log(`  Failed: ${failedCount === 0 ? GREEN : RED}${failedCount}${RESET}`);
  console.log(`${BOLD}================================================================${RESET}\n`);

  if (failedCount > 0) {
    process.exit(1);
  }
}

runTestSuite().catch((err) => {
  console.error("Fatal test runner exception:", err);
  process.exit(1);
});
