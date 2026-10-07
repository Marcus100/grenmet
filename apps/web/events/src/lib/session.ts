import "server-only";

import { isAuthApiError } from "@barrelsgd/auth";
import {
  clearSessionCookie,
  exchangeSessionForAccessToken,
  readSessionCookie,
} from "@barrelsgd/auth/server";
import { cache } from "react";
import { authConfig } from "@/lib/auth-config";

export interface EventsSession {
  readonly accessToken: string;
  readonly email: string;
  readonly fullName: string;
  readonly userId: string;
}

/**
 * The signed-in Events member, or null for a visitor. An expired or revoked
 * session (401/403) reads as signed out; other failures propagate so a broken
 * auth API is reported rather than silently treated as "logged out".
 */
export const getSession = cache(async (): Promise<EventsSession | null> => {
  const sessionToken = await readSessionCookie(authConfig);
  if (!sessionToken) {
    return null;
  }
  try {
    const result = await exchangeSessionForAccessToken(
      authConfig,
      sessionToken
    );
    return {
      accessToken: result.access_token,
      email: result.user.email,
      fullName: result.user.full_name,
      userId: result.user.id,
    };
  } catch (error) {
    if (
      isAuthApiError(error) &&
      (error.status === 401 || error.status === 403)
    ) {
      return null;
    }
    throw error;
  }
});

/** Server Actions and route handlers call this to drop a dead cookie. */
export async function dropSessionCookie(): Promise<void> {
  await clearSessionCookie(authConfig);
}
