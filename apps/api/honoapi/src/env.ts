import { z } from "zod";

const schema = z.object({
  PORT: z.coerce.number().int().positive().default(4000),
  HOST: z.string().default("0.0.0.0"),
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  ENVIRONMENT: z
    .enum(["local", "staging", "production", "test"])
    .default("local"),
  API_PREFIX: z.string().default("/api/v1"),
  // CORS — comma-separated list of allowed origins
  CORS_ORIGINS: z.string().default("http://localhost:3000"),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  // biome-ignore lint/suspicious/noConsole: boot-time validation failure
  console.error(
    "❌ Invalid environment variables:",
    parsed.error.flatten().fieldErrors
  );
  process.exit(1);
}

export const env = parsed.data;
