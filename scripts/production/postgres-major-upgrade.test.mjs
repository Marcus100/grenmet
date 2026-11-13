// Runs the real postgres-major-upgrade.sh in a temp tree with stubbed docker, python3,
// node and df: argument checks, read-only dry runs, refusals before any change, and what
// a failure leaves behind on each side of the database switch.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const SECRET = "secret-marker-must-not-leak";
const ROW_DATA = "row-data-must-not-leak";
const SOURCE_IMAGE = `postgres:17@sha256:${"1".repeat(64)}`;
const TARGET_IMAGE = `postgres:18@sha256:${"8".repeat(64)}`;
const USAGE = /usage: scripts\/production\/postgres-major-upgrade\.sh/u;
const MUTATING =
  /^docker (stop|start|rm|pull|cp|volume create|compose .* up|exec .*(pg_dump|pg_restore -U|vacuumdb|init-databases|grant-api-runtime))/mu;
const NOTHING_CHANGED = /Nothing was changed/u;
const DRY_RUN_DONE = /Dry run: nothing was changed\./u;
const ROLLBACK =
  /set CORE_POSTGRES_IMAGE back to postgres:17@sha256:1{64}[\s\S]*delete CORE_PGDATA_VOLUME \(or set it to grenmet-staging_pgdata-staging\)/u;
const WRITERS_STOPPED = /^docker stop --time 60 w-api w-worker$/mu;
const WRITERS_STARTED = /^docker start w-api w-worker$/mu;

const DOCKER_STUB = `#!/bin/bash
printf 'docker %s\\n' "$*" >> "$TEST_LOG"
state=$(dirname "$TEST_LOG")
args="$*"
current_db() { if [[ -e "$state/switched" ]]; then echo newdb; else echo olddb; fi; }
fail_at() { [[ "$TEST_FAIL_AT" == "$1" ]]; }
case "$args" in
  "compose "*" config --quiet") exit 0 ;;
  "compose "*" up -d --no-deps --wait --wait-timeout 300 db") touch "$state/switched"; exit 0 ;;
  "ps -q --filter label=com.docker.compose.project="*"service=db")
    [[ -n "$TEST_NO_DB" ]] || current_db; exit 0 ;;
  "ps --filter label=com.docker.compose.project="*)
    printf 'w-api api\\nw-worker worker\\nr-redis redis\\np-proxy proxy\\n%s db\\n' "$(current_db)"; exit 0 ;;
  "inspect --format {{.Config.Image}} olddb") echo "$TEST_SOURCE_IMAGE"; exit 0 ;;
  "inspect --format {{range .Mounts}}"*)
    printf '%s %s\\n' "$TEST_SOURCE_VOLUME" "$TEST_SOURCE_MOUNT"; exit 0 ;;
  "inspect --format {{if .State.Health}}"*) echo healthy; exit 0 ;;
  "volume inspect --format {{.Name}} "*) [[ -n "$TEST_TARGET_EXISTS" ]] || exit 1; exit 0 ;;
  "volume inspect "*) [[ -n "$TEST_TARGET_EXISTS" ]] || exit 1; exit 0 ;;
  "ps -aq --filter volume="*) printf '%s' "$TEST_VOLUME_USERS"; exit 0 ;;
  "run --rm --network none"*) printf '%s' "$TEST_VOLUME_CONTENTS"; exit 0 ;;
  "info --format {{.DockerRootDir}}") echo /var/lib/docker; exit 0 ;;
  "image inspect "*) [[ -z "$TEST_IMAGE_MISSING" ]] || exit 1; exit 0 ;;
  "cp "*) [[ "$3" == *:* ]] || echo dump > "$3"; exit 0 ;;
  "exec "*"pg_isready"*) exit 0 ;;
  "exec "*"pg_dump -U"*) fail_at dump && exit 1; exit 0 ;;
  "exec "*"pg_dumpall"*) echo "CREATE ROLE app_runtime;"; exit 0 ;;
  "exec "*"pg_restore -U"*)
    if fail_at restore; then
      echo "pg_restore: error: could not execute query: ERROR:  invalid input" >&2
      echo "CONTEXT:  COPY users, line 1: $TEST_ROW_DATA" >&2
      exit 1
    fi
    exit 0 ;;
  "exec "*"SHOW server_version_num"*)
    if [[ "$args" == "exec newdb"* ]]; then echo "$TEST_TARGET_VERSION"; else echo "$TEST_SOURCE_VERSION"; fi; exit 0 ;;
  "exec "*"pg_database_size"*) echo "$TEST_SIZE_BYTES"; exit 0 ;;
  "exec "*"pg_get_userbyid(datdba)"*) printf 'app_staging app\\nwxwatch_staging wxwatch\\n'; exit 0 ;;
  "exec "*"datistemplate"*) printf 'app_staging\\nwxwatch_staging\\n'; exit 0 ;;
  "exec "*"FROM pg_roles WHERE"*) printf 'app\\napp_runtime\\nwxwatch\\n'; exit 0 ;;
  "exec "*"pg_auth_members"*) exit 0 ;;
  "exec "*"client backend"*) echo 0; exit 0 ;;
  "exec "*"query_to_xml"*) printf 'public.users\\t5\\n'; exit 0 ;;
  "exec "*"to_regclass"*) echo t; exit 0 ;;
  "exec "*"alembic_version"*) echo head1; exit 0 ;;
  "exec "*"extversion"*) echo "btree_gist 1.8"; exit 0 ;;
  "exec "*"FROM pg_extension"*) echo btree_gist; exit 0 ;;
  "exec "*"FROM pg_class c"*) echo 0; exit 0 ;;
esac
exit 0
`;

