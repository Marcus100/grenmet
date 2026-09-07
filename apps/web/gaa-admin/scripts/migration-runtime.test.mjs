import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { readMigrationFiles } from "drizzle-orm/migrator";

// Run in the built image as well as the source checkout. Each entrypoint must
// load its real dependencies/assets and reach configuration validation. Empty
// domain URLs prevent database access even if the parent has live credentials.
const environment = { ...process.env };
for (const domain of ["WXWATCH", "WXPRODUCTS", "TRANSPORT", "JANITORIAL"]) {
  environment[`${domain}_DATABASE_URL`] = "";
}
for (const [script, domain] of [
  ["migrate-wxwatch", "WXWATCH"],
  ["migrate-wxproducts", "WXPRODUCTS"],
  ["migrate-transport", "TRANSPORT"],
  ["migrate-janitorial", "JANITORIAL"],
  ["seed-transport", "TRANSPORT"],
  ["seed-janitorial", "JANITORIAL"],
  ["verify-databases", "WXWATCH"],
]) {
  test(`${script} loads in the migration runtime and rejects missing configuration`, () => {
    const result = spawnSync(
      process.execPath,
      [fileURLToPath(new URL(`./${script}.mjs`, import.meta.url))],
      { env: environment, encoding: "utf8", timeout: 10_000 }
    );
    assert.ifError(result.error);
    assert.equal(result.status, 1);
    assert.ok(
      result.stderr.includes(`${domain}_DATABASE_URL is required`),
      result.stderr
    );
  });
}

for (const domain of ["wxwatch", "wxproducts", "transport", "janitorial"]) {
  test(`${domain} migration journal and SQL files are packaged`, () => {
    const migrations = readMigrationFiles({
      migrationsFolder: fileURLToPath(
        new URL(`../drizzle/${domain}/`, import.meta.url)
      ),
    });
    assert.ok(migrations.length > 0);
    assert.ok(migrations.every((migration) => migration.sql.length > 0));
  });
}
