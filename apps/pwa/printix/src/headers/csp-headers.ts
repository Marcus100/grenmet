// Build-time helper (run by vite.config.ts, never shipped in the bundle).
// `public/_headers` names the production API origin in `connect-src`. A staging
// build must be able to call the staging API instead, without the production
// file ever allowing it. The build rewrites that one origin in `out/_headers`
// from `VITE_API_URL`, and nothing else.

/** The production API origin written in `public/_headers`. */
export const PRODUCTION_API_ORIGIN = "https://api.barrels.gd";

const CONNECT_SRC = /(connect-src 'self') (https:\/\/[^\s;]+)/u;

/**
 * The https origin of `value`, or null when it is unset, not a URL, or not
 * https. Plain http (a local API) is never written into a deployed CSP.
 */
export function httpsOriginOf(value: string | undefined): string | null {
  const raw = value?.trim();
  if (!raw) {
    return null;
  }
  try {
    const url = new URL(raw);
    return url.protocol === "https:" ? url.origin : null;
  } catch {
    return null;
  }
}

/**
 * Swaps the API origin in `connect-src` for the build's own. Unset or unsafe
 * values leave the file as it is, so a production build is byte-identical.
 * Throws if the file has no `connect-src` origin to replace, so a changed
 * template cannot silently ship the wrong policy.
 */
export function headersForApi(
  headers: string,
  apiUrl: string | undefined
): string {
  const origin = httpsOriginOf(apiUrl);
  if (origin === null) {
    return headers;
  }
  if (!CONNECT_SRC.test(headers)) {
    throw new Error("public/_headers has no connect-src API origin to replace");
  }
  return headers.replace(CONNECT_SRC, `$1 ${origin}`);
}
