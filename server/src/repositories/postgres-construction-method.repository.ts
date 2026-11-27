import { PostgresDatabase } from "../db/postgres.js";
import { IStudioConstructionMethod, IStudioSubcategoryMethod } from "../types/studio.types.js";

// In-memory fallback for isolated testing & fallback execution
const inMemoryMethods: IStudioConstructionMethod[] = [
  {
    id: "smeth-elastic-thread",
    name: "Elastic Thread",
    slug: "elastic-thread",
    description: "Durable silicone elastic cord allowing flexible stretch fit.",
    baseMaterialType: "elastic_cord",
    physicalSpecsConfig: { cordDiameterMm: 0.8 },
    endpointAConfig: {
      visible: false,
      hasAssembly: false,
      isCustomerSelectable: false,
      isSelectionRequired: false,
      allowedRoles: [],
    },
    endpointBConfig: {
      visible: false,
      hasAssembly: false,
      isCustomerSelectable: false,
      isSelectionRequired: false,
      allowedRoles: [],
    },
    allowedComponentRoles: ["bead", "stone", "spacer", "charm"],
    isPublished: true,
    isActive: true,
    displayOrder: 1,
  },
  {
    id: "smeth-memory-wire",
    name: "Memory Wire",
    slug: "memory-wire",
    description: "Resilient tempered stainless steel wire holding circular shape with two independent endpoints.",
    baseMaterialType: "memory_wire",
    physicalSpecsConfig: {
      turnsCount: 1,
      innerDiameterMm: 55,
      endLoopAllowanceMm: 6,
      sizeOptions: [
        { name: "Small", innerDiameterMm: 50, isPublished: true },
        { name: "Medium", innerDiameterMm: 55, isPublished: true },
        { name: "Large", innerDiameterMm: 60, isPublished: true },
      ],
    },
    endpointAConfig: {
      visible: true,
      hasAssembly: true,
      isCustomerSelectable: true,
      isSelectionRequired: false,
      label: "End A Assembly",
      allowedRoles: ["finished_loop", "jump_ring", "lobster_clasp", "charm"],
    },
    endpointBConfig: {
      visible: true,
      hasAssembly: true,
      isCustomerSelectable: true,
      isSelectionRequired: false,
      label: "End B Assembly",
      allowedRoles: ["finished_loop", "jump_ring", "extension_chain", "end_charm"],
    },
    allowedComponentRoles: ["bead", "stone", "spacer", "charm", "clasp", "jump_ring", "extension_chain"],
    isPublished: true,
    isActive: true,
    displayOrder: 2,
  },
  {
    id: "smeth-clasp-extension",
    name: "Clasp & Extension Chain",
    slug: "clasp-extension",
    description: "Traditional jeweller assembly featuring jump rings, lobster clasp, and an adjustable extension drape.",
    baseMaterialType: "clasp_extension",
    physicalSpecsConfig: { chainLengthMm: 50 },
    endpointAConfig: {
      visible: true,
      hasAssembly: true,
      isCustomerSelectable: false,
      isSelectionRequired: false,
      label: "Left Endpoint",
      allowedRoles: ["jump_ring", "lobster_clasp"],
    },
    endpointBConfig: {
      visible: true,
      hasAssembly: true,
      isCustomerSelectable: true,
      isSelectionRequired: false,
      label: "Right Endpoint",
      allowedRoles: ["jump_ring", "extension_chain", "end_charm"],
    },
    allowedComponentRoles: ["bead", "stone", "spacer", "charm", "clasp", "jump_ring", "extension_chain"],
    isPublished: true,
    isActive: true,
    displayOrder: 3,
  },
];

