#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const foundationPath = join(rootDir, "packages/ui/src/styles/globals.css");
const targetPaths = [
  "apps/web/admin-gms/src/app/globals.css",
  "apps/web/auth/src/app/globals.css",
  "apps/web/cap/src/app/globals.css",
  "apps/web/hr/src/app/globals.css",
  "apps/web/hurricaneplan/src/styles/tailwind.css",
  "apps/web/salesbus/src/app/globals.css",
  "apps/web/spicewx/src/app/globals.css",
  "apps/web/wxproducts/src/app/globals.css",
  "apps/web/wxwatch/src/app/globals.css",
].map((path) => join(rootDir, path));

const blockPattern =
  /\/\* BEGIN GRENMET DESIGN SYSTEM V1 \*\/[\s\S]*?\/\* END GRENMET DESIGN SYSTEM V1 \*\//g;
const darkVariantPattern =
  /^\s*@custom-variant\s+dark\s+\([^;]+;\s*(?:\r?\n)?/gm;
const gmDeclarationPattern = /^\s*--gm-[a-z0-9-]+\s*:/im;

// Hoisted regex literal (useTopLevelRegex):
const tailwindAtRulePattern = /^@(charset|import|plugin|config)\b/;

function normalize(text) {
  return text.replace(/\r\n/g, "\n").trim();
}

async function readFoundationBlock() {
  const source = await readFile(foundationPath, "utf8");
  const match = source.match(blockPattern);

  if (!match || match.length !== 1) {
    throw new Error(
      `Expected exactly one GrenMet foundation block in ${relative(
        rootDir,
        foundationPath
      )}.`
    );
  }

  return match[0].replace(/\r\n/g, "\n");
}

function stripGeneratedBlock(text) {
  return text
    .replace(blockPattern, "")
    .replace(/\n{3,}/g, "\n\n")
    .trimStart();
}

// NOTE: This function strips the @custom-variant dark directive so it is not
// duplicated when the generated block is re-inserted. It does NOT strip
// freestanding `.dark { }` CSS rule blocks — those require manual removal and
// are flagged by the audit script's darkMode category (design-system:audit).
function stripLocalDarkVariant(text) {
  return text.replace(darkVariantPattern, "");
}

function insertAfterTailwindDirectives(text, block) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  let index = 0;
  let sawDirective = false;

  while (index < lines.length) {
    const trimmed = lines[index].trim();

    if (tailwindAtRulePattern.test(trimmed)) {
      sawDirective = true;
      index += 1;
      continue;
    }

    if (sawDirective && trimmed === "") {
      index += 1;
      continue;
    }

    break;
  }

  const head = lines.slice(0, index).join("\n").trimEnd();
  const tail = lines.slice(index).join("\n").trimStart();

  const result = `${head ? `${head}\n\n` : ""}${block}\n\n${tail}`.trimEnd();
  return `${result}\n`;
}

function syncContent(text, block) {
  const withoutGeneratedBlock = stripGeneratedBlock(text);
  const withoutLocalDarkVariant = stripLocalDarkVariant(withoutGeneratedBlock);
  return insertAfterTailwindDirectives(withoutLocalDarkVariant, block);
}

function validateContent(text, block) {
  const matches = text.match(blockPattern) ?? [];

  if (matches.length !== 1) {
    return `expected one generated GrenMet block, found ${matches.length}`;
  }

  if (normalize(matches[0]) !== normalize(block)) {
    return "generated GrenMet block is not in sync with @grenmet/ui";
  }

  const outsideGeneratedBlock = text.replace(blockPattern, "");

  if (gmDeclarationPattern.test(outsideGeneratedBlock)) {
    return "declares --gm-* outside the generated GrenMet block";
  }

  return null;
}

async function run() {
  const mode = process.argv.includes("--write") ? "write" : "check";
  const block = await readFoundationBlock();
  const failures = [];
  const changed = [];

  for (const targetPath of targetPaths) {
    const original = await readFile(targetPath, "utf8");
    const relativePath = relative(rootDir, targetPath);

    if (mode === "write") {
      const next = syncContent(original, block);

      if (next !== original.replace(/\r\n/g, "\n")) {
        await writeFile(targetPath, next, "utf8");
        changed.push(relativePath);
      }

      continue;
    }

    const problem = validateContent(original, block);

    if (problem) {
      failures.push(`${relativePath}: ${problem}`);
    }
  }

  if (mode === "write") {
    if (changed.length === 0) {
      console.log("GrenMet design-system blocks are already in sync.");
      return;
    }

    console.log("Synced GrenMet design-system blocks:");
    for (const path of changed) {
      console.log(`- ${path}`);
    }
    return;
  }

  if (failures.length > 0) {
    console.error("GrenMet design-system check failed:");
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    console.error("Run `pnpm design-system:sync` to update generated blocks.");
    process.exit(1);
  }

  console.log("GrenMet design-system blocks are in sync.");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
