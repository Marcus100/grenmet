// Typed environment for Babydoll. The only place that reads `process.env`.
// Hand-written (no schema library) so the app keeps its three runtime
// dependencies; every value has a safe default and a bad value falls back to
// it rather than breaking the static site.

const DEFAULT_API_URL = "http://localhost:8000";
const DEFAULT_BOOKING_SLUG = "babydoll-beauty-bar";

function clean(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function originOf(value: string | undefined, fallback: string): string {
  const raw = clean(value) ?? fallback;
  try {
    return new URL(raw).origin;
  } catch {
    return fallback;
  }
}

export interface BabydollEnv {
  /** FastAPI origin, server only (never sent to the browser). */
  readonly BABYDOLL_API_URL: string;
  /** Public booking address of the studio (`bookings.profile.public_slug`). */
  readonly BABYDOLL_BOOKING_SLUG: string;
  /**
   * Switch for the online booking flow. Anything but "on" is off: `/book`
   * redirects to the Acuity link. Stands in for the PF7 flag
   * `babydoll-online-booking` until anonymous visitors can evaluate it.
   */
  readonly BABYDOLL_ONLINE_BOOKING: "on" | "off";
  /** Cloudflare Turnstile public site key. Empty: no widget, no token. */
  readonly NEXT_PUBLIC_TURNSTILE_SITE_KEY: string;
}

export function parseEnv(
  source: Record<string, string | undefined>
): BabydollEnv {
  return {
    BABYDOLL_API_URL: originOf(source.BABYDOLL_API_URL, DEFAULT_API_URL),
    BABYDOLL_BOOKING_SLUG:
      clean(source.BABYDOLL_BOOKING_SLUG) ?? DEFAULT_BOOKING_SLUG,
    BABYDOLL_ONLINE_BOOKING:
      clean(source.BABYDOLL_ONLINE_BOOKING)?.toLowerCase() === "on"
        ? "on"
        : "off",
    NEXT_PUBLIC_TURNSTILE_SITE_KEY:
      clean(source.NEXT_PUBLIC_TURNSTILE_SITE_KEY) ?? "",
  };
}

export const env = parseEnv({
  BABYDOLL_API_URL: process.env.BABYDOLL_API_URL,
  BABYDOLL_BOOKING_SLUG: process.env.BABYDOLL_BOOKING_SLUG,
  BABYDOLL_ONLINE_BOOKING: process.env.BABYDOLL_ONLINE_BOOKING,
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
});
