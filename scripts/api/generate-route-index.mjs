#!/usr/bin/env node
// Writes docs/api/routes.md from apps/api/fastapi/openapi.json.
// Usage: node scripts/api/generate-route-index.mjs [--check]
//   --check  exit 1 when the committed file differs from the rendered output.

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { renderRouteIndex } from "./route-index.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const specPath = join(root, "apps", "api", "fastapi", "openapi.json");
const outputPath = join(root, "docs", "api", "routes.md");
const STALE =
  "docs/api/routes.md is out of date. Run: pnpm generate:api-routes";

export function renderFromCommittedSpec() {
  return renderRouteIndex(JSON.parse(readFileSync(specPath, "utf8")));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const rendered = renderFromCommittedSpec();
  if (process.argv.includes("--check")) {
    let committed = null;
    try {
      committed = readFileSync(outputPath, "utf8");
    } catch {
      committed = null;
    }
    if (committed === rendered) {
      console.log("docs/api/routes.md is up to date.");
    } else {
      console.error(STALE);
      process.exitCode = 1;
    }
  } else {
    writeFileSync(outputPath, rendered);
    console.log("Wrote docs/api/routes.md");
  }
}
