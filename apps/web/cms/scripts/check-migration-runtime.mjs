import assert from "node:assert/strict";
import { readdir } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import payload from "payload";
import { findConfig } from "payload/node";

// Run through Payload's CLI so its own TypeScript loader and config discovery
// are exercised. No database connection or application onInit hook is allowed.
const config = await (await import(pathToFileURL(findConfig()).href)).default;
try {
  await payload.init({ config, disableDBConnect: true, disableOnInit: true });
  assert.equal(typeof payload.db.migrate, "function");
  const directory = payload.db.migrationDir;
  assert.ok(directory, "Migration directory must be configured");
  const files = (await readdir(directory)).filter(
    (file) => file.endsWith(".ts") && file !== "index.ts"
  );
  assert.ok(files.length > 0, "Migration files must be packaged");
  for (const file of files) {
    const migration = await import(pathToFileURL(`${directory}/${file}`).href);
    assert.equal(typeof migration.up, "function", `${file}: missing up`);
    assert.equal(typeof migration.down, "function", `${file}: missing down`);
  }
  console.log(
    "CMS migration runtime verified: config, adapter and migration modules"
  );
} finally {
  await payload.destroy();
}
