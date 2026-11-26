/**
 * ============================================================================
 * PostgreSQL Studio Repository (Phase 3H)
 * ============================================================================
 *
 * Implements typed, parameterized operations for all Studio catalogue entities,
 * materials, variants, configurations, rules, charges, templates, and designs
 * stored in Supabase PostgreSQL tables:
 * - `component_types`
 * - `jewellery_types`
 * - `studio_materials` & `studio_material_variants`
 * - `customization_configs`
 * - `making_charges`
 * - `design_rules`
 * - `design_templates`
 * - `saved_designs`
 *
 * Adheres strictly to:
 * - Parameterized SQL queries (preventing SQL injection).
 * - Safe identifier validation.
 * - Variant-level stock tracking and atomic decrement protection.
 * - Preservation of existing materials and variants.
 * - Shared PostgreSQL connection pooling via `PostgresDatabase`.
 * - Zero direct Mongoose dependencies.
 */

import { randomUUID } from "node:crypto";
import {
  IDbClient,
  IComponentTypeRecord,
  ICreateComponentTypeData,
  IUpdateComponentTypeData,
  IJewelleryTypeRecord,
  ICreateJewelleryTypeData,
  IUpdateJewelleryTypeData,
  IStudioMaterialRecord,
  IStudioMaterialVariantRecord,
  ICreateStudioMaterialData,
  IUpdateStudioMaterialData,
  ICreateStudioMaterialVariantData,
  IUpdateStudioMaterialVariantData,
  ICustomizationConfigRecord,
  ICreateCustomizationConfigData,
  IUpdateCustomizationConfigData,
  IMakingChargeRecord,
  IUpsertMakingChargeData,
  IDesignRuleRecord,
  IUpsertDesignRuleData,
  IDesignTemplateRecord,
  ICreateDesignTemplateData,
  IUpdateDesignTemplateData,
  ISavedDesignRecord,
  ICreateSavedDesignData,
  IUpdateSavedDesignData,
} from "../types/database.types.js";
import { PostgresDatabase } from "../db/postgres.js";
import { assertValidEntityId } from "../utils/helpers.js";

export class PostgresStudioRepository {
  private client?: IDbClient;

  constructor(client?: IDbClient) {
    this.client = client;
  }

  private getExecutor(overrideClient?: IDbClient): IDbClient {
    if (overrideClient) return overrideClient;
    if (this.client) return this.client;
    return PostgresDatabase.getPool();
  }

  // ---------------------------------------------------------------------------
  // 1. Component Types
  // ---------------------------------------------------------------------------

