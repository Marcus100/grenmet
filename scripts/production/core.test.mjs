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
import {
  appServices,
  dataServices,
  migrationServices,
  routedServices,
} from "../ci/release-scope.mjs";

const ENOUGH_FREE_KB = 40 * 1024 * 1024;
const RECLAIMED_LINE = /Total reclaimed space: 1\.2GB/u;
const FREE_DISK_LINE =
  /Free disk space on \/var\/lib\/docker: 40 GB \(need 6 GB\)/u;
const LOW_DISK_ERROR = /Not enough free disk space to pull images: 2 GB free/u;
const STACK_UNTOUCHED = /the running stack was not touched/u;
const OVERRIDE_ERROR = /10 GB free.*12 GB required/u;
const SECRET_MARKER = "ci-secret-marker-must-not-leak";
const RUNNER_DISK_ERROR =
  /Not enough free disk space for the runner: 1 GB free/u;

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
    // The real release registry supplies the service lists core.sh starts.
    mkdirSync(join(root, "scripts/ci"), { recursive: true });
    for (const file of ["release-scope.mjs", "check-release-scope.mjs"])
      copyFileSync(
        new URL(`../ci/${file}`, import.meta.url),
        join(root, "scripts/ci", file)
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
  *backup-gate.py)
    case "$TEST_GATE" in
      stale) echo "app_prod: newest backup 40.0h old (limit 26h)"; exit 10 ;;
      unreadable) echo "backup store credentials not available to the deploy runner (missing: bucket name)"; exit 11 ;;
      *) echo "app_prod: newest backup 3.0h old" ;;
    esac ;;
  -c) echo staging.example.test ;;
esac
`,
      { mode: 0o700 }
    );
    writeFileSync(
      join(root, "bin/docker"),
      `#!/bin/bash
printf 'docker %s\\n' "$*" >> "$TEST_LOG"
state=$(dirname "$TEST_LOG")
args="$*"
# Rolling starts: each routed service runs old-<service> until a scaled start adds new-<service>.
case "$*" in
  *" ps -aq --status "*)
    service=\${args##* }
    [[ "$service" != "$TEST_STALE_SERVICE" ]] || echo "stale-$service"
    exit 0 ;;
  *" ps -q "*)
    service=\${args##* }
    [[ -n "$TEST_NO_OLD" ]] || echo "old-$service"
    [[ ! -e "$state/scaled-$service" ]] || echo "new-$service"
    exit 0 ;;
  *"--no-recreate --scale "*)
    touch "$state/scaled-\${args##* }"
    exit 0 ;;
  "inspect --format {{if .State.Health}}"*" new-"*)
    if [[ "\${args##*new-}" == "$TEST_UNHEALTHY_SERVICE" ]]; then echo unhealthy; else echo healthy; fi
    exit 0 ;;
esac
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
  # Only the network check reads the lock file as JSON; the release-scope check pipes
  # docker-compose.deploy.yml into a node stub that closes stdin, so printing there
  # would kill the pipe (SIGPIPE).
  *"deploy.lock.yml"*"config --format json"*)
    if [[ -n "$TEST_PINNED_SUBNET" ]]; then printf '{"networks":{"grenmet":{"ipam":{"config":[{"subnet":"%s"}]}}}}\\n' "$TEST_PINNED_SUBNET"; else echo '{}'; fi ;;
  "network inspect"*)
    [[ -n "$TEST_LIVE_SUBNET" ]] || exit 1
    echo "$TEST_LIVE_SUBNET " ;;
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
      `#!/bin/bash
[[ "$*" != *smoke.mjs* ]] || echo smoke >> "$TEST_LOG"
[[ -z "$TEST_NO_MIGRATIONS" || "$*" != *"--print migration"* ]] || exit 0
[[ "$*" != *--print* ]] || exec "${process.execPath}" "$@"
`,
      { mode: 0o700 }
    );
    // Exist even when core.sh exits before calling any tool.
    writeFileSync(join(root, "calls"), "");
    writeFileSync(join(root, "summary"), "");
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
          TEST_GATE: "fresh",
          TEST_FREE_KB: String(freeKb),
          TEST_RUNNER_FREE_KB: String(ENOUGH_FREE_KB),
          RUNNER_TEMP: join(root, "runner-temp"),
          SECRET_KEY: SECRET_MARKER,
          DIAGNOSTIC_TIMEOUT: "2",
          TEST_LOG: join(root, "calls"),
          TEST_NO_OLD: "",
          TEST_STALE_SERVICE: "",
          TEST_UNHEALTHY_SERVICE: "",
          TEST_PINNED_SUBNET: "",
          TEST_LIVE_SUBNET: "",
          ROLLOUT_SETTLE_SECONDS: "0",
          ROLLOUT_POLL_SECONDS: "0",
          ...extraEnv,
        },
        encoding: "utf8",
        timeout: 30_000,
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

