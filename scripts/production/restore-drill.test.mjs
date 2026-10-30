import { execFileSync, spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

// Runs a Python snippet against the drill module's pure functions.
function python(body) {
  execFileSync("python3", [
    "-c",
    `
import datetime
import importlib.util
spec = importlib.util.spec_from_file_location("drill", "scripts/production/restore-drill.py")
drill = importlib.util.module_from_spec(spec)
spec.loader.exec_module(drill)
now = datetime.datetime.now(datetime.timezone.utc)
def raises(call):
    try:
        call()
    except ValueError:
        return True
    return False
${body}
`,
  ]);
}

test("manifest accepts a fresh complete marker and rejects unsafe ones", () => {
  python(`
good = {"environment": "production", "completed_at": now.isoformat(), "databases": [
    {"database": "app_prod", "key": "production/core/b1/app_prod.dump"},
    {"database": "wxwatch", "key": "production/core/b1/wxwatch.dump"}]}
assert drill.read_manifest(good, "production", now) == [
    ("app_prod", "production/core/b1/app_prod.dump"),
    ("wxwatch", "production/core/b1/wxwatch.dump")]
old = (now - datetime.timedelta(hours=25)).isoformat()
future = (now + datetime.timedelta(hours=1)).isoformat()
def with_db(rows): return good | {"databases": rows}
bad = [
    good | {"environment": "staging"},
    good | {"completed_at": old},
    good | {"completed_at": future},
    good | {"completed_at": now.replace(tzinfo=None).isoformat()},
    with_db([]),
    with_db([good["databases"][0]] * 2),
    with_db([{"database": "app_prod", "key": "production/core/../../etc/passwd"}]),
    with_db([{"database": "app_prod", "key": "staging/core/b1/app_prod.dump"}]),
    with_db([{"database": "app_prod", "key": "/production/core/b1/app_prod.dump"}]),
    with_db([{"database": "app prod; drop", "key": "production/core/b1/x.dump"}]),
]
for marker in bad:
    assert raises(lambda: drill.read_manifest(marker, "production", now)), marker
`);
});

test("version table detection finds one table, none, or refuses several", () => {
  python(`
assert drill.version_table_of(["alembic_version"]) == "alembic_version"
assert drill.version_table_of(["events_alembic_version"]) == "events_alembic_version"
assert drill.version_table_of([]) is None
assert drill.version_table_of(["payload_migrations"]) is None
assert raises(lambda: drill.version_table_of(["alembic_version", "x_alembic_version"]))
`);
});

test("database checks report drift, empty restores, missing heads and floors", () => {
  python(`
heads = {"alembic_version": "h1"}
ok = lambda **k: drill.check_database(**({"name": "app_prod", "version_table": "alembic_version",
    "revision": "h1", "counts": {"public.staff": 5}, "heads": heads, "floors": {},
    "non_alembic": ["cms"]} | k))
assert ok() == []
assert "drift" in ok(revision="h0")[0]
assert "no tables" in ok(counts={})[0]
assert "empty" in ok(counts={"public.staff": 0})[0]
assert "no code head" in ok(version_table="other_alembic_version")[0]
assert "no Alembic version table" in ok(version_table=None)[0]
assert ok(name="gms_cms", version_table=None) == []
below = ok(floors={"app_prod": {"public.staff": 10}})
assert len(below) == 1 and "below the floor of 10" in below[0]
assert ok(floors={"app_prod": {"public.staff": 5}}) == []
assert ok(floors={"other_db": {"public.staff": 99}}) == []
`);
});

test("summary fails on problems or slow recovery and never lists row contents", () => {
  python(`
results = {"app_prod": {"tables": 2, "rows": 9, "revision": "h1", "counts": {"public.staff": 9}}}
text, passed = drill.render_summary("production", results, {"restore": 10.0}, 7200, [])
assert passed and "PASSED" in text and "app_prod" in text
text, passed = drill.render_summary("production", results, {"restore": 10.0}, 7200, ["x: broke"])
assert not passed and "FAILED" in text and "x: broke" in text
text, passed = drill.render_summary("production", results, {"restore": 8000.0}, 7200, [])
assert not passed and "exceeded 7200s" in text
assert "Not yet verified: starting the API" in text
`);
});

test("error descriptions never include command arguments", () => {
  python(`
import subprocess
error = subprocess.CalledProcessError(1, ["docker", "run", "-e", "SECRET=hunter2"])
assert drill.describe(error) == "docker exited with 1"
assert "hunter2" not in drill.describe(error)
`);
});

test("daily layout picks the newest dump per database and rejects gaps and old dumps", () => {
  python(`
fmt = lambda t: t.strftime("%Y%m%d_%H%M%S")
day = lambda t: t.strftime("%Y/%m/%d")
def key(name, t): return f"production/{day(t)}/{name}_{fmt(t)}.dump"
older = now - datetime.timedelta(hours=20)
newer = now - datetime.timedelta(hours=2)
keys = [key("app_prod", older), key("app_prod", newer), key("wxwatch", newer), key("gms_cms", newer),
        "production/2026/01/01/notes.txt", "staging/2026/01/01/app_prod_20260101_000000.dump",
        "production/core/latest-success.json"]
picked = drill.discover_daily(keys, now, ("app_prod", "wxwatch"))
assert picked == [("app_prod", key("app_prod", newer)), ("gms_cms", key("gms_cms", newer)),
                  ("wxwatch", key("wxwatch", newer))], picked
assert raises(lambda: drill.discover_daily(keys, now, ("app_prod", "events")))
stale = [key("app_prod", now - datetime.timedelta(hours=30)), key("wxwatch", newer)]
assert raises(lambda: drill.discover_daily(stale, now, ("app_prod", "wxwatch")))
traversal = ["production/../x/2026/01/app_prod_20260101_000000.dump"]
assert raises(lambda: drill.discover_daily(traversal, now, ("app_prod",)))
`);
});

// A fake `docker` on PATH lets the real drill script run end to end. It records every
// command line (and the value of every `-e NAME` pass-through) and answers from env.
const FAKE_DOCKER = `#!/usr/bin/env python3
import json, os, sys
args = sys.argv[1:]
log = os.environ["FAKE_LOG"]
def record(kind, value):
    with open(log, "a") as out:
        out.write(json.dumps([kind, value]) + "\\n")
record("argv", args)
for i, a in enumerate(args):
    if a == "-e" and i + 1 < len(args) and "=" not in args[i + 1]:
        record("env", {args[i + 1]: os.environ.get(args[i + 1], "")})
head = args[0]
joined = " ".join(args)
if head == "run" and "/var/lib/postgresql/data" in joined:
    print("pgid")
elif head == "run":
    if os.environ.get("FAKE_RUN_FAILS"):
        print("docker: boom " + os.environ["FAKE_RUN_FAILS"], file=sys.stderr)
        sys.exit(125)
    print("apiid")
elif head == "exec" and "pg_restore" in args:
    sys.stdin.buffer.read()
elif head == "exec" and "psql" in args:
    sql = args[-1]
    if "is_superuser" in sql:
        if os.environ.get("FAKE_SUPERUSER", "yes") == "yes":
            print("11111111-2222-3333-4444-555555555555")
    elif "information_schema.tables" in sql:
        print("alembic_version")
    elif "pg_stat_user_tables" in sql:
        print("public.staff|5")
    elif "version_num" in sql:
        print("h1")
elif head == "inspect":
    print("false" if os.environ.get("FAKE_EXITED") else "true")
elif head == "exec" and "curl" in args:
    if os.environ.get("FAKE_HEALTH", "ok") == "ok":
        print("true")
    else:
        sys.exit(7)
elif head == "exec" and "DRILL_USER_ID" in args:
    print("fake.jwt.value")
elif head == "exec" and "DRILL_TOKEN" in args:
    bad = os.environ.get("FAKE_BAD_PATH")
    for path in json.loads(os.environ["DRILL_PATHS"]):
        status = 500 if bad and path.startswith(bad) else 200
        print(json.dumps({"path": path, "status": status}))
`;

const HEADS = {
  alembic_version: "h1",
  eregister_alembic_version: "h1",
  wxwatch_alembic_version: "h1",
};
const DATABASES = ["app_prod", "eregister", "wxwatch"];

// Runs restore-drill.py against a fake bucket and fake docker; returns what it left.
function drillRun({ flags = [], env = {} } = {}) {
  const work = mkdtempSync(join(tmpdir(), "drill-test-"));
  try {
    const bin = join(work, "bin");
    mkdirSync(bin);
    writeFileSync(join(bin, "docker"), FAKE_DOCKER);
    chmodSync(join(bin, "docker"), 0o755);
    const now = new Date();
    const day = now.toISOString().slice(0, 10).replaceAll("-", "/");
    const stamp = now
      .toISOString()
      .replace(/[-:]/gu, "")
      .replace("T", "_")
      .slice(0, 15);
    const bucket = join(work, "bucket", "production", day);
    mkdirSync(bucket, { recursive: true });
    for (const name of DATABASES) {
      writeFileSync(join(bucket, `${name}_${stamp}.dump`), "x");
    }
    writeFileSync(join(work, "heads.json"), JSON.stringify(HEADS));
    const result = join(work, "result.json");
    const log = join(work, "docker.log");
    const run = spawnSync(
      "python3",
      [
        "scripts/production/restore-drill.py",
        "production",
        "--heads",
        join(work, "heads.json"),
        "--source-dir",
        join(work, "bucket"),
        "--required",
        DATABASES.join(","),
        "--result-file",
        result,
        ...flags,
      ],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          PATH: `${bin}:${process.env.PATH}`,
          FAKE_LOG: log,
          GITHUB_STEP_SUMMARY: "",
          ...env,
        },
      }
    );
    const lines = readFileSync(log, "utf8")
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line));
    return {
      code: run.status,
      stdout: run.stdout,
      stderr: run.stderr,
      result: JSON.parse(readFileSync(result, "utf8")),
      argv: lines.filter(([kind]) => kind === "argv").map(([, v]) => v),
      passedEnv: Object.assign(
        {},
        ...lines.filter(([kind]) => kind === "env").map(([, v]) => v)
      ),
    };
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

