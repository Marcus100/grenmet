import "server-only";

import {
  clearSessionCookieOnResponse as _clearSessionCookieOnResponse,
  exchangeSessionForAccessToken as _exchangeSessionForAccessToken,
  logoutAllSessions as _logoutAllSessions,
  logoutSession as _logoutSession,
  readSessionCookie as _readSessionCookie,
} from "@grenmet/auth/server";
import type { NextResponse } from "next/server";
import { getAuthConfig } from "./auth-config";

export type {
  SessionAccessTokenResponse,
  SessionPublic,
  SessionUserPublic,
} from "@grenmet/auth";
export { AuthApiError, isAuthApiError } from "@grenmet/auth";

export function clearSessionCookieOnResponse(response: NextResponse): void {
  _clearSessionCookieOnResponse(getAuthConfig(), response);
}

export function readSessionCookie(): Promise<string | null> {
  return _readSessionCookie(getAuthConfig());
}

export function exchangeSessionForAccessToken(sessionToken: string) {
  return _exchangeSessionForAccessToken(getAuthConfig(), sessionToken);
}

export function logoutSession(sessionToken: string): Promise<void> {
  return _logoutSession(getAuthConfig(), sessionToken);
}

export function logoutAllSessions(sessionToken: string): Promise<void> {
  return _logoutAllSessions(getAuthConfig(), sessionToken);
}
