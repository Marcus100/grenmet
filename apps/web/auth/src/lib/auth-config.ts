import type { AuthConfig } from "@grenmet/auth";
import { env } from "./env";

function normalizeUrlSegment(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

export function getAuthConfig(): AuthConfig {
  const authApiBaseUrl = normalizeUrlSegment(env.AUTH_API_URL);

  const rawPrefix = env.AUTH_API_V1_STR.trim();
  const authApiPrefix = rawPrefix.startsWith("/") ? rawPrefix : `/${rawPrefix}`;

  const sessionCookieDomain = env.SESSION_COOKIE_DOMAIN?.trim() || undefined;

  return {
    appName: "auth",
    authApiBaseUrl,
    authApiPrefix,
    authAppUrl: "/",
    sessionCookieDomain,
    sessionCookieName: env.SESSION_COOKIE_NAME.trim(),
  };
}
