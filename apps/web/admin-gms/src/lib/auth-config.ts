import type { AuthConfig } from "@grenmet/auth";
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
  return env.SESSION_COOKIE_NAME.trim() || "grenmet_session";
}

export function getSessionCookieDomain(): string | undefined {
  const domain = env.SESSION_COOKIE_DOMAIN?.trim();
  return domain ? domain : undefined;
}

export function getAppName(): string {
  return "admin-gms";
}

export function getAuthConfig(): AuthConfig {
  return {
    authApiBaseUrl: getAuthApiBaseUrl(),
    authApiPrefix: getAuthApiPrefix(),
    authAppUrl: getAuthAppUrl(),
    appName: getAppName(),
    sessionCookieName: getSessionCookieName(),
    sessionCookieDomain: getSessionCookieDomain(),
  };
}
