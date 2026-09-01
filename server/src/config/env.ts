import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().default(8000),
  API_PREFIX: z.string().default("/api/v1"),
  MONGODB_URI: z.string().min(1, "MONGODB_URI is required"),
  CORS_ORIGINS: z.string().default("http://localhost:5173"),
  JWT_ACCESS_SECRET: z.string().min(16).default("dev-access-secret-change-me"),
  JWT_REFRESH_SECRET: z.string().min(16).default("dev-refresh-secret-change-me"),
  JWT_ACCESS_EXPIRES_IN: z.string().default("24h"),
  JWT_REFRESH_EXPIRES_IN: z.string().default("7d"),
  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  EMAIL_FROM: z.string().email().optional().or(z.literal("")),
  FRONTEND_URL: z.string().url().default("http://localhost:5173"),
  FRONTEND_BASE_PATH: z.string().default("/"),
  ADMIN_API_KEY: z.string().optional(),
  ADMIN_SEED_USERNAME: z.string().min(2).default("admin"),
  ADMIN_SEED_EMAIL: z.string().email().default("admin@renucollections.com"),
  ADMIN_SEED_PASSWORD: z.string().min(8).default("Admin@12345"),
  COOKIE_DOMAIN: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment configuration:", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = {
  ...parsed.data,
  corsOrigins: parsed.data.CORS_ORIGINS.split(",").map((o) => o.trim()).filter(Boolean),
  isProduction: parsed.data.NODE_ENV === "production",
  isDevelopment: parsed.data.NODE_ENV === "development",
};
