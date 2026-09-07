import { fileURLToPath } from "node:url";
import { readMigrationFiles } from "drizzle-orm/migrator";
import pg from "pg";
import { databaseConfig } from "./database-config.mjs";

for (const domain of ["wxwatch", "wxproducts", "transport", "janitorial"]) {
  const pool = new pg.Pool(databaseConfig(domain));
  try {
    const migrations = readMigrationFiles({
      migrationsFolder: fileURLToPath(
        new URL(`../drizzle/${domain}/`, import.meta.url)
      ),
    });
    const actual = await pool.query(
      "SELECT hash FROM drizzle.__drizzle_migrations ORDER BY created_at"
    );
    if (
      actual.rows.length !== migrations.length ||
      actual.rows.some((row, index) => row.hash !== migrations[index].hash)
    ) {
      throw new Error(
        `${domain}: migration history differs from committed migrations`
      );
    }
    if (["transport", "janitorial"].includes(domain)) {
      const baseline = await pool.query(
        "SELECT 1 FROM baseline_step WHERE key = $1",
        [`${domain}-v1`]
      );
      if (!baseline.rowCount)
        throw new Error(`${domain}: catalogue baseline missing`);
    }
    console.log(`${domain}: migrations and required baseline verified`);
  } finally {
    await pool.end();
  }
}
