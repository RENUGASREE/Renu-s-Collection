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
  mongoose.set("strictQuery", true);

  await mongoose.connect(env.MONGODB_URI, {
    autoIndex: env.isDevelopment,
  });

  console.log(`MongoDB connected (${env.isProduction ? "production" : "development"})`);
}

export async function disconnectDatabase(): Promise<void> {
  await mongoose.disconnect();
}
