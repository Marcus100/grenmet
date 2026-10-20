import "server-only";

import { isAuthApiError } from "@barrelsgd/auth";
import {
  exchangeSessionForAccessToken,
  readSessionCookie,
} from "@barrelsgd/auth/server";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getAuthConfig } from "@/lib/auth-config";

export interface StudioSession {
  accessToken: string;
  email: string;
  name: string;
}

/**
 * The signed-in person, decided on the server for every request. The cookie
 * check in `proxy.ts` is routing only; FastAPI re-checks the app-scoped token
 * on every call that needs it.
 */
export const getSession = cache(async (): Promise<StudioSession | null> => {
  const config = getAuthConfig();
  const sessionToken = await readSessionCookie(config);
  if (!sessionToken) return null;
  try {
    const { access_token, user } = await exchangeSessionForAccessToken(
      config,
      sessionToken
    );
    if (!user.is_active) return null;
    return {
      accessToken: access_token,
      email: user.email,
      name: user.full_name || user.email,
    };
  } catch (error) {
    // 401/403: the session ended or was revoked; signing in again explains why.
    if (
      isAuthApiError(error) &&
      (error.status === 401 || error.status === 403)
    ) {
      return null;
    }
    throw error;
  }
});

/** For pages: send signed-out visitors to sign in, hand back the session otherwise. */
export async function requireSession(
  returnTo = "/studio"
): Promise<StudioSession> {
  const session = await getSession();
  if (!session) {
    redirect(`/signin?${new URLSearchParams({ returnTo })}`);
  }
  return session;
}
