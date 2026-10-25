// Trusted, subscription-backed PR review dispatcher. Run from a reviewed local
// checkout, never from a PR checkout. Only labelled, same-repository PRs into
// dev are polled; --pr selects one explicitly. Each invocation handles one PR.
// GitHub status publishing trusts the authenticated gh identity. Anyone with
// that credential can publish statuses: this is not a separate signing service.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { riskTier } from "../guardrails/risk-tier.mjs";
import { claimLock, releaseLock } from "./claim-issue.mjs";
import { run as runReview } from "./codex-review.mjs";
import {
  acquireReviewLock,
  readReviewReceipt,
  receiptPath,
  reviewBlockers,
} from "./review-receipt.mjs";

export const REPO = "Marcus100/grenmet";
export const REVIEW_LABEL = "factory-review";
export const CONTEXTS = {
  code: "Factory review",
  security: "Factory security review",
};
const SHA = /^[a-f0-9]{40}$/;
const FACTORY_PATH =
  /^(?:\.(?:claude|codex|agents|github|husky)\/|scripts\/(?:agents|guardrails|verification|ci|production)\/|infra\/github\/)|(?:^|\/)AGENTS\.md$/;
const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const PUBLIC_URL = "https://github.com/Marcus100/grenmet/pull/";
const COMMAND_TIMEOUT_MS = 60_000;

export function securityRequired(files) {
  return (
    riskTier(files).tier === "high" ||
    files.some((file) => FACTORY_PATH.test(file))
  );
}

export function reviewPaths(files) {
  return [
    ...new Set(
      files
        .flatMap((file) => [file.filename, file.previous_filename])
        .filter((path) => typeof path === "string" && path.length > 0)
    ),
  ];
}

export function statusDescription(base, scope) {
  return `base=${base};scope=${scope}`;
}

export function statusMatches(statuses, context, base, scope, login) {
  // GitHub returns newest first. Never revive an older success after failure.
  const latest = statuses.find((status) => status.context === context);
  return (
    latest?.state === "success" &&
    latest.creator?.login === login &&
    latest.description === statusDescription(base, scope)
  );
}

export function ciBlockers(checks, required) {
  return required.filter((name) => {
    const matches = checks.filter(
      (check) => (check.name ?? check.context) === name
    );
    return (
      matches.length === 0 ||
      matches.some((check) =>
        check.__typename === "StatusContext"
          ? check.state !== "SUCCESS"
          : check.status !== "COMPLETED" || check.conclusion !== "SUCCESS"
      )
    );
  });
}

export function eligible(pr, includeDraft = false) {
  return (
    pr.state === "open" &&
    (!pr.draft || includeDraft) &&
    pr.base?.ref === "dev" &&
    pr.base.repo?.full_name === REPO &&
    pr.head?.repo?.full_name === REPO &&
    SHA.test(pr.head.sha) &&
    SHA.test(pr.base.sha)
  );
}

