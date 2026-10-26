import { createHash } from "node:crypto";

const TRACKERS = new Set([721, 722, 733]);
const LEGACY_TITLE = /^Open (dependabot|code-scanning) alert (\d+)$/;
const GENERATED_MARKER = /<!-- codex-audit:[a-f0-9]{16} -->/;
const parse = (value) =>
  typeof value === "string" ? JSON.parse(value) : value;
const flat = (value) => parse(value).flat(Number.POSITIVE_INFINITY);
const fingerprint = (items) =>
  createHash("sha256")
    .update(
      JSON.stringify(
        items
          .map((i) => [i.key, i.openAlertNumbers])
          .sort(([a], [b]) => a.localeCompare(b))
      )
    )
    .digest("hex")
    .slice(0, 24);

export function validateSecurityMetadata(item) {
  if (item.trackingIssue !== undefined && !TRACKERS.has(item.trackingIssue))
    throw new Error("Invalid tracking issue");
  for (const field of ["alertNumbers", "openAlertNumbers"]) {
    if (
      item[field] !== undefined &&
      (!Array.isArray(item[field]) ||
        item[field].some((n) => !Number.isSafeInteger(n) || n < 1))
    )
      throw new Error("Invalid alert numbers");
  }
  if (
    item.trackingIssue &&
    !(
      item.key.startsWith("security:dependabot:group:") && item.openAlertNumbers
    )
  )
    throw new Error("Invalid tracked group");
}

// Run under the publisher's shared flock. GitHub comments are the durable state,
// so restarting the host or losing local receipts cannot reset the daily limit.
export async function updateTrackers({
  observations,
  runGh,
  repo,
  login,
  observedAt,
  dryRun,
  safeText,
}) {
  const targets = new Map();
  for (const number of TRACKERS) {
    const items = observations.filter((i) => i.trackingIssue === number);
    const complete = observations.some(
      (i) => i.key === "coverage:dependabot" && i.status === "pass"
    );
    if (!(items.length || complete)) continue;
    const issue = parse(await runGh(["api", `repos/${repo}/issues/${number}`]));
    if (!items.length && issue.state !== "open") continue;
    if (issue.state !== "open" || issue.pull_request)
      throw new Error(
        `Tracking issue ${number} is not open; review coverage before reporting`
      );
    for (const item of items) targets.set(item.key, number);
    const comments = flat(
      await runGh([
        "api",
        "--paginate",
        "--slurp",
        `repos/${repo}/issues/${number}/comments?per_page=100`,
      ])
    );
    const prefix = `<!-- codex-audit-tracker:${number}:`;
    const previous = comments
      .filter((c) => c.user?.login === login && c.body?.includes(prefix))
      .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
    if (!(items.length || previous.length)) continue;
    const signature = fingerprint(items);
    if (
      previous[0]?.body.includes(`${prefix}${signature} -->`) ||
      previous.some(
        (c) => c.created_at.slice(0, 10) === observedAt.slice(0, 10)
      )
    )
      continue;
    if (!dryRun)
      await runGh([
        "issue",
        "comment",
        String(number),
        "--repo",
        repo,
        "--body",
        `Advisory dependency alert set changed (${observedAt.slice(0, 10)} UTC).\n\n${items.length ? items.map((i) => `- ${safeText(i.summary)}`).join("\n") : "No open dependency alerts remain assigned to this tracker."}\n\n${prefix}${signature} -->`,
      ]);
  }
  return targets;
}

export async function consolidateLegacy({
  observations,
  issues,
  targets,
  matchingIssues,
  runGh,
  repo,
  login,
  dryRun,
  result,
}) {
  for (const item of observations.filter((i) => i.alertNumbers)) {
    const matches = matchingIssues(issues, item.key, login).filter(
      (i) => i.state === "open"
    );
    const target = targets.get(item.key) ?? matches[0]?.number;
    if (!target) continue; // Intake cap: never close a finding before its replacement exists.
    const duplicates = issues.filter((issue) => {
      const legacy = issue.title?.match(LEGACY_TITLE);
      return (
        issue.state === "open" &&
        issue.number !== target &&
        issue.user?.login === login &&
        issue.body?.startsWith("## Advisory audit observation\n\n") &&
        GENERATED_MARKER.test(issue.body) &&
        ((legacy &&
          legacy[1] === (item.alertSource ?? "dependabot") &&
          item.alertNumbers.includes(Number(legacy[2]))) ||
          matches.some((m) => m.number === issue.number))
      );
    });
    for (const issue of duplicates) {
      if (!dryRun)
        await runGh([
          "issue",
          "close",
          String(issue.number),
          "--repo",
          repo,
          "--reason",
          "not planned",
          "--comment",
          `Consolidated into https://github.com/${repo}/issues/${target}. This package/manifest is tracked there; no separate per-alert issue is needed.`,
        ]);
      result.closed.push({ key: item.key, issueNumber: issue.number });
      issue.state = "closed";
    }
  }
}
