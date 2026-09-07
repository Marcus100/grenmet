import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const sha = "a".repeat(40);
function validate(environment, ref, options = {}) {
  const directory = mkdtempSync(join(tmpdir(), "delivery-ref-"));
  try {
    writeFileSync(
      join(directory, "git"),
      `#!/bin/sh\nexit ${options.ancestor === false ? 1 : 0}\n`
    );
    writeFileSync(
      join(directory, "gh"),
      `#!/bin/sh\necho ${options.published === false ? "false" : "true"}\n`
    );
    chmodSync(join(directory, "git"), 0o700);
    chmodSync(join(directory, "gh"), 0o700);
    return spawnSync("bash", ["scripts/production/validate-ref.sh"], {
      env: {
        ...process.env,
        PATH: `${directory}:${process.env.PATH}`,
        DEPLOY_ENV: environment,
        GITHUB_REF: ref,
        GITHUB_REF_NAME: ref.split("/").at(-1),
        GITHUB_SHA: sha,
        INPUT_TAG: options.image ?? `sha-${sha}`,
      },
      encoding: "utf8",
    }).status;
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}
test("staging accepts its branch and rejects PR/development refs", () => {
  assert.equal(validate("staging", "refs/heads/staging"), 0);
  assert.notEqual(validate("staging", "refs/pull/4/merge"), 0);
  assert.notEqual(validate("staging", "refs/heads/dev"), 0);
});
test("production requires a published version tag reachable from main", () => {
  assert.equal(validate("production", "refs/tags/v1.0"), 0);
  assert.notEqual(validate("production", "refs/heads/main"), 0);
  assert.notEqual(
    validate("production", "refs/tags/v1.0", { ancestor: false }),
    0
  );
  assert.notEqual(
    validate("production", "refs/tags/v1.0", { published: false }),
    0
  );
});
test("rejects mutable or mismatched image tags and unknown environments", () => {
  assert.notEqual(
    validate("staging", "refs/heads/staging", { image: "staging" }),
    0
  );
  assert.notEqual(
    validate("staging", "refs/heads/staging", {
      image: `sha-${"b".repeat(40)}`,
    }),
    0
  );
  assert.notEqual(validate("preview", "refs/heads/staging"), 0);
});
