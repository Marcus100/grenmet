#!/usr/bin/env node

import { readdir, readFile } from "node:fs/promises";
import { dirname, extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");

const webApps = [
  {
    name: "admin-gms",
    root: "apps/web/admin-gms",
    note:
      "Template-origin theme scales are expected to be noisy; treat them as migration debt.",
  },
  { name: "auth", root: "apps/web/auth" },
  {
    name: "hr",
    root: "apps/web/hr",
    note:
      "Fixed print/PDF measurements can be valid exceptions; review app chrome first.",
  },
  {
    name: "hurricaneplan",
    root: "apps/web/hurricaneplan",
    note:
      "Docs-template styling is expected to be noisy; review global shell colors first.",
  },
  { name: "salesbus", root: "apps/web/salesbus" },
  {
    name: "spicewx",
    root: "apps/web/spicewx",
    note: "Pilot app for the first foundation cleanup pass.",
  },
  {
    name: "wxproducts",
    root: "apps/web/wxproducts",
    note:
      "Fixed print/PDF measurements can be valid exceptions; review app chrome first.",
  },
  { name: "wxwatch", root: "apps/web/wxwatch" },
];

const generatedBlockPattern =
  /\/\* BEGIN GRENMET DESIGN SYSTEM V1 \*\/[\s\S]*?\/\* END GRENMET DESIGN SYSTEM V1 \*\//g;

const sourceExtensions = new Set([
  ".css",
  ".js",
  ".jsx",
  ".mdx",
  ".ts",
  ".tsx",
]);

const ignoredDirectories = new Set([
  ".git",
  ".next",
  ".turbo",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "out",
  "public",
]);

const categoryLabels = {
  colors: "Hard-coded colors",
  typography: "Font and typography drift",
  spacing: "Arbitrary spacing, sizing, or layout values",
  radius: "Arbitrary radius values",
  shadows: "App-local shadows/elevation",
  darkMode: "Dark/system theme hooks",
  localTokens: "Local theme tokens not mapped to GrenMet",
};

const semanticTokenPattern =
  /var\(--(?:background|foreground|card|card-foreground|popover|popover-foreground|primary|primary-foreground|secondary|secondary-foreground|muted|muted-foreground|accent|accent-foreground|destructive|destructive-foreground|border|input|ring|sidebar|sidebar-[a-z-]+|radius)\)/;

const colorValuePattern =
  /#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b|\b(?:rgba?|hsla?|oklch|oklab|lab|lch)\([^)]*\)|\bcolor-mix\([^)]*\)/g;
const arbitraryColorPattern =
  /\b(?:bg|text|border|from|via|to|fill|stroke|ring|outline|decoration|accent|caret)-\[[^\]\n]+\]/g;
const nextFontImportPattern =
  /import\s*\{\s*([^}]+)\s*\}\s*from\s*["']next\/font\/google["']/g;
const fontFamilyPattern = /\bfont-family\s*:\s*([^;]+);/gi;
const fontTokenPattern = /--font-[a-z0-9-]+\s*:\s*([^;]+);/gi;
const typographyDeclarationPattern =
  /\b(?:font-size|line-height|letter-spacing)\s*:\s*([^;]+);/gi;
const arbitraryTypographyPattern =
  /\b(?:text|leading|tracking)-\[[^\]\n]+\]/g;
const arbitrarySpacingPattern =
  /\b-?(?:m[trblxy]?|p[trblxy]?|gap(?:-[xy])?|space-[xy]|inset(?:-[xy])?|top|right|bottom|left|w|h|min-w|max-w|min-h|max-h|size|basis|translate-[xy]|scroll-m[trblxy]?|scroll-p[trblxy]?|border|outline-offset)-\[[^\]\n]+\]/g;
const cssSpacingDeclarationPattern =
  /\b(?:margin|margin-inline|margin-block|margin-top|margin-right|margin-bottom|margin-left|padding|padding-inline|padding-block|padding-top|padding-right|padding-bottom|padding-left|gap|row-gap|column-gap)\s*:\s*([^;]+);/gi;
