import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { fileURLToPath } from "node:url";
import pg from "pg";

const adminUrl = process.env.STORAGE_TEST_POSTGRES_URL;
const directory = fileURLToPath(new URL("../", import.meta.url));
function migrate(environment, expectedFailure = false) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["scripts/migrate.mjs"], {
      cwd: directory,
      env: { ...process.env, ...environment },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    const capture = (chunk) => {
      output += chunk.toString();
    };
    child.stdout.on("data", capture);
    child.stderr.on("data", capture);
    child.on("error", reject);
    child.on("close", (code) => {
      const redacted = output
        .replaceAll(environment.DATABASE_URL, "[DATABASE_URL]")
        .replaceAll(environment.PAYLOAD_SECRET, "[PAYLOAD_SECRET]")
        .replace(/postgres(?:ql)?:\/\/[^\s"']+/g, "[DATABASE_URL]");
      if (code !== 0 && !expectedFailure) console.error(redacted);
      resolve(code);
    });
  });
}

test("CMS fresh and repeated migrations preserve data and reject schema-push history", {
  skip: !adminUrl,
  timeout: 90_000,
}, async () => {
  const admin = new pg.Client({
    connectionString: adminUrl,
    connectionTimeoutMillis: 5000,
  });
  await admin.connect();
  const name = `storage_test_cms_${randomUUID().replaceAll("-", "")}`;
  const url = new URL(adminUrl);
  url.pathname = `/${name}`;
  const environment = {
    DATABASE_URL: url.toString(),
    CMS_DB_NAME: name,
    PAYLOAD_SECRET: "integration-only-placeholder-not-for-runtime-use",
  };
  try {
    await admin.query(`CREATE DATABASE "${name}"`);
    const client = new pg.Client({ connectionString: url.toString() });
    try {
      await client.connect();
      assert.equal(await migrate(environment), 0, "fresh CMS migration");
      await client.query(
        "INSERT INTO users(fastapi_user_id, username, email, role) VALUES ('test-id', 'editor', 'editor@example.test', 'editor')"
      );
      assert.equal(await migrate(environment), 0, "repeated CMS migration");
      assert.equal(
        (await client.query("SELECT count(*)::int AS count FROM users")).rows[0]
          .count,
        1
      );
      assert.equal(
        (
          await client.query(
            "SELECT count(*)::int AS count FROM payload_migrations"
          )
        ).rows[0].count,
        1
      );
      await client.query(
        "INSERT INTO payload_migrations(name, batch) VALUES ('dev', -1)"
      );
      assert.notEqual(
        await migrate(environment, true),
        0,
        "schema push adoption must be explicit"
      );
      assert.equal(
        (await client.query("SELECT count(*)::int AS count FROM users")).rows[0]
          .count,
        1
      );
    } finally {
      await client.end();
      await admin.query(`DROP DATABASE "${name}"`);
    }
  } finally {
    await admin.end();
  }
});
