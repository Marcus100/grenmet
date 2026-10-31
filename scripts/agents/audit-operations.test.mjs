import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

const script = resolve("scripts/agents/audit-operations.py");
const root = resolve(".");
const beginReadOnlyPattern = /BEGIN READ ONLY;/g;
const privateMetadataPattern = /expiresAt|secret name/i;

function fixture(t, environments) {
  const dir = mkdtempSync(join(tmpdir(), "audit-operations-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const config = join(dir, "config.json");
  writeFileSync(config, JSON.stringify({ environments }));
  chmodSync(config, 0o600);
  return { config, dir };
}

function makeExecutable(path, body) {
  writeFileSync(path, body);
  chmodSync(path, 0o700);
}

function run(args, env = {}) {
  return spawnSync("python3", [script, ...args], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, ...env },
    timeout: 10_000,
  });
}

test("eRegister and WIS2 use fixed read-only aggregate SQL and write a private receipt", (t) => {
  const { config, dir } = fixture(t, {
    staging: { databaseUrl: "postgresql://readonly:fake@db/staging" },
    production: { databaseUrl: "postgresql://readonly:fake@db/production" },
  });
  const bin = join(dir, "bin");
  mkdirSync(bin);
  const sqlLog = join(dir, "sql.log");
  const psql = join(bin, "psql");
  makeExecutable(
    psql,
    `#!/bin/sh\nprintf '%s\\n' "$*" >> '${sqlLog}'\ncat >> '${sqlLog}'\nprintf '%s\\n' "$PGDATABASE" >> '${sqlLog}'\ncase "$PGDATABASE" in *staging*) printf '2,3\\n' ;; *) printf '1,4\\n' ;; esac\n`
  );

  for (const [source, expected] of [
    [
      "eregister-sends",
      { staging: { failures: 5 }, production: { failures: 5 } },
    ],
    ["wis2-sends", { staging: { failures: 5 }, production: { failures: 5 } }],
  ]) {
    const output = join(dir, `${source}.json`);
    const result = run(
      ["--source", source, "--config", config, "--output", output],
      { PATH: `${bin}:${process.env.PATH}` }
    );
    assert.equal(result.status, 0, result.stderr);
    const receipt = JSON.parse(readFileSync(output, "utf8"));
    assert.equal(receipt.source, source);
    assert.equal(receipt.complete, true);
    assert.deepEqual(receipt.environments, expected);
    assert.equal(statSync(output).mode % 0o1000, 0o600);
  }

  const sql = readFileSync(sqlLog, "utf8");
  assert.equal(sql.split("--quiet").length - 1, 4);
  assert.equal((sql.match(beginReadOnlyPattern) ?? []).length, 4);
  assert.ok(sql.includes("FROM public.eregister_send"));
  assert.ok(sql.includes("INTERVAL '15 minutes'"));
  assert.equal(
    ["last_error", "detail", "observation_id", "station_id"].some((field) =>
      sql.toLowerCase().includes(field)
    ),
    false
  );
  assert.ok(sql.includes("WHERE target = 'email'"));
  assert.ok(sql.includes("WHERE target = 'wis2'"));
});

test("database failure publishes no receipt and does not leak command output", (t) => {
  const { config, dir } = fixture(t, {
    staging: { databaseUrl: "postgresql://readonly:fake@db/staging" },
    production: { databaseUrl: "postgresql://readonly:fake@db/production" },
  });
  const bin = join(dir, "bin");
  mkdirSync(bin);
  makeExecutable(
    join(bin, "psql"),
    "#!/bin/sh\nprintf 'secret detail from stderr' >&2\nexit 1\n"
  );
  const output = join(dir, "must-not-exist.json");
  const result = run(
    ["--source", "wis2-sends", "--config", config, "--output", output],
    { PATH: `${bin}:${process.env.PATH}` }
  );
  assert.equal(result.status, 2);
  assert.equal(result.stderr.includes("secret detail"), false);
  assert.equal(existsSync(output), false);
});

test("worker counters refuse the existing partial-coverage metrics report", (t) => {
  const urls = {
    staging: { telemetryRedisUrl: "redis://fake/staging" },
    production: { telemetryRedisUrl: "redis://fake/production" },
  };
  const { config, dir } = fixture(t, urls);
  const bin = join(dir, "bin");
  mkdirSync(bin);
  makeExecutable(
    join(bin, "uv"),
    `#!/bin/sh\nprintf '%s\\n' '{"environment":"'"$TELEMETRY_ENVIRONMENT"'","days":1,"completeness":"partial","jobs":{"process_cap_jobs|completed":1,"process_cap_jobs|failed":2,"ingest_cap_feeds|completed":1,"ingest_cap_feeds|failed":0,"send_notification_emails|completed":1,"send_notification_emails|failed":3,"run_notification_sweeps|completed":1,"run_notification_sweeps|failed":0}}'\n`
  );
  const output = join(dir, "worker.json");
  const result = run(
    ["--source", "worker-jobs", "--config", config, "--output", output],
    { PATH: `${bin}:${process.env.PATH}` }
  );
  assert.equal(result.status, 2);
  assert.ok(result.stderr.includes("telemetry report incomplete"));
  assert.equal(existsSync(output), false);
});

