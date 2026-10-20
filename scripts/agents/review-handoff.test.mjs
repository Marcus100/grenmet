/* biome-ignore-all lint/performance/useTopLevelRegex: Diagnostic regexes run once per isolated test. */

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { collect, render } from "./review-handoff.mjs";

const GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: "t",
  GIT_AUTHOR_EMAIL: "t@example.com",
  GIT_COMMITTER_NAME: "t",
  GIT_COMMITTER_EMAIL: "t@example.com",
};

function git(cwd, ...args) {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    env: GIT_ENV,
  });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

function repoWithTaskBranch() {
  const root = mkdtempSync(join(tmpdir(), "handoff-"));
  git(root, "init", "-q", "-b", "dev");
  writeFileSync(join(root, "base.txt"), "base\n");
  git(root, "add", ".");
  git(root, "commit", "-q", "-m", "base");
  git(root, "checkout", "-q", "-b", "task");
  writeFileSync(join(root, "feature.txt"), "feature\n");
  git(root, "add", ".");
  git(root, "commit", "-q", "-m", "feature");
  return root;
}

const info = {
  base: "origin/dev",
  baseTip: "b".repeat(40),
  branch: "task",
  dirtyCount: 0,
  files: ["docs/a.md"],
  head: "a".repeat(40),
  mergeBase: "b".repeat(40),
  pushed: true,
  receipt: { checks: ["doc links"], verifiedAt: "2026-10-20T00:00:00.000Z" },
};

test("collect reads head, merge-base, committed files and push state from git", () => {
  const root = repoWithTaskBranch();
  try {
    const result = collect(root, "dev");
    assert.equal(result.branch, "task");
    assert.equal(result.head, git(root, "rev-parse", "HEAD"));
    assert.equal(result.mergeBase, git(root, "rev-parse", "dev"));
    assert.equal(result.baseTip, result.mergeBase);
    assert.deepEqual(result.files, ["feature.txt"]);
    assert.equal(result.pushed, false);
    assert.equal(result.dirtyCount, 0);
    assert.equal(result.receipt, null);

    writeFileSync(join(root, "feature.txt"), "edited\n");
    assert.equal(collect(root, "dev").dirtyCount, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("collect reports a missing base instead of throwing", () => {
  const root = repoWithTaskBranch();
  try {
    const result = collect(root, "origin/nope");
    assert.equal(result.mergeBase, null);
    assert.match(render(result), /not available locally/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("render states SHAs, pushed state and checks, and flags the failure modes", () => {
  const ok = render(info);
  assert.match(
    ok,
    /^Read-only review\. Write nothing, including SESSION_LOG\.md\./
  );
  assert.match(ok, new RegExp(`Head SHA: ${"a".repeat(40)}`));
  assert.match(
    ok,
    new RegExp(`Base SHA: ${"b".repeat(40)} \\(origin/dev, current\\)`)
  );
  assert.match(ok, /Pushed: yes/);
  assert.match(ok, /Working tree: clean/);
  assert.match(ok, /Changed files \(1\):\n- docs\/a\.md/);
  assert.match(
    ok,
    /Checks: pnpm verify:changed PASS at 2026-10-20T00:00:00\.000Z \(doc links\)/
  );
  assert.match(ok, /Task: <fill in>/);

  const bad = render({
    ...info,
    baseTip: "c".repeat(40),
    pushed: false,
    dirtyCount: 2,
    receipt: null,
    files: [],
  });
  assert.match(bad, /has since advanced to c{40}/);
  assert.match(bad, /Pushed: NO\. Push the branch first/);
  assert.match(bad, /2 uncommitted change\(s\)/);
  assert.match(bad, /NOT VERIFIED/);
  assert.match(bad, /no commits beyond the base/);
});
