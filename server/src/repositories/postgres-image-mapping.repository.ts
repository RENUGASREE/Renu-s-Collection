import { IDbClient, IImageMappingRecord } from "../types/database.types.js";
import { PostgresDatabase } from "../db/postgres.js";

export interface IImageReferenceResult {
  isReferenced: boolean;
  entityType?: string;
  entityId?: string;
  entityName?: string;
}

export interface IImageMappingRepository {
  findById(mongodbId: string): Promise<IImageMappingRecord | null>;
  findByPath(supabasePath: string): Promise<IImageMappingRecord | null>;
  createMapping(
    data: Omit<IImageMappingRecord, "migrated_at" | "created_at"> & {
      migrated_at?: Date | string;
      created_at?: Date | string;
    }
  ): Promise<IImageMappingRecord>;
  deleteMapping(mongodbId: string): Promise<boolean>;
  updateReferencedStatus(mongodbId: string, isReferenced: boolean): Promise<boolean>;
  isReferenced(mongodbId: string): Promise<boolean>;
  checkReferences(mongodbId: string): Promise<IImageReferenceResult>;
}

export class PostgresImageMappingRepository implements IImageMappingRepository {
  private client: IDbClient;

  constructor(client?: IDbClient) {
    this.client = client || PostgresDatabase.getPool();
  }

  public async findById(mongodbId: string): Promise<IImageMappingRecord | null> {
    const query = `
      SELECT 
        mongodb_id,
        filename,
        content_type,
        file_size_bytes,
        supabase_bucket,
        supabase_path,
        public_url,
        md5_hash,
        is_referenced,
        migrated_at,
        created_at
      FROM image_mappings
      WHERE mongodb_id = $1
      LIMIT 1;
    `;
    const result = await this.client.query<IImageMappingRecord>(query, [mongodbId]);
    return result.rows[0] || null;
  }

  public async findByPath(supabasePath: string): Promise<IImageMappingRecord | null> {
    const query = `
      SELECT 
        mongodb_id,
        filename,
        content_type,
        file_size_bytes,
        supabase_bucket,
        supabase_path,
        public_url,
        md5_hash,
        is_referenced,
        migrated_at,
        created_at
      FROM image_mappings
      WHERE supabase_path = $1
      LIMIT 1;
    `;
    const result = await this.client.query<IImageMappingRecord>(query, [supabasePath]);
    return result.rows[0] || null;
  }

  public async createMapping(
    data: Omit<IImageMappingRecord, "migrated_at" | "created_at"> & {
      migrated_at?: Date | string;
      created_at?: Date | string;
    }
  ): Promise<IImageMappingRecord> {
    const query = `
      INSERT INTO image_mappings (
        mongodb_id,
        filename,
        content_type,
        file_size_bytes,
        supabase_bucket,
        supabase_path,
        public_url,
        md5_hash,
        is_referenced,
        migrated_at,
        created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, COALESCE($10, NOW()), COALESCE($11, NOW()))
      ON CONFLICT (mongodb_id) DO UPDATE SET
        filename = EXCLUDED.filename,
        content_type = EXCLUDED.content_type,
        file_size_bytes = EXCLUDED.file_size_bytes,
        supabase_bucket = EXCLUDED.supabase_bucket,
        supabase_path = EXCLUDED.supabase_path,
        public_url = EXCLUDED.public_url,
        md5_hash = EXCLUDED.md5_hash,
        is_referenced = EXCLUDED.is_referenced
      RETURNING *;
    `;
    const values = [
      data.mongodb_id,
      data.filename,
      data.content_type,
      data.file_size_bytes,
      data.supabase_bucket || "product-images",
      data.supabase_path,
      data.public_url,
      data.md5_hash || null,
      data.is_referenced !== undefined ? data.is_referenced : true,
      data.migrated_at || null,
      data.created_at || null,
    ];

    const result = await this.client.query<IImageMappingRecord>(query, values);
    return result.rows[0];
  }

  public async deleteMapping(mongodbId: string): Promise<boolean> {
    const query = `DELETE FROM image_mappings WHERE mongodb_id = $1 RETURNING mongodb_id;`;
    const result = await this.client.query(query, [mongodbId]);
    return result.rowCount > 0;
  }

  public async updateReferencedStatus(mongodbId: string, isReferenced: boolean): Promise<boolean> {
    const query = `
      UPDATE image_mappings
      SET is_referenced = $1
      WHERE mongodb_id = $2
      RETURNING mongodb_id;
    `;
    const result = await this.client.query(query, [isReferenced, mongodbId]);
    return result.rowCount > 0;
  }

