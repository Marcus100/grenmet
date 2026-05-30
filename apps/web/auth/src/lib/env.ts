import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  server: {
    AUTH_API_URL: z.string().url().optional().default("http://localhost:8000"),
    AUTH_API_V1_STR: z.string().optional().default("/api/v1"),
    SESSION_COOKIE_NAME: z.string().optional().default("grenmet_session"),
    SESSION_COOKIE_DOMAIN: z.string().optional(),
    AUTH_ALLOWED_RETURN_HOSTS: z.string().optional().default(""),
    // Shared secret that FastAPI must present when calling the /api/email/render endpoint.
    EMAIL_RENDER_SECRET: z.string().optional(),
  },
  client: {
    NEXT_PUBLIC_POSTHOG_KEY: z.string().optional().default(""),
    NEXT_PUBLIC_POSTHOG_HOST: z
      .string()
      .optional()
      .default("https://us.i.posthog.com"),
  },
  runtimeEnv: {
    AUTH_API_URL: process.env.AUTH_API_URL,
    AUTH_API_V1_STR: process.env.AUTH_API_V1_STR,
    SESSION_COOKIE_NAME: process.env.SESSION_COOKIE_NAME,
    SESSION_COOKIE_DOMAIN: process.env.SESSION_COOKIE_DOMAIN,
    AUTH_ALLOWED_RETURN_HOSTS: process.env.AUTH_ALLOWED_RETURN_HOSTS,
    EMAIL_RENDER_SECRET: process.env.EMAIL_RENDER_SECRET,
    NEXT_PUBLIC_POSTHOG_KEY: process.env.NEXT_PUBLIC_POSTHOG_KEY,
    NEXT_PUBLIC_POSTHOG_HOST: process.env.NEXT_PUBLIC_POSTHOG_HOST,
  },
});
