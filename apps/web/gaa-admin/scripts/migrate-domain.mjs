import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import { databaseConfig } from "./database-config.mjs";

export async function migrateDomain(domain) {
  const pool = new pg.Pool(databaseConfig(domain));
  let client;
  try {
    client = await pool.connect();
    // Use the SAME connection for the session lock and migration transaction.
    // Seeds use this key too, so a seed cannot race a migration.
    await client.query("SELECT pg_advisory_lock(73190506)");
    await migrate(drizzle(client), {
      migrationsFolder: join(
        fileURLToPath(new URL("../drizzle/", import.meta.url)),
        domain
      ),
    });
    console.log(`${domain} migrations complete`);
  } finally {
    // Destroy the connection; PostgreSQL releases the session lock even on error.
    client?.release(true);
    await pool.end();
  }
}
