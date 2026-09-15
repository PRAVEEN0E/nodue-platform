import { z } from "zod";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const envSchema = z.object({
  DATABASE_URL: z.string().url("DATABASE_URL must be a valid PostgreSQL connection URL"),
  DIRECT_DATABASE_URL: z.string().url().optional(),
  REDIS_URL: z.string().url("REDIS_URL must be a valid Redis connection URL").default("redis://localhost:6379"),
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
  REFRESH_SECRET: z.string().min(32, "REFRESH_SECRET must be at least 32 characters"),
  COOKIE_SECRET: z.string().min(32, "COOKIE_SECRET must be at least 32 characters"),
  PORT: z.coerce.number().default(5000),
  HOST: z.string().default("127.0.0.1"),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  CORS_ORIGIN: z.string().default("http://localhost:3000"),
  // Cross-site cookie configuration: "none" for cross-domain HTTPS, or "lax"/"strict"
  COOKIE_SAME_SITE: z.enum(["strict", "lax", "none"]).optional(),
  // Comma-separated IPs bypassing rate limits (local dev/E2E default).
  // Set to "" to enforce limits everywhere (shared staging, prod-like tests).
  RATE_LIMIT_ALLOWLIST: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("❌ Invalid environment variables:", JSON.stringify(parsed.error.format(), null, 2));
  process.exit(1);
}

// Security audit warning for production deployments
if (parsed.data.NODE_ENV === "production") {
  const isPlaceholder = (s: string) =>
    s.toLowerCase().includes("replace_in_production") || s.toLowerCase().includes("default");
  if (
    isPlaceholder(parsed.data.JWT_SECRET) ||
    isPlaceholder(parsed.data.REFRESH_SECRET) ||
    isPlaceholder(parsed.data.COOKIE_SECRET)
  ) {
    console.warn(
      "\n⚠️  [SECURITY WARNING] Placeholder secrets detected in production environment! For live production, configure unique 32+ character secrets in your .env file.\n"
    );
  }
}

export const env = parsed.data;
