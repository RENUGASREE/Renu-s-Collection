import { PostgresDatabase } from "../db/postgres.js";
import { IStudioMaterialLink } from "../types/studio.types.js";

export class PostgresMaterialLinkRepository {
  async findAll(): Promise<IStudioMaterialLink[]> {
    const res = await PostgresDatabase.query("SELECT * FROM studio_material_links ORDER BY created_at DESC;");
    return res.rows.map(this.mapRowToLink);
  }

  async findById(id: string): Promise<IStudioMaterialLink | null> {
    const res = await PostgresDatabase.query("SELECT * FROM studio_material_links WHERE id = $1 LIMIT 1;", [id]);
    if (res.rows.length === 0) return null;
    return this.mapRowToLink(res.rows[0]);
  }

  async findByStudioMaterial(materialId: string, sku?: string | null): Promise<IStudioMaterialLink | null> {
    let query = "SELECT * FROM studio_material_links WHERE studio_material_id = $1";
    const params: any[] = [materialId];
    if (sku) {
      params.push(sku);
      query += ` AND (studio_variant_sku = $${params.length} OR studio_variant_sku IS NULL)`;
    }
    query += " LIMIT 1;";
    const res = await PostgresDatabase.query(query, params);
    if (res.rows.length === 0) return null;
    return this.mapRowToLink(res.rows[0]);
  }

  async findByCustomizationMaterial(materialId: string, sku?: string | null): Promise<IStudioMaterialLink | null> {
    let query = "SELECT * FROM studio_material_links WHERE customization_material_id = $1";
    const params: any[] = [materialId];
    if (sku) {
      params.push(sku);
      query += ` AND (customization_variant_sku = $${params.length} OR customization_variant_sku IS NULL)`;
    }
    query += " LIMIT 1;";
    const res = await PostgresDatabase.query(query, params);
    if (res.rows.length === 0) return null;
    return this.mapRowToLink(res.rows[0]);
  }

  async create(data: Partial<IStudioMaterialLink>): Promise<IStudioMaterialLink> {
    if (!data.studioMaterialId || !data.customizationMaterialId) {
      throw new Error("Both studioMaterialId and customizationMaterialId are required for material linking");
    }

    const res = await PostgresDatabase.query(
      `INSERT INTO studio_material_links 
       (studio_material_id, studio_variant_sku, customization_material_id, customization_variant_sku, authoritative_source, consumption_qty, notes, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
       RETURNING *;`,
      [
        data.studioMaterialId,
        data.studioVariantSku || null,
        data.customizationMaterialId,
        data.customizationVariantSku || null,
        data.authoritativeSource || "studio",
        data.consumptionQty || 1,
        data.notes || null,
      ]
    );
    return this.mapRowToLink(res.rows[0]);
  }

  async update(id: string, data: Partial<IStudioMaterialLink>): Promise<IStudioMaterialLink> {
    const existing = await this.findById(id);
    if (!existing) {
      throw new Error("Studio material link not found");
    }

    const res = await PostgresDatabase.query(
      `UPDATE studio_material_links
       SET authoritative_source = COALESCE($1, authoritative_source),
           consumption_qty = COALESCE($2, consumption_qty),
           notes = COALESCE($3, notes),
           updated_at = NOW()
       WHERE id = $4
       RETURNING *;`,
      [
        data.authoritativeSource ?? null,
        data.consumptionQty ?? null,
        data.notes ?? null,
        id,
      ]
    );
    return this.mapRowToLink(res.rows[0]);
  }

  async delete(id: string): Promise<boolean> {
    // Note: unlinking does NOT delete underlying material records in either library!
    const res = await PostgresDatabase.query("DELETE FROM studio_material_links WHERE id = $1;", [id]);
    return (res.rowCount ?? 0) > 0;
  }

  private mapRowToLink(row: any): IStudioMaterialLink {
    return {
      id: row.id,
      studioMaterialId: row.studio_material_id,
      studioVariantSku: row.studio_variant_sku,
      customizationMaterialId: row.customization_material_id,
      customizationVariantSku: row.customization_variant_sku,
      authoritativeSource: row.authoritative_source,
      consumptionQty: row.consumption_qty,
      notes: row.notes,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

export const postgresMaterialLinkRepository = new PostgresMaterialLinkRepository();
