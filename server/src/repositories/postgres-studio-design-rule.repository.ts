import { PostgresDatabase } from "../db/postgres.js";
import { IStudioDesignRule } from "../types/studio.types.js";

export class PostgresStudioDesignRuleRepository {
  async findAll(filter?: {
    categoryId?: string;
    constructionMethodId?: string;
    onlyPublished?: boolean;
    onlyActive?: boolean;
  }): Promise<IStudioDesignRule[]> {
    let query = "SELECT * FROM studio_design_rules WHERE 1=1";
    const params: any[] = [];
    if (filter?.categoryId) {
      params.push(filter.categoryId);
      query += ` AND category_id = $${params.length}`;
    }
    if (filter?.constructionMethodId) {
      params.push(filter.constructionMethodId);
      query += ` AND construction_method_id = $${params.length}`;
    }
    if (filter?.onlyPublished) {
      params.push(true);
      query += ` AND is_published = $${params.length}`;
    }
    if (filter?.onlyActive) {
      params.push(true);
      query += ` AND is_active = $${params.length}`;
    }
    query += " ORDER BY name ASC;";
    const res = await PostgresDatabase.query(query, params);
    return res.rows.map(this.mapRowToRule);
  }

  async findById(id: string): Promise<IStudioDesignRule | null> {
    const res = await PostgresDatabase.query(
      "SELECT * FROM studio_design_rules WHERE id = $1 LIMIT 1;",
      [id]
    );
    if (res.rows.length === 0) return null;
    return this.mapRowToRule(res.rows[0]);
  }

  async create(data: Partial<IStudioDesignRule>): Promise<IStudioDesignRule> {
    if (!data.name) {
      throw new Error("Rule name is required");
    }

    const res = await PostgresDatabase.query(
      `INSERT INTO studio_design_rules
       (name, description, category_id, construction_method_id, min_wrist_mm, max_wrist_mm, min_components, max_components, max_charms, charm_count_mode, fit_allowance_mm, permitted_bead_sizes_mm, allowed_material_types, endpoint_assembly_rules, is_published, is_active, version, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, 1, NOW(), NOW())
       RETURNING *;`,
      [
        data.name.trim(),
        data.description || null,
        data.categoryId || null,
        data.constructionMethodId || null,
        data.minWristMm ?? null,
        data.maxWristMm ?? null,
        data.minComponents ?? null,
        data.maxComponents ?? null,
        data.maxCharms ?? null,
        data.charmCountMode || 'total_units',
        data.fitAllowanceMm ?? null,
        data.permittedBeadSizesMm || null,
        data.allowedMaterialTypes || null,
        JSON.stringify(data.endpointAssemblyRules || {}),
        data.isPublished ?? false,
        data.isActive ?? true,
      ]
    );
    return this.mapRowToRule(res.rows[0]);
  }

  async update(id: string, data: Partial<IStudioDesignRule>): Promise<IStudioDesignRule> {
    const existing = await this.findById(id);
    if (!existing) {
      throw new Error("Studio design rule not found");
    }

    const res = await PostgresDatabase.query(
      `UPDATE studio_design_rules
       SET name = COALESCE($1, name),
           description = COALESCE($2, description),
           category_id = $3,
           construction_method_id = $4,
           min_wrist_mm = $5,
           max_wrist_mm = $6,
           min_components = $7,
           max_components = $8,
           max_charms = $9,
           charm_count_mode = COALESCE($10, charm_count_mode),
           fit_allowance_mm = $11,
           permitted_bead_sizes_mm = $12,
           allowed_material_types = $13,
           endpoint_assembly_rules = COALESCE($14, endpoint_assembly_rules),
           is_published = COALESCE($15, is_published),
           is_active = COALESCE($16, is_active),
           version = version + 1,
           updated_at = NOW()
       WHERE id = $17
       RETURNING *;`,
      [
        data.name !== undefined ? data.name.trim() : null,
        data.description !== undefined ? data.description : null,
        data.categoryId !== undefined ? data.categoryId : existing.categoryId,
        data.constructionMethodId !== undefined ? data.constructionMethodId : existing.constructionMethodId,
        data.minWristMm !== undefined ? data.minWristMm : existing.minWristMm,
        data.maxWristMm !== undefined ? data.maxWristMm : existing.maxWristMm,
        data.minComponents !== undefined ? data.minComponents : existing.minComponents,
        data.maxComponents !== undefined ? data.maxComponents : existing.maxComponents,
        data.maxCharms !== undefined ? data.maxCharms : existing.maxCharms,
        data.charmCountMode || null,
        data.fitAllowanceMm !== undefined ? data.fitAllowanceMm : existing.fitAllowanceMm,
        data.permittedBeadSizesMm !== undefined ? data.permittedBeadSizesMm : existing.permittedBeadSizesMm,
        data.allowedMaterialTypes !== undefined ? data.allowedMaterialTypes : existing.allowedMaterialTypes,
        data.endpointAssemblyRules ? JSON.stringify(data.endpointAssemblyRules) : null,
        data.isPublished !== undefined ? data.isPublished : null,
        data.isActive !== undefined ? data.isActive : null,
        id,
      ]
    );
    return this.mapRowToRule(res.rows[0]);
  }

  async duplicate(id: string, newName?: string): Promise<IStudioDesignRule> {
    const existing = await this.findById(id);
    if (!existing) {
      throw new Error("Rule not found to duplicate");
    }

    const copyData: Partial<IStudioDesignRule> = {
      ...existing,
      id: undefined,
      name: newName || `${existing.name} (Copy)`,
      isPublished: false,
      version: 1,
    };
    return this.create(copyData);
  }

  async delete(id: string): Promise<boolean> {
    const res = await PostgresDatabase.query("DELETE FROM studio_design_rules WHERE id = $1 RETURNING id;", [id]);
    return res.rows.length > 0;
  }

  private mapRowToRule(row: any): IStudioDesignRule {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      categoryId: row.category_id,
      constructionMethodId: row.construction_method_id,
      minWristMm: row.min_wrist_mm ? parseFloat(row.min_wrist_mm) : null,
      maxWristMm: row.max_wrist_mm ? parseFloat(row.max_wrist_mm) : null,
      minComponents: row.min_components ? parseInt(row.min_components, 10) : null,
      maxComponents: row.max_components ? parseInt(row.max_components, 10) : null,
      maxCharms: row.max_charms ? parseInt(row.max_charms, 10) : null,
      charmCountMode: row.charm_count_mode || 'total_units',
      fitAllowanceMm: row.fit_allowance_mm ? parseFloat(row.fit_allowance_mm) : null,
      permittedBeadSizesMm: row.permitted_bead_sizes_mm || [],
      allowedMaterialTypes: row.allowed_material_types || [],
      endpointAssemblyRules: typeof row.endpoint_assembly_rules === "string" ? JSON.parse(row.endpoint_assembly_rules) : (row.endpoint_assembly_rules || {}),
      isPublished: row.is_published,
      isActive: row.is_active,
      version: row.version || 1,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

export const postgresStudioDesignRuleRepository = new PostgresStudioDesignRuleRepository();
