import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
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

test("authored-product migration upgrades the previous schema and preserves existing records on repeat", {
  skip: !adminUrl,
  timeout: 120_000,
}, async () => {
  const admin = new pg.Client({ connectionString: adminUrl });
  await admin.connect();
  const name = `storage_test_wxproducts_${randomUUID().replaceAll("-", "")}`;
  const url = new URL(adminUrl);
  url.pathname = `/${name}`;
  const directory = mkdtempSync(join(tmpdir(), "wxproducts-prior-schema-"));
  await admin.query(`CREATE DATABASE "${name}"`);
  const client = new pg.Client({ connectionString: url.toString() });
  try {
    await client.connect();
    const migrations = fileURLToPath(
      new URL("../drizzle/wxproducts/", import.meta.url)
    );
    const journal = JSON.parse(
      readFileSync(join(migrations, "meta/_journal.json"), "utf8")
    );
    journal.entries = journal.entries.filter((entry) => entry.idx < 2);
    mkdirSync(join(directory, "meta"));
    writeFileSync(
      join(directory, "meta/_journal.json"),
      JSON.stringify(journal)
    );
    for (const entry of journal.entries)
      copyFileSync(
        join(migrations, `${entry.tag}.sql`),
        join(directory, `${entry.tag}.sql`)
      );
    await migrate(drizzle(client), { migrationsFolder: directory });
    await client.query(
      "INSERT INTO cap_bundles (cap_bundle_id, issued_at_utc) VALUES ('preserved-release-fixture', now())"
    );
    const environment = {
      ENVIRONMENT: "local",
      WXPRODUCTS_DB_NAME: name,
      WXPRODUCTS_DATABASE_URL: url.toString(),
    };
    assert.equal(await run("migrate-wxproducts", environment), 0);
    await client.query(
      "INSERT INTO authored_products (id, kind, draft, revision) VALUES ($1, 'marine', $2, 1)",
      [
        randomUUID(),
        JSON.stringify({ kind: "marine", values: { synopsis: "Saved draft" } }),
      ]
    );
    assert.equal(await run("migrate-wxproducts", environment), 0);
    assert.equal(
      (
        await client.query(
          "SELECT count(*)::int AS n FROM cap_bundles WHERE cap_bundle_id = 'preserved-release-fixture'"
        )
      ).rows[0].n,
      1
    );
    assert.equal(
      (await client.query("SELECT count(*)::int AS n FROM authored_products"))
        .rows[0].n,
      1
    );
    assert.equal(
      (
        await client.query(
          "SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations"
        )
      ).rows[0].n,
      3
    );
  } finally {
    await client.end();
    await admin.query(`DROP DATABASE "${name}"`);
    await admin.end();
    rmSync(directory, { recursive: true, force: true });
  }
});
