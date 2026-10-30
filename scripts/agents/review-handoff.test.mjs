import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  changedFiles,
  fingerprint,
  writeReceipt,
} from "../verification/receipt.mjs";
import { collect, lsRemote, render } from "./review-handoff.mjs";

const GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: "t",
  GIT_AUTHOR_EMAIL: "t@example.com",
  GIT_COMMITTER_NAME: "t",
  GIT_COMMITTER_EMAIL: "t@example.com",
};
const HEADER =
  /^Read-only review\. Write nothing, including SESSION_LOG\.md\./u;
const PUSHED_YES = /Pushed: yes/u;
const PUSHED_NO = /Pushed: NO\. Push the branch first/u;
const PUSHED_UNVERIFIED = /Pushed: UNVERIFIED/u;
const BASE_ADVANCED = /has since advanced to c{40}\. Merge it/u;
const BASE_UNVERIFIED = /has advanced is UNVERIFIED/u;
const BASE_CURRENT = /current on the remote/u;
const BASE_MISSING = /not available locally/u;
const TREE_CLEAN = /Working tree: clean/u;
const TREE_DIRTY = /2 uncommitted change\(s\)/u;
const FILES_ONE = /Changed files \(1\):\n- docs\/a\.md/u;
const FILES_NONE = /no commits beyond the base/u;
const CHECKS_PASS =
  /Checks: pnpm verify:changed PASS at 2026-10-20T00:00:00\.000Z \(doc links\)/u;
const CHECKS_DIRTY = /NOT VERIFIED for the committed head/u;
const TASK_PLACEHOLDER = /Task: <fill in>/u;

function git(cwd, ...args) {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    env: GIT_ENV,
  });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

function commitFile(root, name, content, message) {
  writeFileSync(join(root, name), content);
  git(root, "add", ".");
  git(root, "commit", "-q", "-m", message);
}

/** A clone with a `dev` base and a `task` branch, plus a bare `origin`. */
function repoWithRemote() {
  const dir = mkdtempSync(join(tmpdir(), "handoff-"));
  const remote = join(dir, "origin.git");
  const root = join(dir, "work");
  git(dir, "init", "-q", "--bare", remote);
  git(dir, "init", "-q", "-b", "dev", root);
  commitFile(root, "base.txt", "base\n", "base");
  git(root, "remote", "add", "origin", remote);
  git(root, "push", "-q", "origin", "dev");
  git(root, "checkout", "-q", "-b", "task");
  commitFile(root, "feature.txt", "feature\n", "feature");
  return { dir, root, remote };
}

const stub = (heads) => () => heads;
const unreachable = () => null;

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
  remoteVerified: true,
};

test("collect reads head, merge-base, committed files and push state", () => {
  const { dir, root } = repoWithRemote();
  try {
    const head = git(root, "rev-parse", "HEAD");
    const dev = git(root, "rev-parse", "dev");
    const before = collect(root, "origin/dev");
    assert.equal(before.branch, "task");
    assert.equal(before.head, head);
    assert.equal(before.mergeBase, dev);
    assert.equal(before.baseTip, dev);
    assert.deepEqual(before.files, ["feature.txt"]);
    assert.equal(before.pushed, false);
    assert.equal(before.remoteVerified, true);
    assert.equal(before.dirtyCount, 0);
    assert.equal(before.receipt, null);

    git(root, "push", "-q", "-u", "origin", "task");
    assert.equal(collect(root, "origin/dev").pushed, true);
    assert.deepEqual(lsRemote(root, ["task", "dev"]), { dev, task: head });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("stale tracking refs do not make a deleted or moved remote branch look pushed", () => {
  const { dir, root } = repoWithRemote();
  try {
    git(root, "push", "-q", "-u", "origin", "task");
    const head = git(root, "rev-parse", "HEAD");
    const dev = git(root, "rev-parse", "dev");
    // origin/task still equals HEAD locally; the remote says otherwise.
    assert.equal(git(root, "rev-parse", "origin/task"), head);
    const deleted = collect(root, "origin/dev", stub({ dev }));
    assert.equal(deleted.pushed, false);
    const moved = collect(
      root,
      "origin/dev",
      stub({ dev, task: "f".repeat(40) })
    );
    assert.equal(moved.pushed, false);
    assert.match(render(moved), PUSHED_NO);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a base that advanced on the remote is reported from the remote, not origin/dev", () => {
  const { dir, root } = repoWithRemote();
  try {
    const dev = git(root, "rev-parse", "dev");
    const advanced = "c".repeat(40);
    const result = collect(root, "origin/dev", stub({ dev: advanced }));
    assert.equal(result.mergeBase, dev);
    assert.equal(result.baseTip, advanced);
    assert.match(render(result), BASE_ADVANCED);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("an unreachable remote is reported as unverified, never as pushed or current", () => {
  const { dir, root } = repoWithRemote();
  try {
    git(root, "push", "-q", "-u", "origin", "task");
    const result = collect(root, "origin/dev", unreachable);
    assert.equal(result.pushed, null);
    assert.equal(result.remoteVerified, false);
    const text = render(result);
    assert.match(text, PUSHED_UNVERIFIED);
    assert.match(text, BASE_UNVERIFIED);
    assert.doesNotMatch(text, BASE_CURRENT);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a receipt is attributed to HEAD only when the tree is clean", () => {
  const { dir, root } = repoWithRemote();
  try {
    // Verify A, commit unverified B, then restore A as an uncommitted edit:
    // the receipt matches the bytes on disk but not the committed head.
    writeReceipt(root, {
      checks: ["doc tests"],
      verified: fingerprint(root, changedFiles(root, "dev")),
      verifiedAt: "2026-10-20T00:00:00.000Z",
    });
    assert.deepEqual(collect(root, "dev", unreachable).receipt, {
      checks: ["doc tests"],
      verifiedAt: "2026-10-20T00:00:00.000Z",
    });

    commitFile(root, "feature.txt", "B\n", "unverified");
    assert.equal(collect(root, "dev", unreachable).receipt, null);

    writeFileSync(join(root, "feature.txt"), "feature\n");
    const restored = collect(root, "dev", unreachable);
    assert.equal(restored.dirtyCount, 1);
    assert.equal(restored.receipt, null);
    assert.match(render(restored), CHECKS_DIRTY);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("collect reports a missing base instead of throwing", () => {
  const { dir, root } = repoWithRemote();
  try {
    const result = collect(root, "origin/nope", unreachable);
    assert.equal(result.mergeBase, null);
    assert.match(render(result), BASE_MISSING);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("render states SHAs, pushed state and checks, and flags the failure modes", () => {
  const ok = render(info);
  assert.match(ok, HEADER);
  assert.ok(ok.includes(`Head SHA: ${"a".repeat(40)}`));
  assert.ok(
    ok.includes(
      `Base SHA: ${"b".repeat(40)} (origin/dev, current on the remote)`
    )
  );
  assert.match(ok, PUSHED_YES);
  assert.match(ok, TREE_CLEAN);
  assert.match(ok, FILES_ONE);
  assert.match(ok, CHECKS_PASS);
  assert.match(ok, TASK_PLACEHOLDER);

  const bad = render({
    ...info,
    baseTip: "c".repeat(40),
    pushed: false,
    dirtyCount: 2,
    receipt: null,
    files: [],
  });
  assert.match(bad, BASE_ADVANCED);
  assert.match(bad, PUSHED_NO);
  assert.match(bad, TREE_DIRTY);
  assert.match(bad, CHECKS_DIRTY);
  assert.match(bad, FILES_NONE);
});
