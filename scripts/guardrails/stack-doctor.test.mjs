import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const pnpmPattern = /pnpm .*package.json/;
const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
test("stack doctor recognizes manifest pnpm and names all documented web ports", () => {
  const result = spawnSync(
    "bash",
    [".claude/skills/stack-doctor/scripts/check.sh"],
    { cwd: root, encoding: "utf8", timeout: 60_000 }
  );
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, pnpmPattern);
  for (const app of ["gaa-admin", "docs", "cms", "elections", "events"])
    assert.match(result.stdout, new RegExp(`${app} (listening|not reachable)`));
});
