import { createApp } from "./app.js";
import { connectDatabase } from "./db/connection.js";
import { env } from "./config/env.js";
import { User } from "./models/User.js";
import { hashPassword } from "./utils/password.js";

async function seedAdminUser() {
  try {
    const email = env.ADMIN_SEED_EMAIL.toLowerCase();
    const passwordHash = await hashPassword(env.ADMIN_SEED_PASSWORD);

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

    console.log("Admin user ready:");
    console.log(`  Email: ${user.email}`);
    console.log(`  Username: ${user.username}`);
    console.log(`  Role: ${user.role}`);
  } catch (error) {
    console.error("Failed to seed admin user:", error);
  }
}

async function bootstrap() {
  await connectDatabase();
  
  // Seed admin user on startup
  await seedAdminUser();

  const app = createApp();

  app.listen(env.PORT, () => {
    console.log(`Renu's Collections API listening on http://localhost:${env.PORT}${env.API_PREFIX}`);
  });
}

bootstrap().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});
