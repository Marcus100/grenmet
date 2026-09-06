import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";
export const testDatabaseUrl = process.env.CMS_TEST_DATABASE_URL;
export function getEnv() {
  return createEnv({
    server: {
      PAYLOAD_SECRET: z.string().min(32),
      DATABASE_URL: z.url(),
      AUTH_API_URL: z.url().default("http://localhost:8000"),
      AUTH_APP_URL: z.url().default("http://localhost:3000"),
      CMS_URL: z.url().default("http://localhost:3006"),
      CMS_DEPARTMENT_ID: z.string().default("GMS"),
      SESSION_COOKIE_NAME: z.string().default("grenmet_session"),
      SESSION_COOKIE_DOMAIN: z.string().optional(),
    },
    runtimeEnv: {
      PAYLOAD_SECRET: process.env.PAYLOAD_SECRET,
      DATABASE_URL: process.env.DATABASE_URL,
      AUTH_API_URL: process.env.AUTH_API_URL,
      AUTH_APP_URL: process.env.AUTH_APP_URL,
      CMS_URL: process.env.CMS_URL,
      CMS_DEPARTMENT_ID: process.env.CMS_DEPARTMENT_ID,
      SESSION_COOKIE_NAME: process.env.SESSION_COOKIE_NAME,
      SESSION_COOKIE_DOMAIN: process.env.SESSION_COOKIE_DOMAIN,
    },
  });
}
