#!/usr/bin/env node
// Markdown conventions that keep docs readable for people and agents:
//  - every fenced code block names its language (use `text` for plain output)
//  - at most one H1 per file, and heading levels never skip (h2 -> h4)
//  - SKILL.md has `name` (matching its folder) and `description` frontmatter
//  - docs under docs/ show Status, Owner and Last updated near the top
// Skills copied from upstream are hash-locked in skills-lock.json, and the
// block `next dev` regenerates in app AGENTS.md files is not ours to edit, so
// both are exempt. Usage: node scripts/docs/check-markdown.mjs

import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const VENDORED = /^(?:surface|wis2box)\//u;
const GENERATED = /\/gen\//u;
const FENCE = /^\s{0,3}(`{3,}|~{3,})(.*)$/u;
const HEADING = /^(#{1,6})\s+\S/u;
const NEXT_BLOCK_START = /^<!--\s*BEGIN:nextjs-agent-rules\s*-->/u;
const NEXT_BLOCK_END = /^<!--\s*END:nextjs-agent-rules\s*-->/u;
const FRONTMATTER = /^---\n([\s\S]*?)\n---/u;
const SKILL_PATH = /^\.claude\/skills\/([^/]+)\/SKILL\.md$/u;
const LOCKED_SKILL_PATH = /^\.claude\/skills\/([^/]+)\//u;

const DOC_PATH = /^docs\//u;
// ADRs have their own template, READMEs are indexes, and the design specs keep
// their metadata in YAML frontmatter checked by their own test.
const DOC_EXEMPT = /^docs\/adr\/|(?:^|\/)README\.md$/u;
const HEADER_LINES = 30;
const DOC_METADATA = [
  ["Status", /^(?:\*\*)?Status:/mu],
  ["Owner", /^(?:\*\*)?Owner:/mu],
  ["Last updated", /^(?:\*\*)?Last updated:/mu],
];
const NAME_FIELD = /^name:\s*(.+)$/mu;
const DESCRIPTION_FIELD = /^description:\s*\S/mu;

const violation = (line, rule, message) => ({ line, message, rule });

// Tracks fenced code. Returns the new fence marker (null when closed) and
// whether this line was a fence line, so its body is never read as headings.
function stepFence(line, fence) {
  const marker = FENCE.exec(line);
  if (!marker) return { fence, isFence: false };
  if (fence === null)
    return { fence: marker[1], info: marker[2], isFence: true };
  const closes = marker[1][0] === fence[0] && marker[1].length >= fence.length;
  return { fence: closes ? null : fence, isFence: true };
}

// Heading rules for one line outside code; `state` carries h1 count and level.
function checkHeading(line, number, state) {
  const level = HEADING.exec(line)?.[1].length;
  if (!level) return [];
  const found = [];
  if (level === 1) {
    state.h1Count += 1;
    if (state.h1Count > 1)
      found.push(
        violation(number, "single-h1", "only one top-level heading per file")
      );
  }
  if (state.previousLevel > 0 && level > state.previousLevel + 1)
    found.push(
      violation(
        number,
        "heading-skip",
        `h${state.previousLevel} jumps to h${level}`
      )
    );
  state.previousLevel = level;
  return found;
}

// Returns violations as { line, rule, message } for one Markdown file.
export function checkMarkdown(text, { skipFences = false } = {}) {
  const violations = [];
  const state = { h1Count: 0, previousLevel: 0 };
  let fence = null;
  let generated = false;
  text.split("\n").forEach((line, index) => {
    const step = stepFence(line, fence);
    if (step.isFence) {
      const opening = fence === null && step.fence !== null;
      if (opening && !skipFences && !step.info.trim())
        violations.push(
          violation(
            index + 1,
            "fence-language",
            "code fence needs a language (use `text`)"
          )
        );
      fence = step.fence;
      return;
    }
    if (fence !== null) return;
    if (NEXT_BLOCK_START.test(line)) generated = true;
    if (NEXT_BLOCK_END.test(line)) generated = false;
    if (!generated) violations.push(...checkHeading(line, index + 1, state));
  });
  return violations;
}

// A doc must say who owns it, whether it is current and when it last changed.
export function checkDocMetadata(text) {
  if (text.startsWith("---")) return [];
  const header = text.split("\n").slice(0, HEADER_LINES).join("\n");
  return DOC_METADATA.filter(([, pattern]) => !pattern.test(header)).map(
    ([name]) => violation(1, "doc-metadata", `docs need ${name} near the top`)
  );
}

// SKILL.md must declare a name equal to its folder and a description.
export function checkSkillFrontmatter(text, folder) {
  const block = FRONTMATTER.exec(text)?.[1] ?? "";
  const violations = [];
  const name = NAME_FIELD.exec(block)?.[1]?.trim();
  if (name !== folder)
    violations.push(
      violation(
        1,
        "skill-name",
        `frontmatter name "${name ?? ""}" must equal folder "${folder}"`
      )
    );
  if (!DESCRIPTION_FIELD.test(block))
    violations.push(
      violation(1, "skill-description", "frontmatter needs a description")
    );
  return violations;
}

function lockedSkills() {
  const lock = JSON.parse(readFileSync(join(root, "skills-lock.json"), "utf8"));
  return new Set(Object.keys(lock.skills));
}

export function checkRepository() {
  const files = execSync("git ls-files '*.md'", { cwd: root, encoding: "utf8" })
    .split("\n")
    .filter((file) => file && !VENDORED.test(file) && !GENERATED.test(file));
  const locked = lockedSkills();
  const results = [];
  for (const file of files) {
    const text = readFileSync(join(root, file), "utf8");
    const owner = LOCKED_SKILL_PATH.exec(file)?.[1];
    if (owner && locked.has(owner)) continue;
    const found = checkMarkdown(text);
    if (DOC_PATH.test(file) && !DOC_EXEMPT.test(file))
      found.push(...checkDocMetadata(text));
    const skill = SKILL_PATH.exec(file);
    if (skill) found.push(...checkSkillFrontmatter(text, skill[1]));
    for (const violation of found) results.push({ file, ...violation });
  }
  return { checked: files.length, results };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { checked, results } = checkRepository();
  for (const { file, line, message, rule } of results)
    console.error(`${file}:${line} [${rule}] ${message}`);
  if (results.length > 0) {
    console.error(
      `\n${results.length} Markdown violation(s) in ${checked} files.`
    );
    process.exitCode = 1;
  } else console.log(`Markdown conventions passed (${checked} files).`);
}
