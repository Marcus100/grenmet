import "dotenv/config";
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/wxwatch/schema.ts",
  out: "./drizzle/wxwatch",
  dialect: "postgresql",
  dbCredentials: {
    // biome-ignore lint/style/noProcessEnv: drizzle-kit runs via CLI outside Next.js and must not load the full app env schema.
    url: process.env.WXWATCH_DATABASE_URL ?? "",
  },
});