const PYTHON_STUB = `#!/bin/bash
printf 'python %s\\n' "$*" >> "$TEST_LOG"
case "$1" in
  *render-env.py)
    if [[ -n "$TEST_RENDER_FAIL" ]]; then
      echo "Deployment configuration rejected: CORE_POSTGRES_IMAGE is PostgreSQL 18 but the data volume holds PostgreSQL 17" >&2
      exit 1
    fi
    volume=\${CORE_PGDATA_VOLUME:-$(sed -n 's/^PGDATA_VOLUME=//p' "$2")}
    mount=/var/lib/postgresql/data
    [[ "$CORE_POSTGRES_IMAGE" != postgres:18* ]] || mount=/var/lib/postgresql
    printf 'POSTGRES_PASSWORD="%s"\\nCORE_POSTGRES_IMAGE="%s"\\nCORE_POSTGRES_DATA_MOUNT="%s"\\nPGDATA_VOLUME="%s"\\n' \\
      "$POSTGRES_PASSWORD" "$CORE_POSTGRES_IMAGE" "$mount" "$volume" > "$3" ;;
  *backup-gate.py)
    printf 'gate max-age=%s\\n' "$DEPLOY_BACKUP_MAX_AGE_HOURS" >> "$TEST_LOG"
    case "$TEST_GATE" in
      stale) echo "app_prod: newest backup 30.0h old (limit 6h)"; exit 10 ;;
      *) echo "app_prod: newest backup 1.0h old" ;;
    esac ;;
esac
`;

const UPGRADE_ORDER = [
  WRITERS_STOPPED,
  /^docker exec olddb .*pg_dump -U/mu,
  /^docker exec olddb .*pg_dumpall/mu,
  /^docker stop --time 120 olddb$/mu,
  /^docker volume create --label gd\.barrels\.pg-upgrade\.source=grenmet-staging_pgdata-staging grenmet-staging_pgdata18$/mu,
  /^docker compose .* up -d --no-deps --wait --wait-timeout 300 db$/mu,
  /^docker exec newdb bash \/docker-entrypoint-initdb\.d\/init-databases\.sh$/mu,
  /^docker exec newdb .*pg_restore -U/mu,
  /^docker exec newdb bash \/opt\/grenmet\/grant-api-runtime\.sh$/mu,
  /^docker exec newdb .*vacuumdb .*--analyze-in-stages/mu,
  WRITERS_STARTED,
  /^node \.\.\/\.\.\/scripts\/production\/smoke\.mjs staging\.example\.test$/mu,
];

function sandbox() {
  const root = mkdtempSync(join(tmpdir(), "pg-major-upgrade-"));
  for (const dir of [
    "scripts/production",
    "infra/docker",
    "bin",
    "locks",
    "work",
  ])
    mkdirSync(join(root, dir), { recursive: true });
  copyFileSync(
    new URL("./postgres-major-upgrade.sh", import.meta.url),
    join(root, "scripts/production/postgres-major-upgrade.sh")
  );
  for (const [environment, volume] of [
    ["staging", "grenmet-staging_pgdata-staging"],
    ["production", "grenmet_pgdata"],
  ])
    writeFileSync(
      join(root, `infra/docker/${environment}.env`),
      `ENVIRONMENT=${environment}\nBASE_DOMAIN=${environment}.example.test\nPGDATA_VOLUME=${volume}\n`
    );
  writeFileSync(join(root, "bin/docker"), DOCKER_STUB, { mode: 0o700 });
  writeFileSync(join(root, "bin/python3"), PYTHON_STUB, { mode: 0o700 });
  writeFileSync(
    join(root, "bin/node"),
    `#!/bin/bash\nprintf 'node %s\\n' "$*" >> "$TEST_LOG"\n`,
    { mode: 0o700 }
  );
  writeFileSync(
    join(root, "bin/df"),
    `#!/bin/bash\nprintf 'Filesystem 1024-blocks Used Available Capacity Mounted\\nstub 100 0 %s 1%% /\\n' "$TEST_FREE_KB"\n`,
    { mode: 0o700 }
  );
  writeFileSync(join(root, "log"), "");
  return root;
}

