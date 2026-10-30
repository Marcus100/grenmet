// Enforces docs/agents/skill-standard.md on every skill in .claude/skills/
// (Codex reads the same folders through the .agents/skills symlink). Rules
// come from the Agent Skills specification, Anthropic's skill authoring best
// practices and OpenAI's Codex skills guide; the standard links each source.

import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const skillsRoot = join(repoRoot, ".claude", "skills");

const NAME_FORMAT = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const RESERVED_NAME_WORDS = /anthropic|claude/u;
const MAX_NAME_CHARS = 64;
const MAX_DESCRIPTION_CHARS = 1024;
// Anthropic: keep SKILL.md under 500 lines; reference files past 100 lines
// need a contents list so a partial read still shows their scope.
const MAX_SKILL_LINES = 500;
const TOC_THRESHOLD_LINES = 100;
const TOC_SEARCH_LINES = 40;
const MIN_SHOULD_TRIGGER = 3;
const MIN_SHOULD_NOT_TRIGGER = 1;
const XML_TAG = /<\/?[a-zA-Z][\w-]*[^>]*>/u;
const UNQUOTED_MAPPING = /:\s/u;
const FRONTMATTER = /^---\n([\s\S]*?)\n---\n/u;
const FRONTMATTER_PAIR = /^([a-z][\w-]*):\s*(.*)$/u;
const QUOTED_VALUE = /^(["'])(.*)\1$/u;
const EXTERNAL_OR_ANCHOR = /^(?:[a-z]+:|#)/u;
const IMPLICIT_INVOCATION_OFF = /allow_implicit_invocation:\s*false/u;
const USE_WHEN = /\bUse when\b/iu;
const BULLET = /^\s*- \S/u;
const CONTENTS_HEADING = /^#+ .*(?:Contents|Table of contents)/imu;
const MARKDOWN_LINK = /\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/gu;

const vendored = new Set(
  Object.keys(
    JSON.parse(readFileSync(join(repoRoot, "skills-lock.json"), "utf8"))
      .skills ?? {}
  )
);

const skillNames = readdirSync(skillsRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

/** Minimal frontmatter reader: top-level `key: value` scalars only. */
export function parseFrontmatter(text) {
  const match = FRONTMATTER.exec(text);
  if (!match) return { fields: null, errors: ["missing frontmatter"] };
  const fields = {};
  const errors = [];
  for (const line of match[1].split("\n")) {
    const pair = FRONTMATTER_PAIR.exec(line);
    if (!pair) continue;
    const [, key, raw] = pair;
    const quoted = QUOTED_VALUE.exec(raw);
    if (!quoted && UNQUOTED_MAPPING.test(raw)) {
      errors.push(`${key} contains ': ' and must be quoted`);
    }
    fields[key] = quoted ? quoted[2].replace(/\\"/gu, '"') : raw;
  }
  return { fields, errors };
}

function skillFile(name, ...parts) {
  return join(skillsRoot, name, ...parts);
}

function lintSkill(name) {
  const problems = [];
  const path = skillFile(name, "SKILL.md");
  if (!existsSync(path)) return ["SKILL.md is missing"];
  const text = readFileSync(path, "utf8");
  const { fields, errors } = parseFrontmatter(text);
  problems.push(...errors);
  if (!fields) return problems;

  const skillName = fields.name ?? "";
  if (skillName !== name)
    problems.push(`name '${skillName}' must equal the folder name`);
  if (!NAME_FORMAT.test(skillName) || skillName.length > MAX_NAME_CHARS) {
    problems.push(
      "name must be 1-64 lowercase letters, digits and single hyphens"
    );
  }
  if (RESERVED_NAME_WORDS.test(skillName)) {
    problems.push("name must not contain 'anthropic' or 'claude'");
  }

  const description = fields.description ?? "";
  if (description.length === 0 || description.length > MAX_DESCRIPTION_CHARS) {
    problems.push(
      `description must be 1-${MAX_DESCRIPTION_CHARS} characters (is ${description.length})`
    );
  }
  if (XML_TAG.test(description))
    problems.push("description must not contain XML tags");

  const lineCount = text.split("\n").length;
  if (lineCount > MAX_SKILL_LINES) {
    problems.push(
      `SKILL.md has ${lineCount} lines; keep it under ${MAX_SKILL_LINES}`
    );
  }

  for (const [, target] of text.matchAll(MARKDOWN_LINK)) {
    if (EXTERNAL_OR_ANCHOR.test(target)) continue;
    const file = target.split("#")[0];
    if (file && !existsSync(join(skillsRoot, name, file))) {
      problems.push(`link target '${file}' does not exist`);
    }
  }

  const userInvoked = fields["disable-model-invocation"] === "true";
  if (userInvoked) {
    const policy = skillFile(name, "agents", "openai.yaml");
    if (
      !(
        existsSync(policy) &&
        IMPLICIT_INVOCATION_OFF.test(readFileSync(policy, "utf8"))
      )
    ) {
      problems.push(
        "disable-model-invocation needs agents/openai.yaml with policy.allow_implicit_invocation: false for Codex"
      );
    }
  }

  if (!vendored.has(name)) {
    if (!(userInvoked || USE_WHEN.test(description))) {
      problems.push(
        "a model-invoked skill's description needs a 'Use when…' clause"
      );
    }
    problems.push(...lintTriggers(name));
  }
  return problems;
}

function lintTriggers(name) {
  const path = skillFile(name, "evals", "triggers.md");
  if (!existsSync(path)) {
    return [
      "evals/triggers.md is missing (see docs/agents/skill-standard.md → Testing)",
    ];
  }
  const text = readFileSync(path, "utf8");
  const section = (heading) => {
    const match = new RegExp(
      `^## ${heading}\\n([\\s\\S]*?)(?=^## |$(?![\\s\\S]))`,
      "mu"
    ).exec(text);
    return match
      ? match[1].split("\n").filter((line) => BULLET.test(line)).length
      : 0;
  };
  const problems = [];
  if (section("Should trigger") < MIN_SHOULD_TRIGGER) {
    problems.push(
      `evals/triggers.md needs ${MIN_SHOULD_TRIGGER}+ bullets under '## Should trigger'`
    );
  }
  if (section("Should not trigger") < MIN_SHOULD_NOT_TRIGGER) {
    problems.push(
      `evals/triggers.md needs ${MIN_SHOULD_NOT_TRIGGER}+ bullet under '## Should not trigger'`
    );
  }
  return problems;
}

/**
 * Reference files sit one level below SKILL.md: each is linked from SKILL.md,
 * links to no other reference file, and opens with a contents list when long.
 */
function localMarkdownLinks(text) {
  return [...text.matchAll(MARKDOWN_LINK)]
    .map(([, target]) => target.split("#")[0])
    .filter(
      (target) =>
        target.endsWith(".md") &&
        !EXTERNAL_OR_ANCHOR.test(target) &&
        !target.includes("/")
    );
}

function lintReferenceFiles(name) {
  const problems = [];
  const linkedFromSkill = new Set(
    localMarkdownLinks(readFileSync(skillFile(name, "SKILL.md"), "utf8"))
  );
  for (const entry of readdirSync(skillFile(name), { withFileTypes: true })) {
    if (
      !(entry.isFile() && entry.name.endsWith(".md")) ||
      entry.name === "SKILL.md"
    )
      continue;
    const text = readFileSync(skillFile(name, entry.name), "utf8");
    if (!linkedFromSkill.has(entry.name)) {
      problems.push(`${entry.name} is not linked from SKILL.md`);
    }
    for (const target of localMarkdownLinks(text)) {
      if (target !== "SKILL.md") {
        problems.push(
          `${entry.name} links to ${target}; link reference files only from SKILL.md (one level deep)`
        );
      }
    }
    const lines = text.split("\n");
    if (lines.length <= TOC_THRESHOLD_LINES) continue;
    const opening = lines.slice(0, TOC_SEARCH_LINES).join("\n");
    if (!CONTENTS_HEADING.test(opening)) {
      problems.push(
        `${entry.name} has ${lines.length} lines and no 'Contents' list near the top`
      );
    }
  }
  return problems;
}

test("parseFrontmatter flags unquoted values that YAML would reject", () => {
  const { fields, errors } = parseFrontmatter(
    '---\nname: x\ndescription: Does a: b\nother: "ok: quoted"\n---\n'
  );
  assert.equal(fields.other, "ok: quoted");
  assert.deepEqual(errors, ["description contains ': ' and must be quoted"]);
});

for (const name of skillNames) {
  test(`skill '${name}' meets docs/agents/skill-standard.md`, () => {
    const problems = [
      ...lintSkill(name),
      ...(vendored.has(name) ? [] : lintReferenceFiles(name)),
    ];
    assert.deepEqual(
      problems,
      [],
      `${relative(repoRoot, skillFile(name))}:\n  ${problems.join("\n  ")}`
    );
  });
}
