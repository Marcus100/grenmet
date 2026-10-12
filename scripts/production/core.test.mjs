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
const SECRET_MARKER = "ci-secret-marker-must-not-leak";
const RUNNER_DISK_ERROR =
  /Not enough free disk space for the runner: 1 GB free/;

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
      "runner-temp",
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
  *"up -d --no-deps --remove-orphans --wait"*) [[ "$TEST_FAILURE" != readiness ]] || exit 1 ;;
  "ps -aq --filter label=com.docker.compose.project=test")
    [[ -z "$TEST_DIAGNOSTIC_HANG" ]] || exec sleep 30
    printf 'c1\\nc2\\n' ;;
  "inspect --format"*"restarts="*) printf '/test-nhc-worker-1 status=running health=unhealthy exit=0 restarts=0 oom=false\\n/test-api-1 status=running health=healthy exit=0 restarts=0 oom=false\\n' ;;
  "inspect --format"*"Health.Log"*) echo "2026-10-12T21:05:00Z exit=1 heartbeat missing" ;;
  "inspect --format"*" c1") echo "/test-nhc-worker-1 running unhealthy 0" ;;
  "inspect --format"*" c2") echo "/test-api-1 running healthy 0" ;;
  "inspect "*) echo "SECRET_KEY=$SECRET_KEY" ;;
  "logs --tail 200 c1") echo "nhc worker log line" ;;
  "logs --tail"*) echo "unexpected log for healthy service" ;;
esac
exit 0
`,
      { mode: 0o700 }
    );
    writeFileSync(
      join(root, "bin/df"),
      `#!/bin/bash
printf 'Filesystem 1024-blocks Used Available Capacity Mounted on\\n'
free=$TEST_FREE_KB
[[ "$*" != *"$RUNNER_TEMP"* ]] || free=$TEST_RUNNER_FREE_KB
printf '/dev/test 50000000 1000 %s 10%% /\\n' "$free"
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
          TEST_RUNNER_FREE_KB: String(ENOUGH_FREE_KB),
          RUNNER_TEMP: join(root, "runner-temp"),
          SECRET_KEY: SECRET_MARKER,
          DIAGNOSTIC_TIMEOUT: "2",
          TEST_LOG: join(root, "calls"),
          ...extraEnv,
        },
        encoding: "utf8",
        timeout: 10_000,
      }
    );
    return {
      result,
      calls: readFileSync(join(root, "calls"), "utf8"),
      summary: readFileSync(join(root, "summary"), "utf8"),
    };
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

const PHASE_GROUP = /::group::\[\d{2}:\d{2}:\d{2}Z\] render-config/;
const FAILED_START = /failed in phase 'start' \(last completed: grants\)/;
const FAILED_MIGRATIONS =
  /failed in phase 'migrations' \(last completed: databases\)/;
const PARTIAL_RELEASE = /a partial release may be running/;
const UNHEALTHY_STATE = /test-nhc-worker-1 status=running health=unhealthy/;
const HEALTH_PROBE = /exit=1 heartbeat missing/;
const DIAGNOSTICS_INCOMPLETE = /Diagnostics incomplete/;
const SUMMARY_FAILED_START =
  /Core delivery failed[\s\S]*\| start \| \d+s \| failed \|/;
const SUMMARY_SUCCEEDED =
  /Core delivery succeeded[\s\S]*\| render-config \| \d+s \| ok \|[\s\S]*\| smoke \| \d+s \| ok \|/;

test("deploy groups timestamped phases and summarises their durations", () => {
  const { result, summary } = runDeploy({ environment: "staging" });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, PHASE_GROUP);
  assert.match(summary, SUMMARY_SUCCEEDED);
  assert.equal(result.stdout.includes("Failure diagnostics"), false);
});

test("an unhealthy service reports its phase, health probes and only its own logs", () => {
  const { result, calls, summary } = runDeploy({
    environment: "staging",
    failure: "readiness",
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stdout, FAILED_START);
  assert.match(result.stdout, PARTIAL_RELEASE);
  assert.match(result.stdout, UNHEALTHY_STATE);
  assert.match(result.stdout, HEALTH_PROBE);
  assert.ok(result.stdout.includes("nhc worker log line"));
  assert.equal(result.stdout.includes("unexpected log"), false);
  assert.match(summary, SUMMARY_FAILED_START);
  assert.ok(calls.includes("logout"), "credentials are still cleaned up");
});

test("a failed migration names the migrations phase", () => {
  const { result } = runDeploy({
    environment: "production",
    failure: "migration",
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stdout, FAILED_MIGRATIONS);
});

test("a hanging diagnostic keeps the original exit status and still cleans up", () => {
  const started = Date.now();
  const { result, calls } = runDeploy({
    environment: "staging",
    failure: "readiness",
    extraEnv: { TEST_DIAGNOSTIC_HANG: "1" },
  });
  assert.ok(Date.now() - started < 9000, "diagnostics must be time-bounded");
  assert.equal(result.status, 1);
  assert.match(result.stdout, DIAGNOSTICS_INCOMPLETE);
  assert.match(result.stdout, FAILED_START);
  assert.ok(calls.includes("logout"));
});

test("diagnostics never print secrets from the container environment", () => {
  const { result, summary } = runDeploy({
    environment: "staging",
    failure: "readiness",
  });
  for (const output of [result.stdout, result.stderr, summary])
    assert.equal(output.includes(SECRET_MARKER), false);
});

test("deploy stops before pruning or pulling when the runner disk is full", () => {
  const { result, calls } = runDeploy({
    environment: "staging",
    extraEnv: { TEST_RUNNER_FREE_KB: String(1024 * 1024) },
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, RUNNER_DISK_ERROR);
  for (const forbidden of ["image prune", " pull", " up -d"])
    assert.equal(
      calls.includes(forbidden),
      false,
      `must not run: ${forbidden}`
    );
  assert.equal(result.stdout.includes("Failure diagnostics"), false);
});

test("deploy retires containers of services removed from the deployment file", () => {
  const { result, calls } = runDeploy({ environment: "staging" });
  assert.equal(result.status, 0, result.stderr);
  assert.ok(calls.includes("up -d --no-deps --remove-orphans --wait"));
});
