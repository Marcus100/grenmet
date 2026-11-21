// Claude Code and Codex must agree on the dangerous commands. Claude Code reads
// the deny list in .claude/settings.json; Codex reads the command rules in
// scripts/agents/settings/default.rules (installed to ~/.codex/rules by
// apply.py). This test fails when one tool would stop a command and the other
// would run it.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const read = (path) => readFileSync(resolve(repoRoot, path), "utf8");

const RULE = /^prefix_rule\(pattern=\[(.*)\], decision="(\w+)"\)$/u;
const BASH_DENY = /^Bash\((.*)\)$/u;
const REGEX_SPECIAL = /[.+?^${}()|[\]\\]/gu;
const HOME_FOLDER = /\/home\/[a-z]/u;
const STRICTNESS = { allow: 0, prompt: 1, forbidden: 2 };
const PROTECTED = ["dev", "staging", "main"];

/** Codex rules as `{ words, decision }`. */
const codexRules = read("scripts/agents/settings/default.rules")
  .split("\n")
  .map((line) => RULE.exec(line.trim()))
  .filter(Boolean)
  .map(([, pattern, decision]) => ({
    words: JSON.parse(`[${pattern}]`),
    decision,
  }));

/** Claude Code's denied shell commands, as glob patterns. */
const claudeDenies = JSON.parse(read(".claude/settings.json"))
  .permissions.deny.map((rule) => BASH_DENY.exec(rule)?.[1])
  .filter(Boolean);

/** Codex's decision: the strictest rule whose words start the command. */
function codexDecision(command) {
  const words = command.split(" ");
  let strictest = "allow";
  for (const rule of codexRules) {
    // A list inside a pattern is a set of alternatives for that word.
    const matches = rule.words.every((word, index) =>
      Array.isArray(word) ? word.includes(words[index]) : words[index] === word
    );
    if (matches && STRICTNESS[rule.decision] > STRICTNESS[strictest]) {
      strictest = rule.decision;
    }
  }
  return strictest;
}

/** True when a Claude Code deny pattern (`*` matches anything) covers the command. */
function claudeDenied(command) {
  return claudeDenies.some((glob) => {
    const pattern = glob.replace(REGEX_SPECIAL, "\\$&").replaceAll("*", ".*");
    return new RegExp(`^${pattern}$`, "u").test(command);
  });
}

// Each command, and the least Codex must do about it. `forbidden` commands are
// never run; `prompt` commands stop for the owner (Codex's rules are per user
// and also cover repositories where pushing main is normal, so they ask; inside
// this repository the shared hook refuses them outright).
const DANGEROUS = [
  ["git push --force", "forbidden"],
  ["git push --force origin feat/x", "forbidden"],
  ["git push -f", "forbidden"],
  ["git push origin --force", "forbidden"],
  ["git push origin -f", "forbidden"],
  ["git reset --hard", "forbidden"],
  ["git reset --hard HEAD~1", "forbidden"],
  ["git clean -f", "forbidden"],
  ["git clean -fd", "forbidden"],
  ["git clean -fdx", "forbidden"],
  ["git clean -xf", "forbidden"],
  ["git clean -xfd", "forbidden"],
  ["gh repo delete", "forbidden"],
  ["gh repo delete Marcus100/grenmet --yes", "forbidden"],
  ["git push --force-with-lease", "forbidden"],
  ["git push origin --force-with-lease", "forbidden"],
  ["git branch -D feat/old", "forbidden"],
  ["git filter-branch --tree-filter x", "forbidden"],
  ["git filter-repo --path x", "forbidden"],
  ["git stash clear", "forbidden"],
  ["gh pr merge --admin 5", "forbidden"],
  ...PROTECTED.flatMap((branch) => [
    [`git push origin ${branch}`, "prompt"],
    [`git push origin ${branch} --no-verify`, "prompt"],
    [`git push origin HEAD:${branch}`, "prompt"],
    [`git push -u origin ${branch}`, "prompt"],
  ]),
  ["git push --tags", "prompt"],
  ["git push origin --tags", "prompt"],
  ["git push origin --delete feat/old", "prompt"],
];

// Safe neighbours: neither tool may stop these.
const EVERYDAY = [
  "git push -u origin feat/task",
  "git push origin feat/task",
  "git push",
  "git reset --soft HEAD~1",
  "git clean -n",
  "gh repo view",
  "gh pr edit 5 --body-file body.md",
  "node --test scripts/guardrails/agent-settings-parity.test.mjs",
  "python3 scripts/agents/settings/apply.py --dry-run",
  "uv run scripts/agents/settings/apply.py",
];

// Claude Code denies these, and Codex's first-words rules cannot express them;
// the shared hook (.claude/hooks/block-dangerous-git.mjs) refuses them in both.
const HOOK_ONLY = new Set(["gh pr merge * --admin*", "git branch * -D*"]);

test("both tools read a non-empty rule set", () => {
  assert.ok(codexRules.length > 20, "default.rules has no prefix_rule lines");
  assert.ok(claudeDenies.length > 5, "settings.json has no Bash deny rules");
});

test("Claude Code and Codex both stop every dangerous command", () => {
  for (const [command, least] of DANGEROUS) {
    assert.ok(
      claudeDenied(command),
      `.claude/settings.json permissions.deny does not cover: ${command}`
    );
    const decision = codexDecision(command);
    assert.ok(
      STRICTNESS[decision] >= STRICTNESS[least],
      `default.rules gives '${decision}' for: ${command} (needs at least '${least}')`
    );
  }
});

test("Codex asks before the commands Claude Code leaves to the shared hook or the owner", () => {
  for (const command of [
    "curl https://example.com",
    "wget https://example.com",
    "gh pr edit --base main 5",
    "gh run delete 123",
  ]) {
    assert.equal(codexDecision(command), "prompt", command);
  }
});

test("neither tool stops an everyday command", () => {
  for (const command of EVERYDAY) {
    assert.equal(claudeDenied(command), false, `Claude denies: ${command}`);
    assert.equal(codexDecision(command), "allow", `Codex stops: ${command}`);
  }
});

test("every Codex 'forbidden' rule is denied by Claude Code", () => {
  for (const rule of codexRules) {
    if (rule.decision !== "forbidden") {
      continue;
    }
    const command = rule.words.join(" ");
    assert.ok(
      claudeDenied(command),
      `default.rules forbids '${command}' but .claude/settings.json does not deny it`
    );
  }
});

test("every Claude Code shell deny is stopped by Codex or named as hook-only", () => {
  for (const glob of claudeDenies) {
    if (HOOK_ONLY.has(glob)) {
      continue;
    }
    // The plainest command the pattern covers: `*` between words is a remote.
    const command = glob
      .replaceAll(" * ", " origin ")
      .replaceAll("*", "")
      .trim();
    assert.notEqual(
      codexDecision(command),
      "allow",
      `.claude/settings.json denies '${glob}' but default.rules allows: ${command}`
    );
  }
});

test("the committed Codex rules hold no machine-specific path", () => {
  for (const file of ["default.rules", "apply.py", "require-heavy.mjs"]) {
    assert.doesNotMatch(
      read(`scripts/agents/settings/${file}`),
      HOME_FOLDER,
      `scripts/agents/settings/${file} names a home folder; use {{HOME}} or Path.home()`
    );
  }
});