const arbitraryRadiusPattern = /\brounded(?:-[a-z0-9]+)?-\[[^\]\n]+\]/g;
const cssRadiusDeclarationPattern = /\bborder-radius\s*:\s*([^;]+);/gi;
const shadowPattern =
  /\bshadow-\[[^\]\n]+\]|\bbox-shadow\s*:\s*[^;]+;|--(?:shadow|shadow-theme)-[a-z0-9-]+\s*:\s*[^;]+;/gi;
const darkModePattern =
  /\bprefers-color-scheme\b|\bdark:|\benableSystem\b|\bdefaultTheme\s*=\s*["']system["']|\bresolvedTheme\b|\bsetTheme\(\s*["']dark["']\s*\)/g;
const localTokenPattern =
  /^\s*(--(?:color|brand|surface|text|border|ring|font|radius|shadow|shadow-theme|gray|blue-light|success|error|warning|orange)[a-z0-9-]*)\s*:\s*([^;]+);/i;

const showAll = process.argv.includes("--all");
const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
const detailLimit = showAll
  ? Number.POSITIVE_INFINITY
  : limitArg
    ? Number.parseInt(limitArg.split("=")[1] ?? "12", 10)
    : 12;

function toDisplayPath(path) {
  return relative(rootDir, path).replaceAll("\\", "/");
}

function maskGeneratedBlocks(source) {
  return source.replace(generatedBlockPattern, (match) =>
    match.replace(/[^\r\n]/g, " ")
  );
}

function compact(value) {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > 140
    ? `${normalized.slice(0, 137).trimEnd()}...`
    : normalized;
}

function isAllowedFontValue(value) {
  const lower = value.toLowerCase();
  return (
    lower.includes("inter") ||
    lower.includes("gm-font-sans") ||
    lower.includes("font-inter") ||
    lower.includes("inherit") ||
    lower.includes("ui-sans-serif") ||
    lower.includes("system-ui")
  );
}

function isTokenMappedToGrenMet(value) {
  return value.includes("var(--gm-") || semanticTokenPattern.test(value);
}

function isLikelyLengthValue(value) {
  return /(?:\d|px|rem|em|ch|vh|vw|vmin|vmax|%|mm|cm|in|pt|pc|calc\(|clamp\(|min\(|max\()/.test(
    value
  );
}

function isAllowedSpacingValue(value) {
  const lower = value.toLowerCase();
  const rawValue = lower.includes(":")
    ? lower.slice(lower.indexOf(":") + 1).replace(/;$/, "").trim()
    : lower.trim();

  return (
    value.includes("var(--gm-spacing-") ||
    value.includes("var(--gm-space-") ||
    value.includes("var(--spacing") ||
    lower.includes("safe-area-inset") ||
    /^(?:0|auto|0 auto|auto 0|inherit|initial|unset)$/.test(rawValue)
  );
}

function isAllowedRadiusValue(value) {
  return (
    value.includes("var(--gm-radius-") ||
    value.includes("var(--radius") ||
    value === "0" ||
    value === "inherit"
  );
}

function isAllowedTypographyValue(value) {
  return (
    value.includes("var(--gm-font-size-") ||
    value.includes("var(--gm-line-height-") ||
    value.includes("var(--text-") ||
    value.includes("var(--leading-")
  );
}

function isArbitraryColorUtility(value) {
  return /#|rgb|hsl|oklch|oklab|lab|lch|color-mix|var\(--color-|var\(--brand-|var\(--success|var\(--error|var\(--warning/.test(
    value
  );
}

function isAllowedColorValue(value) {
  return value.includes("var(--gm-") || semanticTokenPattern.test(value);
}

async function collectFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (ignoredDirectories.has(entry.name)) {
      continue;
    }

    const fullPath = join(dir, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await collectFiles(fullPath)));
      continue;
    }

    if (sourceExtensions.has(extname(entry.name))) {
      files.push(fullPath);
    }
  }

  return files;
}

function createAppReport(app) {
  return {
    app,
    findings: Object.fromEntries(
      Object.keys(categoryLabels).map((category) => [category, []])
    ),
    seen: new Set(),
  };
}

function addFinding(report, category, filePath, lineNumber, value, message) {
  const normalizedValue = compact(value);
  const key = `${category}:${filePath}:${lineNumber}:${normalizedValue}:${message}`;

  if (report.seen.has(key)) {
    return;
  }

  report.seen.add(key);
  report.findings[category].push({
    filePath,
    lineNumber,
    value: normalizedValue,
    message,
  });
}

