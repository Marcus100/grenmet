// Runs the real postgres-major-upgrade.sh in a temp tree with stubbed docker, python3,
// node and df: argument checks, read-only dry runs, refusals before any change, the
// markers that block deploys, and what a failure leaves behind on each side of the switch.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
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

const SECRET = "secret-marker-must-not-leak";
const ROW_DATA = "row-data-must-not-leak";
const SOURCE_IMAGE = `postgres:17@sha256:${"1".repeat(64)}`;
const TARGET_IMAGE = `postgres:18@sha256:${"8".repeat(64)}`;
const NEW_VOLUME = "grenmet-staging_pgdata18";
const USAGE = /usage: scripts\/production\/postgres-major-upgrade\.sh/u;
const MUTATING =
  /^docker (stop|start|rm|pull|cp|update|volume create|compose .* up|exec .*(pg_dump|pg_restore -U|vacuumdb|init-databases|grant-api-runtime|rm -f))/mu;
const NOTHING_CHANGED = /Nothing was changed/u;
const DRY_RUN_DONE = /Dry run: nothing was changed\./u;
const ROLLBACK =
  /set CORE_POSTGRES_IMAGE back to postgres:17@sha256:1{64}[\s\S]*delete CORE_PGDATA_VOLUME \(or set it to grenmet-staging_pgdata-staging\)[\s\S]*mode clear-marker[\s\S]*Run Deploy/u;
const WRITERS_HELD = /^docker update --restart=no w-api w-worker$/mu;
const WRITERS_STOPPED = /^docker stop --time 60 w-api w-worker$/mu;
const POLICY_RESTORED =
  /^docker update --restart=always w-api\ndocker update --restart=on-failure:3 w-worker$/mu;
const WRITERS_STARTED = /^docker start w-api w-worker$/mu;
const SMOKE =
  /^node \.\.\/\.\.\/scripts\/production\/smoke\.mjs staging\.example\.test$/mu;
const DUMP = /pg_dump -U/u;
const CONTAINER_DUMPS_REMOVED =
  /^docker exec (olddb|newdb) sh -c rm -f \/tmp\/pg-upgrade-\*\.dump$/mu;

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
  "inspect --format {{.Config.Image}} "*) echo "$TEST_SOURCE_IMAGE"; exit 0 ;;
  "inspect --format {{range .Mounts}}"*)
    printf '%s %s\\n' "$TEST_SOURCE_VOLUME" "$TEST_SOURCE_MOUNT"; exit 0 ;;
  "inspect --format {{.HostConfig.RestartPolicy"*" w-api") echo always; exit 0 ;;
  "inspect --format {{.HostConfig.RestartPolicy"*" w-worker") echo on-failure:3; exit 0 ;;
  "inspect --format {{if .State.Health}}"*) echo healthy; exit 0 ;;
  "volume inspect --format {{.Name}} "*) [[ -n "$TEST_TARGET_EXISTS" ]] || exit 1; exit 0 ;;
  "volume inspect "*) [[ -n "$TEST_TARGET_EXISTS" ]] || exit 1; exit 0 ;;
  "update --restart=no "*)
    [[ ! -e "$PG_UPGRADE_DIR/staging.in-progress" ]] || echo "marker written before the writers stop" >> "$TEST_LOG"
    exit 0 ;;
  "volume create "*)
    [[ ! -e "$PG_UPGRADE_DIR/staging.in-progress" ]] || echo "marker written before the volume" >> "$TEST_LOG"
    exit 0 ;;
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
    # Like the real one, never overwrites an existing file (O_EXCL).
    [[ ! -e "$3" ]] || { echo "Deployment configuration rejected: [Errno 17] File exists" >&2; exit 1; }
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

// One disk for everything unless TEST_SEPARATE_DISKS puts the run directory elsewhere.
const DF_STUB = `#!/bin/bash
fs="stub /"
[[ -z "$TEST_SEPARATE_DISKS" || "$*" != *work* ]] || fs="other /srv"
printf 'Filesystem 1024-blocks Used Available Capacity Mounted\\n%s 100 0 %s 1%% %s\\n' "\${fs% *}" "$TEST_FREE_KB" "\${fs#* }"
`;

