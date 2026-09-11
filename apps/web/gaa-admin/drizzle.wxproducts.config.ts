import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

config({ path: ".env.local" });

// biome-ignore lint/style/noProcessEnv: standalone Drizzle CLI configuration.
const url = process.env.WXPRODUCTS_DATABASE_URL;
if (!url) throw new Error("WXPRODUCTS_DATABASE_URL is required");

export default defineConfig({
  schema: "./src/db/wxproducts/schema/index.ts",
  out: "./drizzle/wxproducts",
  dialect: "postgresql",
  casing: "snake_case",
  dbCredentials: { url },
});
