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
    // Only a secret of the API's minimum length is forwarded; shorter is ignored.
    trustedWebSecret:
      env.TRUSTED_WEB_SECRET && env.TRUSTED_WEB_SECRET.length >= 32
        ? env.TRUSTED_WEB_SECRET
        : undefined,
    visitorProxyHops: env.AUTH_VISITOR_PROXY_HOPS,
    sessionCookieName: env.AUTH_SESSION_COOKIE_NAME.trim(),
  };
}
