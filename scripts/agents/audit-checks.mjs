import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { dependencyObservations, trivyObservation } from "./audit-security.mjs";

export const REPO = "Marcus100/grenmet";
const CHECK_NAME = /^[a-zA-Z0-9 ()/_.:-]{1,100}$/u;
const SOURCE_AREA = /^(apps|packages|scripts)\//u;
const GENERATED_SOURCE = /(?:\/gen\/|\.json$|\.lock$)/u;
const SOURCE_EXTENSION = /\.(?:mjs|ts|tsx|py)$/u;
const FAILED = new Set([
  "failure",
  "timed_out",
  "action_required",
  "startup_failure",
]);
export function observation(
  key,
  title,
  status,
  command,
  summary,
  severity = "normal",
  owner = "Claude"
) {
  return {
    key: key.replaceAll("/", ":"),
    title,
    status,
    command,
    summary,
    severity,
    owner,
  };
}
export async function hourly({
  gh,
  commit,
  now = Date.now(),
  staleHours = 24,
  readDevFile,
}) {
  const observations = [];
  const collect = async (key, title, args, inspect) => {
    try {
      observations.push(...(await inspect(await gh(args))));
      observations.push(
        observation(
          `coverage:${key}`,
          `${title} monitoring unavailable`,
          "pass",
          "gh api read-only repository metadata",
          "Read-only monitoring access confirmed.",
          "normal",
          "owner"
        )
      );
    } catch {
      observations.push(
        observation(
          `coverage:${key}`,
          `${title} monitoring unavailable`,
          "fail",
          "gh api read-only repository metadata",
          "The read-only request failed. Check local private evidence and account permissions.",
          "normal",
          "owner"
        )
      );
    }
  };
  await collect(
    "dev-checks",
    "Development automated checks",
    [
      "api",
      "--paginate",
      "--slurp",
      "repos/" +
        REPO +
        "/actions/runs?branch=dev&event=push&head_sha=" +
        commit +
        "&per_page=100",
    ],
    async (pages) => {
      const runs = pages.flatMap((p) => p.workflow_runs ?? []);
      if (!runs.length)
        return [
          observation(
            "dev-checks",
            "Development automated checks missing",
            "fail",
            "gh api actions/runs for pinned development commit",
            "No push workflow run was found for the current development commit.",
            "normal"
          ),
        ];
      const newest = new Map();
      for (const run of runs)
        if (!newest.has(run.workflow_id)) newest.set(run.workflow_id, run);
      const result = [];
      for (const run of newest.values()) {
        if (
          !(
            Number.isSafeInteger(run.workflow_id) &&
            Number.isSafeInteger(run.id)
          )
        )
          continue;
        const failed = FAILED.has(run.conclusion);
        let failedCount = 0;
        let failedNames = [];
        if (failed) {
          const jobs = await gh([
            "api",
            "--paginate",
            "--slurp",
            `repos/${REPO}/actions/runs/${run.id}/jobs?per_page=100`,
          ]);
          const failures = jobs
            .flatMap((page) => page.jobs ?? [])
            .filter((job) => FAILED.has(job.conclusion));
          failedCount = failures.length;
          failedNames = failures.map((job) =>
            CHECK_NAME.test(job.name) ? job.name : `check ${job.id}`
          );
          // Names and logs stay private; the run URL exposes the exact failing checks safely.
        }
        result.push(
          observation(
            `dev-workflow:${run.workflow_id}`,
            `Development workflow ${run.workflow_id} failed`,
            failed ? "fail" : run.conclusion === "success" ? "pass" : "unknown",
            `gh api repos/${REPO}/actions/runs/${run.id}/jobs`,
            failed
              ? failedCount +
                  " failing checks: " +
                  failedNames.join(", ") +
                  ". Evidence: https://github.com/" +
                  REPO +
                  "/actions/runs/" +
                  run.id
              : "Workflow state: " +
                  (run.conclusion === "success" ? "success" : "not completed"),
            "high"
          )
        );
      }
      return result;
    }
  );
  await collect(
    "pull-requests",
    "Pull request",
    [
      "pr",
      "list",
      "--repo",
      REPO,
      "--state",
      "open",
      "--base",
      "dev",
      "--limit",
      "1000",
      "--json",
      "number,state,isDraft,updatedAt,mergeStateStatus,statusCheckRollup",
    ],
    async (pulls) =>
      pulls
        .filter((pr) => !pr.isDraft && Number.isSafeInteger(pr.number))
        .map((pr) => {
          const red = (pr.statusCheckRollup ?? []).some((check) =>
            FAILED.has(String(check.conclusion ?? check.state).toLowerCase())
          );
          const stale =
            now - Date.parse(pr.updatedAt) >= staleHours * 3_600_000;
          const stuck =
            pr.state !== "CLOSED" &&
            pr.state !== "MERGED" &&
            stale &&
            (red ||
              pr.mergeStateStatus === "BEHIND" ||
              pr.mergeStateStatus === "DIRTY");
          return observation(
            `pull-request:${pr.number}`,
            `Pull request ${pr.number} needs attention`,
            stuck
              ? "fail"
              : pr.state === "CLOSED" || pr.state === "MERGED"
                ? "pass"
                : red ||
                    pr.mergeStateStatus === "BEHIND" ||
                    pr.mergeStateStatus === "DIRTY"
                  ? "unknown"
                  : "pass",
            `gh pr view ${pr.number} --repo ${REPO}`,
            stuck
              ? "Red checks, a merge conflict, or an older base persisted for at least " +
                  staleHours +
                  " hours. Being behind is advisory; no synchronization is required to merge."
              : "No persistent red or outdated-base condition.",
            "normal"
          );
        })
  );
  await collect(
    "closed-pull-requests",
    "Closed pull request",
    [
      "pr",
      "list",
      "--repo",
      REPO,
      "--state",
      "all",
      "--base",
      "dev",
      "--limit",
      "100",
      "--json",
      "number,state",
    ],
    (pulls) =>
      pulls
        .filter((pr) => pr.state !== "OPEN")
        .map((pr) =>
          observation(
            `pull-request:${pr.number}`,
            `Pull request ${pr.number} needs attention`,
            "pass",
            `gh pr view ${pr.number} --repo ${REPO}`,
            "The pull request is closed or merged."
          )
        )
  );
  for (const source of ["dependabot", "code-scanning", "secret-scanning"]) {
    await collect(
      source,
      "Security alert",
      [
        "api",
        "--paginate",
        "--slurp",
        `repos/${REPO}/${source}/alerts?per_page=100`,
      ],
      (pages) => {
        const alerts = pages.flat();
        if (source === "dependabot")
          return dependencyObservations(alerts, readDevFile);
        const trivy =
          source === "code-scanning"
            ? alerts.filter(
                (a) =>
                  a.tool?.name === "Trivy" &&
                  a.most_recent_instance?.ref === "refs/heads/main" &&
                  a.most_recent_instance?.analysis_key ===
                    ".github/workflows/ci-api.yml:docker"
              )
            : [];
        const others = alerts.filter((a) => !trivy.includes(a));
        return [
          ...(trivy.length ? [trivyObservation(trivy)] : []),
          ...others
            .map((alert) => {
              const number = alert.number;
              if (!Number.isSafeInteger(number)) return null;
              const severity =
                alert.security_advisory?.severity ??
                alert.rule?.security_severity_level;
              const location = alert.most_recent_instance?.location?.path;
              let identity = alert.security_advisory?.ghsa_id ?? number;
              if (source === "code-scanning" && alert.rule?.id && location)
                identity = createHash("sha256")
                  .update(`${alert.rule.id}:${location}`)
                  .digest("hex")
                  .slice(0, 20);
              return observation(
                `security:${source}:${identity}`,
                `Open ${source} alert ${number}`,
                alert.state === "open" ? "fail" : "pass",
                `gh api repos/${REPO}/${source}/alerts/${number}`,
                "An open alert needs investigation. Inspect it in the repository Security page; secret values and alert payloads are excluded.",
                source === "secret-scanning" && alert.validity === "active"
                  ? "blocker"
                  : severity === "critical" ||
                      severity === "high" ||
                      source === "secret-scanning"
                    ? "high"
                    : "normal",
                source === "secret-scanning" ? "owner" : "Claude"
              );
            })
            .filter(Boolean),
        ];
      }
    );
  }
  return observations;
}

