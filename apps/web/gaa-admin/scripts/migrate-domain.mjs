import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import { databaseConfig } from "./database-config.mjs";

export function verifyHistory(applied, committed) {
  if (
    applied.length > committed.length ||
    applied.some(
      (row, index) =>
        row.hash !== committed[index].hash ||
        Number(row.created_at) !== committed[index].folderMillis
    )
  ) {
    throw new Error(
      "Applied migration history differs from committed migrations; reconcile before migrating"
    );
  }
}

export async function migrateDomain(domain) {
  const pool = new pg.Pool(databaseConfig(domain));
  let client;
  try {
    client = await pool.connect();
    // Use the SAME connection for the session lock and migration transaction.
    // Seeds use this key too, so a seed cannot race a migration.
    await client.query("SELECT pg_advisory_lock(73190506)");
    const folder = join(
      fileURLToPath(new URL("../drizzle/", import.meta.url)),
      domain
    );
    const table = await client.query(
      "SELECT to_regclass('drizzle.__drizzle_migrations') AS name"
    );
    if (table.rows[0].name) {
      const applied = await client.query(
        "SELECT hash, created_at FROM drizzle.__drizzle_migrations ORDER BY created_at"
      );
      verifyHistory(
        applied.rows,
        readMigrationFiles({ migrationsFolder: folder })
      );
    }
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
