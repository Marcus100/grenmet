function firstValue(value: string | string[] | undefined): string | null {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value[0] ?? null;
  return null;
}

import { env } from "./env";

function getAllowedReturnHosts(): string[] {
  return env.AUTH_ALLOWED_RETURN_HOSTS.split(",")
    .map((value: string) => value.trim().toLowerCase())
    .filter(Boolean);
}

// A leading-dot entry (".barrels.gd") allows the apex domain and any subdomain,
// mirroring cookie Domain semantics. Entries without a leading dot must match
// the URL host (including any port) exactly.
function isAllowedReturnHost(host: string): boolean {
  const candidate = host.toLowerCase();
  return getAllowedReturnHosts().some((entry) =>
    entry.startsWith(".")
      ? candidate === entry.slice(1) || candidate.endsWith(entry)
      : candidate === entry
  );
}

export function readQueryParam(
  value: string | string[] | undefined
): string | null {
  const first = firstValue(value);
  return first ? first.trim() : null;
}

export function getSafeReturnTo(
  returnTo: string | null | undefined
): string | null {
  if (!returnTo) return null;

  const value = returnTo.trim();
  if (!value) return null;

  if (value.startsWith("/") && !value.startsWith("//")) {
    return value;
  }

  try {
    const parsedUrl = new URL(value);
    if (parsedUrl.protocol !== "https:" && parsedUrl.protocol !== "http:") {
      return null;
    }
    return isAllowedReturnHost(parsedUrl.host) ? parsedUrl.toString() : null;
  } catch {
    return null;
  }
}

export function getRequestedAppName(
  requestedApp: string | null | undefined,
  returnTo: string | null | undefined
): string | null {
  const explicitName = requestedApp?.trim();
  if (explicitName) return explicitName;

  if (!returnTo || returnTo.startsWith("/")) {
    return null;
  }

  try {
    const host = new URL(returnTo).hostname;
    return host.split(".")[0] ?? null;
  } catch {
    return null;
  }
}
