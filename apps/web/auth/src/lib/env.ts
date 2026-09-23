import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  server: {
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    AUTH_API_URL: z.string().url().optional().default("http://localhost:8000"),
    AUTH_APP_URL: z.string().url().optional().default("http://localhost:3000"),
    AUTH_API_V1_STR: z.string().optional().default("/api/v1"),
    SESSION_COOKIE_NAME: z.string().optional().default("grenmet_session"),
    SESSION_COOKIE_DOMAIN: z.string().optional(),
    AUTH_ALLOWED_RETURN_HOSTS: z.string().optional().default(""),
    // Shared secret that FastAPI must present when calling the /api/email/render endpoint.
    EMAIL_RENDER_SECRET: z.string().optional(),
    // App directory links on the account pages. Unset in production hides the
    // link; development falls back to the local ports in docs/ports.md.
    ADMIN_APP_URL: z.string().url().optional(),
    MBIA_APP_URL: z.string().url().optional(),
    GMS_APP_URL: z.string().url().optional(),
    DOCS_APP_URL: z.string().url().optional(),
    SIGNAL_APP_URL: z.string().url().optional(),
    EVENTS_APP_URL: z.string().url().optional(),
  },
  client: {
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
    NODE_ENV: process.env.NODE_ENV,
    AUTH_API_URL: process.env.AUTH_API_URL,
    AUTH_APP_URL: process.env.AUTH_APP_URL,
    AUTH_API_V1_STR: process.env.AUTH_API_V1_STR,
    SESSION_COOKIE_NAME: process.env.SESSION_COOKIE_NAME,
    SESSION_COOKIE_DOMAIN: process.env.SESSION_COOKIE_DOMAIN,
    AUTH_ALLOWED_RETURN_HOSTS: process.env.AUTH_ALLOWED_RETURN_HOSTS,
    EMAIL_RENDER_SECRET: process.env.EMAIL_RENDER_SECRET,
    ADMIN_APP_URL: process.env.ADMIN_APP_URL,
    MBIA_APP_URL: process.env.MBIA_APP_URL,
    GMS_APP_URL: process.env.GMS_APP_URL,
    DOCS_APP_URL: process.env.DOCS_APP_URL,
    SIGNAL_APP_URL: process.env.SIGNAL_APP_URL,
    EVENTS_APP_URL: process.env.EVENTS_APP_URL,
    NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
    NEXT_PUBLIC_SENTRY_ENVIRONMENT: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT,
    NEXT_PUBLIC_POSTHOG_KEY: process.env.NEXT_PUBLIC_POSTHOG_KEY,
    NEXT_PUBLIC_POSTHOG_HOST: process.env.NEXT_PUBLIC_POSTHOG_HOST,
  },
});
