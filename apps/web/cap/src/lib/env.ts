import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  server: {
    APP_BASE_URL: z.string().url().optional().default("http://localhost:3008"),
    AUTH_APP_URL: z.string().url().optional().default("http://localhost:3000"),
    AUTH_API_URL: z.string().url().optional().default("http://localhost:8000"),
    AUTH_API_V1_STR: z.string().optional().default("/api/v1"),
    CAP_API_URL: z.string().url().optional(),
    SESSION_COOKIE_NAME: z.string().optional().default("grenmet_session"),
    SESSION_COOKIE_DOMAIN: z.string().optional(),
  },
  client: {},
  runtimeEnv: {
    APP_BASE_URL: process.env.APP_BASE_URL,
    AUTH_APP_URL: process.env.AUTH_APP_URL,
    AUTH_API_URL: process.env.AUTH_API_URL,
    AUTH_API_V1_STR: process.env.AUTH_API_V1_STR,
    CAP_API_URL: process.env.CAP_API_URL,
    SESSION_COOKIE_NAME: process.env.SESSION_COOKIE_NAME,
    SESSION_COOKIE_DOMAIN: process.env.SESSION_COOKIE_DOMAIN,
  },
});
