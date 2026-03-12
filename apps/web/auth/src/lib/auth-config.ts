import type { AuthConfig } from "@grenmet/auth";

const DEFAULT_API_BASE_URL = "http://localhost:8000";
const DEFAULT_API_V1_STR = "/api/v1";
const DEFAULT_SESSION_COOKIE_NAME = "grenmet_session";

function normalizeUrlSegment(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

export function getAuthConfig(): AuthConfig {
  const authApiBaseUrl = normalizeUrlSegment(
    process.env.AUTH_API_URL ??
      process.env.NEXT_PUBLIC_API_URL ??
      DEFAULT_API_BASE_URL,
  );

  const rawPrefix = process.env.AUTH_API_V1_STR?.trim() || DEFAULT_API_V1_STR;
  const authApiPrefix = rawPrefix.startsWith("/") ? rawPrefix : `/${rawPrefix}`;

  const sessionCookieDomain =
    process.env.SESSION_COOKIE_DOMAIN?.trim() || undefined;

  return {
    appName: "auth",
    authApiBaseUrl,
    authApiPrefix,
    authAppUrl: "/",
    sessionCookieDomain,
    sessionCookieName:
      process.env.SESSION_COOKIE_NAME?.trim() || DEFAULT_SESSION_COOKIE_NAME,
  };
}
