import type { AuthConfig } from "@barrelsgd/auth";
import { env } from "@/env";

/**
 * Registry key in apps/api/fastapi/src/auth/apps.py (ADR-0017, ADR-0057). The
 * key is not usable until the API has the `account` secret set: sign-in stays
 * off while ACCOUNT_SSO_CLIENT_SECRET is empty.
 */
export const APP_NAME = "account";

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
    sessionCookieName: env.ACCOUNT_SESSION_COOKIE_NAME,
  };
}

/**
 * Where Log out lands (ADR-0017). Returning straight to the app would sign the
 * browser back in through the live account session, so auth explains first.
 */
export function getSignedOutUrl(): string {
  const url = new URL("/signed-out", getAuthConfig().authAppUrl);
  url.searchParams.set("app", APP_NAME);
  return url.toString();
}
