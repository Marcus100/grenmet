/**
 * Content-Security-Policy builder for the Next.js apps (Report-Only on `docs`,
 * `signal`, `bookings`, `account`, `mbia`, `elections`, `babydoll`, `admin`,
 * `auth`, `cap`, `cms`, `events`, `gaa-admin`, `gms` and `gmsdash`).
 *
 * Traefik already sends HSTS, nosniff, X-Frame-Options and Referrer-Policy on
 * every host, so this module only produces the CSP header (and the
 * Reporting-Endpoints header when a report URL exists).
 *
 * The apps are statically rendered, so per-request nonces are impossible and
 * the policy uses `'unsafe-inline'` for scripts (Next inlines flight data).
 * The header is Report-Only: it never blocks anything.
 *
 * Development (`isProduction: false`) emits no header: Next dev needs
 * `'unsafe-eval'` and websockets for HMR, and dev reports would only add noise.
 */

export type CspApp =
  | "docs"
  | "signal"
  | "bookings"
  | "account"
  | "mbia"
  | "elections"
  | "babydoll"
  | "admin"
  | "auth"
  | "cap"
  | "cms"
  | "events"
  | "gaa-admin"
  | "gms"
  | "gmsdash"
  | "hr";

/**
 * The PostHog ingest hosts the signed-in funnels may reach. Defined here, not
 * in funnel-analytics.ts, because next.config loads this file under Node ESM,
 * which cannot resolve extensionless relative imports. funnel-analytics.ts
 * imports the constant from here.
 */
export const POSTHOG_INGEST_HOSTS = [
  "https://us.i.posthog.com",
  "https://eu.i.posthog.com",
] as const;

const GA_SCRIPT = ["https://www.googletagmanager.com"] as const;
const GA_CONNECT = [
  "https://www.google-analytics.com",
  "https://region1.google-analytics.com",
  "https://www.googletagmanager.com",
  // GA4 measurement hits (`/g/collect`) moved to this host.
  "https://www.google.com",
] as const;
const GA_IMG = [
  "https://www.google-analytics.com",
  "https://www.googletagmanager.com",
] as const;
const PROJECT_ID = /^\d+$/u;
const TURNSTILE = "https://challenges.cloudflare.com";
// Cloudflare Web Analytics: the edge injects this beacon into every site it
// serves, so it is part of the shared baseline for all apps.
const CLOUDFLARE_INSIGHTS_SCRIPT = "https://static.cloudflareinsights.com";
const CLOUDFLARE_INSIGHTS_CONNECT = "https://cloudflareinsights.com";

// Uploaded images (logos, covers, event pictures, profile photos): pages link
// the API's public file route, which redirects to the object store. Both
// environments' buckets are DigitalOcean Spaces in nyc3, addressed path-style
// (https://nyc3.digitaloceanspaces.com/<bucket>/...), and the browser uploads to
// the same host with a presigned PUT. Sentry CSP reports of 24 Nov 2026 (#1622).
const API_ORIGINS = [
  "https://api.barrels.gd",
  "https://api.staging.barrels.gd",
] as const;
const OBJECT_STORE = "https://nyc3.digitaloceanspaces.com";
const UPLOADED_IMAGES = [...API_ORIGINS, OBJECT_STORE] as const;

interface AppSources {
  connect: readonly string[];
  frame: readonly string[];
  img: readonly string[];
  script: readonly string[];
}

/**
 * Per-app extra sources, added to the shared baseline. Later apps add one
 * entry. The PostHog ingest hosts are listed only for the signed-in funnel
 * apps (bookings, events, account), which send cookieless funnel events
 * (`funnel-analytics.ts`). Other apps stay without PostHog.
 */