export function sixHourlyPlan(root) {
  const commands = [
    {
      id: "install",
      argv: ["pnpm", "install", "--frozen-lockfile"],
      timeout: 900_000,
      prerequisite: true,
    },
    {
      id: "types",
      argv: [
        "pnpm",
        "exec",
        "turbo",
        "run",
        "type-check",
        "--cwd",
        root,
        "--cache-dir",
        join(root, ".turbo/cache"),
      ],
      timeout: 1_800_000,
    },
    {
      id: "lint",
      argv: [
        "pnpm",
        "exec",
        "turbo",
        "run",
        "check",
        "--cwd",
        root,
        "--cache-dir",
        join(root, ".turbo/cache"),
      ],
      timeout: 1_200_000,
    },
    {
      id: "python-install",
      argv: [
        "uv",
        "sync",
        "--frozen",
        "--package",
        "fast-back",
        "--package",
        "gms-ingest",
      ],
      timeout: 900_000,
      prerequisite: true,
    },
    {
      id: "python-lint",
      argv: ["bash", "scripts/lint.sh"],
      cwd: "apps/api/fastapi",
      timeout: 1_200_000,
    },
    {
      id: "api-tests",
      argv: ["node", "scripts/verification/run.mjs", "backend"],
      timeout: 5_400_000,
    },
    { id: "client-drift", argv: ["pnpm", "check:drift"], timeout: 900_000 },
    {
      id: "dependency-audit",
      argv: ["pnpm", "audit", "--prod", "--audit-level", "high"],
      timeout: 300_000,
    },
  ];
  for (const app of readdirSync(join(root, "apps/web"))) {
    const manifest = join(root, "apps/web", app, "package.json");
    let pkg;
    try {
      pkg = JSON.parse(readFileSync(manifest, "utf8"));
    } catch {
      continue;
    }
    if (pkg.scripts?.test)
      commands.push({
        id: `tests:${app}`,
        argv: ["pnpm", "--dir", `apps/web/${app}`, "test"],
        timeout: 900_000,
      });
  }
  const walk = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (
        entry.isDirectory() &&
        !["node_modules", ".venv", ".next", "reports"].includes(entry.name)
      )
        walk(join(directory, entry.name));
      else if (entry.isFile() && entry.name === "alembic.ini") {
        const config = join(directory, entry.name).slice(
          join(root, "apps/api/fastapi").length + 1
        );
        commands.push({
          id: `migration:${config}`,
          argv: [
            "uv",
            "run",
            "--frozen",
            "--package",
            "fast-back",
            "alembic",
            "-c",
            config,
            "heads",
          ],
          cwd: "apps/api/fastapi",
          timeout: 120_000,
          oneHead: true,
        });
      }
    }
  };
  walk(join(root, "apps/api/fastapi"));
  return commands;
}

