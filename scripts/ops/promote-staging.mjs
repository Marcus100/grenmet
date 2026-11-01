#!/usr/bin/env node
// Daily dev -> staging promotion (see docs/operations/staging-promotion-automation.md).
// Staging only: the base is the constant below and the script refuses anything
// else. It never touches main, tags or production.
//
// Env: GH_TOKEN, GH_REPO, PROMOTE_STAGING_ENABLED, PROMOTE_STAGING_HOLD,
//      IGNORE_ENABLED_SWITCH, RESPECT_HOLD, DRY_RUN, GITHUB_STEP_SUMMARY.

import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const BASE = "staging";
export const HEAD = "dev";
export const REQUIRED_WORKFLOWS = [
  "ci-api.yml",
  "ci-web.yml",
  "ci-api-client.yml",
];

const MERGE_SUBJECT = /^Merge pull request #(\d+) from /;
const ALEMBIC_REVISION = /alembic\/versions\/[^/]+\.py$/;
const PY_EXTENSION = /\.py$/;
const SECURITY_SECTION = /^#{1,6}\s*security review/im;

export function assertStagingOnly(base = BASE, head = HEAD) {
  if (base !== "staging" || head !== "dev") {
    throw new Error(
      `Refusing: this automation only promotes dev into staging (got ${head} -> ${base}).`
    );
  }
}

/** Decides whether to run. The switch and hold are always honoured. */
export function gate(env) {
  if (env.PROMOTE_STAGING_ENABLED !== "true") {
    return {
      run: false,
      reason: "PROMOTE_STAGING_ENABLED is not 'true'; automation is off.",
    };
  }
  if (env.PROMOTE_STAGING_HOLD === "true") {
    return { run: false, reason: "PROMOTE_STAGING_HOLD is 'true'; on hold." };
  }
  return { run: true, reason: "" };
}

/** The latest run of a workflow for the commit must have completed with success. */
export function ciProblem(workflow, runs) {
  if (runs.length === 0) {
    return `${workflow}: no run for this commit yet`;
  }
  const latest = runs.reduce((a, b) => (b.databaseId > a.databaseId ? b : a));
  if (latest.status !== "completed") {
    return `${workflow}: latest run still running`;
  }
  return latest.conclusion === "success"
    ? ""
    : `${workflow}: latest run is ${latest.conclusion}`;
}

/** Numbers of included risk:high PRs that lack a Security review section. */
export function missingSecurityReview(pulls) {
  return pulls
    .map(describePull)
    .filter((pr) => pr.risk === "risk:high" && !pr.securitySection)
    .map((pr) => pr.number);
}

/** Titles are untrusted text: no mentions, no issue links, no markdown. */
export function safeTitle(title) {
  return `\`${String(title)
    .replaceAll("`", "'")
    .replaceAll(/[\r\n]+/g, " ")}\``;
}

export function pullNumbers(subjects) {
  const numbers = [];
  for (const subject of subjects) {
    const match = MERGE_SUBJECT.exec(subject);
    if (match) {
      numbers.push(Number(match[1]));
    }
  }
  return numbers;
}

export function migrationsFromDiff(nameStatusLines) {
  const revisions = [];
  for (const line of nameStatusLines) {
    const [status, path] = line.split("\t");
    if (status === "A" && ALEMBIC_REVISION.test(path ?? "")) {
      revisions.push(path.split("/").pop().replace(PY_EXTENSION, ""));
    }
  }
  return revisions;
}

const labelNames = (pr) => (pr.labels ?? []).map((label) => label.name);

export function describePull(pr) {
  const labels = labelNames(pr);
  const area = labels.find((name) => name.startsWith("area:")) ?? "other";
  const risk = labels.find((name) => name.startsWith("risk:")) ?? "unlabelled";
  return {
    number: pr.number,
    title: pr.title,
    area,
    risk,
    securitySection: SECURITY_SECTION.test(pr.body ?? ""),
  };
}

