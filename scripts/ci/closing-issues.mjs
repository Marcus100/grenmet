#!/usr/bin/env node
// Lists the issues that commits pushed to dev say they close. GitHub only
// honours closing keywords on the default branch (main), so the
// close-issues-on-dev workflow uses this to close them when work lands on dev.
// Usage: node scripts/ci/closing-issues.mjs <push-event.json>
// Prints one "<issue> <sha>" line per issue (first closing commit wins).

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// GitHub's closing keywords, same-repository references only ("Fixes #12").
const CLOSING = /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s*:?\s+#(\d+)\b/gi;

export function closingIssues(commits) {
  const found = new Map();
  for (const commit of commits ?? []) {
    for (const match of String(commit?.message ?? "").matchAll(CLOSING)) {
      const issue = Number(match[1]);
      if (!found.has(issue)) {
        found.set(issue, String(commit.id ?? ""));
      }
    }
  }
  return [...found].map(([issue, sha]) => ({ issue, sha }));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const event = JSON.parse(readFileSync(process.argv[2], "utf8"));
  for (const { issue, sha } of closingIssues(event.commits)) {
    console.log(`${issue} ${sha}`);
  }
}
