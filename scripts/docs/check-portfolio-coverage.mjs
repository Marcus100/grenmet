#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const workspaceRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  ".."
);

const portfolioDirectory = "docs/portfolio";
const portfolioIndex = `${portfolioDirectory}/README.md`;
const portfolioPlan = `${portfolioDirectory}/barrels-portfolio-implementation-plan.md`;
const clientPlan = `${portfolioDirectory}/gaa-gms-client-programme-plan.md`;
const deliveryMap = `${portfolioDirectory}/repository-delivery-map.md`;
const authoritativeFiles = [
  portfolioIndex,
  portfolioPlan,
  clientPlan,
  deliveryMap,
];
const groupedParents = new Set([
  ".agents",
  ".claude",
  ".cursor",
  ".github",
  "docs",
  "infra",
  "packages",
  "scripts",
]);
const ignoredFallbackDirectories = new Set([
  ".git",
  ".next",
  ".venv",
  "coverage",
  "node_modules",
]);
const claimFiles = [
  "README.md",
  "CLAUDE.md",
  "docs/technical-overview.md",
  "docs/quality-score.md",
  "docs/strategy/barrels-product-strategy.md",
  "docs/exec-plans/barrelsgd-transition.md",
  "docs/exec-plans/barrelsgd-migration-plan.md",
  "docs/adr/0009-gaa-staff-platform.md",
  ...authoritativeFiles,
];
const prohibitedClaims = [
  /\bGMS\s+(?:is|remains)\s+(?:a|the)\s+Barrels\s+product\b/i,
  /\bGMS\s+(?:is|remains)\s+one\s+product\s+within\s+Barrels\b/i,
  /\bGMS\s+product\s+itself\s+continues\b/i,
  /\bGMS[\s\S]{0,160}\blargest\s+product\s+in\s+the\s+portfolio\b/i,
  /\b(?:future|reusable)\s+Barrels\s+HR\s+product\b/i,
  /\breusable\s+HR\s+(?:product|initiative)\b/i,
  /\badmin-gms[\s\S]{0,200}\b(?:folded|renamed)[\s\S]{0,80}\bGMS\s+Dashboard\b/i,
];

const parseArguments = (args) => {
  if (args.length === 0) {
    return { root: workspaceRoot };
  }
  if (args.length === 2 && args[0] === "--root" && args[1]) {
    return { root: resolve(args[1]) };
  }
};

const fallbackRepositoryFiles = (root) => {
  const visit = (directory, prefix = "") =>
    readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      if (ignoredFallbackDirectories.has(entry.name)) {
        return [];
      }

      const repositoryPath = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        return visit(join(directory, entry.name), repositoryPath);
      }
      return [repositoryPath];
    });

  return visit(root);
};

const repositoryFiles = (root) => {
  const result = spawnSync(
    "git",
    [
      "-C",
      root,
      "ls-files",
      "--cached",
      "--others",
      "--exclude-standard",
      "-z",
    ],
    { encoding: "utf8" }
  );
  if (result.status === 0) {
    return result.stdout.split("\0").filter(Boolean);
  }
  return fallbackRepositoryFiles(root);
};

const surfaceForFile = (file) => {
  const segments = file.replaceAll("\\", "/").split("/");
  if (segments[0] === "apps" && segments.length >= 3) {
    return segments.slice(0, 3).join("/");
  }
  if (groupedParents.has(segments[0]) && segments.length >= 2) {
    return segments.slice(0, 2).join("/");
  }
  return segments[0];
};

const discoverRepositorySurfaces = (root) =>
  [...new Set(repositoryFiles(root).map(surfaceForFile))].sort();

const lineNumber = (source, index) => source.slice(0, index).split("\n").length;

const validate = (root) => {
  const failures = [];

  for (const file of authoritativeFiles) {
    if (!existsSync(join(root, file))) {
      failures.push(`${file}: required authoritative view is missing`);
    }
  }

  if (failures.length > 0) {
    return { failures, surfaceCount: 0 };
  }

  const indexSource = readFileSync(join(root, portfolioIndex), "utf8");
  for (const file of [portfolioPlan, clientPlan, deliveryMap]) {
    const basename = file.slice(file.lastIndexOf("/") + 1);
    if (!indexSource.includes(`](${basename})`)) {
      failures.push(`${portfolioIndex}: missing link to ${basename}`);
    }
  }

  const mapSource = readFileSync(join(root, deliveryMap), "utf8");
  const surfaces = discoverRepositorySurfaces(root);
  for (const surface of surfaces) {
    if (!mapSource.includes(`\`${surface}\``)) {
      failures.push(`${deliveryMap}: missing governed surface \`${surface}\``);
    }
  }

  for (const file of claimFiles) {
    const path = join(root, file);
    if (!existsSync(path)) {
      failures.push(`${file}: required classification source is missing`);
      continue;
    }
    const source = readFileSync(path, "utf8");
    for (const pattern of prohibitedClaims) {
      const match = pattern.exec(source);
      if (match?.index !== undefined) {
        failures.push(
          `${file}:${lineNumber(source, match.index)} prohibited client-as-product claim: ${match[0]}`
        );
      }
    }
  }

  return { failures, surfaceCount: surfaces.length };
};

const run = ({ root }) => {
  const { failures, surfaceCount } = validate(root);
  if (failures.length > 0) {
    console.error("Portfolio coverage check failed:");
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log(`Portfolio coverage passed (${surfaceCount} governed surfaces).`);
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
    "Usage: node scripts/docs/check-portfolio-coverage.mjs [--root <directory>]"
  );
  process.exitCode = 2;
}