export function buildBody({ date, sha, pulls, migrations, unlistedCommits }) {
  const missing = missingSecurityReview(pulls);
  const described = pulls.map(describePull);
  const groups = new Map();
  for (const pr of described) {
    groups.set(pr.area, [...(groups.get(pr.area) ?? []), pr]);
  }
  const lines = [
    `Automated daily promotion of \`dev\` into \`staging\` (${date}). Head: \`${sha.slice(0, 9)}\`.`,
    "",
    `## What this promotes (${described.length} PRs)`,
  ];
  for (const [area, prs] of [...groups].sort()) {
    lines.push("", `**${area}**`);
    for (const pr of prs) {
      lines.push(`- #${pr.number} ${safeTitle(pr.title)} (${pr.risk})`);
    }
  }
  if (unlistedCommits > 0) {
    lines.push(
      "",
      `Plus ${unlistedCommits} commit(s) that did not come from a merged PR.`
    );
  }
  lines.push("", "## Migrations");
  lines.push(
    migrations.length
      ? migrations.map((name) => `- \`${name}\``).join("\n")
      : "None added."
  );
  const high = described.filter((pr) => pr.risk === "risk:high");
  lines.push("", "## Risk");
  if (high.length === 0) {
    lines.push("No `risk:high` PR is included.");
  } else {
    for (const pr of high) {
      lines.push(
        `- #${pr.number} risk:high, security review section in its body: ${pr.securitySection ? "yes" : "NO (check before relying on this promotion)"}`
      );
    }
  }
  if (missing.length > 0) {
    lines.push(
      "",
      `**Auto-merge was NOT armed.** risk:high PR(s) ${missing.map((n) => `#${n}`).join(", ")} have no Security review section. The owner decides whether to merge this PR by hand.`
    );
  }
  lines.push(
    "",
    "## Gates",
    `- \`dev\` CI at \`${sha.slice(0, 9)}\` was green when this was created (${REQUIRED_WORKFLOWS.join(", ")}).`,
    "- Auto-merge is armed only when every included risk:high PR has a Security review section; GitHub then merges once the staging ruleset checks pass. Nothing is merged into `main` or released by this automation.",
    "",
    "## After merge",
    "- The Staging Pipeline deploys; the Staging smoke workflow tests it and comments here.",
    "- Review the smoke result, then do the signed-in checks with the staging test account.",
    "- Migrations above run on deploy.",
    '- A failed deploy opens or updates the issue "Staging deploy failed"; set `PROMOTE_STAGING_HOLD=true` until it is fixed.',
    "",
    "Generated by `.github/workflows/promote-staging.yml`."
  );
  return lines.join("\n");
}

function defaultGh(args, options = {}) {
  return execFileSync("gh", args, { encoding: "utf8", ...options }).trim();
}
function defaultGit(args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}
export const deps = { gh: defaultGh, git: defaultGit };
const gh = (args, options) => deps.gh(args, options);
const git = (args) => deps.git(args);
const lines = (text) => (text ? text.split("\n") : []);

function summary(text) {
  console.log(text);
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${text}\n`);
  }
}

function devCiGreen(sha) {
  const problems = [];
  for (const workflow of REQUIRED_WORKFLOWS) {
    const runs = JSON.parse(
      gh([
        "run",
        "list",
        "--workflow",
        workflow,
        "--branch",
        HEAD,
        "--commit",
        sha,
        "--json",
        "databaseId,status,conclusion",
        "--limit",
        "20",
      ])
    );
    const problem = ciProblem(workflow, runs);
    if (problem) {
      problems.push(problem);
    }
  }
  return problems;
}

const today = () => new Date().toISOString().slice(0, 10);

/** Returns { skip } or { sha, title, body, missing }. */
function plan() {
  git(["fetch", "--quiet", "origin", BASE, HEAD]);
  const range = `origin/${BASE}..origin/${HEAD}`;
  const total = Number(git(["rev-list", "--count", range]));
  if (total === 0) {
    return { skip: "dev is not ahead of staging." };
  }
  const sha = git(["rev-parse", `origin/${HEAD}`]);
  const ci = devCiGreen(sha);
  if (ci.length > 0) {
    return { skip: `dev CI is not green.\n- ${ci.join("\n- ")}` };
  }
  const pulls = pullNumbers(
    lines(git(["log", "--merges", "--format=%s", range]))
  ).map((number) =>
    JSON.parse(
      gh(["pr", "view", String(number), "--json", "number,title,labels,body"])
    )
  );
  const migrations = migrationsFromDiff(
    lines(
      git([
        "diff",
        "--name-status",
        `origin/${BASE}...origin/${HEAD}`,
        "--",
        "*alembic/versions/*.py",
      ])
    )
  );
  const body = buildBody({
    date: today(),
    sha,
    pulls,
    migrations,
    unlistedCommits: pulls.length === 0 ? total : 0,
  });
  return {
    sha,
    body,
    title: `release: promote dev to staging (${today()})`,
    missing: missingSecurityReview(pulls),
  };
}

function disableAuto(number) {
  try {
    gh(["pr", "merge", String(number), "--disable-auto"]);
  } catch {
    // It may already be off; the re-read below is the real check.
  }
  const state = JSON.parse(
    gh(["pr", "view", String(number), "--json", "autoMergeRequest"])
  );
  if (state.autoMergeRequest) {
    throw new Error(
      `Auto-merge is STILL armed on PR #${number}; disable it by hand now.`
    );
  }
}

