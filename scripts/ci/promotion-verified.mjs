// A promotion pull request (dev → staging, staging → main) carries code that
// already landed on dev. Its merge result has the same git tree as a dev
// commit, and that commit already passed every check the dev ruleset
// requires, so running the suites again proves nothing new (#1239).
//
// This decides whether a promotion PR may reuse those results: the tree of
// the checked-out merge result must match a dev commit whose required checks
// all succeeded, reported by the GitHub App the ruleset names. Anything else
// (a commit that did not come from dev, a missing, failed or cancelled check,
// an API error) answers "not verified" and the full suite runs. It fails
// towards running more, never fewer, checks.
//
// The same lookup gates staging and production deploys
// (scripts/ci/promote-images.mjs), so a PR that skips here could not have
// deployed anything the dev checks had not passed.

import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  requiredChecks,
  sourceCommit,
  treeOf,
  verifyChecks,
} from "./promote-images.mjs";

/**
 * Whether the checked-out promotion can reuse dev's check results.
 * Returns `{ verified, commit?, reason }`; never throws.
 */
export function promotionVerified({ git, gh, repository, head = "HEAD" }) {
  try {
    const tree = treeOf(head, git);
    const commit = sourceCommit(tree, git);
    const rulesets = JSON.parse(
      git(["show", `${commit}:infra/github/rulesets.json`])
    );
    verifyChecks(commit, requiredChecks(rulesets), gh, repository);
    return {
      verified: true,
      commit,
      reason: `tree ${tree} is dev commit ${commit}, whose required checks all passed`,
    };
  } catch (error) {
    return {
      verified: false,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

const run = (command) => (args) =>
  execFileSync(command, args, {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = promotionVerified({
    git: run("git"),
    gh: run("gh"),
    repository: process.env.GITHUB_REPOSITORY,
  });
  console.log(
    result.verified
      ? `Reusing dev checks: ${result.reason}.`
      : `Running every check: ${result.reason}`
  );
  if (process.env.GITHUB_OUTPUT)
    appendFileSync(process.env.GITHUB_OUTPUT, `verified=${result.verified}\n`);
}
