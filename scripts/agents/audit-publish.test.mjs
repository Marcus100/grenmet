import assert from "node:assert/strict";
import test from "node:test";
import { cleanError } from "./audit-publish.mjs";

test("cleanError redacts credential shapes", () => {
  for (const raw of [
    "gho_abc123",
    "ghs_abc123",
    "github_pat_abc_123",
    "x_ghp_abc",
    "GH_TOKEN=abc123",
    "https://u:pw@host/x",
  ]) {
    const text = cleanError(raw);
    for (const leak of ["abc", "pw@", "u:pw"])
      assert.ok(!text.includes(leak), `${raw} leaked ${leak}: ${text}`);
  }
});

test("cleanError keeps the cause but strips tokens and control characters", () => {
  const text = cleanError(
    new Error("Tracking issue 721 is not open\nghp_abc123DEF Bearer xyz")
  );
  assert.ok(text.includes("Tracking issue 721 is not open"));
  for (const bad of ["ghp_", "xyz", "\n"]) assert.ok(!text.includes(bad));
  assert.equal(cleanError("x".repeat(1000)).length, 300);
});
