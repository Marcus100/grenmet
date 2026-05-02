import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const { Pool } = pg;

const url = process.env.DB_URL;
if (!url) {
  console.error("DB_URL environment variable is required");
  process.exit(1);
}

const pool = new Pool({ connectionString: url });
const db = drizzle(pool);

const migrationsFolder = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "drizzle",
);

console.log("Running wxwatch migrations from", migrationsFolder);
await migrate(db, { migrationsFolder });
console.log("wxwatch migrations complete");
await pool.end();
