import { PostgresDatabase } from "../db/postgres.js";
import { IStudioDesignRule } from "../types/studio.types.js";

const inMemoryRules: IStudioDesignRule[] = [
  {
    id: "srule-elastic-bead",
    name: "Standard Elastic Bracelet Rule",
    description: "Default construction rules for elastic stretch bracelets.",
    categoryId: "scat-sub-beaded-bracelet",
    constructionMethodId: "smeth-elastic-thread",
    minWristMm: 130,
    maxWristMm: 230,
    minComponents: 12,
    maxComponents: 45,
    maxCharms: 5,
    fitAllowanceMm: 10,
    permittedBeadSizesMm: [4, 6, 8, 10, 12],
    allowedMaterialTypes: ["bead", "stone", "spacer", "charm"],
    endpointAssemblyRules: {},
    isPublished: true,
    isActive: true,
    version: 1,
  },
  {
    id: "srule-memory-wire",
    name: "Memory Wire Construction Rule",
    description: "Rules for tempered wire bracelets with independent endpoint loops.",
    categoryId: "scat-sub-memory-wire",
    constructionMethodId: "smeth-memory-wire",
    minWristMm: null,
    maxWristMm: null,
    minComponents: 10,
    maxComponents: 60,
    maxCharms: 4,
    fitAllowanceMm: null,
    permittedBeadSizesMm: [4, 6, 8],
    allowedMaterialTypes: ["bead", "stone", "spacer", "charm", "clasp", "jump_ring"],
    endpointAssemblyRules: {},
    isPublished: true,
    isActive: true,
    version: 1,
  },
  {
    id: "srule-clasp-extension",
    name: "Clasp & Extension Bracelet Rule",
    description: "Rules for fixed-length beaded strand with 50mm extension chain.",
    categoryId: "scat-sub-clasp-extension",
    constructionMethodId: "smeth-clasp-extension",
    minWristMm: 140,
    maxWristMm: 200,
    minComponents: 14,
    maxComponents: 40,
    maxCharms: 6,
    fitAllowanceMm: 5,
    permittedBeadSizesMm: [4, 6, 8, 10],
    allowedMaterialTypes: ["bead", "stone", "spacer", "charm", "clasp", "jump_ring", "extension_chain"],
    endpointAssemblyRules: {},
    isPublished: true,
    isActive: true,
    version: 1,
  },
];

export class PostgresStudioDesignRuleRepository {
  private hasTableChecked = false;
  private hasTable = false;

  private async checkTableExists(): Promise<boolean> {
    if (this.hasTableChecked) return this.hasTable;
    try {
      const res = await PostgresDatabase.query(
        "SELECT 1 FROM information_schema.tables WHERE table_name = 'studio_design_rules' LIMIT 1;"
      );
      this.hasTable = (res.rows.length > 0);
      this.hasTableChecked = true;
      return this.hasTable;
    } catch {
      this.hasTable = false;
      this.hasTableChecked = true;
      return false;
    }
  }

