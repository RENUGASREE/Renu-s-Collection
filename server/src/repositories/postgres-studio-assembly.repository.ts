import { PostgresDatabase } from "../db/postgres.js";
import { IStudioAssemblyStructure } from "../types/studio.types.js";

const inMemoryAssemblies: IStudioAssemblyStructure[] = [];

export class PostgresStudioAssemblyRepository {
  private hasTableChecked = false;
  private hasTable = false;

  private async checkTableExists(): Promise<boolean> {
    if (this.hasTableChecked) return this.hasTable;
    try {
      const res = await PostgresDatabase.query(
        "SELECT 1 FROM information_schema.tables WHERE table_name = 'studio_assembly_structures' LIMIT 1;"
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

  async findByMethodAndSubcategory(
    constructionMethodId: string,
    subcategoryId?: string | null
  ): Promise<IStudioAssemblyStructure | null> {
    if (await this.checkTableExists()) {
      let query = "SELECT * FROM studio_assembly_structures WHERE construction_method_id = $1";
      const params: any[] = [constructionMethodId];
      if (subcategoryId) {
        params.push(subcategoryId);
        query += ` AND (subcategory_id = $${params.length} OR subcategory_id IS NULL)`;
      }
      query += " ORDER BY subcategory_id NULLS LAST, is_published DESC, updated_at DESC LIMIT 1;";
      const res = await PostgresDatabase.query(query, params);
      if (res.rows.length === 0) return null;
      return this.mapRowToAssembly(res.rows[0]);
    }

    const found = inMemoryAssemblies.find((a) => {
      if (a.constructionMethodId !== constructionMethodId) return false;
      if (subcategoryId && a.subcategoryId && a.subcategoryId !== subcategoryId) return false;
      return true;
    });
    return found ? { ...found } : null;
  }

  async findById(id: string): Promise<IStudioAssemblyStructure | null> {
    if (await this.checkTableExists()) {
      const res = await PostgresDatabase.query(
        "SELECT * FROM studio_assembly_structures WHERE id = $1 LIMIT 1;",
        [id]
      );
      if (res.rows.length === 0) return null;
      return this.mapRowToAssembly(res.rows[0]);
    }
    const found = inMemoryAssemblies.find((a) => a.id === id);
    return found ? { ...found } : null;
  }

  async create(data: Partial<IStudioAssemblyStructure>): Promise<IStudioAssemblyStructure> {
    if (!data.name || !data.constructionMethodId) {
      throw new Error("Structure name and constructionMethodId are required");
    }

    if (await this.checkTableExists()) {
      const res = await PostgresDatabase.query(
        `INSERT INTO studio_assembly_structures
         (name, subcategory_id, construction_method_id, canvas_config, nodes, connections, attachment_points, endpoint_a, endpoint_b, is_published, is_active, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())
         RETURNING *;`,
        [
          data.name,
          data.subcategoryId || null,
          data.constructionMethodId,
          JSON.stringify(data.canvasConfig || { width: 500, height: 500, viewBox: "0 0 500 500" }),
          JSON.stringify(data.nodes || []),
          JSON.stringify(data.connections || []),
          JSON.stringify(data.attachmentPoints || []),
          JSON.stringify(data.endpointA || { x: 180, y: 80, hangDirectionDeg: 90, assembly: null }),
          JSON.stringify(data.endpointB || { x: 320, y: 80, hangDirectionDeg: 90, assembly: null }),
          data.isPublished ?? false,
          data.isActive ?? true,
        ]
      );
      return this.mapRowToAssembly(res.rows[0]);
    }

    const newAssembly: IStudioAssemblyStructure = {
      id: data.id || `sasm-${Date.now().toString(36)}`,
      name: data.name,
      subcategoryId: data.subcategoryId || null,
      constructionMethodId: data.constructionMethodId,
      canvasConfig: data.canvasConfig || { width: 500, height: 500, viewBox: "0 0 500 500" },
      nodes: data.nodes || [],
      connections: data.connections || [],
      attachmentPoints: data.attachmentPoints || [],
      endpointA: data.endpointA || { x: 180, y: 80, hangDirectionDeg: 90, assembly: null },
      endpointB: data.endpointB || { x: 320, y: 80, hangDirectionDeg: 90, assembly: null },
      isPublished: data.isPublished ?? false,
      isActive: data.isActive ?? true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    inMemoryAssemblies.push(newAssembly);
    return { ...newAssembly };
  }

  async update(id: string, data: Partial<IStudioAssemblyStructure>): Promise<IStudioAssemblyStructure> {
    const existing = await this.findById(id);
    if (!existing) {
      throw new Error("Studio assembly structure not found");
    }

    if (await this.checkTableExists()) {
      const res = await PostgresDatabase.query(
        `UPDATE studio_assembly_structures
         SET name = COALESCE($1, name),
             subcategory_id = $2,
             construction_method_id = COALESCE($3, construction_method_id),
             canvas_config = COALESCE($4, canvas_config),
             nodes = COALESCE($5, nodes),
             connections = COALESCE($6, connections),
             attachment_points = COALESCE($7, attachment_points),
             endpoint_a = COALESCE($8, endpoint_a),
             endpoint_b = COALESCE($9, endpoint_b),
             is_published = COALESCE($10, is_published),
             is_active = COALESCE($11, is_active),
             updated_at = NOW()
         WHERE id = $12
         RETURNING *;`,
        [
          data.name ?? null,
          data.subcategoryId !== undefined ? data.subcategoryId : existing.subcategoryId,
          data.constructionMethodId ?? null,
          data.canvasConfig ? JSON.stringify(data.canvasConfig) : null,
          data.nodes ? JSON.stringify(data.nodes) : null,
          data.connections ? JSON.stringify(data.connections) : null,
          data.attachmentPoints ? JSON.stringify(data.attachmentPoints) : null,
          data.endpointA ? JSON.stringify(data.endpointA) : null,
          data.endpointB ? JSON.stringify(data.endpointB) : null,
          data.isPublished ?? null,
          data.isActive ?? null,
          id,
        ]
      );
      return this.mapRowToAssembly(res.rows[0]);
    }

    const idx = inMemoryAssemblies.findIndex((a) => a.id === id);
    if (idx !== -1) {
      inMemoryAssemblies[idx] = {
        ...inMemoryAssemblies[idx],
        ...data,
        updatedAt: new Date().toISOString(),
      };
      return { ...inMemoryAssemblies[idx] };
    }
    return existing;
  }

  async delete(id: string): Promise<boolean> {
    if (await this.checkTableExists()) {
      await PostgresDatabase.query("DELETE FROM studio_assembly_structures WHERE id = $1;", [id]);
      return true;
    }
    const idx = inMemoryAssemblies.findIndex((a) => a.id === id);
    if (idx !== -1) {
      inMemoryAssemblies.splice(idx, 1);
      return true;
    }
    return false;
  }

  private mapRowToAssembly(row: any): IStudioAssemblyStructure {
    return {
      id: row.id,
      name: row.name,
      subcategoryId: row.subcategory_id,
      constructionMethodId: row.construction_method_id,
      canvasConfig: typeof row.canvas_config === "string" ? JSON.parse(row.canvas_config) : row.canvas_config,
      nodes: typeof row.nodes === "string" ? JSON.parse(row.nodes) : (row.nodes || []),
      connections: typeof row.connections === "string" ? JSON.parse(row.connections) : (row.connections || []),
      attachmentPoints: typeof row.attachment_points === "string" ? JSON.parse(row.attachment_points) : (row.attachment_points || []),
      endpointA: typeof row.endpoint_a === "string" ? JSON.parse(row.endpoint_a) : row.endpoint_a,
      endpointB: typeof row.endpoint_b === "string" ? JSON.parse(row.endpoint_b) : row.endpoint_b,
      isPublished: row.is_published,
      isActive: row.is_active,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

export const postgresStudioAssemblyRepository = new PostgresStudioAssemblyRepository();
