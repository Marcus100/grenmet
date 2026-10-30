import type { Route } from "next";
import { env } from "./env";

function firstValue(value: string | string[] | undefined): string | null {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value[0] ?? null;
  return null;
}

// Sign-in return targets are an exact allowlist of origins (ADR-0043 decision 5).
// There is no suffix or wildcard rule: a leading-dot entry such as
// ".barrels.gd" is ignored, so a sibling subdomain nobody registered is refused.
//
// Sources, all exact:
//   1. the auth app's own URL and the app URLs the deployment configures
//      (ADMIN_APP_URL, DOCS_APP_URL, ...), which mirror the API app registry;
//   2. entries in AUTH_ALLOWED_RETURN_HOSTS that are an origin
//      ("https://bookings.barrels.gd") or a bare host ("bookings.barrels.gd",
//      "localhost:3015"); a bare host means https, except localhost outside
//      production, which also allows http;
//   3. in development only, the local ports in docs/ports.md.
const BARE_HOST = /^[a-z0-9.-]+(?::\d{1,5})?$/u;
const DEV_PORTS = Array.from({ length: 17 }, (_, index) => 3000 + index);

function isLocalHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1";
}

function originOf(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.origin;
  } catch {
    return null;
  }
}

// Wildcards, paths, credentials and anything else that is not an origin or a
// bare host[:port] are dropped.
function originsFromEntry(entry: string): string[] {
  if (entry.startsWith(".") || entry.includes("*")) return [];
  if (entry.includes("://")) {
    const origin = originOf(entry);
    if (!origin) return [];
    // Same rules as a bare host: in production only https, never localhost.
    if (env.NODE_ENV === "production") {
      const url = new URL(origin);
      if (url.protocol !== "https:" || isLocalHost(url.hostname)) return [];
    }
    return [origin];
  }
  if (!BARE_HOST.test(entry)) return [];
  const hostname = entry.split(":")[0] ?? "";
  if (isLocalHost(hostname)) {
    return env.NODE_ENV === "production"
      ? []
      : [`http://${entry}`, `https://${entry}`];
  }
  return [`https://${entry}`];
}

function getAllowedOrigins(): Set<string> {
  const origins = new Set<string>();
  const configured = [
    env.AUTH_APP_URL,
    env.ADMIN_APP_URL,
    env.DOCS_APP_URL,
    env.GMS_APP_URL,
    env.MBIA_APP_URL,
    env.SIGNAL_APP_URL,
    env.EVENTS_APP_URL,
  ];
  for (const url of configured) {
    const origin = url ? originOf(url) : null;
    if (!origin) continue;
    // The env defaults are localhost URLs; never trust them in production.
    if (
      env.NODE_ENV === "production" &&
      isLocalHost(new URL(origin).hostname)
    ) {
      continue;
    }
    origins.add(origin);
  }
  for (const raw of (env.AUTH_ALLOWED_RETURN_HOSTS ?? "").split(",")) {
    for (const origin of originsFromEntry(raw.trim().toLowerCase())) {
      origins.add(origin);
    }
  }
  if (env.NODE_ENV === "development") {
    for (const port of DEV_PORTS) origins.add(`http://localhost:${port}`);
  }
  return origins;
}

function isAllowedReturnUrl(url: URL): boolean {
  if (url.username || url.password) return false;
  return getAllowedOrigins().has(url.origin);
}

// Backslashes and control characters are read differently by browsers and
// proxies; an honest caller never sends them.
function hasAmbiguousCharacters(value: string): boolean {
  if (value.includes("\\")) return true;
  for (const char of value) {
    const code = char.charCodeAt(0);
    if (code <= 0x1f || code === 0x7f) return true;
  }
  return false;
}

function decoded(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function readQueryParam(
  value: string | string[] | undefined
): string | null {
  const first = firstValue(value);
  return first ? first.trim() : null;
}

// The result is validated here (same-origin path or an allowed origin), which is
// why it can be typed as a Route for redirect() and links.
export function getSafeReturnTo(
  returnTo: string | null | undefined
): Route | null {
  if (!returnTo) return null;

  const value = returnTo.trim();
  if (!value) return null;

  // Raw and percent-decoded: a decoded CR/LF or NUL must never reach redirect().
  if (hasAmbiguousCharacters(value) || hasAmbiguousCharacters(decoded(value))) {
    return null;
  }

  if (value.startsWith("/")) {
    try {
      const base = "https://return.invalid";
      return new URL(value, base).origin === base ? (value as Route) : null;
    } catch {
      return null;
    }
  }

  try {
    const parsedUrl = new URL(value);
    return isAllowedReturnUrl(parsedUrl)
      ? (parsedUrl.toString() as Route)
      : null;
  } catch {
    return null;
  }
}

// The app is named by the caller (`?app=`, which buildSharedSignInUrl always
// sets). Without it, the app is recovered only from an exact configured app
// origin, never guessed from a DNS label. It labels the sign-in page and is
// sent to the API as a hint; it is not an authorisation decision.
export function getRequestedAppName(
  requestedApp: string | null | undefined,
  returnTo: string | null | undefined
): string | null {
  const explicitName = requestedApp?.trim();
  if (explicitName) return explicitName;

  if (!returnTo || returnTo.startsWith("/")) {
    return null;
  }

  const origin = originOf(returnTo);
  if (!origin) return null;
  const appUrls: [string | undefined, string][] = [
    [env.ADMIN_APP_URL, "admin"],
    [env.DOCS_APP_URL, "docs"],
    [env.GMS_APP_URL, "weather"],
    [env.MBIA_APP_URL, "mbia"],
    [env.SIGNAL_APP_URL, "signal"],
    [env.EVENTS_APP_URL, "events"],
  ];
  for (const [url, key] of appUrls) {
    if (url && originOf(url) === origin) return key;
  }
  return null;
}
