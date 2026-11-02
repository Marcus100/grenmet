import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  server: {
    CMS_API_URL: z.string().url().optional(),
    // Weather data is read from FastAPI (no sign-in on this site, owner 1 Nov 2026).
    AUTH_API_URL: z.string().url().optional().default("http://localhost:8000"),
    AUTH_API_V1_STR: z.string().optional().default("/api/v1"),
    // Shared with the API's TRUSTED_WEB_SECRET so sign-up rate limits key on the
    // visitor's own address. Unset or "": every visitor shares this server's bucket.
    TRUSTED_WEB_SECRET: z.preprocess(
      (value) => value || undefined,
      z.string().min(32).optional()
    ),
    // Reverse proxies in front of this server that append to x-forwarded-for.
    VISITOR_IP_PROXY_HOPS: z.preprocess(
      (value) => value || undefined,
      z.coerce.number().int().min(1).max(5).default(1)
    ),
    // Base URL for the public CAP warning endpoints (/api/cap/*). These are
    // unauthenticated, so this is independent of the auth delegation above.
    CAP_API_URL: z.string().url().optional().default("http://localhost:8000"),
  },
  client: {
    // Canonical public address, for absolute share-preview links (metadataBase).
    NEXT_PUBLIC_SITE_URL: z
      .string()
      .url()
      .optional()
      .default("http://localhost:3003"),
    NEXT_PUBLIC_GA_MEASUREMENT_ID: z
      .string()
      .regex(/^(G-[A-Z0-9]+)?$/)
      .optional()
      .default(""),
    // Cloudflare Turnstile public site key. Unset: no widget, no token sent.
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: z.string().optional().default(""),
    NEXT_PUBLIC_SENTRY_DSN: z.string().optional(),
    NEXT_PUBLIC_SENTRY_ENVIRONMENT: z
      .string()
      .optional()
      .default("development"),
    NEXT_PUBLIC_POSTHOG_KEY: z.string().optional().default(""),
    NEXT_PUBLIC_POSTHOG_HOST: z
      .string()
      .optional()
      .default("https://us.i.posthog.com"),
  },
  runtimeEnv: {
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
    NEXT_PUBLIC_GA_MEASUREMENT_ID: process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID,
    CMS_API_URL: process.env.CMS_API_URL,
    AUTH_API_URL: process.env.AUTH_API_URL,
    AUTH_API_V1_STR: process.env.AUTH_API_V1_STR,
    TRUSTED_WEB_SECRET: process.env.TRUSTED_WEB_SECRET,
    VISITOR_IP_PROXY_HOPS: process.env.VISITOR_IP_PROXY_HOPS,
    CAP_API_URL: process.env.CAP_API_URL,
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
    NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
    NEXT_PUBLIC_SENTRY_ENVIRONMENT: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT,
    NEXT_PUBLIC_POSTHOG_KEY: process.env.NEXT_PUBLIC_POSTHOG_KEY,
    NEXT_PUBLIC_POSTHOG_HOST: process.env.NEXT_PUBLIC_POSTHOG_HOST,
  },
});
