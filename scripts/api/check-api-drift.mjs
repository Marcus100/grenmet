#!/usr/bin/env node
/**
 * Checks whether packages/api-client/src/gen/ is out of sync with
 * apps/api/fastapi/openapi.json by comparing last-modified times.
 *
 * Exits 1 if openapi.json is newer than the generated client, meaning
 * `pnpm generate:api-client` needs to be run.
 */

import { statSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");

const openapiPath = resolve(root, "apps/api/fastapi/openapi.json");
const genCanaryPath = resolve(root, "packages/api-client/src/gen/index.ts");

let openapiMtime;
let genMtime;

try {
  openapiMtime = statSync(openapiPath).mtimeMs;
} catch {
  console.log("check:drift — openapi.json not found, skipping.");
  process.exit(0);
}

try {
  genMtime = statSync(genCanaryPath).mtimeMs;
} catch {
  console.error(
    "✗ packages/api-client/src/gen/index.ts not found.\n" +
      "  Run: pnpm generate:api-client"
  );
  process.exit(1);
}

if (openapiMtime > genMtime) {
  console.error(
    "✗ openapi.json has been modified but api-client/src/gen/ has not been regenerated.\n" +
      "  Run: pnpm generate:api-client\n" +
      "  Then commit the updated src/gen/ files."
  );
  process.exit(1);
}

console.log("✓ api-client/src/gen/ is in sync with openapi.json.");
