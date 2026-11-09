import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseWorktreeList, selectOwnedFiles } from "./fix-changed.mjs";

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
