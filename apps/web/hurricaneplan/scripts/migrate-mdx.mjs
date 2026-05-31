#!/usr/bin/env node
/**
 * One-time migration: converts src/app/[slug]/page.mdx files to src/content/[slug].mdx
 * - Extracts `export const metadata` → YAML frontmatter
 * - Removes `export const sections` (now auto-extracted by content-collections)
 * - Removes known per-file component import lines (passed via MdxContent components prop)
 * - Renames: page.mdx (root) → index.mdx, foo/page.mdx → foo.mdx
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import glob from "fast-glob";

const __dirname = dirname(fileURLToPath(import.meta.url));
const appDir = join(__dirname, "../src/app");
const contentDir = join(__dirname, "../src/content");

const PAGE_MDX_RE = /(^|\/)page\.mdx$/;
const METADATA_BLOCK_RE = /export const metadata = \{[\s\S]*?\n\}\n*/g;
const SECTIONS_BLOCK_RE = /export const sections = \[[\s\S]*?\]\n*/g;
const METADATA_INNER_RE = /export const metadata = \{([\s\S]*?)\n\}/;
const TITLE_RE = /title:\s*['"](.+?)['"]/s;
const DESC_RE = /description:\s*\n?\s*['"](.+?)['"]/s;
const LEADING_SLASH_RE = /^\//;

// Imports that should be removed (components are now passed via MdxContent)
const IMPORTS_TO_STRIP = [
  "import { Guides } from '@/components/Guides'",
  "import { Resources } from '@/components/Resources'",
  "import { HeroPattern } from '@/components/HeroPattern'",
  "import { Libraries } from '@/components/Libraries'",
];

function extractMetadata(content) {
  const match = content.match(METADATA_INNER_RE);
  if (!match) return { title: "Untitled", description: "" };
  const inner = match[1];
  const title = inner.match(TITLE_RE)?.[1] ?? "Untitled";
  const desc = inner.match(DESC_RE)?.[1] ?? "";
  return { title, description: desc };
}

function transformContent(raw) {
  const { title, description } = extractMetadata(raw);

  let content = raw;

  content = content.replace(METADATA_BLOCK_RE, "");
  content = content.replace(SECTIONS_BLOCK_RE, "");

  for (const imp of IMPORTS_TO_STRIP) {
    content = content.replace(`${imp}\n`, "");
  }

  content = content.trimStart();

  const safeTitle = title.replace(/'/g, "''");
  const safeDesc = description.replace(/'/g, "''");

  const frontmatter = description
    ? `---\ntitle: '${safeTitle}'\ndescription: '${safeDesc}'\n---\n\n`
    : `---\ntitle: '${safeTitle}'\n---\n\n`;

  return frontmatter + content;
}

function getTargetPath(relPath) {
  if (relPath === "page.mdx") return "index.mdx";
  return relPath.replace(PAGE_MDX_RE, ".mdx").replace(LEADING_SLASH_RE, "");
}

const files = glob.sync("**/page.mdx", { cwd: appDir });
let count = 0;

for (const relPath of files) {
  const src = join(appDir, relPath);
  const targetRel = getTargetPath(relPath);
  const dest = join(contentDir, targetRel);

  mkdirSync(dirname(dest), { recursive: true });
  const raw = readFileSync(src, "utf8");
  const transformed = transformContent(raw);
  writeFileSync(dest, transformed);
  console.log(`  ${relPath} → src/content/${targetRel}`);
  count++;
}

console.log(`\n✓ Migrated ${count} MDX files to src/content/`);
