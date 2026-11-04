import assert from "node:assert/strict";
import test from "node:test";
import { cleanError } from "./audit-publish.mjs";

test("cleanError keeps the cause but strips tokens and control characters", () => {
  const text = cleanError(
    new Error("Tracking issue 721 is not open\nghp_abc123DEF Bearer xyz")
  );
  assert.ok(text.includes("Tracking issue 721 is not open"));
  for (const bad of ["ghp_", "xyz", "\n"]) assert.ok(!text.includes(bad));
  assert.equal(cleanError("x".repeat(1000)).length, 300);
});
