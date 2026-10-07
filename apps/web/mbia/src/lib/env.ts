import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  server: {
    AUTH_API_URL: z.string().url().optional().default("http://localhost:8000"),
    AUTH_API_V1_STR: z.string().optional().default("/api/v1"),
    // Sign in with the Barrels account (ADR-0017): host-only cookie, and the
    // secret that redeems single sign-on codes (unset hides "Sign in").
    AUTH_APP_URL: z.string().url().optional().default("http://localhost:3000"),
    MBIA_SESSION_COOKIE_NAME: z.string().optional().default("mbia_session"),
    // Deployment passes "" when the secret isn't set: treat that as off.
    MBIA_SSO_CLIENT_SECRET: z.preprocess(
      (value) => value || undefined,
      z.string().min(32).optional()
    ),
  },
  client: {
    NEXT_PUBLIC_SITE_URL: z
      .string()
      .url()
      .optional()
      .default("http://localhost:3005"),
    NEXT_PUBLIC_SENTRY_DSN: z.string().optional(),
    NEXT_PUBLIC_SENTRY_ENVIRONMENT: z
      .string()
      .optional()
      .default("development"),
  },
  runtimeEnv: {
    AUTH_API_URL: process.env.AUTH_API_URL,
    AUTH_API_V1_STR: process.env.AUTH_API_V1_STR,
    AUTH_APP_URL: process.env.AUTH_APP_URL,
    MBIA_SESSION_COOKIE_NAME: process.env.MBIA_SESSION_COOKIE_NAME,
    MBIA_SSO_CLIENT_SECRET: process.env.MBIA_SSO_CLIENT_SECRET,
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
    NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
    NEXT_PUBLIC_SENTRY_ENVIRONMENT: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT,
  },
});