function arm(number, sha) {
  gh([
    "pr",
    "merge",
    String(number),
    "--auto",
    "--merge",
    "--match-head-commit",
    sha,
  ]);
}

function upsertPr(planned) {
  const open = JSON.parse(
    gh([
      "pr",
      "list",
      "--base",
      BASE,
      "--head",
      HEAD,
      "--state",
      "open",
      "--json",
      "number",
    ])
  );
  if (open.length > 0) {
    gh([
      "pr",
      "edit",
      String(open[0].number),
      "--title",
      planned.title,
      "--body",
      planned.body,
    ]);
    return open[0].number;
  }
  const url = gh([
    "pr",
    "create",
    "--base",
    BASE,
    "--head",
    HEAD,
    "--title",
    planned.title,
    "--body",
    planned.body,
  ]);
  return Number(url.split("/").pop());
}

function main() {
  assertStagingOnly();
  const decision = gate(process.env);
  if (!decision.run) {
    summary(`Promotion skipped: ${decision.reason}`);
    return;
  }
  if (process.env.DRY_RUN !== "true" && !process.env.GH_TOKEN) {
    throw new Error(
      "PROMOTE_STAGING_TOKEN is missing. Add a fine-grained token as that repository secret (see docs/operations/staging-promotion-automation.md)."
    );
  }
  const first = plan();
  if (first.skip) {
    summary(`Promotion skipped: ${first.skip}`);
    return;
  }
  if (process.env.DRY_RUN === "true") {
    summary(`${first.title}\n\n${first.body}`);
    return;
  }
  const number = upsertPr(first);
  if (first.missing.length > 0) {
    disableAuto(number);
    summary(
      `Promotion PR #${number} updated but auto-merge was NOT armed: risk:high PR(s) ${first.missing.map((n) => `#${n}`).join(", ")} lack a Security review section. The owner decides.`
    );
    return;
  }
  arm(number, first.sha);
  try {
    // Re-check: dev may have moved or gone red while we were arming.
    let armed = first;
    const again = plan();
    if (again.skip || again.missing.length > 0) {
      disableAuto(number);
      summary(
        `Promotion PR #${number}: auto-merge disabled because the re-check failed (${again.skip ?? "risk:high PR without Security review"}).`
      );
      return;
    }
    if (again.sha !== first.sha) {
      gh([
        "pr",
        "edit",
        String(number),
        "--title",
        again.title,
        "--body",
        again.body,
      ]);
      arm(number, again.sha);
      armed = again;
    }
    gh([
      "pr",
      "edit",
      String(number),
      "--body",
      `${armed.body}\n\nAuto-merge armed at head \`${armed.sha}\`.`,
    ]);
    summary(
      `Promotion PR #${number} is ready with auto-merge armed (head ${armed.sha.slice(0, 9)}).`
    );
  } catch (error) {
    try {
      disableAuto(number);
      summary(
        `Promotion PR #${number}: auto-merge disabled after an error: ${error.message}`
      );
    } catch (disableError) {
      summary(`Promotion PR #${number}: ${disableError.message}`);
    }
    throw error;
  }
}

export { main };

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
