import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  server: {
    RESEND_API_KEY: z.string().min(1),
    AUTH_APP_URL: z.string().url().optional().default("http://localhost:3000"),
    AUTH_API_URL: z.string().url().optional().default("http://localhost:8000"),
    AUTH_API_V1_STR: z.string().optional().default("/api/v1"),
    // Host-only session (ADR-0017). FastAPI's cookie routes read the same
    // name (BROWSER_SESSION_COOKIE_NAME), so change both together.
    ADMIN_SESSION_COOKIE_NAME: z.string().optional().default("admin_session"),
    // Redeems single sign-on codes from auth.barrels.gd.
    GAA_ADMIN_SSO_CLIENT_SECRET: z.string().min(32).optional(),
    // CAP alert API base URL (falls back to AUTH_API_URL when unset).
    CAP_API_URL: z.string().url().optional(),
    // Janitor PWA origin; area QR labels link to `${JANITOR_APP_URL}/a/<code>`.
    // When unset, labels encode the bare area code.
    JANITOR_APP_URL: z.string().url().optional(),
  },
  client: {
    NEXT_PUBLIC_WXWATCH_OBJECT_STORAGE: z
      .enum(["true", "false"])
      .default("false"),
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
    ADMIN_SESSION_COOKIE_NAME: process.env.ADMIN_SESSION_COOKIE_NAME,
    GAA_ADMIN_SSO_CLIENT_SECRET: process.env.GAA_ADMIN_SSO_CLIENT_SECRET,
    CAP_API_URL: process.env.CAP_API_URL,
    JANITOR_APP_URL: process.env.JANITOR_APP_URL,
    NEXT_PUBLIC_WXWATCH_OBJECT_STORAGE:
      process.env.NEXT_PUBLIC_WXWATCH_OBJECT_STORAGE,
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL ?? "",
    NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
    NEXT_PUBLIC_SENTRY_ENVIRONMENT: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT,
    NEXT_PUBLIC_POSTHOG_KEY: process.env.NEXT_PUBLIC_POSTHOG_KEY,
    NEXT_PUBLIC_POSTHOG_HOST: process.env.NEXT_PUBLIC_POSTHOG_HOST,
  },
});
