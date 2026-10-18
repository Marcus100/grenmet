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
    GMS_SITE_URL: process.env.GMS_SITE_URL,
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
    NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
    NEXT_PUBLIC_SENTRY_ENVIRONMENT: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT,
    NEXT_PUBLIC_RELEASE: process.env.NEXT_PUBLIC_RELEASE,
  },
  skipValidation: process.env.SKIP_ENV_VALIDATION === "true",
});
