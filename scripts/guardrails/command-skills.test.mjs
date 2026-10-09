import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
test("every canonical command has a synchronized portable skill", () => {
  const result = spawnSync(
    process.execPath,
    ["scripts/guardrails/sync-command-skills.mjs", "--check"],
    { cwd: root, encoding: "utf8" }
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
});
