import type { AuthConfig } from "@grenmet/auth";
import { env } from "@/lib/env";

function trimTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

export function getAppBaseUrl(): string {
  return trimTrailingSlash(env.APP_BASE_URL);
}

export function getAuthAppUrl(): string {
  return trimTrailingSlash(env.AUTH_APP_URL);
}

export function getAuthApiBaseUrl(): string {
  return trimTrailingSlash(env.AUTH_API_URL);
}

export function getCapApiBaseUrl(): string {
  return trimTrailingSlash(env.CAP_API_URL ?? env.AUTH_API_URL);
}

export function getAuthApiPrefix(): string {
  const prefix = env.AUTH_API_V1_STR.trim() || "/api/v1";
  return prefix.startsWith("/") ? prefix : `/${prefix}`;
}

export function getSessionCookieName(): string {
  return env.SESSION_COOKIE_NAME.trim() || "grenmet_session";
}

export function getSessionCookieDomain(): string | undefined {
  const domain = env.SESSION_COOKIE_DOMAIN?.trim();
  return domain ? domain : undefined;
}

export function getAuthConfig(): AuthConfig {
  return {
    appName: "cap",
    authApiBaseUrl: getAuthApiBaseUrl(),
    authApiPrefix: getAuthApiPrefix(),
    authAppUrl: getAuthAppUrl(),
    sessionCookieDomain: getSessionCookieDomain(),
    sessionCookieName: getSessionCookieName(),
  };
}
