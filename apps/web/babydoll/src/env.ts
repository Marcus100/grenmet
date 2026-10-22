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

const MIN_SECRET_LENGTH = 32;
const MAX_PROXY_HOPS = 5;

function secretOf(value: string | undefined): string | undefined {
  const secret = clean(value);
  return secret && secret.length >= MIN_SECRET_LENGTH ? secret : undefined;
}

function hopsOf(value: string | undefined): number {
  const hops = Number(clean(value));
  return Number.isInteger(hops) && hops >= 1 && hops <= MAX_PROXY_HOPS
    ? hops
    : 1;
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
  /**
   * Shared with the API's TRUSTED_WEB_SECRET so it can rate-limit each visitor
   * on their own address. Under 32 characters or unset: ignored, and every
   * visitor shares this server's bucket.
   */
  readonly TRUSTED_WEB_SECRET: string | undefined;
  /** Proxies in front of this server that append to `x-forwarded-for`. */
  readonly VISITOR_IP_PROXY_HOPS: number;
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
    TRUSTED_WEB_SECRET: secretOf(source.TRUSTED_WEB_SECRET),
    VISITOR_IP_PROXY_HOPS: hopsOf(source.VISITOR_IP_PROXY_HOPS),
    NEXT_PUBLIC_TURNSTILE_SITE_KEY:
      clean(source.NEXT_PUBLIC_TURNSTILE_SITE_KEY) ?? "",
  };
}

export const env = parseEnv({
  BABYDOLL_API_URL: process.env.BABYDOLL_API_URL,
  BABYDOLL_BOOKING_SLUG: process.env.BABYDOLL_BOOKING_SLUG,
  BABYDOLL_ONLINE_BOOKING: process.env.BABYDOLL_ONLINE_BOOKING,
  TRUSTED_WEB_SECRET: process.env.TRUSTED_WEB_SECRET,
  VISITOR_IP_PROXY_HOPS: process.env.VISITOR_IP_PROXY_HOPS,
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
});