function run(args, env = {}, root = sandbox()) {
  const summary = join(root, "summary.md");
  const result = spawnSync(
    "bash",
    [join(root, "scripts/production/postgres-major-upgrade.sh"), ...args],
    {
      encoding: "utf8",
      env: {
        PATH: `${join(root, "bin")}:${process.env.PATH}`,
        HOME: root,
        TEST_LOG: join(root, "log"),
        CORE_LOCK_DIR: join(root, "locks"),
        PG_UPGRADE_DIR: join(root, "work"),
        PG_UPGRADE_POLL_SECONDS: "0",
        GITHUB_STEP_SUMMARY: summary,
        POSTGRES_PASSWORD: SECRET,
        CORE_POSTGRES_IMAGE: TARGET_IMAGE,
        CORE_PGDATA_VOLUME: "grenmet-staging_pgdata18",
        TEST_SOURCE_IMAGE: SOURCE_IMAGE,
        TEST_SOURCE_VOLUME: "grenmet-staging_pgdata-staging",
        TEST_SOURCE_MOUNT: "/var/lib/postgresql/data",
        TEST_SOURCE_VERSION: "170006",
        TEST_TARGET_VERSION: "180001",
        TEST_SIZE_BYTES: String(500 * 1024 * 1024),
        TEST_FREE_KB: String(40 * 1024 * 1024),
        TEST_ROW_DATA: ROW_DATA,
        ...env,
      },
    }
  );
  const log = readFileSync(join(root, "log"), "utf8");
  const output = `${result.stdout}${result.stderr}`;
  const summaryText = existsSync(summary) ? readFileSync(summary, "utf8") : "";
  rmSync(root, { recursive: true, force: true });
  return { status: result.status, output, log, summary: summaryText };
}

const UPGRADE = ["--environment", "staging", "--confirm", "staging"];
const DRY_RUN = [...UPGRADE, "--dry-run"];

test("refuses to run without a valid environment and a matching confirmation", () => {
  for (const [args, message] of [
    [[], "--environment must be staging or production"],
    [["--environment", "dev", "--confirm", "dev"], "--environment must be"],
    [["--environment", "staging"], "--confirm must repeat the environment"],
    [["--environment", "staging", "--dry-run"], "--confirm must repeat"],
    [
      ["--environment", "production", "--confirm", "staging"],
      "--confirm must repeat the environment name ('production')",
    ],
    [["--environment"], "--environment needs a value"],
    [[...UPGRADE, "--force"], "unknown argument '--force'"],
  ]) {
    const { status, output, log } = run(args);
    assert.equal(status, 2, `${args.join(" ")}: ${output}`);
    assert.ok(output.includes(message), `${args.join(" ")}: ${output}`);
    assert.match(output, USAGE);
    assert.equal(log, "", "nothing may run before the arguments are valid");
  }
  const project = run(UPGRADE, { COMPOSE_PROJECT: "grenmet" });
  assert.equal(project.status, 2);
  assert.ok(project.output.includes("COMPOSE_PROJECT must be grenmet-staging"));
});

test("a dry run checks the preconditions, prints the plan and changes nothing", () => {
  const { status, output, log, summary } = run(DRY_RUN);
  assert.equal(status, 0, output);
  assert.match(output, DRY_RUN_DONE);
  assert.ok(
    output.includes("Source: PostgreSQL 17 (170006), image postgres:17@sha256:")
  );
  assert.ok(
    output.includes(
      "volume grenmet-staging_pgdata18 mounted at /var/lib/postgresql"
    )
  );
  assert.ok(
    output.includes("Services to stop while the data moves: api worker")
  );
  assert.ok(output.includes("Databases: app_staging wxwatch_staging"));
  assert.ok(output.includes("stop 2 service containers"));
  assert.ok(output.includes("delete CORE_PGDATA_VOLUME, and run Deploy"));
  assert.doesNotMatch(log, MUTATING);
  assert.equal(output.includes(SECRET), false, "a secret was printed");
  assert.ok(summary.includes("| preflight |"));
  assert.ok(summary.includes("dry run) succeeded"));
});

