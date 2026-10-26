import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

const SCRIPT = fileURLToPath(new URL("./cloud-bootstrap.sh", import.meta.url));
const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const source = readFileSync(SCRIPT, "utf8");
const pkg = JSON.parse(readFileSync(`${ROOT}package.json`, "utf8"));
const pythonVersion = readFileSync(`${ROOT}.python-version`, "utf8").trim();

const FIRST_NUMBER = /\d+/;
const PNPM_PREFIX = /^pnpm@/;
const INSTALL_STEP = /pnpm install --frozen-lockfile/;
const BOTH_PACKAGES = /--package fast-back --package gms-ingest/;
const REDIS_OUTSIDE_REPO = /redis-server --daemonize yes --dir \/tmp --save ""/;
const PNPM_SWITCHING_OFF = /npm_config_manage_package_manager_versions=false/;
const NO_REPO_GIT_WRITES = /git (checkout|reset|add|commit)/;
const NO_ENV_FILE_WRITES = />\s*"?\$ROOT\/\.env/;
const ENDS_WITH_EXIT_ZERO = /exit 0$/;
const REMOTE_GUARD = /CLAUDE_CODE_REMOTE/;
const DUMP_IGNORED = /^dump\.rdb$/m;

function dryRun() {
  return spawnSync("bash", [SCRIPT, "--dry-run"], { encoding: "utf8" });
}

test("dry run lists every step, exits 0 and changes nothing", () => {
  const result = dryRun();
  assert.equal(result.status, 0);
  const steps = result.stdout
    .split("\n")
    .filter((line) => line.startsWith("bootstrap: would: "));
  assert.equal(steps.length, 8, result.stdout);
  assert.match(result.stdout, INSTALL_STEP);
  assert.match(result.stdout, BOTH_PACKAGES);
});

test("steps are derived from the repo's pins, not hard-coded", () => {
  const out = dryRun().stdout;
  assert.ok(out.includes(`Python ${pythonVersion}`), out);
  const nodeMajor = pkg.engines.node.match(FIRST_NUMBER)[0];
  assert.ok(out.includes(`provide v${nodeMajor}`), out);
  const pnpm = pkg.packageManager.replace(PNPM_PREFIX, "").split("+")[0];
  assert.ok(out.includes(pnpm), out);
});

test("keeps the guarantees the cloud image needs", () => {
  // Never commit Redis snapshots from the repo directory.
  assert.match(source, REDIS_OUTSIDE_REPO);
  // pnpm must not re-exec into the placeholder tool shim or rewrite the lockfile.
  assert.match(source, PNPM_SWITCHING_OFF);
  // gms-ingest is needed by the NHC tests and by the verify:changed gate.
  assert.match(source, BOTH_PACKAGES);
  // It must never edit tracked files or env files, and must never fail a session.
  assert.doesNotMatch(source, NO_REPO_GIT_WRITES);
  assert.doesNotMatch(source, NO_ENV_FILE_WRITES);
  assert.match(source.trimEnd(), ENDS_WITH_EXIT_ZERO);
});

test("the SessionStart hook runs it for cloud sessions only", () => {
  const settings = JSON.parse(
    readFileSync(`${ROOT}.claude/settings.json`, "utf8")
  );
  const commands = settings.hooks.SessionStart.flatMap((entry) =>
    entry.hooks.map((hook) => hook.command)
  );
  const hook = commands.find((command) =>
    command.includes("cloud-bootstrap.sh")
  );
  assert.ok(hook, "cloud-bootstrap.sh is registered as a SessionStart hook");
  assert.match(hook, REMOTE_GUARD);
});

const SETUP = fileURLToPath(new URL("./cloud-setup.sh", import.meta.url));
const setupSource = readFileSync(SETUP, "utf8");
const BUDGET_DEFAULT = /GRENMET_SETUP_SECONDS:-(\d+)/;
const RUNS_BOOTSTRAP =
  /timeout "\$BUDGET" bash "\$WORK\/repo\/scripts\/agents\/cloud-bootstrap\.sh"/;
const REMOVES_WORK = /rm -rf "\$WORK"/;
const CLONE_WARNING = /WARN could not clone/;

test("the environment setup script parses and runs the bootstrap within budget", () => {
  assert.equal(spawnSync("bash", ["-n", SETUP]).status, 0);
  assert.match(setupSource, RUNS_BOOTSTRAP);
  assert.match(setupSource, REMOVES_WORK);
  // The cloud only snapshots setup scripts that finish within about five minutes.
  assert.ok(Number(setupSource.match(BUDGET_DEFAULT)[1]) < 300);
  assert.doesNotMatch(setupSource, NO_REPO_GIT_WRITES);
  assert.match(setupSource.trimEnd(), ENDS_WITH_EXIT_ZERO);
});

test("a failed clone still lets the session start", () => {
  const result = spawnSync("bash", [SETUP], {
    encoding: "utf8",
    env: { ...process.env, GRENMET_REPO_URL: "/nonexistent/grenmet.git" },
  });
  assert.equal(result.status, 0);
  assert.match(result.stdout, CLONE_WARNING);
});

test("dump.rdb is ignored", () => {
  assert.match(readFileSync(`${ROOT}.gitignore`, "utf8"), DUMP_IGNORED);
});
