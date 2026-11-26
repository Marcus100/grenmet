"use server";

import {
  messageSchema,
  sessionLoginResponseSchema,
} from "@barrelsgd/api-client";
import { authApiFetch } from "@barrelsgd/auth/server";
import { redirect } from "next/navigation";
import type { EmailCodeState } from "@/app/actions-types";
import { getAuthConfig } from "@/lib/auth-config";
import { EMAIL_CODE_RESEND_SECONDS } from "@/lib/email-code";
import { rememberJoinIntent } from "@/lib/join-intent";
import { reportError } from "@/lib/report-error";
import { getSafeReturnTo } from "@/lib/return-to";
import { isAuthApiError, writeSessionCookie } from "@/lib/session";

const MFA_REQUIRED = "Two-factor authentication code required or invalid";
// The API's generic Turnstile refusal (src/turnstile.py), the same for every address.
const VERIFICATION_FAILED = "Verification failed";

function read(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

/** Ask the API to email a code; the Turnstile token goes along when the page has one. */
async function sendCode(
  email: string,
  turnstileToken: string,
  previous: EmailCodeState
): Promise<EmailCodeState> {
  try {
    await authApiFetch(
      getAuthConfig(),
      "/auth/email-code/start",
      messageSchema,
      {
        body: turnstileToken
          ? { email, turnstile_token: turnstileToken }
          : { email },
        method: "POST",
      }
    );
  } catch (error) {
    if (isAuthApiError(error) && error.detail === VERIFICATION_FAILED) {
      return {
        email,
        error:
          "We couldn't confirm this request came from a person. Try again.",
        step: previous.step,
      };
    }
    reportError(error, "auth-email-code");
    return {
      email,
      error: "We couldn't send a code. Try again in a moment.",
      step: "email",
    };
  }
  return {
    email,
    error: null,
    resendAfterSeconds: EMAIL_CODE_RESEND_SECONDS,
    step: "code",
  };
}

/**
 * Signing in for an app is the choice to use it: /continue may then join an
 * instant-join app without a second question (lib/join-intent.ts). The sign-in
 * has already succeeded, so a failure here is reported and costs only the
 * skipped question, never the sign-in.
 */
async function markJoinIntent(
  returnTo: string | null,
  sessionToken: string
): Promise<void> {
  try {
    await rememberJoinIntent(returnTo, sessionToken);
  } catch (error) {
    reportError(error, "auth-join-intent");
  }
}

/** Sign in to the Barrels account with an emailed code (ADR-0017). */
export async function emailCodeAction(
  previous: EmailCodeState,
  formData: FormData
): Promise<EmailCodeState> {
  const email = read(formData, "email").toLowerCase();
  const code = read(formData, "code");
  const totpCode = read(formData, "totp_code");
  const returnTo = getSafeReturnTo(read(formData, "returnTo"));
  if (!email) {
    return { email, error: "Enter your email address.", step: "email" };
  }

  if (!code) {
    return await sendCode(email, read(formData, "turnstile_token"), previous);
  }

  try {
    const session = await authApiFetch(
      getAuthConfig(),
      "/auth/email-code/verify",
      sessionLoginResponseSchema,
      {
        body: { email, code, totp_code: totpCode || null },
        method: "POST",
      }
    );
    await writeSessionCookie(session.session_token, session.session_expires_at);
    await markJoinIntent(returnTo, session.session_token);
  } catch (error) {
    if (isAuthApiError(error) && error.detail === MFA_REQUIRED) {
      return {
        email,
        error: totpCode ? "That authenticator code was not accepted." : null,
        step: "mfa",
      };
    }
    if (isAuthApiError(error) && error.status < 500) {
      return { email, error: error.detail, step: "code" };
    }
    reportError(error, "auth-email-code");
    return {
      email,
      error:
        "The auth service is unavailable right now. Try again in a moment.",
      step: previous.step,
    };
  }
  redirect(returnTo ?? "/");
}
