import "server-only";

import {
  authApiFetch as _authApiFetch,
  clearSessionCookieOnResponse as _clearSessionCookieOnResponse,
  exchangeSessionForAccessToken as _exchangeSessionForAccessToken,
  readSessionCookie as _readSessionCookie,
} from "@grenmet/auth/server";
import type { NextResponse } from "next/server";
import { getAuthConfig } from "@/lib/auth-config";

export { isAuthApiError } from "@grenmet/auth";

export function clearSessionCookieOnResponse(response: NextResponse): void {
  _clearSessionCookieOnResponse(getAuthConfig(), response);
}

export function readSessionCookie(): Promise<string | null> {
  return _readSessionCookie(getAuthConfig());
}

export function authApiFetch<T>(
  path: string,
  init: Omit<RequestInit, "body" | "headers"> & { body?: unknown } = {}
): Promise<T> {
  return _authApiFetch<T>(getAuthConfig(), path, init);
}

export function exchangeSessionForAccessToken(sessionToken: string) {
  return _exchangeSessionForAccessToken(getAuthConfig(), sessionToken);
}