function scanLine(report, filePath, lineNumber, line) {
  let match;

  colorValuePattern.lastIndex = 0;
  while ((match = colorValuePattern.exec(line))) {
    if (isAllowedColorValue(match[0])) {
      continue;
    }

    addFinding(
      report,
      "colors",
      filePath,
      lineNumber,
      match[0],
      "Use a --gm-* token, semantic token, or app alias mapped to GrenMet."
    );
  }

  arbitraryColorPattern.lastIndex = 0;
  while ((match = arbitraryColorPattern.exec(line))) {
    const value = match[0];
    if (isArbitraryColorUtility(value) && !isAllowedColorValue(value)) {
      addFinding(
        report,
        "colors",
        filePath,
        lineNumber,
        value,
        "Avoid arbitrary app-local color utilities unless the alias maps back to GrenMet."
      );
    }
  }

  nextFontImportPattern.lastIndex = 0;
  while ((match = nextFontImportPattern.exec(line))) {
    const imports = match[1]
      .split(",")
      .map((name) => name.trim().split(/\s+as\s+/i)[0])
      .filter(Boolean);

    for (const importedFont of imports) {
      if (importedFont !== "Inter") {
        addFinding(
          report,
          "typography",
          filePath,
          lineNumber,
          importedFont,
          "Inter is the provisional GrenMet web font for v1."
        );
      }
    }
  }

  fontFamilyPattern.lastIndex = 0;
  while ((match = fontFamilyPattern.exec(line))) {
    const value = compact(match[1] ?? "");
    if (!isAllowedFontValue(value)) {
      addFinding(
        report,
        "typography",
        filePath,
        lineNumber,
        `font-family: ${value}`,
        "Map typography back to --gm-font-sans or the Inter bridge token."
      );
    }
  }

  fontTokenPattern.lastIndex = 0;
  while ((match = fontTokenPattern.exec(line))) {
    const value = compact(match[0]);
    if (!isAllowedFontValue(value)) {
      addFinding(
        report,
        "typography",
        filePath,
        lineNumber,
        value,
        "Local font tokens should resolve to the provisional Inter contract."
      );
    }
  }

  typographyDeclarationPattern.lastIndex = 0;
  while ((match = typographyDeclarationPattern.exec(line))) {
    const value = compact(match[0]);
    if (
      !isAllowedTypographyValue(value) &&
      !/inherit|normal|1\b/.test(value)
    ) {
      addFinding(
        report,
        "typography",
        filePath,
        lineNumber,
        value,
        "Consider moving repeated type scale values into GrenMet typography tokens."
      );
    }
  }

  arbitraryTypographyPattern.lastIndex = 0;
  while ((match = arbitraryTypographyPattern.exec(line))) {
    const value = match[0];
    if (!isArbitraryColorUtility(value) && !value.includes("var(--gm-")) {
      addFinding(
        report,
        "typography",
        filePath,
        lineNumber,
        value,
        "Prefer the shared type scale once GrenMet typography tokens are finalized."
      );
    }
  }

  arbitrarySpacingPattern.lastIndex = 0;
  while ((match = arbitrarySpacingPattern.exec(line))) {
    const value = match[0];
    if (!isArbitraryColorUtility(value)) {
      addFinding(
        report,
        "spacing",
        filePath,
        lineNumber,
        value,
        "Prefer the shared Tailwind scale or gm spacing aliases; keep fixed media exceptions intentional."
      );
    }
  }

  cssSpacingDeclarationPattern.lastIndex = 0;
  while ((match = cssSpacingDeclarationPattern.exec(line))) {
    const value = compact(match[0]);
    if (isLikelyLengthValue(value) && !isAllowedSpacingValue(value)) {
      addFinding(
        report,
        "spacing",
        filePath,
        lineNumber,
        value,
        "CSS spacing should use gm spacing tokens unless it is a fixed-format exception."
      );
    }
  }

  arbitraryRadiusPattern.lastIndex = 0;
  while ((match = arbitraryRadiusPattern.exec(line))) {
    addFinding(
      report,
      "radius",
      filePath,
      lineNumber,
      match[0],
      "Prefer rounded-gm-* aliases or documented Tailwind radius values."
    );
  }

  cssRadiusDeclarationPattern.lastIndex = 0;
  while ((match = cssRadiusDeclarationPattern.exec(line))) {
    const value = compact(match[1] ?? "");
    if (!isAllowedRadiusValue(value)) {
      addFinding(
        report,
        "radius",
        filePath,
        lineNumber,
        `border-radius: ${value}`,
        "Use gm radius tokens or the shared semantic radius bridge."
      );
    }
  }

  shadowPattern.lastIndex = 0;
  while ((match = shadowPattern.exec(line))) {
    addFinding(
      report,
      "shadows",
      filePath,
      lineNumber,
      match[0],
      "Define GrenMet shadow tokens before app-local elevation becomes permanent."
    );
  }

  darkModePattern.lastIndex = 0;
  while ((match = darkModePattern.exec(line))) {
    addFinding(
      report,
      "darkMode",
      filePath,
      lineNumber,
      match[0],
      "V1 is light-mode only; dark hooks should be inactive or intentionally deferred."
    );
  }

  const localTokenMatch = line.match(localTokenPattern);
  if (localTokenMatch) {
    const tokenName = localTokenMatch[1] ?? "";
    const tokenValue = localTokenMatch[2] ?? "";

    if (!tokenName.startsWith("--gm-") && !isTokenMappedToGrenMet(tokenValue)) {
      addFinding(
        report,
        "localTokens",
        filePath,
        lineNumber,
        `${tokenName}: ${compact(tokenValue)}`,
        "Bridge app-local token names to --gm-* or semantic tokens."
      );
    }
  }
}

