import assert from "node:assert/strict";
import test from "node:test";
import {
  createReviewReceipt,
  parseReview,
  reviewBlockers,
} from "./review-receipt.mjs";

const INFO = {
  head: "a".repeat(40),
  base: "origin/dev",
  baseTip: "b".repeat(40),
  mergeBase: "b".repeat(40),
  dirtyCount: 0,
  remoteVerified: true,
  pushed: true,
  receipt: { checks: ["guardrails"] },
};
const APPROVED = {
  status: "completed",
  verdict: "approve",
  summary: "The full change was inspected; no blocking findings.",
  findings: [],
};
const FINDING = {
  severity: "major",
  file: "scripts/agents/example.mjs",
  line: 12,
  title: "A stale result passes",
  detail: "Changing the head does not invalidate this approval.",
};

test("approval never erases a blocker or major finding", () => {
  for (const severity of ["blocker", "major"]) {
    const review = parseReview(
      JSON.stringify({ ...APPROVED, findings: [{ ...FINDING, severity }] })
    );
    assert.equal(review.verdict, "changes_requested");
    assert.ok(reviewBlockers(createReviewReceipt(INFO, review), INFO).length);
  }
});

test("invalid results fail closed, including error prose and incomplete shapes", () => {
  for (const review of [
    null,
    [],
    {},
    { ...APPROVED, status: "failed" },
    { ...APPROVED, summary: "" },
    { ...APPROVED, findings: null },
    { ...APPROVED, findings: [{ ...FINDING, severity: "unknown" }] },
    { ...APPROVED, findings: [{ ...FINDING, line: 0 }] },
    { ...APPROVED, findings: [{}] },
    { ...APPROVED, findings: [null] },
  ]) {
    assert.throws(() => parseReview(JSON.stringify(review)));
  }
  assert.throws(() => parseReview("API error: 400"));
});

test("only completed approval for the exact remote and verified checkout is eligible", () => {
  const receipt = createReviewReceipt(INFO, APPROVED);
  assert.deepEqual(reviewBlockers(receipt, INFO), []);
  for (const changes of [
    { head: "c".repeat(40) },
    { baseTip: "c".repeat(40) },
    { mergeBase: "c".repeat(40) },
    { base: "origin/staging" },
    { dirtyCount: 1 },
    { pushed: null },
    { remoteVerified: false },
    { receipt: null },
  ]) {
    assert.ok(reviewBlockers(receipt, { ...INFO, ...changes }).length);
  }
});

test("worker approvals survive disjoint base advances but not overlapping changes", () => {
  const receipt = createReviewReceipt(INFO, APPROVED);
  const advanced = {
    ...INFO,
    baseTip: "c".repeat(40),
    baseImpact: "none",
  };
  assert.deepEqual(
    reviewBlockers(receipt, advanced, {
      allowBaseAdvances: true,
      requireLocalVerification: false,
    }),
    []
  );
  assert.ok(
    reviewBlockers(
      receipt,
      { ...advanced, baseImpact: "overlap" },
      { allowBaseAdvances: true, requireLocalVerification: false }
    ).length
  );
  assert.ok(reviewBlockers(receipt, advanced).length);
});

test("missing, malformed, incomplete or changes-requested receipts never approve", () => {
  const receipt = createReviewReceipt(INFO, APPROVED);
  for (const candidate of [
    null,
    {},
    [],
    { ...receipt, version: 2 },
    { ...receipt, completedAt: "invalid" },
    { ...receipt, head: "short" },
    { ...receipt, review: null },
    { ...receipt, review: { ...APPROVED, status: "incomplete" } },
    { ...receipt, review: { ...APPROVED, verdict: "changes_requested" } },
  ]) {
    assert.ok(reviewBlockers(candidate, INFO).length);
  }
});
