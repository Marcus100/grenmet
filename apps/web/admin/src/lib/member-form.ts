/**
 * Validation and fixed notice codes for superuser membership management on the
 * organisation page. The Zod schemas come from the generated client, so the
 * reason length (10 to 500) and role list always match FastAPI; FastAPI still
 * re-validates everything.
 */

import {
  platformMemberAddSchema,
  platformMemberRemoveSchema,
  platformMemberRoleUpdateSchema,
} from "@barrelsgd/api-client";
import { z } from "zod";
import type { Parsed } from "@/lib/organisation-form";

export const MEMBER_ROLES = ["member", "admin", "owner"] as const;

const MEMBERSHIP_ID = /^[A-Za-z0-9_-]{1,100}$/;
const UUID = z.uuid();

export function parseMembershipId(value: string): string | undefined {
  return MEMBERSHIP_ID.test(value) ? value : undefined;
}

function text(data: FormData, key: string): string {
  const value = data.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export type MemberAdd = z.infer<typeof platformMemberAddSchema>;

/** One field "user" holds an email or an account id; the other stays unset. */
export function parseMemberAdd(data: FormData): Parsed<MemberAdd> {
  const user = text(data, "user");
  const target = UUID.safeParse(user).success
    ? { user_id: user }
    : { email: user };
  const result = platformMemberAddSchema.safeParse({
    ...target,
    role: text(data, "role") || "member",
    reason: text(data, "reason"),
  });
  return result.success ? { ok: true, value: result.data } : { ok: false };
}

export function parseMemberRole(
  data: FormData
): Parsed<z.infer<typeof platformMemberRoleUpdateSchema>> {
  const result = platformMemberRoleUpdateSchema.safeParse({
    role: text(data, "role"),
    reason: text(data, "reason"),
  });
  return result.success ? { ok: true, value: result.data } : { ok: false };
}

export function parseMemberRemove(
  data: FormData
): Parsed<z.infer<typeof platformMemberRemoveSchema>> {
  const result = platformMemberRemoveSchema.safeParse({
    reason: text(data, "reason"),
  });
  return result.success ? { ok: true, value: result.data } : { ok: false };
}

export type MemberAction = "add" | "change" | "remove";

export const MEMBER_NOTICES = {
  "member-added": { tone: "ok", text: "Member added. The use was recorded." },
  "member-changed": {
    tone: "ok",
    text: "Role changed. The use was recorded.",
  },
  "member-removed": {
    tone: "ok",
    text: "Member removed. The use was recorded.",
  },
  "member-invalid": {
    tone: "problem",
    text: "That input was not accepted. Give an email or account id, a role, and a reason of 10 to 500 characters.",
  },
  "member-mfa": {
    tone: "problem",
    text: "Superuser powers need two-step verification. Set up an authenticator app in your account security, then sign in with it and try again.",
  },
  "member-unverified": {
    tone: "problem",
    text: "That person has not verified their email, so they cannot become an admin or owner. Run Activate account for them first (GAA Admin, Users), or add them as a member.",
  },
  "member-forbidden": {
    tone: "problem",
    text: "You are not allowed to do this. Only superusers can manage any organisation's members.",
  },
  "member-missing": {
    tone: "problem",
    text: "That account, organisation or membership was not found. Nothing was changed.",
  },
  "member-already": {
    tone: "problem",
    text: "Nothing was changed: that person is already an active member, or the account is inactive.",
  },
  "member-last-owner": {
    tone: "problem",
    text: "Nothing was changed: this would leave the organisation without an owner.",
  },
  "member-throttled": {
    tone: "problem",
    text: "Too many attempts. Wait a minute and try again.",
  },
  "member-failed": {
    tone: "problem",
    text: "The change could not be saved. Nothing was changed.",
  },
} as const;

export type MemberNoticeCode = keyof typeof MEMBER_NOTICES;

export function memberNoticeFor(
  code: string | undefined
): (typeof MEMBER_NOTICES)[MemberNoticeCode] | undefined {
  return code && code in MEMBER_NOTICES
    ? MEMBER_NOTICES[code as MemberNoticeCode]
    : undefined;
}

/** Map an API failure to a notice; `known` is false when it should be reported. */
export function memberNoticeForError(
  action: MemberAction,
  status: number,
  detail: string
): { code: MemberNoticeCode; known: boolean } {
  const known = (code: MemberNoticeCode) => ({ code, known: true });
  if (status === 403) {
    if (detail.includes("superuser_mfa_required")) return known("member-mfa");
    if (detail.includes("email_verification_required")) {
      return known("member-unverified");
    }
    return known("member-forbidden");
  }
  if (status === 404) return known("member-missing");
  if (status === 409) {
    return known(action === "add" ? "member-already" : "member-last-owner");
  }
  if (status === 422 || status === 400) return known("member-invalid");
  if (status === 429) return known("member-throttled");
  return { code: "member-failed", known: false };
}
