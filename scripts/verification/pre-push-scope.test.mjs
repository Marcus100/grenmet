import assert from "node:assert/strict";
import test from "node:test";
import { rangeFor, render, scopeFor } from "./pre-push-scope.mjs";

const PACKAGES = new Set([
  "apps/web/gaa-admin",
  "apps/web/gms",
  "packages/ui",
  "packages/ui/nested",
]);
const has = (dir) => PACKAGES.has(dir);
const ZERO = "0".repeat(40);

test("files map to their nearest workspace package, without dependants", () => {
  const scope = scopeFor(
    [
      "apps/web/gaa-admin/src/a.test.ts",
      "apps/web/gaa-admin/src/b.ts",
      "packages/ui/nested/x.ts",
      "packages/ui/y.ts",
    ],
    has
  );
  assert.deepEqual(scope.packages, [
    "apps/web/gaa-admin",
    "packages/ui",
    "packages/ui/nested",
  ]);
  assert.equal(
    render(scope),
    "--filter=./apps/web/gaa-admin --filter=./packages/ui --filter=./packages/ui/nested"
  );
});

test("changes outside any package skip tests", () => {
  const scope = scopeFor(
    ["docs/testing.md", "scripts/ci/x.mjs", ".husky/pre-push"],
    has
  );
  assert.equal(render(scope), "NONE");
  assert.equal(render(scopeFor([], has)), "NONE");
});

test("workspace-wide inputs run every package's tests", () => {
  for (const file of ["pnpm-lock.yaml", "turbo.json", "pnpm-workspace.yaml"])
    assert.equal(render(scopeFor([file, "apps/web/gms/a.ts"], has)), "ALL");
});

test("push range uses the remote sha, or the base for a new branch", () => {
  assert.deepEqual(
    rangeFor("refs/heads/x abc refs/heads/x def", "origin/dev"),
    { from: "def", to: "abc" }
  );
  assert.deepEqual(
    rangeFor(`refs/heads/x abc refs/heads/x ${ZERO}`, "origin/dev"),
    { from: "origin/dev", to: "abc" }
  );
  assert.equal(
    rangeFor(`(delete) ${ZERO} refs/heads/x def`, "origin/dev"),
    undefined
  );
});
