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
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  appendAuditLine,
  redactSecrets,
} from "../../.claude/hooks/audit-log.mjs";
import { findBlockedPattern } from "../../.claude/hooks/block-dangerous-git.mjs";
import { isInsideRepo } from "../../.claude/hooks/format-changed-file.mjs";
import {
  findAskFirstEdit,
  findProtectedViolation,
  findShellWriteViolation,
} from "../../.claude/hooks/protect-files.mjs";
import {
  MAX_OUTPUT_CHARS,
  renderHandoff,
} from "../../.claude/hooks/session-handoff.mjs";

const BLOCKED_MESSAGE = /BLOCKED/;
const baseIs = (base) => ({ lookupBase: () => base });
const MAIN_BASE = /main/;
const UNKNOWN_BASE = /unknown base/;
const ADMIN_FLAG = /--admin/;
const REDACTED_MARK = /\[REDACTED\]/;
const NEWEST_ENTRY = /entry 59 /;
const SECOND_NEWEST_ENTRY = /entry 58 /;
const ELLIPSIS = /…/;

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
  assert.equal(findBlockedPattern("git commit -m fix"), undefined);
  assert.equal(findBlockedPattern('git commit -m "fix bug"'), undefined);
  assert.equal(findBlockedPattern("git push origin dev"), undefined);
  assert.ok(findBlockedPattern("git push --force"));
  assert.ok(findBlockedPattern("git reset --hard HEAD~1"));
  assert.ok(findBlockedPattern("git clean -fd"));
  assert.ok(findBlockedPattern("git branch -D feature-x"));
  assert.ok(findBlockedPattern("gh pr merge 42", baseIs("main")));
  assert.equal(findBlockedPattern("npm test && git push"), undefined);
});

test("block-dangerous-git: blocks force and discard variants that slipped past the old patterns", () => {
  for (const command of [
    "git push -f origin dev",
    "git push origin +dev",
    "git push --force-with-lease",
    "git checkout -- .",
    "git restore .",
    "git restore --staged --worktree .",
    "git stash clear",
    "git worktree remove --force old",
    "git branch --delete --force feature-x",
    "git clean -xfd",
    "git switch -f main",
    "git switch --discard-changes main",
    "gh api -X PUT repos/o/r/pulls/5/merge",
  ]) {
    assert.ok(findBlockedPattern(command, baseIs("main")), command);
  }
});

test("block-dangerous-git: scans commands run through bash -c, sh -c and eval", () => {
  assert.ok(findBlockedPattern('bash -c "git reset --hard"'));
  assert.ok(findBlockedPattern("sh -c 'git clean -xfd'"));
  assert.ok(findBlockedPattern('eval "git push -f origin dev"'));
  assert.equal(findBlockedPattern('bash -c "git status"'), undefined);
});

test("block-dangerous-git: treats heredoc text as text unless a shell runs it", () => {
  const message =
    "git commit -F - <<'EOF'\nfix(hooks): allow gh pr merge into staging, block git push -f\nEOF";
  assert.equal(findBlockedPattern(message, baseIs("main")), undefined);
  assert.equal(
    findBlockedPattern("cat > notes.md <<EOF\nnever run git reset --hard\nEOF"),
    undefined
  );
  assert.ok(findBlockedPattern("bash <<'EOF'\ngit reset --hard\nEOF"));
  assert.ok(findBlockedPattern("cat <<'EOF' | sh\ngit clean -fd\nEOF"));
  assert.ok(
    findBlockedPattern("cat > out.txt <<EOF\n$(git reset --hard)\nEOF")
  );
});

test("block-dangerous-git: allows the safe neighbours of blocked commands", () => {
  for (const command of [
    "git push -u origin dev",
    "git push && rm -f build.log",
    "git restore --staged .",
    "git restore src/app.ts",
    "git stash drop stash@{0}",
    "git worktree remove old",
    "git branch -d feature-x",
    "git checkout -b feature-x",
    "git clean -n",
    "git log --follow -- src/app.ts",
  ]) {
    assert.equal(
      findBlockedPattern(command, baseIs("main")),
      undefined,
      command
    );
  }
});

