import type { AuthConfig } from "@barrelsgd/auth";
import { env } from "@/lib/env";

function normalizeUrlSegment(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

export function getAuthAppUrl(): string {
  return normalizeUrlSegment(env.AUTH_APP_URL);
}

export function getAuthApiBaseUrl(): string {
  return normalizeUrlSegment(env.AUTH_API_URL || env.NEXT_PUBLIC_API_URL);
}

export function getCapApiBaseUrl(): string {
  return normalizeUrlSegment(env.CAP_API_URL ?? env.AUTH_API_URL);
}

export function getAuthApiPrefix(): string {
  const configuredPrefix = env.AUTH_API_V1_STR.trim() || "/api/v1";
  return configuredPrefix.startsWith("/")
    ? configuredPrefix
    : `/${configuredPrefix}`;
}

export function getSessionCookieName(): string {
  return env.ADMIN_SESSION_COOKIE_NAME.trim() || "admin_session";
}

/** Registry key in apps/api/fastapi/src/auth/apps.py (ADR-0017). */
export function getAppName(): string {
  return "gaa-admin";
}

/**
 * Where Log out lands (ADR-0017). Returning straight to the app would sign the
 * browser back in through the live account session, so auth explains first.
 */
export function getSignedOutUrl({
  all = false,
}: {
  all?: boolean;
} = {}): string {
  const url = new URL("/signed-out", getAuthAppUrl());
  url.searchParams.set("app", getAppName());
  if (all) url.searchParams.set("all", "1");
  return url.toString();
}

export function getAuthConfig(): AuthConfig {
  return {
    authApiBaseUrl: getAuthApiBaseUrl(),
    authApiPrefix: getAuthApiPrefix(),
    authAppUrl: getAuthAppUrl(),
    appName: getAppName(),
    sessionCookieName: getSessionCookieName(),
  };
}
