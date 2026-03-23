import type {
  SessionAccessTokenResponse,
  SessionLoginResponse,
} from "@grenmet/auth";
export type { SessionAccessTokenResponse, SessionLoginResponse };
export { AuthApiError, isAuthApiError } from "@grenmet/auth";

import {
  clearSessionCookie as _clearSessionCookie,
  createSession as _createSession,
  exchangeSessionForAccessToken as _exchangeSessionForAccessToken,
  logoutAllSessions as _logoutAllSessions,
  logoutSession as _logoutSession,
  readSessionCookie as _readSessionCookie,
  refreshSession as _refreshSession,
  writeSessionCookie as _writeSessionCookie,
} from "@grenmet/auth/server";
import { getAuthConfig } from "./auth-config";

// ---------------------------------------------------------------------------
// Config-bound wrappers — keep the auth-app call-sites free of boilerplate.
// ---------------------------------------------------------------------------

export function createSession(input: {
  email: string;
  password: string;
  appName?: string | null;
  clientType?: string;
}): Promise<SessionLoginResponse> {
  return _createSession(getAuthConfig(), input);
}

export function exchangeSessionForAccessToken(
  sessionToken: string
): Promise<SessionAccessTokenResponse> {
  return _exchangeSessionForAccessToken(getAuthConfig(), sessionToken);
}

export function refreshSession(
  sessionToken: string
): Promise<SessionLoginResponse> {
  return _refreshSession(getAuthConfig(), sessionToken);
}

export function logoutSession(sessionToken: string): Promise<void> {
  return _logoutSession(getAuthConfig(), sessionToken);
}

export function logoutAllSessions(sessionToken: string): Promise<void> {
  return _logoutAllSessions(getAuthConfig(), sessionToken);
}

// ---------------------------------------------------------------------------
// Cookie helpers
// ---------------------------------------------------------------------------

export function readSessionCookie(): Promise<string | null> {
  return _readSessionCookie(getAuthConfig());
}

export function writeSessionCookie(
  sessionToken: string,
  sessionExpiresAt: string
): Promise<void> {
  return _writeSessionCookie(getAuthConfig(), sessionToken, sessionExpiresAt);
}

export function clearSessionCookie(): Promise<void> {
  return _clearSessionCookie(getAuthConfig());
}
