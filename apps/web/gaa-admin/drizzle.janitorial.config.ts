import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

config({ path: ".env.local" });

// biome-ignore lint/style/noProcessEnv: standalone Drizzle CLI configuration.
const url = process.env.JANITORIAL_DATABASE_URL;
if (!url) throw new Error("JANITORIAL_DATABASE_URL is required");

export default defineConfig({
  schema: "./src/db/janitorial/schema.ts",
  out: "./drizzle/janitorial",
  dialect: "postgresql",
  casing: "snake_case",
  dbCredentials: { url },
});
