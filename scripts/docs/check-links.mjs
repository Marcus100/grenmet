#!/usr/bin/env node

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const workspaceRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  ".."
);
const ignoredDirectories = new Set([
  ".agents",
  ".codex",
  ".git",
  ".next",
  "coverage",
  "dist",
  "node_modules",
  "surface",
]);
const externalSchemePattern = /^[a-z][a-z0-9+.-]*:/i;
const fencedCodePattern = /^\s{0,3}(`{3,}|~{3,})(.*)$/;
const headingPattern = /^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/;
const setextHeadingPattern = /^\s{0,3}(?:=+|-+)\s*$/;
const inlineLinkPattern = /!?\[[^\]]*\]\(\s*(?:<([^>]+)>|([^\s)]+))/g;
const referenceLinkPattern = /^\s*\[[^\]]+\]:\s*(?:<([^>]+)>|(\S+))/gm;

const parseArguments = (args) => {
  if (args.length === 0) {
    return { root: workspaceRoot };
  }
  if (args.length === 2 && args[0] === "--root" && args[1]) {
    return { root: resolve(args[1]) };
  }
  return;
};

const collectMarkdownFiles = (root, directory = root) => {
  const files = [];

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!ignoredDirectories.has(entry.name)) {
        files.push(...collectMarkdownFiles(root, join(directory, entry.name)));
      }
      continue;
    }

    if (entry.isFile() && entry.name.endsWith(".md")) {
      files.push(join(directory, entry.name));
    }
  }

  return files.sort();
};

const withoutFencedCode = (source) => {
  let fence;

  return source
    .split("\n")
    .map((line) => {
      const match = line.match(fencedCodePattern);
      const marker = match?.[1];
      if (marker) {
        if (!fence) {
          fence = { character: marker[0], length: marker.length };
        } else if (
          marker[0] === fence.character &&
          marker.length >= fence.length &&
          (match?.[2] ?? "").trim() === ""
        ) {
          fence = undefined;
        }
        return "";
      }
      return fence ? "" : line;
    })
    .join("\n");
};

const renderedHeading = (heading) =>
  heading
    .replace(/!?\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/!?\[([^\]]+)\]\[[^\]]*\]/g, "$1")
    .replace(/<[^>]+>/g, "");

const slugHeading = (heading) =>
  renderedHeading(heading)
    .replace(/[`*_~]/g, "")
    .toLocaleLowerCase("en")
    .trim()
    .replace(/[^\p{L}\p{N}\s_-]/gu, "")
    .replace(/\s/g, "-");

const collectAnchors = (source) => {
  const anchors = new Set();
  const counts = new Map();
  const visibleSource = withoutFencedCode(source);

  const lines = visibleSource.split("\n");

  for (const [index, line] of lines.entries()) {
    const atxHeading = line.match(headingPattern)?.[1];
    const heading =
      atxHeading ??
      (setextHeadingPattern.test(line) ? lines[index - 1]?.trim() : undefined);
    if (heading) {
      const base = slugHeading(heading);
      const count = counts.get(base) ?? 0;
      anchors.add(count === 0 ? base : `${base}-${count}`);
      counts.set(base, count + 1);
    }

    for (const match of line.matchAll(/\bid=["']([^"']+)["']/g)) {
      if (match[1]) {
        anchors.add(match[1]);
      }
    }
  }

  return anchors;
};

const lineNumberAt = (source, index) =>
  source.slice(0, index).split("\n").length;

const collectLinks = (source) => {
  const visibleSource = withoutFencedCode(source);
  const links = [];

  for (const pattern of [inlineLinkPattern, referenceLinkPattern]) {
    pattern.lastIndex = 0;
    for (const match of visibleSource.matchAll(pattern)) {
      const destination = match[1] ?? match[2];
      if (destination) {
        links.push({
          destination,
          line: lineNumberAt(visibleSource, match.index ?? 0),
        });
      }
    }
  }

  return links;
};

const validateLink = ({ destination, line }, sourceFile, root, anchorCache) => {
  if (externalSchemePattern.test(destination) || destination.startsWith("//")) {
    return;
  }

  const [rawPath, rawAnchor] = destination.split("#", 2);
  let decodedPath;
  let decodedAnchor;
  try {
    decodedPath = decodeURIComponent(rawPath.split("?", 1)[0]);
    decodedAnchor = rawAnchor ? decodeURIComponent(rawAnchor) : undefined;
  } catch {
    return { destination, line, reason: "contains invalid URL encoding" };
  }

  let target = sourceFile;
  if (decodedPath) {
    target = decodedPath.startsWith("/")
      ? resolve(root, decodedPath.slice(1))
      : resolve(dirname(sourceFile), decodedPath);
  }

  const relativeTarget = relative(root, target);
  if (
    relativeTarget === ".." ||
    relativeTarget.startsWith(`..${sep}`) ||
    isAbsolute(relativeTarget)
  ) {
    return { destination, line, reason: "target escapes repository root" };
  }

  if (!existsSync(target)) {
    return { destination, line, reason: "target file does not exist" };
  }
  if (statSync(target).isDirectory()) {
    return;
  }
  if (!statSync(target).isFile()) {
    return { destination, line, reason: "target is not a file or directory" };
  }

  if (decodedAnchor && target.endsWith(".md")) {
    let anchors = anchorCache.get(target);
    if (!anchors) {
      anchors = collectAnchors(readFileSync(target, "utf8"));
      anchorCache.set(target, anchors);
    }
    if (!anchors.has(decodedAnchor)) {
      return {
        destination,
        line,
        reason: `heading #${decodedAnchor} does not exist`,
      };
    }
  }

  return;
};

const run = ({ root }) => {
  const files = collectMarkdownFiles(root);
  const failures = [];
  const anchorCache = new Map();

  for (const file of files) {
    const source = readFileSync(file, "utf8");
    for (const link of collectLinks(source)) {
      const failure = validateLink(link, file, root, anchorCache);
      if (failure) {
        failures.push({ file, ...failure });
      }
    }
  }

  if (failures.length > 0) {
    console.error("Documentation link check failed:");
    for (const failure of failures) {
      console.error(
        `- ${relative(root, failure.file)}:${failure.line} ${failure.destination} (${failure.reason})`
      );
    }
    process.exitCode = 1;
    return;
  }

  console.log(`Documentation links passed (${files.length} Markdown files).`);
};

const options = parseArguments(process.argv.slice(2));
if (options) {
  try {
    run(options);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 2;
  }
} else {
  console.error(
    "Usage: node scripts/docs/check-links.mjs [--root <directory>]"
  );
  process.exitCode = 2;
}