export const APP_SOURCES: Record<CspApp, AppSources> = {
  docs: {
    script: [...GA_SCRIPT, TURNSTILE],
    connect: [...GA_CONNECT, TURNSTILE],
    img: GA_IMG,
    frame: [TURNSTILE],
  },
  signal: {
    script: [...GA_SCRIPT, TURNSTILE],
    connect: [...GA_CONNECT, TURNSTILE],
    img: GA_IMG,
    frame: [TURNSTILE],
  },
  // Logos, covers and the studio upload: UPLOADED_IMAGES and OBJECT_STORE.
  // Cookieless funnel events to PostHog (connect only; no script loads).
  bookings: {
    script: [TURNSTILE],
    connect: [TURNSTILE, ...POSTHOG_INGEST_HOSTS, OBJECT_STORE],
    img: [...UPLOADED_IMAGES],
    frame: [TURNSTILE],
  },
  // Cookieless funnel events to PostHog (connect only). Profile photos are
  // served through the same-origin proxy and redirect to the object store
  // (UPLOADED_IMAGES); the photo upload is a presigned PUT to OBJECT_STORE.
  account: {
    script: [],
    connect: [...POSTHOG_INGEST_HOSTS, OBJECT_STORE],
    img: [...UPLOADED_IMAGES],
    frame: [],
  },
  // Staff HR app (hr.barrels.gd): server-rendered, no third-party scripts.
  hr: {
    script: [],
    connect: [],
    img: [],
    frame: [],
  },
  // GA4 in production (service-catalogue `mbia`); no PostHog project. The
  // contact form's Turnstile widget is the only third party besides GA.
  mbia: {
    script: [...GA_SCRIPT, TURNSTILE],
    connect: [...GA_CONNECT, TURNSTILE],
    img: GA_IMG,
    frame: [TURNSTILE],
  },
  // GA4 in production (service-catalogue `elections`); no PostHog project and
  // no forms, so no Turnstile. Search, atlas and forecast data are same-origin.
  elections: {
    script: [...GA_SCRIPT],
    connect: [...GA_CONNECT],
    img: GA_IMG,
    frame: [],
  },
  // No analytics (publicAnalytics false). The booking flow on /book and
  // /booking/[token] renders Turnstile when a site key is set. Booking calls
  // run server-side, so the API origin is not a browser source.
  babydoll: {
    script: [TURNSTILE],
    connect: [TURNSTILE],
    img: [],
    frame: [TURNSTILE],
  },
  // Staff console. Sentry only (added by the builder when a DSN is set). No
  // client-side API calls: the app reads FastAPI from the server.
  admin: {
    script: [],
    connect: [],
    img: [],
    frame: [],
  },
  // Sign-in. The email-code form renders Turnstile when its site key is set.
  // PostHogProvider is mounted without an `app`, so it never starts analytics.
  auth: {
    script: [TURNSTILE],
    connect: [TURNSTILE],
    img: [],
    frame: [TURNSTILE],
  },
  // Staff warning desk and public CAP hub. No third party: the map has no tile
  // source and its worker is a same-origin file (maplibre-gl-worker.mjs).
  cap: {
    script: [],
    connect: [],
    img: [],
    frame: [],
  },
  // Payload admin. No third-party origin in the code under apps/web/cms, and
  // the admin is same-origin. 'unsafe-eval' is not added: this change did not
  // verify that Payload's admin bundle needs it. The Report-Only window will
  // show an eval violation if it does, and the fix is then a reviewed change.
  cms: {
    script: [],
    connect: [],
    img: [],
    frame: [],
  },
  // GA4 in production (service-catalogue `events`); no consent-gated PostHog and no
  // Turnstile widget. Event images and avatars are same-origin /files/<id>
  // links that redirect to the object store (UPLOADED_IMAGES); organiser
  // uploads are presigned PUTs to OBJECT_STORE.
  // Cookieless funnel events to PostHog (connect only; no script loads).
  events: {
    script: [...GA_SCRIPT],
    connect: [...GA_CONNECT, ...POSTHOG_INGEST_HOSTS, OBJECT_STORE],
    img: [...GA_IMG, ...UPLOADED_IMAGES],
    frame: [],
  },
  // Operational console. Browser API calls use the same-origin proxy
  // (configureApiClient baseURL ""). The map worker is same-origin. The PDF and
  // forecast previews are iframes on blob: object URLs.
  "gaa-admin": {
    script: [],
    connect: [],
    // Staff profile photos: same-origin proxy that redirects to the object store.
    img: [OBJECT_STORE],
    frame: ["'self'", "blob:"],
  },
  // GA4 in production (service-catalogue `gms`). Turnstile guards the
  // newsletter and data-request forms. Click-to-load media embeds (YouTube
  // no-cookie, Facebook video, SoundCloud) are the only iframes. Unoptimised
  // images load straight from the CMS on staging (cms-images.ts), so the staging
  // CMS media host is listed.
  gms: {
    script: [...GA_SCRIPT, TURNSTILE],
    connect: [...GA_CONNECT, TURNSTILE],
    img: [...GA_IMG, "https://cms.staging.barrels.gd"],
    frame: [
      "https://www.youtube-nocookie.com",
      "https://www.facebook.com",
      "https://w.soundcloud.com",
    ],
  },
  // Public GMS dashboard, server-rendered. Sentry only.
  gmsdash: {
    script: [],
    connect: [],
    img: [],
    frame: [],
  },
};

