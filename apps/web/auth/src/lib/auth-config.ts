import type { AuthConfig } from "@barrelsgd/auth";
import { env } from "./env";

function normalizeUrlSegment(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

export function getAuthConfig(): AuthConfig {
  const authApiBaseUrl = normalizeUrlSegment(env.AUTH_API_URL);

  const rawPrefix = env.AUTH_API_V1_STR.trim();
  const authApiPrefix = rawPrefix.startsWith("/") ? rawPrefix : `/${rawPrefix}`;

  return {
    appName: "auth",
    authApiBaseUrl,
    authApiPrefix,
    authAppUrl: "/",
    sessionCookieName: env.AUTH_SESSION_COOKIE_NAME.trim(),
  };
}