const API = ["--api-check", "--api-image", "ghcr.io/x/y:production-sha-1"];
const apiRunCommand = (run) =>
  run.argv.find((a) => a[0] === "run" && a.includes("--network"));
const removedApi = (run) =>
  run.argv.some(
    (a) => a[0] === "rm" && a.some((x) => x.startsWith("restore-drill-api-"))
  );
const removedNetwork = (run) =>
  run.argv.some(
    (a) =>
      a[0] === "network" &&
      a[1] === "rm" &&
      a[2].startsWith("restore-drill-net-")
  );
const fail = (message) => {
  throw new Error(message);
};

test("without --api-check the drill never touches an API container", () => {
  const run = drillRun();
  if (run.code !== 0) {
    fail(run.stdout + run.stderr);
  }
  if (apiRunCommand(run) || run.argv.some((a) => a[0] === "network")) {
    fail("API check ran without the flag");
  }
  if (!run.stdout.includes("Not yet verified: starting the API")) {
    fail("summary changed");
  }
  if ("api_checks" in run.result || "health" in run.result.timings) {
    fail("result file changed");
  }
});

test("--api-check requires an image", () => {
  const run = spawnSync(
    "python3",
    [
      "scripts/production/restore-drill.py",
      "production",
      "--heads",
      "x",
      "--api-check",
    ],
    { encoding: "utf8" }
  );
  if (run.status === 0 || !run.stderr.includes("--api-image")) {
    fail("flag accepted without an image");
  }
});

