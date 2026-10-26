import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const SCRIPT = fileURLToPath(new URL("./api-env.sh", import.meta.url));
const USAGE = /usage: scripts\/agents\/api-env\.sh/;
const WRONG_IMPORT = /outside the current worktree/;

function importFixture(t) {
  const root = mkdtempSync(join(tmpdir(), "api-import-isolation-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const a = join(root, "a");
  const b = join(root, "b");
  const bin = join(root, "bin");
  mkdirSync(bin);
  for (const worktree of [a, b]) {
    mkdirSync(join(worktree, "scripts/agents"), { recursive: true });
    mkdirSync(join(worktree, "api/src"), { recursive: true });
    mkdirSync(join(worktree, "ingest/gms_ingest"), { recursive: true });
    writeFileSync(join(worktree, "ingest/gms_ingest/__init__.py"), "");
    writeFileSync(
      join(worktree, "scripts/agents/api-env.sh"),
      readFileSync(SCRIPT)
    );
    const checker = fileURLToPath(
      new URL("./check-api-imports.py", import.meta.url)
    );
    if (existsSync(checker))
      writeFileSync(
        join(worktree, "scripts/agents/check-api-imports.py"),
        readFileSync(checker)
      );
  }
  writeFileSync(
    join(bin, "uv"),
    [
      "#!/usr/bin/env python3",
      "import os, sys",
      "args = sys.argv[2:]",
      "while args and args[0].startswith('-'):",
      "    args = args[2:] if args[0] in ['--package', '--with', '--python'] else args[1:]",
      "if args[1:3] == ['-m', 'pytest']: args = ['pytest', *args[3:]]",
      "if os.path.basename(args[0]).startswith('python'): args[0] = sys.executable",
      "os.execvp(args[0], args)",
    ].join("\n"),
    { mode: 0o755 }
  );
  writeFileSync(join(bin, "pytest"), '#!/bin/sh\n: > "$TEST_STARTED"\n', {
    mode: 0o755,
  });
  const started = join(root, "started");
  const invoke = (
    worktree,
    ingest,
    extra = {},
    command = ["pytest"],
    flags = ["--frozen", "--package", "fast-back"]
  ) =>
    spawnSync(
      "bash",
      [
        join(worktree, "scripts/agents/api-env.sh"),
        "uv",
        "run",
        ...flags,
        ...command,
      ],
      {
        cwd: join(worktree, "api"),
        encoding: "utf8",
        env: {
          ...process.env,
          UV_PROJECT_ENVIRONMENT: "",
          PATH: `${bin}${delimiter}${process.env.PATH}`,
          PYTHONPATH: `${join(worktree, "api")}${delimiter}${join(ingest, "ingest")}`,
          TEST_STARTED: started,
          ...extra,
        },
      }
    );
  return { a, b, started, invoke };
}

test("API pytest refuses another worktree's editable imports before starting tests", (t) => {
  const { a, b, started, invoke } = importFixture(t);
  for (const command of [
    ["pytest"],
    ["python", "-m", "pytest"],
    ["python3.14", "-m", "pytest"],
  ]) {
    const result = invoke(a, b, {}, command);
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, WRONG_IMPORT);
    assert.equal(existsSync(started), false);
  }
  const own = invoke(b, b);
  assert.equal(own.status, 0, own.stderr);
  assert.ok(existsSync(started));
});

test("API pytest rejects a shared environment outside its worktree", (t) => {
  const { a, b, started, invoke } = importFixture(t);
  const result = invoke(a, a, { UV_PROJECT_ENVIRONMENT: join(b, ".venv") });
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, WRONG_IMPORT);
  assert.equal(existsSync(started), false);
});

test("API pytest rejects a namespace combining source directories from two worktrees", (t) => {
  const { a, b, started, invoke } = importFixture(t);
  const result = invoke(a, a, {
    PYTHONPATH: [join(a, "api"), join(b, "api"), join(a, "ingest")].join(
      delimiter
    ),
  });
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, WRONG_IMPORT);
  assert.equal(existsSync(started), false);
});

test("uv option values named pytest or Python are not mistaken for the test command", (t) => {
  const { a, invoke } = importFixture(t);
  for (const flags of [
    ["--with", "pytest", "--package", "fast-back"],
    ["--python", "python3.14", "--package", "fast-back"],
  ]) {
    const result = invoke(a, a, {}, ["pytest"], flags);
    assert.equal(result.status, 0, result.stderr);
  }
});

test("an absent optional ingestion package is safe, but API source is required", (t) => {
  const { a, started, invoke } = importFixture(t);
  const optionalMissing = invoke(a, a, { PYTHONPATH: join(a, "api") });
  assert.equal(optionalMissing.status, 0, optionalMissing.stderr);
  rmSync(started);
  rmSync(join(a, "api/src"), { recursive: true });
  const sourceMissing = invoke(a, a, { PYTHONPATH: join(a, "ingest") });
  assert.equal(sourceMissing.status, 1);
  assert.ok(sourceMissing.stderr.includes("Cannot resolve src"));
  assert.equal(existsSync(started), false);
});

function run(args, env = {}) {
  const base = { ...process.env };
  for (const key of [
    "PROJECT_NAME",
    "FIRST_SUPERUSER",
    "POSTGRES_USER",
    "POSTGRES_SERVER",
  ])
    delete base[key];
  return spawnSync("bash", [SCRIPT, ...args], {
    encoding: "utf8",
    env: { ...base, ...env },
  });
}

test("sets the settings a fresh worktree is missing", () => {
  const result = run([
    "printenv",
    "PROJECT_NAME",
    "FIRST_SUPERUSER",
    "POSTGRES_USER",
    "POSTGRES_SERVER",
  ]);
  assert.equal(result.status, 0);
  assert.deepEqual(result.stdout.trim().split("\n"), [
    "Barrels Grenada",
    "admin@example.com",
    "app",
    "host.docker.internal",
  ]);
});

test("values already in the environment win", () => {
  const result = run(["printenv", "POSTGRES_SERVER"], {
    POSTGRES_SERVER: "localhost",
  });
  assert.equal(result.stdout.trim(), "localhost");
});

test("passes the command's exit status through", () => {
  assert.equal(run(["bash", "-c", "exit 3"]).status, 3);
});

test("refuses to run without a command", () => {
  const result = run([]);
  assert.equal(result.status, 2);
  assert.match(result.stderr, USAGE);
});
