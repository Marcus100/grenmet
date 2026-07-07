import "dotenv/config";
import { defineConfig } from "drizzle-kit";

// biome-ignore lint/style/noProcessEnv: drizzle-kit runs via CLI outside Next.js and must not load the full app env schema.
const url = process.env.JANITORIAL_DATABASE_URL ?? process.env.DB_URL;
if (!url) {
  throw new Error(
    "JANITORIAL_DATABASE_URL or DB_URL must be set for drizzle-kit"
  );
}

export default defineConfig({
  schema: "./src/db/janitorial/schema.ts",
  out: "./drizzle/janitorial",
  dialect: "postgresql",
  casing: "snake_case",
  dbCredentials: { url },
});
