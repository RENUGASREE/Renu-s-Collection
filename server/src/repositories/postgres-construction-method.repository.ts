import { PostgresDatabase } from "../db/postgres.js";
import { IStudioConstructionMethod } from "../types/studio.types.js";

export class PostgresConstructionMethodRepository {
  async findAll(options?: { onlyPublished?: boolean; onlyActive?: boolean }): Promise<IStudioConstructionMethod[]> {
    let query = `
      SELECT m.*,
        COALESCE(
          (
            SELECT json_agg(
              json_build_object(
                'id', c.id,
                'name', c.name,
                'slug', c.slug,
                'parentId', c.parent_id,
                'parentName', p.name,
                'isPublished', sm.is_published,
                'displayOrder', sm.display_order
              ) ORDER BY sm.display_order ASC, c.name ASC
            )
            FROM studio_subcategory_methods sm
            JOIN studio_categories c ON c.id = sm.subcategory_id
            LEFT JOIN studio_categories p ON p.id = c.parent_id
            WHERE sm.construction_method_id = m.id
          ),
          '[]'::json
        ) AS assigned_subcategories
      FROM studio_construction_methods m
      WHERE 1=1
    `;
    const params: any[] = [];
    if (options?.onlyActive) {
      params.push(true);
      query += ` AND m.is_active = $${params.length}`;
    }
    if (options?.onlyPublished) {
      params.push(true);
      query += ` AND m.is_published = $${params.length}`;
    }
    query += " ORDER BY m.display_order ASC, m.name ASC;";
    const res = await PostgresDatabase.query(query, params);
    return res.rows.map(this.mapRowToMethod);
  }

  async findById(id: string): Promise<IStudioConstructionMethod | null> {
    const res = await PostgresDatabase.query(
      `SELECT m.*,
        COALESCE(
          (
            SELECT json_agg(
              json_build_object(
                'id', c.id,
                'name', c.name,
                'slug', c.slug,
                'parentId', c.parent_id,
                'parentName', p.name,
                'isPublished', sm.is_published,
                'displayOrder', sm.display_order
              ) ORDER BY sm.display_order ASC, c.name ASC
            )
            FROM studio_subcategory_methods sm
            JOIN studio_categories c ON c.id = sm.subcategory_id
            LEFT JOIN studio_categories p ON p.id = c.parent_id
            WHERE sm.construction_method_id = m.id
          ),
          '[]'::json
        ) AS assigned_subcategories
      FROM studio_construction_methods m
      WHERE m.id = $1 LIMIT 1;`,
      [id]
    );
    if (res.rows.length === 0) return null;
    return this.mapRowToMethod(res.rows[0]);
  }

  async findBySlug(slug: string): Promise<IStudioConstructionMethod | null> {
    const res = await PostgresDatabase.query(
      "SELECT * FROM studio_construction_methods WHERE slug = $1 LIMIT 1;",
      [slug]
    );
    if (res.rows.length === 0) return null;
    return this.mapRowToMethod(res.rows[0]);
  }

