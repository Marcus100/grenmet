import {
  AuthApiError,
  isAuthApiError,
  type SessionAccessTokenResponse,
  type SessionLoginResponse,
} from "@grenmet/auth";
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

export type { SessionAccessTokenResponse, SessionLoginResponse };
export { AuthApiError, isAuthApiError };

// ---------------------------------------------------------------------------
// Config-bound wrappers — keep the auth-app call-sites free of boilerplate.
// ---------------------------------------------------------------------------

export async function createSession(input: {
  email: string;
  password: string;
  appName?: string | null;
  clientType?: string;
}): Promise<SessionLoginResponse> {
  return _createSession(getAuthConfig(), input);
}

export async function exchangeSessionForAccessToken(
  sessionToken: string,
): Promise<SessionAccessTokenResponse> {
  return _exchangeSessionForAccessToken(getAuthConfig(), sessionToken);
}

export async function refreshSession(
  sessionToken: string,
): Promise<SessionLoginResponse> {
  return _refreshSession(getAuthConfig(), sessionToken);
}

export async function logoutSession(sessionToken: string): Promise<void> {
  return _logoutSession(getAuthConfig(), sessionToken);
}

export async function logoutAllSessions(sessionToken: string): Promise<void> {
  return _logoutAllSessions(getAuthConfig(), sessionToken);
}

// ---------------------------------------------------------------------------
// Cookie helpers
// ---------------------------------------------------------------------------

export async function readSessionCookie(): Promise<string | null> {
  return _readSessionCookie(getAuthConfig());
}

export async function writeSessionCookie(
  sessionToken: string,
  sessionExpiresAt: string,
): Promise<void> {
  return _writeSessionCookie(getAuthConfig(), sessionToken, sessionExpiresAt);
}

export async function clearSessionCookie(): Promise<void> {
  return _clearSessionCookie(getAuthConfig());
}
