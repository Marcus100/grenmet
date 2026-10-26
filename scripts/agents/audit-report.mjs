#!/usr/bin/env node
// Publishes structured advisory-audit observations as deduplicated GitHub issues.
// Only the fixed observation fields below enter public issue content; command
// output, stderr, repository contents, and private session data are never read.

import { createHash } from "node:crypto";
import {
  consolidateLegacy,
  updateTrackers,
  validateSecurityMetadata,
} from "./audit-security-report.mjs";

const EXPECTED_REPO = "Marcus100/grenmet";
const LABEL = "codex-audit";
const GENERATED_HEADER = "## Advisory audit observation";
const LOGIN_PATTERN = /^[a-zA-Z0-9-]{1,39}$/;
const OBSERVED_AT_LINE_PATTERN = /^- Observed: `([^`]+)`$/m;
const STATUSES = new Set(["pass", "fail", "unknown"]);
const SEVERITIES = new Set(["blocker", "high", "normal", "low"]);
const OWNERS = new Set(["Claude", "owner"]);
const KEY_PATTERN = /^[a-zA-Z0-9._:-]{1,120}$/;
const SHA_PATTERN = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i;
const BEARER_PATTERN = /\bBearer\s+\S+/gi;
const TOKEN_PATTERN =
  /\b(?:gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g;
const SECRET_ASSIGNMENT_PATTERN =
  /\b([A-Za-z0-9_-]*(?:api[_-]?key|access[_-]?token|auth[_-]?token|password|passwd|secret(?:[_-]?key)?|token))=([^\s&]+)/gi;
const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const URL_PATTERN = /https?:\/\/[^\s)<>]+/gi;
const URL_TRAILING_PUNCTUATION_PATTERN = /[.,;:!?]+$/;
const SAFE_GITHUB_PATH_PATTERN =
  /^\/(?:Marcus100\/grenmet\/actions\/runs\/\d+(?:\/job\/\d+)?|Marcus100\/grenmet\/issues\/\d+)$/;
const ABSOLUTE_PATH_PATTERN =
  /(?:[A-Za-z]:\\|\\\\|\/(?:home|Users|private|tmp|var|etc|mnt|workspace|root)\/)[^\s`<>]*/g;
const WHITESPACE_PATTERN = /[\r\n\t]+/g;
const REPEATED_SPACE_PATTERN = /\s{2,}/g;

const markerFor = (key) =>
  `<!-- codex-audit:${createHash("sha256").update(key).digest("hex").slice(0, 16)} -->`;

function sanitizeUrl(value) {
  const trailing = value.match(URL_TRAILING_PUNCTUATION_PATTERN)?.[0] ?? "";
  const candidate = trailing ? value.slice(0, -trailing.length) : value;
  try {
    const url = new URL(candidate);
    const isPublicGithubLink =
      url.protocol === "https:" &&
      url.hostname === "github.com" &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      SAFE_GITHUB_PATH_PATTERN.test(url.pathname);
    return isPublicGithubLink
      ? `${url.origin}${url.pathname}${trailing}`
      : `[redacted URL]${trailing}`;
  } catch {
    return `[redacted URL]${trailing}`;
  }
}

function safeText(value) {
  return value
    .replace(BEARER_PATTERN, "Bearer [redacted]")
    .replace(TOKEN_PATTERN, "[redacted token]")
    .replace(SECRET_ASSIGNMENT_PATTERN, (_match, name) => `${name}=[redacted]`)
    .replace(EMAIL_PATTERN, "[redacted email]")
    .replace(URL_PATTERN, sanitizeUrl)
    .replace(ABSOLUTE_PATH_PATTERN, "[redacted path]")
    .replace(WHITESPACE_PATTERN, " ")
    .replace(REPEATED_SPACE_PATTERN, " ")
    .trim();
}