test("production needs a fresh backup, checked before anything changes", () => {
  const production = {
    CORE_PGDATA_VOLUME: "grenmet_pgdata18",
    TEST_SOURCE_VOLUME: "grenmet_pgdata",
  };
  const args = ["--environment", "production", "--confirm", "production"];
  const fresh = run([...args, "--dry-run"], production);
  assert.equal(fresh.status, 0, fresh.output);
  assert.ok(fresh.log.includes("gate max-age=6"));
  const stale = run(args, { ...production, TEST_GATE: "stale" });
  assert.equal(stale.status, 1);
  assert.ok(stale.output.includes("Run Database Backup"));
  assert.match(stale.output, NOTHING_CHANGED);
  assert.doesNotMatch(stale.log, MUTATING);
});

test("refusals in the preflight leave the database and services untouched", () => {
  for (const [env, message] of [
    [
      { TEST_RENDER_FAIL: "1" },
      "render-env.py rejected the target configuration",
    ],
    [{ TEST_NO_DB: "1" }, "Expected exactly one running db container"],
    [
      {
        CORE_POSTGRES_IMAGE: SOURCE_IMAGE,
        CORE_PGDATA_VOLUME: "grenmet-staging_pgdata-staging",
      },
      "still name the running PostgreSQL 17 database",
    ],
    [
      { TEST_TARGET_EXISTS: "1", TEST_VOLUME_USERS: "c0ffee" },
      "is in use by container(s) c0ffee",
    ],
    [
      { TEST_TARGET_EXISTS: "1", TEST_VOLUME_CONTENTS: "18" },
      "already holds data",
    ],
    [{ TEST_FREE_KB: String(1024 * 1024) }, "Not enough free disk"],
    [{ TEST_SOURCE_VERSION: "180001" }, "is not newer than the running 18"],
  ]) {
    const { status, output, log } = run(UPGRADE, env);
    assert.equal(status, 1, `${message}: ${output}`);
    assert.ok(output.includes(message), `${message}: ${output}`);
    assert.match(output, NOTHING_CHANGED);
    assert.doesNotMatch(log, MUTATING, message);
    assert.equal(output.includes(SECRET), false);
  }
});

test("a finished upgrade is recognised, an unfinished one is refused", () => {
  const upgraded = {
    CORE_PGDATA_VOLUME: "grenmet-staging_pgdata18",
    TEST_SOURCE_VOLUME: "grenmet-staging_pgdata18",
    TEST_SOURCE_MOUNT: "/var/lib/postgresql",
    TEST_SOURCE_VERSION: "180001",
  };
  const unfinished = run(UPGRADE, upgraded);
  assert.equal(unfinished.status, 1);
  assert.ok(unfinished.output.includes("no completed upgrade is recorded"));

  const root = sandbox();
  writeFileSync(
    join(root, "work/staging.completed"),
    "volume=grenmet-staging_pgdata18\n"
  );
  const done = run(UPGRADE, upgraded, root);
  assert.equal(done.status, 0, done.output);
  assert.ok(done.output.includes("Already upgraded"));
  assert.doesNotMatch(done.log, MUTATING);
});

test("an upgrade stops the writers, dumps, switches, restores, checks and reopens in order", () => {
  const { status, output, log } = run(UPGRADE);
  assert.equal(status, 0, output);
  let position = 0;
  for (const step of UPGRADE_ORDER) {
    const match = step.exec(log.slice(position));
    assert.ok(match, `missing or out of order: ${step}`);
    position += match.index + match[0].length;
  }
  // The old volume is only ever read: nothing removes or recreates it.
  assert.equal(log.includes("volume rm"), false);
  assert.equal(
    log.includes("volume create grenmet-staging_pgdata-staging"),
    false
  );
  assert.ok(output.includes("Every database matches"));
  assert.ok(output.includes("app_staging: 1 tables, Alembic head1"));
  assert.equal(output.includes(SECRET), false);
});

test("a failure before the switch restarts the stopped services", () => {
  const { status, output, log } = run(UPGRADE, { TEST_FAIL_AT: "dump" });
  assert.equal(status, 1);
  assert.ok(output.includes("The database was not switched"));
  assert.ok(output.includes("The stopped services were started again."));
  assert.match(log, WRITERS_STOPPED);
  assert.match(log, WRITERS_STARTED);
  assert.equal(log.includes("stop --time 120 olddb"), false);
});

test("a failure after the switch keeps the services stopped and prints the rollback", () => {
  const { status, output, log } = run(UPGRADE, { TEST_FAIL_AT: "restore" });
  assert.equal(status, 1);
  assert.ok(output.includes("Restoring app_staging failed"));
  assert.ok(output.includes("pg_restore: error: could not execute query"));
  assert.equal(output.includes(ROW_DATA), false, "restored rows were printed");
  assert.ok(output.includes("The services stay stopped"));
  assert.match(output, ROLLBACK);
  assert.doesNotMatch(log, WRITERS_STARTED);
  assert.equal(output.includes(SECRET), false);
});
