import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL ?? process.env.DB_URL ?? "";

const pool = new Pool({ connectionString });
const db = drizzle(pool, { schema });

export { db };