test("a healthy API passes, records phase timings and is removed", () => {
  const run = drillRun({ flags: API });
  if (run.code !== 0) {
    fail(run.stdout + run.stderr);
  }
  for (const phase of ["api_start", "health", "authenticated_reads"]) {
    if (!(phase in run.result.timings)) {
      fail(`missing timing ${phase}`);
    }
  }
  const statuses = run.result.api_checks.map((c) => c.status);
  if (!statuses.length || statuses.some((s) => s !== "pass")) {
    fail(JSON.stringify(run.result.api_checks));
  }
  if (!(removedApi(run) && removedNetwork(run))) {
    fail("API container or network left behind");
  }
  const api = apiRunCommand(run);
  if (!(api.includes("--pull") && api.includes("never"))) {
    fail("API image must never be pulled by the drill");
  }
  if (!run.argv.some((a) => a[0] === "network" && a.includes("--internal"))) {
    fail("network must be internal");
  }
  if (api.some((x) => ["-v", "--volume", "-p", "--mount"].includes(x))) {
    fail("API must not mount volumes or publish ports");
  }
  for (const variable of [
    "SECRET_KEY",
    "EREGISTER_DATABASE_URL",
    "WXWATCH_DATABASE_URL",
  ]) {
    if (!(variable in run.passedEnv)) {
      fail(`API missing ${variable}`);
    }
  }
  if ("WXPRODUCTS_DATABASE_URL" in run.passedEnv) {
    fail("a database that was not restored was configured");
  }
});

test("an unhealthy API fails the drill and still removes everything", () => {
  const run = drillRun({
    flags: [...API, "--api-timeout", "1"],
    env: { FAKE_HEALTH: "never" },
  });
  if (run.code === 0 || !run.stdout.includes("API check health")) {
    fail("unhealthy API passed");
  }
  if (!(removedApi(run) && removedNetwork(run))) {
    fail("cleanup skipped on failure");
  }
  if ("authenticated_reads" in run.result.timings) {
    fail("reads ran against an unhealthy API");
  }
});

