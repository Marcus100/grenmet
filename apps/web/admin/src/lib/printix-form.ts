/**
 * Validation and fixed notice codes for Printix onboarding on the organisation
 * page. Zod schemas come from the generated client, so the reason length and the
 * access values always match FastAPI; FastAPI still re-validates everything.
 */

import {
  printixMemberAccessUpdateSchema,
  printixMemberAddSchema,
} from "@barrelsgd/api-client";
import { z } from "zod";
import type { Parsed } from "@/lib/organisation-form";

export const PRINTIX_ACCESS_LABELS = {
  none: "No Printix access",
  gate_lead: "Gate lead (gate QR codes)",
  organiser: "Organiser (events, tickets, gate QR codes)",
} as const;

export type PrintixAccessValue = keyof typeof PRINTIX_ACCESS_LABELS;

function text(data: FormData, key: string): string {
  const value = data.get(key);
  return typeof value === "string" ? value.trim() : "";
}

const UUID = z.uuid();

export function parsePrintixAccess(
  data: FormData
): Parsed<z.infer<typeof printixMemberAccessUpdateSchema>> {
  const result = printixMemberAccessUpdateSchema.safeParse({
    access: text(data, "access"),
    reason: text(data, "reason"),
  });
  return result.success ? { ok: true, value: result.data } : { ok: false };
}

/** The add form only offers gate lead and organiser; "none" is not an add. */
export function parsePrintixAdd(
  data: FormData
): Parsed<z.infer<typeof printixMemberAddSchema>> {
  const user = text(data, "user");
  const target = UUID.safeParse(user).success
    ? { user_id: user }
    : { email: user };
  const access = text(data, "access");
  if (access === "none") return { ok: false };
  const result = printixMemberAddSchema.safeParse({
    ...target,
    access,
    reason: text(data, "reason"),
  });
  return result.success ? { ok: true, value: result.data } : { ok: false };
}

export const PRINTIX_NOTICES = {
  "printix-added": {
    tone: "ok",
    text: "Person added with Printix access. Tell them to add an authenticator in their Barrels account, then sign in at scan.barrels.gd/organiser. The use was recorded.",
  },
  "printix-changed": {
    tone: "ok",
    text: "Printix access changed. The use was recorded.",
  },
  "printix-invalid": {
    tone: "problem",
    text: "That input was not accepted. Give an email or account id, an access level, and a reason of 10 to 500 characters.",
  },
  "printix-mfa": {
    tone: "problem",
    text: "Superuser powers need two-step verification. Set up an authenticator app in your account security, then sign in with it and try again.",
  },
  "printix-no-account": {
    tone: "problem",
    text: "No Barrels account has that email. Ask the person to create a Barrels account first, then add them here. Nothing was changed.",
  },
  "printix-not-entitled": {
    tone: "problem",
    text: "Printix is not turned on for this organisation. Switch it on under App access first. Nothing was changed.",
  },
  "printix-already": {
    tone: "problem",
    text: "That person is already a member. Change their Printix access in the table instead. Nothing was changed.",
  },
  "printix-owner": {
    tone: "problem",
    text: "Owners and admins already hold every Printix permission through their role. Change their role to take it away. Nothing was changed.",
  },
  "printix-missing": {
    tone: "problem",
    text: "That account, organisation or membership was not found. Nothing was changed.",
  },
  "printix-throttled": {
    tone: "problem",
    text: "Too many attempts. Wait a minute and try again.",
  },
  "printix-failed": {
    tone: "problem",
    text: "The change could not be saved. Nothing was changed.",
  },
} as const;

export type PrintixNoticeCode = keyof typeof PRINTIX_NOTICES;

export function printixNoticeFor(
  code: string | undefined
): (typeof PRINTIX_NOTICES)[PrintixNoticeCode] | undefined {
  return code && Object.hasOwn(PRINTIX_NOTICES, code)
    ? PRINTIX_NOTICES[code as PrintixNoticeCode]
    : undefined;
}

export type PrintixAction = "add" | "set";

/** Map an API failure to a notice; `known` is false when it should be reported. */
export function printixNoticeForError(
  action: PrintixAction,
  status: number,
  detail: string
): { code: PrintixNoticeCode; known: boolean } {
  const known = (code: PrintixNoticeCode) => ({ code, known: true });
  if (status === 403) {
    if (detail.includes("superuser_mfa_required")) return known("printix-mfa");
    return { code: "printix-failed", known: false };
  }
  if (status === 404) {
    return known(
      action === "add" && detail.includes("Account not found")
        ? "printix-no-account"
        : "printix-missing"
    );
  }
  if (status === 409) {
    if (detail.includes("Turn on Printix"))
      return known("printix-not-entitled");
    if (detail.includes("Owners and admins")) return known("printix-owner");
    return known(action === "add" ? "printix-already" : "printix-failed");
  }
  if (status === 422 || status === 400) return known("printix-invalid");
  if (status === 429) return known("printix-throttled");
  return { code: "printix-failed", known: false };
}