  async findAll(filter?: {
    categoryId?: string;
    constructionMethodId?: string;
    onlyPublished?: boolean;
    onlyActive?: boolean;
  }): Promise<IStudioDesignRule[]> {
    if (await this.checkTableExists()) {
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

    return inMemoryRules.filter((r) => {
      if (filter?.categoryId && r.categoryId !== filter.categoryId) return false;
      if (filter?.constructionMethodId && r.constructionMethodId !== filter.constructionMethodId) return false;
      if (filter?.onlyPublished && !r.isPublished) return false;
      if (filter?.onlyActive && !r.isActive) return false;
      return true;
    });
  }

  async findById(id: string): Promise<IStudioDesignRule | null> {
    if (await this.checkTableExists()) {
      const res = await PostgresDatabase.query(
        "SELECT * FROM studio_design_rules WHERE id = $1 LIMIT 1;",
        [id]
      );
      if (res.rows.length === 0) return null;
      return this.mapRowToRule(res.rows[0]);
    }
    const found = inMemoryRules.find((r) => r.id === id);
    return found ? { ...found } : null;
  }

  async create(data: Partial<IStudioDesignRule>): Promise<IStudioDesignRule> {
    if (!data.name) {
      throw new Error("Rule name is required");
    }

    if (await this.checkTableExists()) {
      const res = await PostgresDatabase.query(
        `INSERT INTO studio_design_rules
         (name, description, category_id, construction_method_id, min_wrist_mm, max_wrist_mm, min_components, max_components, max_charms, charm_count_mode, fit_allowance_mm, permitted_bead_sizes_mm, allowed_material_types, endpoint_assembly_rules, is_published, is_active, version, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, 1, NOW(), NOW())
         RETURNING *;`,
        [
          data.name,
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

    const newRule: IStudioDesignRule = {
      id: data.id || `srule-${Date.now().toString(36)}`,
      name: data.name,
      description: data.description || null,
      categoryId: data.categoryId || null,
      constructionMethodId: data.constructionMethodId || null,
      minWristMm: data.minWristMm ?? null,
      maxWristMm: data.maxWristMm ?? null,
      minComponents: data.minComponents ?? null,
      maxComponents: data.maxComponents ?? null,
      maxCharms: data.maxCharms ?? null,
      charmCountMode: data.charmCountMode || 'total_units',
      fitAllowanceMm: data.fitAllowanceMm ?? null,
      permittedBeadSizesMm: data.permittedBeadSizesMm || null,
      allowedMaterialTypes: data.allowedMaterialTypes || null,
      endpointAssemblyRules: data.endpointAssemblyRules || {},
      isPublished: data.isPublished ?? false,
      isActive: data.isActive ?? true,
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    inMemoryRules.push(newRule);
    return { ...newRule };
  }

  async update(id: string, data: Partial<IStudioDesignRule>): Promise<IStudioDesignRule> {
    const existing = await this.findById(id);
    if (!existing) {
      throw new Error("Studio design rule not found");
    }

    if (await this.checkTableExists()) {
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
          data.name ?? null,
          data.description ?? null,
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
          data.isPublished ?? null,
          data.isActive ?? null,
          id,
        ]
      );
      return this.mapRowToRule(res.rows[0]);
    }

    const idx = inMemoryRules.findIndex((r) => r.id === id);
    if (idx !== -1) {
      inMemoryRules[idx] = {
        ...inMemoryRules[idx],
        ...data,
        version: inMemoryRules[idx].version + 1,
        updatedAt: new Date().toISOString(),
      };
      return { ...inMemoryRules[idx] };
    }
    return existing;
  }

  async duplicate(id: string, newName?: string): Promise<IStudioDesignRule> {
    const source = await this.findById(id);
    if (!source) {
      throw new Error("Source rule not found");
    }

    const duplicateData: Partial<IStudioDesignRule> = {
      ...source,
      id: undefined,
      name: newName || `${source.name} (Copy)`,
      isPublished: false,
      version: 1,
    };
    return this.create(duplicateData);
  }

  async delete(id: string): Promise<boolean> {
    if (await this.checkTableExists()) {
      await PostgresDatabase.query("DELETE FROM studio_design_rules WHERE id = $1;", [id]);
      return true;
    }
    const idx = inMemoryRules.findIndex((r) => r.id === id);
    if (idx !== -1) {
      inMemoryRules.splice(idx, 1);
      return true;
    }
    return false;
  }

  private mapRowToRule(row: any): IStudioDesignRule {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      categoryId: row.category_id,
      constructionMethodId: row.construction_method_id,
      minWristMm: row.min_wrist_mm ? Number(row.min_wrist_mm) : null,
      maxWristMm: row.max_wrist_mm ? Number(row.max_wrist_mm) : null,
      minComponents: row.min_components ? Number(row.min_components) : null,
      maxComponents: row.max_components ? Number(row.max_components) : null,
      maxCharms: row.max_charms ? Number(row.max_charms) : null,
      charmCountMode: row.charm_count_mode || 'total_units',
      fitAllowanceMm: row.fit_allowance_mm ? Number(row.fit_allowance_mm) : null,
      permittedBeadSizesMm: row.permitted_bead_sizes_mm ? row.permitted_bead_sizes_mm.map(Number) : null,
      allowedMaterialTypes: row.allowed_material_types || null,
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