const UPGRADE_ORDER = [
  WRITERS_HELD,
  /^marker written before the writers stop$/mu,
  WRITERS_STOPPED,
  /^docker exec olddb .*pg_dump -U/mu,
  /^docker exec olddb .*pg_dumpall/mu,
  /^docker stop --time 120 olddb$/mu,
  /^docker volume create --label gd\.barrels\.pg-upgrade\.source=grenmet-staging_pgdata-staging grenmet-staging_pgdata18$/mu,
  /^marker written before the volume$/mu,
  /^docker compose .* up -d --no-deps --wait --wait-timeout 300 db$/mu,
  /^docker exec newdb bash \/docker-entrypoint-initdb\.d\/init-databases\.sh$/mu,
  /^docker exec newdb .*pg_restore -U/mu,
  /^docker exec newdb bash \/opt\/grenmet\/grant-api-runtime\.sh$/mu,
  /^docker exec newdb .*vacuumdb .*--analyze-in-stages/mu,
  POLICY_RESTORED,
  WRITERS_STARTED,
  SMOKE,
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
    `#!/bin/bash\nprintf 'node %s\\n' "$*" >> "$TEST_LOG"\n[[ "$TEST_FAIL_AT" != smoke ]] || exit 1\n`,
    { mode: 0o700 }
  );
  writeFileSync(join(root, "bin/df"), DF_STUB, { mode: 0o700 });
  writeFileSync(join(root, "log"), "");
  return root;
}

// Runs the script once. A sandbox passed in is kept (and its log reset), so a test can
// run again on what the first run left behind; otherwise it is removed.
function run(args, env = {}, given = null) {
  const root = given ?? sandbox();
  const summary = join(root, "summary.md");
  writeFileSync(join(root, "log"), "");
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
        CORE_PGDATA_VOLUME: NEW_VOLUME,
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
  const work = readdirSync(join(root, "work"), { recursive: true }).map(String);
  if (!given) rmSync(root, { recursive: true, force: true });
  return { status: result.status, output, log, summary: summaryText, work };
}

const UPGRADE = ["--environment", "staging", "--confirm", "staging"];
const DRY_RUN = [...UPGRADE, "--dry-run"];
const CLEAR = [...UPGRADE, "--clear-marker"];
// The running db after the switch: PostgreSQL 18 on the new volume.
const ON_NEW_VOLUME = {
  TEST_SOURCE_VOLUME: NEW_VOLUME,
  TEST_SOURCE_MOUNT: "/var/lib/postgresql",
  TEST_SOURCE_VERSION: "180001",
};
const ROLLED_BACK = {
  CORE_POSTGRES_IMAGE: SOURCE_IMAGE,
  CORE_PGDATA_VOLUME: "",
};
const has = (work, name) => work.includes(name);
// Octal permission digits of a path, for example "755".
const permissions = (path) => statSync(path).mode.toString(8).slice(-3);

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
    [[...DRY_RUN, "--clear-marker"], "cannot be combined"],
    [[...UPGRADE, "--accept-data-loss"], "only applies to --clear-marker"],
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
  const { status, output, log, summary, work } = run(DRY_RUN);
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
  assert.ok(output.includes('2 service containers to "no"'));
  assert.ok(output.includes("run this workflow with mode\nclear-marker"));
  assert.doesNotMatch(log, MUTATING);
  assert.deepEqual(work, []);
  assert.equal(output.includes(SECRET), false, "a secret was printed");
  assert.ok(summary.includes("| preflight |"));
  assert.ok(summary.includes("dry-run) succeeded"));
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