function command(spawn, name, args, root, input) {
  const result = spawn(name, args, {
    cwd: root,
    encoding: "utf8",
    input,
    timeout: COMMAND_TIMEOUT_MS,
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.status !== 0)
    throw new Error(
      `${name} ${args[0]} failed; no approval or merge is assumed.`
    );
  return result.stdout?.trim() ?? "";
}

export function services(root = ROOT, spawn = spawnSync) {
  const gh = (args, input) => command(spawn, "gh", args, root, input);
  const api = (path) => JSON.parse(gh(["api", `repos/${REPO}/${path}`]));
  return {
    login: () => JSON.parse(gh(["api", "user"])).login,
    list: () =>
      JSON.parse(
        gh([
          "pr",
          "list",
          "--repo",
          REPO,
          "--base",
          "dev",
          "--state",
          "open",
          "--label",
          REVIEW_LABEL,
          "--limit",
          "30",
          "--json",
          "number,isDraft",
        ])
      )
        .filter((pr) => !pr.isDraft)
        .map((pr) => pr.number),
    pull: (number) => api(`pulls/${number}`),
    files: (number) =>
      reviewPaths(
        JSON.parse(
          gh([
            "api",
            "--paginate",
            "--slurp",
            `repos/${REPO}/pulls/${number}/files?per_page=100`,
          ])
        ).flat()
      ),
    checks: (number) =>
      JSON.parse(
        gh([
          "pr",
          "view",
          String(number),
          "--repo",
          REPO,
          "--json",
          "statusCheckRollup",
        ])
      ).statusCheckRollup,
    statuses: (head) => api(`commits/${head}/statuses?per_page=100`),
    claim: (number) =>
      claimLock({
        cwd: root,
        issue: number,
        claimant: "factory-review-worker",
        staleHours: Number.POSITIVE_INFINITY,
      }),
    release: (number) => releaseLock({ cwd: root, issue: number }),
    prepare: (head, base) => {
      command(spawn, "git", ["fetch", "--no-tags", "origin", head, base], root);
      return command(spawn, "git", ["merge-base", head, base], root);
    },
    review: (number, kind, info) => {
      const role = kind === "security" ? "security-reviewer" : "code-reviewer";
      const code = runReview(
        [
          "--task",
          `Independent ${role} review of PR ${number}.`,
          "--criteria",
          `Read .claude/agents/${role}.md and follow that role. Review all changed files, including factory controls. Report incomplete if you cannot finish.`,
          "--post",
          String(number),
        ],
        { root, collect: () => info, spawn }
      );
      return { code, receipt: readReviewReceipt(receiptPath(root, spawn)) };
    },
    publish: (head, context, state, description, number) =>
      gh(
        [
          "api",
          "--method",
          "POST",
          `repos/${REPO}/statuses/${head}`,
          "--input",
          "-",
        ],
        JSON.stringify({
          state,
          context,
          description,
          target_url: `${PUBLIC_URL}${number}`,
        })
      ),
    merge: (number, head) =>
      gh([
        "pr",
        "merge",
        String(number),
        "--repo",
        REPO,
        "--merge",
        "--match-head-commit",
        head,
      ]),
  };
}

function sameRevision(left, right) {
  return (
    eligible(right, true) &&
    left.head.sha === right.head.sha &&
    left.base.sha === right.base.sha
  );
}

function currentInfo(pr, files, mergeBase) {
  return {
    base: "origin/dev",
    baseTip: pr.base.sha,
    mergeBase,
    branch: pr.head.ref,
    head: pr.head.sha,
    files,
    dirtyCount: 0,
    remoteVerified: true,
    pushed: true,
    receipt: null,
  };
}

function performReview(api, pr, kind, info, login, state) {
  const context = CONTEXTS[kind];
  const description = statusDescription(pr.base.sha, kind);
  if (
    statusMatches(api.statuses(pr.head.sha), context, pr.base.sha, kind, login)
  )
    return;
  api.publish(pr.head.sha, context, "pending", description, pr.number);
  try {
    state.reviewStarted = true;
    const result = api.review(pr.number, kind, info);
    const blockers = reviewBlockers(result.receipt, info, {
      requireLocalVerification: false,
    });
    if (result.code !== 0 || blockers.length > 0)
      throw new Error(`${kind} review failed or requested changes.`);
    if (!sameRevision(pr, api.pull(pr.number)))
      throw new Error("The PR head or base changed during review; requeue it.");
    api.publish(pr.head.sha, context, "success", description, pr.number);
  } catch (error) {
    api.publish(pr.head.sha, context, "failure", description, pr.number);
    // The failure status is published, so the next run skips this revision.
    if (error && typeof error === "object") error.reviewAttempted = true;
    throw error;
  }
}

export function processPull(number, options, api, requiredCi) {
  const pr = api.pull(number);
  if (!eligible(pr, options.includeDraft))
    return {
      outcome: "skipped",
      reason: "PR is draft, closed, external or not targeting dev.",
    };
  const blockedCi = ciBlockers(api.checks(number), requiredCi);
  if (blockedCi.length)
    return {
      outcome: "waiting",
      reason: `CI is not green: ${blockedCi.join(", ")}`,
    };
  const previous = api.statuses(pr.head.sha);
  if (
    !options.retry &&
    Object.entries(CONTEXTS).some(([kind, context]) => {
      const latest = previous.find((status) => status.context === context);
      return (
        latest?.state === "failure" &&
        latest.description === statusDescription(pr.base.sha, kind)
      );
    })
  )
    return {
      outcome: "waiting",
      reason:
        "This revision already failed review. Push a fix or explicitly select --pr with --retry.",
    };
  if (options.dryRun)
    return {
      outcome: "ready",
      reason: "Would claim and review this PR; no model call or mutation made.",
    };
  if (!api.claim(number).claimed)
    return { outcome: "waiting", reason: "Another worker owns this PR." };
  // Set once a review begins, so every later failure (post-review checks, the
  // merge call, releasing the claim) stops the queue, not only a failed review.
  const state = { reviewStarted: false };
  let outcome;
  let failure;
  try {
    outcome = reviewAndMerge(api, pr, options, requiredCi, state);
  } catch (error) {
    failure = markReviewAttempted(error, state);
  }
  try {
    const release = api.release(number);
    if (release.reason === "refused")
      console.error(
        `Claim for PR ${number} could not be released; maintainer recovery is required.`
      );
  } catch (error) {
    failure ??= markReviewAttempted(error, state);
  }
  if (failure) throw failure;
  return outcome;
}

function markReviewAttempted(error, state) {
  const failure = error instanceof Error ? error : new Error(String(error));
  if (state.reviewStarted) failure.reviewAttempted = true;
  return failure;
}

function reviewAndMerge(api, pr, options, requiredCi, state) {
  const login = api.login();
  if (!login) throw new Error("Cannot establish the trusted status issuer.");
  const files = api.files(pr.number);
  if (files.length === 0) throw new Error("Cannot review an empty file list.");
  const mergeBase = api.prepare(pr.head.sha, pr.base.sha);
  if (mergeBase !== pr.base.sha)
    return {
      outcome: "waiting",
      reason: "Integrate current dev and rerun verification before review.",
    };
  const info = currentInfo(pr, files, mergeBase);
  performReview(api, pr, "code", info, login, state);
  const security = securityRequired(files);
  if (security) performReview(api, pr, "security", info, login, state);
  else
    api.publish(
      pr.head.sha,
      CONTEXTS.security,
      "success",
      statusDescription(pr.base.sha, "not-required"),
      pr.number
    );
  const latest = api.pull(pr.number);
  if (!sameRevision(pr, latest))
    throw new Error("The PR changed; no merge attempted.");
  if (ciBlockers(api.checks(pr.number), requiredCi).length)
    throw new Error("CI is no longer green; no merge attempted.");
  const statuses = api.statuses(pr.head.sha);
  for (const kind of ["code", "security"]) {
    const scope = kind === "security" && !security ? "not-required" : kind;
    if (!statusMatches(statuses, CONTEXTS[kind], pr.base.sha, scope, login))
      throw new Error(
        "A current trusted review status is missing; no merge attempted."
      );
  }
  if (options.merge && !latest.draft) api.merge(pr.number, pr.head.sha);
  return {
    outcome: options.merge && !latest.draft ? "merged" : "reviewed",
    reason:
      "Independent review and CI are current for the exact head and base.",
    reviewAttempted: state.reviewStarted,
  };
}

/**
 * Walks the candidates until one review task ran. One review per invocation
 * bounds subscription use; wait for the next scheduled run rather than starting
 * unbounded reviews or retries. A candidate that cannot be processed (stale
 * base, API error) must not stop the PRs behind it, so errors are recorded and
 * the walk continues, unless a review was already attempted for that revision.
 * Returns the number of candidates that errored.
 */
export function processQueue(candidates, options, api, requiredCi, log) {
  let errors = 0;
  for (const candidate of candidates) {
    let result;
    try {
      result = processPull(candidate, options, api, requiredCi);
    } catch (error) {
      errors++;
      const reason = error instanceof Error ? error.message : String(error);
      log(JSON.stringify({ pr: candidate, outcome: "error", reason }));
      if (error && typeof error === "object" && error.reviewAttempted) break;
      continue;
    }
    const { reviewAttempted, ...loggedResult } = result;
    log(JSON.stringify({ pr: candidate, ...loggedResult }));
    if (["merged", "ready"].includes(result.outcome) || reviewAttempted) break;
  }
  return errors;
}

export function requiredChecks(root) {
  const snapshot = JSON.parse(
    readFileSync(join(root, "infra/github/rulesets.json"), "utf8")
  );
  const ruleset =
    snapshot.find((rule) => rule.name === "Protect dev") ??
    snapshot.find((rule) => rule.name === "Protect staging");
  const contexts = ruleset?.rules
    .find((rule) => rule.type === "required_status_checks")
    ?.parameters.required_status_checks.map((check) => check.context)
    .filter((name) => !Object.values(CONTEXTS).includes(name));
  if (!contexts?.length)
    throw new Error("No trusted CI requirements configured.");
  return contexts;
}

export function run(argv, root = ROOT, api = services(root)) {
  const { values } = parseArgs({
    args: argv.filter((arg) => arg !== "--"),
    options: {
      once: { type: "boolean" },
      merge: { type: "boolean" },
      pr: { type: "string" },
      retry: { type: "boolean" },
      "include-draft": { type: "boolean" },
      "dry-run": { type: "boolean" },
    },
  });
  const number = values.pr === undefined ? undefined : Number(values.pr);
  if (
    (number !== undefined && (!Number.isInteger(number) || number < 1)) ||
    ((values["include-draft"] || values.retry) && number === undefined)
  )
    throw new Error(
      "Use --pr <positive number> with --include-draft or --retry."
    );
  const options = {
    merge: values.merge,
    retry: values.retry,
    includeDraft: values["include-draft"],
    dryRun: values["dry-run"],
  };
  const candidates = number === undefined ? api.list() : [number];
  if (!candidates.length) {
    console.log("No labelled PRs ready for review.");
    return 0;
  }
  const release = options.dryRun
    ? () => undefined
    : acquireReviewLock(`${receiptPath(root)}.worker`);
  if (!release) {
    console.log("A local review worker is already running.");
    return 0;
  }
  try {
    const errors = processQueue(
      candidates,
      options,
      api,
      requiredChecks(root),
      (line) => console.log(line)
    );
    return errors > 0 ? 1 : 0;
  } finally {
    release();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = run(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
