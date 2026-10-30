import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().default(8000),
  API_PREFIX: z.string().default("/api/v1"),
  MONGODB_URI: z.string().min(1, "MONGODB_URI is required"),
  COMMERCE_MODE: z.enum(["test", "live", "disabled"]).default("test"),
  CORS_ORIGINS: z.string().default("http://localhost:5173"),
  JWT_ACCESS_SECRET: z.string().min(16).default("dev-access-secret-change-me"),
  JWT_REFRESH_SECRET: z.string().min(16).default("dev-refresh-secret-change-me"),
  JWT_ACCESS_EXPIRES_IN: z.string().default("7d"),
  JWT_REFRESH_EXPIRES_IN: z.string().default("30d"),
  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GMAIL_REFRESH_TOKEN: z.string().optional(),
  GMAIL_USER: z.string().email().optional(),
  RESEND_API_KEY: z.string().optional(),
  BREVO_API_KEY: z.string().optional(),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  EMAIL_FROM: z.string().email().optional().or(z.literal("")),
  CONTACT_NOTIFICATION_EMAIL: z.string().email().default("renuscollection05@gmail.com"),
  FRONTEND_URL: z.string().url().default("http://localhost:5173"),
  FRONTEND_BASE_PATH: z.string().default("/"),
  ADMIN_API_KEY: z.string().optional(),
  ADMIN_SEED_USERNAME: z.string().min(2).default("admin"),
  ADMIN_SEED_EMAIL: z.string().email().default("admin@renucollections.com"),
  ADMIN_SEED_PASSWORD: z.string().min(8).default("Admin@12345"),
  TEST_COMMERCE_ALLOWED_EMAILS: z.string().optional(),
  COOKIE_DOMAIN: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().default("gemini-2.5-flash"),
  STUDIO_RESERVATION_TIMEOUT_MINUTES: z.coerce.number().default(30),
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
  isTestCommerce: parsed.data.COMMERCE_MODE === "test",
  isLiveCommerce: parsed.data.COMMERCE_MODE === "live",
  isCommerceDisabled: parsed.data.COMMERCE_MODE === "disabled",
  testCommerceAllowedEmails: parsed.data.TEST_COMMERCE_ALLOWED_EMAILS
    ? parsed.data.TEST_COMMERCE_ALLOWED_EMAILS.split(",")
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean)
    : [],
};