  /**
   * Comprehensive multi-table reference detection across all image-bearing PostgreSQL tables.
   */
  public async checkReferences(mongodbId: string): Promise<IImageReferenceResult> {
    const pattern = `%${mongodbId}%`;

    // 1. Products (primary image_url and media JSONB)
    try {
      const prodRes = await this.client.query(
        `SELECT id, name FROM products WHERE image_url LIKE $1 OR media::text LIKE $1 LIMIT 1;`,
        [pattern]
      );
      if (prodRes.rows.length > 0) {
        return {
          isReferenced: true,
          entityType: "product",
          entityId: prodRes.rows[0].id,
          entityName: prodRes.rows[0].name,
        };
      }
    } catch {}

    // 2. Product Media table
    try {
      const pmRes = await this.client.query(
        `SELECT pm.id, pm.product_id, p.name FROM product_media pm LEFT JOIN products p ON p.id = pm.product_id WHERE pm.url LIKE $1 LIMIT 1;`,
        [pattern]
      );
      if (pmRes.rows.length > 0) {
        return {
          isReferenced: true,
          entityType: "product_media",
          entityId: pmRes.rows[0].id,
          entityName: pmRes.rows[0].name || pmRes.rows[0].product_id,
        };
      }
    } catch {}

    // 3. Categories
    try {
      const catRes = await this.client.query(
        `SELECT id, name FROM categories WHERE image_url LIKE $1 LIMIT 1;`,
        [pattern]
      );
      if (catRes.rows.length > 0) {
        return {
          isReferenced: true,
          entityType: "category",
          entityId: catRes.rows[0].id,
          entityName: catRes.rows[0].name,
        };
      }
    } catch {}

    // 4. Studio Materials (image_url, render_asset_url, additional_images)
    try {
      const smRes = await this.client.query(
        `SELECT id, name FROM studio_materials WHERE image_url LIKE $1 OR render_asset_url LIKE $1 OR array_to_string(additional_images, ',') LIKE $1 LIMIT 1;`,
        [pattern]
      );
      if (smRes.rows.length > 0) {
        return {
          isReferenced: true,
          entityType: "studio_material",
          entityId: smRes.rows[0].id,
          entityName: smRes.rows[0].name,
        };
      }
    } catch {}

    // 5. Component Types & Custom Component Pricing
    try {
      const ctRes = await this.client.query(
        `SELECT id, name FROM component_types WHERE image_url LIKE $1 LIMIT 1;`,
        [pattern]
      );
      if (ctRes.rows.length > 0) {
        return {
          isReferenced: true,
          entityType: "component_type",
          entityId: ctRes.rows[0].id,
          entityName: ctRes.rows[0].name,
        };
      }
    } catch {}

    try {
      const ccpRes = await this.client.query(
        `SELECT id, name FROM custom_component_pricing WHERE image_url LIKE $1 LIMIT 1;`,
        [pattern]
      );
      if (ccpRes.rows.length > 0) {
        return {
          isReferenced: true,
          entityType: "custom_component_pricing",
          entityId: ccpRes.rows[0].id,
          entityName: ccpRes.rows[0].name,
        };
      }
    } catch {}

    // 6. Customization Configs
    try {
      const ccRes = await this.client.query(
        `SELECT id, name FROM customization_configs WHERE fields::text LIKE $1 OR preview_layers::text LIKE $1 LIMIT 1;`,
        [pattern]
      );
      if (ccRes.rows.length > 0) {
        return {
          isReferenced: true,
          entityType: "customization_config",
          entityId: ccRes.rows[0].id,
          entityName: ccRes.rows[0].name,
        };
      }
    } catch {}

    // 7. Design Templates
    try {
      const dtRes = await this.client.query(
        `SELECT id, name FROM design_templates WHERE thumbnail_url LIKE $1 OR bead_sequence::text LIKE $1 OR charms::text LIKE $1 LIMIT 1;`,
        [pattern]
      );
      if (dtRes.rows.length > 0) {
        return {
          isReferenced: true,
          entityType: "design_template",
          entityId: dtRes.rows[0].id,
          entityName: dtRes.rows[0].name,
        };
      }
    } catch {}

    // 8. Saved Designs
    try {
      const sdRes = await this.client.query(
        `SELECT id, name FROM saved_designs WHERE bead_sequence::text LIKE $1 OR charms::text LIKE $1 LIMIT 1;`,
        [pattern]
      );
      if (sdRes.rows.length > 0) {
        return {
          isReferenced: true,
          entityType: "saved_design",
          entityId: sdRes.rows[0].id,
          entityName: sdRes.rows[0].name,
        };
      }
    } catch {}

    // 9. Reviews
    try {
      const revRes = await this.client.query(
        `SELECT id, title FROM reviews WHERE array_to_string(images, ',') LIKE $1 LIMIT 1;`,
        [pattern]
      );
      if (revRes.rows.length > 0) {
        return {
          isReferenced: true,
          entityType: "review",
          entityId: revRes.rows[0].id,
          entityName: revRes.rows[0].title,
        };
      }
    } catch {}

    // 10. Users avatar
    try {
      const userRes = await this.client.query(
        `SELECT id, username FROM users WHERE avatar_url LIKE $1 LIMIT 1;`,
        [pattern]
      );
      if (userRes.rows.length > 0) {
        return {
          isReferenced: true,
          entityType: "user",
          entityId: userRes.rows[0].id,
          entityName: userRes.rows[0].username,
        };
      }
    } catch {}

    // 11. Image Mapping record reference flag
    const mapping = await this.findById(mongodbId);
    if (mapping?.is_referenced) {
      return {
        isReferenced: true,
        entityType: "image_mapping",
        entityId: mongodbId,
        entityName: mapping.filename,
      };
    }

    return { isReferenced: false };
  }

  public async isReferenced(mongodbId: string): Promise<boolean> {
    const res = await this.checkReferences(mongodbId);
    return res.isReferenced;
  }
}
