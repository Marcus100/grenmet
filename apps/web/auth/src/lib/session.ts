export type {
  MessageResponse,
  SessionAccessTokenResponse,
  SessionLoginResponse,
  Token,
  UserPublic,
} from "@grenmet/auth";

export { AuthApiError, isAuthApiError } from "@grenmet/auth";

import type {
  MessageResponse,
  SessionAccessTokenResponse,
  SessionLoginResponse,
  Token,
  UserPublic,
} from "@grenmet/auth";
import {
  clearSessionCookie as _clearSessionCookie,
  createSession as _createSession,
  exchangeSessionForAccessToken as _exchangeSessionForAccessToken,
  loginWithPassword as _loginWithPassword,
  logoutAllSessions as _logoutAllSessions,
  logoutSession as _logoutSession,
  readSessionCookie as _readSessionCookie,
  refreshSession as _refreshSession,
  requestPasswordRecovery as _requestPasswordRecovery,
  resetPassword as _resetPassword,
  signUp as _signUp,
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

// ---------------------------------------------------------------------------
// Password recovery & reset
// ---------------------------------------------------------------------------

export function requestPasswordRecovery(
  email: string
): Promise<MessageResponse> {
  return _requestPasswordRecovery(getAuthConfig(), email);
}

export function resetPassword(input: {
  token: string;
  newPassword: string;
}): Promise<MessageResponse> {
  return _resetPassword(getAuthConfig(), input);
}

// ---------------------------------------------------------------------------
// Self-registration
// ---------------------------------------------------------------------------

export function signUp(input: {
  email: string;
  username: string;
  password: string;
  firstName: string;
  lastName: string;
  middleName?: string | null;
}): Promise<UserPublic> {
  return _signUp(getAuthConfig(), input);
}

// ---------------------------------------------------------------------------
// OAuth2 bearer token (machine / API consumers)
// ---------------------------------------------------------------------------

export function loginWithPassword(input: {
  username: string;
  password: string;
}): Promise<Token> {
  return _loginWithPassword(getAuthConfig(), input);
}
