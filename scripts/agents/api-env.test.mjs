import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const SCRIPT = fileURLToPath(new URL("./api-env.sh", import.meta.url));
const USAGE = /usage: scripts\/agents\/api-env\.sh/;

function run(args, env = {}) {
  const base = { ...process.env };
  for (const key of [
    "PROJECT_NAME",
    "FIRST_SUPERUSER",
    "POSTGRES_USER",
    "POSTGRES_SERVER",
  ])
    delete base[key];
  return spawnSync("bash", [SCRIPT, ...args], {
    encoding: "utf8",
    env: { ...base, ...env },
  });
}

test("sets the settings a fresh worktree is missing", () => {
  const result = run([
    "printenv",
    "PROJECT_NAME",
    "FIRST_SUPERUSER",
    "POSTGRES_USER",
    "POSTGRES_SERVER",
  ]);
  assert.equal(result.status, 0);
  assert.deepEqual(result.stdout.trim().split("\n"), [
    "Barrels Grenada",
    "admin@example.com",
    "app",
    "host.docker.internal",
  ]);
});

test("values already in the environment win", () => {
  const result = run(["printenv", "POSTGRES_SERVER"], {
    POSTGRES_SERVER: "localhost",
  });
  assert.equal(result.stdout.trim(), "localhost");
});

test("passes the command's exit status through", () => {
  assert.equal(run(["bash", "-c", "exit 3"]).status, 3);
});

test("refuses to run without a command", () => {
  const result = run([]);
  assert.equal(result.status, 2);
  assert.match(result.stderr, USAGE);
});
