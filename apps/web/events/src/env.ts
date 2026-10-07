import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  server: {
    AUTH_API_URL: z.string().url().optional().default("http://localhost:8000"),
    AUTH_API_V1_STR: z.string().optional().default("/api/v1"),
    AUTH_APP_URL: z.string().url().optional().default("http://localhost:3000"),
    // Redeems single sign-on codes from auth.barrels.gd (ADR-0017). Unset
    // hides "Continue with your Barrels account".
    EVENTS_SSO_CLIENT_SECRET: z.string().min(32).optional(),
    // Host-only cookie for Events sign-in (ADR-0016): never set a Domain.
    EVENTS_SESSION_COOKIE_NAME: z.string().optional().default("events_session"),
  },
  client: {},
  runtimeEnv: {
    AUTH_API_URL: process.env.AUTH_API_URL,
    AUTH_API_V1_STR: process.env.AUTH_API_V1_STR,
    AUTH_APP_URL: process.env.AUTH_APP_URL,
    EVENTS_SSO_CLIENT_SECRET: process.env.EVENTS_SSO_CLIENT_SECRET,
    EVENTS_SESSION_COOKIE_NAME: process.env.EVENTS_SESSION_COOKIE_NAME,
  },
  emptyStringAsUndefined: true,
  skipValidation: process.env.SKIP_ENV_VALIDATION === "true",
});
