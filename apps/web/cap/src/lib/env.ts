import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  server: {
    // Base URL for the public, unauthenticated CAP endpoints (/api/cap/*).
    // Fetched server-side only, so the browser never needs CORS.
    CAP_API_URL: z.string().url().optional().default("http://localhost:8000"),
    // The Grenada Meteorological Service site, for "official source" links.
    GMS_SITE_URL: z
      .string()
      .url()
      .optional()
      .default("https://weather.barrels.gd"),
    // Staff warning desk under /desk (ADR-0017 single sign-on, registry key
    // "cap"). Server-side only; public pages never read these.
    AUTH_API_URL: z.string().url().optional().default("http://localhost:8000"),
    AUTH_API_V1_STR: z.string().optional().default("/api/v1"),
    AUTH_APP_URL: z.string().url().optional().default("http://localhost:3000"),
    CAP_SESSION_COOKIE_NAME: z.string().optional().default("cap_desk_session"),
    // Deployment passes "" when the secret isn't set: treat that as off.
    CAP_SSO_CLIENT_SECRET: z.preprocess(
      (value) => value || undefined,
      z.string().min(32).optional()
    ),
  },
  client: {
    // Canonical public address, for absolute links in feeds and share previews.
    NEXT_PUBLIC_SITE_URL: z
      .string()
      .url()
      .optional()
      .default("http://localhost:3010"),
    NEXT_PUBLIC_SENTRY_DSN: z.string().optional(),
    NEXT_PUBLIC_SENTRY_ENVIRONMENT: z
      .string()
      .optional()
      .default("development"),
    NEXT_PUBLIC_RELEASE: z.string().optional().default(""),
  },
  runtimeEnv: {
    CAP_API_URL: process.env.CAP_API_URL,
    AUTH_API_URL: process.env.AUTH_API_URL,
    AUTH_API_V1_STR: process.env.AUTH_API_V1_STR,
    AUTH_APP_URL: process.env.AUTH_APP_URL,
    CAP_SESSION_COOKIE_NAME: process.env.CAP_SESSION_COOKIE_NAME,
    CAP_SSO_CLIENT_SECRET: process.env.CAP_SSO_CLIENT_SECRET,
    GMS_SITE_URL: process.env.GMS_SITE_URL,
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
    NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
    NEXT_PUBLIC_SENTRY_ENVIRONMENT: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT,
    NEXT_PUBLIC_RELEASE: process.env.NEXT_PUBLIC_RELEASE,
  },
  skipValidation: process.env.SKIP_ENV_VALIDATION === "true",
});