  async findBySubcategory(subcategoryId: string, onlyPublished = true): Promise<IStudioConstructionMethod[]> {
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

  async create(data: Partial<IStudioConstructionMethod>): Promise<IStudioConstructionMethod> {
    if (!data.name || !data.slug) {
      throw new Error("Method name and slug are required");
    }

    const existing = await this.findBySlug(data.slug);
    if (existing) {
      throw new Error(`Construction method slug '${data.slug}' already exists`);
    }

    const res = await PostgresDatabase.query(
      `INSERT INTO studio_construction_methods 
       (name, slug, description, image_url, base_material_type, physical_specs_config, endpoint_a_config, endpoint_b_config, allowed_component_roles, is_published, is_active, display_order, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), NOW())
       RETURNING *;`,
      [
        data.name.trim(),
        data.slug.trim().toLowerCase(),
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
        data.name !== undefined ? data.name.trim() : null,
        data.slug !== undefined ? data.slug.trim().toLowerCase() : null,
        data.description !== undefined ? data.description : null,
        data.imageUrl !== undefined ? data.imageUrl : null,
        data.baseMaterialType !== undefined ? data.baseMaterialType : null,
        data.physicalSpecsConfig ? JSON.stringify(data.physicalSpecsConfig) : null,
        data.endpointAConfig ? JSON.stringify(data.endpointAConfig) : null,
        data.endpointBConfig ? JSON.stringify(data.endpointBConfig) : null,
        data.allowedComponentRoles !== undefined ? data.allowedComponentRoles : null,
        data.isPublished !== undefined ? data.isPublished : null,
        data.isActive !== undefined ? data.isActive : null,
        data.displayOrder !== undefined ? data.displayOrder : null,
        id,
      ]
    );
    return this.mapRowToMethod(res.rows[0]);
  }

  async delete(id: string): Promise<boolean> {
    const res = await PostgresDatabase.query("DELETE FROM studio_construction_methods WHERE id = $1 RETURNING id;", [id]);
    return res.rows.length > 0;
  }

  async assignToSubcategory(subcategoryId: string, constructionMethodId: string, isPublished = true): Promise<void> {
    await PostgresDatabase.query(
      `INSERT INTO studio_subcategory_methods (subcategory_id, construction_method_id, is_published)
       VALUES ($1, $2, $3)
       ON CONFLICT (subcategory_id, construction_method_id) 
       DO UPDATE SET is_published = EXCLUDED.is_published, updated_at = NOW();`,
      [subcategoryId, constructionMethodId, isPublished]
    );
  }

  async removeFromSubcategory(subcategoryId: string, constructionMethodId: string): Promise<void> {
    await PostgresDatabase.query(
      "DELETE FROM studio_subcategory_methods WHERE subcategory_id = $1 AND construction_method_id = $2;",
      [subcategoryId, constructionMethodId]
    );
  }

  async getSubcategoryIds(constructionMethodId: string): Promise<string[]> {
    const res = await PostgresDatabase.query(
      "SELECT subcategory_id FROM studio_subcategory_methods WHERE construction_method_id = $1 ORDER BY display_order ASC, created_at ASC;",
      [constructionMethodId]
    );
    return res.rows.map((r: any) => r.subcategory_id);
  }

  async getSubcategoryLinks(constructionMethodId: string): Promise<Array<{
    subcategoryId: string;
    name: string;
    slug: string;
    parentId?: string | null;
    parentName?: string | null;
    isPublished: boolean;
    displayOrder: number;
  }>> {
    const res = await PostgresDatabase.query(
      `SELECT sm.subcategory_id, sm.is_published, sm.display_order,
              c.name, c.slug, c.parent_id, p.name AS parent_name
       FROM studio_subcategory_methods sm
       JOIN studio_categories c ON c.id = sm.subcategory_id
       LEFT JOIN studio_categories p ON p.id = c.parent_id
       WHERE sm.construction_method_id = $1
       ORDER BY sm.display_order ASC, c.name ASC;`,
      [constructionMethodId]
    );
    return res.rows.map((r: any) => ({
      subcategoryId: r.subcategory_id,
      name: r.name,
      slug: r.slug,
      parentId: r.parent_id,
      parentName: r.parent_name,
      isPublished: r.is_published,
      displayOrder: r.display_order,
    }));
  }

  async syncSubcategories(constructionMethodId: string, subcategoryIds: string[]): Promise<void> {
    await PostgresDatabase.transaction(async (client) => {
      // 1. Verify construction method exists
      const methodRes = await client.query(
        "SELECT id FROM studio_construction_methods WHERE id = $1 LIMIT 1;",
        [constructionMethodId]
      );
      if (methodRes.rows.length === 0) {
        throw new Error("Construction method not found");
      }

      // 2. Validate all provided subcategory IDs exist and are genuine subcategories (parent_id IS NOT NULL)
      if (subcategoryIds.length > 0) {
        const catRes = await client.query(
          "SELECT id, parent_id, name FROM studio_categories WHERE id = ANY($1);",
          [subcategoryIds]
        );
        const catMap = new Map<string, any>(catRes.rows.map((r) => [r.id, r]));
        for (const subcatId of subcategoryIds) {
          const cat = catMap.get(subcatId);
          if (!cat) {
            throw new Error(`Category with ID '${subcatId}' does not exist`);
          }
          if (!cat.parent_id) {
            throw new Error(`Category '${cat.name}' is a root parent category and cannot be assigned to construction methods`);
          }
        }
      }

      // 3. Get existing relationships for this construction method
      const existingRes = await client.query(
        "SELECT subcategory_id, is_published, display_order FROM studio_subcategory_methods WHERE construction_method_id = $1;",
        [constructionMethodId]
      );
      const existingMap = new Map<string, { is_published: boolean; display_order: number }>(
        existingRes.rows.map((r) => [r.subcategory_id, { is_published: r.is_published, display_order: r.display_order }])
      );

      // 4. Remove unselected relationships
      const targetSet = new Set(subcategoryIds);
      const toRemove: string[] = [];
      for (const existingId of existingMap.keys()) {
        if (!targetSet.has(existingId)) {
          toRemove.push(existingId);
        }
      }
      if (toRemove.length > 0) {
        await client.query(
          "DELETE FROM studio_subcategory_methods WHERE construction_method_id = $1 AND subcategory_id = ANY($2);",
          [constructionMethodId, toRemove]
        );
      }

      // 5. Add new relationships (default is_published = false) or update display_order of existing
      for (let i = 0; i < subcategoryIds.length; i++) {
        const subcatId = subcategoryIds[i];
        const existing = existingMap.get(subcatId);
        if (existing) {
          // Preserve existing is_published; update display_order
          await client.query(
            `UPDATE studio_subcategory_methods
             SET display_order = $1, updated_at = NOW()
             WHERE construction_method_id = $2 AND subcategory_id = $3;`,
            [i, constructionMethodId, subcatId]
          );
        } else {
          // Newly created relationship: must default to is_published = false
          await client.query(
            `INSERT INTO studio_subcategory_methods
             (subcategory_id, construction_method_id, is_published, display_order, created_at, updated_at)
             VALUES ($1, $2, false, $3, NOW(), NOW())
             ON CONFLICT (subcategory_id, construction_method_id)
             DO UPDATE SET display_order = EXCLUDED.display_order, updated_at = NOW();`,
            [subcatId, constructionMethodId, i]
          );
        }
      }
    });
  }

  private mapRowToMethod(row: any): IStudioConstructionMethod {
    const assigned = Array.isArray(row.assigned_subcategories) ? row.assigned_subcategories : [];
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
      subcategoryIds: assigned.length > 0 ? assigned.map((s: any) => s.id) : (row.subcategory_ids || []),
      assignedSubcategories: assigned,
    };
  }
}

export const postgresConstructionMethodRepository = new PostgresConstructionMethodRepository();
