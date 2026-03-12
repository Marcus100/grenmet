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
  writeSessionCookie,
} from "@/lib/session";
import type { SignInState } from "./actions-types";

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
