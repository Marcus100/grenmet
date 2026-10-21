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
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
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
import { mainCheckoutRoot } from "../../.claude/hooks/main-checkout.mjs";
import {
  findAskFirstEdit,
  findProtectedViolation,
  findShellWriteViolation,
} from "../../.claude/hooks/protect-files.mjs";
import {
  MAX_OUTPUT_CHARS,
  renderHandoff,
} from "../../.claude/hooks/session-handoff.mjs";
import {
  decideStop,
  sessionCheckout,
} from "../../.claude/hooks/verify-before-stop.mjs";
import {
  changedFiles,
  fingerprint,
  writeReceipt,
} from "../../scripts/verification/receipt.mjs";

const BLOCKED_MESSAGE = /BLOCKED/;
const baseIs = (base, files = ["apps/web/docs/page.tsx"]) => ({
  lookupBase: () => base,
  lookupFiles: () => files,
});
const OWNER_MERGES_STAGING = /owner merges staging/;
const OTHER_REPO = /only marcus100\/grenmet/;
const GH_REPO_SET = /GH_REPO/;
const RETARGETS = /retargets/;
const API_MERGE = /gh api merge/;
const OWNER_ONLY_FILE = /owner merges changes to agent limits/;
const UNKNOWN_FILES = /unknown file list/;
const MAIN_BASE = /main/;
const UNKNOWN_BASE = /unknown base/;
const ADMIN_FLAG = /--admin/;
const REDACTED_MARK = /\[REDACTED\]/;
const NEWEST_ENTRY = /entry 59 /;
const SECOND_NEWEST_ENTRY = /entry 58 /;
const ELLIPSIS = /…/;
const FIRST_BULLET = /first/;
const SECOND_BULLET = /second\n {2}continued/;

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

test("block-dangerous-git: allows gh pr merge only into dev, failing closed", () => {
  const command = "gh pr merge 42 --merge --match-head-commit abc123";
  assert.equal(findBlockedPattern(command, baseIs("dev")), undefined);
  assert.match(
    String(findBlockedPattern(command, baseIs("staging"))),
    OWNER_MERGES_STAGING
  );
  assert.match(String(findBlockedPattern(command, baseIs("main"))), MAIN_BASE);
  assert.match(String(findBlockedPattern(command, baseIs(null))), UNKNOWN_BASE);
  assert.match(
    String(findBlockedPattern("gh pr merge 42 --admin", baseIs("dev"))),
    ADMIN_FLAG
  );
});

test("block-dangerous-git: a merge stays in this repository", () => {
  const dev = baseIs("dev");
  const merge = "gh pr merge 42 --merge --match-head-commit abc1234";
  assert.equal(
    findBlockedPattern(`${merge} -R Marcus100/grenmet`, dev),
    undefined
  );
  for (const command of [
    `${merge} -Rother/repo`,
    `${merge} -R=other/repo`,
    `${merge} --repo other/repo`,
    `${merge} --repo=other/repo`,
    "gh pr merge https://github.com/other/repo/pull/42 --merge --match-head-commit abc1234",
  ]) {
    assert.match(String(findBlockedPattern(command, dev)), OTHER_REPO, command);
  }
  assert.match(
    String(findBlockedPattern(`GH_REPO=other/repo ${merge}`, dev)),
    GH_REPO_SET
  );
  assert.equal(
    findBlockedPattern(
      "gh pr merge https://github.com/Marcus100/grenmet/pull/42 --merge --match-head-commit abc1234",
      dev
    ),
    undefined
  );
});