async function scanFile(report, filePath) {
  const source = maskGeneratedBlocks(await readFile(filePath, "utf8"));
  const lines = source.split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    scanLine(report, filePath, index + 1, lines[index]);
  }
}

function countReportFindings(report) {
  return Object.values(report.findings).reduce(
    (sum, findings) => sum + findings.length,
    0
  );
}

function printReport(reports) {
  const total = reports.reduce(
    (sum, report) => sum + countReportFindings(report),
    0
  );

  console.log("GrenMet foundation audit");
  console.log("Mode: warning only; this command exits 0.");
  console.log("Provisional web font: Inter.");
  console.log("Pilot cleanup app: spicewx.");
  console.log("");

  if (total === 0) {
    console.log("No foundation drift found.");
    return;
  }

  console.log("Summary");
  for (const report of reports) {
    const counts = Object.entries(report.findings)
      .filter(([, findings]) => findings.length > 0)
      .map(([category, findings]) => `${category} ${findings.length}`)
      .join(", ");

    console.log(`- ${report.app.name}: ${counts || "no findings"}`);
  }

  console.log("");
  console.log(
    showAll
      ? "Findings"
      : `Findings (showing up to ${detailLimit} per category; run pnpm design-system:audit:full for every finding)`
  );

  for (const report of reports) {
    if (countReportFindings(report) === 0) {
      continue;
    }

    console.log("");
    console.log(`## ${report.app.name}`);

    if (report.app.note) {
      console.log(`Note: ${report.app.note}`);
    }

    for (const [category, findings] of Object.entries(report.findings)) {
      if (findings.length === 0) {
        continue;
      }

      console.log("");
      console.log(`${categoryLabels[category]} (${findings.length})`);

      const visibleFindings = findings.slice(0, detailLimit);
      for (const finding of visibleFindings) {
        console.log(
          `- ${toDisplayPath(finding.filePath)}:${finding.lineNumber} ${finding.value}`
        );
        console.log(`  ${finding.message}`);
      }

      if (findings.length > visibleFindings.length) {
        console.log(
          `- ... ${findings.length - visibleFindings.length} more ${categoryLabels[
            category
          ].toLowerCase()} findings`
        );
      }
    }
  }

  console.log("");
  console.log(
    "Use this audit to plan cleanup. Keep pnpm design-system:check as the blocking generated-block guard."
  );
}

async function run() {
  const reports = [];

  for (const app of webApps) {
    const report = createAppReport(app);
    const appRoot = join(rootDir, app.root);
    const files = await collectFiles(appRoot);

    for (const filePath of files) {
      await scanFile(report, filePath);
    }

    reports.push(report);
  }

  printReport(reports);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
