import mongoose from "mongoose";
import { createApp } from "./app.js";
import { connectDatabase } from "./db/connection.js";
import { env } from "./config/env.js";
import { User } from "./models/User.js";
import { hashPassword } from "./utils/password.js";
import { initStudioDefaults } from "./services/studio.service.js";
import { PostgresDatabase } from "./db/postgres.js";
import { PostgresUserRepository } from "./repositories/postgres-user.repository.js";
import { PostgresImageMappingRepository } from "./repositories/postgres-image-mapping.repository.js";
import { SupabaseStorageAdapter } from "./db/supabase-storage.js";
import { ImageDeletionReconciler } from "./controllers/upload.controller.js";
import { reconcilePendingOrderFulfillments } from "./services/payment.service.js";

async function seedAdminUser() {
  try {
    const email = env.ADMIN_SEED_EMAIL.toLowerCase();
    const passwordHash = await hashPassword(env.ADMIN_SEED_PASSWORD);

    if (env.DATABASE_URL) {
      try {
        const userRepo = new PostgresUserRepository();
        const existingPgUser = await userRepo.findByEmail(email);
        if (!existingPgUser) {
          await userRepo.create({
            email,
            username: env.ADMIN_SEED_USERNAME,
            passwordHash,
            role: "admin",
            isEmailVerified: true,
            firstName: "Renuga",
            lastName: "Sree",
          });
          console.log("Admin user seeded in PostgreSQL");
        } else {
          console.log(`Admin user verified in PostgreSQL: ${existingPgUser.email} (${existingPgUser.role})`);
        }
      } catch (pgErr: any) {
        console.warn("PostgreSQL admin seed check warning:", pgErr.message);
      }
    }

    if (env.ENABLE_MONGODB_FALLBACK && mongoose.connection.readyState === 1) {
      const user = await User.findOneAndUpdate(
        { email },
        {
          email,
          username: env.ADMIN_SEED_USERNAME,
          passwordHash,
          role: "admin",
          isEmailVerified: true,
          firstName: "Renuga",
          lastName: "Sree",
        },
        { upsert: true, new: true }
      );

      console.log(`Admin user mirrored in standby MongoDB: ${user.email}`);
    }
  } catch (error) {
    console.error("Failed to seed admin user:", error);
  }
}

async function bootstrap() {
  if (env.DATABASE_URL) {
    try {
      PostgresDatabase.initialize();
      console.log("PostgreSQL database pool initialized");
    } catch (pgErr: any) {
      console.warn("PostgreSQL initialization warning:", pgErr.message);
    }
  }

  await connectDatabase();

  
  // Seed admin user on startup
  await seedAdminUser();

  // Initialize Create Your Own studio defaults safely and idempotently
  await initStudioDefaults();

  // Run startup durable recovery reconciliations if PostgreSQL is initialized
  if (PostgresDatabase.isInitialized()) {
    // 1. Pending image storage deletions reconciliation
    try {
      const storageAdapter = new SupabaseStorageAdapter();
      const imageRepo = new PostgresImageMappingRepository();
      const imageRecon = await ImageDeletionReconciler.reconcilePending(storageAdapter, imageRepo);
      if (imageRecon.attempted > 0) {
        console.log(`[Startup Recovery] Image deletion reconciliation: ${imageRecon.succeeded}/${imageRecon.attempted} purged.`);
      }
    } catch (e: any) {
      console.warn(`[Startup Recovery] Image deletion reconciliation check warning: ${e.message}`);
    }

    // 2. Pending incomplete payment fulfillments reconciliation
    try {
      const fulfillmentRecon = await reconcilePendingOrderFulfillments();
      if (fulfillmentRecon.processed > 0) {
        console.log(`[Startup Recovery] Order fulfillment recovery: ${fulfillmentRecon.succeeded}/${fulfillmentRecon.processed} completed.`);
      }
    } catch (e: any) {
      console.warn(`[Startup Recovery] Order fulfillment recovery check warning: ${e.message}`);
    }
  }

  const app = createApp();

  app.listen(env.PORT, () => {
    console.log(`Renu's Collections API listening on http://localhost:${env.PORT}${env.API_PREFIX}`);
  });
}

bootstrap().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});
