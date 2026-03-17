import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  server: {
    AUTH_API_URL: z.string().url().optional().default("http://localhost:8000"),
    AUTH_API_V1_STR: z.string().optional().default("/api/v1"),
    SESSION_COOKIE_NAME: z.string().optional().default("grenmet_session"),
    SESSION_COOKIE_DOMAIN: z.string().optional(),
    AUTH_ALLOWED_RETURN_HOSTS: z.string().optional().default(""),
  },
  runtimeEnv: {
    AUTH_API_URL: process.env.AUTH_API_URL,
    AUTH_API_V1_STR: process.env.AUTH_API_V1_STR,
    SESSION_COOKIE_NAME: process.env.SESSION_COOKIE_NAME,
    SESSION_COOKIE_DOMAIN: process.env.SESSION_COOKIE_DOMAIN,
    AUTH_ALLOWED_RETURN_HOSTS: process.env.AUTH_ALLOWED_RETURN_HOSTS,
  },
});
