import "server-only";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { env } from "@/lib/env";
// biome-ignore lint/performance/noNamespaceImport: drizzle-orm requires schema namespace import
import * as schema from "./schema";

const pool = new Pool({ connectionString: env.TRANSPORT_DATABASE_URL });
const transportDb = drizzle(pool, { schema, casing: "snake_case" });

export { transportDb };
