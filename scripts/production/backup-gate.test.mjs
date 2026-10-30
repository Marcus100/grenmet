import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const SCRIPT = new URL("./backup-gate.py", import.meta.url).pathname;
const DATABASES = [
  "app_prod",
  "wxwatch",
  "wxproducts",
  "janitorial",
  "transport",
  "eregister",
  "events",
];
const FRESH_LINE = /app_prod: newest backup 3\.\dh old/u;
const STALE_LINE = /app_prod: newest backup 40\.\dh old \(limit 26h\)/u;
const WXWATCH_STALE = /wxwatch: .*limit/u;
const NO_DUMP = /app_prod: no backup found/u;
const NO_CREDS = /not available to the deploy runner \(missing: bucket name/u;
const LIST_FAILED = /listing the backup bucket failed \(aws exit 255\)/u;
const STAGING_NOTE = /staging: not checked/u;
const SECRET = "gate-secret-marker-must-not-leak";

function stamp(date) {
  const p = (n) => String(n).padStart(2, "0");
  return `${date.getUTCFullYear()}${p(date.getUTCMonth() + 1)}${p(date.getUTCDate())}_${p(date.getUTCHours())}${p(date.getUTCMinutes())}${p(date.getUTCSeconds())}`;
}

function keysFor(ageHours, names = DATABASES) {
  const when = new Date(Date.now() - ageHours * 3_600_000);
  const day = `${when.getUTCFullYear()}/${String(when.getUTCMonth() + 1).padStart(2, "0")}/${String(when.getUTCDate()).padStart(2, "0")}`;
  return names.map((name) => `production/${day}/${name}_${stamp(when)}.dump`);
}

/** Runs backup-gate.py with a fake `aws` that lists the given keys (or fails). */
function runGate({ keys = [], awsFails = false, env = {}, creds = true }) {
  const dir = mkdtempSync(join(tmpdir(), "backup-gate-"));
  try {
    const aws = join(dir, "aws");
    writeFileSync(
      aws,
      `#!/bin/bash
${awsFails ? `echo "https://secret-endpoint.example ${SECRET}" >&2; exit 255` : ""}
# Every daily prefix returns the same listing; the gate only needs the newest key.
printf '%s' '${JSON.stringify(keys)}'
`
    );
    chmodSync(aws, 0o700);
    const result = spawnSync("python3", ["-I", SCRIPT, "production"], {
      env: {
        PATH: `${dir}:${process.env.PATH}`,
        ...(creds
          ? {
              BACKUP_GATE_BUCKET: "bucket",
              BACKUP_GATE_ENDPOINT: "https://spaces.example",
              BACKUP_GATE_ACCESS_KEY_ID: "id",
              BACKUP_GATE_SECRET_ACCESS_KEY: SECRET,
            }
          : {}),
        ...env,
      },
      encoding: "utf8",
    });
    return result;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("fresh backups of every required database pass", () => {
  const result = runGate({ keys: keysFor(3) });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, FRESH_LINE);
});

test("a backup older than the limit is stale (exit 10) and names the database", () => {
  const stale = keysFor(40, ["app_prod"]);
  const result = runGate({
    keys: [...keysFor(3, DATABASES.slice(1)), ...stale],
  });
  assert.equal(result.status, 10, result.stdout + result.stderr);
  assert.match(result.stdout, STALE_LINE);
  assert.doesNotMatch(result.stdout, WXWATCH_STALE);
});

test("DEPLOY_BACKUP_MAX_AGE_HOURS changes the limit", () => {
  const keys = keysFor(30);
  assert.equal(runGate({ keys }).status, 10);
  assert.equal(
    runGate({ keys, env: { DEPLOY_BACKUP_MAX_AGE_HOURS: "48" } }).status,
    0
  );
});

test("a required database with no dump at all is stale", () => {
  const result = runGate({ keys: keysFor(3, DATABASES.slice(1)) });
  assert.equal(result.status, 10);
  assert.match(result.stdout, NO_DUMP);
});

test("missing credentials fail open (exit 11) naming what is missing", () => {
  const result = runGate({ creds: false });
  assert.equal(result.status, 11);
  assert.match(result.stdout, NO_CREDS);
});

test("an unreadable store is unverified (exit 11) and leaks no secrets", () => {
  const result = runGate({ awsFails: true });
  assert.equal(result.status, 11);
  assert.match(result.stdout, LIST_FAILED);
  const output = result.stdout + result.stderr;
  assert.equal(output.includes(SECRET), false);
  assert.equal(output.includes("secret-endpoint"), false);
});

test("an invalid age limit is unverified, not silently ignored", () => {
  const result = runGate({
    keys: keysFor(3),
    env: { DEPLOY_BACKUP_MAX_AGE_HOURS: "soon" },
  });
  assert.equal(result.status, 11);
});

test("staging is reported as not checked, not as fresh evidence", () => {
  const result = spawnSync("python3", ["-I", SCRIPT, "staging"], {
    env: { PATH: process.env.PATH },
    encoding: "utf8",
  });
  assert.equal(result.status, 0);
  assert.match(result.stdout, STAGING_NOTE);
});
