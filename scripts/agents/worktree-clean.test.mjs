import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  inspectWorktree,
  manualRoot,
  processDirectories,
  removeWorktree,
  run,
  worktrees,
} from "./worktree-clean.mjs";

function git(root, ...args) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

function fixture(t) {
  const parent = mkdtempSync(join(tmpdir(), "safe-worktree-cleanup-"));
  t.after(() => rmSync(parent, { recursive: true, force: true }));
  const root = join(parent, "repo");
  const allowed = join(root, ".claude/worktrees");
  const path = join(allowed, "agent-finished");
  mkdirSync(allowed, { recursive: true });
  git(root, "init", "--quiet", "--initial-branch=main");
  git(root, "config", "user.name", "Cleanup Tests");
  git(root, "config", "user.email", "cleanup@example.com");
  writeFileSync(join(root, ".gitignore"), "node_modules/\n.env*\nprivate/\n");
  writeFileSync(join(root, "readme.md"), "committed source\n");
  git(root, "add", ".gitignore", "readme.md");
  git(root, "commit", "--quiet", "-m", "fixture");
  git(root, "update-ref", "refs/remotes/origin/dev", "HEAD");
  git(root, "worktree", "add", "--quiet", "-b", "finished", path);
  const entry = () => worktrees(root).find((item) => item.path === path);
  return { parent, root, allowed, path, entry };
}

test("default cleanup is a preview and never removes registered worktrees", (t) => {
  const { root, path } = fixture(t);
  const lines = [];
  assert.equal(
    run([], root, (line) => lines.push(line)),
    0
  );
  assert.equal(JSON.parse(lines[0]).mode, "preview");
  assert.equal(JSON.parse(lines[0]).worktrees.length, 1);
  assert.ok(existsSync(path));
});

test("an explicitly selected merged clean worktree can discard generated dependencies while retaining its branch", (t) => {
  const { root, path, entry } = fixture(t);
  mkdirSync(join(path, "node_modules"));
  writeFileSync(join(path, "node_modules/generated-cache"), "generated");
  assert.equal(inspectWorktree(root, entry(), () => []).eligible, true);
  const result = removeWorktree(root, path, () => []);
  assert.equal(result.removed, true);
  assert.equal(existsSync(path), false);
  assert.equal(
    git(root, "rev-parse", "refs/heads/finished"),
    git(root, "rev-parse", "origin/dev")
  );
});

test("source changes, untracked notes and ignored secrets block removal", (t) => {
  const { root, path, entry } = fixture(t);
  for (const [name, expected] of [
    ["readme.md", "Tracked changes"],
    ["notes.txt", "untracked files"],
    [".env.local", "Ignored data"],
  ]) {
    writeFileSync(join(path, name), "unique material");
    const result = inspectWorktree(root, entry(), () => []);
    assert.equal(result.eligible, false);
    assert.ok(result.reason.includes(expected), result.reason);
    assert.throws(() => removeWorktree(root, path, () => []));
    assert.ok(existsSync(path));
    if (name === "readme.md")
      writeFileSync(join(path, name), "committed source\n");
    else rmSync(join(path, name));
  }
});

test("unmerged commits and locked harness checkouts are preserved", (t) => {
  const { root, path, entry } = fixture(t);
  git(root, "worktree", "lock", "--reason", "active harness", path);
  assert.ok(inspectWorktree(root, entry(), () => []).reason.includes("locked"));
  assert.throws(() => removeWorktree(root, path, () => []));
  git(root, "worktree", "unlock", path);
  git(path, "commit", "--quiet", "--allow-empty", "-m", "unmerged work");
  assert.ok(
    inspectWorktree(root, entry(), () => []).reason.includes(
      "not verified as merged"
    )
  );
  assert.throws(() => removeWorktree(root, path, () => []));
  assert.ok(existsSync(path));
});

test("running processes or an incomplete activity check prevent removal", (t) => {
  const { root, path, entry } = fixture(t);
  assert.ok(
    inspectWorktree(root, entry(), () => [
      join(path, "nested"),
    ]).reason.includes("running process")
  );
  assert.throws(() => removeWorktree(root, path, () => [path]));
  assert.equal(
    inspectWorktree(root, entry(), () => {
      throw new Error("activity check unavailable");
    }).eligible,
    false
  );
  assert.ok(existsSync(path));
});

test("process directory names are preserved literally", (t) => {
  const { parent } = fixture(t);
  const proc = join(parent, "proc");
  mkdirSync(join(proc, "1234"), { recursive: true });
  const cwd = join(parent, "agent (deleted) notes");
  symlinkSync(cwd, join(proc, "1234/cwd"), "dir");
  assert.deepEqual(processDirectories(proc), [cwd]);
});

