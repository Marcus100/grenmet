"use server";

import { messageSchema, userPublicSchema } from "@barrelsgd/api-client";
import { authApiFetch } from "@barrelsgd/auth/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAuthConfig } from "@/lib/auth-config";
import { reportError } from "@/lib/report-error";
import { getRequestedAppName, getSafeReturnTo } from "@/lib/return-to";
import type { SessionLoginResponse } from "@/lib/session";
import {
  clearSessionCookie,
  createSession,
  exchangeSessionForAccessToken,
  isAuthApiError,
  logoutAllSessions,
  logoutSession,
  readSessionCookie,
  requestPasswordRecovery,
  resetPassword,
  writeSessionCookie,
} from "@/lib/session";
import type {
  EmailChangeState,
  ForgotPasswordState,
  NamePromptState,
  ResetPasswordState,
  SignInState,
} from "./actions-types";

function readString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

const MFA_REQUIRED_DETAIL =
  "Two-factor authentication code required or invalid";

function describeSignInError(
  error: unknown,
  email: string,
  totpCode: string
): SignInState {
  if (!isAuthApiError(error)) {
    return { error: "Unable to reach the auth service.", email, next: null };
  }
  if (error.detail === MFA_REQUIRED_DETAIL) {
    // The first attempt without a code is the prompt, not a failure.
    return {
      error: totpCode
        ? "That code was not accepted. Try the current code from your authenticator."
        : null,
      email,
      next: "mfa",
    };
  }
  return {
    error: error.detail,
    email,
    next: null,
  };
}

export async function signInAction(
  _previousState: SignInState,
  formData: FormData
): Promise<SignInState> {
  const email = readString(formData, "email");
  const password = readString(formData, "password");
  const returnTo = getSafeReturnTo(readString(formData, "returnTo"));
  const appName = getRequestedAppName(
    readString(formData, "appName"),
    returnTo
  );

  if (!(email && password)) {
    return {
      error: "Email and password are required.",
      email,
      next: null,
    };
  }

  const totpCode = readString(formData, "totp_code");
  let response: SessionLoginResponse;
  try {
    response = await createSession({
      email,
      password,
      totpCode,
      appName,
    });
  } catch (error) {
    reportError(error, "auth-sign-in");
    return describeSignInError(error, email, totpCode);
  }

  try {
    await writeSessionCookie(
      response.session_token,
      response.session_expires_at
    );
  } catch (error) {
    reportError(error, "auth-session");
    return {
      error: "Unable to establish your browser session. Please try again.",
      email,
      next: null,
    };
  }

  redirect(returnTo ?? "/");
}

async function endSession({
  allSessions,
  formData,
}: {
  allSessions: boolean;
  formData: FormData;
}): Promise<never> {
  const returnTo = getSafeReturnTo(readString(formData, "returnTo"));
  const sessionToken = await readSessionCookie();

  if (sessionToken) {
    try {
      if (allSessions) {
        await logoutAllSessions(sessionToken);
      } else {
        await logoutSession(sessionToken);
      }
    } catch {
      // Clearing the local cookie still signs the browser out even if the upstream
      // session is already gone.
    }
  }

  await clearSessionCookie();
  redirect(returnTo ?? "/");
}

/** Signing out of the Barrels account signs out of every app (ADR-0017). */
export async function signOutAction(formData: FormData): Promise<never> {
  return await endSession({ allSessions: true, formData });
}

export async function signOutEverywhereAction(
  formData: FormData
): Promise<never> {
  return await endSession({ allSessions: true, formData });
}

export async function forgotPasswordAction(
  _previousState: ForgotPasswordState,
  formData: FormData
): Promise<ForgotPasswordState> {
  const email = readString(formData, "email");

  if (!email) {
    return { email, error: "Email is required.", success: false };
  }

  try {
    await requestPasswordRecovery(email);
    // Always show success — avoids leaking whether the address is registered.
    return { email, error: null, success: true };
  } catch (error) {
    reportError(error, "auth-forgot-password");
    return {
      email,
      error: isAuthApiError(error)
        ? error.detail
        : "Unable to reach the auth service.",
      success: false,
    };
  }
}

export async function resetPasswordAction(
  _previousState: ResetPasswordState,
  formData: FormData
): Promise<ResetPasswordState> {
  const token = readString(formData, "token");
  const newPassword = readString(formData, "new_password");
  const confirmPassword = readString(formData, "confirm_password");

  if (!token) {
    return {
      error: "Reset token is missing. Request a new link.",
      success: false,
    };
  }

  if (!newPassword) {
    return { error: "New password is required.", success: false };
  }

  if (newPassword !== confirmPassword) {
    return { error: "Passwords do not match.", success: false };
  }

  try {
    await resetPassword({ token, newPassword });
    return { error: null, success: true };
  } catch (error) {
    reportError(error, "auth-reset-password");
    return {
      error: isAuthApiError(error)
        ? error.detail
        : "Unable to reach the auth service.",
      success: false,
    };
  }
}

