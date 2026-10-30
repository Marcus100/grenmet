// Guards the role agents in .claude/agents/. A role is only a role if its tool
// list matches its job: reviewers must not be able to edit, and every path a
// role tells the agent to read must exist.

import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const agentsDir = join(repoRoot, ".claude", "agents");
const MODELS = new Set(["opus", "sonnet", "haiku", "inherit"]);
const READ_ONLY_ROLES = new Set([
  "planner",
  "architect",
  "code-reviewer",
  "security-reviewer",
]);
const EDITING_TOOLS = ["Edit", "Write", "MultiEdit", "NotebookEdit"];
const MAX_BODY_LINES = 40;
const NAME_PATTERN = /^[a-z]+(-[a-z]+)*$/u;
const DELEGATE_PATTERN = /Use proactively|Use when/u;
const FRONTMATTER = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/u;
const PATH_IN_BACKTICKS = /`((?:[\w.-]+\/)+[\w.<>-]*(?:\.\w+)?)`/gu;

function load(file) {
  const source = readFileSync(join(agentsDir, file), "utf8");
  const match = FRONTMATTER.exec(source);
  assert.ok(match, `${file}: missing frontmatter`);
  const fields = Object.fromEntries(
    match[1].split("\n").map((line) => {
      const index = line.indexOf(":");
      return [line.slice(0, index).trim(), line.slice(index + 1).trim()];
    })
  );
  return { fields, body: match[2], file };
}

const files = readdirSync(agentsDir).filter((f) => f.endsWith(".md"));
const agents = files.map(load);

test("the company roles exist", () => {
  const names = agents.map((a) => a.fields.name).sort();
  assert.deepEqual(names, [
    "api-engineer",
    "architect",
    "code-reviewer",
    "planner",
    "qa-engineer",
    "security-reviewer",
    "web-engineer",
  ]);
});

for (const { fields, body, file } of agents) {
  test(`${file}: frontmatter is complete and consistent`, () => {
    assert.equal(
      fields.name,
      file.slice(0, -".md".length),
      "name must equal the file name"
    );
    assert.match(fields.name, NAME_PATTERN);
    assert.ok(
      fields.description.length >= 40 && fields.description.length <= 1024
    );
    assert.match(fields.description, DELEGATE_PATTERN, "say when to delegate");
    assert.ok(MODELS.has(fields.model), `unknown model ${fields.model}`);
    assert.ok(
      fields.tools?.length > 0,
      "list tools explicitly; never inherit all"
    );
  });

  test(`${file}: stays short enough to be read every time`, () => {
    assert.ok(body.trim().split("\n").length <= MAX_BODY_LINES);
  });

  test(`${file}: every repo path it names exists`, () => {
    for (const [, path] of body.matchAll(PATH_IN_BACKTICKS)) {
      if (
        path.includes("<") ||
        path.startsWith("src/") ||
        path.startsWith("tests/")
      )
        continue;
      if (path.endsWith("scripts/lint.sh")) continue; // run from apps/api/fastapi
      assert.ok(
        existsSync(join(repoRoot, path)),
        `${file} names a missing path: ${path}`
      );
    }
  });

  test(`${file}: tool list matches the role`, () => {
    const tools = fields.tools.split(",").map((t) => t.trim());
    if (READ_ONLY_ROLES.has(fields.name)) {
      for (const tool of EDITING_TOOLS) {
        assert.ok(
          !tools.includes(tool),
          `${fields.name} must not have ${tool}`
        );
      }
    }
    if (["planner", "architect"].includes(fields.name)) {
      assert.ok(
        !tools.includes("Bash"),
        `${fields.name} designs; it needs no shell`
      );
    }
  });
}

test("qa-engineer is told to change tests only", () => {
  const qa = agents.find((a) => a.fields.name === "qa-engineer");
  assert.ok(qa.body.includes("test files only"));
});

test("the shared team-roles skill names every role, so Codex can use them too", () => {
  const skill = readFileSync(
    join(repoRoot, ".claude", "skills", "team-roles", "SKILL.md"),
    "utf8"
  );
  for (const { fields } of agents) {
    assert.ok(
      skill.includes(`\`${fields.name}\``),
      `team-roles does not mention ${fields.name}`
    );
  }
});
