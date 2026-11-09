import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  changedFiles,
  isEntryPoint,
  parseWorktreeList,
  resolveOnDisk,
  selectOwnedFiles,
  ultraciteArgs,
} from "./fix-changed.mjs";

const SCRIPT = fileURLToPath(new URL("./fix-changed.mjs", import.meta.url));
const NOTHING_TO_DO = /no changed files, nothing to do/u;

const MAIN = "/repo";
const AGENT = "/repo/.claude/worktrees/agent-a";
const SIBLING = "/repo/.claude/worktrees/agent-b";
const MANUAL = "/home/me/worktrees/repo/task";

function fakeResolve(map) {
  return (absolute, { directory }) => {
    const entry = map[absolute];
    if (entry === undefined) {
      return directory ? absolute : null;
    }
    return entry;
  };
}

describe("parseWorktreeList", () => {
  it("returns every worktree path", () => {
    const porcelain = [
      `worktree ${MAIN}`,
      "HEAD abc",
      "branch refs/heads/dev",
      "",
      `worktree ${AGENT}`,
      "HEAD def",
      "detached",
      "",
    ].join("\n");
    assert.deepEqual(parseWorktreeList(porcelain), [MAIN, AGENT]);
  });
});

describe("selectOwnedFiles", () => {
  const worktrees = [MAIN, AGENT, SIBLING, MANUAL];

  it("keeps ordinary files in the main checkout", () => {
    const { kept, skipped } = selectOwnedFiles({
      root: MAIN,
      files: ["scripts/a.mjs"],
      worktrees,
      resolve: fakeResolve({ "/repo/scripts/a.mjs": "/repo/scripts/a.mjs" }),
    });
    assert.deepEqual(kept, ["scripts/a.mjs"]);
    assert.deepEqual(skipped, []);
  });

  it("skips files inside a nested agent worktree when run from main", () => {
    const file = ".claude/worktrees/agent-b/src/x.ts";
    const { kept, skipped } = selectOwnedFiles({
      root: MAIN,
      files: [file],
      worktrees,
      resolve: fakeResolve({ [`${MAIN}/${file}`]: `${MAIN}/${file}` }),
    });
    assert.deepEqual(kept, []);
    assert.deepEqual(skipped, [file]);
  });

  it("keeps own files when the worktree is nested inside main", () => {
    const { kept } = selectOwnedFiles({
      root: AGENT,
      files: ["src/x.ts"],
      worktrees,
      resolve: fakeResolve({ [`${AGENT}/src/x.ts`]: `${AGENT}/src/x.ts` }),
    });
    assert.deepEqual(kept, ["src/x.ts"]);
  });

  it("skips symlinks that point into another worktree", () => {
    const { kept, skipped } = selectOwnedFiles({
      root: MAIN,
      files: ["link.ts"],
      worktrees,
      resolve: fakeResolve({ "/repo/link.ts": `${MANUAL}/src/x.ts` }),
    });
    assert.deepEqual(kept, []);
    assert.deepEqual(skipped, ["link.ts"]);
  });

  it("skips symlinks that leave the checkout entirely", () => {
    const { skipped } = selectOwnedFiles({
      root: AGENT,
      files: ["outside.ts"],
      worktrees,
      resolve: fakeResolve({ [`${AGENT}/outside.ts`]: "/etc/outside.ts" }),
    });
    assert.deepEqual(skipped, ["outside.ts"]);
  });

  it("skips directories and missing paths such as untracked nested repos", () => {
    const { kept, skipped } = selectOwnedFiles({
      root: MAIN,
      files: ["nested-repo/", "gone.ts"],
      worktrees,
      resolve: fakeResolve({}),
    });
    assert.deepEqual(kept, []);
    assert.deepEqual(skipped, ["nested-repo/", "gone.ts"]);
  });
});

function tempDir(t, prefix) {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), prefix)));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}

function git(cwd, ...args) {
  const result = spawnSync(
    "git",
    ["-c", "user.name=Test", "-c", "user.email=test@example.com", ...args],
    { cwd, encoding: "utf8" }
  );
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}

function cleanRepo(t) {
  const root = tempDir(t, "fix-changed-repo-");
  git(root, "init", "--quiet", "--initial-branch=main");
  writeFileSync(join(root, "readme.md"), "committed\n");
  git(root, "add", "readme.md");
  git(root, "commit", "--quiet", "-m", "fixture");
  return root;
}

describe("selectOwnedFiles on a real filesystem", () => {
  it("rejects escaping symlinks and directories, keeps in-root symlinks and non-ASCII names", (t) => {
    const root = tempDir(t, "fix-changed-root-");
    const outside = tempDir(t, "fix-changed-outside-");
    writeFileSync(join(outside, "secret.ts"), "export {};\n");
    writeFileSync(join(root, "inner.ts"), "export {};\n");
    writeFileSync(join(root, "café.ts"), "export {};\n");
    mkdirSync(join(root, "nested"));
    symlinkSync(join(outside, "secret.ts"), join(root, "escape.ts"));
    symlinkSync(join(root, "inner.ts"), join(root, "link.ts"));
    const { kept, skipped } = selectOwnedFiles({
      root,
      files: [
        "inner.ts",
        "café.ts",
        "link.ts",
        "escape.ts",
        "nested/",
        "nested",
      ],
      worktrees: [root],
      resolve: resolveOnDisk,
    });
    assert.deepEqual(kept, ["inner.ts", "café.ts", "link.ts"]);
    assert.deepEqual(skipped, ["escape.ts", "nested/", "nested"]);
  });
});

describe("changedFiles", () => {
  it("returns non-ASCII names verbatim, not quoted", (t) => {
    const root = cleanRepo(t);
    writeFileSync(join(root, "readme.md"), "changed\n");
    writeFileSync(join(root, "café.ts"), "export {};\n");
    assert.deepEqual(changedFiles(root).sort(), ["café.ts", "readme.md"]);
  });
});

describe("ultraciteArgs", () => {
  it("prefixes every path so none is read as an option", () => {
    assert.deepEqual(ultraciteArgs(["--write.ts", "a/b.ts"]), [
      "exec",
      "ultracite",
      "fix",
      "./--write.ts",
      "./a/b.ts",
    ]);
  });
});

describe("entry point", () => {
  it("is not triggered by a missing or different path", () => {
    assert.equal(isEntryPoint(undefined), false);
    assert.equal(isEntryPoint("/definitely/missing.mjs"), false);
  });

  it("runs when launched through a symlinked path", (t) => {
    const root = cleanRepo(t);
    const links = tempDir(t, "fix-changed-link-");
    const link = join(links, "fix-changed.mjs");
    symlinkSync(SCRIPT, link);
    const result = spawnSync(process.execPath, [link], {
      cwd: root,
      encoding: "utf8",
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, NOTHING_TO_DO);
  });
});
