#!/usr/bin/env node

// Blocks private Bishop knowledge-vault content from entering this public
// repository. Bishop (~/bishop) is a private Obsidian vault; its notes carry
// wikilinks, a numbered domain taxonomy and source-summary frontmatter that
// never belong in Grenmet. Code may *mention* Bishop; it may not carry its notes.

import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const markdown = /\.(md|mdx)$/i;

// Obsidian wikilink such as [[note]] or [[note|alias]]. Next.js optional
// catch-all segments ([[...slug]]) start with dots and are not matched.
const wikilink = /\[\[[A-Za-z0-9][^\][\n]*\]\]/;
const vaultFrontmatter = /^(?:domain: 0[1-9]-[a-z]|type: source-summary\b)/m;
// Bishop folder taxonomy, e.g. wiki/98-sources/... or raw/02-atmosphere-aviation/...
const vaultPath = /(?:^|\/)(?:wiki|raw)\/(?:0[0-9]|9[89])-[a-z]/;

export const findPrivateContent = (files) => {
  const findings = [];
  for (const { path, content } of files) {
    if (vaultPath.test(path)) {
      findings.push(`${path}: Bishop vault folder layout`);
    }
    if (!markdown.test(path) || content === undefined) {
      continue;
    }
    if (wikilink.test(content)) {
      findings.push(`${path}: Obsidian [[wikilink]]`);
    }
    if (vaultFrontmatter.test(content)) {
      findings.push(`${path}: Bishop note frontmatter`);
    }
  }
  return findings;
};

const git = (args) => {
  const result = spawnSync("git", args, { encoding: "utf8", maxBuffer: 1e8 });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr.trim()}`);
  }
  return result.stdout;
};

const listFiles = (mode) =>
  (mode === "--all"
    ? git(["ls-files", "-z"])
    : git(["diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z"])
  )
    .split("\0")
    .filter(Boolean);

export const collect = (mode) =>
  listFiles(mode).map((path) => ({
    content: markdown.test(path) ? git(["show", `:${path}`]) : undefined,
    path,
  }));

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const mode = process.argv[2];
  if (mode !== "--staged" && mode !== "--all") {
    console.error(
      "Usage: node scripts/guardrails/check-private-content.mjs --staged | --all"
    );
    process.exit(2);
  }
  const findings = findPrivateContent(collect(mode));
  if (findings.length > 0) {
    console.error(
      "Private Bishop vault content must not enter this public repository:\n" +
        findings.map((finding) => `  - ${finding}`).join("\n") +
        "\nKeep it in ~/bishop (or gitignored /private/) and reference it in conversation only."
    );
    process.exit(1);
  }
}
