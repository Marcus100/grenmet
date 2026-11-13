import assert from "node:assert/strict";
import { test } from "node:test";
import { buildContentSecurityPolicy } from "@barrelsgd/ui/lib/content-security-policy";
import { pagesHeaders } from "./pages-headers.mjs";

test("the Pages headers file carries the shared report-only policy for every path", () => {
  const policy = buildContentSecurityPolicy({ app: "elections" });
  const text = pagesHeaders([
    { key: "Content-Security-Policy-Report-Only", value: policy },
  ]);
  const lines = text.split("\n");
  assert.equal(lines[0], "/*");
  assert.ok(lines.includes(`  Content-Security-Policy-Report-Only: ${policy}`));
  assert.ok(lines.includes("  X-Content-Type-Options: nosniff"));
  // Report-only until the clean report window (docs/security.md): never enforced here.
  assert.ok(
    !lines.some((line) => line.startsWith("  Content-Security-Policy:"))
  );
});
