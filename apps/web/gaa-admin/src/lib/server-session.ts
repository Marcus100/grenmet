import "server-only";

import {
  authApiFetch as _authApiFetch,
  clearSessionCookieOnResponse as _clearSessionCookieOnResponse,
  exchangeSessionForAccessToken as _exchangeSessionForAccessToken,
  logoutAllSessions as _logoutAllSessions,
  logoutSession as _logoutSession,
  readSessionCookie as _readSessionCookie,
} from "@barrelsgd/auth/server";
import type { NextResponse } from "next/server";
import { cache } from "react";
import { getAuthConfig } from "@/lib/auth-config";

export type {
  SessionAccessTokenResponse,
  SessionPublic,
  SessionUserPublic,
} from "@barrelsgd/auth";
export { AuthApiError, isAuthApiError } from "@barrelsgd/auth";

export function clearSessionCookieOnResponse(response: NextResponse): void {
  _clearSessionCookieOnResponse(getAuthConfig(), response);
}

export const readSessionCookie = cache(
  (): Promise<string | null> => _readSessionCookie(getAuthConfig())
);

export function authApiFetch<T>(
  path: string,
  init: Omit<RequestInit, "body" | "headers"> & { body?: unknown } = {}
): Promise<T> {
  return _authApiFetch<T>(getAuthConfig(), path, init);
}

export const exchangeSessionForAccessToken = cache((sessionToken: string) =>
  _exchangeSessionForAccessToken(getAuthConfig(), sessionToken)
);

export function logoutSession(sessionToken: string): Promise<void> {
  return _logoutSession(getAuthConfig(), sessionToken);
}

export function logoutAllSessions(sessionToken: string): Promise<void> {
  return _logoutAllSessions(getAuthConfig(), sessionToken);
}
