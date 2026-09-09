import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
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

for (const environment of ["staging", "production"]) {
  for (const failure of [
    "migration",
    "images",
    "backup",
    "revision",
    "environment",
    "none",
  ]) {
    test(`${environment} core delivery enforces gates: ${failure}`, () => {
      const root = mkdtempSync(join(tmpdir(), "core-delivery-"));
      try {
        for (const dir of [
          "scripts/production",
          "infra/docker/runtime",
          "bin",
          "locks",
        ])
          mkdirSync(join(root, dir), { recursive: true });
        copyFileSync(
          new URL("./core.sh", import.meta.url),
          join(root, "scripts/production/core.sh")
        );
        writeFileSync(
          join(root, "bin/python3"),
          `#!/bin/bash
printf 'python %s\\n' "$*" >> "$TEST_LOG"
case "$1" in
  *render-env.py) touch runtime/.env.local ;;
  *backup-core.py)
    [[ "$TEST_FAILURE" != backup ]] || exit 1
    if [[ -n "$GITHUB_OUTPUT" ]]; then echo cms_missing=false > "$GITHUB_OUTPUT"; fi ;;
  -c) echo staging.example.test ;;
esac
`,
          { mode: 0o700 }
        );
        writeFileSync(
          join(root, "bin/docker"),
          `#!/bin/bash
printf 'docker %s\\n' "$*" >> "$TEST_LOG"
case "$*" in
  *"config --images"*)
    [[ "$TEST_FAILURE" != images ]] || exit 1
    echo ghcr.io/example/api@sha256:abc ;;
  *"image inspect"*)
    if [[ "$*" == *gd.barrels.environment* ]]; then if [[ "$TEST_FAILURE" == environment ]]; then echo wrong; else echo "$DEPLOY_ENV"; fi; elif [[ "$TEST_FAILURE" == revision ]]; then echo wrong; else echo "$GITHUB_SHA"; fi ;;
  *"run --rm --no-deps web-migrate"*) [[ "$TEST_FAILURE" != migration ]] || exit 1 ;;
esac
exit 0
`,
          { mode: 0o700 }
        );
        writeFileSync(
          join(root, "bin/node"),
          '#!/bin/bash\n[[ "$*" != *smoke.mjs* ]] || echo smoke >> "$TEST_LOG"\n',
          { mode: 0o700 }
        );
        const result = spawnSync(
          "bash",
          [join(root, "scripts/production/core.sh"), "deploy"],
          {
            env: {
              ...process.env,
              PATH: `${join(root, "bin")}:${process.env.PATH}`,
              DEPLOY_ENV: environment,
              COMPOSE_PROJECT: "test",
              CORE_LOCK_DIR: join(root, "locks"),
              GITHUB_SHA: "a".repeat(40),
              GHCR_TOKEN: "test",
              GITHUB_ACTOR: "test",
              GITHUB_STEP_SUMMARY: join(root, "summary"),
              GITHUB_OUTPUT: "",
              TEST_FAILURE: failure,
              TEST_LOG: join(root, "calls"),
            },
            encoding: "utf8",
            timeout: 10_000,
          }
        );
        const calls = readFileSync(join(root, "calls"), "utf8");
        const succeeds = failure === "none" || failure === "backup";
        assert.equal(result.status === 0, succeeds, result.stderr);
        assert.equal(calls.includes("backup-core.py"), false);
        assert.equal(calls.includes("backup-files.py"), false);
        assert.equal(calls.includes("--wait-timeout 180 api worker"), succeeds);
        assert.equal(calls.includes("smoke"), succeeds);
        assert.ok(calls.includes("logout"));
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    });
  }
}
