// Typed environment for Commit. The only place that reads `process.env`.
// Hand-written (no schema library), like apps/web/babydoll: every value has a
// safe default and a bad value falls back to it.

const DEFAULT_SITE_URL = "https://commit.barrels.gd";

function originOf(value: string | undefined, fallback: string): string {
  const raw = value?.trim() || fallback;
  try {
    return new URL(raw).origin;
  } catch {
    return fallback;
  }
}

export interface CommitEnv {
  /** Public origin, used for metadata, the sitemap and RSS links. */
  readonly COMMIT_SITE_URL: string;
}

export function parseEnv(
  source: Record<string, string | undefined>
): CommitEnv {
  return {
    COMMIT_SITE_URL: originOf(source.COMMIT_SITE_URL, DEFAULT_SITE_URL),
  };
}

export const env = parseEnv({
  COMMIT_SITE_URL: process.env.COMMIT_SITE_URL,
});