test("block-dangerous-git: a quoted or indirect merge is checked like a plain one", () => {
  const main = baseIs("main");
  const dev = baseIs("dev", [".claude/hooks/block-dangerous-git.mjs"]);
  const sha = "--merge --match-head-commit abc1234";
  // Quoting any word must not hide the command or the PR it names.
  for (const command of [
    `gh pr "merge" 123 ${sha}`,
    `gh pr mer''ge 123 ${sha}`,
    `gh "pr" merge "123" ${sha}`,
    `gh pr \\\nmerge 123 ${sha}`,
    `env "GH_REPO=other/repo" gh pr merge 123 ${sha}`,
    `echo 123 | xargs gh pr merge ${sha}`,
    `xargs -I{} gh pr merge {} ${sha}`,
    `cd ../other && gh pr merge 123 ${sha}`,
    `gh alias set m "pr merge" && gh m 5`,
  ]) {
    assert.ok(findBlockedPattern(command, main), command);
  }
  // The PR named after a flag must be read as the PR, not as that flag's value.
  assert.ok(findBlockedPattern(`gh pr merge --body "x" 5 ${sha}`, main));
  assert.ok(findBlockedPattern(`gh pr merge -b"x" 5 ${sha}`, main));
  // The owner-only file check still applies to a quoted command.
  assert.match(
    String(findBlockedPattern(`gh pr "merge" 123 ${sha}`, dev)),
    OWNER_ONLY_FILE
  );
  // Only the exact shape is accepted: merge method, auto-merge, no pinned head.
  for (const command of [
    "gh pr merge 5 --merge",
    "gh pr merge 5 --squash --match-head-commit abc1234",
    `gh pr merge 5 --auto ${sha}`,
    "gh pr merge --merge --match-head-commit abc1234",
    `gh pr merge 5 ${sha} --admin`,
  ]) {
    assert.ok(findBlockedPattern(command, baseIs("dev")), command);
  }
  // A quoted REST merge path is a merge route too.
  for (const command of [
    `gh api -X PUT "repos/Marcus100/grenmet/pulls/5/merge"`,
    `gh api --method PUT 'repos/Marcus100/grenmet/pulls/5/merge'`,
  ]) {
    assert.match(String(findBlockedPattern(command, main)), API_MERGE, command);
  }
  // Mentioning the command in text is not running it.
  assert.equal(
    findBlockedPattern('git commit -m "docs: gh pr merge into dev"', main),
    undefined
  );
  assert.equal(
    findBlockedPattern('echo "gh pr merge 5 --auto"', main),
    undefined
  );
});

test("block-dangerous-git: no retargeting the base, no other merge routes", () => {
  const dev = baseIs("dev");
  assert.match(
    String(
      findBlockedPattern(
        "gh pr edit 42 --base main && gh pr merge 42 --merge --match-head-commit abc1234",
        dev
      )
    ),
    RETARGETS
  );
  assert.equal(findBlockedPattern("gh pr edit 42 --title x", dev), undefined);
  for (const command of [
    `gh api graphql -f query='mutation { mergePullRequest(input: {pullRequestId: "X"}) { clientMutationId } }'`,
    "gh api repos/Marcus100/grenmet/merges -f base=main -f head=dev",
    `gh api graphql -f query='mutation { enablePullRequestAutoMerge(input: {pullRequestId: "X"}) { clientMutationId } }'`,
  ]) {
    assert.match(String(findBlockedPattern(command, dev)), API_MERGE, command);
  }
  assert.equal(
    findBlockedPattern('echo "gh api mergePullRequest"', dev),
    undefined
  );
  assert.equal(
    findBlockedPattern("gh api repos/Marcus100/grenmet/pulls", dev),
    undefined
  );
});

test("block-dangerous-git: the owner merges changes to the files that limit the agents", () => {
  const merge = "gh pr merge 42 --merge --match-head-commit abc1234";
  for (const file of [
    ".claude/hooks/block-dangerous-git.mjs",
    ".claude/settings.json",
    ".claude/skills/commit/SKILL.md",
    ".claude/commands/new.md",
    ".codex/config.toml",
    ".agents/rules/project.md",
    ".husky/pre-push",
    "AGENTS.md",
    "apps/api/fastapi/AGENTS.md",
    "scripts/guardrails/agent-policy.test.mjs",
    "scripts/verification/changed.mjs",
    "package.json",
    "docs/agents/routines.md",
    "apps/api/fastapi/src/auth/permissions.py",
    ".github/workflows/deploy.yml",
    ".github/actions/setup/action.yml",
    ".github/dependabot.yml",
    ".github/CODEOWNERS",
    "infra/github/rulesets.json",
  ]) {
    assert.match(
      String(findBlockedPattern(merge, baseIs("dev", ["README.md", file]))),
      OWNER_ONLY_FILE,
      file
    );
  }
  assert.equal(
    findBlockedPattern(
      merge,
      baseIs("dev", ["apps/api/fastapi/src/events/service.py", "docs/env.md"])
    ),
    undefined
  );
  assert.match(
    String(
      findBlockedPattern(merge, {
        lookupBase: () => "dev",
        lookupFiles: () => null,
      })
    ),
    UNKNOWN_FILES
  );
});

