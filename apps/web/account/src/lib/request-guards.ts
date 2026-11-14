import { getRequestOrigin } from "@barrelsgd/auth/server";

/**
 * Cookies are SameSite=Lax and host-only, but other *.barrels.gd hosts are the
 * same site, so a change must come from this host's own pages. A missing Origin
 * is refused too: browsers send it on every cross-origin and form POST.
 * Same rule as the CAP desk proxy (`apps/web/cap/src/lib/desk/request-guards.ts`).
 */
export function isSameOrigin(headers: Headers): boolean {
  const origin = headers.get("origin");
  return origin !== null && origin === getRequestOrigin(headers);
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/** True for methods that change data and so need the same-origin check. */
export function isWriteMethod(method: string): boolean {
  return !SAFE_METHODS.has(method.toUpperCase());
}
