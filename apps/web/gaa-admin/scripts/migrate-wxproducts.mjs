import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

const { Pool } = pg;

const url =
  process.env.WXPRODUCTS_DATABASE_URL ?? process.env.WXPRODUCTS_DB_URL;
if (!url) {
  console.error("WXPRODUCTS_DATABASE_URL environment variable is required");
  process.exit(1);
}

const pool = new Pool({ connectionString: url });
const db = drizzle(pool);

const migrationsFolder = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "drizzle",
  "wxproducts"
);

console.log("Running wxproducts migrations from", migrationsFolder);
await migrate(db, { migrationsFolder });
console.log("wxproducts migrations complete");
await pool.end();
