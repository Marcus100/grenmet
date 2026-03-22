import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { env } from "../lib/env";
// biome-ignore lint/performance/noNamespaceImport: drizzle-orm requires schema namespace import
import * as schema from "./schema";

const connectionString = env.DATABASE_URL;

const pool = new Pool({ connectionString });
const db = drizzle(pool, { schema });

export { db };
