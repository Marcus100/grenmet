"use server";

import {
  messageSchema,
  sessionLoginResponseSchema,
} from "@barrelsgd/api-client";
import { authApiFetch } from "@barrelsgd/auth/server";
import { getAuthConfig } from "@/lib/auth-config";
import { reportError } from "@/lib/report-error";
import { isAuthApiError, writeSessionCookie } from "@/lib/session";
import { type InviteState, MAX_CODE_LENGTH } from "./invite-state";

// Two steps on one form: `intent=send` emails a code to the invited address,
// `intent=accept` checks the code and opens the account session (ADR-0059 rule 1).
// The token travels in the POST body only and is never logged or reflected.

const TOKEN_MIN = 32;
const TOKEN_MAX = 256;
const SIX_DIGITS = /^\d{6}$/u;
const TWO_FACTOR_REQUIRED = /two-factor/iu;
const TOO_MANY = 429;
const SERVER_ERROR = 500;
const BAD_REQUEST = 400;

const INVALID_LINK =
  "This link is not valid. Open the link from your invitation email again.";
const TOO_MANY_MESSAGE =
  "Too many attempts. Wait a few minutes, then try again.";
const NOT_OPEN =
  "That code didn't work, or this invitation has ended. Check the code and try again, or ask the person who invited you for a new invitation.";
const UNAVAILABLE =
  "The sign-in service is unavailable right now. Try again in a moment.";
const SENT_NOTICE = "A new code was sent, if the invitation is still open.";
const CODE_TOO_LONG = "That code is too long. Check it and try again.";

function read(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function validToken(token: string): boolean {
  return token.length >= TOKEN_MIN && token.length <= TOKEN_MAX;
}

/** The same step, with a message. A failure never moves the person to another step. */
function keep(current: InviteState, error: string | null): InviteState {
  return { ...current, error, notice: null };
}

async function sendCode(
  token: string,
  current: InviteState
): Promise<InviteState> {
  if (!validToken(token)) return keep(current, INVALID_LINK);
  try {
    // The API answers the same way whether or not the token is open, so a
    // success here says nothing about the invitation.
    await authApiFetch(
      getAuthConfig(),
      "/auth/superuser-invitations/code",
      messageSchema,
      { body: { token }, method: "POST" }
    );
  } catch (error) {
    if (isAuthApiError(error) && error.status === TOO_MANY) {
      return keep(current, TOO_MANY_MESSAGE);
    }
    reportError(error, "auth-superuser-invite");
    return keep(current, "We couldn't send a code. Try again in a moment.");
  }
  return {
    error: null,
    needsTotp: current.needsTotp,
    notice: SENT_NOTICE,
    step: "code",
  };
}

async function acceptInvitation(
  current: InviteState,
  token: string,
  code: string,
  totpCode: string
): Promise<InviteState> {
  if (!validToken(token)) return keep(current, INVALID_LINK);
  if (!SIX_DIGITS.test(code)) {
    return keep(current, "Enter the six-digit code we emailed you.");
  }
  if (totpCode.length > MAX_CODE_LENGTH) return keep(current, CODE_TOO_LONG);
  try {
    const session = await authApiFetch(
      getAuthConfig(),
      "/auth/superuser-invitations/accept",
      sessionLoginResponseSchema,
      { body: { token, code, totp_code: totpCode || null }, method: "POST" }
    );
    await writeSessionCookie(session.session_token, session.session_expires_at);
  } catch (error) {
    if (isAuthApiError(error) && error.status === TOO_MANY) {
      return keep(current, TOO_MANY_MESSAGE);
    }
    if (
      isAuthApiError(error) &&
      error.status === BAD_REQUEST &&
      TWO_FACTOR_REQUIRED.test(error.detail)
    ) {
      // This account has an authenticator: ask for its code on the same step.
      return {
        error: totpCode
          ? "That authenticator code was not accepted. Try the code your app shows now."
          : "Enter the code from your authenticator app as well.",
        needsTotp: true,
        notice: null,
        step: "code",
      };
    }
    if (isAuthApiError(error) && error.status < SERVER_ERROR) {
      return keep(current, NOT_OPEN);
    }
    reportError(error, "auth-superuser-invite");
    return keep(current, UNAVAILABLE);
  }
  return { error: null, needsTotp: false, notice: null, step: "done" };
}

/** The one action behind the invitation form; the hidden `intent` picks the step. */
export async function superuserInviteAction(
  previous: InviteState,
  formData: FormData
): Promise<InviteState> {
  const token = read(formData, "token");
  if (read(formData, "intent") === "accept") {
    return await acceptInvitation(
      previous,
      token,
      read(formData, "code"),
      read(formData, "totp_code")
    );
  }
  return await sendCode(token, previous);
}
