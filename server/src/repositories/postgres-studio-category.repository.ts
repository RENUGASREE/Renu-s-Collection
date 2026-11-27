import { PostgresDatabase } from "../db/postgres.js";
import { IStudioCategory } from "../types/studio.types.js";

export class PostgresStudioCategoryRepository {
  // Detect circular parent relationships
  private async wouldCreateCycle(categoryId: string, newParentId: string): Promise<boolean> {
    if (categoryId === newParentId) return true;
    let currentParentId: string | null = newParentId;

    while (currentParentId) {
      if (currentParentId === categoryId) return true;
      const parent = await this.findById(currentParentId);
      currentParentId = parent?.parentId || null;
    }
    return false;
  }

  async findAll(options?: { onlyPublished?: boolean; onlyActive?: boolean }): Promise<IStudioCategory[]> {
    let query = "SELECT * FROM studio_categories WHERE 1=1";
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
    return res.rows.map(this.mapRowToCategory);
  }

  async findTree(options?: { onlyPublished?: boolean }): Promise<IStudioCategory[]> {
    const all = await this.findAll(options);
    const map = new Map<string, IStudioCategory>();
    const roots: IStudioCategory[] = [];

    all.forEach((item) => {
      map.set(item.id, { ...item, subcategories: [] });
    });

    all.forEach((item) => {
      const node = map.get(item.id)!;
      if (item.parentId && map.has(item.parentId)) {
        map.get(item.parentId)!.subcategories!.push(node);
      } else {
        roots.push(node);
      }
    });

    return roots;
  }

  async findById(id: string): Promise<IStudioCategory | null> {
    const res = await PostgresDatabase.query(
      "SELECT * FROM studio_categories WHERE id = $1 LIMIT 1;",
      [id]
    );
    if (res.rows.length === 0) return null;
    return this.mapRowToCategory(res.rows[0]);
  }

  async findBySlug(slug: string): Promise<IStudioCategory | null> {
    const res = await PostgresDatabase.query(
      "SELECT * FROM studio_categories WHERE slug = $1 LIMIT 1;",
      [slug]
    );
    if (res.rows.length === 0) return null;
    return this.mapRowToCategory(res.rows[0]);
  }

  async create(data: Partial<IStudioCategory>): Promise<IStudioCategory> {
    if (!data.name || !data.slug) {
      throw new Error("Category name and slug are required");
    }

    // Check slug uniqueness
    const existing = await this.findBySlug(data.slug);
    if (existing) {
      throw new Error(`Category slug '${data.slug}' already exists`);
    }

    // Check self-parent
    if (data.parentId && data.id && data.parentId === data.id) {
      throw new Error("Category cannot be its own parent");
    }

    const res = await PostgresDatabase.query(
      `INSERT INTO studio_categories 
       (name, slug, parent_id, description, cover_image_url, display_order, is_active, is_published, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
       RETURNING *;`,
      [
        data.name.trim(),
        data.slug.trim().toLowerCase(),
        data.parentId || null,
        data.description || null,
        data.coverImageUrl || null,
        data.displayOrder || 0,
        data.isActive ?? true,
        data.isPublished ?? true,
      ]
    );
    return this.mapRowToCategory(res.rows[0]);
  }

  async update(id: string, data: Partial<IStudioCategory>): Promise<IStudioCategory> {
    const existing = await this.findById(id);
    if (!existing) {
      throw new Error("Studio category not found");
    }

    // Slug conflict check
    if (data.slug && data.slug !== existing.slug) {
      const slugCheck = await this.findBySlug(data.slug);
      if (slugCheck && slugCheck.id !== id) {
        throw new Error(`Category slug '${data.slug}' already exists`);
      }
    }

    // Cycle check
    if (data.parentId) {
      if (data.parentId === id) {
        throw new Error("Category cannot be its own parent");
      }
      const createsCycle = await this.wouldCreateCycle(id, data.parentId);
      if (createsCycle) {
        throw new Error("Circular category parent hierarchy detected");
      }
    }

    const res = await PostgresDatabase.query(
      `UPDATE studio_categories
       SET name = COALESCE($1, name),
           slug = COALESCE($2, slug),
           parent_id = $3,
           description = COALESCE($4, description),
           cover_image_url = COALESCE($5, cover_image_url),
           display_order = COALESCE($6, display_order),
           is_active = COALESCE($7, is_active),
           is_published = COALESCE($8, is_published),
           updated_at = NOW()
       WHERE id = $9
       RETURNING *;`,
      [
        data.name !== undefined ? data.name.trim() : null,
        data.slug !== undefined ? data.slug.trim().toLowerCase() : null,
        data.parentId !== undefined ? data.parentId : existing.parentId,
        data.description !== undefined ? data.description : null,
        data.coverImageUrl !== undefined ? data.coverImageUrl : null,
        data.displayOrder !== undefined ? data.displayOrder : null,
        data.isActive !== undefined ? data.isActive : null,
        data.isPublished !== undefined ? data.isPublished : null,
        id,
      ]
    );
    return this.mapRowToCategory(res.rows[0]);
  }

  async delete(id: string): Promise<boolean> {
    // Safety check: cannot delete if child subcategories exist
    const checkChildren = await PostgresDatabase.query(
      "SELECT COUNT(*) as count FROM studio_categories WHERE parent_id = $1;",
      [id]
    );
    if (parseInt(checkChildren.rows[0].count, 10) > 0) {
      throw new Error("Cannot delete category: child subcategories are currently attached to it.");
    }

    const res = await PostgresDatabase.query("DELETE FROM studio_categories WHERE id = $1 RETURNING id;", [id]);
    return res.rows.length > 0;
  }

  private mapRowToCategory(row: any): IStudioCategory {
    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      parentId: row.parent_id,
      description: row.description,
      coverImageUrl: row.cover_image_url,
      displayOrder: row.display_order,
      isActive: row.is_active,
      isPublished: row.is_published,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

export const postgresStudioCategoryRepository = new PostgresStudioCategoryRepository();
