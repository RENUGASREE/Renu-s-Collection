import { PostgresDatabase } from "../db/postgres.js";
import { IStudioConstructionMethod } from "../types/studio.types.js";

export class PostgresConstructionMethodRepository {
  async findAll(options?: { onlyPublished?: boolean; onlyActive?: boolean }): Promise<IStudioConstructionMethod[]> {
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

  async findById(id: string): Promise<IStudioConstructionMethod | null> {
    const res = await PostgresDatabase.query(
      "SELECT * FROM studio_construction_methods WHERE id = $1 LIMIT 1;",
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
      "SELECT subcategory_id FROM studio_subcategory_methods WHERE construction_method_id = $1;",
      [constructionMethodId]
    );
    return res.rows.map((r: any) => r.subcategory_id);
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