test("an exited container fails fast and a refused start is redacted", () => {
  const exited = drillRun({ flags: API, env: { FAKE_EXITED: "1" } });
  if (exited.code === 0 || !exited.stdout.includes("exited before")) {
    fail("exited API passed");
  }
  const refused = drillRun({ flags: API, env: { FAKE_RUN_FAILS: "hunter2" } });
  if (
    refused.code === 0 ||
    !refused.stdout.includes("docker exited with 125")
  ) {
    fail(refused.stdout);
  }
  if ((refused.stdout + refused.stderr).includes("hunter2")) {
    fail("start failure leaked tool output");
  }
  if (!(removedApi(refused) && removedNetwork(refused))) {
    fail("cleanup skipped after a failed start");
  }
});

test("no superuser to authenticate as is a failure", () => {
  const run = drillRun({ flags: API, env: { FAKE_SUPERUSER: "no" } });
  if (run.code === 0 || !run.stdout.includes("no active superuser")) {
    fail("missing superuser passed");
  }
  if (!removedApi(run)) {
    fail("API left behind");
  }
});

test("a non-200 read fails and names only the path and code", () => {
  const run = drillRun({
    flags: API,
    env: { FAKE_BAD_PATH: "/api/v1/events" },
  });
  if (
    run.code === 0 ||
    !run.stdout.includes("GET /api/v1/events/listings?limit=1") ||
    !run.stdout.includes("expected 200, got 500")
  ) {
    fail(run.stdout);
  }
  const failed = run.result.api_checks.filter((c) => c.status === "fail");
  if (failed.length !== 1) {
    fail("only the bad endpoint should fail");
  }
});

test("no secret, token or user email reaches output, results or a command line", () => {
  const run = drillRun({ flags: API });
  const everything = run.stdout + run.stderr + JSON.stringify(run.result);
  const commandLines = JSON.stringify(run.argv);
  const secretValues = Object.values(run.passedEnv).filter(
    (value) => value.length > 8
  );
  if (secretValues.length < 4) {
    fail("fake docker saw no secrets");
  }
  for (const value of [...secretValues, "fake.jwt.value"]) {
    if (everything.includes(value)) {
      fail("a secret or token reached the output");
    }
    if (commandLines.includes(value)) {
      fail("a secret or token reached a command line");
    }
  }
  if (everything.includes("restore-drill@example.com")) {
    fail("an email address reached the output");
  }
});

test("every API check path is a documented authenticated GET", () => {
  python(`
import json
paths = json.load(open("apps/api/fastapi/openapi.json"))["paths"]
for item in drill.API_READ_PATHS:
    path = item.split("?")[0]
    assert "get" in paths[path], path
    assert paths[path]["get"].get("security"), path
    assert not any(p.get("required") for p in paths[path]["get"].get("parameters", [])), path
assert set(drill.API_DATABASE_VARIABLES.values()) == {
    "wxproducts", "wxwatch", "eregister", "janitorial", "transport"}
`);
});

test("the read script prints only paths and status codes", () => {
  python(`
import http.server, json, os, subprocess, threading
class Handler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        ok = self.headers.get("Authorization") == "Bearer secret-token" and "bad" not in self.path
        self.send_response(200 if ok else 403)
        self.end_headers()
        self.wfile.write(b"private row contents")
    def log_message(self, *args): pass
server = http.server.HTTPServer(("127.0.0.1", 0), Handler)
threading.Thread(target=server.serve_forever, daemon=True).start()
script = drill.API_READ_SCRIPT.replace(str(drill.API_PORT), str(server.server_port))
out = subprocess.run(["python3", "-c", script], capture_output=True, text=True, check=True,
    env={**os.environ, "DRILL_TOKEN": "secret-token", "DRILL_PATHS": json.dumps(["/ok?x=1", "/bad"])}).stdout
rows = [json.loads(line) for line in out.splitlines()]
assert rows == [{"path": "/ok?x=1", "status": 200}, {"path": "/bad", "status": 403}], rows
assert "secret-token" not in out and "private" not in out
`);
});

test("the summary lists each API check and drops the not-verified note", () => {
  python(`
checks = [{"name": "health", "status": "pass", "detail": "ok"},
          {"name": "GET /x", "status": "fail", "detail": "expected 200, got 500"}]
text, passed = drill.render_summary("production", {}, {"api_start": 1.0}, 7200, ["p"], checks)
assert "| health | pass | ok |" in text and "expected 200, got 500" in text
assert "Not yet verified" not in text and not passed
`);
});
