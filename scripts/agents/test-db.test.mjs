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

const SCRIPT = fileURLToPath(new URL("./test-db.sh", import.meta.url));
const USAGE = /usage: scripts\/agents\/test-db\.sh/;
const ABSENT = /absent/;
const NOT_A_TEST_NAME = /must end in -test/;
const READY_LINE = /test-db: ready on 127\.0\.0\.1:5433/;
const IMAGE_PIN = /postgis\/postgis:17-3\.5@sha256:[0-9a-f]{64}/;
const COMPOSE = readFileSync(
  fileURLToPath(
    new URL("../../infra/docker/docker-compose.yml", import.meta.url)
  ),
  "utf8"
);

// A stand-in `docker` first on PATH, so no test can touch a real container. The
// container's state lives in state/status ("running", "exited" or absent) and
// every call is appended to state/calls.
function fixture(t, initial) {
  const root = mkdtempSync(join(tmpdir(), "test-db-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const bin = join(root, "bin");
  mkdirSync(bin);
  if (initial) writeFileSync(join(root, "status"), initial);
  writeFileSync(
    join(bin, "docker"),
    [
      "#!/bin/bash",
      'echo "$*" >> "$STUB_STATE/calls"',
      'case "$1" in',
      '  inspect) [ -f "$STUB_STATE/status" ] && cat "$STUB_STATE/status" || exit 1 ;;',
      '  run) echo running > "$STUB_STATE/status" ;;',
      '  rm) rm -f "$STUB_STATE/status" ;;',
      '  exec) [ "$(cat "$STUB_STATE/status" 2>/dev/null)" = running ] ;;',
      "esac",
      "",
    ].join("\n"),
    { mode: 0o755 }
  );
  const run = (...args) => runWith({}, ...args);
  const runWith = (extraEnv, ...args) =>
    spawnSync("bash", [SCRIPT, ...args], {
      encoding: "utf8",
      env: {
        ...Object.fromEntries(
          Object.entries(process.env).filter(
            ([key]) => !key.startsWith("TEST_DB_")
          )
        ),
        ...extraEnv,
        PATH: `${bin}${delimiter}${process.env.PATH}`,
        STUB_STATE: root,
      },
    });
  const calls = () => {
    const file = join(root, "calls");
    return existsSync(file)
      ? readFileSync(file, "utf8").trim().split("\n")
      : [];
  };
  return { run, runWith, calls };
}

test("up creates the container with durability off, in RAM, on loopback only", (t) => {
  const { run, calls } = fixture(t);
  const result = run("up");
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, READY_LINE);
  const create = calls().find((line) => line.startsWith("run "));
  assert.ok(create, "docker run was called");
  for (const piece of [
    "-p 127.0.0.1:5433:5432",
    "--tmpfs /var/lib/postgresql/data",
    "fsync=off",
    "synchronous_commit=off",
    "full_page_writes=off",
    "POSTGRES_USER=app",
    "CMS_DB_NAME=gms_cms",
    "WXPRODUCTS_DB_USER=wxproducts",
  ])
    assert.ok(create.includes(piece), `${piece} in: ${create}`);
});

test("up leaves a running container alone and replaces a stopped one", (t) => {
  const running = fixture(t, "running");
  assert.equal(running.run("up").status, 0);
  assert.ok(!running.calls().some((line) => line.startsWith("run ")));
  assert.ok(!running.calls().some((line) => line.startsWith("rm ")));

  const stopped = fixture(t, "exited");
  assert.equal(stopped.run("up").status, 0);
  const lines = stopped.calls();
  assert.ok(lines.some((line) => line.startsWith("rm -f")));
  assert.ok(lines.some((line) => line.startsWith("run ")));
});

test("status is ready only when the container is running and answering", (t) => {
  assert.equal(fixture(t, "running").run("status").status, 0);
  const absent = fixture(t).run("status");
  assert.notEqual(absent.status, 0);
  assert.match(absent.stdout, ABSENT);
  assert.notEqual(fixture(t, "exited").run("status").status, 0);
});

test("down removes it, and removing an absent container is fine", (t) => {
  const { run, calls } = fixture(t, "running");
  assert.equal(run("down").status, 0);
  assert.ok(calls().some((line) => line.startsWith("rm -f")));
  assert.equal(fixture(t).run("down").status, 0);
});

test("it refuses a container name that is not a test container", (t) => {
  const { runWith, calls } = fixture(t, "running");
  for (const name of ["grenmet-postgres", "app-db"]) {
    for (const command of ["up", "down"]) {
      const result = runWith({ TEST_DB_CONTAINER: name }, command);
      assert.equal(result.status, 2, `${name} ${command}`);
      assert.match(result.stderr, NOT_A_TEST_NAME);
    }
  }
  assert.deepEqual(calls(), []);
});

test("it is committed executable, as the docs run it directly", () => {
  const { stdout } = spawnSync("git", ["ls-files", "-s", SCRIPT], {
    encoding: "utf8",
  });
  assert.ok(stdout.startsWith("100755"), stdout);
});

test("it refuses an unknown command", (t) => {
  const result = fixture(t).run("explode");
  assert.equal(result.status, 2);
  assert.match(result.stderr, USAGE);
});

test("it uses the same pinned image as the development stack", () => {
  const source = readFileSync(SCRIPT, "utf8");
  const pinned = source.match(IMAGE_PIN)?.[0];
  assert.ok(pinned, "the script pins an image digest");
  assert.ok(COMPOSE.includes(pinned), "docker-compose.yml uses that image");
});
