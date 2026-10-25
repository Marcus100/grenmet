// Local runner evidence, not a signed attestation or a replacement for CI.
// Only the isolated review wrapper writes this file; consumers must still
// trust that runner and enforce their own GitHub permissions/checks.
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  closeSync,
  existsSync,
  openSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";

const RECEIPT_FILE = "agent-review-receipt.json";
const SHA = /^[a-f0-9]{40}$/;
const SEVERITIES = ["blocker", "major", "minor", "nit"];

export const REVIEW_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["status", "verdict", "summary", "findings"],
  properties: {
    status: { type: "string", enum: ["completed", "incomplete"] },
    verdict: { type: "string", enum: ["approve", "changes_requested"] },
    summary: { type: "string" },
    findings: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["severity", "file", "line", "title", "detail"],
        properties: {
          severity: { type: "string", enum: SEVERITIES },
          file: { type: "string" },
          line: { type: ["integer", "null"], minimum: 1 },
          title: { type: "string" },
          detail: { type: "string" },
        },
      },
    },
  },
};

const isObject = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const hasKeys = (value, keys) =>
  isObject(value) &&
  Object.keys(value).length === keys.length &&
  keys.every((key) => Object.hasOwn(value, key));

/** Validate locally too: schema output is guidance, never proof of success. */
export function parseReview(text) {
  const review = JSON.parse(text);
  if (
    !(
      hasKeys(review, ["status", "verdict", "summary", "findings"]) &&
      ["completed", "incomplete"].includes(review.status) &&
      ["approve", "changes_requested"].includes(review.verdict)
    ) ||
    typeof review.summary !== "string" ||
    review.summary.trim() === "" ||
    !Array.isArray(review.findings)
  ) {
    throw new Error("Review output is missing a valid completion or verdict.");
  }
  for (const finding of review.findings) {
    if (
      !(
        hasKeys(finding, ["severity", "file", "line", "title", "detail"]) &&
        SEVERITIES.includes(finding.severity) &&
        [finding.file, finding.title, finding.detail].every(
          (value) => typeof value === "string" && value.trim() !== ""
        ) &&
        (finding.line === null ||
          (Number.isInteger(finding.line) && finding.line > 0))
      )
    ) {
      throw new Error("Review output contains a malformed finding.");
    }
  }
  // Never let an inconsistent model verdict erase a blocking finding.
  if (review.findings.some((f) => ["blocker", "major"].includes(f.severity))) {
    review.verdict = "changes_requested";
  }
  return review;
}

export function renderReview(review) {
  return [
    `Review: ${review.status}; verdict: ${review.verdict}.`,
    review.summary,
    ...review.findings.map(
      (f) =>
        `${f.severity}: ${f.file}${f.line === null ? "" : `:${f.line}`} — ${f.title}\n${f.detail}`
    ),
  ].join("\n\n");
}

export function createReviewReceipt(info, review) {
  return {
    version: 1,
    runId: randomUUID(),
    reviewer: "codex",
    isolation: "ephemeral-read-only",
    completedAt: new Date().toISOString(),
    head: info.head,
    base: info.base,
    baseTip: info.baseTip,
    mergeBase: info.mergeBase,
    baseImpact: info.baseImpact ?? "none",
    review,
  };
}

export function receiptPath(root, spawn = spawnSync) {
  const result = spawn("git", ["rev-parse", "--git-dir"], {
    cwd: root,
    encoding: "utf8",
  });
  if (result.status !== 0 || !result.stdout?.trim()) {
    throw new Error("Cannot locate this worktree's review receipt directory.");
  }
  return join(resolve(root, result.stdout.trim()), RECEIPT_FILE);
}

export function clearReviewReceipt(path) {
  rmSync(path, { force: true });
}

/** No automatic stale takeover: first establish that the old runner stopped. */
export function acquireReviewLock(path) {
  const lock = `${path}.lock`;
  let fd;
  try {
    fd = openSync(lock, "wx", 0o600);
  } catch (error) {
    if (error.code === "EEXIST") return null;
    throw error;
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    closeSync(fd);
    rmSync(lock);
  };
}

export function writeReviewReceipt(path, receipt) {
  writeFileSync(path, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 });
}

export function readReviewReceipt(path) {
  if (existsSync(`${path}.lock`) || !existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

/** Eligibility for the current local checkout; callers must check CI too. */
export function reviewBlockers(
  receipt,
  info,
  { requireLocalVerification = true, allowBaseAdvances = false } = {}
) {
  const blockers = [];
  if (
    !isObject(receipt) ||
    receipt.version !== 1 ||
    receipt.reviewer !== "codex" ||
    receipt.isolation !== "ephemeral-read-only" ||
    (receipt.baseImpact !== undefined &&
      !["none", "overlap"].includes(receipt.baseImpact)) ||
    typeof receipt.runId !== "string" ||
    !receipt.runId ||
    !Number.isFinite(Date.parse(receipt.completedAt)) ||
    ![receipt.head, receipt.baseTip, receipt.mergeBase].every(
      (sha) => typeof sha === "string" && SHA.test(sha)
    )
  ) {
    return [
      "A completed review receipt from the trusted local runner is missing or malformed.",
    ];
  }
  let review;
  try {
    review = parseReview(JSON.stringify(receipt.review));
  } catch {
    return ["The receipt contains an invalid review result."];
  }
  if (review.status !== "completed")
    blockers.push("The review did not complete.");
  if (review.verdict !== "approve")
    blockers.push("The review requests changes.");
  if (receipt.head !== info.head)
    blockers.push("The review is stale: HEAD changed.");
  if (
    receipt.base !== info.base ||
    receipt.mergeBase !== info.mergeBase ||
    (allowBaseAdvances
      ? (receipt.baseImpact ?? "none") !== (info.baseImpact ?? "none")
      : receipt.baseTip !== info.baseTip || info.mergeBase !== info.baseTip)
  )
    blockers.push(
      "The review is stale: the base changed or has not been integrated."
    );
  if (info.remoteVerified !== true || info.pushed !== true) {
    blockers.push("The current head and base must be verified on the remote.");
  }
  if (info.dirtyCount !== 0)
    blockers.push("The worktree has uncommitted changes.");
  if (requireLocalVerification && !info.receipt)
    blockers.push("The current changes have no passing verification receipt.");
  return blockers;
}
