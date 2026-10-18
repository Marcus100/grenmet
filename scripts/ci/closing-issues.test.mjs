import assert from "node:assert/strict";
import test from "node:test";
import { closingIssues } from "./closing-issues.mjs";

test("finds GitHub closing keywords in commit messages", () => {
  const commits = [
    { id: "a1", message: "fix(api): thing\n\nFixes #12, resolves #13" },
    { id: "b2", message: "ci: shard (Closes #12)" },
    { id: "c3", message: "refactor: tidy\n\nRefs #14" },
    { id: "d4", message: "chore: fixed: #15 and closed #16" },
  ];
  assert.deepEqual(closingIssues(commits), [
    { issue: 12, sha: "a1" },
    { issue: 13, sha: "a1" },
    { issue: 15, sha: "d4" },
    { issue: 16, sha: "d4" },
  ]);
});

test("ignores other repositories, plain references and missing input", () => {
  assert.deepEqual(
    closingIssues([{ id: "x", message: "Fixes other/repo#3, see #4, prefix#5" }]),
    []
  );
  assert.deepEqual(closingIssues(undefined), []);
});
