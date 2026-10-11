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

const ENOUGH_FREE_KB = 40 * 1024 * 1024;
const RECLAIMED_LINE = /Total reclaimed space: 1\.2GB/;
const FREE_DISK_LINE =
  /Free disk space on \/var\/lib\/docker: 40 GB \(need 6 GB\)/;
const LOW_DISK_ERROR = /Not enough free disk space to pull images: 2 GB free/;
const STACK_UNTOUCHED = /the running stack was not touched/;
const OVERRIDE_ERROR = /10 GB free.*12 GB required/;

/** Runs the real core.sh deploy in a temp tree with stubbed docker, python3, node and df. */
function runDeploy({
  environment,
  failure = "none",
  freeKb = ENOUGH_FREE_KB,
  extraEnv = {},
}) {
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
  *"login"*"--password-stdin"*) cat > /dev/null ;;
  "info --format"*) echo /var/lib/docker ;;
  *"image prune"*) echo "Total reclaimed space: 1.2GB" ;;
  *"config --images"*)
    [[ "$TEST_FAILURE" != images ]] || exit 1
    echo ghcr.io/example/api@sha256:abc ;;
  *"image inspect"*)
    if [[ "$*" == *gd.barrels.environment* ]]; then if [[ "$TEST_FAILURE" == environment ]]; then echo wrong; else echo "$DEPLOY_ENV"; fi; elif [[ "$TEST_FAILURE" == revision ]]; then echo wrong; else echo "$GITHUB_SHA"; fi ;;
  *"run --rm --no-deps prestart"*) [[ "$TEST_FAILURE" != migration ]] || exit 1 ;;
  *"up -d --no-deps --wait"*) [[ "$TEST_FAILURE" != readiness ]] || exit 1 ;;
esac
exit 0
`,
      { mode: 0o700 }
    );
    writeFileSync(
      join(root, "bin/df"),
      `#!/bin/bash
printf 'Filesystem 1024-blocks Used Available Capacity Mounted on\\n'
printf '/dev/test 50000000 1000 %s 10%% /\\n' "$TEST_FREE_KB"
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
          // Exceed a pipe buffer so a login mock that ignores stdin fails reliably.
          GHCR_TOKEN: "t".repeat(128 * 1024 - 100),
          GITHUB_ACTOR: "test",
          GITHUB_STEP_SUMMARY: join(root, "summary"),
          GITHUB_OUTPUT: "",
          TEST_FAILURE: failure,
          TEST_FREE_KB: String(freeKb),
          TEST_LOG: join(root, "calls"),
          ...extraEnv,
        },
        encoding: "utf8",
        timeout: 10_000,
      }
    );
    return { result, calls: readFileSync(join(root, "calls"), "utf8") };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

for (const environment of ["staging", "production"]) {
  for (const failure of [
    "migration",
    "images",
    "backup",
    "revision",
    "environment",
    "readiness",
    "none",
  ]) {
    test(`${environment} core delivery enforces gates: ${failure}`, () => {
      const { result, calls } = runDeploy({ environment, failure });
      const succeeds = failure === "none" || failure === "backup";
      assert.equal(
        result.status === 0,
        succeeds,
        `status=${result.status} signal=${result.signal} error=${result.error?.message ?? "none"}\n${result.stdout}\n${result.stderr}\n${calls}`
      );
      assert.equal(calls.includes("backup-core.py"), false);
      assert.equal(calls.includes("backup-files.py"), false);
      assert.equal(
        calls.includes("--wait-timeout 300 api worker"),
        succeeds || failure === "readiness"
      );
      assert.equal(calls.includes("smoke"), succeeds);
      assert.ok(calls.includes("logout"));
    });
  }

  test(`${environment} deploy prunes old unused images before it pulls`, () => {
    const { result, calls } = runDeploy({ environment });
    assert.equal(result.status, 0, `${result.stderr}\n${calls}`);
    const prune = calls.indexOf(
      "docker image prune --all --force --filter until=72h"
    );
    const pull = calls.indexOf(" pull");
    assert.ok(prune >= 0, "expected an image prune");
    assert.ok(pull > prune, "the prune must come before the pull");
    assert.match(result.stdout, RECLAIMED_LINE);
    assert.match(result.stdout, FREE_DISK_LINE);
  });

  test(`${environment} deploy stops before pulling when disk space is low`, () => {
    // 2 GB free, 6 GB required: fail before any pull, migration or restart.
    const { result, calls } = runDeploy({
      environment,
      freeKb: 2 * 1024 * 1024,
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, LOW_DISK_ERROR);
    assert.match(result.stderr, STACK_UNTOUCHED);
    assert.ok(
      calls.includes("docker image prune"),
      "should try to reclaim space first"
    );
    for (const forbidden of [" pull", " up -d", "run --rm", "smoke"]) {
      assert.equal(
        calls.includes(forbidden),
        false,
        `must not run: ${forbidden}`
      );
    }
    assert.ok(calls.includes("logout"), "credentials are still cleaned up");
  });

  test(`${environment} deploy honours the DEPLOY_MIN_FREE_GB and IMAGE_PRUNE_AGE overrides`, () => {
    const low = runDeploy({
      environment,
      freeKb: 10 * 1024 * 1024,
      extraEnv: { DEPLOY_MIN_FREE_GB: "12", IMAGE_PRUNE_AGE: "24h" },
    });
    assert.notEqual(low.result.status, 0);
    assert.match(low.result.stderr, OVERRIDE_ERROR);
    assert.ok(low.calls.includes("until=24h"));
    const ok = runDeploy({
      environment,
      freeKb: 10 * 1024 * 1024,
      extraEnv: { DEPLOY_MIN_FREE_GB: "8" },
    });
    assert.equal(ok.result.status, 0, ok.result.stderr);
  });
}
