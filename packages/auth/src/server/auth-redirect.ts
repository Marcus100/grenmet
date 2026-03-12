import type { AuthConfig } from "../types";

export function getSafeLocalReturnTo(
  returnTo: string | null | undefined
): string | null {
  if (!returnTo) return null;

  const value = returnTo.trim();
  if (!value) return null;

  if (!value.startsWith("/") || value.startsWith("//")) {
    return null;
  }

  return value;
}

export function getRequestOrigin(requestHeaders: Headers): string {
  const host =
    requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const protocol =
    requestHeaders.get("x-forwarded-proto") ??
    (host?.startsWith("localhost") ? "http" : "https");

  return host ? `${protocol}://${host}` : "http://localhost:3000";
}

export function buildSharedSignInUrl(
  config: AuthConfig,
  input: { origin: string; returnTo?: string | null }
): string {
  const authUrl = new URL(config.authAppUrl);
  const returnPath = getSafeLocalReturnTo(input.returnTo) ?? "/";

  authUrl.searchParams.set("app", config.appName);
  authUrl.searchParams.set(
    "returnTo",
    new URL(returnPath, input.origin).toString()
  );

  return authUrl.toString();
}
