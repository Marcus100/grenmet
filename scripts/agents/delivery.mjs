#!/usr/bin/env node
// Delivery metrics: how long a change takes from its merge into `dev` to being
// live on production, and how often production releases go out. `flow.mjs`
// stops at the merge into `dev`; this script picks up from there.
//
//   per release   changes, merge → production (median and slowest),
//                 publish → production, deploy result
//   overall       releases per week, merge → production (median, slowest 10%),
//                 failed or cancelled production deploys,
//                 follow-up releases within a day (a rough sign of a fix-up)
//
// Sources: `gh release list`, `pipeline-prod.yml` runs (`gh run list`) and git
// history between release tags. A change is one pull request merged into
// `dev` (promotion merges from dev, staging or main are not changes).
//
// Usage: node scripts/agents/delivery.mjs [--days 30] [--json]

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
const DEFAULT_DAYS = 30;
const FOLLOW_UP_MS = DAY_MS;
const SEP = "\u001f";
const PR_MERGE_RE = /^Merge pull request #(\d+) from [^/\s]+\/(\S+)/u;
const SYNC_BRANCHES = new Set(["dev", "staging", "main"]);

/** Pull requests merged into dev, from `git log --merges` lines. */
export function parseMerges(log) {
  const changes = [];
  for (const line of log.split("\n")) {
    if (!line) {
      continue;
    }
    const [sha, date, subject] = line.split(SEP);
    const match = PR_MERGE_RE.exec(subject ?? "");
    if (!match || SYNC_BRANCHES.has(match[2])) {
      continue;
    }
    changes.push({ sha, mergedAt: Date.parse(date), pr: Number(match[1]) });
  }
  return changes;
}

/** Value at the given share (0–1) of a list, nearest rank; null when empty. */
export function percentile(values, share) {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil(share * sorted.length) - 1;
  return sorted[Math.min(Math.max(rank, 0), sorted.length - 1)];
}

/**
 * Join releases, their production deploys and the changes each carried.
 * `releases`: [{ tag, publishedAt (ms) }] oldest first.
 * `deploys`: { [tag]: { conclusion, finishedAt (ms) } } (latest run per tag).
 * `changesFor(previousTag, tag)`: the changes a release carried.
 */
export function computeDelivery({ releases, deploys, changesFor, days, now }) {
  const since = now - days * DAY_MS;
  const rows = [];
  for (let index = 1; index < releases.length; index += 1) {
    const release = releases[index];
    if (release.publishedAt < since) {
      continue;
    }
    const deploy = deploys[release.tag];
    const live = deploy?.conclusion === "success" ? deploy.finishedAt : null;
    const changes = changesFor(releases[index - 1].tag, release.tag);
    const leads = live ? changes.map((change) => live - change.mergedAt) : [];
    const next = releases[index + 1];
    rows.push({
      tag: release.tag,
      publishedAt: release.publishedAt,
      deploy: deploy?.conclusion ?? "none",
      changes: changes.length,
      medianLeadMs: percentile(leads, 0.5),
      slowestLeadMs: leads.length > 0 ? Math.max(...leads) : null,
      publishToLiveMs: live ? live - release.publishedAt : null,
      followUp: Boolean(
        next && next.publishedAt - release.publishedAt < FOLLOW_UP_MS
      ),
      leads,
    });
  }
  const allLeads = rows.flatMap((row) => row.leads);
  const weeks = Math.max(days / 7, 1 / 7);
  return {
    releases: rows.map(({ leads: _leads, ...row }) => row),
    releasesPerWeek: rows.length / weeks,
    medianLeadMs: percentile(allLeads, 0.5),
    p90LeadMs: percentile(allLeads, 0.9),
    failedDeploys: rows.filter(
      (row) => !["success", "none"].includes(row.deploy)
    ).length,
    followUps: rows.filter((row) => row.followUp).length,
    // A release with no production run found (never ran, or older than the
    // runs `gh run list` returned) is not a success either; say so.
    noDeployFound: rows.filter((row) => row.deploy === "none").length,
  };
}

/** Hours, or days past 48 h, for people reading the table. */
export function formatDuration(ms) {
  if (ms === null || ms === undefined) {
    return "—";
  }
  const hours = ms / HOUR_MS;
  return hours >= 48 ? `${(hours / 24).toFixed(1)} d` : `${hours.toFixed(1)} h`;
}

export function formatDelivery(result, { days }) {
  const lines = [
    `Last ${days} days: ${result.releases.length} production releases (${result.releasesPerWeek.toFixed(1)} per week)`,
    `Merge into dev → live on production: median ${formatDuration(result.medianLeadMs)}, slowest 10% ${formatDuration(result.p90LeadMs)}`,
    `Failed or cancelled production deploys: ${result.failedDeploys}; no deploy run found: ${result.noDeployFound}; follow-up release within a day: ${result.followUps}`,
    "",
    "Release   changes  merge→live median  slowest   publish→live  deploy",
  ];
  for (const row of result.releases) {
    lines.push(
      [
        row.tag.padEnd(9),
        String(row.changes).padStart(7),
        formatDuration(row.medianLeadMs).padStart(18),
        formatDuration(row.slowestLeadMs).padStart(9),
        formatDuration(row.publishToLiveMs).padStart(13),
        ` ${row.deploy}${row.followUp ? " (follow-up next day)" : ""}`,
      ].join(" ")
    );
  }
  return lines.join("\n");
}

function run(command, args) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    maxBuffer: 64e6,
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed: ${result.stderr}`);
  }
  return result.stdout;
}

function load() {
  const releases = JSON.parse(
    run("gh", [
      "release",
      "list",
      "--limit",
      "100",
      "--json",
      "tagName,publishedAt,isDraft",
    ])
  )
    .filter((release) => !release.isDraft && release.publishedAt)
    .map((release) => ({
      tag: release.tagName,
      publishedAt: Date.parse(release.publishedAt),
    }))
    .sort((a, b) => a.publishedAt - b.publishedAt);
  const deploys = {};
  const runs = JSON.parse(
    run("gh", [
      "run",
      "list",
      "--workflow",
      "pipeline-prod.yml",
      "--limit",
      "200",
      "--json",
      "headBranch,conclusion,updatedAt,createdAt",
    ])
  ).sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  for (const item of runs) {
    deploys[item.headBranch] = {
      conclusion: item.conclusion || "running",
      finishedAt: Date.parse(item.updatedAt),
    };
  }
  run("git", ["fetch", "--quiet", "--tags", "origin"]);
  const changesFor = (previous, tag) =>
    parseMerges(
      run("git", [
        "log",
        "--merges",
        `--format=%H${SEP}%cI${SEP}%s`,
        `${previous}..${tag}`,
      ])
    );
  return { releases, deploys, changesFor };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const daysIndex = process.argv.indexOf("--days");
  const days =
    daysIndex > 0 ? Number(process.argv[daysIndex + 1]) : DEFAULT_DAYS;
  if (!(Number.isFinite(days) && days > 0)) {
    console.error("--days needs a positive number");
    process.exit(1);
  }
  const result = computeDelivery({ ...load(), days, now: Date.now() });
  console.log(
    process.argv.includes("--json")
      ? JSON.stringify(result, null, 2)
      : formatDelivery(result, { days })
  );
}
