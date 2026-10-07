import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  server: {
    AUTH_API_URL: z.string().url().optional().default("http://localhost:8000"),
    AUTH_API_V1_STR: z.string().optional().default("/api/v1"),
    // Sign in with the Barrels account (ADR-0017): host-only cookie, and the
    // secret that redeems single sign-on codes (unset hides "Sign in").
    AUTH_APP_URL: z.string().url().optional().default("http://localhost:3000"),
    ELECTIONS_SESSION_COOKIE_NAME: z
      .string()
      .optional()
      .default("elections_session"),
    // Deployment passes "" when the secret isn't set: treat that as off.
    ELECTIONS_SSO_CLIENT_SECRET: z.preprocess(
      (value) => value || undefined,
      z.string().min(32).optional()
    ),
  },
  client: {},
  runtimeEnv: {
    AUTH_API_URL: process.env.AUTH_API_URL,
    AUTH_API_V1_STR: process.env.AUTH_API_V1_STR,
    AUTH_APP_URL: process.env.AUTH_APP_URL,
    ELECTIONS_SESSION_COOKIE_NAME: process.env.ELECTIONS_SESSION_COOKIE_NAME,
    ELECTIONS_SSO_CLIENT_SECRET: process.env.ELECTIONS_SSO_CLIENT_SECRET,
  },
  skipValidation: process.env.SKIP_ENV_VALIDATION === "true",
});
