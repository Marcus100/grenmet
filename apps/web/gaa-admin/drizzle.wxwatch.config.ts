import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

config({ path: ".env.local" });

// biome-ignore lint/style/noProcessEnv: standalone Drizzle CLI configuration.
const url = process.env.WXWATCH_DATABASE_URL;
if (!url) throw new Error("WXWATCH_DATABASE_URL is required");

export default defineConfig({
  schema: "./src/db/wxwatch/schema.ts",
  out: "./drizzle/wxwatch",
  dialect: "postgresql",
  dbCredentials: { url },
});