test("free disk counts the data three times on one disk, and per disk when separate", () => {
  // 10 GB of data, 25 GB free: one disk needs 32 GB, separate disks 22 GB and 12 GB.
  const sized = {
    TEST_SIZE_BYTES: String(10 * 1024 ** 3),
    TEST_FREE_KB: String(25 * 1024 ** 2),
  };
  const shared = run(DRY_RUN, sized);
  assert.equal(shared.status, 1, shared.output);
  assert.ok(shared.output.includes("(one disk)"));
  assert.ok(shared.output.includes("need 32768 MB"));
  const separate = run(DRY_RUN, { ...sized, TEST_SEPARATE_DISKS: "1" });
  assert.equal(separate.status, 0, separate.output);
  assert.ok(separate.output.includes("need 22528 MB"));
  assert.ok(separate.output.includes("need 12288 MB"));
});

test("an upgrade holds the writers, dumps, marks, switches, restores, checks and reopens in order", () => {
  const { status, output, log, work } = run(UPGRADE);
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
  // Complete: deploys run again, and the roles dump with password hashes is gone.
  assert.ok(has(work, "staging.completed"));
  assert.ok(has(work, "staging.verified"));
  assert.equal(has(work, "staging.in-progress"), false);
  const run_dir = work.find((name) => name.startsWith("staging-2"));
  assert.ok(has(work, `${run_dir}/dumps/app_staging.dump`), "dumps are kept");
  assert.equal(has(work, `${run_dir}/globals.sql`), false);
  assert.ok(output.includes(`rm -rf '`));
});

test("a finished upgrade is recognised, an unverified one is refused", () => {
  const unfinished = run(UPGRADE, ON_NEW_VOLUME);
  assert.equal(unfinished.status, 1);
  assert.ok(unfinished.output.includes("its data was never verified"));

  const root = sandbox();
  writeFileSync(join(root, "work/staging.completed"), `volume=${NEW_VOLUME}\n`);
  const done = run(UPGRADE, ON_NEW_VOLUME, root);
  rmSync(root, { recursive: true, force: true });
  assert.equal(done.status, 0, done.output);
  assert.ok(done.output.includes("Already upgraded"));
  assert.doesNotMatch(done.log, MUTATING);
});

test("a failure before the switch restores the services and leaves no marker", () => {
  const { status, output, log, work } = run(UPGRADE, { TEST_FAIL_AT: "dump" });
  assert.equal(status, 1);
  assert.ok(output.includes("The database was not switched"));
  assert.ok(output.includes("The stopped services were started again."));
  assert.match(log, WRITERS_HELD);
  assert.match(log, POLICY_RESTORED);
  assert.match(log, WRITERS_STARTED);
  assert.match(log, CONTAINER_DUMPS_REMOVED);
  assert.ok(log.includes("marker written before the writers stop"));
  assert.equal(log.includes("stop --time 120 olddb"), false);
  // Services back, so deploys may run again; no role hashes left behind.
  assert.equal(has(work, "staging.in-progress"), false);
  assert.equal(
    work.some((name) => name.endsWith("globals.sql")),
    false
  );
});

test("a failure after the switch keeps the services stopped, the marker set and prints the rollback", () => {
  const { status, output, log, work } = run(UPGRADE, {
    TEST_FAIL_AT: "restore",
  });
  assert.equal(status, 1);
  assert.ok(output.includes("Restoring app_staging failed"));
  assert.ok(output.includes("pg_restore: error: could not execute query"));
  assert.equal(output.includes(ROW_DATA), false, "restored rows were printed");
  assert.ok(output.includes("The services stay stopped"));
  assert.match(output, ROLLBACK);
  assert.doesNotMatch(log, WRITERS_STARTED);
  assert.doesNotMatch(log, POLICY_RESTORED);
  assert.match(log, CONTAINER_DUMPS_REMOVED);
  assert.ok(has(work, "staging.in-progress"));
  assert.equal(has(work, "staging.verified"), false);
  assert.equal(has(work, "staging.completed"), false);
  // Role definitions with password hashes do not outlive a failed run; dumps stay.
  assert.equal(
    work.some((name) => name.endsWith("globals.sql")),
    false
  );
  assert.ok(work.some((name) => name.endsWith("dumps/app_staging.dump")));
  assert.equal(output.includes(SECRET), false);
});