  public mapRowToComponentType(row: any): IComponentTypeRecord {
    const idStr = String(row.id);
    return {
      id: idStr,
      _id: idStr,
      typeId: String(row.type_id),
      displayName: String(row.display_name),
      description: row.description ? String(row.description) : null,
      displayOrder: Number(row.display_order ?? 0),
      isActive: Boolean(row.is_active),
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  public async listComponentTypes(
    filter?: { isActive?: boolean },
    client?: IDbClient
  ): Promise<IComponentTypeRecord[]> {
    const executor = this.getExecutor(client);
    let sql = `
      SELECT id, type_id, display_name, description, display_order, is_active, created_at, updated_at
      FROM component_types
    `;
    const params: any[] = [];
    if (filter?.isActive !== undefined) {
      sql += ` WHERE is_active = $1`;
      params.push(filter.isActive);
    }
    sql += ` ORDER BY display_order ASC, created_at ASC;`;
    const result = await executor.query(sql, params);
    return result.rows.map((r) => this.mapRowToComponentType(r));
  }

  public async findComponentTypeByTypeId(
    typeId: string,
    client?: IDbClient
  ): Promise<IComponentTypeRecord | null> {
    if (!typeId) return null;
    const executor = this.getExecutor(client);
    const sql = `
      SELECT id, type_id, display_name, description, display_order, is_active, created_at, updated_at
      FROM component_types
      WHERE LOWER(type_id) = LOWER($1)
      LIMIT 1;
    `;
    const result = await executor.query(sql, [typeId.trim()]);
    if (result.rows.length === 0) return null;
    return this.mapRowToComponentType(result.rows[0]);
  }

  public async createComponentType(
    data: ICreateComponentTypeData,
    client?: IDbClient
  ): Promise<IComponentTypeRecord> {
    const executor = this.getExecutor(client);
    const id = data.id || randomUUID();
    const typeId = data.typeId.trim().toLowerCase();
    const sql = `
      INSERT INTO component_types (
        id, type_id, display_name, description, display_order, is_active, created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
      RETURNING id, type_id, display_name, description, display_order, is_active, created_at, updated_at;
    `;
    const params = [
      id,
      typeId,
      data.displayName.trim(),
      data.description || null,
      data.displayOrder ?? 0,
      data.isActive !== undefined ? data.isActive : true,
    ];
    const result = await executor.query(sql, params);
    return this.mapRowToComponentType(result.rows[0]);
  }

  public async updateComponentType(
    typeId: string,
    data: IUpdateComponentTypeData,
    client?: IDbClient
  ): Promise<IComponentTypeRecord | null> {
    const executor = this.getExecutor(client);
    const setClauses: string[] = [];
    const params: any[] = [];
    let pIdx = 1;

    if (data.displayName !== undefined) {
      setClauses.push(`display_name = $${pIdx++}`);
      params.push(data.displayName.trim());
    }
    if (data.description !== undefined) {
      setClauses.push(`description = $${pIdx++}`);
      params.push(data.description);
    }
    if (data.displayOrder !== undefined) {
      setClauses.push(`display_order = $${pIdx++}`);
      params.push(data.displayOrder);
    }
    if (data.isActive !== undefined) {
      setClauses.push(`is_active = $${pIdx++}`);
      params.push(data.isActive);
    }

    if (setClauses.length === 0) {
      return this.findComponentTypeByTypeId(typeId, client);
    }

    setClauses.push(`updated_at = NOW()`);
    params.push(typeId.trim().toLowerCase());

    const sql = `
      UPDATE component_types
      SET ${setClauses.join(", ")}
      WHERE LOWER(type_id) = $${pIdx}
      RETURNING id, type_id, display_name, description, display_order, is_active, created_at, updated_at;
    `;
    const result = await executor.query(sql, params);
    if (result.rows.length === 0) return null;
    return this.mapRowToComponentType(result.rows[0]);
  }

  public async deleteComponentType(typeId: string, client?: IDbClient): Promise<boolean> {
    const executor = this.getExecutor(client);
    const sql = `DELETE FROM component_types WHERE LOWER(type_id) = LOWER($1);`;
    const result = await executor.query(sql, [typeId.trim()]);
    return result.rowCount > 0;
  }

  public async getMaterialUsageCountByComponentType(client?: IDbClient): Promise<Map<string, number>> {
    const executor = this.getExecutor(client);
    const sql = `
      SELECT LOWER(material_type) AS material_type, COUNT(*)::integer AS count
      FROM studio_materials
      GROUP BY LOWER(material_type);
    `;
    const result = await executor.query<{ material_type: string; count: number }>(sql);
    const map = new Map<string, number>();
    for (const r of result.rows) {
      if (r.material_type) {
        map.set(r.material_type, Number(r.count));
      }
    }
    return map;
  }

  public async ensureDefaultComponentTypes(client?: IDbClient): Promise<void> {
    const defaults = [
      { typeId: "bead", displayName: "Bead", displayOrder: 1 },
      { typeId: "stone", displayName: "Gemstone", displayOrder: 2 },
      { typeId: "charm", displayName: "Charm", displayOrder: 3 },
      { typeId: "spacer", displayName: "Spacer", displayOrder: 4 },
      { typeId: "clasp", displayName: "Clasp", displayOrder: 5 },
      { typeId: "wire_cord", displayName: "Cord / Wire", displayOrder: 6 },
      { typeId: "pendant", displayName: "Pendant", displayOrder: 7 },
      { typeId: "other", displayName: "Other Finding", displayOrder: 8 },
    ];
    const executor = this.getExecutor(client);
    for (const d of defaults) {
      await executor.query(
        `INSERT INTO component_types (id, type_id, display_name, display_order, is_active, created_at, updated_at)
         VALUES ($1, $2, $3, $4, TRUE, NOW(), NOW())
         ON CONFLICT (type_id) DO NOTHING;`,
        [randomUUID(), d.typeId, d.displayName, d.displayOrder]
      );
    }
  }

  // ---------------------------------------------------------------------------
  // 2. Jewellery Types
  // ---------------------------------------------------------------------------

  public mapRowToJewelleryType(row: any): IJewelleryTypeRecord {
    const idStr = String(row.id);
    return {
      id: idStr,
      _id: idStr,
      slug: String(row.slug),
      displayName: String(row.display_name),
      description: row.description ? String(row.description) : null,
      imageUrl: row.image_url ? String(row.image_url) : null,
      displayOrder: Number(row.display_order ?? 0),
      isEnabled: Boolean(row.is_enabled),
      isPublished: Boolean(row.is_published),
      isArchived: Boolean(row.is_archived),
      archivedAt: row.archived_at ? new Date(row.archived_at) : null,
      designerStatus: row.designer_status as "available" | "coming_soon" | "maintenance",
      supportedConstructionTypes: Array.isArray(row.supported_construction_types)
        ? row.supported_construction_types
        : [],
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  public async listJewelleryTypes(
    filter?: { isPublished?: boolean; isEnabled?: boolean; isArchived?: boolean },
    client?: IDbClient
  ): Promise<IJewelleryTypeRecord[]> {
    const executor = this.getExecutor(client);
    const conditions: string[] = [];
    const params: any[] = [];
    let pIdx = 1;

    if (filter?.isPublished !== undefined) {
      conditions.push(`is_published = $${pIdx++}`);
      params.push(filter.isPublished);
    }
    if (filter?.isEnabled !== undefined) {
      conditions.push(`is_enabled = $${pIdx++}`);
      params.push(filter.isEnabled);
    }
    if (filter?.isArchived !== undefined) {
      conditions.push(`is_archived = $${pIdx++}`);
      params.push(filter.isArchived);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const sql = `
      SELECT id, slug, display_name, description, image_url, display_order,
             is_enabled, is_published, is_archived, archived_at, designer_status,
             supported_construction_types, created_at, updated_at
      FROM jewellery_types
      ${whereClause}
      ORDER BY display_order ASC, created_at ASC;
    `;
    const result = await executor.query(sql, params);
    return result.rows.map((r) => this.mapRowToJewelleryType(r));
  }

  public async findJewelleryTypeBySlug(slug: string, client?: IDbClient): Promise<IJewelleryTypeRecord | null> {
    if (!slug) return null;
    const executor = this.getExecutor(client);
    const sql = `
      SELECT id, slug, display_name, description, image_url, display_order,
             is_enabled, is_published, is_archived, archived_at, designer_status,
             supported_construction_types, created_at, updated_at
      FROM jewellery_types
      WHERE LOWER(slug) = LOWER($1)
      LIMIT 1;
    `;
    const result = await executor.query(sql, [slug.trim()]);
    if (result.rows.length === 0) return null;
    return this.mapRowToJewelleryType(result.rows[0]);
  }

  public async createJewelleryType(
    data: ICreateJewelleryTypeData,
    client?: IDbClient
  ): Promise<IJewelleryTypeRecord> {
    const executor = this.getExecutor(client);
    const id = data.id || randomUUID();
    const slug = data.slug.trim().toLowerCase();
    const sql = `
      INSERT INTO jewellery_types (
        id, slug, display_name, description, image_url, display_order,
        is_enabled, is_published, is_archived, archived_at, designer_status,
        supported_construction_types, created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), NOW())
      RETURNING id, slug, display_name, description, image_url, display_order,
                is_enabled, is_published, is_archived, archived_at, designer_status,
                supported_construction_types, created_at, updated_at;
    `;
    const params = [
      id,
      slug,
      data.displayName.trim(),
      data.description || null,
      data.imageUrl || null,
      data.displayOrder ?? 0,
      data.isEnabled !== undefined ? data.isEnabled : true,
      data.isPublished !== undefined ? data.isPublished : false,
      data.isArchived !== undefined ? data.isArchived : false,
      data.archivedAt ? new Date(data.archivedAt) : null,
      data.designerStatus || "coming_soon",
      data.supportedConstructionTypes || [],
    ];
    const result = await executor.query(sql, params);
    return this.mapRowToJewelleryType(result.rows[0]);
  }

  public async updateJewelleryType(
    slug: string,
    data: IUpdateJewelleryTypeData,
    client?: IDbClient
  ): Promise<IJewelleryTypeRecord | null> {
    const executor = this.getExecutor(client);
    const setClauses: string[] = [];
    const params: any[] = [];
    let pIdx = 1;

    if (data.displayName !== undefined) {
      setClauses.push(`display_name = $${pIdx++}`);
      params.push(data.displayName.trim());
    }
    if (data.description !== undefined) {
      setClauses.push(`description = $${pIdx++}`);
      params.push(data.description);
    }
    if (data.imageUrl !== undefined) {
      setClauses.push(`image_url = $${pIdx++}`);
      params.push(data.imageUrl);
    }
    if (data.displayOrder !== undefined) {
      setClauses.push(`display_order = $${pIdx++}`);
      params.push(data.displayOrder);
    }
    if (data.isEnabled !== undefined) {
      setClauses.push(`is_enabled = $${pIdx++}`);
      params.push(data.isEnabled);
    }
    if (data.isPublished !== undefined) {
      setClauses.push(`is_published = $${pIdx++}`);
      params.push(data.isPublished);
    }
    if (data.isArchived !== undefined) {
      setClauses.push(`is_archived = $${pIdx++}`);
      params.push(data.isArchived);
    }
    if (data.archivedAt !== undefined) {
      setClauses.push(`archived_at = $${pIdx++}`);
      params.push(data.archivedAt ? new Date(data.archivedAt) : null);
    }
    if (data.designerStatus !== undefined) {
      setClauses.push(`designer_status = $${pIdx++}`);
      params.push(data.designerStatus);
    }
    if (data.supportedConstructionTypes !== undefined) {
      setClauses.push(`supported_construction_types = $${pIdx++}`);
      params.push(data.supportedConstructionTypes);
    }

    if (setClauses.length === 0) {
      return this.findJewelleryTypeBySlug(slug, client);
    }

    setClauses.push(`updated_at = NOW()`);
    params.push(slug.trim().toLowerCase());

    const sql = `
      UPDATE jewellery_types
      SET ${setClauses.join(", ")}
      WHERE LOWER(slug) = $${pIdx}
      RETURNING id, slug, display_name, description, image_url, display_order,
                is_enabled, is_published, is_archived, archived_at, designer_status,
                supported_construction_types, created_at, updated_at;
    `;
    const result = await executor.query(sql, params);
    if (result.rows.length === 0) return null;
    return this.mapRowToJewelleryType(result.rows[0]);
  }

  public async deleteJewelleryType(slug: string, client?: IDbClient): Promise<boolean> {
    const executor = this.getExecutor(client);
    const sql = `DELETE FROM jewellery_types WHERE LOWER(slug) = LOWER($1);`;
    const result = await executor.query(sql, [slug.trim()]);
    return result.rowCount > 0;
  }

  public async archiveJewelleryType(slug: string, client?: IDbClient): Promise<IJewelleryTypeRecord | null> {
    return this.updateJewelleryType(slug, { isArchived: true, archivedAt: new Date(), isPublished: false }, client);
  }

  public async restoreJewelleryType(slug: string, client?: IDbClient): Promise<IJewelleryTypeRecord | null> {
    return this.updateJewelleryType(slug, { isArchived: false, archivedAt: null }, client);
  }

  // ---------------------------------------------------------------------------
  // 3. Studio Materials & Variants
  // ---------------------------------------------------------------------------

  public mapRowToVariant(row: any): IStudioMaterialVariantRecord {
    const dimensionsMm: any = {};
    if (row.length_mm !== null && row.length_mm !== undefined) dimensionsMm.length = Number(row.length_mm);
    if (row.width_mm !== null && row.width_mm !== undefined) dimensionsMm.width = Number(row.width_mm);
    if (row.height_mm !== null && row.height_mm !== undefined) dimensionsMm.height = Number(row.height_mm);
    if (row.diameter_mm !== null && row.diameter_mm !== undefined) dimensionsMm.diameter = Number(row.diameter_mm);
    if (row.hole_diameter_mm !== null && row.hole_diameter_mm !== undefined) dimensionsMm.holeDiameter = Number(row.hole_diameter_mm);
    if (row.attachment_size_mm !== null && row.attachment_size_mm !== undefined) dimensionsMm.attachmentSize = Number(row.attachment_size_mm);

    const idStr = String(row.id);
    return {
      id: idStr,
      _id: idStr,
      materialId: String(row.material_id),
      sku: String(row.sku).toUpperCase(),
      color: row.color ? String(row.color) : null,
      finish: row.finish ? String(row.finish) : null,
      sizeLabel: String(row.size_label),
      lengthMm: row.length_mm !== null && row.length_mm !== undefined ? Number(row.length_mm) : null,
      widthMm: row.width_mm !== null && row.width_mm !== undefined ? Number(row.width_mm) : null,
      heightMm: row.height_mm !== null && row.height_mm !== undefined ? Number(row.height_mm) : null,
      diameterMm: row.diameter_mm !== null && row.diameter_mm !== undefined ? Number(row.diameter_mm) : null,
      holeDiameterMm: row.hole_diameter_mm !== null && row.hole_diameter_mm !== undefined ? Number(row.hole_diameter_mm) : null,
      attachmentSizeMm: row.attachment_size_mm !== null && row.attachment_size_mm !== undefined ? Number(row.attachment_size_mm) : null,
      sellingUnit: row.selling_unit as "piece" | "pair" | "cm" | "unit",
      purchaseCost: Number(row.purchase_cost ?? 0),
      sellingRate: Number(row.selling_rate ?? 0),
      stock: Number(row.stock ?? 0),
      lowStockThreshold: Number(row.low_stock_threshold ?? 5),
      isActive: Boolean(row.is_active),
      dimensionsMm: Object.keys(dimensionsMm).length > 0 ? dimensionsMm : undefined,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  public mapRowToMaterial(row: any, variants: IStudioMaterialVariantRecord[] = []): IStudioMaterialRecord {
    const idStr = String(row.id);
    return {
      id: idStr,
      _id: idStr,
      name: String(row.name),
      code: String(row.code),
      description: row.description ? String(row.description) : null,
      materialType: String(row.material_type),
      imageUrl: row.image_url ? String(row.image_url) : null,
      renderAssetUrl: row.render_asset_url ? String(row.render_asset_url) : null,
      additionalImages: Array.isArray(row.additional_images) ? row.additional_images : [],
      allowedJewelleryTypes: Array.isArray(row.allowed_jewellery_types) ? row.allowed_jewellery_types : [],
      supportedConstructionTypes: Array.isArray(row.supported_construction_types) ? row.supported_construction_types : [],
      visibilityScopes: Array.isArray(row.visibility_scopes) ? row.visibility_scopes : ["studio"],
      isActive: Boolean(row.is_active),
      sortOrder: Number(row.sort_order ?? 0),
      variants,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  public async findMaterials(
    options?: {
      isActive?: boolean;
      jewelleryType?: string;
      materialType?: string;
      visibilityScope?: string;
      search?: string;
      inStockOnly?: boolean;
      limit?: number;
      offset?: number;
    },
    client?: IDbClient
  ): Promise<{ materials: IStudioMaterialRecord[]; total: number }> {
    const executor = this.getExecutor(client);
    const conditions: string[] = [];
    const params: any[] = [];
    let pIdx = 1;

    if (options?.isActive !== undefined) {
      conditions.push(`m.is_active = $${pIdx++}`);
      params.push(options.isActive);
    }
    if (options?.jewelleryType) {
      conditions.push(`$${pIdx++} = ANY(m.allowed_jewellery_types)`);
      params.push(options.jewelleryType.toLowerCase().trim());
    }
    if (options?.materialType) {
      conditions.push(`LOWER(m.material_type) = LOWER($${pIdx++})`);
      params.push(options.materialType.trim());
    }
    if (options?.visibilityScope) {
      conditions.push(`$${pIdx++} = ANY(m.visibility_scopes)`);
      params.push(options.visibilityScope);
    }
    if (options?.search) {
      conditions.push(`(m.name ILIKE $${pIdx} OR m.code ILIKE $${pIdx} OR m.description ILIKE $${pIdx})`);
      params.push(`%${options.search.trim()}%`);
      pIdx++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const countSql = `SELECT COUNT(*)::integer AS total FROM studio_materials m ${whereClause};`;
    const countResult = await executor.query<{ total: number }>(countSql, params);
    const total = countResult.rows[0]?.total ?? 0;

    let querySql = `
      SELECT m.id, m.name, m.code, m.description, m.material_type, m.image_url,
             m.render_asset_url, m.additional_images, m.allowed_jewellery_types,
             m.supported_construction_types, m.visibility_scopes, m.is_active,
             m.sort_order, m.created_at, m.updated_at
      FROM studio_materials m
      ${whereClause}
      ORDER BY m.sort_order ASC, m.name ASC
    `;

    if (options?.limit !== undefined && options.limit > 0) {
      querySql += ` LIMIT $${pIdx++}`;
      params.push(options.limit);
    }
    if (options?.offset !== undefined && options.offset > 0) {
      querySql += ` OFFSET $${pIdx++}`;
      params.push(options.offset);
    }

    const matResult = await executor.query(querySql, params);
    if (matResult.rows.length === 0) {
      return { materials: [], total };
    }

    const matIds = matResult.rows.map((r) => r.id);
    const variantsResult = await executor.query(
      `SELECT id, material_id, sku, color, finish, size_label, length_mm, width_mm,
              height_mm, diameter_mm, hole_diameter_mm, attachment_size_mm,
              selling_unit, purchase_cost, selling_rate, stock, low_stock_threshold,
              is_active, created_at, updated_at
       FROM studio_material_variants
       WHERE material_id = ANY($1)
       ORDER BY size_label ASC, sku ASC;`,
      [matIds]
    );

    const variantsByMatId = new Map<string, IStudioMaterialVariantRecord[]>();
    for (const vRow of variantsResult.rows) {
      const v = this.mapRowToVariant(vRow);
      if (!variantsByMatId.has(v.materialId)) {
        variantsByMatId.set(v.materialId, []);
      }
      variantsByMatId.get(v.materialId)!.push(v);
    }

    let materials = matResult.rows.map((row) =>
      this.mapRowToMaterial(row, variantsByMatId.get(row.id) || [])
    );

    if (options?.inStockOnly) {
      materials = materials.filter((m) =>
        m.variants.some((v) => v.isActive && v.stock > 0)
      );
    }

    return { materials, total };
  }

  public async findMaterialById(id: string, client?: IDbClient): Promise<IStudioMaterialRecord | null> {
    if (!id) return null;
    assertValidEntityId(id, "materialId");
    const executor = this.getExecutor(client);
    const sql = `
      SELECT id, name, code, description, material_type, image_url,
             render_asset_url, additional_images, allowed_jewellery_types,
             supported_construction_types, visibility_scopes, is_active,
             sort_order, created_at, updated_at
      FROM studio_materials
      WHERE id = $1
      LIMIT 1;
    `;
    const matResult = await executor.query(sql, [id]);
    if (matResult.rows.length === 0) return null;

    const variantsResult = await executor.query(
      `SELECT id, material_id, sku, color, finish, size_label, length_mm, width_mm,
              height_mm, diameter_mm, hole_diameter_mm, attachment_size_mm,
              selling_unit, purchase_cost, selling_rate, stock, low_stock_threshold,
              is_active, created_at, updated_at
       FROM studio_material_variants
       WHERE material_id = $1
       ORDER BY size_label ASC, sku ASC;`,
      [id]
    );

    const variants = variantsResult.rows.map((r) => this.mapRowToVariant(r));
    return this.mapRowToMaterial(matResult.rows[0], variants);
  }

  public async findMaterialByCode(code: string, client?: IDbClient): Promise<IStudioMaterialRecord | null> {
    if (!code) return null;
    const executor = this.getExecutor(client);
    const sql = `
      SELECT id, name, code, description, material_type, image_url,
             render_asset_url, additional_images, allowed_jewellery_types,
             supported_construction_types, visibility_scopes, is_active,
             sort_order, created_at, updated_at
      FROM studio_materials
      WHERE UPPER(code) = UPPER($1)
      LIMIT 1;
    `;
    const matResult = await executor.query(sql, [code.trim()]);
    if (matResult.rows.length === 0) return null;

    const mat = matResult.rows[0];
    const variantsResult = await executor.query(
      `SELECT id, material_id, sku, color, finish, size_label, length_mm, width_mm,
              height_mm, diameter_mm, hole_diameter_mm, attachment_size_mm,
              selling_unit, purchase_cost, selling_rate, stock, low_stock_threshold,
              is_active, created_at, updated_at
       FROM studio_material_variants
       WHERE material_id = $1
       ORDER BY size_label ASC, sku ASC;`,
      [mat.id]
    );

    const variants = variantsResult.rows.map((r) => this.mapRowToVariant(r));
    return this.mapRowToMaterial(mat, variants);
  }

  public async findMaterialsBySkus(skus: string[], client?: IDbClient): Promise<IStudioMaterialRecord[]> {
    if (!skus || skus.length === 0) return [];
    const upperSkus = skus.map((s) => s.trim().toUpperCase());
    const executor = this.getExecutor(client);

    const variantsResult = await executor.query(
      `SELECT id, material_id, sku, color, finish, size_label, length_mm, width_mm,
              height_mm, diameter_mm, hole_diameter_mm, attachment_size_mm,
              selling_unit, purchase_cost, selling_rate, stock, low_stock_threshold,
              is_active, created_at, updated_at
       FROM studio_material_variants
       WHERE UPPER(sku) = ANY($1);`,
      [upperSkus]
    );

    if (variantsResult.rows.length === 0) return [];

    const matIds = Array.from(new Set(variantsResult.rows.map((r) => r.material_id)));
    const matsResult = await executor.query(
      `SELECT id, name, code, description, material_type, image_url,
              render_asset_url, additional_images, allowed_jewellery_types,
              supported_construction_types, visibility_scopes, is_active,
              sort_order, created_at, updated_at
       FROM studio_materials
       WHERE id = ANY($1);`,
      [matIds]
    );

    const variantsByMatId = new Map<string, IStudioMaterialVariantRecord[]>();
    for (const vRow of variantsResult.rows) {
      const v = this.mapRowToVariant(vRow);
      if (!variantsByMatId.has(v.materialId)) {
        variantsByMatId.set(v.materialId, []);
      }
      variantsByMatId.get(v.materialId)!.push(v);
    }

    return matsResult.rows.map((r) => this.mapRowToMaterial(r, variantsByMatId.get(r.id) || []));
  }

  public async findVariantBySku(
    sku: string,
    client?: IDbClient
  ): Promise<{ variant: IStudioMaterialVariantRecord; material: IStudioMaterialRecord } | null> {
    if (!sku) return null;
    const executor = this.getExecutor(client);
    const sql = `
      SELECT v.id AS v_id, v.material_id AS v_material_id, v.sku AS v_sku, v.color AS v_color,
             v.finish AS v_finish, v.size_label AS v_size_label, v.length_mm AS v_length_mm,
             v.width_mm AS v_width_mm, v.height_mm AS v_height_mm, v.diameter_mm AS v_diameter_mm,
             v.hole_diameter_mm AS v_hole_diameter_mm, v.attachment_size_mm AS v_attachment_size_mm,
             v.selling_unit AS v_selling_unit, v.purchase_cost AS v_purchase_cost,
             v.selling_rate AS v_selling_rate, v.stock AS v_stock,
             v.low_stock_threshold AS v_low_stock_threshold, v.is_active AS v_is_active,
             v.created_at AS v_created_at, v.updated_at AS v_updated_at,
             m.id AS m_id, m.name AS m_name, m.code AS m_code, m.description AS m_description,
             m.material_type AS m_material_type, m.image_url AS m_image_url,
             m.render_asset_url AS m_render_asset_url, m.additional_images AS m_additional_images,
             m.allowed_jewellery_types AS m_allowed_jewellery_types,
             m.supported_construction_types AS m_supported_construction_types,
             m.visibility_scopes AS m_visibility_scopes, m.is_active AS m_is_active,
             m.sort_order AS m_sort_order, m.created_at AS m_created_at, m.updated_at AS m_updated_at
      FROM studio_material_variants v
      JOIN studio_materials m ON v.material_id = m.id
      WHERE UPPER(v.sku) = UPPER($1)
      LIMIT 1;
    `;
    const result = await executor.query(sql, [sku.trim()]);
    if (result.rows.length === 0) return null;

    const row = result.rows[0];
    const variantRow = {
      id: row.v_id,
      material_id: row.v_material_id,
      sku: row.v_sku,
      color: row.v_color,
      finish: row.v_finish,
      size_label: row.v_size_label,
      length_mm: row.v_length_mm,
      width_mm: row.v_width_mm,
      height_mm: row.v_height_mm,
      diameter_mm: row.v_diameter_mm,
      hole_diameter_mm: row.v_hole_diameter_mm,
      attachment_size_mm: row.v_attachment_size_mm,
      selling_unit: row.v_selling_unit,
      purchase_cost: row.v_purchase_cost,
      selling_rate: row.v_selling_rate,
      stock: row.v_stock,
      low_stock_threshold: row.v_low_stock_threshold,
      is_active: row.v_is_active,
      created_at: row.v_created_at,
      updated_at: row.v_updated_at,
    };
    const materialRow = {
      id: row.m_id,
      name: row.m_name,
      code: row.m_code,
      description: row.m_description,
      material_type: row.m_material_type,
      image_url: row.m_image_url,
      render_asset_url: row.m_render_asset_url,
      additional_images: row.m_additional_images,
      allowed_jewellery_types: row.m_allowed_jewellery_types,
      supported_construction_types: row.m_supported_construction_types,
      visibility_scopes: row.m_visibility_scopes,
      is_active: row.m_is_active,
      sort_order: row.m_sort_order,
      created_at: row.m_created_at,
      updated_at: row.m_updated_at,
    };

    const variant = this.mapRowToVariant(variantRow);
    const material = this.mapRowToMaterial(materialRow, [variant]);
    return { variant, material };
  }

  public async createMaterial(
    data: ICreateStudioMaterialData,
    client?: IDbClient
  ): Promise<IStudioMaterialRecord> {
    const executor = this.getExecutor(client);
    const id = data.id || randomUUID();
    const code = data.code.trim().toUpperCase();

    const sql = `
      INSERT INTO studio_materials (
        id, name, code, description, material_type, image_url,
        render_asset_url, additional_images, allowed_jewellery_types,
        supported_construction_types, visibility_scopes, is_active,
        sort_order, created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW(), NOW())
      RETURNING id, name, code, description, material_type, image_url,
                render_asset_url, additional_images, allowed_jewellery_types,
                supported_construction_types, visibility_scopes, is_active,
                sort_order, created_at, updated_at;
    `;
    const params = [
      id,
      data.name.trim(),
      code,
      data.description || null,
      data.materialType.trim(),
      data.imageUrl ? data.imageUrl.trim() : null,
      data.renderAssetUrl ? data.renderAssetUrl.trim() : null,
      data.additionalImages || [],
      data.allowedJewelleryTypes || [],
      data.supportedConstructionTypes || [],
      data.visibilityScopes || ["studio"],
      data.isActive !== undefined ? data.isActive : true,
      data.sortOrder ?? 0,
    ];
    const matResult = await executor.query(sql, params);
    const createdMaterial = this.mapRowToMaterial(matResult.rows[0], []);

    if (data.variants && data.variants.length > 0) {
      const createdVariants: IStudioMaterialVariantRecord[] = [];
      for (const v of data.variants) {
        const vRec = await this.addVariant(id, v, executor);
        createdVariants.push(vRec);
      }
      createdMaterial.variants = createdVariants;
    }

    return createdMaterial;
  }

  public async updateMaterial(
    id: string,
    data: IUpdateStudioMaterialData,
    client?: IDbClient
  ): Promise<IStudioMaterialRecord | null> {
    assertValidEntityId(id, "materialId");
    const executor = this.getExecutor(client);

    // If code is being changed and syncVariantSkus is true, fetch old code
    let oldCode: string | null = null;
    if (data.code && data.syncVariantSkus) {
      const current = await this.findMaterialById(id, client);
      if (current) oldCode = current.code.trim().toUpperCase();
    }

    const setClauses: string[] = [];
    const params: any[] = [];
    let pIdx = 1;

    if (data.name !== undefined) {
      setClauses.push(`name = $${pIdx++}`);
      params.push(data.name.trim());
    }
    if (data.code !== undefined) {
      setClauses.push(`code = $${pIdx++}`);
      params.push(data.code.trim().toUpperCase());
    }
    if (data.description !== undefined) {
      setClauses.push(`description = $${pIdx++}`);
      params.push(data.description);
    }
    if (data.materialType !== undefined) {
      setClauses.push(`material_type = $${pIdx++}`);
      params.push(data.materialType.trim());
    }
    if (data.imageUrl !== undefined) {
      setClauses.push(`image_url = $${pIdx++}`);
      params.push(data.imageUrl ? data.imageUrl.trim() : null);
    }
    if (data.renderAssetUrl !== undefined) {
      setClauses.push(`render_asset_url = $${pIdx++}`);
      params.push(data.renderAssetUrl ? data.renderAssetUrl.trim() : null);
    }
    if (data.additionalImages !== undefined) {
      setClauses.push(`additional_images = $${pIdx++}`);
      params.push(data.additionalImages);
    }
    if (data.allowedJewelleryTypes !== undefined) {
      setClauses.push(`allowed_jewellery_types = $${pIdx++}`);
      params.push(data.allowedJewelleryTypes);
    }
    if (data.supportedConstructionTypes !== undefined) {
      setClauses.push(`supported_construction_types = $${pIdx++}`);
      params.push(data.supportedConstructionTypes);
    }
    if (data.visibilityScopes !== undefined) {
      setClauses.push(`visibility_scopes = $${pIdx++}`);
      params.push(data.visibilityScopes);
    }
    if (data.isActive !== undefined) {
      setClauses.push(`is_active = $${pIdx++}`);
      params.push(data.isActive);
    }
    if (data.sortOrder !== undefined) {
      setClauses.push(`sort_order = $${pIdx++}`);
      params.push(data.sortOrder);
    }

    if (setClauses.length === 0) {
      return this.findMaterialById(id, client);
    }

    setClauses.push(`updated_at = NOW()`);
    params.push(id);

    const sql = `
      UPDATE studio_materials
      SET ${setClauses.join(", ")}
      WHERE id = $${pIdx}
      RETURNING id, name, code, description, material_type, image_url,
                render_asset_url, additional_images, allowed_jewellery_types,
                supported_construction_types, visibility_scopes, is_active,
                sort_order, created_at, updated_at;
    `;
    const result = await executor.query(sql, params);
    if (result.rows.length === 0) return null;

    if (oldCode && data.code && data.syncVariantSkus) {
      const newCode = data.code.trim().toUpperCase();
      if (newCode !== oldCode) {
        await executor.query(`
          UPDATE studio_material_variants
          SET sku = $1 || SUBSTRING(sku FROM $2), updated_at = NOW()
          WHERE material_id = $3 AND UPPER(sku) LIKE UPPER($4)
        `, [newCode, oldCode.length + 1, id, `${oldCode}-%`]).catch(() => {});
      }
    }

    return this.findMaterialById(id, client);
  }

  public async deleteMaterial(id: string, client?: IDbClient): Promise<boolean> {
    assertValidEntityId(id, "materialId");
    const executor = this.getExecutor(client);
    const sql = `DELETE FROM studio_materials WHERE id = $1;`;
    const result = await executor.query(sql, [id]);
    return result.rowCount > 0;
  }

  public async addVariant(
    materialId: string,
    data: ICreateStudioMaterialVariantData,
    client?: IDbClient
  ): Promise<IStudioMaterialVariantRecord> {
    assertValidEntityId(materialId, "materialId");
    const executor = this.getExecutor(client);
    const id = data.id || randomUUID();
    const sku = data.sku.trim().toUpperCase();

    const sql = `
      INSERT INTO studio_material_variants (
        id, material_id, sku, color, finish, size_label,
        length_mm, width_mm, height_mm, diameter_mm, hole_diameter_mm,
        attachment_size_mm, selling_unit, purchase_cost, selling_rate,
        stock, low_stock_threshold, is_active, created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, NOW(), NOW())
      RETURNING id, material_id, sku, color, finish, size_label,
                length_mm, width_mm, height_mm, diameter_mm, hole_diameter_mm,
                attachment_size_mm, selling_unit, purchase_cost, selling_rate,
                stock, low_stock_threshold, is_active, created_at, updated_at;
    `;
    const params = [
      id,
      materialId,
      sku,
      data.color || null,
      data.finish || null,
      data.sizeLabel || "Standard",
      (data.dimensionsMm as any)?.lengthMm ?? data.dimensionsMm?.length ?? data.lengthMm ?? null,
      (data.dimensionsMm as any)?.widthMm ?? data.dimensionsMm?.width ?? data.widthMm ?? null,
      (data.dimensionsMm as any)?.heightMm ?? data.dimensionsMm?.height ?? data.heightMm ?? null,
      (data.dimensionsMm as any)?.diameterMm ?? data.dimensionsMm?.diameter ?? data.diameterMm ?? null,
      (data.dimensionsMm as any)?.holeDiameterMm ?? data.dimensionsMm?.holeDiameter ?? data.holeDiameterMm ?? null,
      (data.dimensionsMm as any)?.attachmentSizeMm ?? data.dimensionsMm?.attachmentSize ?? data.attachmentSizeMm ?? null,
      data.sellingUnit || "piece",
      data.purchaseCost ?? 0,
      data.sellingRate,
      data.stock ?? 0,
      data.lowStockThreshold ?? 5,
      data.isActive !== undefined ? data.isActive : true,
    ];
    const result = await executor.query(sql, params);
    return this.mapRowToVariant(result.rows[0]);
  }

  public async updateVariant(
    sku: string,
    data: IUpdateStudioMaterialVariantData,
    client?: IDbClient
  ): Promise<IStudioMaterialVariantRecord | null> {
    const executor = this.getExecutor(client);
    const oldSku = sku.trim().toUpperCase();
    const setClauses: string[] = [];
    const params: any[] = [];
    let pIdx = 1;

    if (data.sku !== undefined && data.sku.trim()) {
      setClauses.push(`sku = $${pIdx++}`);
      params.push(data.sku.trim().toUpperCase());
    }
    if (data.color !== undefined) {
      setClauses.push(`color = $${pIdx++}`);
      params.push(data.color);
    }
    if (data.finish !== undefined) {
      setClauses.push(`finish = $${pIdx++}`);
      params.push(data.finish);
    }
    if (data.sizeLabel !== undefined) {
      setClauses.push(`size_label = $${pIdx++}`);
      params.push(data.sizeLabel);
    }
    if ((data.dimensionsMm as any)?.lengthMm !== undefined || data.dimensionsMm?.length !== undefined || data.lengthMm !== undefined) {
      setClauses.push(`length_mm = $${pIdx++}`);
      params.push((data.dimensionsMm as any)?.lengthMm ?? data.dimensionsMm?.length ?? data.lengthMm);
    }
    if ((data.dimensionsMm as any)?.widthMm !== undefined || data.dimensionsMm?.width !== undefined || data.widthMm !== undefined) {
      setClauses.push(`width_mm = $${pIdx++}`);
      params.push((data.dimensionsMm as any)?.widthMm ?? data.dimensionsMm?.width ?? data.widthMm);
    }
    if ((data.dimensionsMm as any)?.heightMm !== undefined || data.dimensionsMm?.height !== undefined || data.heightMm !== undefined) {
      setClauses.push(`height_mm = $${pIdx++}`);
      params.push((data.dimensionsMm as any)?.heightMm ?? data.dimensionsMm?.height ?? data.heightMm);
    }
    if ((data.dimensionsMm as any)?.diameterMm !== undefined || data.dimensionsMm?.diameter !== undefined || data.diameterMm !== undefined) {
      setClauses.push(`diameter_mm = $${pIdx++}`);
      params.push((data.dimensionsMm as any)?.diameterMm ?? data.dimensionsMm?.diameter ?? data.diameterMm);
    }
    if ((data.dimensionsMm as any)?.holeDiameterMm !== undefined || data.dimensionsMm?.holeDiameter !== undefined || data.holeDiameterMm !== undefined) {
      setClauses.push(`hole_diameter_mm = $${pIdx++}`);
      params.push((data.dimensionsMm as any)?.holeDiameterMm ?? data.dimensionsMm?.holeDiameter ?? data.holeDiameterMm);
    }
    if ((data.dimensionsMm as any)?.attachmentSizeMm !== undefined || data.dimensionsMm?.attachmentSize !== undefined || data.attachmentSizeMm !== undefined) {
      setClauses.push(`attachment_size_mm = $${pIdx++}`);
      params.push((data.dimensionsMm as any)?.attachmentSizeMm ?? data.dimensionsMm?.attachmentSize ?? data.attachmentSizeMm);
    }
    if (data.sellingUnit !== undefined) {
      setClauses.push(`selling_unit = $${pIdx++}`);
      params.push(data.sellingUnit);
    }
    if (data.purchaseCost !== undefined) {
      setClauses.push(`purchase_cost = $${pIdx++}`);
      params.push(data.purchaseCost);
    }
    if (data.sellingRate !== undefined) {
      setClauses.push(`selling_rate = $${pIdx++}`);
      params.push(data.sellingRate);
    }
    if (data.stock !== undefined) {
      setClauses.push(`stock = $${pIdx++}`);
      params.push(data.stock);
    }
    if (data.lowStockThreshold !== undefined) {
      setClauses.push(`low_stock_threshold = $${pIdx++}`);
      params.push(data.lowStockThreshold);
    }
    if (data.isActive !== undefined) {
      setClauses.push(`is_active = $${pIdx++}`);
      params.push(data.isActive);
    }

    if (setClauses.length === 0) {
      const v = await this.findVariantBySku(sku, client);
      return v ? v.variant : null;
    }

    setClauses.push(`updated_at = NOW()`);
    params.push(sku.trim().toUpperCase());

    const sql = `
      UPDATE studio_material_variants
      SET ${setClauses.join(", ")}
      WHERE UPPER(sku) = $${pIdx}
      RETURNING id, material_id, sku, color, finish, size_label,
                length_mm, width_mm, height_mm, diameter_mm, hole_diameter_mm,
                attachment_size_mm, selling_unit, purchase_cost, selling_rate,
                stock, low_stock_threshold, is_active, created_at, updated_at;
    `;
    const result = await executor.query(sql, params);
    if (result.rows.length === 0) return null;

    if (data.sku !== undefined && data.sku.trim()) {
      const newSku = data.sku.trim().toUpperCase();
      if (newSku !== oldSku) {
        await executor.query(
          `UPDATE studio_reservation_items SET sku = $1 WHERE UPPER(sku) = $2`,
          [newSku, oldSku]
        ).catch(() => {});
      }
    }

    return this.mapRowToVariant(result.rows[0]);
  }

  public async deleteVariant(sku: string, client?: IDbClient): Promise<boolean> {
    const executor = this.getExecutor(client);
    const sql = `DELETE FROM studio_material_variants WHERE UPPER(sku) = UPPER($1);`;
    const result = await executor.query(sql, [sku.trim()]);
    return result.rowCount > 0;
  }

  public async atomicDecrementVariantStock(
    sku: string,
    quantity: number,
    client?: IDbClient
  ): Promise<boolean> {
    if (!sku || quantity <= 0) return false;
    const executor = this.getExecutor(client);
    const sql = `
      UPDATE studio_material_variants
      SET stock = stock - $2, updated_at = NOW()
      WHERE UPPER(sku) = UPPER($1)
        AND is_active = TRUE
        AND stock >= $2
      RETURNING id;
    `;
    const result = await executor.query<{ id: string }>(sql, [sku.trim(), quantity]);
    return result.rowCount > 0;
  }

  public async incrementVariantStock(
    sku: string,
    quantity: number,
    client?: IDbClient
  ): Promise<boolean> {
    if (!sku || quantity <= 0) return false;
    const executor = this.getExecutor(client);
    const sql = `
      UPDATE studio_material_variants
      SET stock = stock + $2, updated_at = NOW()
      WHERE UPPER(sku) = UPPER($1)
      RETURNING id;
    `;
    const result = await executor.query<{ id: string }>(sql, [sku.trim(), quantity]);
    return result.rowCount > 0;
  }

  // ---------------------------------------------------------------------------
  // 4. Customization Configs
  // ---------------------------------------------------------------------------

  public mapRowToCustomizationConfig(row: any): ICustomizationConfigRecord {
    const idStr = String(row.id);
    return {
      id: idStr,
      _id: idStr,
      name: String(row.name),
      productType: String(row.product_type),
      categoryId: row.category_id ? String(row.category_id) : null,
      fields: Array.isArray(row.fields) ? row.fields : typeof row.fields === "string" ? JSON.parse(row.fields) : [],
      basePriceModifier: Number(row.base_price_modifier ?? 0),
      previewLayers: Array.isArray(row.preview_layers)
        ? row.preview_layers
        : typeof row.preview_layers === "string"
        ? JSON.parse(row.preview_layers)
        : [],
      isActive: Boolean(row.is_active),
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  public async findCustomizationConfig(
    query: { productType?: string; categoryId?: string | null; isActive?: boolean },
    client?: IDbClient
  ): Promise<ICustomizationConfigRecord | null> {
    const executor = this.getExecutor(client);
    const conditions: string[] = [];
    const params: any[] = [];
    let pIdx = 1;

    if (query.productType) {
      conditions.push(`product_type = $${pIdx++}`);
      params.push(query.productType.toLowerCase());
    }
    if (query.categoryId !== undefined) {
      if (query.categoryId === null) {
        conditions.push(`category_id IS NULL`);
      } else {
        conditions.push(`category_id = $${pIdx++}`);
        params.push(query.categoryId);
      }
    }
    if (query.isActive !== undefined) {
      conditions.push(`is_active = $${pIdx++}`);
      params.push(query.isActive);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const sql = `
      SELECT id, name, product_type, category_id, fields, base_price_modifier, preview_layers, is_active, created_at, updated_at
      FROM customization_configs
      ${whereClause}
      ORDER BY created_at ASC
      LIMIT 1;
    `;
    const result = await executor.query(sql, params);
    if (result.rows.length === 0) return null;
    return this.mapRowToCustomizationConfig(result.rows[0]);
  }

  public async findCustomizationConfigs(
    query?: { productType?: string; isActive?: boolean },
    client?: IDbClient
  ): Promise<ICustomizationConfigRecord[]> {
    const executor = this.getExecutor(client);
    const conditions: string[] = [];
    const params: any[] = [];
    let pIdx = 1;

    if (query?.productType) {
      conditions.push(`product_type = $${pIdx++}`);
      params.push(query.productType.toLowerCase());
    }
    if (query?.isActive !== undefined) {
      conditions.push(`is_active = $${pIdx++}`);
      params.push(query.isActive);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const sql = `
      SELECT id, name, product_type, category_id, fields, base_price_modifier, preview_layers, is_active, created_at, updated_at
      FROM customization_configs
      ${whereClause}
      ORDER BY created_at ASC;
    `;
    const result = await executor.query(sql, params);
    return result.rows.map((r) => this.mapRowToCustomizationConfig(r));
  }

  public async createCustomizationConfig(
    data: ICreateCustomizationConfigData,
    client?: IDbClient
  ): Promise<ICustomizationConfigRecord> {
    const executor = this.getExecutor(client);
    const id = data.id || randomUUID();
    const sql = `
      INSERT INTO customization_configs (
        id, name, product_type, category_id, fields, base_price_modifier, preview_layers, is_active, created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
      RETURNING id, name, product_type, category_id, fields, base_price_modifier, preview_layers, is_active, created_at, updated_at;
    `;
    const params = [
      id,
      data.name.trim(),
      data.productType.toLowerCase(),
      data.categoryId || null,
      JSON.stringify(data.fields || []),
      data.basePriceModifier ?? 0,
      JSON.stringify(data.previewLayers || []),
      data.isActive !== undefined ? data.isActive : true,
    ];
    const result = await executor.query(sql, params);
    return this.mapRowToCustomizationConfig(result.rows[0]);
  }

  public async updateCustomizationConfig(
    id: string,
    data: IUpdateCustomizationConfigData,
    client?: IDbClient
  ): Promise<ICustomizationConfigRecord | null> {
    assertValidEntityId(id, "configId");
    const executor = this.getExecutor(client);
    const setClauses: string[] = [];
    const params: any[] = [];
    let pIdx = 1;

    if (data.name !== undefined) {
      setClauses.push(`name = $${pIdx++}`);
      params.push(data.name.trim());
    }
    if (data.productType !== undefined) {
      setClauses.push(`product_type = $${pIdx++}`);
      params.push(data.productType.toLowerCase());
    }
    if (data.categoryId !== undefined) {
      setClauses.push(`category_id = $${pIdx++}`);
      params.push(data.categoryId);
    }
    if (data.fields !== undefined) {
      setClauses.push(`fields = $${pIdx++}`);
      params.push(JSON.stringify(data.fields));
    }
    if (data.basePriceModifier !== undefined) {
      setClauses.push(`base_price_modifier = $${pIdx++}`);
      params.push(data.basePriceModifier);
    }
    if (data.previewLayers !== undefined) {
      setClauses.push(`preview_layers = $${pIdx++}`);
      params.push(JSON.stringify(data.previewLayers));
    }
    if (data.isActive !== undefined) {
      setClauses.push(`is_active = $${pIdx++}`);
      params.push(data.isActive);
    }

    if (setClauses.length === 0) {
      const existing = await executor.query(`SELECT * FROM customization_configs WHERE id = $1;`, [id]);
      return existing.rows.length > 0 ? this.mapRowToCustomizationConfig(existing.rows[0]) : null;
    }

    setClauses.push(`updated_at = NOW()`);
    params.push(id);

    const sql = `
      UPDATE customization_configs
      SET ${setClauses.join(", ")}
      WHERE id = $${pIdx}
      RETURNING id, name, product_type, category_id, fields, base_price_modifier, preview_layers, is_active, created_at, updated_at;
    `;
    const result = await executor.query(sql, params);
    if (result.rows.length === 0) return null;
    return this.mapRowToCustomizationConfig(result.rows[0]);
  }

  // ---------------------------------------------------------------------------
  // 5. Making Charges
  // ---------------------------------------------------------------------------

  public mapRowToMakingCharge(row: any): IMakingChargeRecord {
    const idStr = String(row.id);
    return {
      id: idStr,
      _id: idStr,
      jewelleryType: String(row.jewellery_type),
      constructionType: String(row.construction_type),
      baseFee: Number(row.base_fee ?? 0),
      serviceCharges: Array.isArray(row.service_charges)
        ? row.service_charges
        : typeof row.service_charges === "string"
        ? JSON.parse(row.service_charges)
        : [],
      isActive: Boolean(row.is_active),
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  public async findMakingCharge(
    jewelleryType: string,
    constructionType: string,
    client?: IDbClient
  ): Promise<IMakingChargeRecord | null> {
    const executor = this.getExecutor(client);
    const sql = `
      SELECT id, jewellery_type, construction_type, base_fee, service_charges, is_active, created_at, updated_at
      FROM making_charges
      WHERE LOWER(jewellery_type) = LOWER($1)
        AND LOWER(construction_type) = LOWER($2)
        AND is_active = TRUE
      LIMIT 1;
    `;
    const result = await executor.query(sql, [jewelleryType.trim(), constructionType.trim()]);
    if (result.rows.length === 0) return null;
    return this.mapRowToMakingCharge(result.rows[0]);
  }

  public async listMakingCharges(client?: IDbClient): Promise<IMakingChargeRecord[]> {
    const executor = this.getExecutor(client);
    const sql = `
      SELECT id, jewellery_type, construction_type, base_fee, service_charges, is_active, created_at, updated_at
      FROM making_charges
      ORDER BY jewellery_type ASC, construction_type ASC;
    `;
    const result = await executor.query(sql);
    return result.rows.map((r) => this.mapRowToMakingCharge(r));
  }

  public async upsertMakingCharge(
    data: IUpsertMakingChargeData,
    client?: IDbClient
  ): Promise<IMakingChargeRecord> {
    const executor = this.getExecutor(client);
    const id = data.id || randomUUID();
    const sql = `
      INSERT INTO making_charges (
        id, jewellery_type, construction_type, base_fee, service_charges, is_active, created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
      ON CONFLICT (jewellery_type, construction_type) DO UPDATE
      SET base_fee = EXCLUDED.base_fee,
          service_charges = EXCLUDED.service_charges,
          is_active = EXCLUDED.is_active,
          updated_at = NOW()
      RETURNING id, jewellery_type, construction_type, base_fee, service_charges, is_active, created_at, updated_at;
    `;
    const params = [
      id,
      (data.jewelleryType ? data.jewelleryType.trim().toLowerCase() : 'bracelet'),
      (data.constructionType ? data.constructionType.trim().toLowerCase() : 'elastic'),
      data.baseFee,
      JSON.stringify(data.serviceCharges || []),
      data.isActive !== undefined ? data.isActive : true,
    ];
    const result = await executor.query(sql, params);
    return this.mapRowToMakingCharge(result.rows[0]);
  }

  // ---------------------------------------------------------------------------
  // 6. Design Rules
  // ---------------------------------------------------------------------------

  public mapRowToDesignRule(row: any): IDesignRuleRecord {
    const idStr = String(row.id);
    return {
      id: idStr,
      _id: idStr,
      jewelleryType: String(row.jewellery_type),
      constructionType: String(row.construction_type),
      minWristMm: Number(row.min_wrist_mm ?? 130),
      maxWristMm: Number(row.max_wrist_mm ?? 230),
      minComponents: Number(row.min_components ?? 12),
      maxComponents: Number(row.max_components ?? 45),
      permittedBeadSizesMm: Array.isArray(row.permitted_bead_sizes_mm)
        ? row.permitted_bead_sizes_mm.map(Number)
        : [4, 6, 8, 10, 12],
      allowedMaterialTypes: Array.isArray(row.allowed_material_types)
        ? row.allowed_material_types
        : ["bead", "stone", "spacer", "charm"],
      maxCharms: Number(row.max_charms ?? 5),
      fitAllowanceMm: Number(row.fit_allowance_mm ?? 10),
      requiresReviewThresholds:
        typeof row.requires_review_thresholds === "string"
          ? JSON.parse(row.requires_review_thresholds)
          : row.requires_review_thresholds || {},
      isActive: Boolean(row.is_active),
      version: Number(row.version ?? 1),
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  public async findDesignRule(
    jewelleryType: string,
    constructionType?: string,
    client?: IDbClient
  ): Promise<IDesignRuleRecord | null> {
    const executor = this.getExecutor(client);
    let sql = `
      SELECT id, jewellery_type, construction_type, min_wrist_mm, max_wrist_mm,
             min_components, max_components, permitted_bead_sizes_mm, allowed_material_types,
             max_charms, fit_allowance_mm, requires_review_thresholds, is_active, version,
             created_at, updated_at
      FROM design_rules
      WHERE LOWER(jewellery_type) = LOWER($1)
        AND is_active = TRUE
    `;
    const params: any[] = [jewelleryType.trim()];
    if (constructionType) {
      sql += ` AND LOWER(construction_type) = LOWER($2)`;
      params.push(constructionType.trim());
    }
    sql += ` LIMIT 1;`;
    const result = await executor.query(sql, params);
    if (result.rows.length === 0) return null;
    return this.mapRowToDesignRule(result.rows[0]);
  }

  public async listDesignRules(client?: IDbClient): Promise<IDesignRuleRecord[]> {
    const executor = this.getExecutor(client);
    const sql = `
      SELECT id, jewellery_type, construction_type, min_wrist_mm, max_wrist_mm,
             min_components, max_components, permitted_bead_sizes_mm, allowed_material_types,
             max_charms, fit_allowance_mm, requires_review_thresholds, is_active, version,
             created_at, updated_at
      FROM design_rules
      ORDER BY jewellery_type ASC, construction_type ASC;
    `;
    const result = await executor.query(sql);
    return result.rows.map((r) => this.mapRowToDesignRule(r));
  }

  public async upsertDesignRule(
    data: IUpsertDesignRuleData,
    client?: IDbClient
  ): Promise<IDesignRuleRecord> {
    const executor = this.getExecutor(client);
    const id = data.id || randomUUID();
    const sql = `
      INSERT INTO design_rules (
        id, jewellery_type, construction_type, min_wrist_mm, max_wrist_mm,
        min_components, max_components, permitted_bead_sizes_mm, allowed_material_types,
        max_charms, fit_allowance_mm, requires_review_thresholds, is_active, version,
        created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW(), NOW())
      ON CONFLICT (jewellery_type, construction_type) DO UPDATE
      SET min_wrist_mm = EXCLUDED.min_wrist_mm,
          max_wrist_mm = EXCLUDED.max_wrist_mm,
          min_components = EXCLUDED.min_components,
          max_components = EXCLUDED.max_components,
          permitted_bead_sizes_mm = EXCLUDED.permitted_bead_sizes_mm,
          allowed_material_types = EXCLUDED.allowed_material_types,
          max_charms = EXCLUDED.max_charms,
          fit_allowance_mm = EXCLUDED.fit_allowance_mm,
          requires_review_thresholds = EXCLUDED.requires_review_thresholds,
          is_active = EXCLUDED.is_active,
          version = EXCLUDED.version,
          updated_at = NOW()
      RETURNING id, jewellery_type, construction_type, min_wrist_mm, max_wrist_mm,
                min_components, max_components, permitted_bead_sizes_mm, allowed_material_types,
                max_charms, fit_allowance_mm, requires_review_thresholds, is_active, version,
                created_at, updated_at;
    `;
    const params = [
      id,
      (data.jewelleryType ? data.jewelleryType.trim().toLowerCase() : 'bracelet'),
      (data.constructionType ? data.constructionType.trim().toLowerCase() : 'elastic'),
      data.minWristMm ?? 130,
      data.maxWristMm ?? 230,
      data.minComponents ?? 12,
      data.maxComponents ?? 45,
      data.permittedBeadSizesMm || [4, 6, 8, 10, 12],
      data.allowedMaterialTypes || ["bead", "stone", "spacer", "charm"],
      data.maxCharms ?? 5,
      data.fitAllowanceMm ?? 10,
      JSON.stringify(data.requiresReviewThresholds || {}),
      data.isActive !== undefined ? data.isActive : true,
      data.version ?? 1,
    ];
    const result = await executor.query(sql, params);
    return this.mapRowToDesignRule(result.rows[0]);
  }

  // ---------------------------------------------------------------------------
  // 7. Design Templates
  // ---------------------------------------------------------------------------

  public mapRowToDesignTemplate(row: any): IDesignTemplateRecord {
    const idStr = String(row.id);
    return {
      id: idStr,
      _id: idStr,
      slug: String(row.slug),
      name: String(row.name),
      description: row.description ? String(row.description) : null,
      thumbnailUrl: row.thumbnail_url ? String(row.thumbnail_url) : null,
      jewelleryType: String(row.jewellery_type),
      constructionType: String(row.construction_type),
      wristMm: Number(row.wrist_mm ?? 160),
      beadSequence: Array.isArray(row.bead_sequence)
        ? row.bead_sequence
        : typeof row.bead_sequence === "string"
        ? JSON.parse(row.bead_sequence)
        : [],
      charms: Array.isArray(row.charms)
        ? row.charms
        : typeof row.charms === "string"
        ? JSON.parse(row.charms)
        : [],
      isPublished: Boolean(row.is_published),
      sortOrder: Number(row.sort_order ?? 0),
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  public async findTemplates(
    options?: { jewelleryType?: string; isPublished?: boolean; limit?: number; offset?: number },
    client?: IDbClient
  ): Promise<IDesignTemplateRecord[]> {
    const executor = this.getExecutor(client);
    const conditions: string[] = [];
    const params: any[] = [];
    let pIdx = 1;

    if (options?.jewelleryType) {
      conditions.push(`LOWER(jewellery_type) = LOWER($${pIdx++})`);
      params.push(options.jewelleryType.trim());
    }
    if (options?.isPublished !== undefined) {
      conditions.push(`is_published = $${pIdx++}`);
      params.push(options.isPublished);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    let sql = `
      SELECT id, slug, name, description, thumbnail_url, jewellery_type, construction_type,
             wrist_mm, bead_sequence, charms, is_published, sort_order, created_at, updated_at
      FROM design_templates
      ${whereClause}
      ORDER BY sort_order ASC, name ASC
    `;
    if (options?.limit) {
      sql += ` LIMIT $${pIdx++}`;
      params.push(options.limit);
    }
    if (options?.offset) {
      sql += ` OFFSET $${pIdx++}`;
      params.push(options.offset);
    }

    const result = await executor.query(sql, params);
    return result.rows.map((r) => this.mapRowToDesignTemplate(r));
  }

  public async findTemplateBySlug(slug: string, client?: IDbClient): Promise<IDesignTemplateRecord | null> {
    if (!slug) return null;
    const executor = this.getExecutor(client);
    const sql = `
      SELECT id, slug, name, description, thumbnail_url, jewellery_type, construction_type,
             wrist_mm, bead_sequence, charms, is_published, sort_order, created_at, updated_at
      FROM design_templates
      WHERE LOWER(slug) = LOWER($1)
      LIMIT 1;
    `;
    const result = await executor.query(sql, [slug.trim()]);
    if (result.rows.length === 0) return null;
    return this.mapRowToDesignTemplate(result.rows[0]);
  }

  public async countTemplates(
    jewelleryType: string,
    isPublished?: boolean,
    client?: IDbClient
  ): Promise<number> {
    const executor = this.getExecutor(client);
    const conditions: string[] = [`LOWER(jewellery_type) = LOWER($1)`];
    const params: any[] = [jewelleryType.trim()];
    if (isPublished !== undefined) {
      conditions.push(`is_published = $2`);
      params.push(isPublished);
    }
    const sql = `SELECT COUNT(*)::integer AS count FROM design_templates WHERE ${conditions.join(" AND ")};`;
    const result = await executor.query<{ count: number }>(sql, params);
    return result.rows[0]?.count ?? 0;
  }

  public async createTemplate(
    data: ICreateDesignTemplateData,
    client?: IDbClient
  ): Promise<IDesignTemplateRecord> {
    const executor = this.getExecutor(client);
    const id = data.id || randomUUID();
    const slug = data.slug.trim().toLowerCase();
    const sql = `
      INSERT INTO design_templates (
        id, slug, name, description, thumbnail_url, jewellery_type, construction_type,
        wrist_mm, bead_sequence, charms, is_published, sort_order, created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), NOW())
      RETURNING id, slug, name, description, thumbnail_url, jewellery_type, construction_type,
                wrist_mm, bead_sequence, charms, is_published, sort_order, created_at, updated_at;
    `;
    const params = [
      id,
      slug,
      data.name.trim(),
      data.description || null,
      data.thumbnailUrl || null,
      (data.jewelleryType ? data.jewelleryType.trim().toLowerCase() : 'bracelet'),
      (data.constructionType ? data.constructionType.trim().toLowerCase() : 'elastic'),
      data.wristMm ?? 160,
      JSON.stringify(data.beadSequence || []),
      JSON.stringify(data.charms || []),
      data.isPublished !== undefined ? data.isPublished : false,
      data.sortOrder ?? 0,
    ];
    const result = await executor.query(sql, params);
    return this.mapRowToDesignTemplate(result.rows[0]);
  }

  public async updateTemplate(
    slug: string,
    data: IUpdateDesignTemplateData,
    client?: IDbClient
  ): Promise<IDesignTemplateRecord | null> {
    const executor = this.getExecutor(client);
    const setClauses: string[] = [];
    const params: any[] = [];
    let pIdx = 1;

    if (data.name !== undefined) {
      setClauses.push(`name = $${pIdx++}`);
      params.push(data.name.trim());
    }
    if (data.description !== undefined) {
      setClauses.push(`description = $${pIdx++}`);
      params.push(data.description);
    }
    if (data.thumbnailUrl !== undefined) {
      setClauses.push(`thumbnail_url = $${pIdx++}`);
      params.push(data.thumbnailUrl);
    }
    if (data.jewelleryType !== undefined) {
      setClauses.push(`jewellery_type = $${pIdx++}`);
      params.push(data.jewelleryType.trim().toLowerCase());
    }
    if (data.constructionType !== undefined) {
      setClauses.push(`construction_type = $${pIdx++}`);
      params.push(data.constructionType.trim().toLowerCase());
    }
    if (data.wristMm !== undefined) {
      setClauses.push(`wrist_mm = $${pIdx++}`);
      params.push(data.wristMm);
    }
    if (data.beadSequence !== undefined) {
      setClauses.push(`bead_sequence = $${pIdx++}`);
      params.push(JSON.stringify(data.beadSequence));
    }
    if (data.charms !== undefined) {
      setClauses.push(`charms = $${pIdx++}`);
      params.push(JSON.stringify(data.charms));
    }
    if (data.isPublished !== undefined) {
      setClauses.push(`is_published = $${pIdx++}`);
      params.push(data.isPublished);
    }
    if (data.sortOrder !== undefined) {
      setClauses.push(`sort_order = $${pIdx++}`);
      params.push(data.sortOrder);
    }

    if (setClauses.length === 0) {
      return this.findTemplateBySlug(slug, client);
    }

    setClauses.push(`updated_at = NOW()`);
    params.push(slug.trim().toLowerCase());

    const sql = `
      UPDATE design_templates
      SET ${setClauses.join(", ")}
      WHERE LOWER(slug) = $${pIdx}
      RETURNING id, slug, name, description, thumbnail_url, jewellery_type, construction_type,
                wrist_mm, bead_sequence, charms, is_published, sort_order, created_at, updated_at;
    `;
    const result = await executor.query(sql, params);
    if (result.rows.length === 0) return null;
    return this.mapRowToDesignTemplate(result.rows[0]);
  }

  public async deleteTemplate(slug: string, client?: IDbClient): Promise<boolean> {
    const executor = this.getExecutor(client);
    const sql = `DELETE FROM design_templates WHERE LOWER(slug) = LOWER($1);`;
    const result = await executor.query(sql, [slug.trim()]);
    return result.rowCount > 0;
  }

  // ---------------------------------------------------------------------------
  // 8. Saved Designs
  // ---------------------------------------------------------------------------

  public mapRowToSavedDesign(row: any): ISavedDesignRecord {
    const idStr = String(row.id);
    return {
      id: idStr,
      _id: idStr,
      userId: String(row.user_id),
      name: String(row.name),
      jewelleryType: String(row.jewellery_type),
      constructionType: String(row.construction_type),
      wristMm: Number(row.wrist_mm ?? 160),
      dimensionLabel: row.dimension_label ? String(row.dimension_label) : null,
      beadSequence: Array.isArray(row.bead_sequence)
        ? row.bead_sequence
        : typeof row.bead_sequence === "string"
        ? JSON.parse(row.bead_sequence)
        : [],
      charms: Array.isArray(row.charms)
        ? row.charms
        : typeof row.charms === "string"
        ? JSON.parse(row.charms)
        : [],
      estimatedTotal: Number(row.estimated_total ?? 0),
      lastValidatedAt: new Date(row.last_validated_at),
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  public async findSavedDesignsByUserId(userId: string, client?: IDbClient): Promise<ISavedDesignRecord[]> {
    assertValidEntityId(userId, "userId");
    const executor = this.getExecutor(client);
    const sql = `
      SELECT id, user_id, name, jewellery_type, construction_type, wrist_mm,
             dimension_label, bead_sequence, charms, estimated_total,
             last_validated_at, created_at, updated_at
      FROM saved_designs
      WHERE user_id = $1
      ORDER BY created_at DESC;
    `;
    const result = await executor.query(sql, [userId]);
    return result.rows.map((r) => this.mapRowToSavedDesign(r));
  }

  public async findSavedDesignById(id: string, client?: IDbClient): Promise<ISavedDesignRecord | null> {
    assertValidEntityId(id, "savedDesignId");
    const executor = this.getExecutor(client);
    const sql = `
      SELECT id, user_id, name, jewellery_type, construction_type, wrist_mm,
             dimension_label, bead_sequence, charms, estimated_total,
             last_validated_at, created_at, updated_at
      FROM saved_designs
      WHERE id = $1
      LIMIT 1;
    `;
    const result = await executor.query(sql, [id]);
    if (result.rows.length === 0) return null;
    return this.mapRowToSavedDesign(result.rows[0]);
  }

  public async createSavedDesign(
    data: ICreateSavedDesignData,
    client?: IDbClient
  ): Promise<ISavedDesignRecord> {
    assertValidEntityId(data.userId, "userId");
    const executor = this.getExecutor(client);
    const id = data.id || randomUUID();
    const sql = `
      INSERT INTO saved_designs (
        id, user_id, name, jewellery_type, construction_type, wrist_mm,
        dimension_label, bead_sequence, charms, estimated_total,
        last_validated_at, created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW(), NOW())
      RETURNING id, user_id, name, jewellery_type, construction_type, wrist_mm,
                dimension_label, bead_sequence, charms, estimated_total,
                last_validated_at, created_at, updated_at;
    `;
    const params = [
      id,
      data.userId,
      data.name.trim(),
      data.jewelleryType ? data.jewelleryType.trim().toLowerCase() : "bracelet",
      data.constructionType ? data.constructionType.trim().toLowerCase() : "elastic_bead",
      data.wristMm ?? 160,
      data.dimensionLabel || null,
      JSON.stringify(data.beadSequence || []),
      JSON.stringify(data.charms || []),
      data.estimatedTotal ?? 0,
    ];
    const result = await executor.query(sql, params);
    return this.mapRowToSavedDesign(result.rows[0]);
  }

  public async updateSavedDesign(
    id: string,
    data: IUpdateSavedDesignData,
    client?: IDbClient
  ): Promise<ISavedDesignRecord | null> {
    assertValidEntityId(id, "savedDesignId");
    const executor = this.getExecutor(client);
    const setClauses: string[] = [];
    const params: any[] = [];
    let pIdx = 1;

    if (data.name !== undefined) {
      setClauses.push(`name = $${pIdx++}`);
      params.push(data.name.trim());
    }
    if (data.jewelleryType !== undefined) {
      setClauses.push(`jewellery_type = $${pIdx++}`);
      params.push(data.jewelleryType.trim().toLowerCase());
    }
    if (data.constructionType !== undefined) {
      setClauses.push(`construction_type = $${pIdx++}`);
      params.push(data.constructionType.trim().toLowerCase());
    }
    if (data.wristMm !== undefined) {
      setClauses.push(`wrist_mm = $${pIdx++}`);
      params.push(data.wristMm);
    }
    if (data.dimensionLabel !== undefined) {
      setClauses.push(`dimension_label = $${pIdx++}`);
      params.push(data.dimensionLabel);
    }
    if (data.beadSequence !== undefined) {
      setClauses.push(`bead_sequence = $${pIdx++}`);
      params.push(JSON.stringify(data.beadSequence));
    }
    if (data.charms !== undefined) {
      setClauses.push(`charms = $${pIdx++}`);
      params.push(JSON.stringify(data.charms));
    }
    if (data.estimatedTotal !== undefined) {
      setClauses.push(`estimated_total = $${pIdx++}`);
      params.push(data.estimatedTotal);
    }

    if (setClauses.length === 0) {
      return this.findSavedDesignById(id, client);
    }

    setClauses.push(`last_validated_at = NOW()`);
    setClauses.push(`updated_at = NOW()`);
    params.push(id);

    const sql = `
      UPDATE saved_designs
      SET ${setClauses.join(", ")}
      WHERE id = $${pIdx}
      RETURNING id, user_id, name, jewellery_type, construction_type, wrist_mm,
                dimension_label, bead_sequence, charms, estimated_total,
                last_validated_at, created_at, updated_at;
    `;
    const result = await executor.query(sql, params);
    if (result.rows.length === 0) return null;
    return this.mapRowToSavedDesign(result.rows[0]);
  }

  public async deleteSavedDesign(id: string, client?: IDbClient): Promise<boolean> {
    assertValidEntityId(id, "savedDesignId");
    const executor = this.getExecutor(client);
    const sql = `DELETE FROM saved_designs WHERE id = $1;`;
    const result = await executor.query(sql, [id]);
    return result.rowCount > 0;
  }
}
