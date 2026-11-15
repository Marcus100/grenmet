// Typed environment for the Printix scanner. The only place that reads
// `process.env`. Every value has a safe default and a bad value falls back.

const DEFAULT_SITE_URL = "https://scan.printixevent.com";

function originOf(value: string | undefined, fallback: string): string {
  const raw = value?.trim() || fallback;
  try {
    return new URL(raw).origin;
  } catch {
    return fallback;
  }
}

export interface PrintixEnv {
  /** Public origin of the scanner, used for page metadata. */
  readonly PRINTIX_SITE_URL: string;
}

export function parseEnv(
  source: Record<string, string | undefined>
): PrintixEnv {
  return {
    PRINTIX_SITE_URL: originOf(source.PRINTIX_SITE_URL, DEFAULT_SITE_URL),
  };
}

export const env = parseEnv({
  PRINTIX_SITE_URL: process.env.PRINTIX_SITE_URL,
});