test("a failed reopen keeps the marker; the next run only restarts and smoke-checks", () => {
  const root = sandbox();
  try {
    const first = run(UPGRADE, { TEST_FAIL_AT: "smoke" }, root);
    assert.equal(first.status, 1);
    assert.ok(first.output.includes("passed every data check"));
    assert.ok(has(first.work, "staging.verified"));
    assert.ok(has(first.work, "staging.in-progress"));
    assert.equal(has(first.work, "staging.completed"), false);

    const dry = run(DRY_RUN, ON_NEW_VOLUME, root);
    assert.equal(dry.status, 0, dry.output);
    assert.ok(dry.output.includes("would start the 2 stopped containers"));
    assert.doesNotMatch(dry.log, MUTATING);

    const second = run(UPGRADE, ON_NEW_VOLUME, root);
    assert.equal(second.status, 0, second.output);
    assert.doesNotMatch(second.log, DUMP);
    assert.match(second.log, POLICY_RESTORED);
    assert.match(second.log, WRITERS_STARTED);
    assert.match(second.log, SMOKE);
    assert.ok(has(second.work, "staging.completed"));
    assert.equal(has(second.work, "staging.in-progress"), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("an unfinished upgrade blocks a new one until it is rolled back and cleared", () => {
  const root = sandbox();
  try {
    const failed = run(UPGRADE, { TEST_FAIL_AT: "restore" }, root);
    assert.equal(failed.status, 1);
    // Rolled back by Deploy (17 on the old volume again), marker still there.
    rmSync(join(root, "switched"));
    const blocked = run(DRY_RUN, {}, root);
    assert.equal(blocked.status, 1);
    assert.ok(blocked.output.includes("An unfinished upgrade is recorded"));

    // Clearing refuses while the variables still name the unverified volume.
    const early = run(CLEAR, ON_NEW_VOLUME, root);
    assert.equal(early.status, 1);
    assert.ok(early.output.includes("whose data was never verified"));
    assert.ok(existsSync(join(root, "work/staging.in-progress")));

    // After the variables are set back it restores the policies and removes the marker.
    const cleared = run(CLEAR, ROLLED_BACK, root);
    assert.equal(cleared.status, 0, cleared.output);
    assert.match(cleared.log, POLICY_RESTORED);
    assert.doesNotMatch(cleared.log, WRITERS_STARTED);
    assert.ok(cleared.output.includes("Next: run Deploy for staging"));
    assert.equal(existsSync(join(root, "work/staging.in-progress")), false);

    const nothing = run(CLEAR, ROLLED_BACK, root);
    assert.equal(nothing.status, 0);
    assert.ok(nothing.output.includes("nothing to clear"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

const WORKFLOW = readFileSync(
  new URL(
    "../../.github/workflows/postgres-major-upgrade.yml",
    import.meta.url
  ),
  "utf8"
);
const TRIGGERS = WORKFLOW.split("\npermissions:")[0];
const UPGRADE_JOB = WORKFLOW.split("\n  upgrade:\n")[1] ?? "";
const OTHER_TRIGGERS =
  /^\s+(push|pull_request|pull_request_target|workflow_call|workflow_run|schedule):/mu;
const USES = /^\s+(?:- )?uses: (\S+)/gmu;
const PINNED_ACTION = /^[\w.-]+\/[\w.-]+@[0-9a-f]{40}$/u;
const INPUT_IN_RUN = /run: [|>]?[^\n]*\$\{\{ inputs\./u;
const JOB_CONDITION = /^ {4}if:/mu;
const DOLLAR = "$";
const SHELL_PGDATA_VOLUME = /^\s+PGDATA_VOLUME:/mu;

function requiredSecrets() {
  const result = spawnSync(
    "python3",
    [
      "-c",
      "import importlib.util, json, sys; s = importlib.util.spec_from_file_location('r', sys.argv[1]); m = importlib.util.module_from_spec(s); s.loader.exec_module(m); print(json.dumps(m.REQUIRED_SECRETS + m.STAGING_ONLY_SECRETS))",
      new URL("./render-env.py", import.meta.url).pathname,
    ],
    { encoding: "utf8" }
  );
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

test("the upgrade workflow is manual, ref-checked, protected and serialised with deploys", () => {
  assert.ok(TRIGGERS.includes("workflow_dispatch:"));
  assert.doesNotMatch(TRIGGERS, OTHER_TRIGGERS);
  for (const input of [
    "options: [staging, production]",
    "options: [dry-run, upgrade, clear-marker, clear-marker-accept-data-loss]",
    "default: dry-run",
    "confirm:",
  ])
    assert.ok(TRIGGERS.includes(input), input);
  // Deploy's own ref check runs first and fails visibly; the droplet job needs it and
  // has no condition that could skip it green.
  assert.ok(WORKFLOW.includes("\n  validate-ref:\n"));
  assert.ok(WORKFLOW.includes("run: bash scripts/production/validate-ref.sh"));
  assert.ok(WORKFLOW.includes(`DEPLOY_ENV: ${DOLLAR}{{ inputs.environment }}`));
  assert.ok(UPGRADE_JOB.startsWith("    needs: validate-ref\n"));
  assert.doesNotMatch(UPGRADE_JOB, JOB_CONDITION);
  // Same runner labels and concurrency groups as deploy.yml.
  assert.ok(
    UPGRADE_JOB.includes(
      `runs-on: [self-hosted, "\${{ inputs.environment }}", core]`
    )
  );
  assert.ok(
    UPGRADE_JOB.includes(
      `group: \${{ inputs.environment == 'production' && 'prod-droplet' || 'core-staging' }}`
    )
  );
  assert.ok(UPGRADE_JOB.includes("cancel-in-progress: false"));
  assert.ok(UPGRADE_JOB.includes(`name: ${DOLLAR}{{ inputs.environment }}`));
  // Read-only token; no registry, issue or deployment writes.
  assert.equal(WORKFLOW.includes(": write"), false);
  for (const [, action] of WORKFLOW.matchAll(USES))
    assert.match(action, PINNED_ACTION, action);
  assert.doesNotMatch(WORKFLOW, INPUT_IN_RUN);
});

test("the upgrade workflow passes every secret render-env.py requires, and the volume switch safely", () => {
  for (const name of requiredSecrets())
    assert.ok(
      WORKFLOW.includes(`          ${name}: \${{`),
      `${name} is not passed`
    );
  for (const name of [
    "CORE_POSTGRES_IMAGE",
    "CORE_PGDATA_VOLUME",
    "CORE_REDIS_IMAGE",
    "CORE_PRIVATE_IP",
  ])
    assert.ok(WORKFLOW.includes(`${name}: \${{ vars.${name} }}`), name);
  assert.doesNotMatch(WORKFLOW, SHELL_PGDATA_VOLUME);
  assert.ok(WORKFLOW.includes("clear-marker) mode=(--clear-marker) ;;"));
  assert.ok(
    WORKFLOW.includes(
      "clear-marker-accept-data-loss) mode=(--clear-marker --accept-data-loss) ;;"
    )
  );
  assert.ok(
    WORKFLOW.includes(
      'bash scripts/production/postgres-major-upgrade.sh \\\n            --environment "$UPGRADE_ENVIRONMENT" --confirm "$UPGRADE_CONFIRM"'
    )
  );
});

test("backups and monitoring maintenance refuse to run during an unfinished upgrade", () => {
  for (const name of ["backup-database.yml", "monitoring-maintenance.yml"]) {
    const source = readFileSync(
      new URL(`../../.github/workflows/${name}`, import.meta.url),
      "utf8"
    );
    assert.ok(source.includes("/var/backups/grenmet/pg-major-upgrade"), name);
    assert.ok(source.includes(".in-progress"), name);
  }
  const inventory = readFileSync(
    new URL("../../.github/workflows/ensure-databases.yml", import.meta.url),
    "utf8"
  );
  assert.ok(
    inventory.includes(
      `group: \${{ inputs.environment == 'production' && 'prod-droplet' || 'core-staging' }}`
    )
  );
});

test("after the services ran on the new database, a rollback needs --accept-data-loss", () => {
  const root = sandbox();
  try {
    const failed = run(UPGRADE, { TEST_FAIL_AT: "smoke" }, root);
    assert.equal(failed.status, 1);
    const marker = readFileSync(join(root, "work/staging.in-progress"), "utf8");
    assert.ok(marker.includes("reopened=1"));

    const refused = run(CLEAR, ROLLED_BACK, root);
    assert.equal(refused.status, 1);
    assert.ok(refused.output.includes("--accept-data-loss"));
    assert.ok(refused.output.includes("drops them"));
    assert.ok(existsSync(join(root, "work/staging.in-progress")));

    const accepted = run([...CLEAR, "--accept-data-loss"], ROLLED_BACK, root);
    assert.equal(accepted.status, 0, accepted.output);
    assert.ok(accepted.output.includes("not carried back"));
    assert.equal(existsSync(join(root, "work/staging.in-progress")), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("verified data on the new volume can be accepted without a rollback", () => {
  const root = sandbox();
  try {
    run(UPGRADE, { TEST_FAIL_AT: "smoke" }, root);
    const kept = run(CLEAR, ON_NEW_VOLUME, root);
    assert.equal(kept.status, 0, kept.output);
    assert.ok(kept.output.includes("passed every check"));
    assert.equal(existsSync(join(root, "work/staging.in-progress")), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a marker left with the services stopped can be cleared, and blocks a new run until then", () => {
  const root = sandbox();
  try {
    mkdirSync(join(root, "work/staging-x"), { recursive: true });
    writeFileSync(
      join(root, "work/staging-x/stopped-containers"),
      "w-api api always\nw-worker worker on-failure:3\n"
    );
    writeFileSync(
      join(root, "work/staging.in-progress"),
      `phase=writers-stopped\nvolume=${NEW_VOLUME}\nrun=${join(root, "work/staging-x")}\nsource_volume=grenmet-staging_pgdata-staging\n`
    );
    const blocked = run(UPGRADE, {}, root);
    assert.equal(blocked.status, 1);
    assert.ok(blocked.output.includes("phase writers-stopped"));
    assert.doesNotMatch(blocked.log, MUTATING);
    const cleared = run(CLEAR, {}, root);
    assert.equal(cleared.status, 0, cleared.output);
    assert.ok(cleared.output.includes("never left"));
    assert.match(cleared.log, POLICY_RESTORED);
    assert.equal(existsSync(join(root, "work/staging.in-progress")), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("with an unfinished upgrade and no database running, the message points to the rollback", () => {
  const root = sandbox();
  try {
    writeFileSync(
      join(root, "work/staging.in-progress"),
      `phase=switched\nvolume=${NEW_VOLUME}\nsource_image=${SOURCE_IMAGE}\n`
    );
    const { status, output } = run(UPGRADE, { TEST_NO_DB: "1" }, root);
    assert.equal(status, 1);
    assert.ok(output.includes("the new database may not have started"));
    assert.ok(output.includes("run clear-marker, then Deploy"));
    assert.equal(output.includes("Deploy staging first"), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a secrets file left by a killed run does not block the next one, and markers stay visible", () => {
  const root = sandbox();
  try {
    mkdirSync(join(root, "infra/docker/runtime"), { recursive: true });
    writeFileSync(
      join(root, "infra/docker/runtime/.env.pg-upgrade"),
      "stale\n"
    );
    const dry = run(DRY_RUN, {}, root);
    assert.equal(dry.status, 0, dry.output);
    assert.equal(
      existsSync(join(root, "infra/docker/runtime/.env.pg-upgrade")),
      false
    );
    rmSync(join(root, "work"), { recursive: true });
    const upgraded = run(UPGRADE, {}, root);
    assert.equal(upgraded.status, 0, upgraded.output);
    assert.equal(permissions(join(root, "work")), "755");
    const runDirectory = readdirSync(join(root, "work")).find((name) =>
      name.startsWith("staging-2")
    );
    assert.equal(permissions(join(root, "work", runDirectory)), "700");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
