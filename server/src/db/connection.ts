import mongoose from "mongoose";
import dns from "dns";
import { env } from "../config/env.js";

// Ensure Atlas SRV connection strings resolve reliably across Windows environments
if (env.MONGODB_URI?.startsWith("mongodb+srv://")) {
  try {
    dns.setServers(["8.8.8.8", "1.1.1.1"]);
  } catch {}
}

export async function connectDatabase(): Promise<void> {
  if (!env.ENABLE_MONGODB_FALLBACK) {
    console.log("MongoDB fallback is disabled (running in PostgreSQL-first mode)");
    return;
  }

  // Prevent accidental activation in production unless explicitly confirmed
  if (env.isProduction) {
    const deliberateConfirmation = process.env.ALLOW_PRODUCTION_MONGODB_ROLLBACK === "true";
    if (!deliberateConfirmation) {
      console.error(
        "CRITICAL SAFEGUARD: ENABLE_MONGODB_FALLBACK is true in production, but ALLOW_PRODUCTION_MONGODB_ROLLBACK is not 'true'. Refusing to connect MongoDB rollback in production."
      );
      return;
    }

    console.warn("================================================================================");
    console.warn("⚠️  DELIBERATE ROLLBACK WARNING: MongoDB fallback is ACTIVE in PRODUCTION mode.");
    console.warn("⚠️  ALLOW_PRODUCTION_MONGODB_ROLLBACK=true confirmed. Primary queries remain PG.");
    console.warn("================================================================================");
  } else {
    console.warn("================================================================================");
    console.warn("⚠️  NOTICE: MongoDB fallback switch is ACTIVE in non-production mode.");
    console.warn("================================================================================");
  }

  if (!env.MONGODB_URI) {
    console.log("MONGODB_URI not configured; skipping standby MongoDB connection");
    return;
  }

  try {
    mongoose.set("strictQuery", true);
    await mongoose.connect(env.MONGODB_URI, {
      autoIndex: env.isDevelopment,
    });
    console.log(`MongoDB standby connected (${env.isProduction ? "production" : "development"})`);
  } catch (error: any) {
    console.warn("MongoDB standby connection failed (non-fatal, PostgreSQL active):", error.message);
  }
}

export async function disconnectDatabase(): Promise<void> {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
}