export interface SentryReporting {
  /** Origin the browser SDK sends events to; must be in connect-src. */
  ingestOrigin: string;
  /** `https://<host>/api/<projectId>/security/?sentry_key=<key>[&sentry_environment=<env>]` */
  reportUrl: string;
}

/**
 * Derives Sentry's security-report endpoint from a DSN of the form
 * `https://<publicKey>@<host>/<projectId>`. The `/api/<projectId>/security/
 * ?sentry_key=` format is Sentry's documented CSP report endpoint (Security
 * Policy Reporting); `sentry_environment` is an optional query parameter.
 * Returns null for a missing or malformed DSN; never throws.
 */
export function sentryReporting(
  dsn: string | undefined,
  environment?: string
): SentryReporting | null {
  if (!dsn) {
    return null;
  }
  let url: URL;
  try {
    url = new URL(dsn);
  } catch {
    return null;
  }
  const segments = url.pathname.split("/").filter(Boolean);
  const projectId = segments.at(-1);
  if (
    url.protocol !== "https:" ||
    !url.username ||
    !projectId ||
    !PROJECT_ID.test(projectId)
  ) {
    return null;
  }
  const prefix = segments
    .slice(0, -1)
    .map((segment) => `/${segment}`)
    .join("");
  const params = new URLSearchParams({ sentry_key: url.username });
  if (environment) {
    params.set("sentry_environment", environment);
  }
  return {
    reportUrl: `${url.origin}${prefix}/api/${projectId}/security/?${params.toString()}`,
    ingestOrigin: url.origin,
  };
}

export interface CspOptions {
  app: CspApp;
  /** Raw `NEXT_PUBLIC_SENTRY_DSN`; optional. */
  dsn?: string;
  /** `NEXT_PUBLIC_SENTRY_ENVIRONMENT`; optional. */
  environment?: string;
}

/** Serialises the policy. Directive order is stable for tests and diffs. */
export function buildContentSecurityPolicy({
  app,
  dsn,
  environment,
}: CspOptions): string {
  const extra = APP_SOURCES[app];
  const sentry = sentryReporting(dsn, environment);
  const directives: Record<string, readonly string[]> = {
    "default-src": ["'self'"],
    "script-src": [
      "'self'",
      "'unsafe-inline'",
      CLOUDFLARE_INSIGHTS_SCRIPT,
      ...extra.script,
    ],
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:", ...extra.img],
    "font-src": ["'self'"],
    "connect-src": [
      "'self'",
      CLOUDFLARE_INSIGHTS_CONNECT,
      ...extra.connect,
      ...(sentry ? [sentry.ingestOrigin] : []),
    ],
    "frame-src": extra.frame.length > 0 ? extra.frame : ["'none'"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "frame-ancestors": ["'self'"],
    "worker-src": ["'self'"],
    ...(sentry && {
      "report-uri": [sentry.reportUrl],
      "report-to": ["csp-endpoint"],
    }),
  };
  return Object.entries(directives)
    .map(([name, values]) => `${name} ${values.join(" ")}`)
    .join("; ");
}

export interface HeaderEntry {
  key: string;
  value: string;
}

/**
 * Headers for `next.config` `headers()`. Empty outside production.
 * Report-Only only: enforcement follows a clean report window per app.
 */
export function contentSecurityPolicyHeaders(
  options: CspOptions & { isProduction: boolean }
): HeaderEntry[] {
  if (!options.isProduction) {
    return [];
  }
  const headers: HeaderEntry[] = [
    {
      key: "Content-Security-Policy-Report-Only",
      value: buildContentSecurityPolicy(options),
    },
  ];
  const sentry = sentryReporting(options.dsn, options.environment);
  if (sentry) {
    headers.push({
      key: "Reporting-Endpoints",
      value: `csp-endpoint="${sentry.reportUrl}"`,
    });
  }
  return headers;
}
