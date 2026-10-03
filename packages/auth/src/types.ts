export type {
  EffectiveAccess,
  SessionAccessTokenResponse,
  SessionLoginResponse,
  SessionPublic,
  SessionUserPublic,
  Token,
  UserPublic,
} from "@barrelsgd/api-client";

import type { Message } from "@barrelsgd/api-client";

export interface AuthConfig {
  appName: string;
  authApiBaseUrl: string;
  authApiPrefix: string;
  /**
   * Max time (ms) a server-side auth-API request may block before it is
   * aborted. Guards against a cold/slow/unreachable backend hanging an SSR
   * render indefinitely. Optional — defaults to DEFAULT_AUTH_API_TIMEOUT_MS.
   */
  authApiTimeoutMs?: number;
  authAppUrl: string;
  sessionCookieDomain?: string;
  sessionCookieName: string;
}

export type MessageResponse = Message;

export class AuthApiError extends Error {
  status: number;
  detail: string;

  constructor(status: number, detail: string) {
    super(detail);
    this.name = "AuthApiError";
    this.status = status;
    this.detail = detail;
  }
}

export function isAuthApiError(error: unknown): error is AuthApiError {
  return error instanceof AuthApiError;
}
