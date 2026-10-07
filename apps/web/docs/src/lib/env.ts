import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  server: {
    // Sign in with the Barrels account (ADR-0017): host-only cookie, and the
    // secret that redeems single sign-on codes (unset hides "Sign in").
    AUTH_APP_URL: z.string().url().optional().default("http://localhost:3000"),
    DOCS_SESSION_COOKIE_NAME: z.string().optional().default("docs_session"),
    // Deployment passes "" when the secret isn't set: treat that as off.
    DOCS_SSO_CLIENT_SECRET: z.preprocess(
      (value) => value || undefined,
      z.string().min(32).optional()
    ),
    // Auth-delegating — redirects to web-auth for login
    AUTH_API_URL: z.string().url().optional().default("http://localhost:8000"),
    AUTH_API_V1_STR: z.string().optional().default("/api/v1"),
    AUTH_ALLOWED_RETURN_HOSTS: z.string().optional().default(""),
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
    AUTH_APP_URL: process.env.AUTH_APP_URL,
    DOCS_SESSION_COOKIE_NAME: process.env.DOCS_SESSION_COOKIE_NAME,
    DOCS_SSO_CLIENT_SECRET: process.env.DOCS_SSO_CLIENT_SECRET,
    AUTH_API_URL: process.env.AUTH_API_URL,
    AUTH_API_V1_STR: process.env.AUTH_API_V1_STR,
    AUTH_ALLOWED_RETURN_HOSTS: process.env.AUTH_ALLOWED_RETURN_HOSTS,
    NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
    NEXT_PUBLIC_SENTRY_ENVIRONMENT: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT,
    NEXT_PUBLIC_POSTHOG_KEY: process.env.NEXT_PUBLIC_POSTHOG_KEY,
    NEXT_PUBLIC_POSTHOG_HOST: process.env.NEXT_PUBLIC_POSTHOG_HOST,
  },
});
