import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
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

const FIRST_NUMBER = /\d+/u;
const PNPM_PREFIX = /^pnpm@/u;
const INSTALL_STEP = /pnpm install --frozen-lockfile/u;
const BOTH_PACKAGES = /--package fast-back --package gms-ingest/u;
const REDIS_OUTSIDE_REPO =
  /redis-server --daemonize yes --dir \/tmp --save ""/u;
const PNPM_SWITCHING_OFF = /npm_config_manage_package_manager_versions=false/u;
const NO_REPO_GIT_WRITES = /git (checkout|reset|add|commit)/u;
const NO_ENV_FILE_WRITES = />\s*"?\$ROOT\/\.env/u;
const ENDS_WITH_EXIT_ZERO = /exit 0$/u;
const REMOTE_GUARD = /CLAUDE_CODE_REMOTE/u;
const DUMP_IGNORED = /^dump\.rdb$/mu;

// The environment a test runs the scripts with: the caller's, minus the knobs
// a developer may have exported that would change what the scripts do.
function cleanEnv(extra = {}) {
  const env = { ...process.env, ...extra };
  for (const key of [
    "BOOTSTRAP_ONLY",
    "GRENMET_BRANCH",
    "GRENMET_CLONE_SECONDS",
    "GRENMET_MIN_BOOTSTRAP_SECONDS",
    "GRENMET_REPO_URL",
    "GRENMET_SETUP_SECONDS",
    "BASH_ENV",
  ])
    if (!(key in extra)) delete env[key];
  return env;
}

