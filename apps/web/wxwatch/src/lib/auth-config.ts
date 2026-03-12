import type { AuthConfig } from "@grenmet/auth";
import { env } from "@/src/lib/env";

function normalizeUrlSegment(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

export function getAuthConfig(): AuthConfig {
  const authApiUrl = normalizeUrlSegment(env.AUTH_API_URL);
  const authApiPrefix = env.AUTH_API_V1_STR.trim() || "/api/v1";

  return {
    authApiBaseUrl: authApiUrl,
    authApiPrefix: authApiPrefix.startsWith("/")
      ? authApiPrefix
      : `/${authApiPrefix}`,
    authAppUrl: normalizeUrlSegment(env.AUTH_APP_URL),
    appName: "wxwatch",
    sessionCookieName: env.SESSION_COOKIE_NAME.trim() || "grenmet_session",
    sessionCookieDomain: env.SESSION_COOKIE_DOMAIN?.trim() || undefined,
  };
}

export function getSessionCookieName(): string {
  return env.SESSION_COOKIE_NAME.trim() || "grenmet_session";
}