const inMemoryMappings: IStudioSubcategoryMethod[] = [
  { id: "map-1", subcategoryId: "scat-sub-beaded-bracelet", constructionMethodId: "smeth-elastic-thread", isPublished: true, displayOrder: 1 },
  { id: "map-2", subcategoryId: "scat-sub-beaded-bracelet", constructionMethodId: "smeth-memory-wire", isPublished: true, displayOrder: 2 },
  { id: "map-3", subcategoryId: "scat-sub-beaded-bracelet", constructionMethodId: "smeth-clasp-extension", isPublished: true, displayOrder: 3 },
  { id: "map-4", subcategoryId: "scat-sub-memory-wire", constructionMethodId: "smeth-memory-wire", isPublished: true, displayOrder: 1 },
  { id: "map-5", subcategoryId: "scat-sub-clasp-extension", constructionMethodId: "smeth-clasp-extension", isPublished: true, displayOrder: 1 },
];

export class PostgresConstructionMethodRepository {
  private hasTableChecked = false;
  private hasTable = false;

  private async checkTableExists(): Promise<boolean> {
    if (this.hasTableChecked) return this.hasTable;
    try {
      const res = await PostgresDatabase.query(
        "SELECT 1 FROM information_schema.tables WHERE table_name = 'studio_construction_methods' LIMIT 1;"
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

  async findAll(options?: { onlyPublished?: boolean; onlyActive?: boolean }): Promise<IStudioConstructionMethod[]> {
    if (await this.checkTableExists()) {
      let query = "SELECT * FROM studio_construction_methods WHERE 1=1";
      const params: any[] = [];
      if (options?.onlyActive) {
        params.push(true);
        query += ` AND is_active = $${params.length}`;
      }
      if (options?.onlyPublished) {
        params.push(true);
        query += ` AND is_published = $${params.length}`;
      }
      query += " ORDER BY display_order ASC, name ASC;";
      const res = await PostgresDatabase.query(query, params);
      return res.rows.map(this.mapRowToMethod);
    }

    return inMemoryMethods.filter((m) => {
      if (options?.onlyActive && !m.isActive) return false;
      if (options?.onlyPublished && !m.isPublished) return false;
      return true;
    });
  }

  async findById(id: string): Promise<IStudioConstructionMethod | null> {
    if (await this.checkTableExists()) {
      const res = await PostgresDatabase.query(
        "SELECT * FROM studio_construction_methods WHERE id = $1 LIMIT 1;",
        [id]
      );
      if (res.rows.length === 0) return null;
      return this.mapRowToMethod(res.rows[0]);
    }
    const found = inMemoryMethods.find((m) => m.id === id);
    return found ? { ...found } : null;
  }

  async findBySlug(slug: string): Promise<IStudioConstructionMethod | null> {
    if (await this.checkTableExists()) {
      const res = await PostgresDatabase.query(
        "SELECT * FROM studio_construction_methods WHERE slug = $1 LIMIT 1;",
        [slug]
      );
      if (res.rows.length === 0) return null;
      return this.mapRowToMethod(res.rows[0]);
    }
    const found = inMemoryMethods.find((m) => m.slug === slug);
    return found ? { ...found } : null;
  }

  async findBySubcategory(subcategoryId: string, onlyPublished = true): Promise<IStudioConstructionMethod[]> {
    if (await this.checkTableExists()) {
      let query = `
        SELECT m.* 
        FROM studio_construction_methods m
        INNER JOIN studio_subcategory_methods sm ON sm.construction_method_id = m.id
        WHERE sm.subcategory_id = $1
      `;
      const params: any[] = [subcategoryId];
      if (onlyPublished) {
        query += " AND m.is_published = true AND sm.is_published = true AND m.is_active = true";
      }
      query += " ORDER BY sm.display_order ASC, m.name ASC;";
      const res = await PostgresDatabase.query(query, params);
      return res.rows.map(this.mapRowToMethod);
    }

    const mapping = inMemoryMappings.filter((map) => {
      if (map.subcategoryId !== subcategoryId) return false;
      if (onlyPublished && !map.isPublished) return false;
      return true;
    });

    return mapping
      .map((map) => inMemoryMethods.find((m) => m.id === map.constructionMethodId))
      .filter((m): m is IStudioConstructionMethod => {
        if (!m) return false;
        if (onlyPublished && (!m.isPublished || !m.isActive)) return false;
        return true;
      });
  }

  async create(data: Partial<IStudioConstructionMethod>): Promise<IStudioConstructionMethod> {
    if (!data.name || !data.slug) {
      throw new Error("Method name and slug are required");
    }

    const existing = await this.findBySlug(data.slug);
    if (existing) {
      throw new Error(`Construction method slug '${data.slug}' already exists`);
    }

    if (await this.checkTableExists()) {
      const res = await PostgresDatabase.query(
        `INSERT INTO studio_construction_methods 
         (name, slug, description, image_url, base_material_type, physical_specs_config, endpoint_a_config, endpoint_b_config, allowed_component_roles, is_published, is_active, display_order, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), NOW())
         RETURNING *;`,
        [
          data.name,
          data.slug,
          data.description || null,
          data.imageUrl || null,
          data.baseMaterialType || "wire",
          JSON.stringify(data.physicalSpecsConfig || {}),
          JSON.stringify(data.endpointAConfig || { visible: false, hasAssembly: false }),
          JSON.stringify(data.endpointBConfig || { visible: false, hasAssembly: false }),
          data.allowedComponentRoles || ["bead", "charm"],
          data.isPublished ?? false,
          data.isActive ?? true,
          data.displayOrder || 0,
        ]
      );
      return this.mapRowToMethod(res.rows[0]);
    }

    const newMethod: IStudioConstructionMethod = {
      id: data.id || `smeth-${Date.now().toString(36)}`,
      name: data.name,
      slug: data.slug,
      description: data.description || null,
      imageUrl: data.imageUrl || null,
      baseMaterialType: data.baseMaterialType || "wire",
      physicalSpecsConfig: data.physicalSpecsConfig || {},
      endpointAConfig: data.endpointAConfig || { visible: false, hasAssembly: false, isCustomerSelectable: false, isSelectionRequired: false, allowedRoles: [] },
      endpointBConfig: data.endpointBConfig || { visible: false, hasAssembly: false, isCustomerSelectable: false, isSelectionRequired: false, allowedRoles: [] },
      allowedComponentRoles: data.allowedComponentRoles || ["bead", "charm"],
      isPublished: data.isPublished ?? false,
      isActive: data.isActive ?? true,
      displayOrder: data.displayOrder || 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    inMemoryMethods.push(newMethod);
    return { ...newMethod };
  }

  async update(id: string, data: Partial<IStudioConstructionMethod>): Promise<IStudioConstructionMethod> {
    const existing = await this.findById(id);
    if (!existing) {
      throw new Error("Construction method not found");
    }

    if (data.slug && data.slug !== existing.slug) {
      const slugCheck = await this.findBySlug(data.slug);
      if (slugCheck && slugCheck.id !== id) {
        throw new Error(`Construction method slug '${data.slug}' already exists`);
      }
    }

    if (await this.checkTableExists()) {
      const res = await PostgresDatabase.query(
        `UPDATE studio_construction_methods
         SET name = COALESCE($1, name),
             slug = COALESCE($2, slug),
             description = COALESCE($3, description),
             image_url = COALESCE($4, image_url),
             base_material_type = COALESCE($5, base_material_type),
             physical_specs_config = COALESCE($6, physical_specs_config),
             endpoint_a_config = COALESCE($7, endpoint_a_config),
             endpoint_b_config = COALESCE($8, endpoint_b_config),
             allowed_component_roles = COALESCE($9, allowed_component_roles),
             is_published = COALESCE($10, is_published),
             is_active = COALESCE($11, is_active),
             display_order = COALESCE($12, display_order),
             updated_at = NOW()
         WHERE id = $13
         RETURNING *;`,
        [
          data.name ?? null,
          data.slug ?? null,
          data.description ?? null,
          data.imageUrl ?? null,
          data.baseMaterialType ?? null,
          data.physicalSpecsConfig ? JSON.stringify(data.physicalSpecsConfig) : null,
          data.endpointAConfig ? JSON.stringify(data.endpointAConfig) : null,
          data.endpointBConfig ? JSON.stringify(data.endpointBConfig) : null,
          data.allowedComponentRoles ?? null,
          data.isPublished ?? null,
          data.isActive ?? null,
          data.displayOrder ?? null,
          id,
        ]
      );
      return this.mapRowToMethod(res.rows[0]);
    }

    const idx = inMemoryMethods.findIndex((m) => m.id === id);
    if (idx !== -1) {
      inMemoryMethods[idx] = {
        ...inMemoryMethods[idx],
        ...data,
        updatedAt: new Date().toISOString(),
      };
      return { ...inMemoryMethods[idx] };
    }
    return existing;
  }

  async delete(id: string): Promise<boolean> {
    if (await this.checkTableExists()) {
      await PostgresDatabase.query("DELETE FROM studio_construction_methods WHERE id = $1;", [id]);
      return true;
    }
    const idx = inMemoryMethods.findIndex((m) => m.id === id);
    if (idx !== -1) {
      inMemoryMethods.splice(idx, 1);
      return true;
    }
    return false;
  }

  async assignToSubcategory(subcategoryId: string, constructionMethodId: string, isPublished = true): Promise<void> {
    if (await this.checkTableExists()) {
      await PostgresDatabase.query(
        `INSERT INTO studio_subcategory_methods (subcategory_id, construction_method_id, is_published)
         VALUES ($1, $2, $3)
         ON CONFLICT (subcategory_id, construction_method_id) 
         DO UPDATE SET is_published = EXCLUDED.is_published, updated_at = NOW();`,
        [subcategoryId, constructionMethodId, isPublished]
      );
      return;
    }

    const existingIdx = inMemoryMappings.findIndex(
      (m) => m.subcategoryId === subcategoryId && m.constructionMethodId === constructionMethodId
    );
    if (existingIdx !== -1) {
      inMemoryMappings[existingIdx].isPublished = isPublished;
    } else {
      inMemoryMappings.push({
        id: `map-${Date.now().toString(36)}`,
        subcategoryId,
        constructionMethodId,
        isPublished,
        displayOrder: inMemoryMappings.length + 1,
      });
    }
  }

  async removeFromSubcategory(subcategoryId: string, constructionMethodId: string): Promise<void> {
    if (await this.checkTableExists()) {
      await PostgresDatabase.query(
        "DELETE FROM studio_subcategory_methods WHERE subcategory_id = $1 AND construction_method_id = $2;",
        [subcategoryId, constructionMethodId]
      );
      return;
    }

    const idx = inMemoryMappings.findIndex(
      (m) => m.subcategoryId === subcategoryId && m.constructionMethodId === constructionMethodId
    );
    if (idx !== -1) {
      inMemoryMappings.splice(idx, 1);
    }
  }

  async getSubcategoryIds(constructionMethodId: string): Promise<string[]> {
    if (await this.checkTableExists()) {
      const res = await PostgresDatabase.query(
        "SELECT subcategory_id FROM studio_subcategory_methods WHERE construction_method_id = $1;",
        [constructionMethodId]
      );
      return res.rows.map((r: any) => r.subcategory_id);
    }
    return inMemoryMappings
      .filter((m) => m.constructionMethodId === constructionMethodId)
      .map((m) => m.subcategoryId);
  }

  private mapRowToMethod(row: any): IStudioConstructionMethod {
    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      description: row.description,
      imageUrl: row.image_url,
      baseMaterialType: row.base_material_type,
      physicalSpecsConfig: typeof row.physical_specs_config === "string" ? JSON.parse(row.physical_specs_config) : (row.physical_specs_config || {}),
      endpointAConfig: typeof row.endpoint_a_config === "string" ? JSON.parse(row.endpoint_a_config) : (row.endpoint_a_config || {}),
      endpointBConfig: typeof row.endpoint_b_config === "string" ? JSON.parse(row.endpoint_b_config) : (row.endpoint_b_config || {}),
      allowedComponentRoles: row.allowed_component_roles || [],
      isPublished: row.is_published,
      isActive: row.is_active,
      displayOrder: row.display_order,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

export const postgresConstructionMethodRepository = new PostgresConstructionMethodRepository();
