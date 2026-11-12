// The committed route index must match the committed OpenAPI document, so a
// route change cannot land without regenerating docs/api/routes.md.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { renderRouteIndex } from "../api/route-index.mjs";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (relativePath) =>
  readFileSync(join(repoRoot, relativePath), "utf8");

test("docs/api/routes.md matches apps/api/fastapi/openapi.json", () => {
  const spec = JSON.parse(read("apps/api/fastapi/openapi.json"));
  assert.equal(
    read("docs/api/routes.md"),
    renderRouteIndex(spec),
    "docs/api/routes.md is out of date. Run: pnpm generate:api-routes"
  );
});
