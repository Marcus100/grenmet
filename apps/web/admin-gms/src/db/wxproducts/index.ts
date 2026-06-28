import "server-only";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { env } from "@/lib/env";
// biome-ignore lint/performance/noNamespaceImport: drizzle-orm requires schema namespace import
import * as schema from "./schema";

const pool = new Pool({ connectionString: env.WXPRODUCTS_DATABASE_URL });
const wxproductsDb = drizzle(pool, { schema, casing: "snake_case" });

export { wxproductsDb };