test("block-dangerous-git: looks up the merge base for the PR and repo named", () => {
  const seen = [];
  findBlockedPattern(
    "gh pr merge 42 --repo Marcus100/grenmet --merge --match-head-commit abc1234",
    {
      lookupBase: (args) => {
        seen.push(args);
        return "dev";
      },
      lookupFiles: () => [],
    }
  );
  assert.deepEqual(seen, [["42", "--repo", "Marcus100/grenmet"]]);
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

test("session-handoff: splits bullet entries that have no blank line between them", () => {
  const output = renderHandoff(
    "- 2026-10-03T21:52:15Z first\n- 2026-10-03T21:53:52Z second\n  continued\n",
    "/repo/SESSION_LOG.md"
  );
  const body = output.split("\n\n").slice(1);
  assert.match(body[0], SECOND_BULLET);
  assert.match(body[1], FIRST_BULLET);
});

test("main-checkout: resolves a worktree's .git file to the owning checkout", () => {
  const dir = mkdtempSync(join(tmpdir(), "main-checkout-"));
  try {
    const main = join(dir, "repo");
    const worktree = join(main, ".claude", "worktrees", "task");
    mkdirSync(join(main, ".git", "worktrees", "task"), { recursive: true });
    mkdirSync(worktree, { recursive: true });
    writeFileSync(
      join(worktree, ".git"),
      `gitdir: ${join(main, ".git", "worktrees", "task")}\n`
    );
    assert.equal(mainCheckoutRoot(worktree), main);
    assert.equal(mainCheckoutRoot(main), main);
    assert.equal(mainCheckoutRoot(join(dir, "missing")), join(dir, "missing"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("session-handoff: truncates a single oversized entry instead of printing nothing", () => {
  const output = renderHandoff(
    `2026-10-19T00:00:00Z ${"x".repeat(20_000)}`,
    "/repo/SESSION_LOG.md"
  );
  assert.ok(output.length <= MAX_OUTPUT_CHARS + 2);
  assert.match(output, ELLIPSIS);
});

function scratchRepo() {
  const dir = mkdtempSync(join(tmpdir(), "stop-gate-"));
  const git = (...args) =>
    spawnSync("git", args, { cwd: dir, encoding: "utf8" });
  git("init", "--quiet");
  git("config", "user.email", "test@example.com");
  git("config", "user.name", "Test");
  writeFileSync(join(dir, "app.js"), "export const a = 1;\n");
  git("add", ".");
  git("commit", "--quiet", "-m", "base");
  git("update-ref", "refs/remotes/origin/dev", "HEAD");
  return { dir, git };
}

test("verify-before-stop: allows a turn with nothing changed since origin/dev", () => {
  const { dir } = scratchRepo();
  try {
    assert.equal(decideStop(dir), "allow");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("verify-before-stop: blocks unverified changes once, then lets the agent stop", () => {
  const { dir } = scratchRepo();
  try {
    writeFileSync(join(dir, "app.js"), "export const a = 2;\n");
    assert.equal(decideStop(dir), "block");
    assert.equal(decideStop(dir), "allow");
    writeFileSync(join(dir, "new.js"), "export const b = 1;\n");
    assert.equal(decideStop(dir), "block");
    assert.equal(decideStop(dir, { stopHookActive: true }), "allow");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("verify-before-stop: verified work stays verified after commit, not after an edit", () => {
  const { dir, git } = scratchRepo();
  try {
    writeFileSync(join(dir, "app.js"), "export const a = 3;\n");
    writeReceipt(dir, { verified: fingerprint(dir, changedFiles(dir)) });
    assert.equal(decideStop(dir), "allow");
    git("commit", "--quiet", "-am", "change");
    assert.equal(decideStop(dir), "allow");
    writeFileSync(join(dir, "app.js"), "export const a = 4;\n");
    assert.equal(decideStop(dir), "block");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("verify-before-stop: gates the checkout the session works in, not the hooks' own", () => {
  const { dir } = scratchRepo();
  try {
    mkdirSync(join(dir, "src"));
    assert.equal(sessionCheckout({ cwd: join(dir, "src") }), realpathSync(dir));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("verify-before-stop: a rename back onto a verified path still needs verification", () => {
  const { dir, git } = scratchRepo();
  try {
    git("mv", "app.js", "renamed.js");
    git("commit", "--quiet", "-m", "rename");
    writeReceipt(dir, { verified: fingerprint(dir, changedFiles(dir)) });
    writeFileSync(join(dir, "app.js"), "export const back = true;\n");
    assert.equal(decideStop(dir), "block");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
