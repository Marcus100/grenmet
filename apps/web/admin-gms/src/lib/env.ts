import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  server: {
    RESEND_API_KEY: z.string().min(1),
    AUTH_APP_URL: z.string().url().optional().default("http://localhost:3001"),
    AUTH_API_URL: z.string().url().optional().default("http://localhost:8000"),
    AUTH_API_V1_STR: z.string().optional().default("/api/v1"),
    SESSION_COOKIE_NAME: z.string().optional().default("grenmet_session"),
    SESSION_COOKIE_DOMAIN: z.string().optional(),
    // CAP alert API base URL (falls back to AUTH_API_URL when unset).
    CAP_API_URL: z.string().url().optional(),
    // Dedicated Postgres connection for the wxwatch weather-image gallery.
    WXWATCH_DATABASE_URL: z.string().min(1).optional(),
    // Dedicated Postgres connection for the wxproducts forecast products.
    WXPRODUCTS_DATABASE_URL: z.string().min(1).optional(),
    // Dedicated Postgres connection for the janitorial cleaning-spec catalogue.
    JANITORIAL_DATABASE_URL: z.string().min(1).optional(),
    // Dedicated Postgres connection for the staff transportation timetable.
    TRANSPORT_DATABASE_URL: z.string().min(1).optional(),
  },
  client: {
    NEXT_PUBLIC_API_URL: z.string().optional().default(""),
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
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    AUTH_APP_URL: process.env.AUTH_APP_URL,
    AUTH_API_URL: process.env.AUTH_API_URL,
    AUTH_API_V1_STR: process.env.AUTH_API_V1_STR,
    SESSION_COOKIE_NAME: process.env.SESSION_COOKIE_NAME,
    SESSION_COOKIE_DOMAIN: process.env.SESSION_COOKIE_DOMAIN,
    CAP_API_URL: process.env.CAP_API_URL,
    WXWATCH_DATABASE_URL: process.env.WXWATCH_DATABASE_URL,
    WXPRODUCTS_DATABASE_URL: process.env.WXPRODUCTS_DATABASE_URL,
    JANITORIAL_DATABASE_URL: process.env.JANITORIAL_DATABASE_URL,
    TRANSPORT_DATABASE_URL: process.env.TRANSPORT_DATABASE_URL,
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL ?? "",
    NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
    NEXT_PUBLIC_SENTRY_ENVIRONMENT: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT,
    NEXT_PUBLIC_POSTHOG_KEY: process.env.NEXT_PUBLIC_POSTHOG_KEY,
    NEXT_PUBLIC_POSTHOG_HOST: process.env.NEXT_PUBLIC_POSTHOG_HOST,
  },
});
