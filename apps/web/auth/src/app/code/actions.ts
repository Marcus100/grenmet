"use server";

import {
  messageSchema,
  sessionLoginResponseSchema,
} from "@barrelsgd/api-client";
import { authApiFetch } from "@barrelsgd/auth/server";
import { redirect } from "next/navigation";
import type { EmailCodeState } from "@/app/actions-types";
import { getAuthConfig } from "@/lib/auth-config";
import { reportError } from "@/lib/report-error";
import { getSafeReturnTo } from "@/lib/return-to";
import { isAuthApiError, writeSessionCookie } from "@/lib/session";

const MFA_REQUIRED = "Two-factor authentication code required or invalid";

function read(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
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
  if (!email) return { ...previous, error: "Enter your email address." };

  if (!code) {
    try {
      await authApiFetch(
        getAuthConfig(),
        "/auth/modern/email-code/start",
        messageSchema,
        { body: { email }, method: "POST" }
      );
    } catch (error) {
      reportError(error, "auth-email-code");
      return {
        email,
        error: "We couldn't send a code. Try again in a moment.",
        step: "email",
      };
    }
    return { email, error: null, step: "code" };
  }

  try {
    const session = await authApiFetch(
      getAuthConfig(),
      "/auth/modern/email-code/verify",
      sessionLoginResponseSchema,
      {
        body: { email, code, totp_code: totpCode || null },
        method: "POST",
      }
    );
    await writeSessionCookie(session.session_token, session.session_expires_at);
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
