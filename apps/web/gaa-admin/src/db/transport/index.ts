import "server-only";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { env } from "@/lib/env";
// biome-ignore lint/performance/noNamespaceImport: drizzle-orm requires schema namespace import
import * as schema from "./schema";

const pool = new Pool({
  connectionString:
    env.TRANSPORT_DATABASE_URL ??
    "postgresql://unconfigured@unconfigured.invalid/transport",
  connectionTimeoutMillis: 5000,
});
const transportDb = drizzle(pool, { schema, casing: "snake_case" });

export { transportDb };
