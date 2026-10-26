import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
  assert.equal(steps.length, 9, result.stdout);
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
const CLONE_HAS_TIMEOUT = /timeout "\$CLONE_SECONDS" git clone/;
const CLONE_WARNING = /WARN could not clone/;
const WARMED = /ok caches warmed/;
const STORE_KEPT = /ok pnpm store kept/;
const STOPPED_EARLY = /WARN bootstrap stopped after/;

// A throwaway local repo whose bootstrap is `body`, on a "dev" branch.
function fixture(body) {
  const dir = mkdtempSync(join(tmpdir(), "cloud-setup-test-"));
  const repo = join(dir, "repo");
  mkdirSync(join(repo, "scripts", "agents"), { recursive: true });
  writeFileSync(join(repo, "scripts", "agents", "cloud-bootstrap.sh"), body);
  const git = (...args) =>
    spawnSync("git", ["-C", repo, ...args], { encoding: "utf8" });
  git("init", "-q", "-b", "dev");
  git("add", ".");
  git("-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "fixture");
  return { dir, repo, cache: join(dir, "cache") };
}

function runSetup(env) {
  return spawnSync("bash", [SETUP], {
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
}

function leftovers(cache) {
  return existsSync(cache)
    ? readdirSync(cache).filter((name) => name.startsWith("setup."))
    : [];
}

test("the setup script stays under the snapshot limit and never fails a session", () => {
  assert.equal(spawnSync("bash", ["-n", SETUP]).status, 0);
  // The cloud only snapshots setup scripts that finish within about five minutes.
  assert.ok(Number(setupSource.match(BUDGET_DEFAULT)[1]) < 300);
  assert.match(setupSource, CLONE_HAS_TIMEOUT);
  assert.doesNotMatch(setupSource, NO_REPO_GIT_WRITES);
  assert.match(setupSource.trimEnd(), ENDS_WITH_EXIT_ZERO);
});

test("a failed clone still lets the session start and leaves nothing behind", () => {
  const { dir, cache } = fixture("");
  try {
    const result = runSetup({
      GRENMET_REPO_URL: join(dir, "missing.git"),
      BOOTSTRAP_CACHE_DIR: cache,
    });
    assert.equal(result.status, 0);
    assert.match(result.stdout, CLONE_WARNING);
    assert.deepEqual(leftovers(cache), []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a clean run keeps the filled pnpm store in the cache", () => {
  const { dir, repo, cache } = fixture(
    'mkdir -p "$(dirname "$0")/../../.pnpm-store" && echo x > "$(dirname "$0")/../../.pnpm-store/marker"\necho "bootstrap: done (0 warning(s))"\n'
  );
  try {
    const result = runSetup({
      GRENMET_REPO_URL: repo,
      BOOTSTRAP_CACHE_DIR: cache,
    });
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, WARMED);
    assert.match(result.stdout, STORE_KEPT);
    assert.ok(existsSync(join(cache, "pnpm-store", "marker")));
    assert.deepEqual(leftovers(cache), []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a bootstrap over budget is stopped and the session still starts", () => {
  const { dir, repo, cache } = fixture("sleep 10\n");
  try {
    const result = runSetup({
      GRENMET_REPO_URL: repo,
      BOOTSTRAP_CACHE_DIR: cache,
      GRENMET_SETUP_SECONDS: "1",
      GRENMET_MIN_BOOTSTRAP_SECONDS: "1",
    });
    assert.equal(result.status, 0);
    assert.match(result.stdout, STOPPED_EARLY);
    assert.deepEqual(leftovers(cache), []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("dump.rdb is ignored", () => {
  assert.match(readFileSync(`${ROOT}.gitignore`, "utf8"), DUMP_IGNORED);
});