export async function runWithRetry(spec, execute) {
  const attempts = [await execute(spec)];
  const passed = (result) =>
    result.code === 0 &&
    (!spec.oneHead ||
      (result.stdout.match(/^.*\(head\)\s*$/gmu) ?? []).length === 1);
  if (!passed(attempts[0])) attempts.push(await execute(spec));
  return {
    spec,
    attempts,
    status: passed(attempts.at(-1)) ? "pass" : "fail",
    flaky: attempts.length === 2 && passed(attempts[1]),
  };
}

export function checkObservation(result) {
  const id = result.spec.id;
  const codes = result.attempts
    .map((attempt) =>
      Number.isInteger(attempt.code) ? attempt.code : "interrupted"
    )
    .join(", ");
  return observation(
    `check:${id}`,
    `Scheduled check ${id}${result.flaky ? " is intermittent" : " failed"}`,
    result.flaky ? "fail" : result.status,
    result.spec.argv.join(" "),
    "Exit status for each attempt: " +
      codes +
      ". " +
      (result.flaky
        ? "The initial failure passed on its single retry; investigate intermittent behavior."
        : result.spec.oneHead
          ? "Exactly one migration head is required."
          : "Raw output is retained privately; no raw logs are published."),
    id === "dependency-audit" ? "high" : "normal"
  );
}

export function weeklyPlan() {
  return [
    {
      id: "suppression-baseline",
      argv: [
        "node",
        "--test",
        "scripts/guardrails/suppression-ratchet.test.mjs",
      ],
      timeout: 120_000,
    },
    {
      id: "unused-dependencies",
      argv: [
        "pnpm",
        "exec",
        "knip",
        "--dependencies",
        "--reporter",
        "json",
        "--no-exit-code",
      ],
      timeout: 600_000,
      reportOnly: true,
    },
    {
      id: "dead-files",
      argv: [
        "pnpm",
        "exec",
        "knip",
        "--files",
        "--reporter",
        "json",
        "--no-exit-code",
      ],
      timeout: 600_000,
      reportOnly: true,
    },
  ];
}
export function sourceRisks(root, files) {
  const large = [];
  let todoCount = 0;
  for (const file of files) {
    if (
      !SOURCE_AREA.test(file) ||
      GENERATED_SOURCE.test(file) ||
      !SOURCE_EXTENSION.test(file)
    )
      continue;
    const path = join(root, file);
    if (!statSync(path).isFile() || statSync(path).size > 2_000_000) continue;
    const text = readFileSync(path, "utf8");
    if (text.split("\n").length > 1500) large.push(file);
    todoCount += (text.match(/\b(?:TODO|FIXME)\b/gu) ?? []).length;
  }
  return { large, todoCount };
}

export function groupObservations(observations, rootCauses = {}) {
  const groups = new Map();
  const rank = { pass: 0, unknown: 1, fail: 2 };
  const severity = { low: 0, normal: 1, high: 2, blocker: 3 };
  for (const item of observations) {
    const key = rootCauses[item.key] ?? item.key;
    const previous = groups.get(key);
    if (!previous) {
      groups.set(key, { ...item, key });
      continue;
    }
    const selected =
      rank[item.status] > rank[previous.status] ? item : previous;
    groups.set(key, {
      ...selected,
      key,
      severity:
        severity[item.severity] > severity[previous.severity]
          ? item.severity
          : previous.severity,
      command: [...new Set([previous.command, item.command])].join("; "),
      summary: [...new Set([previous.summary, item.summary])].join(" "),
    });
  }
  return [...groups.values()];
}
