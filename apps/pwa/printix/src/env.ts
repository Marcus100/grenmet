// Typed environment for the Printix scanner. The only place that reads
// `process.env`. Every value has a safe default and a bad value falls back.

const DEFAULT_SITE_URL = "https://scan.printixevent.com";
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1"]);

function originOf(value: string | undefined, fallback: string): string {
  const raw = value?.trim() || fallback;
  try {
    return new URL(raw).origin;
  } catch {
    return fallback;
  }
}

/**
 * The API origin the scanner calls with the pairing secret. Plain http is
 * refused except on this machine: the secret travels in every request.
 * Returns "" when unset or unsafe; the scanner then refuses to check tickets.
 */
function apiOriginOf(value: string | undefined): string {
  const raw = value?.trim();
  if (!raw) {
    return "";
  }
  try {
    const url = new URL(raw);
    const secure =
      url.protocol === "https:" ||
      (url.protocol === "http:" && LOCAL_HOSTS.has(url.hostname));
    return secure ? url.origin : "";
  } catch {
    return "";
  }
}

export interface PrintixEnv {
  /** Origin of the FastAPI service. Empty when not configured. */
  readonly NEXT_PUBLIC_API_URL: string;
  /** Public origin of the scanner, used for page metadata. */
  readonly PRINTIX_SITE_URL: string;
}

export function parseEnv(
  source: Record<string, string | undefined>
): PrintixEnv {
  return {
    PRINTIX_SITE_URL: originOf(source.PRINTIX_SITE_URL, DEFAULT_SITE_URL),
    NEXT_PUBLIC_API_URL: apiOriginOf(source.NEXT_PUBLIC_API_URL),
  };
}

// The literal `process.env.NEXT_PUBLIC_API_URL` reference is what lets Next
// inline the value into the browser bundle of this static export.
export const env = parseEnv({
  PRINTIX_SITE_URL: process.env.PRINTIX_SITE_URL,
  NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
});
