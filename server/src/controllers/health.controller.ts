import { Request, Response } from "express";
import mongoose from "mongoose";
import { checkPostgresConnectivity } from "../db/postgres.js";
import { env } from "../config/env.js";

export async function healthCheck(_req: Request, res: Response): Promise<void> {
  const mongoConnected = mongoose.connection.readyState === 1;
  const mongoStatus = {
    status: mongoConnected ? "standby_connected" : "standby_disconnected",
    role: "rollback_only",
    fallbackEnabled: env.ENABLE_MONGODB_FALLBACK,
  };

  const pgResult = await checkPostgresConnectivity();
  const postgresqlStatus = pgResult.connected
    ? { status: "connected", latencyMs: pgResult.latencyMs, role: "primary" }
    : { status: pgResult.error === "PostgreSQL not configured" ? "not_configured" : "disconnected", role: "primary" };

  const storageConfigured = Boolean(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY);
  const storageStatus = {
    status: storageConfigured ? "configured" : "not_configured",
    bucket: env.SUPABASE_STORAGE_BUCKET,
    provider: "supabase_storage",
  };

  const isHealthy = pgResult.connected;

  res.status(isHealthy ? 200 : 503).json({
    success: isHealthy,
    data: {
      status: isHealthy ? "ok" : "degraded",
      timestamp: new Date().toISOString(),
      primaryDatabase: "postgresql",
      postgresql: postgresqlStatus,
      storage: storageStatus,
      mongodb: mongoStatus,
    },
  });
}