function validateObservation(observation) {
  if (!observation || typeof observation !== "object")
    throw new Error("observation must be an object");
  if (typeof observation.key !== "string" || !KEY_PATTERN.test(observation.key))
    throw new Error("observation key is invalid");
  if (typeof observation.title !== "string" || !observation.title.trim())
    throw new Error("observation title is required");
  if (!STATUSES.has(observation.status))
    throw new Error("observation status is invalid");
  if (!SEVERITIES.has(observation.severity))
    throw new Error("observation severity is invalid");
  if (!OWNERS.has(observation.owner))
    throw new Error("observation owner is invalid");
  if (typeof observation.command !== "string" || !observation.command.trim())
    throw new Error("observation command is required");
  if (typeof observation.summary !== "string" || !observation.summary.trim())
    throw new Error("observation summary is required");
}

function issueBody(observation, commit, observedAt) {
  const marker = markerFor(observation.key);
  const lines = [
    GENERATED_HEADER,
    "",
    `- Status: **${observation.status}**`,
    `- Severity: **${observation.severity}**`,
    `- Owner: **${observation.owner}**`,
    `- Commit: \`${commit}\``,
    `- Observed: \`${observedAt}\``,
    `- Evidence command: \`${safeText(observation.command).replace(/`/g, "'")}\``,
    "",
    `Summary: ${safeText(observation.summary)}`,
    ...(observation.details ?? []).map((line) => `- ${safeText(line)}`),
    "",
    marker,
  ];
  return lines.join("\n");
}

async function authenticatedLogin(runGh) {
  let identity;
  try {
    const result = await runGh(["api", "user"]);
    identity = typeof result === "string" ? JSON.parse(result) : result;
  } catch {
    throw new Error("could not verify authenticated GitHub identity");
  }
  if (
    !identity ||
    typeof identity.login !== "string" ||
    !LOGIN_PATTERN.test(identity.login)
  )
    throw new Error("could not verify authenticated GitHub identity");
  return identity.login;
}

function parseIssuePages(result) {
  if (Array.isArray(result)) return result.flat(Number.POSITIVE_INFINITY);
  if (typeof result === "string") {
    try {
      return parseIssuePages(JSON.parse(result));
    } catch {
      throw new Error("could not parse GitHub issue listing");
    }
  }
  if (result && typeof result === "object") {
    if (Array.isArray(result.issues)) return result.issues;
    if (typeof result.stdout === "string")
      return parseIssuePages(result.stdout);
  }
  throw new Error("GitHub issue listing had an unexpected format");
}

async function listAuditIssues({ repo, runGh }) {
  const result = await runGh([
    "api",
    "--paginate",
    "--slurp",
    `repos/${repo}/issues?state=all&labels=${LABEL}&per_page=100`,
  ]);
  return parseIssuePages(result).filter(
    (issue) => issue && !issue.pull_request && Number.isInteger(issue.number)
  );
}

async function ensureLabel({ repo, runGh }) {
  const labelsResult = await runGh([
    "label",
    "list",
    "--repo",
    repo,
    "--limit",
    "1000",
    "--json",
    "name",
  ]);
  let labels;
  if (Array.isArray(labelsResult)) labels = labelsResult;
  else if (typeof labelsResult === "string") labels = JSON.parse(labelsResult);
  else labels = labelsResult?.labels;
  if (!Array.isArray(labels))
    throw new Error("could not parse GitHub label listing");
  if (!labels.some((label) => label?.name === LABEL)) {
    await runGh([
      "label",
      "create",
      LABEL,
      "--repo",
      repo,
      "--color",
      "5319e7",
      "--description",
      "Automated advisory audit finding",
    ]);
  }
}

function issueNumber(issue) {
  return String(issue.number);
}

function isOpen(issue) {
  return String(issue.state).toLowerCase() === "open";
}

async function updateIssue({ issue, title, body, repo, runGh }) {
  if (issue.title === title && issue.body === body) return false;
  await runGh([
    "issue",
    "edit",
    issueNumber(issue),
    "--repo",
    repo,
    "--title",
    title,
    "--body",
    body,
  ]);
  return true;
}

function matchingIssues(issues, key, login) {
  const marker = markerFor(key);
  return issues
    .filter(
      (issue) =>
        issue.user?.login === login &&
        typeof issue.body === "string" &&
        issue.body.startsWith(`${GENERATED_HEADER}\n\n`) &&
        issue.body.split("\n").includes(marker)
    )
    .sort((left, right) => left.number - right.number);
}

function unchanged(result, key, issue) {
  result.unchanged.push({ key, issueNumber: issue?.number ?? null });
}

