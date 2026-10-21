import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  server: {
    AUTH_API_URL: z.string().url().optional().default("http://localhost:8000"),
    AUTH_API_V1_STR: z.string().optional().default("/api/v1"),
    // Sign in with the Barrels account (ADR-0017): host-only cookie, and the
    // secret that redeems single sign-on codes (unset switches sign-in off).
    AUTH_APP_URL: z.string().url().optional().default("http://localhost:3000"),
    BOOKINGS_SESSION_COOKIE_NAME: z
      .string()
      .optional()
      .default("bookings_session"),
    // Deployment passes "" when the secret isn't set: treat that as off.
    BOOKINGS_SSO_CLIENT_SECRET: z.preprocess(
      (value) => value || undefined,
      z.string().min(32).optional()
    ),
  },
  client: {
    // Cloudflare Turnstile public site key for the booking form. Empty: no widget.
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: z.string().optional().default(""),
    NEXT_PUBLIC_SENTRY_DSN: z.string().optional(),
    NEXT_PUBLIC_SENTRY_ENVIRONMENT: z
      .string()
      .optional()
      .default("development"),
    NEXT_PUBLIC_RELEASE: z.string().optional().default(""),
  },
  runtimeEnv: {
    AUTH_API_URL: process.env.AUTH_API_URL,
    AUTH_API_V1_STR: process.env.AUTH_API_V1_STR,
    AUTH_APP_URL: process.env.AUTH_APP_URL,
    BOOKINGS_SESSION_COOKIE_NAME: process.env.BOOKINGS_SESSION_COOKIE_NAME,
    BOOKINGS_SSO_CLIENT_SECRET: process.env.BOOKINGS_SSO_CLIENT_SECRET,
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
    NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
    NEXT_PUBLIC_SENTRY_ENVIRONMENT: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT,
    NEXT_PUBLIC_RELEASE: process.env.NEXT_PUBLIC_RELEASE,
  },
  emptyStringAsUndefined: true,
  skipValidation: process.env.SKIP_ENV_VALIDATION === "true",
});
