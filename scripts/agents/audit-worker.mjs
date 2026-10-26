#!/usr/bin/env node
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import {
  checkObservation,
  groupObservations,
  hourly,
  observation,
  runWithRetry,
  sixHourlyPlan,
  sourceRisks,
  weeklyPlan,
} from "./audit-checks.mjs";
import { daily } from "./audit-daily.mjs";
import { testExecutor } from "./audit-executor.mjs";
import {
  command,
  evidencePath,
  privateDirectory,
  testEnvironment,
} from "./audit-process.mjs";
import { pruneEvidence } from "./audit-retention.mjs";
import { buildAuditSandboxArgs } from "./audit-sandbox.mjs";

const COMMIT = /^[0-9a-f]{40}$/;
const ROOT = resolve(import.meta.dirname, "../..");
const DEFAULT_ENDPOINTS = {
  staging: [
    "https://api.staging.barrels.gd/api/v1/utils/health-check/",
    "https://api.staging.barrels.gd/api/v1/utils/ready/",
  ],
  production: [
    "https://api.barrels.gd/api/v1/utils/health-check/",
    "https://api.barrels.gd/api/v1/utils/ready/",
  ],
};
export const SCHEDULES = {
  hourly: "*-*-* *:10:00 UTC",
  sixhourly: "*-*-* 00,06,12,18:30:00 UTC",
  daily: "*-*-* 05:30:00 UTC",
  weekly: "Sun *-*-* 07:30:00 UTC",
};
export function loadConfiguration(path) {
  if (!existsSync(path)) return { endpoints: DEFAULT_ENDPOINTS };
  const stat = statSync(path);
  if (!stat.isFile() || stat.size > 65_536 || stat.mode % 64)
    throw new Error("Audit configuration must be a private regular file");
  return {
    endpoints: DEFAULT_ENDPOINTS,
    ...JSON.parse(readFileSync(path, "utf8")),
  };
}
export async function cleanCheckout(root, directory, commit, run = command) {
  if (!COMMIT.test(commit)) throw new Error("Expected a pinned commit");
  if (existsSync(directory))
    throw new Error(
      "Audit checkout already exists; never reset or reuse another checkout"
    );
  const result = await run(
    ["git", "worktree", "add", "--detach", directory, commit],
    { cwd: root, timeout: 120_000 }
  );
  if (result.code !== 0)
    throw new Error("Could not create clean audit checkout");
  const status = await run(["git", "status", "--porcelain"], {
    cwd: directory,
  });
  const head = await run(["git", "rev-parse", "HEAD"], { cwd: directory });
  if (
    status.code ||
    status.stdout.trim() ||
    head.code ||
    head.stdout.trim() !== commit
  )
    throw new Error("Audit checkout is not clean and pinned");
}
export async function executePlan(plan, root, logs, execute = command) {
  const results = [];
  let installationFailed = false;
  for (const spec of plan) {
    if (installationFailed) {
      results.push(
        observation(
          `check:${spec.id}`,
          `Scheduled check ${spec.id} unavailable`,
          "unknown",
          spec.argv.join(" "),
          "Dependency setup failed; this check was not run.",
          "normal",
          "owner"
        )
      );
      continue;
    }
    let attempt = 0;
    const result = await runWithRetry(spec, (current) =>
      execute(current.argv, {
        cwd: join(root, current.cwd ?? ""),
        timeout: current.timeout,
        env: {
          ...testEnvironment(),
          UV_PROJECT_ENVIRONMENT: join(root, ".venv"),
          PAYLOAD_SECRET: "knip-placeholder-secret-0123456789",
          DATABASE_URL: "postgres://knip@localhost/knip",
        },
        logPath: evidencePath(logs, current.id, ++attempt),
      })
    );
    if (spec.reportOnly && result.status === "pass") {
      let count;
      try {
        const report = JSON.parse(result.attempts.at(-1).stdout);
        count =
          (report.files?.length ?? 0) +
          (report.issues ?? []).reduce(
            (total, issue) =>
              total +
              Object.values(issue)
                .filter(Array.isArray)
                .reduce((sum, entries) => sum + entries.length, 0),
            0
          );
      } catch {
        count = null;
      }
      results.push(
        observation(
          `check:${spec.id}`,
          "Review dead-code scan",
          count === 0 ? "pass" : "fail",
          spec.argv.join(" "),
          count === null
            ? "The structured scan report was unavailable; inspect private evidence."
            : `${count} candidate cleanup findings. Review before proposing a focused change.`,
          "low"
        )
      );
    } else results.push(checkObservation(result));
    if (spec.prerequisite && result.status !== "pass")
      installationFailed = true;
  }
  return results;
}
export async function audit({
  mode,
  root,
  state,
  config = {},
  publish = false,
  sessionLog,
  execute = command,
}) {
  if (!Object.hasOwn(SCHEDULES, mode)) throw new Error("Unknown audit mode");
  const nowISO = new Date().toISOString();
  privateDirectory(state);
  const logs = privateDirectory(
    join(
      state,
      "runs",
      `${new Date().toISOString().replaceAll(":", "-")}-${randomUUID()}`
    )
  );
  writeFileSync(
    join(logs, "owned-run.json"),
    JSON.stringify({
      owner: "grenmet-advisory-audit",
      version: 1,
      createdAt: new Date().toISOString(),
    }),
    { mode: 0o600 }
  );
  pruneEvidence(join(state, "runs"));
  let sequence = 0;
  const run = async (argv, options = {}) => {
    const result = await execute(argv, {
      cwd: root,
      timeout: 60_000,
      logPath: join(logs, `metadata-${++sequence}.log`),
      ...options,
    });
    if (result.code !== 0)
      throw new Error(
        "Read-only audit command failed; evidence retained privately"
      );
    return result.stdout.trim();
  };
  const gh = async (args) =>
    JSON.parse(await run(["gh", ...args], { captureLimit: 16_000_000 }));
  // The audit never fetches a pull-request branch or runs code from an issue.
  await run(["git", "fetch", "origin", "dev"], { timeout: 120_000 });
  const commit = await run(["git", "rev-parse", "refs/remotes/origin/dev"]);
  if (!COMMIT.test(commit)) throw new Error("Invalid development commit");
  let observations;
  if (mode === "hourly") observations = await hourly({ gh, commit });
  else if (mode === "daily") {
    const dailyConfig = { ...config, receipts: { ...config.receipts } };
    if (config.operationsConfig) {
      for (const source of [
        "eregister-sends",
        "wis2-sends",
        "worker-jobs",
        "notification-sweeps",
        "secrets",
        "backups",
      ]) {
        const output = join(logs, `${source}.json`);
        const monitoringEnv = {
          PATH: process.env.PATH,
          LANG: "C.UTF-8",
          UV_PROJECT_ENVIRONMENT: join(logs, ".venv"),
        };
        if (source === "backups")
          for (const name of [
            "DO_SPACES_BUCKET",
            "DO_SPACES_ENDPOINT",
            "AWS_ACCESS_KEY_ID",
            "AWS_SECRET_ACCESS_KEY",
            "AWS_SESSION_TOKEN",
            "AWS_DEFAULT_REGION",
          ])
            if (process.env[name]) monitoringEnv[name] = process.env[name];
        const args = buildAuditSandboxArgs(
          [
            "python3",
            join(ROOT, "scripts/agents/audit-operations.py"),
            "--source",
            source,
            "--config",
            config.operationsConfig,
            "--output",
            output,
          ],
          {
            root: logs,
            cwd: logs,
            home: privateDirectory(join(logs, "home")),
            env: monitoringEnv,
            timeout: 300_000,
            readOnlyPaths: [ROOT, config.operationsConfig],
          }
        );
        await execute(["systemd-run", ...args], {
          cwd: ROOT,
          env: process.env,
          timeout: 300_000,
          logPath: evidencePath(logs, source, 1),
        });
        dailyConfig.receipts[source] = output;
      }
    }
    observations = await daily({ config: dailyConfig });
  } else {
    const checkout = join(
      privateDirectory(join(state, "checkouts")),
      `${mode}-${randomUUID()}`
    );
    await cleanCheckout(root, checkout, commit, execute);
    const commonGitDir = await run(
      ["git", "rev-parse", "--path-format=absolute", "--git-common-dir"],
      { cwd: checkout }
    );
    const runTests =
      execute === command ? testExecutor(checkout, commonGitDir) : execute;
    try {
      if (mode === "sixhourly")
        observations = await executePlan(
          sixHourlyPlan(checkout),
          checkout,
          logs,
          runTests
        );
      else {
        observations = await executePlan(
          [
            {
              id: "install",
              argv: ["pnpm", "install", "--frozen-lockfile"],
              prerequisite: true,
              timeout: 900_000,
            },
            ...weeklyPlan(),
          ],
          checkout,
          logs,
          runTests
        );
        const files = (await run(["git", "ls-files"], { cwd: checkout })).split(
          "\n"
        );
        const risks = sourceRisks(checkout, files);
        writeFileSync(join(logs, "source-risks.json"), JSON.stringify(risks), {
          mode: 0o600,
        });
        observations.push(
          observation(
            "weekly:large-modules",
            "Review oversized source modules",
            risks.large.length ? "fail" : "pass",
            "scan tracked source modules over 1500 lines",
            risks.large.length +
              " oversized source modules; propose one focused extraction after checking recorded issues.",
            "low"
          )
        );
        observations.push(
          observation(
            "weekly:todos",
            "Review recorded source cleanup risks",
            risks.todoCount ? "fail" : "pass",
            "scan tracked source TODO and FIXME markers",
            risks.todoCount +
              " source markers; compare with open issues before proposing one small cleanup.",
            "low"
          )
        );
      }
    } finally {
      // Frozen pnpm can rewrite its bootstrap metadata. Restore only this
      // disposable checkout's lockfile from the exact pinned commit.
      const original = await execute(
        ["git", "show", `${commit}:pnpm-lock.yaml`],
        { cwd: checkout, captureLimit: 16_000_000 }
      );
      if (original.code === 0)
        writeFileSync(join(checkout, "pnpm-lock.yaml"), original.stdout);
      const status = await execute(["git", "status", "--porcelain"], {
        cwd: checkout,
      });
      if (status.code === 0 && !status.stdout.trim()) {
        const removed = await execute(
          ["git", "worktree", "remove", "--", checkout],
          { cwd: root, timeout: 120_000 }
        );
        if (removed.code !== 0)
          writeFileSync(
            join(logs, "checkout-retained.txt"),
            "Normal Git removal refused; preserve and inspect this owned checkout.",
            { mode: 0o600 }
          );
      } else
        writeFileSync(
          join(logs, "checkout-retained.txt"),
          "Generated changes remain; preserve and inspect this owned checkout.",
          { mode: 0o600 }
        );
    }
  }
  observations = groupObservations(observations, {
    "coverage:daily:eregister-sends": "coverage:daily:delivery-monitoring",
    "coverage:daily:wis2-sends": "coverage:daily:delivery-monitoring",
    "coverage:daily:worker-jobs": "coverage:daily:worker-telemetry",
    "coverage:daily:notification-sweeps": "coverage:daily:worker-telemetry",
    ...config.rootCauses,
  });
  writeFileSync(
    join(logs, "observations.json"),
    JSON.stringify({ mode, commit, observations, nowISO }),
    { mode: 0o600 }
  );
  const publication = await execute(
    [
      "flock",
      "--wait",
      "300",
      join(state, "publication.lock"),
      process.execPath,
      join(ROOT, "scripts/agents/audit-publish.mjs"),
      "--input",
      join(logs, "observations.json"),
      ...(publish ? ["--publish"] : []),
    ],
    {
      cwd: ROOT,
      env: process.env,
      timeout: 1_800_000,
      logPath: join(logs, "publication.log"),
      captureLimit: 16_000_000,
    }
  );
  if (publication.code !== 0)
    throw new Error("Audit issue publication could not complete");
  const reported = JSON.parse(publication.stdout);
  if (publish && sessionLog) {
    const blockers = observations.filter(
      (item) => item.status === "fail" && item.severity === "blocker"
    );
    if (blockers.length) {
      const { appendFileSync } = await import("node:fs");
      appendFileSync(
        sessionLog,
        "\n" +
          new Date().toISOString() +
          " | Codex auditor | Blockers: " +
          blockers.map((item) => item.key).join(", ") +
          ". See codex-audit issues; advisory only, no merge blocked.\n"
      );
    }
  }
  return {
    mode,
    commit,
    observations: observations.length,
    failures: observations.filter((item) => item.status === "fail").length,
    reported,
  };
}
export async function main(argv = process.argv.slice(2)) {
  const { values } = parseArgs({
    args: argv,
    options: {
      mode: { type: "string", default: "hourly" },
      publish: { type: "boolean" },
      plan: { type: "boolean" },
      config: {
        type: "string",
        default: join(homedir(), ".config/grenmet-factory/audit.json"),
      },
      state: {
        type: "string",
        default: join(homedir(), ".local/state/grenmet-factory/audit"),
      },
      "repo-root": { type: "string", default: ROOT },
      locked: { type: "boolean" },
      "heavy-locked": { type: "boolean" },
      "session-log": {
        type: "string",
        default: join(homedir(), "grenmet/SESSION_LOG.md"),
      },
    },
  });
  if (!Object.hasOwn(SCHEDULES, values.mode))
    throw new Error("Unknown audit mode");
  if (values.plan) {
    console.log(
      JSON.stringify({
        schedules: SCHEDULES,
        mode: values.mode,
        advisory: true,
      })
    );
    return 0;
  }
  // Kernel-held locks are released on termination; never delete another worker's lock.
  if (!values.locked) {
    privateDirectory(values.state);
    const result = await command(
      [
        "flock",
        "--nonblock",
        "--conflict-exit-code",
        "75",
        join(values.state, `${values.mode}.lock`),
        process.execPath,
        ...process.argv.slice(1),
        "--locked",
      ],
      { timeout: 6 * 3_600_000 }
    );
    if (result.code === 75) {
      console.log("Audit mode already running; no duplicate started.");
      return 0;
    }
    if (result.code !== 0)
      throw new Error("Audit subprocess failed; inspect private evidence");
    console.log(result.stdout);
    return 0;
  }
  if (
    ["sixhourly", "weekly"].includes(values.mode) &&
    !values["heavy-locked"]
  ) {
    const heavy = await command(
      [
        "flock",
        "--wait",
        "18000",
        join(values.state, "heavy.lock"),
        process.execPath,
        ...process.argv.slice(1),
        "--heavy-locked",
      ],
      { timeout: 6 * 3_600_000 }
    );
    if (heavy.code !== 0) throw new Error("Heavy audit could not complete");
    console.log(heavy.stdout);
    return 0;
  }
  const result = await audit({
    mode: values.mode,
    root: values["repo-root"],
    state: values.state,
    config: loadConfiguration(values.config),
    publish: Boolean(values.publish),
    sessionLog: values["session-log"],
  });
  console.log(JSON.stringify(result));
  return 0;
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  main()
    .then((code) => {
      process.exitCode = code;
    })
    .catch(() => {
      console.error(
        "Audit could not complete; inspect private local evidence. No merge or branch operation was performed."
      );
      process.exitCode = 1;
    });
}
