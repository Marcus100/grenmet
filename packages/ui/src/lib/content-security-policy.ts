/**
 * Content-Security-Policy builder for the Next.js apps (Report-Only on `docs`,
 * `signal`, `bookings`, `mbia`, `elections` and `babydoll`).
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
  | "mbia"
  | "elections"
  | "babydoll";

const GA_SCRIPT = ["https://www.googletagmanager.com"] as const;
const GA_CONNECT = [
  "https://www.google-analytics.com",
  "https://region1.google-analytics.com",
  "https://www.googletagmanager.com",
] as const;
const GA_IMG = [
  "https://www.google-analytics.com",
  "https://www.googletagmanager.com",
] as const;
const PROJECT_ID = /^\d+$/;
const TURNSTILE = "https://challenges.cloudflare.com";

interface AppSources {
  connect: readonly string[];
  frame: readonly string[];
  img: readonly string[];
  script: readonly string[];
}

/**
 * Per-app extra sources, added to the shared baseline. Later apps add one
 * entry. PostHog is deliberately absent: service-catalogue.json maps no
 * PostHog project for these apps, so the loader never starts. Add
 * `https://us.i.posthog.com` to connect-src if that changes.
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
  // No analytics (publicAnalytics false in the catalogue). Turnstile is added
  // here with the public booking form, not before.
  bookings: {
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
    "script-src": ["'self'", "'unsafe-inline'", ...extra.script],
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:", ...extra.img],
    "font-src": ["'self'"],
    "connect-src": [
      "'self'",
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
