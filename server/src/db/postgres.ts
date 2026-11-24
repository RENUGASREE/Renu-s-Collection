import pg from "pg";
import { env } from "../config/env.js";
import { IDbClient, IDbPool, IDbPoolClient } from "../types/database.types.js";

const { Pool, Client } = pg;

/**
 * PostgreSQL Connection & Pooling Configuration for Supabase (Phase 2A)
 *
 * Architecture:
 * 1. Transaction Pooler (Port 6543): Used for application queries via `DATABASE_URL`.
 * 2. Direct Session Connection (Port 5432): Used for DDL schema migrations via `DIRECT_URL`.
 * 3. Security: SSL is required for all remote Supabase endpoints; credentials are never logged.
 */
export interface PostgresConfig {
  connectionString?: string;
  directConnectionString?: string;
  maxConnections: number;
  idleTimeoutMillis: number;
  connectionTimeoutMillis: number;
  ssl: boolean;
}

export function sanitizeConnectionString(url?: string): string | undefined {
  if (!url) return url;
  // Automatically strip placeholder brackets around password if present (e.g., :[password]@ -> :password@)
  return url.replace(/(:)\[([^\]]+)\](@)/, "$1$2$3");
}

export function getPostgresConfig(): PostgresConfig {
  const rawConnectionString = env.DATABASE_URL || process.env.DATABASE_URL;
  const rawDirectConnectionString = env.DIRECT_URL || process.env.DIRECT_URL;

  const connectionString = sanitizeConnectionString(rawConnectionString);
  const directConnectionString = sanitizeConnectionString(rawDirectConnectionString);

  const isLocal = connectionString?.includes("localhost") || connectionString?.includes("127.0.0.1");

  return {
    connectionString,
    directConnectionString,
    maxConnections: env.PG_MAX_CONNECTIONS || 10,
    idleTimeoutMillis: env.PG_IDLE_TIMEOUT || 60000,
    connectionTimeoutMillis: env.PG_CONNECT_TIMEOUT || 30000,
    ssl: env.isProduction || !isLocal,
  };
}

/**
 * Creates and initializes a `pg.Pool` connected to the Supavisor Transaction Pooler.
 */
export function createPostgresPool(customConfig?: Partial<PostgresConfig>): IDbPool {
  const config = { ...getPostgresConfig(), ...customConfig };

  if (!config.connectionString) {
    throw new Error(
      "Cannot initialize PostgreSQL pool: DATABASE_URL is not set. Please provide the transaction pooler connection string."
    );
  }

  const pool = new Pool({
    connectionString: config.connectionString,
    max: config.maxConnections,
    idleTimeoutMillis: config.idleTimeoutMillis,
    connectionTimeoutMillis: config.connectionTimeoutMillis,
    ssl: config.ssl ? { rejectUnauthorized: false } : false,
    keepAlive: true,
    keepAliveInitialDelayMillis: 10000,
  });

  // Handle unexpected errors on idle clients
  pool.on("error", (err) => {
    console.error("Unexpected error on idle PostgreSQL client:", err.message);
  });

  return pool as unknown as IDbPool;
}

/**
 * Creates a standalone direct `pg.Client` for running DDL schema migrations.
 */
export function createDirectMigrationClient(customConnectionString?: string): pg.Client {
  const rawConnectionString = customConnectionString || env.DIRECT_URL || process.env.DIRECT_URL || env.DATABASE_URL || process.env.DATABASE_URL;
  const connectionString = sanitizeConnectionString(rawConnectionString);

  if (!connectionString) {
    throw new Error(
      "Cannot create direct migration client: DIRECT_URL (or DATABASE_URL) is not set."
    );
  }

  const isLocal = connectionString.includes("localhost") || connectionString.includes("127.0.0.1");

  return new Client({
    connectionString,
    ssl: env.isProduction || !isLocal ? { rejectUnauthorized: false } : false,
  });
}

/**
 * Singleton database wrapper that manages the active pool and transactions.
 */
export class PostgresDatabase {
  private static pool: IDbPool | null = null;

  public static initialize(poolInstance?: IDbPool): IDbPool {
    if (poolInstance) {
      this.pool = poolInstance;
    } else if (!this.pool) {
      this.pool = createPostgresPool();
    }
    return this.pool;
  }

  public static isInitialized(): boolean {
    return this.pool !== null;
  }

  public static getPool(): IDbPool {
    if (!this.pool) {
      this.initialize();
    }
    return this.pool!;
  }

  public static async query<T = any>(sql: string, params?: any[]) {
    try {
      return await this.getPool().query<T>(sql, params);
    } catch (err: any) {
      // Log sanitized error message without exposing connection strings or credentials
      console.error("PostgreSQL query execution failed:", err.message || "Unknown error");
      throw err;
    }
  }

  public static async getClient(): Promise<IDbPoolClient> {
    return this.getPool().connect();
  }

  /**
   * Helper to execute queries inside an isolated PostgreSQL transaction.
   * Delegates to the standalone `withTransaction` function.
   */
  public static async transaction<T>(
    callback: (client: IDbClient) => Promise<T>
  ): Promise<T> {
    return withTransaction(this.getPool(), callback);
  }

  public static async close(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
    }
  }
}

/**
 * Executes `callback` inside a single PostgreSQL transaction on a dedicated
 * pool client.  On success the transaction is committed; on any error it is
 * rolled back and the original error is re-thrown.
 *
 * If ROLLBACK itself fails the rollback error is attached to the original
 * error as `originalError.rollbackError` so callers can inspect both without
 * losing either.  The client is always released in `finally`.
 */
export async function withTransaction<T>(
  pool: IDbPool,
  callback: (client: IDbClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (originalError: any) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackError: any) {
      // Attach the rollback failure so callers can inspect it;
      // the original error is still the one that is thrown.
      originalError.rollbackError = rollbackError;
      console.error("[withTransaction] ROLLBACK failed:", rollbackError.message);
    }
    throw originalError;
  } finally {
    client.release();
  }
}

/**
 * Read-only connectivity probe.  Returns `{ connected: true, latencyMs }` on
 * success or `{ connected: false, error }` on failure / not configured.
 *
 * Uses the singleton pool if already initialised; accepts an optional override
 * pool for testing.
 */
export async function checkPostgresConnectivity(
  pool?: IDbPool
): Promise<{ connected: boolean; latencyMs?: number; error?: string }> {
  const p = pool ?? (PostgresDatabase.isInitialized() ? PostgresDatabase.getPool() : null);

  if (!p) {
    // DATABASE_URL is absent – not an error in environments that only use Mongo
    return { connected: false, error: "PostgreSQL not configured" };
  }

  const start = Date.now();
  try {
    await p.query("SELECT 1");
    return { connected: true, latencyMs: Date.now() - start };
  } catch (err: any) {
    return { connected: false, error: err.message };
  }
}
