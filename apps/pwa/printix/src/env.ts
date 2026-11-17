// Typed environment for the Printix scanner. The only place that reads
// `import.meta.env`. A missing or unsafe value falls back to empty.

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1"]);

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
  readonly VITE_API_URL: string;
}

export function parseEnv(
  source: Record<string, string | undefined>
): PrintixEnv {
  return { VITE_API_URL: apiOriginOf(source.VITE_API_URL) };
}

// Vite writes VITE_-prefixed values into the browser bundle at build time.
export const env = parseEnv({
  VITE_API_URL: import.meta.env.VITE_API_URL,
});