test("block-dangerous-git: allows gh pr merge only into staging, failing closed", () => {
  const command = "gh pr merge 42 --merge --match-head-commit abc123";
  assert.equal(findBlockedPattern(command, baseIs("staging")), undefined);
  assert.match(String(findBlockedPattern(command, baseIs("main"))), MAIN_BASE);
  assert.match(String(findBlockedPattern(command, baseIs(null))), UNKNOWN_BASE);
  assert.match(
    String(findBlockedPattern("gh pr merge 42 --admin", baseIs("staging"))),
    ADMIN_FLAG
  );
});

test("block-dangerous-git: looks up the merge base for the PR and repo named", () => {
  const seen = [];
  findBlockedPattern("gh pr merge 42 --repo Marcus100/grenmet --auto", {
    lookupBase: (args) => {
      seen.push(args);
      return "staging";
    },
  });
  assert.deepEqual(seen, [["42", "--repo", "Marcus100/grenmet", "--auto"]]);
});

test("block-dangerous-git: still blocks command substitution (not just literal quotes)", () => {
  assert.ok(findBlockedPattern("echo $(git reset --hard)"));
  assert.ok(findBlockedPattern("echo `git push --force origin main`"));
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
    tool_input: { command: "git push --force origin main" },
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

test("protect-files: allows committed infra deploy config, not real env files beside it", () => {
  assert.equal(findProtectedViolation("infra/docker/staging.env"), null);
  assert.equal(
    findProtectedViolation("/home/x/grenmet/infra/docker/production.env"),
    null
  );
  assert.ok(findProtectedViolation("infra/docker/.env"));
  assert.ok(findProtectedViolation("infra/docker/.env.local"));
  assert.ok(findProtectedViolation("infra/docker/production.env.local"));
  assert.ok(findProtectedViolation("other/docker/production.env"));
  assert.equal(
    findShellWriteViolation("echo X >> infra/docker/staging.env"),
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

test("protect-files: asks before shared toolchain config edits", () => {
  assert.ok(findAskFirstEdit("turbo.json"));
  assert.ok(findAskFirstEdit("biome.jsonc"));
  assert.ok(findAskFirstEdit("apps/web/gms/tsconfig.json"));
  assert.ok(findAskFirstEdit("packages/ui/tsconfig.build.json"));
  assert.equal(findAskFirstEdit("apps/web/gms/src/turbo.ts"), null);
  assert.equal(findAskFirstEdit("docs/tsconfig.md"), null);
});

test("protect-files: asks only when a manifest gains a non-catalog dependency", () => {
  assert.ok(findAskFirstEdit("apps/web/gms/package.json", '"zod": "^3.24.0"'));
  assert.ok(findAskFirstEdit("package.json", '"left-pad": "1.3.0"'));
  assert.equal(findAskFirstEdit("package.json", '"zod": "catalog:"'), null);
  assert.equal(
    findAskFirstEdit("package.json", '"@barrelsgd/ui": "workspace:*"'),
    null
  );
  assert.equal(findAskFirstEdit("package.json", '"version": "1.2.0"'), null);
  assert.equal(
    findAskFirstEdit("package.json", '"dev": "next dev --port 3003"'),
    null
  );
  // Bumping an existing dependency is not a new dependency.
  assert.equal(
    findAskFirstEdit("package.json", '"zod": "^3.25.0"', '"zod": "^3.24.0"'),
    null
  );
  assert.ok(
    findAskFirstEdit("apps/api/fastapi/pyproject.toml", '  "httpx>=0.27",')
  );
  assert.equal(
    findAskFirstEdit(
      "apps/api/fastapi/pyproject.toml",
      'requires-python = ">=3.14"'
    ),
    null
  );
});

test("protect-files hook: emits an ask decision for Claude edits, nothing for Codex patches", () => {
  const ask = runHook("protect-files.mjs", {
    tool_name: "Edit",
    tool_input: { file_path: "turbo.json", old_string: "a", new_string: "b" },
  });
  assert.equal(ask.status, 0);
  assert.equal(
    JSON.parse(ask.stdout).hookSpecificOutput.permissionDecision,
    "ask"
  );
  const codex = runHook("protect-files.mjs", {
    tool_name: "apply_patch",
    tool_input: { command: "*** Update File: turbo.json" },
  });
  assert.equal(codex.status, 0);
  assert.equal(codex.stdout, "");
});

test("format-changed-file: formats files in this checkout, never scratchpad or /tmp files", () => {
  const root = "/repo";
  assert.equal(isInsideRepo("/repo/apps/web/page.tsx", root), true);
  assert.equal(isInsideRepo("apps/web/page.tsx", root), true);
  assert.equal(
    isInsideRepo("/tmp/claude-1000/scratchpad/site.html", root),
    false
  );
  assert.equal(isInsideRepo("/repo-other/file.ts", root), false);
  assert.equal(isInsideRepo("../outside.ts", root), false);
});

test("audit-log: redacts credentials but keeps ordinary commands readable", () => {
  for (const [input, secret] of [
    [
      'curl -H "Authorization: Bearer abcdefghijklmnop1234" https://x',
      "abcdefghijklmnop1234",
    ],
    [
      "export GITHUB_TOKEN=ghp_abcdefghijklmnopqrstuvwxyz0123",
      "ghp_abcdefghijklmnopqrstuvwxyz0123",
    ],
    ["psql postgres://app:S3cret@db:5432/app", "S3cret"],
    ["mysql -u root -pHunter22 app", "Hunter22"],
    ["POSTGRES_PASSWORD=changethis uv run pytest", "changethis"],
  ]) {
    const redacted = redactSecrets(input);
    assert.ok(!redacted.includes(secret), redacted);
    assert.match(redacted, REDACTED_MARK);
  }
  for (const ordinary of [
    'git commit -m "fix token refresh"',
    "pnpm test --filter api-key-utils",
  ]) {
    assert.equal(redactSecrets(ordinary), ordinary);
  }
});

test("audit-log: rotates the log once it passes the size cap", () => {
  const dir = mkdtempSync(join(tmpdir(), "audit-log-"));
  try {
    const logPath = join(dir, "audit.log");
    writeFileSync(logPath, "x".repeat(5 * 1024 * 1024 + 1));
    appendAuditLine(logPath, "git status", new Date("2026-10-19T00:00:00Z"));
    assert.ok(existsSync(`${logPath}.1`));
    assert.equal(
      readFileSync(logPath, "utf8"),
      "2026-10-19T00:00:00.000Z\tgit status\n"
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("session-handoff: shows whole entries newest first within the preview budget", () => {
  const entries = Array.from(
    { length: 60 },
    (_, index) =>
      `2026-10-${String(index + 1).padStart(2, "0")} | entry ${index} ${"·".repeat(300)}`
  );
  const output = renderHandoff(entries.join("\n\n"), "/repo/SESSION_LOG.md");
  assert.ok(output.length <= MAX_OUTPUT_CHARS, `${output.length} chars`);
  const body = output.split("\n\n").slice(1);
  assert.match(body[0], NEWEST_ENTRY);
  assert.match(body[1], SECOND_NEWEST_ENTRY);
  assert.ok(body.every((entry) => entry.trim().endsWith("·")));
});

test("session-handoff: truncates a single oversized entry instead of printing nothing", () => {
  const output = renderHandoff("x".repeat(20_000), "/repo/SESSION_LOG.md");
  assert.ok(output.length <= MAX_OUTPUT_CHARS + 2);
  assert.match(output, ELLIPSIS);
});