test("unregistered, external and symlinked paths cannot widen cleanup scope", (t) => {
  const { parent, root, allowed, entry } = fixture(t);
  const external = join(parent, "external");
  git(root, "worktree", "add", "--quiet", "-b", "external", external);
  const record = worktrees(root).find((item) => item.path === external);
  assert.equal(inspectWorktree(root, record, () => []).eligible, false);
  assert.throws(() => removeWorktree(root, external, () => []));
  assert.throws(() =>
    removeWorktree(root, join(allowed, "unregistered"), () => [])
  );
  const link = join(allowed, "agent-link");
  symlinkSync(external, link, "dir");
  assert.equal(
    inspectWorktree(root, { ...entry(), path: link }, () => []).eligible,
    false
  );
  assert.ok(existsSync(external));
});

test("a new commit during inspection aborts removal", (t) => {
  const { root, path } = fixture(t);
  let changed = false;
  assert.throws(
    () =>
      removeWorktree(root, path, () => {
        if (!changed) {
          changed = true;
          git(
            path,
            "commit",
            "--quiet",
            "--allow-empty",
            "-m",
            "concurrent work"
          );
        }
        return [];
      }),
    { message: "Worktree registration changed; inspect it again" }
  );
  assert.ok(existsSync(path));
});

const CANONICAL = /canonical \.claude\/worktrees/u;
const ABSOLUTE = /absolute/u;
const EMPTY = /must not be empty/u;
const SYMLINK = /symlink/u;
const OVERLAP = /outside the main checkout/u;

function manualFixture(t) {
  const base = fixture(t);
  const manual = join(base.parent, "worktrees", "repo");
  const task = join(manual, "finished-task");
  mkdirSync(manual, { recursive: true });
  git(base.root, "worktree", "add", "--quiet", "-b", "manual-task", task);
  return { ...base, manual, task };
}

test("manual worktrees stay out of the default scope", (t) => {
  const { root, task } = manualFixture(t);
  const lines = [];
  run(
    [],
    root,
    (line) => lines.push(line),
    () => []
  );
  const preview = JSON.parse(lines[0]);
  assert.equal(
    preview.worktrees.some((item) => item.path === task),
    false
  );
  assert.throws(
    () =>
      run(
        ["--remove", task],
        root,
        () => undefined,
        () => []
      ),
    { message: CANONICAL }
  );
  assert.ok(existsSync(task));
});

test("an explicit --root previews and removes a merged clean manual worktree, keeping its branch", (t) => {
  const { root, manual, task } = manualFixture(t);
  const lines = [];
  const log = (line) => lines.push(line);
  run(["--root", manual], root, log, () => []);
  const preview = JSON.parse(lines[0]);
  assert.equal(preview.root, manual);
  assert.deepEqual(
    preview.worktrees.map((item) => [item.path, item.eligible]),
    [[task, true]]
  );
  run(["--root", manual, "--remove", task], root, log, () => []);
  assert.equal(JSON.parse(lines[1]).removed, true);
  assert.equal(existsSync(task), false);
  assert.equal(
    git(root, "rev-parse", "refs/heads/manual-task"),
    git(root, "rev-parse", "origin/dev")
  );
});

test("a manual root keeps every fail-closed check", (t) => {
  const { root, manual, task } = manualFixture(t);
  const options = { allowed: manualRoot(root, manual) };
  const entry = () => worktrees(root).find((item) => item.path === task);
  writeFileSync(join(task, ".env.local"), "unique material");
  assert.ok(
    inspectWorktree(root, entry(), () => [], options).reason.includes(
      "Ignored data"
    )
  );
  rmSync(join(task, ".env.local"));
  git(task, "commit", "--quiet", "--allow-empty", "-m", "unmerged work");
  assert.ok(
    inspectWorktree(root, entry(), () => [], options).reason.includes(
      "not verified as merged"
    )
  );
  assert.throws(() => removeWorktree(root, task, () => [], options));
  assert.ok(existsSync(task));
});

test("a manual root cannot be relative, a symlink, or overlap the main checkout", (t) => {
  const { parent, root, allowed, manual } = manualFixture(t);
  const link = join(parent, "manual-link");
  symlinkSync(manual, link, "dir");
  for (const [candidate, message] of [
    ["worktrees/repo", ABSOLUTE],
    [link, SYMLINK],
    [root, OVERLAP],
    [allowed, OVERLAP],
    [parent, OVERLAP],
  ])
    assert.throws(() => manualRoot(root, candidate), { message });
  assert.throws(() => run(["--root", parent], root, () => undefined), {
    message: OVERLAP,
  });
  assert.throws(() => run(["--root", ""], root, () => undefined), {
    message: EMPTY,
  });
  assert.throws(
    () => run(["--root", "", "--remove", manual], root, () => undefined),
    { message: EMPTY }
  );
});
