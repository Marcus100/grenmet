// Behavioral tests for the Claude Code / Codex guardrail hooks in
// .claude/hooks/. Exists because block-dangerous-git.mjs's predecessor
// blocked a live `grep -rn "git commit\|git add" ...` search during this
// repo's own agent-config review — the hook matched the search PATTERN
// text, not an executed command. That bug shipped past manual spot-checks;
// this asserts the exact regression, plus the surrounding block/pass matrix.
//
// Also covers a second live regression: `echo "test" > .env.test-hook` run
// through Codex's Bash tool was NOT caught by protect-files.mjs, because
// that hook only fired on structured file-edit calls (apply_patch /
// Write|Edit|MultiEdit) — a raw shell redirect never reaches those tools at
// all. Found by actually running it in a live Codex session, not by review.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { findBlockedPattern } from "../../.claude/hooks/block-dangerous-git.mjs";
import {
  findProtectedViolation,
  findShellWriteViolation,
} from "../../.claude/hooks/protect-files.mjs";

const BLOCKED_MESSAGE = /BLOCKED/;

const hooksDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  ".claude",
  "hooks"
);

function runHook(scriptName, input) {
  return spawnSync(process.execPath, [join(hooksDir, scriptName)], {
    input: JSON.stringify(input),
    encoding: "utf8",
  });
}

test("block-dangerous-git: does not flag dangerous phrases inside quoted strings", () => {
  // The exact command that falsely tripped the original bash+grep version.
  assert.equal(
    findBlockedPattern(
      'grep -rln "git commit\\|git add" .claude/skills .claude/commands'
    ),
    undefined
  );
  assert.equal(
    findBlockedPattern('echo "please git push this for me"'),
    undefined
  );
  assert.equal(
    findBlockedPattern('gh pr comment 1 --body "remember to git commit"'),
    undefined
  );
});

test("block-dangerous-git: still blocks the real, unquoted commands", () => {
  assert.ok(findBlockedPattern("git commit -m fix"));
  assert.ok(findBlockedPattern('git commit -m "fix bug"')); // command itself unquoted
  assert.ok(findBlockedPattern("git push origin main"));
  assert.ok(findBlockedPattern("git push --force"));
  assert.ok(findBlockedPattern("git reset --hard HEAD~1"));
  assert.ok(findBlockedPattern("git clean -fd"));
  assert.ok(findBlockedPattern("git branch -D feature-x"));
  assert.ok(findBlockedPattern("gh pr merge 42"));
  assert.ok(findBlockedPattern("npm test && git push")); // chained
});

test("block-dangerous-git: still blocks command substitution (not just literal quotes)", () => {
  assert.ok(findBlockedPattern("echo $(git commit -m sneaky)"));
  assert.ok(findBlockedPattern("echo `git push origin main`"));
});

test("block-dangerous-git: allows ordinary git/gh usage", () => {
  assert.equal(findBlockedPattern("git status"), undefined);
  assert.equal(findBlockedPattern("git diff --stat"), undefined);
  assert.equal(findBlockedPattern("git log --oneline -5"), undefined);
  assert.equal(findBlockedPattern("gh pr view 42"), undefined);
  assert.equal(findBlockedPattern("gh pr comment 42 --body hello"), undefined);
});

test("block-dangerous-git CLI: exits 2 and writes to stderr on a real command", () => {
  const result = runHook("block-dangerous-git.mjs", {
    tool_input: { command: "git push origin main" },
  });
  assert.equal(result.status, 2);
  assert.match(result.stderr, BLOCKED_MESSAGE);
});

test("block-dangerous-git CLI: exits 0 on the quoted-search regression case", () => {
  const result = runHook("block-dangerous-git.mjs", {
    tool_input: {
      command:
        'grep -rln "git commit\\|git add" .claude/skills .claude/commands',
    },
  });
  assert.equal(result.status, 0);
  assert.equal(result.stderr, "");
});