test("worker counters accept a complete previous-day report and count failures", (t) => {
  const { config, dir } = fixture(t, {
    staging: { telemetryRedisUrl: "redis://fake/staging" },
    production: { telemetryRedisUrl: "redis://fake/production" },
  });
  const bin = join(dir, "bin");
  mkdirSync(bin);
  const argsLog = join(dir, "args.log");
  makeExecutable(
    join(bin, "uv"),
    `#!/bin/sh\nprintf '%s\\n' "$*" >> '${argsLog}'\nprintf '%s\\n' '{"environment":"'"$TELEMETRY_ENVIRONMENT"'","days":1,"windowKind":"previous-UTC-day","completeness":"complete","jobs":{"process_cap_jobs|completed":1,"process_cap_jobs|failed":2,"ingest_cap_feeds|completed":1,"send_notification_emails|completed":1,"send_notification_emails|failed":3,"run_notification_sweeps|completed":1}}'\n`
  );
  for (const [source, failures] of [
    ["worker-jobs", 5],
    ["notification-sweeps", 0],
  ]) {
    const output = join(dir, `${source}.json`);
    const result = run(
      ["--source", source, "--config", config, "--output", output],
      { PATH: `${bin}:${process.env.PATH}` }
    );
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(readFileSync(output, "utf8")).environments, {
      staging: { failures },
      production: { failures },
    });
  }
  assert.ok(readFileSync(argsLog, "utf8").includes("--complete-day"));
});

test("secret expiry receipt contains counts only and requires protected config", (t) => {
  const { config, dir } = fixture(t, {
    staging: {
      secrets: [
        { expiresAt: "2000-01-01T00:00:00Z" },
        { expiresAt: "2999-01-01T00:00:00Z" },
      ],
    },
    production: { secrets: [{ expiresAt: "2000-01-01T00:00:00Z" }] },
  });
  const output = join(dir, "secrets.json");
  const result = run([
    "--source",
    "secrets",
    "--config",
    config,
    "--output",
    output,
  ]);
  assert.equal(result.status, 0, result.stderr);
  const receipt = JSON.parse(readFileSync(output, "utf8"));
  assert.deepEqual(receipt.environments, {
    staging: { failures: 1 },
    production: { failures: 1 },
  });
  assert.equal(
    privateMetadataPattern.test(readFileSync(output, "utf8")),
    false
  );

  chmodSync(config, 0o644);
  const rejected = run([
    "--source",
    "secrets",
    "--config",
    config,
    "--output",
    output,
  ]);
  assert.equal(rejected.status, 2);
  assert.ok(rejected.stderr.includes("permissions"));
  assert.deepEqual(JSON.parse(readFileSync(output, "utf8")), receipt);
});

test("notification sweep source refuses missing per-environment coverage", (t) => {
  const { config, dir } = fixture(t, {
    staging: { telemetryRedisUrl: "redis://fake/staging" },
    production: { telemetryRedisUrl: "redis://fake/production" },
  });
  const bin = join(dir, "bin");
  mkdirSync(bin);
  makeExecutable(
    join(bin, "uv"),
    `#!/bin/sh\nif [ "$TELEMETRY_ENVIRONMENT" = staging ]; then\n  printf '%s\\n' '{"environment":"staging","days":1,"completeness":"partial","jobs":{"run_notification_sweeps|failed":1}}'\nelse\n  printf '%s\\n' '{"environment":"production","days":1,"completeness":"partial","jobs":{}}'\nfi\n`
  );
  const output = join(dir, "sweeps.json");
  const result = run(
    ["--source", "notification-sweeps", "--config", config, "--output", output],
    { PATH: `${bin}:${process.env.PATH}` }
  );
  assert.equal(result.status, 2);
  assert.ok(result.stderr.includes("telemetry report incomplete"));
  assert.equal(existsSync(output), false);
});

test("backup source invokes the existing freshness checker without exposing output", (t) => {
  const { config, dir } = fixture(t, {
    staging: { backupKinds: ["core", "weather"] },
    production: { backupKinds: ["core"] },
  });
  const harness = `
import contextlib, importlib.util, io, json, pathlib, sys
module_path = pathlib.Path(sys.argv[1])
spec = importlib.util.spec_from_file_location("audit_operations", module_path)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
calls = []
def fake(args, **kwargs):
    calls.append(args)
    return module.subprocess.CompletedProcess(args, 0, "", "must-not-be-published")
with contextlib.redirect_stdout(io.StringIO()):
    status = module.main(["--source", "backups", "--config", sys.argv[2], "--output", sys.argv[3]], runner=fake)
print(json.dumps({"status": status, "calls": calls}))
`;
  const result = spawnSync(
    "python3",
    ["-c", harness, script, config, join(dir, "backups.json")],
    {
      cwd: root,
      encoding: "utf8",
      timeout: 10_000,
    }
  );
  assert.equal(result.status, 0, result.stderr);
  const data = JSON.parse(result.stdout);
  assert.equal(data.status, 0);
  assert.ok(
    data.calls.some(
      (args) => args.includes("staging") && args.includes("weather")
    )
  );
  assert.ok(data.calls.some((args) => args.includes("production")));
  const receiptText = readFileSync(join(dir, "backups.json"), "utf8");
  assert.equal(receiptText.includes("must-not-be-published"), false);
  assert.deepEqual(JSON.parse(receiptText).environments, {
    staging: { failures: 0 },
    production: { failures: 0 },
  });
});