function isNewerThanReport(issue, observedAt) {
  if (typeof issue.body !== "string") return false;
  const match = issue.body.match(OBSERVED_AT_LINE_PATTERN);
  if (!match) return false;
  const timestamp = Date.parse(match[1]);
  return Number.isFinite(timestamp) && timestamp > Date.parse(observedAt);
}

function recordBlocker(result, observation, issue) {
  if (observation.severity !== "blocker" || observation.status !== "fail")
    return;
  result.blockers.push({
    command: safeText(observation.command),
    issueNumber: issue?.number ?? null,
    key: observation.key,
    summary: safeText(observation.summary),
    title: safeText(observation.title),
  });
}

function planPass(
  observation,
  openIssues,
  active,
  commit,
  observedAt,
  planned,
  result
) {
  if (openIssues.length === 0) {
    unchanged(result, observation.key, active);
    return;
  }
  const title = safeText(observation.title);
  const body = issueBody(observation, commit, observedAt);
  for (const issue of openIssues) {
    if (issue.title !== title || issue.body !== body)
      planned.push({ action: "update", issue, observation, title, body });
    planned.push({ action: "close", issue, observation });
  }
}

function planFailure(observation, active, commit, observedAt, planned, result) {
  const title = safeText(observation.title);
  const body = issueBody(observation, commit, observedAt);
  if (!active) {
    planned.push({ action: "create", observation, title, body });
    return;
  }
  if (!isOpen(active))
    planned.push({ action: "reopen", issue: active, observation });
  if (active.title !== title || active.body !== body)
    planned.push({ action: "update", issue: active, observation, title, body });
  if (isOpen(active) && active.title === title && active.body === body)
    unchanged(result, observation.key, active);
}

function planObservation(
  observation,
  issues,
  login,
  commit,
  observedAt,
  planned,
  result
) {
  const matches = matchingIssues(issues, observation.key, login);
  const active = matches.find(isOpen) ?? matches[0];
  recordBlocker(result, observation, active);
  if (matches.some((issue) => isNewerThanReport(issue, observedAt))) {
    unchanged(result, observation.key, active);
    return;
  }
  if (observation.status === "unknown") {
    unchanged(result, observation.key, active);
    return;
  }
  if (observation.status === "pass") {
    planPass(
      observation,
      matches.filter(isOpen),
      active,
      commit,
      observedAt,
      planned,
      result
    );
    return;
  }
  planFailure(observation, active, commit, observedAt, planned, result);
}

function createResult() {
  return {
    blockers: [],
    closed: [],
    created: [],
    deferred: [],
    reopened: [],
    unchanged: [],
    updated: [],
  };
}

function severityPriority(severity) {
  switch (severity) {
    case "blocker":
      return 4;
    case "high":
      return 3;
    case "normal":
      return 2;
    default:
      return 1;
  }
}

function deferIssue(result, observation) {
  result.deferred.push({
    command: safeText(observation.command),
    key: observation.key,
    owner: observation.owner,
    severity: observation.severity,
    summary: safeText(observation.summary),
    title: safeText(observation.title),
  });
}

function limitNewIssues(planned, maxNewIssues, result) {
  const candidates = planned.filter((item) => item.action === "create");
  const selected = new Set(
    [...candidates]
      .sort(
        (left, right) =>
          severityPriority(right.observation.severity) -
          severityPriority(left.observation.severity)
      )
      .slice(0, maxNewIssues)
  );
  const limited = [];
  for (const item of planned) {
    if (item.action !== "create" || selected.has(item)) limited.push(item);
    else deferIssue(result, item.observation);
  }
  return limited;
}

function planObservations(
  observations,
  issues,
  login,
  commit,
  observedAt,
  result
) {
  const planned = [];
  for (const observation of observations)
    planObservation(
      observation,
      issues,
      login,
      commit,
      observedAt,
      planned,
      result
    );
  return planned;
}

function actionResultKey(action) {
  switch (action) {
    case "create":
      return "created";
    case "reopen":
      return "reopened";
    case "close":
      return "closed";
    default:
      return "updated";
  }
}

function planEntry(item) {
  return {
    key: item.observation.key,
    issueNumber: item.issue?.number ?? null,
  };
}

