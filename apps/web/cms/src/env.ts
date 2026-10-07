import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";
export const mediaDirectory = z
  .string()
  .min(1)
  .parse(process.env.CMS_MEDIA_DIR || "media");
export const testDatabaseUrl = process.env.CMS_TEST_DATABASE_URL;
export function getEnv() {
  const env = createEnv({
    server: {
      PAYLOAD_SECRET: z.string().min(32),
      RESEND_API_KEY: z.string().min(1).optional(),
      EMAILS_FROM_EMAIL: z.email().optional(),
      EMAILS_FROM_NAME: z.string().min(1).default("GMS Content"),
      DATABASE_URL: z.url(),
      AUTH_API_URL: z.url().default("http://localhost:8000"),
      AUTH_APP_URL: z.url().default("http://localhost:3000"),
      CMS_URL: z.url().default("http://localhost:3006"),
      CMS_DEPARTMENT_ID: z.string().default("GMS"),
      // Host-only session (ADR-0017): never a Domain.
      CMS_SESSION_COOKIE_NAME: z.string().default("cms_session"),
      // Redeems single sign-on codes from auth.barrels.gd.
      CMS_SSO_CLIENT_SECRET: z.string().min(32).optional(),
    },
    runtimeEnv: {
      PAYLOAD_SECRET: process.env.PAYLOAD_SECRET,
      RESEND_API_KEY: process.env.RESEND_API_KEY,
      EMAILS_FROM_EMAIL: process.env.EMAILS_FROM_EMAIL,
      EMAILS_FROM_NAME: process.env.EMAILS_FROM_NAME,
      DATABASE_URL: process.env.DATABASE_URL,
      AUTH_API_URL: process.env.AUTH_API_URL,
      AUTH_APP_URL: process.env.AUTH_APP_URL,
      CMS_URL: process.env.CMS_URL,
      CMS_DEPARTMENT_ID: process.env.CMS_DEPARTMENT_ID,
      CMS_SESSION_COOKIE_NAME: process.env.CMS_SESSION_COOKIE_NAME,
      CMS_SSO_CLIENT_SECRET: process.env.CMS_SSO_CLIENT_SECRET,
    },
    emptyStringAsUndefined: true,
  });
  if (env.RESEND_API_KEY && !env.EMAILS_FROM_EMAIL) {
    throw new Error(
      "CMS EMAILS_FROM_EMAIL is required when RESEND_API_KEY is configured"
    );
  }
  return env;
}
