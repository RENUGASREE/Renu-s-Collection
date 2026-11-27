import { PostgresDatabase } from "../db/postgres.js";
import { IStudioCategory } from "../types/studio.types.js";

// In-memory store fallback for isolated test execution / before migration 006 is applied to live DB
const inMemoryStudioCategories: IStudioCategory[] = [
  {
    id: "scat-jewellery-root",
    name: "Jewellery",
    slug: "jewellery",
    parentId: null,
    description: "Fine handcrafted custom studio jewellery",
    displayOrder: 0,
    isActive: true,
    isPublished: true,
  },
  {
    id: "scat-bracelets",
    name: "Bracelets",
    slug: "bracelets",
    parentId: "scat-jewellery-root",
    description: "Customizable beaded, wire, and link bracelets",
    displayOrder: 1,
    isActive: true,
    isPublished: true,
  },
  {
    id: "scat-sub-beaded-bracelet",
    name: "Beaded Bracelet",
    slug: "beaded-bracelet",
    parentId: "scat-bracelets",
    description: "Artisan beaded bracelets with multiple construction methods",
    displayOrder: 1,
    isActive: true,
    isPublished: true,
  },
  {
    id: "scat-sub-memory-wire",
    name: "Memory Wire Bracelet",
    slug: "memory-wire-bracelet",
    parentId: "scat-bracelets",
    description: "Rigid form-fitting wire bracelet with secure endpoints",
    displayOrder: 2,
    isActive: true,
    isPublished: true,
  },
  {
    id: "scat-sub-clasp-extension",
    name: "Clasp & Extension Bracelet",
    slug: "clasp-extension-bracelet",
    parentId: "scat-bracelets",
    description: "Adjustable extension chain bracelets with lobster clasps",
    displayOrder: 3,
    isActive: true,
    isPublished: true,
  },
];

export class PostgresStudioCategoryRepository {
  private hasTableChecked = false;
  private hasTable = false;

  private async checkTableExists(): Promise<boolean> {
    if (this.hasTableChecked) return this.hasTable;
    try {
      const res = await PostgresDatabase.query(
        "SELECT 1 FROM information_schema.tables WHERE table_name = 'studio_categories' LIMIT 1;"
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
    if (await this.checkTableExists()) {
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

    return inMemoryStudioCategories.filter((c) => {
      if (options?.onlyActive && !c.isActive) return false;
      if (options?.onlyPublished && !c.isPublished) return false;
      return true;
    });
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
    if (await this.checkTableExists()) {
      const res = await PostgresDatabase.query(
        "SELECT * FROM studio_categories WHERE id = $1 LIMIT 1;",
        [id]
      );
      if (res.rows.length === 0) return null;
      return this.mapRowToCategory(res.rows[0]);
    }

    const found = inMemoryStudioCategories.find((c) => c.id === id);
    return found ? { ...found } : null;
  }

  async findBySlug(slug: string): Promise<IStudioCategory | null> {
    if (await this.checkTableExists()) {
      const res = await PostgresDatabase.query(
        "SELECT * FROM studio_categories WHERE slug = $1 LIMIT 1;",
        [slug]
      );
      if (res.rows.length === 0) return null;
      return this.mapRowToCategory(res.rows[0]);
    }

    const found = inMemoryStudioCategories.find((c) => c.slug === slug);
    return found ? { ...found } : null;
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

    if (await this.checkTableExists()) {
      const res = await PostgresDatabase.query(
        `INSERT INTO studio_categories 
         (name, slug, parent_id, description, cover_image_url, display_order, is_active, is_published, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
         RETURNING *;`,
        [
          data.name,
          data.slug,
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

    const newCat: IStudioCategory = {
      id: data.id || `scat-${Date.now().toString(36)}`,
      name: data.name,
      slug: data.slug,
      parentId: data.parentId || null,
      description: data.description || null,
      coverImageUrl: data.coverImageUrl || null,
      displayOrder: data.displayOrder || 0,
      isActive: data.isActive ?? true,
      isPublished: data.isPublished ?? true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    inMemoryStudioCategories.push(newCat);
    return { ...newCat };
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

    if (await this.checkTableExists()) {
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
          data.name ?? null,
          data.slug ?? null,
          data.parentId !== undefined ? data.parentId : existing.parentId,
          data.description ?? null,
          data.coverImageUrl ?? null,
          data.displayOrder ?? null,
          data.isActive ?? null,
          data.isPublished ?? null,
          id,
        ]
      );
      return this.mapRowToCategory(res.rows[0]);
    }

    const idx = inMemoryStudioCategories.findIndex((c) => c.id === id);
    if (idx !== -1) {
      inMemoryStudioCategories[idx] = {
        ...inMemoryStudioCategories[idx],
        ...data,
        updatedAt: new Date().toISOString(),
      };
      return { ...inMemoryStudioCategories[idx] };
    }
    return existing;
  }

  async delete(id: string): Promise<boolean> {
    // Safety check: cannot delete if child subcategories exist
    const children = inMemoryStudioCategories.filter((c) => c.parentId === id);
    if (children.length > 0) {
      throw new Error(`Cannot delete category: ${children.length} subcategory/subcategories are attached to it.`);
    }

    if (await this.checkTableExists()) {
      const checkChildren = await PostgresDatabase.query(
        "SELECT COUNT(*) as count FROM studio_categories WHERE parent_id = $1;",
        [id]
      );
      if (parseInt(checkChildren.rows[0].count, 10) > 0) {
        throw new Error("Cannot delete category: child subcategories exist.");
      }

      await PostgresDatabase.query("DELETE FROM studio_categories WHERE id = $1;", [id]);
      return true;
    }

    const idx = inMemoryStudioCategories.findIndex((c) => c.id === id);
    if (idx !== -1) {
      inMemoryStudioCategories.splice(idx, 1);
      return true;
    }
    return false;
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