test("protect-files: blocks real env files but not env.ts/env.md or example templates", () => {
  assert.ok(findProtectedViolation("apps/web/auth/.env.local"));
  assert.ok(findProtectedViolation("apps/web/auth/.env"));
  assert.ok(findProtectedViolation(".env.production"));
  assert.equal(findProtectedViolation("apps/web/auth/src/env.ts"), null);
  assert.equal(findProtectedViolation("docs/env.md"), null);
  assert.equal(
    findProtectedViolation("apps/web/auth/.env.local.example"),
    null
  );
});

test("protect-files: blocks the generated API client, not ordinary api-client files", () => {
  assert.ok(
    findProtectedViolation("packages/api-client/src/gen/models/Foo.ts")
  );
  assert.equal(
    findProtectedViolation("packages/api-client/src/index.ts"),
    null
  );
});

test("protect-files: catches the live regression — a raw shell write via Bash, not a structured file-edit call", () => {
  // The exact command that slipped past on a live Codex session.
  assert.ok(findShellWriteViolation('echo "test" > .env.test-hook'));
  assert.ok(findShellWriteViolation("echo bad >> apps/web/auth/.env.local"));
  assert.ok(findShellWriteViolation("echo bad | tee .env.production"));
  assert.ok(
    findShellWriteViolation(
      "echo bad > packages/api-client/src/gen/models/Foo.ts"
    )
  );
});

test("protect-files: shell-write check allows benign redirects and doesn't false-positive on quoted mentions", () => {
  assert.equal(findShellWriteViolation("pnpm test > /tmp/output.log"), null);
  assert.equal(findShellWriteViolation('grep -rn "> .env" docs/'), null);
});

test("protect-files CLI: blocks a Bash tool_input.command that shell-redirects to a protected path", () => {
  const result = runHook("protect-files.mjs", {
    tool_input: { command: 'echo "test" > .env.test-hook' },
  });
  assert.equal(result.status, 2);
  assert.match(result.stderr, BLOCKED_MESSAGE);
});

test("protect-files CLI: exits 2 and writes to stderr for a protected file", () => {
  const result = runHook("protect-files.mjs", {
    tool_input: { file_path: "apps/web/auth/.env.local" },
  });
  assert.equal(result.status, 2);
  assert.match(result.stderr, BLOCKED_MESSAGE);
});

test("protect-files CLI: exits 0 for an ordinary file", () => {
  const result = runHook("protect-files.mjs", {
    tool_input: { file_path: "apps/web/gaa-admin/src/app/page.tsx" },
  });
  assert.equal(result.status, 0);
  assert.equal(result.stderr, "");
});

test("both hooks fail safe (exit 0) on malformed stdin, never throw", () => {
  for (const script of ["block-dangerous-git.mjs", "protect-files.mjs"]) {
    const result = spawnSync(process.execPath, [join(hooksDir, script)], {
      input: "not json",
      encoding: "utf8",
    });
    assert.equal(result.status, 0);
  }
});

for (const header of [
  "*** Add File: .env.local",
  "*** Update File: apps/web/auth/.env.local",
  "*** Delete File: packages/api-client/src/gen/index.ts",
  "*** Update File: ordinary.ts\n*** Move to: .env.local",
]) {
  test(`protect-files Codex patch blocks ${header}`, () => {
    const result = runHook("protect-files.mjs", {
      tool_name: "apply_patch",
      tool_input: {
        command: `*** Begin Patch\n${header}\n+placeholder\n*** End Patch`,
      },
    });
    assert.equal(result.status, 2);
    assert.match(result.stderr, BLOCKED_MESSAGE);
  });
}

test("protect-files Codex patch allows ordinary edits mentioning protected paths", () => {
  const result = runHook("protect-files.mjs", {
    tool_name: "apply_patch",
    tool_input: {
      command:
        "*** Begin Patch\n*** Add File: ordinary.ts\n+// .env.local\n*** End Patch",
    },
  });
  assert.equal(result.status, 0);
});
