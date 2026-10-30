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
    // Proxies in front of this server that append to x-forwarded-for. 1: a
    // Traefik that does not trust its peer; 2: Cloudflare plus a Traefik that
    // trusts it. Counted from the right; never from the left (visitor-set).
    VISITOR_IP_PROXY_HOPS: z.coerce.number().int().min(1).max(5).default(1),
    // Shared with the API TRUSTED_WEB_SECRET so it rate-limits each visitor
    // separately. Unset: every visitor shares this server's bucket. Set but
    // under 32 characters: startup fails.
    TRUSTED_WEB_SECRET: z.string().min(32).optional(),
    // Host-only cookie for Events sign-in (ADR-0016): never set a Domain.
    EVENTS_SESSION_COOKIE_NAME: z.string().optional().default("events_session"),
  },
  client: {
    // Canonical public address, for absolute share-preview links (metadataBase).
    NEXT_PUBLIC_SITE_URL: z
      .string()
      .url()
      .optional()
      .default("http://localhost:3009"),
  },
  runtimeEnv: {
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
    AUTH_API_URL: process.env.AUTH_API_URL,
    AUTH_API_V1_STR: process.env.AUTH_API_V1_STR,
    AUTH_APP_URL: process.env.AUTH_APP_URL,
    EVENTS_SSO_CLIENT_SECRET: process.env.EVENTS_SSO_CLIENT_SECRET,
    EVENTS_SESSION_COOKIE_NAME: process.env.EVENTS_SESSION_COOKIE_NAME,
    VISITOR_IP_PROXY_HOPS: process.env.VISITOR_IP_PROXY_HOPS,
    TRUSTED_WEB_SECRET: process.env.TRUSTED_WEB_SECRET,
  },
  emptyStringAsUndefined: true,
  skipValidation: process.env.SKIP_ENV_VALIDATION === "true",
});
