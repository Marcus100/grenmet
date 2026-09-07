import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import test from "node:test";
import { fileURLToPath } from "node:url";

const require = createRequire(
  new URL("../../apps/web/gaa-admin/package.json", import.meta.url)
);
const { Client } = require("pg");
const adminUrl = process.env.STORAGE_TEST_POSTGRES_URL;
const hasPsql = spawnSync("psql", ["--version"]).status === 0;
const required = process.env.RUNTIME_ROLE_TEST_REQUIRED === "true";

test("isolated API runtime grants preserve edits, cover new tables and reject elevated roles", {
  skip: !(required || (adminUrl && hasPsql)),
  timeout: 60_000,
}, async () => {
  assert.ok(adminUrl && hasPsql, "test requires PostgreSQL admin URL and psql");
  const url = new URL(adminUrl);
  const suffix = randomUUID().replaceAll("-", "");
  const database = `storage_test_runtime_${suffix}`;
  const role = `runtime_test_${suffix}`;
  const password = randomUUID();
  const admin = new Client({
    connectionString: adminUrl,
    connectionTimeoutMillis: 5000,
  });
  await admin.connect();
  let created = false;
  try {
    await admin.query(`CREATE DATABASE "${database}"`);
    created = true;
    url.pathname = `/${database}`;
    const owner = new Client({ connectionString: url.toString() });
    await owner.connect();
    try {
      await owner.query(
        'CREATE SCHEMA hr; CREATE TABLE hr.department(id serial PRIMARY KEY); CREATE TABLE "user"(id serial PRIMARY KEY); CREATE TABLE alembic_version(version_num text)'
      );
      const run = () =>
        spawnSync(
          "bash",
          [
            fileURLToPath(
              new URL(
                "../../infra/postgres/grant-api-runtime.sh",
                import.meta.url
              )
            ),
          ],
          {
            env: {
              ...process.env,
              POSTGRES_USER: decodeURIComponent(url.username),
              POSTGRES_DB: database,
              PGPASSWORD: decodeURIComponent(url.password),
              PGHOST: url.hostname,
              PGPORT: url.port || "5432",
              FASTAPI_DB_USER: role,
              FASTAPI_DB_PASSWORD: password,
            },
            encoding: "utf8",
            timeout: 15_000,
          }
        );
      assert.equal(run().status, 0, "fresh role and schema access");
      const runtimeUrl = new URL(url);
      runtimeUrl.username = role;
      runtimeUrl.password = password;
      const runtime = new Client({ connectionString: runtimeUrl.toString() });
      await runtime.connect();
      try {
        await runtime.query('INSERT INTO "user" DEFAULT VALUES');
        assert.equal(run().status, 0, "repeat grants");
        assert.equal(
          (await runtime.query('SELECT count(*)::int AS count FROM "user"'))
            .rows[0].count,
          1
        );
        await assert.rejects(
          runtime.query("CREATE TABLE hr.forbidden(id integer)"),
          { code: "42501" }
        );
        await assert.rejects(runtime.query("DELETE FROM alembic_version"), {
          code: "42501",
        });
        await owner.query(
          "CREATE SCHEMA future; CREATE TABLE future.records(id serial PRIMARY KEY)"
        );
        await runtime.query("INSERT INTO future.records DEFAULT VALUES");
        await owner.query(`ALTER ROLE "${role}" CREATEDB`);
        assert.notEqual(
          run().status,
          0,
          "existing elevated role must be rejected"
        );
      } finally {
        await runtime.end();
      }
    } finally {
      await owner.end();
    }
  } finally {
    if (created) await admin.query(`DROP DATABASE "${database}"`);
    await admin.query(`DROP ROLE IF EXISTS "${role}"`);
    await admin.end();
  }
});