const PHASE_GROUP = /::group::\[\d{2}:\d{2}:\d{2}Z\] render-config/u;
const FAILED_START = /failed in phase 'start' \(last completed: grants\)/u;
const FAILED_MIGRATIONS =
  /failed in phase 'migrations' \(last completed: databases\)/u;
const PARTIAL_RELEASE = /a partial release may be running/u;
const UNHEALTHY_STATE = /test-nhc-worker-1 status=running health=unhealthy/u;
const HEALTH_PROBE = /exit=1 heartbeat missing/u;
const NETWORK_RECREATE = /stopping the project so Compose can recreate it/u;
const PROJECT_STOPPED = /nothing is serving until a deploy succeeds/u;
const DIAGNOSTICS_INCOMPLETE = /Diagnostics incomplete/u;
const SUMMARY_FAILED_START =
  /Core delivery failed[\s\S]*\| start \| \d+s \| failed \|/u;
const SUMMARY_SUCCEEDED =
  /Core delivery succeeded[\s\S]*\| render-config \| \d+s \| ok \|[\s\S]*\| smoke \| \d+s \| ok \|/u;

// Release A's staging deploy failed this way: #485 pinned the network subnet, Compose
// had to recreate the network, but only db and redis were being started, so the web
// containers kept it in use and the deploy stopped with db and redis down.
test("a changed network subnet stops the whole project before the databases start", () => {
  const { result, calls } = runDeploy({
    environment: "staging",
    extraEnv: {
      TEST_PINNED_SUBNET: "172.31.250.0/24",
      TEST_LIVE_SUBNET: "172.18.0.0/16",
    },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, NETWORK_RECREATE);
  const lines = calls.split("\n");
  const down = lines.findIndex((line) =>
    line.includes(" down --remove-orphans")
  );
  const databases = lines.findIndex((line) => line.includes(" up -d --wait"));
  assert.notEqual(down, -1, "expected the project to be stopped");
  assert.ok(
    down < databases,
    "the project must stop before the databases start"
  );
  assert.equal(
    lines[down].includes(" -v") || lines[down].includes("--volumes"),
    false,
    "stopping the project must keep its volumes"
  );
});

test("a failure after the project was stopped says nothing is serving", () => {
  const { result } = runDeploy({
    environment: "production",
    failure: "migration",
    extraEnv: {
      TEST_PINNED_SUBNET: "172.31.250.0/24",
      TEST_LIVE_SUBNET: "172.18.0.0/16",
    },
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stdout, PROJECT_STOPPED);
  assert.equal(result.stdout.includes("are still running"), false);
});

// The backup gate reads the backup store, not the database, so it runs first: an
// enforced stale-backup block must leave the previous release serving.
test("an enforced stale backup blocks before the project is stopped", () => {
  const { result, calls } = runDeploy({
    environment: "production",
    extraEnv: {
      TEST_GATE: "stale",
      DEPLOY_BACKUP_GATE: "enforce",
      TEST_PINNED_SUBNET: "172.31.250.0/24",
      TEST_LIVE_SUBNET: "172.18.0.0/16",
    },
  });
  assert.notEqual(result.status, 0);
  assert.equal(calls.includes(" down "), false);
  assert.equal(calls.includes(" up -d --wait"), false);
});

test("a matching or missing network, or no pinned subnet, leaves containers running", () => {
  for (const extraEnv of [
    {
      TEST_PINNED_SUBNET: "172.31.250.0/24",
      TEST_LIVE_SUBNET: "172.31.250.0/24",
    },
    { TEST_PINNED_SUBNET: "172.31.250.0/24", TEST_LIVE_SUBNET: "" },
    { TEST_PINNED_SUBNET: "", TEST_LIVE_SUBNET: "172.18.0.0/16" },
  ]) {
    const { result, calls } = runDeploy({ environment: "staging", extraEnv });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(calls.includes(" down "), false, JSON.stringify(extraEnv));
  }
});

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
  assert.ok(Date.now() - started < 25_000, "diagnostics must be time-bounded");
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

test("delivery starts exactly the services in the release registry", () => {
  const { result, calls } = runDeploy({ environment: "staging" });
  assert.equal(result.status, 0, result.stderr);
  assert.ok(calls.includes(`up -d --wait ${dataServices.join(" ")}\n`));
  for (const service of migrationServices)
    assert.ok(calls.includes(`run --rm --no-deps ${service}\n`));
  assert.ok(
    calls.includes(`--wait --wait-timeout 300 ${appServices.join(" ")}\n`)
  );
});

const GATE_STALE = /newest backup 40\.0h old/u;
const GATE_BLOCKED =
  /Backup gate \(enforce\) blocked the deploy before migrations/u;
const GATE_HOW_TO = /backup-database\.yml.*backup_gate_override/su;
const GATE_WARNING = /::warning::Backup gate \(warn\): backup is stale/u;
const GATE_OPEN = /could NOT verify the newest backup and is passing OPEN/u;
const GATE_OVERRIDDEN = /Backup gate OVERRIDDEN by test: 'hotfix INC-42'/u;
const GATE_SKIPPED =
  /Backup gate: skipped, this release has no migration services/u;
const GATE_OFF = /Backup gate: off/u;
const GATE_BAD_MODE = /not off, warn or enforce; using warn/u;
const GATE_SUMMARY_BLOCKED = /blocked this deploy/u;
const GATE_MISSING = /missing: bucket name/u;
const MIGRATED = "run --rm --no-deps prestart";

function gate(gateMode, testGate, extraEnv = {}) {
  return runDeploy({
    environment: "production",
    extraEnv: {
      TEST_GATE: testGate,
      ...(gateMode ? { DEPLOY_BACKUP_GATE: gateMode } : {}),
      ...extraEnv,
    },
  });
}

test("backup gate: off skips the check and still migrates", () => {
  const { result, calls, summary } = gate("off", "stale");
  assert.equal(result.status, 0, result.stderr);
  assert.equal(calls.includes("backup-gate.py"), false);
  assert.ok(calls.includes(MIGRATED));
  assert.match(summary, GATE_OFF);
});

test("backup gate: warn is the default, warns on a stale backup and continues", () => {
  for (const mode of [undefined, "warn"]) {
    const { result, calls, summary } = gate(mode, "stale");
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, GATE_WARNING);
    assert.match(summary, GATE_WARNING);
    assert.match(summary, GATE_STALE);
    assert.ok(calls.includes(MIGRATED));
  }
});

test("backup gate: unknown mode falls back to warn and says so", () => {
  const { result, calls } = gate("strict", "stale");
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, GATE_BAD_MODE);
  assert.ok(calls.includes(MIGRATED));
});

