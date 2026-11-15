"use server";

import { isAuthApiError } from "@barrelsgd/auth";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { reportError } from "@/lib/report-error";
import { requireGate } from "@/lib/staff-gate";
import {
  FORBIDDEN_MESSAGES,
  forbiddenKind,
  INVITED_NOTICE,
  type InviteFormValues,
  isInvitationId,
  parseSuperuserInvite,
} from "@/lib/superuser-invitation-form";
import {
  createSuperuserInvitation,
  revokeSuperuserInvitation,
} from "@/lib/superuser-invitations-api";

// Validate, proxy to FastAPI (which owns the rules, the mail and the audit) and either
// return the outcome to the form or redirect with a fixed notice code. The reason is
// sent once and never echoed back in a URL.

export interface InviteFormState {
  /** Shown after a refusal. */
  message: string | null;
  /** Shown after a successful invitation. */
  notice: string | null;
  /** Bumped on success so the fields are remounted empty. */
  resetKey: number;
  values: InviteFormValues;
}

const UNAUTHORIZED = 401;
const FORBIDDEN = 403;
const NOT_FOUND = 404;
const CONFLICT = 409;
const BAD_REQUEST = 400;
const UNPROCESSABLE = 422;
const TOO_MANY = 429;
const SERVER_ERROR = 500;

async function staffToken(): Promise<string> {
  const gate = await requireGate("/superusers");
  if (gate.status !== "staff") redirect("/");
  return gate.accessToken;
}

function done(code: string): never {
  revalidatePath("/superusers");
  redirect(`/superusers?notice=${code}`);
}

/** A readable refusal for the invite form. Fixed text only; the API's detail is not shown. */
function refusal(status: number, detail: string): string {
  if (status === FORBIDDEN) return FORBIDDEN_MESSAGES[forbiddenKind(detail)];
  if (status === BAD_REQUEST) {
    return "This address cannot be invited. It may belong to an inactive or deleted account.";
  }
  if (status === UNPROCESSABLE) {
    return "Check the email address and the reason (10 to 500 characters).";
  }
  if (status === TOO_MANY) {
    return "You have sent too many invitations. Try again later.";
  }
  if (status === CONFLICT) {
    return "An invitation for this address is being sent. Try again in a moment.";
  }
  return "The invitation was not sent. Nothing was changed.";
}

export async function inviteSuperuserAction(
  previous: InviteFormState,
  formData: FormData
): Promise<InviteFormState> {
  const parsed = parseSuperuserInvite(formData);
  if (!parsed.ok) {
    return {
      ...previous,
      message: parsed.message,
      notice: null,
      values: parsed.values,
    };
  }

  const token = await staffToken();
  try {
    await createSuperuserInvitation(token, parsed.value);
  } catch (error) {
    if (!isAuthApiError(error)) throw error;
    if (error.status === UNAUTHORIZED) redirect("/signin?sign_in=expired");
    // Refusals are expected outcomes; only a server fault is reported.
    if (error.status >= SERVER_ERROR) reportError(error, "admin-superusers");
    return {
      ...previous,
      message: refusal(error.status, error.detail),
      notice: null,
      values: parsed.values,
    };
  }
  return {
    message: null,
    notice: INVITED_NOTICE,
    resetKey: previous.resetKey + 1,
    values: { email: "", reason: "" },
  };
}

export async function revokeSuperuserInvitationAction(
  formData: FormData
): Promise<never> {
  const token = await staffToken();
  const invitationId = String(formData.get("invitation_id") ?? "");
  if (!isInvitationId(invitationId)) return done("not-found");
  try {
    await revokeSuperuserInvitation(token, invitationId);
  } catch (error) {
    if (!isAuthApiError(error)) throw error;
    if (error.status === UNAUTHORIZED) redirect("/signin?sign_in=expired");
    if (error.status === NOT_FOUND) return done("not-found");
    if (error.status === CONFLICT) return done("already-closed");
    if (error.status === FORBIDDEN) {
      return done(forbiddenKind(error.detail));
    }
    reportError(error, "admin-superusers");
    return done("revoke-failed");
  }
  return done("revoked");
}
