// Wrong-skip report for the shadow rollout of pull-request check selection
// (docs/operations/release-runbook.md, "Pull-request check selection").
//
// In shadow mode every check runs and `scripts/ci/select-checks.mjs` records
// what it WOULD have skipped. This reads those records and the check
// conclusions of the same head commits and lists every check that selection
// would have skipped but that failed: a "wrong skip". The owner flips
// CI_PATH_SELECTION to `on` only when the report is empty.
//
//   node scripts/ci/selection-report.mjs [--repo owner/name] [--limit 200]
//
// Needs the `gh` CLI with read access. Read-only.

import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// Check-run names (job names) each group stands for; a name matches when it
// starts with one of these.
export const GROUP_CHECKS = {
  api: [
    "API Tests (",
    "API Coverage Floor",
    "API Documentation",
    "Code Quality",
    "Security Scan",
  ],
  storage: ["Core storage integration"],
  webtests: ["TypeScript Tests", "gaa-admin Tests ("],
  journeys: ["Browser journeys"],
  apiContract: ["API breaking changes"],
  "codeql:javascript-typescript": ["Analyze (javascript-typescript)"],
  "codeql:python": ["Analyze (python)"],
};
const BAD = new Set(["failure", "timed_out", "startup_failure"]);

/**
 * Wrong skips: for each record, the failed check-runs on its head that belong
 * to a group the record says `on` would have skipped.
 *
 * `runsBySha` maps a head sha to `[{ name, conclusion }]`.
 */
export function findWrongSkips(records, runsBySha) {
  const wrong = [];
  for (const record of records) {
    const runs = runsBySha[record.headSha];
    if (!runs) continue;
    for (const group of record.wouldSkip) {
      const prefixes = GROUP_CHECKS[group] ?? [];
      for (const run of runs)
        if (
          BAD.has(run.conclusion) &&
          prefixes.some((prefix) => run.name.startsWith(prefix))
        )
          wrong.push({
            pr: record.pr,
            headSha: record.headSha,
            group,
            check: run.name,
            conclusion: run.conclusion,
          });
    }
  }
  return wrong;
}

/** One record per head sha (the newest file wins when a run was repeated). */
export function parseRecords(texts) {
  const byHead = new Map();
  for (const text of texts) {
    try {
      const record = JSON.parse(text);
      if (
        record?.headSha &&
        Array.isArray(record.wouldSkip) &&
        record.baseRef === "dev"
      )
        byHead.set(record.headSha, record);
    } catch {
      // A damaged record is ignored; it cannot hide a failure that matters.
    }
  }
  return [...byHead.values()];
}

export function checkRuns(sha, repository, gh) {
  return gh([
    "api",
    "--paginate",
    `repos/${repository}/commits/${sha}/check-runs?per_page=100`,
    "--jq",
    ".check_runs[] | [.name, (.conclusion // .status)] | @tsv",
  ])
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [name, conclusion] = line.split("\t");
      return { name, conclusion };
    });
}

/**
 * Downloads the shadow records of the latest pull-request runs of the
 * Browser journeys workflow (it records every dev pull request), with `gh`.
 */
export function downloadRecords({ repository, limit, gh, dir }) {
  const runs = JSON.parse(
    gh([
      "run",
      "list",
      "--repo",
      repository,
      "--workflow",
      "e2e.yml",
      "--event",
      "pull_request",
      "--limit",
      String(limit),
      "--json",
      "databaseId",
    ])
  );
  const texts = [];
  for (const { databaseId } of runs) {
    const target = join(dir, String(databaseId));
    try {
      gh([
        "run",
        "download",
        String(databaseId),
        "--repo",
        repository,
        "--name",
        "ci-selection",
        "--dir",
        target,
      ]);
      for (const file of readdirSync(target))
        texts.push(readFileSync(join(target, file), "utf8"));
    } catch {
      // No record: the run was cancelled or the artifact expired.
    }
  }
  return texts;
}

export function report({ repository, limit, gh }) {
  const dir = mkdtempSync(join(tmpdir(), "ci-selection-"));
  try {
    const records = parseRecords(
      downloadRecords({ repository, limit, gh, dir })
    );
    const runsBySha = {};
    for (const { headSha } of records)
      runsBySha[headSha] = checkRuns(headSha, repository, gh);
    return { records, wrong: findWrongSkips(records, runsBySha) };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const arg = (name, fallback) => {
    const index = process.argv.indexOf(name);
    return index > 0 ? process.argv[index + 1] : fallback;
  };
  const gh = (args) =>
    execFileSync("gh", args, {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    });
  const repository = arg("--repo", "Marcus100/grenmet");
  const { records, wrong } = report({
    repository,
    limit: Number(arg("--limit", "200")),
    gh,
  });
  const skipped = records.filter((record) => record.wouldSkip.length).length;
  console.log(
    `${records.length} recorded pull request heads; ${skipped} would have skipped something.`
  );
  if (wrong.length) {
    console.log(
      `${wrong.length} wrong skip(s). Keep CI_PATH_SELECTION=shadow.`
    );
    for (const item of wrong)
      console.log(
        `- PR #${item.pr} ${item.headSha.slice(0, 9)}: ${item.check} ${item.conclusion} (group ${item.group})`
      );
    process.exitCode = 1;
  } else {
    console.log(
      "No wrong skips: every check selection would have skipped passed."
    );
  }
}
