import type { AuthConfig } from "@barrelsgd/auth";
import { env } from "@/lib/env";

/** Registry key in apps/api/fastapi/src/auth/apps.py (ADR-0017, staff scope). */
export const APP_NAME = "cap";

function trimTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

export function getAuthConfig(): AuthConfig {
  const prefix = env.AUTH_API_V1_STR.trim() || "/api/v1";
  return {
    appName: APP_NAME,
    authApiBaseUrl: trimTrailingSlash(env.AUTH_API_URL),
    authApiPrefix: prefix.startsWith("/") ? prefix : `/${prefix}`,
    authAppUrl: trimTrailingSlash(env.AUTH_APP_URL),
    sessionCookieName: env.CAP_SESSION_COOKIE_NAME,
  };
}

/** Where Log out lands: auth explains first, so the desk does not sign straight back in. */
export function getSignedOutUrl(): string {
  const url = new URL("/signed-out", getAuthConfig().authAppUrl);
  url.searchParams.set("app", APP_NAME);
  return url.toString();
}
