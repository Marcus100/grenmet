import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const INVALID_MODE = /Expected backend, storage or release/;
const cwd = fileURLToPath(new URL("../../", import.meta.url));
for (const [script, missing] of [
  ["backend", "POSTGRES_SERVER"],
  ["storage", "STORAGE_TEST_POSTGRES_URL"],
]) {
  test(`${script} rejects missing infrastructure rather than skipping`, () => {
    const env = { ...process.env };
    delete env[missing];
    const result = spawnSync("bash", [`scripts/verification/${script}.sh`], {
      cwd,
      env,
      encoding: "utf8",
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, new RegExp(missing));
  });
}
test("managed verifier rejects unknown operations before provisioning", () => {
  const result = spawnSync(
    process.execPath,
    ["scripts/verification/run.mjs", "deploy"],
    { cwd, encoding: "utf8" }
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, INVALID_MODE);
});