function reportDryRun(planned, result) {
  for (const item of planned)
    result[actionResultKey(item.action)].push(planEntry(item));
  return result;
}

async function applyAction(item, repo, runGh, result) {
  const entry = planEntry(item);
  if (item.action === "create") {
    await runGh([
      "issue",
      "create",
      "--repo",
      repo,
      "--title",
      item.title,
      "--body",
      item.body,
      "--label",
      LABEL,
    ]);
  } else if (item.action === "reopen") {
    await runGh(["issue", "reopen", issueNumber(item.issue), "--repo", repo]);
  } else if (item.action === "update") {
    const wasUpdated = await updateIssue({ ...item, repo, runGh });
    result[wasUpdated ? "updated" : "unchanged"].push(entry);
    return;
  } else if (item.action === "close") {
    await runGh(["issue", "close", issueNumber(item.issue), "--repo", repo]);
  }
  result[actionResultKey(item.action)].push(entry);
}

async function applyPlan(planned, repo, runGh, result) {
  if (planned.some((item) => item.action === "create"))
    await ensureLabel({ repo, runGh });
  for (const item of planned) await applyAction(item, repo, runGh, result);
  return result;
}

function validateRequest({ observations, repo, commit, runGh, maxNewIssues }) {
  if (repo !== EXPECTED_REPO) throw new Error(`repo must be ${EXPECTED_REPO}`);
  if (typeof commit !== "string" || !SHA_PATTERN.test(commit))
    throw new Error("commit must be a full Git SHA");
  if (typeof runGh !== "function") throw new Error("runGh must be a function");
  if (!Number.isInteger(maxNewIssues) || maxNewIssues < 1 || maxNewIssues > 50)
    throw new Error("maxNewIssues must be an integer from 1 to 50");
  if (!Array.isArray(observations))
    throw new Error("observations must be an array");
  observations.forEach(validateObservation);
  observations.forEach(validateSecurityMetadata);
  for (const item of observations)
    if (
      item.details !== undefined &&
      (!Array.isArray(item.details) ||
        item.details.some((line) => typeof line !== "string"))
    )
      throw new Error("Invalid report details");
  const keys = observations.map((item) => item.key);
  if (new Set(keys).size !== keys.length)
    throw new Error("observation keys must be unique");
}

/**
 * Publish safe, structured observations to deduplicated GitHub issues.
 *
 * `runGh` receives an argv array and returns parsed JSON or stdout text. Its
 * mutation output is ignored. The sessionLog and now arguments are accepted for
 * the lane contract; callers own private run logging and timekeeping. Creation
 * is capped by `maxNewIssues` (default 10, maximum 50); excess safe observations
 * are returned in `deferred` for a later run. Updates and closures are uncapped.
 */
export async function publishObservations(options) {
  const {
    observations,
    repo,
    commit,
    runGh,
    dryRun = false,
    maxNewIssues = 10,
    nowISO,
    now = new Date(),
  } = options;
  validateRequest({ observations, repo, commit, runGh, maxNewIssues });
  const observedDate = nowISO === undefined ? new Date(now) : new Date(nowISO);
  if (!Number.isFinite(observedDate.getTime()))
    throw new Error("nowISO must be a valid date");
  const observedAt = observedDate.toISOString();
  const login = await authenticatedLogin(runGh);
  const issues = await listAuditIssues({ repo, runGh });
  const result = createResult();
  const targets = await updateTrackers({
    observations,
    runGh,
    repo,
    login,
    observedAt,
    dryRun,
    safeText,
  });
  const planned = limitNewIssues(
    planObservations(
      observations.filter((i) => !targets.has(i.key)),
      issues,
      login,
      commit,
      observedAt,
      result
    ),
    maxNewIssues,
    result
  );
  if (dryRun) reportDryRun(planned, result);
  else await applyPlan(planned, repo, runGh, result);
  if (observations.some((i) => i.alertNumbers))
    await consolidateLegacy({
      observations,
      issues: dryRun ? issues : await listAuditIssues({ repo, runGh }),
      targets,
      matchingIssues,
      runGh,
      repo,
      login,
      dryRun,
      result,
    });
  return result;
}
