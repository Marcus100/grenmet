"use server";

import { redirect } from "next/navigation";
import { getRequestedAppName, getSafeReturnTo } from "@/lib/return-to";
import {
  clearSessionCookie,
  createSession,
  isAuthApiError,
  logoutAllSessions,
  logoutSession,
  readSessionCookie,
  refreshSession,
  requestPasswordRecovery,
  resetPassword,
  signUp,
  writeSessionCookie,
} from "@/lib/session";
import type {
  ForgotPasswordState,
  ResetPasswordState,
  SignInState,
  SignUpState,
} from "./actions-types";

function readString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
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
    };
  }

  try {
    const response = await createSession({
      email,
      password,
      appName,
    });
    await writeSessionCookie(
      response.session_token,
      response.session_expires_at
    );
  } catch (error) {
    return {
      error: isAuthApiError(error)
        ? error.detail
        : "Unable to reach the auth service.",
      email,
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

export async function refreshSessionAction(): Promise<never> {
  const sessionToken = await readSessionCookie();

  if (!sessionToken) {
    redirect("/");
  }

  try {
    const response = await refreshSession(sessionToken);
    await writeSessionCookie(
      response.session_token,
      response.session_expires_at
    );
  } catch {
    await clearSessionCookie();
  }

  redirect("/");
}

export async function signOutAction(formData: FormData): Promise<never> {
  return await endSession({ allSessions: false, formData });
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
    return {
      error: isAuthApiError(error)
        ? error.detail
        : "Unable to reach the auth service.",
      success: false,
    };
  }
}

export async function signUpAction(
  _previousState: SignUpState,
  formData: FormData
): Promise<SignUpState> {
  const email = readString(formData, "email");
  const username = readString(formData, "username");
  const password = readString(formData, "password");
  const confirmPassword = readString(formData, "confirm_password");
  const firstName = readString(formData, "first_name");
  const lastName = readString(formData, "last_name");
  const middleName = readString(formData, "middle_name") || null;

  if (!(email && username && password && firstName && lastName)) {
    return {
      email,
      error: "All required fields must be filled in.",
      success: false,
    };
  }

  if (password !== confirmPassword) {
    return { email, error: "Passwords do not match.", success: false };
  }

  try {
    await signUp({
      email,
      username,
      password,
      firstName,
      lastName,
      middleName,
    });
    return { email, error: null, success: true };
  } catch (error) {
    return {
      email,
      error: isAuthApiError(error)
        ? error.detail
        : "Unable to reach the auth service.",
      success: false,
    };
  }
}
