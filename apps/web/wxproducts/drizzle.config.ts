import "dotenv/config";
import { defineConfig } from "drizzle-kit";

const url = process.env.DATABASE_URL ?? process.env.DB_URL;
if (!url) {
  throw new Error("DATABASE_URL or DB_URL must be set for drizzle-kit");
}

export default defineConfig({
  schema: "./src/db/schema",
  out: "./drizzle",
  dialect: "postgresql",
  casing: "snake_case",
  dbCredentials: { url },
});
