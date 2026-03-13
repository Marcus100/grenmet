import "server-only";

import { NextResponse } from "next/server";
import { getAuthConfig } from "./auth-config";
import {
  readSessionCookie as _readSessionCookie,
  clearSessionCookieOnResponse as _clearSessionCookieOnResponse,
  exchangeSessionForAccessToken as _exchangeSessionForAccessToken,
  logoutSession as _logoutSession,
  logoutAllSessions as _logoutAllSessions,
} from "@grenmet/auth/server";

export type {
  SessionAccessTokenResponse,
  SessionUserPublic,
  SessionPublic,
} from "@grenmet/auth";
export { AuthApiError, isAuthApiError } from "@grenmet/auth";

export function clearSessionCookieOnResponse(response: NextResponse): void {
  _clearSessionCookieOnResponse(getAuthConfig(), response);
}

export async function readSessionCookie(): Promise<string | null> {
  return _readSessionCookie(getAuthConfig());
}

export async function exchangeSessionForAccessToken(sessionToken: string) {
  return _exchangeSessionForAccessToken(getAuthConfig(), sessionToken);
}

export async function logoutSession(sessionToken: string): Promise<void> {
  return _logoutSession(getAuthConfig(), sessionToken);
}

export async function logoutAllSessions(sessionToken: string): Promise<void> {
  return _logoutAllSessions(getAuthConfig(), sessionToken);
}
