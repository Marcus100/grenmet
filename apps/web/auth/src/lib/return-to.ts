function firstValue(value: string | string[] | undefined): string | null {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value[0] ?? null;
  return null;
}

import { env } from "./env";

function getAllowedReturnHosts(): Set<string> {
  return new Set(
    env.AUTH_ALLOWED_RETURN_HOSTS.split(",")
      .map((value: string) => value.trim())
      .filter(Boolean),
  );
}

export function readQueryParam(
  value: string | string[] | undefined,
): string | null {
  const first = firstValue(value);
  return first ? first.trim() : null;
}

export function getSafeReturnTo(
  returnTo: string | null | undefined,
): string | null {
  if (!returnTo) return null;

  const value = returnTo.trim();
  if (!value) return null;

  if (value.startsWith("/") && !value.startsWith("//")) {
    return value;
  }

  try {
    const parsedUrl = new URL(value);
    return getAllowedReturnHosts().has(parsedUrl.host)
      ? parsedUrl.toString()
      : null;
  } catch {
    return null;
  }
}

export function getRequestedAppName(
  requestedApp: string | null | undefined,
  returnTo: string | null | undefined,
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
