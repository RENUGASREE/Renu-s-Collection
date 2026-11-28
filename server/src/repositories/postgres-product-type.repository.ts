/**
 * ============================================================================
 * PostgreSQL Product Type Repository
 * ============================================================================
 *
 * Provides typed, parameterized operations for Product Types in PostgreSQL.
 * Product Types classify categories in the Product Catalogue (e.g. Bracelet, Necklace).
 */

import { IDbClient, IProductTypeDbRow, IProductTypeRecord, ICreateProductTypeData, IUpdateProductTypeData } from "../types/database.types.js";
import { PostgresDatabase } from "../db/postgres.js";
import { assertValidEntityId } from "../utils/helpers.js";

function mapRowToProductType(row: IProductTypeDbRow): IProductTypeRecord {
  return {
    id: row.id,
    _id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    displayOrder: Number(row.display_order ?? 0),
    isActive: Boolean(row.is_active),
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

export class PostgresProductTypeRepository {
  public async findAll(
    options: { activeOnly?: boolean } = {},
    client?: IDbClient
  ): Promise<IProductTypeRecord[]> {
    const conditions: string[] = [];
    const params: any[] = [];

    if (options.activeOnly) {
      conditions.push("is_active = TRUE");
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const sql = `
      SELECT id, name, slug, description, display_order, is_active, created_at, updated_at
      FROM product_types
      ${whereClause}
      ORDER BY display_order ASC, name ASC;
    `;

    const executor = client || PostgresDatabase;
    const res = await executor.query<IProductTypeDbRow>(sql, params);
    return res.rows.map(mapRowToProductType);
  }

  public async findById(id: string, client?: IDbClient): Promise<IProductTypeRecord | null> {
    assertValidEntityId(id);
    const sql = `
      SELECT id, name, slug, description, display_order, is_active, created_at, updated_at
      FROM product_types
      WHERE id = $1
      LIMIT 1;
    `;
    const executor = client || PostgresDatabase;
    const res = await executor.query<IProductTypeDbRow>(sql, [id]);
    if (res.rows.length === 0) return null;
    return mapRowToProductType(res.rows[0]);
  }

  public async findBySlug(slug: string, client?: IDbClient): Promise<IProductTypeRecord | null> {
    if (!slug || typeof slug !== "string") return null;
    const sql = `
      SELECT id, name, slug, description, display_order, is_active, created_at, updated_at
      FROM product_types
      WHERE LOWER(slug) = LOWER($1)
      LIMIT 1;
    `;
    const executor = client || PostgresDatabase;
    const res = await executor.query<IProductTypeDbRow>(sql, [slug.trim()]);
    if (res.rows.length === 0) return null;
    return mapRowToProductType(res.rows[0]);
  }

  public async findByName(name: string, client?: IDbClient): Promise<IProductTypeRecord | null> {
    if (!name || typeof name !== "string") return null;
    const sql = `
      SELECT id, name, slug, description, display_order, is_active, created_at, updated_at
      FROM product_types
      WHERE LOWER(name) = LOWER($1)
      LIMIT 1;
    `;
    const executor = client || PostgresDatabase;
    const res = await executor.query<IProductTypeDbRow>(sql, [name.trim()]);
    if (res.rows.length === 0) return null;
    return mapRowToProductType(res.rows[0]);
  }

  public async existsByName(name: string, excludeId?: string, client?: IDbClient): Promise<boolean> {
    const params: any[] = [name.trim()];
    let sql = `SELECT 1 FROM product_types WHERE LOWER(name) = LOWER($1)`;
    if (excludeId) {
      params.push(excludeId);
      sql += ` AND id != $2`;
    }
    sql += ` LIMIT 1;`;
    const executor = client || PostgresDatabase;
    const res = await executor.query(sql, params);
    return res.rows.length > 0;
  }

  public async existsBySlug(slug: string, excludeId?: string, client?: IDbClient): Promise<boolean> {
    const params: any[] = [slug.trim()];
    let sql = `SELECT 1 FROM product_types WHERE LOWER(slug) = LOWER($1)`;
    if (excludeId) {
      params.push(excludeId);
      sql += ` AND id != $2`;
    }
    sql += ` LIMIT 1;`;
    const executor = client || PostgresDatabase;
    const res = await executor.query(sql, params);
    return res.rows.length > 0;
  }

  public async countCategoriesUsingSlug(slug: string, client?: IDbClient): Promise<number> {
    const sql = `SELECT COUNT(*)::int AS count FROM categories WHERE product_type = $1;`;
    const executor = client || PostgresDatabase;
    const res = await executor.query<{ count: number }>(sql, [slug.trim()]);
    return Number(res.rows[0]?.count ?? 0);
  }

  public async create(data: ICreateProductTypeData, client?: IDbClient): Promise<IProductTypeRecord> {
    const fields = ["name", "slug", "description", "display_order", "is_active"];
    const values: any[] = [
      data.name.trim(),
      data.slug ? data.slug.trim().toLowerCase() : data.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      data.description !== undefined ? data.description : null,
      data.displayOrder !== undefined ? data.displayOrder : 0,
      data.isActive !== undefined ? data.isActive : true,
    ];

    if (data.id) {
      assertValidEntityId(data.id);
      fields.unshift("id");
      values.unshift(data.id);
    }

    const placeholders = values.map((_, i) => `$${i + 1}`).join(", ");
    const sql = `
      INSERT INTO product_types (${fields.join(", ")})
      VALUES (${placeholders})
      RETURNING id, name, slug, description, display_order, is_active, created_at, updated_at;
    `;

    const executor = client || PostgresDatabase;
    const res = await executor.query<IProductTypeDbRow>(sql, values);
    return mapRowToProductType(res.rows[0]);
  }

  public async update(
    id: string,
    data: IUpdateProductTypeData,
    client?: IDbClient
  ): Promise<IProductTypeRecord | null> {
    assertValidEntityId(id);

    const setClauses: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (data.name !== undefined) {
      setClauses.push(`name = $${idx++}`);
      values.push(data.name.trim());
    }
    if (data.slug !== undefined) {
      setClauses.push(`slug = $${idx++}`);
      values.push(data.slug.trim().toLowerCase());
    }
    if (data.description !== undefined) {
      setClauses.push(`description = $${idx++}`);
      values.push(data.description);
    }
    if (data.displayOrder !== undefined) {
      setClauses.push(`display_order = $${idx++}`);
      values.push(data.displayOrder);
    }
    if (data.isActive !== undefined) {
      setClauses.push(`is_active = $${idx++}`);
      values.push(data.isActive);
    }

    if (setClauses.length === 0) {
      return this.findById(id, client);
    }

    setClauses.push(`updated_at = NOW()`);
    values.push(id);

    const sql = `
      UPDATE product_types
      SET ${setClauses.join(", ")}
      WHERE id = $${idx}
      RETURNING id, name, slug, description, display_order, is_active, created_at, updated_at;
    `;

    const executor = client || PostgresDatabase;
    const res = await executor.query<IProductTypeDbRow>(sql, values);
    if (res.rows.length === 0) return null;
    return mapRowToProductType(res.rows[0]);
  }

  public async delete(id: string, client?: IDbClient): Promise<boolean> {
    assertValidEntityId(id);
    const sql = `DELETE FROM product_types WHERE id = $1;`;
    const executor = client || PostgresDatabase;
    const res = await executor.query(sql, [id]);
    return (res.rowCount ?? 0) > 0;
  }
}

export const postgresProductTypeRepository = new PostgresProductTypeRepository();