/** "I work at GAA or GMS": put this account in the staff approval queue. */
export async function requestStaffAccessAction(): Promise<void> {
  const sessionToken = await readSessionCookie();
  if (!sessionToken) redirect("/");
  const { access_token: accessToken } =
    await exchangeSessionForAccessToken(sessionToken);
  await authApiFetch(
    getAuthConfig(),
    "/auth/users/me/staff-access-request",
    userPublicSchema,
    { accessToken, method: "POST" }
  );
  revalidatePath("/");
}

/** Optional, after sign-in: add the name that sign-up no longer asks for. */
export async function saveNameAction(
  _previousState: NamePromptState,
  formData: FormData
): Promise<NamePromptState> {
  const firstName = readString(formData, "first_name");
  const lastName = readString(formData, "last_name");
  if (!(firstName && lastName)) {
    return {
      error: "Enter your first and last name, or skip this.",
      saved: false,
    };
  }
  if (firstName.length > 100 || lastName.length > 100) {
    return { error: "Names can be up to 100 characters.", saved: false };
  }
  const sessionToken = await readSessionCookie();
  if (!sessionToken) redirect("/");
  try {
    const { access_token: accessToken } =
      await exchangeSessionForAccessToken(sessionToken);
    await authApiFetch(getAuthConfig(), "/auth/users/me", userPublicSchema, {
      accessToken,
      body: { first_name: firstName, last_name: lastName },
      method: "PATCH",
    });
  } catch (error) {
    reportError(error, "auth-save-name");
    return {
      error: isAuthApiError(error)
        ? error.detail
        : "Unable to save your name. Try again.",
      saved: false,
    };
  }
  revalidatePath("/");
  return { error: null, saved: true };
}

const EMAIL_PROOF_PREFIX = "email_change_proof_required: ";

/** Changing the sign-in email needs proof (#1535): the current password, or for an
 * account with no password a code emailed to the current address. The server
 * message begins with a stable code; show the reason after it. */
function describeEmailChangeError(error: unknown): string {
  if (!isAuthApiError(error)) return "Unable to change your email. Try again.";
  if (error.detail.startsWith(EMAIL_PROOF_PREFIX)) {
    return error.detail.slice(EMAIL_PROOF_PREFIX.length);
  }
  return error.detail;
}

/** Account with no password: email a code to the current address first. */
export async function sendEmailChangeCodeAction(): Promise<EmailChangeState> {
  const sessionToken = await readSessionCookie();
  if (!sessionToken) redirect("/");
  try {
    const { access_token: accessToken } =
      await exchangeSessionForAccessToken(sessionToken);
    await authApiFetch(
      getAuthConfig(),
      "/auth/users/me/email-change/code",
      messageSchema,
      { accessToken, method: "POST" }
    );
  } catch (error) {
    reportError(error, "auth-email-change-code");
    return {
      error: isAuthApiError(error)
        ? error.detail
        : "Unable to send a code. Try again.",
      codeSent: false,
      saved: false,
    };
  }
  return { error: null, codeSent: true, saved: false };
}

/** Change the sign-in email. Send `current_password`, or `email_code` for an account
 * with no password. Every session is signed out on success, so the browser cookie is
 * cleared here too. */
export async function changeEmailAction(
  _previousState: EmailChangeState,
  formData: FormData
): Promise<EmailChangeState> {
  const email = readString(formData, "email");
  const currentPassword = readString(formData, "current_password");
  const emailCode = readString(formData, "email_code");
  if (!email) {
    return {
      error: "Enter your new email address.",
      codeSent: false,
      saved: false,
    };
  }
  if (!(currentPassword || emailCode)) {
    return {
      error: "Enter your current password to change your email address.",
      codeSent: false,
      saved: false,
    };
  }
  const body: Record<string, string> = { email };
  if (currentPassword) body.current_password = currentPassword;
  if (emailCode) body.email_code = emailCode;

  const sessionToken = await readSessionCookie();
  if (!sessionToken) redirect("/");
  try {
    const { access_token: accessToken } =
      await exchangeSessionForAccessToken(sessionToken);
    await authApiFetch(getAuthConfig(), "/auth/users/me", userPublicSchema, {
      accessToken,
      body,
      method: "PATCH",
    });
  } catch (error) {
    reportError(error, "auth-change-email");
    return {
      error: describeEmailChangeError(error),
      codeSent: false,
      saved: false,
    };
  }
  await clearSessionCookie();
  return { error: null, codeSent: false, saved: true };
}
