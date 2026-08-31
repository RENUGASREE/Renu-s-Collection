import dotenv from "dotenv";
import { connectDatabase, disconnectDatabase } from "../db/connection.js";
import { User } from "../models/User.js";
import { hashPassword } from "../utils/password.js";
import { env } from "../config/env.js";

dotenv.config();

async function seedAdmin() {
  await connectDatabase();

  const email = (env.ADMIN_SEED_EMAIL || "admin@renucollections.com").toLowerCase();
  const passwordHash = await hashPassword(env.ADMIN_SEED_PASSWORD || "Admin@123");

  const user = await User.findOneAndUpdate(
    { email },
    {
      email,
      username: "admin",
      passwordHash,
      role: "admin",
      isEmailVerified: true,
      firstName: "Renuga",
      lastName: "Sree",
    },
    { upsert: true, new: true }
  );

  console.log("Admin user ready:");
  console.log(`  Email:    ${user.email}`);
  console.log(`  Password: ${env.ADMIN_SEED_PASSWORD}`);
  console.log(`  Role:     ${user.role}`);

  if (env.isProduction) {
    console.warn("WARNING: Change the admin password immediately in production.");
  }

  await disconnectDatabase();
}

seedAdmin().catch(async (error) => {
  console.error("Admin seed failed:", error);
  await disconnectDatabase();
  process.exit(1);
});
