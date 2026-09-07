import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { fileURLToPath } from "node:url";
import pg from "pg";

const adminUrl = process.env.STORAGE_TEST_POSTGRES_URL;
const scripts = fileURLToPath(new URL("./", import.meta.url));

function run(script, environment) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [`${scripts}${script}.mjs`], {
      env: { ...process.env, ...environment },
      stdio: ["ignore", "pipe", "pipe"],
    });
    // Database errors can include user data; report only the script and exit code.
    child.stdout.resume();
    child.stderr.resume();
    child.on("error", reject);
    child.on("exit", (code) => resolve(code));
  });
}

test("fresh/repeat initialization, concurrent migrations, conflicting data and wrong target", {
  skip: !adminUrl,
  timeout: 120_000,
}, async () => {
  const admin = new pg.Client({
    connectionString: adminUrl,
    connectionTimeoutMillis: 5000,
  });
  await admin.connect();
  try {
    for (const domain of ["wxwatch", "wxproducts", "transport", "janitorial"]) {
      const name = `storage_test_${domain}_${randomUUID().replaceAll("-", "")}`;
      const url = new URL(adminUrl);
      url.pathname = `/${name}`;
      const environment = {
        ENVIRONMENT: "local",
        [`${domain.toUpperCase()}_DB_NAME`]: name,
        [`${domain.toUpperCase()}_DATABASE_URL`]: url.toString(),
      };
      await admin.query(`CREATE DATABASE "${name}"`);
      const client = new pg.Client({ connectionString: url.toString() });
      try {
        await client.connect();
        // Two real runners race on a fresh DB; the shared session lock must serialize them.
        const exits = await Promise.all([
          run(`migrate-${domain}`, environment),
          run(`migrate-${domain}`, environment),
        ]);
        assert.deepEqual(exits, [0, 0], `${domain}: concurrent migrations`);
        assert.equal(await run(`migrate-${domain}`, environment), 0);
        if (["transport", "janitorial"].includes(domain)) {
          // Conflict in a non-root table must still block initialization.
          const orphan = domain === "transport" ? "stops" : "activities";
          await client.query(
            `INSERT INTO "${orphan}" (slug, name) VALUES ('existing', 'Existing verified entry')`
          );
          assert.notEqual(
            await run(`seed-${domain}`, environment),
            0,
            "unmarked data must fail closed"
          );
          assert.equal(
            (
              await client.query(
                `SELECT count(*)::int AS count FROM "${orphan}"`
              )
            ).rows[0].count,
            1
          );
          await client.query(`DELETE FROM "${orphan}"`);
          assert.equal(
            await run(`seed-${domain}`, environment),
            0,
            `${domain}: initial catalogue`
          );
          const root = domain === "transport" ? "routes" : "buildings";
          await client.query(
            `UPDATE "${root}" SET name = 'Verified online edit' WHERE id = (SELECT min(id) FROM "${root}")`
          );
          assert.equal(await run(`seed-${domain}`, environment), 0);
          assert.equal(
            (
              await client.query(
                `SELECT count(*)::int AS count FROM "${root}" WHERE name = 'Verified online edit'`
              )
            ).rows[0].count,
            1
          );
        }
        // A conflicting table makes migration fail on a deliberately empty migration history.
        await client.query("TRUNCATE drizzle.__drizzle_migrations");
        assert.notEqual(
          await run(`migrate-${domain}`, environment),
          0,
          "migration SQL failure must exit nonzero"
        );
        assert.equal(
          (
            await client.query(
              "SELECT count(*)::int AS count FROM drizzle.__drizzle_migrations"
            )
          ).rows[0].count,
          0
        );
        const wrong = {
          ...environment,
          [`${domain.toUpperCase()}_DB_NAME`]: "app_test",
        };
        assert.notEqual(await run(`migrate-${domain}`, wrong), 0);
      } finally {
        await client.end();
        await admin.query(`DROP DATABASE "${name}"`);
      }
    }
  } finally {
    await admin.end();
  }
});
