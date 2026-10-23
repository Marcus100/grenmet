// Organiser verification moderation: input parsing and the fixed wording for
// every outcome. FastAPI owns the rules (apps/api/fastapi/src/events); this file
// only validates shapes and maps API refusals to readable text.

import type { VerificationCase } from "@barrelsgd/api-client";

export type ModerationStatus = VerificationCase["verification_status"];
export const MODERATION_STATUSES: readonly ModerationStatus[] = [
  "pending",
  "approved",
  "rejected",
];

export const MODERATION_PAGE_SIZE = 25;
export const MIN_REASON = 3;
export const MAX_REASON = 500;

const ORGANISER_PREFIX = /^organiser\./;

export function parseModerationStatus(
  value: string | undefined
): ModerationStatus {
  return MODERATION_STATUSES.find((item) => item === value) ?? "pending";
}

export type ModerationDecision = "approve" | "reject";

export type Parsed<T> = { ok: true; value: T } | { ok: false };

/** Rejection needs a reason (3 to 500 characters once trimmed); approval's is optional. */
export function parseReason(
  decision: ModerationDecision,
  raw: string
): Parsed<string | undefined> {
  const reason = raw.trim();
  if (decision === "approve" && reason === "") {
    return { ok: true, value: undefined };
  }
  if (reason.length < MIN_REASON || reason.length > MAX_REASON) {
    return { ok: false };
  }
  return { ok: true, value: reason };
}

export type ModerationNoticeCode =
  | "approved"
  | "rejected"
  | "invalid"
  | "mfa"
  | "not-allowed"
  | "already-decided"
  | "suspended"
  | "missing"
  | "throttled"
  | "failed";

interface Notice {
  text: string;
  tone: "ok" | "problem";
}

export const MODERATION_NOTICES: Record<ModerationNoticeCode, Notice> = {
  approved: {
    tone: "ok",
    text: "Approved. The organiser can now publish listings.",
  },
  rejected: {
    tone: "ok",
    text: "Rejected. The organiser's owners will be emailed the reason and the organiser can resubmit.",
  },
  invalid: {
    tone: "problem",
    text: "That input was not accepted. A rejection needs a reason of 3 to 500 characters.",
  },
  mfa: {
    tone: "problem",
    text: "Decisions need an authenticator-verified superuser session. Set up two-step verification in your account security, or sign in again with your authenticator or a recovery code, then retry.",
  },
  "not-allowed": {
    tone: "problem",
    text: "Your account is not allowed to decide verifications. Only a superuser with two-step verification can; you can still read the queue and cases.",
  },
  "already-decided": {
    tone: "problem",
    text: "Someone already decided this organiser (or it is in a state that does not allow that decision). Nothing was changed; the case below is current.",
  },
  suspended: {
    tone: "problem",
    text: "The organisation is suspended, so it cannot be approved. Reactivate it under Organisations first.",
  },
  missing: {
    tone: "problem",
    text: "That verification case was not found.",
  },
  throttled: {
    tone: "problem",
    text: "Too many requests. Wait a moment and try again.",
  },
  failed: {
    tone: "problem",
    text: "The decision could not be completed and may not have been saved. Reload the page to see the current state before trying again.",
  },
};

export function moderationNoticeFor(
  code: string | undefined
): Notice | undefined {
  return code && Object.hasOwn(MODERATION_NOTICES, code)
    ? MODERATION_NOTICES[code as ModerationNoticeCode]
    : undefined;
}

/**
 * Map an API refusal to a notice. `known` is false when it should be reported
 * as an incident; expected refusals are not.
 */
export function moderationNoticeForError(
  status: number,
  detail: string
): { code: ModerationNoticeCode; known: boolean } {
  const known = (code: ModerationNoticeCode) => ({ code, known: true });
  const text = detail.toLowerCase();
  // 401 (ended session) is handled by the action before it gets here.
  if (status === 401) return known("not-allowed");
  if (status === 403) {
    if (
      text.includes("superuser_mfa_required") ||
      text.includes("two-step") ||
      text.includes("authenticator")
    ) {
      return known("mfa");
    }
    return known("not-allowed");
  }
  if (status === 404) return known("missing");
  if (status === 409) {
    if (text.includes("suspended")) return known("suspended");
    return known("already-decided");
  }
  if (status === 422 || status === 400) return known("invalid");
  if (status === 429) return known("throttled");
  return { code: "failed", known: false };
}

/** Plain-language history action; unknown actions are shown as recorded. */
export function historyActionLabel(action: string): string {
  const key = action.replace(ORGANISER_PREFIX, "");
  switch (key) {
    case "verify":
    case "verified":
      return "Approved";
    case "reject":
    case "rejected":
      return "Rejected";
    case "unverify":
    case "unverified":
      return "Approval withdrawn";
    case "resubmit":
    case "resubmitted":
      return "Resubmitted for review";
    default:
      return action;
  }
}