test("backup gate: enforce blocks a stale backup before migrations", () => {
  const { result, calls, summary } = gate("enforce", "stale");
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, GATE_BLOCKED);
  assert.match(result.stderr, GATE_STALE);
  assert.match(result.stderr, GATE_HOW_TO);
  assert.match(summary, GATE_SUMMARY_BLOCKED);
  for (const forbidden of [MIGRATED, "cms-migrate", "up -d --no-deps"])
    assert.equal(calls.includes(forbidden), false, forbidden);
  assert.ok(calls.includes("logout"));
});

test("backup gate: enforce passes a fresh backup", () => {
  const { result, calls } = gate("enforce", "fresh");
  assert.equal(result.status, 0, result.stderr);
  assert.ok(calls.includes(MIGRATED));
});

test("backup gate: skipped when the release has no migration services", () => {
  const { result, calls, summary } = gate("enforce", "stale", {
    TEST_NO_MIGRATIONS: "1",
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(calls.includes("backup-gate.py"), false);
  assert.match(summary, GATE_SKIPPED);
});

test("backup gate: an unreadable backup store fails open loudly, even in enforce", () => {
  const { result, calls, summary } = gate("enforce", "unreadable");
  assert.equal(result.status, 0, result.stderr);
  assert.match(summary, GATE_OPEN);
  assert.match(summary, GATE_MISSING);
  assert.ok(calls.includes(MIGRATED));
});

test("backup gate: an override lets enforce continue and is recorded", () => {
  const { result, calls, summary } = gate("enforce", "stale", {
    DEPLOY_BACKUP_GATE_OVERRIDE: "hotfix INC-42",
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(summary, GATE_OVERRIDDEN);
  assert.ok(calls.includes(MIGRATED));
});

test("backup gate: calls the gate for production and never prints secrets", () => {
  const { result, calls } = gate("warn", "stale", {
    DEPLOY_BACKUP_MAX_AGE_HOURS: "12",
  });
  assert.equal(result.status, 0, result.stderr);
  assert.ok(calls.includes("backup-gate.py production"));
  assert.equal(
    `${result.stdout}${result.stderr}`.includes(SECRET_MARKER),
    false
  );
});

const ROLLING_DEPLOY_INVALID = /ROLLING_DEPLOY must be/u;
const ROLLOUT_FAILED =
  /New web-auth container did not become healthy; the previous one is still serving/u;

test("rolling start replaces each routed service before retiring the old container", () => {
  const { result, calls } = runDeploy({
    environment: "staging",
    extraEnv: { ROLLING_DEPLOY: "1" },
  });
  assert.equal(result.status, 0, `${result.stderr}\n${calls}`);
  for (const service of routedServices) {
    const scaled = calls.indexOf(
      `up -d --no-deps --no-recreate --scale ${service}=2 ${service}\n`
    );
    const stopped = calls.indexOf(`docker stop --time 30 old-${service}\n`);
    assert.ok(scaled >= 0, `expected a rolling start of ${service}`);
    assert.ok(
      stopped > scaled,
      `old ${service} must stop after the new one starts`
    );
    assert.equal(calls.includes(`docker rm -f new-${service}`), false);
  }
  const rest = appServices.filter(
    (service) => !routedServices.includes(service)
  );
  assert.ok(
    calls.includes(
      `up -d --no-deps --remove-orphans --wait --wait-timeout 300 ${rest.join(" ")}\n`
    ),
    calls
  );
  assert.ok(calls.includes("smoke"));
});

test("rolling start keeps the old container when the new one is unhealthy", () => {
  const { result, calls } = runDeploy({
    environment: "staging",
    extraEnv: { ROLLING_DEPLOY: "1", TEST_UNHEALTHY_SERVICE: "web-auth" },
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, ROLLOUT_FAILED);
  assert.ok(calls.includes("docker rm -f new-web-auth"));
  assert.equal(calls.includes("docker stop --time 30 old-web-auth"), false);
  // Services after the failure are not touched, and smoke never runs.
  assert.equal(calls.includes("--scale web-admin=2"), false);
  assert.equal(calls.includes("smoke"), false);
});

test("rolling start removes stopped leftovers before scaling", () => {
  const { result, calls } = runDeploy({
    environment: "staging",
    extraEnv: { ROLLING_DEPLOY: "true", TEST_STALE_SERVICE: "web-docs" },
  });
  assert.equal(result.status, 0, result.stderr);
  const removed = calls.indexOf("docker rm stale-web-docs\n");
  const scaled = calls.indexOf("--scale web-docs=2 web-docs\n");
  assert.ok(removed >= 0, "stale container must be removed");
  assert.ok(scaled > removed, "removal must come before the scaled start");
});

test("rolling start uses an ordinary start when nothing is running yet", () => {
  const { result, calls } = runDeploy({
    environment: "staging",
    extraEnv: { ROLLING_DEPLOY: "1", TEST_NO_OLD: "1" },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(calls.includes("--no-recreate --scale"), false);
  assert.ok(calls.includes("up -d --no-deps --wait --wait-timeout 300 api\n"));
});

test("an unrecognised ROLLING_DEPLOY value stops before any change", () => {
  const { result, calls } = runDeploy({
    environment: "staging",
    extraEnv: { ROLLING_DEPLOY: "yes" },
  });
  assert.equal(result.status, 2);
  assert.match(result.stderr, ROLLING_DEPLOY_INVALID);
  assert.equal(calls.includes("docker"), false);
});