function dryRun() {
  return spawnSync("bash", [SCRIPT, "--dry-run"], {
    encoding: "utf8",
    env: cleanEnv(),
  });
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
const BUDGET_DEFAULT = /GRENMET_SETUP_SECONDS:-(\d+)/u;
const CLONE_HAS_TIMEOUT = /timeout "\$CLONE_SECONDS" git clone/u;
const CLONE_WARNING = /WARN could not clone/u;
const WARMED = /ok caches warmed/u;
const STORE_KEPT = /ok pnpm store kept/u;
const STOPPED_EARLY = /WARN bootstrap stopped after/u;
const SEEDED = /ok pnpm store seeded/u;
const ALREADY_SEEDED = /skip pnpm store: checkout already has one/u;

// A throwaway local repo whose bootstrap is `body`, on a "dev" branch.
function fixture(body) {
  const dir = mkdtempSync(join(tmpdir(), "cloud-setup-test-"));
  const repo = join(dir, "repo");
  mkdirSync(join(repo, "scripts", "agents"), { recursive: true });
  writeFileSync(join(repo, "scripts", "agents", "cloud-bootstrap.sh"), body);
  const git = (...args) => {
    const result = spawnSync("git", ["-C", repo, ...args], {
      encoding: "utf8",
    });
    assert.equal(result.status, 0, result.stderr);
  };
  git("init", "-q", "-b", "dev");
  git("add", ".");
  git(
    "-c",
    "user.name=t",
    "-c",
    "user.email=t@t",
    "-c",
    "commit.gpgsign=false",
    "-c",
    "core.hooksPath=/dev/null",
    "commit",
    "-qm",
    "fixture"
  );
  const state = join(dir, "state");
  mkdirSync(state);
  return { dir, repo, cache: join(dir, "cache"), state };
}

// Stand-ins for the server tools, first on PATH, so a test can never stop a
// real Postgres or Redis. "up" files in `state` say which servers are running;
// every stop or shutdown is appended to state/calls.
const STUBS = {
  pg_lsclusters:
    '[ -f "$STUB_STATE/pg-up" ] && echo "16 main 5432 online postgres /d /l"\nexit 0\n',
  pg_ctlcluster: 'echo "pg $3 $1 $2" >> "$STUB_STATE/calls"\n',
  "redis-cli":
    'case "$1" in ping) [ -f "$STUB_STATE/redis-up" ] ;; *) echo "redis $*" >> "$STUB_STATE/calls" ;; esac\n',
};

function runSetup(env, state) {
  const bin = join(state, "bin");
  mkdirSync(bin, { recursive: true });
  for (const [name, body] of Object.entries(STUBS)) {
    writeFileSync(join(bin, name), `#!/bin/bash\n${body}`, { mode: 0o755 });
  }
  return spawnSync("bash", [SETUP], {
    encoding: "utf8",
    env: cleanEnv({
      ...env,
      PATH: `${bin}:${process.env.PATH}`,
      STUB_STATE: state,
    }),
  });
}

function calls(state) {
  const file = join(state, "calls");
  return existsSync(file) ? readFileSync(file, "utf8").trim().split("\n") : [];
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
  const { dir, cache, state } = fixture("");
  try {
    const result = runSetup(
      {
        GRENMET_REPO_URL: join(dir, "missing.git"),
        BOOTSTRAP_CACHE_DIR: cache,
      },
      state
    );
    assert.equal(result.status, 0);
    assert.match(result.stdout, CLONE_WARNING);
    assert.deepEqual(leftovers(cache), []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// The stand-in bootstrap fills a store and "starts" both servers.
const STARTS_SERVERS = [
  'root="$(dirname "$0")/../.."',
  'mkdir -p "$root/.pnpm-store" && echo x > "$root/.pnpm-store/marker"',
  'touch "$STUB_STATE/pg-up" "$STUB_STATE/redis-up"',
  'echo "bootstrap: done (0 warning(s))"',
  "",
].join("\n");

test("a clean run keeps the pnpm store and stops the servers it started", () => {
  const { dir, repo, cache, state } = fixture(STARTS_SERVERS);
  try {
    const result = runSetup(
      { GRENMET_REPO_URL: repo, BOOTSTRAP_CACHE_DIR: cache },
      state
    );
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, WARMED);
    assert.match(result.stdout, STORE_KEPT);
    assert.ok(existsSync(join(cache, "pnpm-store", "marker")));
    assert.deepEqual(leftovers(cache), []);
    assert.deepEqual(calls(state), [
      "pg stop 16 main",
      "redis shutdown nosave",
    ]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("servers that were already running are left alone", () => {
  const { dir, repo, cache, state } = fixture(STARTS_SERVERS);
  try {
    writeFileSync(join(state, "pg-up"), "");
    writeFileSync(join(state, "redis-up"), "");
    const result = runSetup(
      { GRENMET_REPO_URL: repo, BOOTSTRAP_CACHE_DIR: cache },
      state
    );
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.deepEqual(calls(state), []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a bootstrap over budget is stopped and the session still starts", () => {
  const { dir, repo, cache, state } = fixture("sleep 10\n");
  try {
    const result = runSetup(
      {
        GRENMET_REPO_URL: repo,
        BOOTSTRAP_CACHE_DIR: cache,
        GRENMET_SETUP_SECONDS: "1",
        GRENMET_MIN_BOOTSTRAP_SECONDS: "1",
      },
      state
    );
    assert.equal(result.status, 0);
    assert.match(result.stdout, STOPPED_EARLY);
    assert.deepEqual(leftovers(cache), []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// The real bootstrap's store step, run alone in a throwaway checkout.
function seedFixture() {
  const dir = mkdtempSync(join(tmpdir(), "cloud-seed-test-"));
  const root = join(dir, "repo");
  mkdirSync(join(root, "scripts", "agents"), { recursive: true });
  writeFileSync(
    join(root, "scripts", "agents", "cloud-bootstrap.sh"),
    readFileSync(SCRIPT)
  );
  writeFileSync(
    join(root, "package.json"),
    readFileSync(`${ROOT}package.json`)
  );
  writeFileSync(join(root, ".python-version"), `${pythonVersion}\n`);
  const cache = join(dir, "cache");
  const seed = join(cache, "pnpm-store", "v11");
  mkdirSync(join(seed, "files", "ab"), { recursive: true });
  writeFileSync(join(seed, "files", "ab", "content"), "package bytes");
  writeFileSync(join(seed, "index.db"), "index");
  const run = () =>
    spawnSync("bash", [join(root, "scripts", "agents", "cloud-bootstrap.sh")], {
      encoding: "utf8",
      env: cleanEnv({
        BOOTSTRAP_CACHE_DIR: cache,
        BOOTSTRAP_ONLY: "seed_pnpm_store",
      }),
    });
  return { dir, root, seed, run };
}

test("seeding shares package files but gives the checkout its own index", () => {
  const { dir, root, seed, run } = seedFixture();
  try {
    const result = run();
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, SEEDED);
    const store = join(root, ".pnpm-store", "v11");
    const ino = (path) => statSync(path).ino;
    assert.equal(
      ino(join(store, "files", "ab", "content")),
      ino(join(seed, "files", "ab", "content"))
    );
    assert.notEqual(ino(join(store, "index.db")), ino(join(seed, "index.db")));
    assert.equal(readFileSync(join(store, "index.db"), "utf8"), "index");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a checkout that already has a store is not reseeded", () => {
  const { dir, root, run } = seedFixture();
  try {
    mkdirSync(join(root, ".pnpm-store"));
    const result = run();
    assert.equal(result.status, 0);
    assert.match(result.stdout, ALREADY_SEEDED);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("dump.rdb is ignored", () => {
  assert.match(readFileSync(`${ROOT}.gitignore`, "utf8"), DUMP_IGNORED);
});
