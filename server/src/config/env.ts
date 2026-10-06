import { z } from "zod";
import dotenv from "dotenv";
import path from "node:path";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });
dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().default(""),
  JWT_ACCESS_SECRET: z.string().min(16).default("dev-access-secret-change-me"),
  JWT_REFRESH_SECRET: z.string().min(16).default("dev-refresh-secret-change-me"),
  JWT_ACCESS_TTL: z.string().default("15m"),
  JWT_REFRESH_TTL: z.string().default("7d"),
  COOKIE_SECURE: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  CLIENT_ORIGIN: z.string().default("http://localhost:5173"),
  AI_PROVIDER: z.string().default("openai"),
  AI_API_KEY: z.string().default(""),
  AI_MODEL: z.string().default("gpt-4o-mini"),
  AI_BASE_URL: z.string().default("https://api.openai.com/v1"),
  AI_MAX_TOKENS: z.coerce.number().int().positive().default(8000),
  AI_TEMPERATURE: z.coerce.number().min(0).max(2).default(0.4),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("❌ Invalid environment configuration:");
  for (const issue of parsed.error.issues) {
    console.error(`   ${issue.path.join(".")}: ${issue.message}`);
  }
  process.exit(1);
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === "production";
export const aiConfigured = Boolean(env.AI_API_KEY);
