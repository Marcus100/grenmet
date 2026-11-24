import type { AuthConfig } from "@barrelsgd/auth";
import { env } from "@/env";

/**
 * Registry key in apps/api/fastapi/src/auth/apps.py (`hr`, staff scope). Sign-in
 * stays off while HR_SSO_CLIENT_SECRET is empty: the API answers 503 to both
 * handoff calls.
 */
export const APP_NAME = "hr";

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
    sessionCookieName: env.HR_SESSION_COOKIE_NAME,
  };
}

/**
 * Where Log out lands. Auth explains first, so the browser is not signed
 * straight back in through a live auth session.
 */
export function getSignedOutUrl(): string {
  const url = new URL("/signed-out", getAuthConfig().authAppUrl);
  url.searchParams.set("app", APP_NAME);
  return url.toString();
}
