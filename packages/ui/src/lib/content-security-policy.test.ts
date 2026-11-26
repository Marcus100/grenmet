import { describe, expect, it } from "vitest";
import {
  APP_SOURCES,
  buildContentSecurityPolicy,
  type CspApp,
  contentSecurityPolicyHeaders,
  sentryReporting,
} from "./content-security-policy";

const DSN = "https://abc123@o1.ingest.sentry.io/4507";
const REPORT =
  "https://o1.ingest.sentry.io/api/4507/security/?sentry_key=abc123&sentry_environment=production";

const GA_CONNECT =
  "https://www.google-analytics.com https://region1.google-analytics.com https://www.googletagmanager.com https://www.google.com";

function expected(sentry: boolean): string {
  return [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' https://static.cloudflareinsights.com https://www.googletagmanager.com https://challenges.cloudflare.com",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://www.google-analytics.com https://www.googletagmanager.com",
    "font-src 'self'",
    `connect-src 'self' https://cloudflareinsights.com ${GA_CONNECT} https://challenges.cloudflare.com${sentry ? " https://o1.ingest.sentry.io" : ""}`,
    "frame-src https://challenges.cloudflare.com",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'self'",
    "worker-src 'self'",
    ...(sentry ? [`report-uri ${REPORT}`, "report-to csp-endpoint"] : []),
  ].join("; ");
}

describe("sentryReporting", () => {
  it("derives the security endpoint from a valid DSN", () => {
    expect(sentryReporting(DSN, "production")).toEqual({
      reportUrl: REPORT,
      ingestOrigin: "https://o1.ingest.sentry.io",
    });
  });

  it("omits the environment when unknown", () => {
    expect(sentryReporting(DSN)?.reportUrl).toBe(
      "https://o1.ingest.sentry.io/api/4507/security/?sentry_key=abc123"
    );
  });

  it("encodes the environment", () => {
    const url = sentryReporting(DSN, "a b;c")?.reportUrl ?? "";
    expect(url).toContain("sentry_environment=a+b%3Bc");
  });

  it.each([
    undefined,
    "",
    "not a url",
    "http://abc@host/1",
    "https://host/1",
    "https://abc@host/",
    "https://abc@host/notnumeric",
  ])("returns null for missing or malformed DSN %s", (dsn) => {
    expect(sentryReporting(dsn)).toBeNull();
  });
});

describe("buildContentSecurityPolicy", () => {
  it.each(["docs", "signal"] as const)(
    "serialises the %s policy with reporting",
    (app) => {
      expect(
        buildContentSecurityPolicy({ app, dsn: DSN, environment: "production" })
      ).toBe(expected(true));
    }
  );

  it("emits no reporting directives without a usable DSN", () => {
    for (const dsn of [undefined, "garbage"]) {
      const policy = buildContentSecurityPolicy({ app: "docs", dsn });
      expect(policy).toBe(expected(false));
      expect(policy).not.toContain("report-");
    }
  });

  it.each(["docs", "signal", "mbia", "elections", "babydoll"] as const)(
    "%s has no duplicate directives and no unsafe-eval",
    (app) => {
      const policy = buildContentSecurityPolicy({ app, dsn: DSN });
      const names = policy.split("; ").map((d) => d.split(" ")[0]);
      expect(new Set(names).size).toBe(names.length);
      expect(policy).not.toContain("unsafe-eval");
      expect(policy).not.toContain("report-sample");
      expect(policy).not.toContain("form-action");
    }
  );
});

describe("contentSecurityPolicyHeaders", () => {
  it("emits nothing outside production", () => {
    expect(
      contentSecurityPolicyHeaders({
        app: "docs",
        dsn: DSN,
        isProduction: false,
      })
    ).toEqual([]);
  });

  it("emits Report-Only plus Reporting-Endpoints in production", () => {
    expect(
      contentSecurityPolicyHeaders({
        app: "docs",
        dsn: DSN,
        environment: "production",
        isProduction: true,
      })
    ).toEqual([
      { key: "Content-Security-Policy-Report-Only", value: expected(true) },
      { key: "Reporting-Endpoints", value: `csp-endpoint="${REPORT}"` },
    ]);
  });

  it("omits Reporting-Endpoints and never sends an enforcing header", () => {
    const headers = contentSecurityPolicyHeaders({
      app: "signal",
      isProduction: true,
    });
    expect(headers.map((h) => h.key)).toEqual([
      "Content-Security-Policy-Report-Only",
    ]);
  });
});

const POSTHOG_HOSTS = "https://us.i.posthog.com https://eu.i.posthog.com";

// Uploaded images and the presigned upload host (#1622).
const OBJECT_STORE = "https://nyc3.digitaloceanspaces.com";
const UPLOADED_IMAGES = `https://api.barrels.gd https://api.staging.barrels.gd ${OBJECT_STORE}`;

describe("bookings policy", () => {
  // Turnstile guards the public booking form; funnel events go to PostHog.
  function expectedBookings(sentry: boolean): string {
    return [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' https://static.cloudflareinsights.com https://challenges.cloudflare.com",
      "style-src 'self' 'unsafe-inline'",
      `img-src 'self' data: blob: ${UPLOADED_IMAGES}`,
      "font-src 'self'",
      `connect-src 'self' https://cloudflareinsights.com https://challenges.cloudflare.com ${POSTHOG_HOSTS} ${OBJECT_STORE}${sentry ? " https://o1.ingest.sentry.io" : ""}`,
      "frame-src https://challenges.cloudflare.com",
      "object-src 'none'",
      "base-uri 'self'",
      "frame-ancestors 'self'",
      "worker-src 'self'",
      ...(sentry ? [`report-uri ${REPORT}`, "report-to csp-endpoint"] : []),
    ].join("; ");
  }

  it("serialises the policy with and without reporting", () => {
    expect(
      buildContentSecurityPolicy({
        app: "bookings",
        dsn: DSN,
        environment: "production",
      })
    ).toBe(expectedBookings(true));
    expect(buildContentSecurityPolicy({ app: "bookings" })).toBe(
      expectedBookings(false)
    );
  });

  it("is Report-Only in production and absent in development", () => {
    expect(
      contentSecurityPolicyHeaders({
        app: "bookings",
        isProduction: true,
      }).map((h) => h.key)
    ).toEqual(["Content-Security-Policy-Report-Only"]);
    expect(
      contentSecurityPolicyHeaders({ app: "bookings", isProduction: false })
    ).toEqual([]);
  });
});

const TURNSTILE = "https://challenges.cloudflare.com";
const GA_SCRIPT = "https://www.googletagmanager.com";
const GA_IMG =
  "https://www.google-analytics.com https://www.googletagmanager.com";
const SENTRY_CONNECT = "https://o1.ingest.sentry.io";
const SENTRY_REPORTING = [`report-uri ${REPORT}`, "report-to csp-endpoint"];

describe("mbia policy (GA4 plus the contact form's Turnstile)", () => {
  it("serialises the exact policy with reporting", () => {
    expect(
      buildContentSecurityPolicy({
        app: "mbia",
        dsn: DSN,
        environment: "production",
      })
    ).toBe(
      [
        "default-src 'self'",
        `script-src 'self' 'unsafe-inline' https://static.cloudflareinsights.com ${GA_SCRIPT} ${TURNSTILE}`,
        "style-src 'self' 'unsafe-inline'",
        `img-src 'self' data: blob: ${GA_IMG}`,
        "font-src 'self'",
        `connect-src 'self' https://cloudflareinsights.com ${GA_CONNECT} ${TURNSTILE} ${SENTRY_CONNECT}`,
        `frame-src ${TURNSTILE}`,
        "object-src 'none'",
        "base-uri 'self'",
        "frame-ancestors 'self'",
        "worker-src 'self'",
        ...SENTRY_REPORTING,
      ].join("; ")
    );
  });

  it("serialises the exact policy without reporting", () => {
    expect(buildContentSecurityPolicy({ app: "mbia" })).toBe(
      [
        "default-src 'self'",
        `script-src 'self' 'unsafe-inline' https://static.cloudflareinsights.com ${GA_SCRIPT} ${TURNSTILE}`,
        "style-src 'self' 'unsafe-inline'",
        `img-src 'self' data: blob: ${GA_IMG}`,
        "font-src 'self'",
        `connect-src 'self' https://cloudflareinsights.com ${GA_CONNECT} ${TURNSTILE}`,
        `frame-src ${TURNSTILE}`,
        "object-src 'none'",
        "base-uri 'self'",
        "frame-ancestors 'self'",
        "worker-src 'self'",
      ].join("; ")
    );
  });
});

describe("elections policy (GA4 only, no forms)", () => {
  it("serialises the exact policy with reporting", () => {
    expect(
      buildContentSecurityPolicy({
        app: "elections",
        dsn: DSN,
        environment: "production",
      })
    ).toBe(
      [
        "default-src 'self'",
        `script-src 'self' 'unsafe-inline' https://static.cloudflareinsights.com ${GA_SCRIPT}`,
        "style-src 'self' 'unsafe-inline'",
        `img-src 'self' data: blob: ${GA_IMG}`,
        "font-src 'self'",
        `connect-src 'self' https://cloudflareinsights.com ${GA_CONNECT} ${SENTRY_CONNECT}`,
        "frame-src 'none'",
        "object-src 'none'",
        "base-uri 'self'",
        "frame-ancestors 'self'",
        "worker-src 'self'",
        ...SENTRY_REPORTING,
      ].join("; ")
    );
  });

  it("serialises the exact policy without reporting", () => {
    expect(buildContentSecurityPolicy({ app: "elections" })).toBe(
      [
        "default-src 'self'",
        `script-src 'self' 'unsafe-inline' https://static.cloudflareinsights.com ${GA_SCRIPT}`,
        "style-src 'self' 'unsafe-inline'",
        `img-src 'self' data: blob: ${GA_IMG}`,
        "font-src 'self'",
        `connect-src 'self' https://cloudflareinsights.com ${GA_CONNECT}`,
        "frame-src 'none'",
        "object-src 'none'",
        "base-uri 'self'",
        "frame-ancestors 'self'",
        "worker-src 'self'",
      ].join("; ")
    );
  });
});

describe("babydoll policy (no analytics, Turnstile on /book)", () => {
  // Babydoll has no Sentry, so there is no reporting endpoint.
  const BABYDOLL_POLICY = [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline' https://static.cloudflareinsights.com ${TURNSTILE}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src 'self' https://cloudflareinsights.com ${TURNSTILE}`,
    `frame-src ${TURNSTILE}`,
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'self'",
    "worker-src 'self'",
  ].join("; ");

  it("serialises the exact policy", () => {
    expect(buildContentSecurityPolicy({ app: "babydoll" })).toBe(
      BABYDOLL_POLICY
    );
  });
});

describe("Report-Only headers for the static apps", () => {
  it.each(["mbia", "elections", "babydoll"] as const)(
    "%s sends only Report-Only in production",
    (app) => {
      expect(
        contentSecurityPolicyHeaders({ app, isProduction: true }).map(
          (h) => h.key
        )
      ).toEqual(["Content-Security-Policy-Report-Only"]);
    }
  );

  it.each(["mbia", "elections"] as const)(
    "%s emits no header outside production",
    (app) => {
      expect(
        contentSecurityPolicyHeaders({ app, dsn: DSN, isProduction: false })
      ).toEqual([]);
    }
  );
});

// The eight apps that had no CSP before. Each row is the app's expected extras,
// written out by hand so a change to APP_SOURCES fails here and must be
// reviewed. A new CspApp needs its own row; nothing enforces that at compile time.
interface Extras {
  connect: string;
  frame: string;
  img: string;
  script: string;
}

const NO_EXTRAS: Extras = { script: "", connect: "", img: "", frame: "" };

const NEW_APP_EXTRAS: Record<
  "admin" | "auth" | "cap" | "cms" | "events" | "gaa-admin" | "gms" | "gmsdash",
  Extras
> = {
  admin: NO_EXTRAS,
  auth: { script: TURNSTILE, connect: TURNSTILE, img: "", frame: TURNSTILE },
  cap: NO_EXTRAS,
  cms: NO_EXTRAS,
  events: {
    script: GA_SCRIPT,
    connect: `${GA_CONNECT} ${POSTHOG_HOSTS} ${OBJECT_STORE}`,
    img: `${GA_IMG} ${UPLOADED_IMAGES}`,
    frame: "",
  },
  "gaa-admin": { ...NO_EXTRAS, img: OBJECT_STORE, frame: "'self' blob:" },
  gms: {
    script: `${GA_SCRIPT} ${TURNSTILE}`,
    connect: `${GA_CONNECT} ${TURNSTILE}`,
    img: `${GA_IMG} https://cms.staging.barrels.gd`,
    frame:
      "https://www.youtube-nocookie.com https://www.facebook.com https://w.soundcloud.com",
  },
  gmsdash: NO_EXTRAS,
};

/** Serialises the shared shape with one app's extras, the way the builder does. */
function policyWith(extras: Extras, sentry: boolean): string {
  const add = (base: string, extra: string) =>
    extra ? `${base} ${extra}` : base;
  return [
    "default-src 'self'",
    add(
      "script-src 'self' 'unsafe-inline' https://static.cloudflareinsights.com",
      extras.script
    ),
    "style-src 'self' 'unsafe-inline'",
    add("img-src 'self' data: blob:", extras.img),
    "font-src 'self'",
    add(
      add("connect-src 'self' https://cloudflareinsights.com", extras.connect),
      sentry ? SENTRY_CONNECT : ""
    ),
    `frame-src ${extras.frame || "'none'"}`,
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'self'",
    "worker-src 'self'",
    ...(sentry ? SENTRY_REPORTING : []),
  ].join("; ");
}

describe("Report-Only policies for admin, auth, cap, cms, events, gaa-admin, gms and gmsdash", () => {
  it.each(Object.keys(NEW_APP_EXTRAS) as (keyof typeof NEW_APP_EXTRAS)[])(
    "%s serialises its exact policy with and without reporting",
    (app) => {
      expect(
        buildContentSecurityPolicy({ app, dsn: DSN, environment: "production" })
      ).toBe(policyWith(NEW_APP_EXTRAS[app], true));
      expect(buildContentSecurityPolicy({ app })).toBe(
        policyWith(NEW_APP_EXTRAS[app], false)
      );
    }
  );

  it.each(Object.keys(NEW_APP_EXTRAS) as (keyof typeof NEW_APP_EXTRAS)[])(
    "%s sends only Report-Only in production and never an enforcing CSP",
    (app) => {
      const headers = contentSecurityPolicyHeaders({
        app,
        dsn: DSN,
        environment: "production",
        isProduction: true,
      });
      expect(headers.map((h) => h.key)).toEqual([
        "Content-Security-Policy-Report-Only",
        "Reporting-Endpoints",
      ]);
      expect(headers[0]?.value).toBe(policyWith(NEW_APP_EXTRAS[app], true));
    }
  );

  it.each(Object.keys(NEW_APP_EXTRAS) as (keyof typeof NEW_APP_EXTRAS)[])(
    "%s emits no header outside production",
    (app) => {
      expect(
        contentSecurityPolicyHeaders({ app, dsn: DSN, isProduction: false })
      ).toEqual([]);
    }
  );

  it.each(Object.keys(NEW_APP_EXTRAS) as (keyof typeof NEW_APP_EXTRAS)[])(
    "%s has no unsafe-eval and no duplicate directives",
    (app) => {
      const policy = buildContentSecurityPolicy({ app, dsn: DSN });
      const names = policy.split("; ").map((d) => d.split(" ")[0]);
      expect(new Set(names).size).toBe(names.length);
      expect(policy).not.toContain("unsafe-eval");
    }
  );

  it("gaa-admin allows its own and blob: PDF frames only", () => {
    expect(buildContentSecurityPolicy({ app: "gaa-admin" })).toContain(
      "frame-src 'self' blob:;"
    );
  });

  it("gms allows the three click-to-load embeds and the staging CMS image host", () => {
    const policy = buildContentSecurityPolicy({ app: "gms" });
    expect(policy).toContain(
      "frame-src https://www.youtube-nocookie.com https://www.facebook.com https://w.soundcloud.com;"
    );
    expect(policy).toContain(
      "img-src 'self' data: blob: https://www.google-analytics.com https://www.googletagmanager.com https://cms.staging.barrels.gd;"
    );
  });

  it("apps without third-party origins keep the shared baseline only", () => {
    for (const app of ["admin", "cap", "cms", "gmsdash"] as const) {
      expect(buildContentSecurityPolicy({ app })).toBe(
        [
          "default-src 'self'",
          "script-src 'self' 'unsafe-inline' https://static.cloudflareinsights.com",
          "style-src 'self' 'unsafe-inline'",
          "img-src 'self' data: blob:",
          "font-src 'self'",
          "connect-src 'self' https://cloudflareinsights.com",
          "frame-src 'none'",
          "object-src 'none'",
          "base-uri 'self'",
          "frame-ancestors 'self'",
          "worker-src 'self'",
        ].join("; ")
      );
    }
  });
});

/** Splits a serialised policy into directive name -> source tokens. */
function directivesOf(policy: string): Record<string, string[]> {
  return Object.fromEntries(
    policy.split("; ").map((directive) => {
      const [name, ...sources] = directive.split(" ");
      return [name, sources];
    })
  );
}

const CSP_APPS = Object.keys(APP_SOURCES) as CspApp[];

describe("shared Cloudflare Web Analytics sources", () => {
  it.each(CSP_APPS)(
    "%s allows the Cloudflare beacon script and report host",
    (app) => {
      const policy = directivesOf(buildContentSecurityPolicy({ app }));
      expect(policy["script-src"]).toContain(
        "https://static.cloudflareinsights.com"
      );
      expect(policy["connect-src"]).toContain("https://cloudflareinsights.com");
    }
  );
});

describe("Google Analytics measurement host", () => {
  it.each(["docs", "signal", "mbia", "elections", "events", "gms"] as const)(
    "%s sends GA4 hits to www.google.com",
    (app) => {
      const policy = directivesOf(buildContentSecurityPolicy({ app }));
      expect(policy["connect-src"]).toContain("https://www.google.com");
    }
  );

  it("lists the PostHog ingest hosts only for the funnel apps", () => {
    for (const app of ["bookings", "events", "account"] as const) {
      const policy = directivesOf(buildContentSecurityPolicy({ app }));
      expect(policy["connect-src"]).toContain("https://us.i.posthog.com");
      expect(policy["connect-src"]).toContain("https://eu.i.posthog.com");
      // Connect only: no PostHog script is loaded from any origin.
      expect(
        (policy["script-src"] ?? []).some((v) => v.includes("posthog"))
      ).toBe(false);
    }
    for (const app of ["babydoll", "gms", "elections", "mbia"] as const) {
      const policy = directivesOf(buildContentSecurityPolicy({ app }));
      expect(
        (policy["connect-src"] ?? []).some((v) => v.includes("posthog"))
      ).toBe(false);
    }
  });

  it("does not add www.google.com to apps without analytics", () => {
    const policy = directivesOf(
      buildContentSecurityPolicy({ app: "babydoll" })
    );
    expect(policy["connect-src"]).not.toContain("https://www.google.com");
  });
});

describe("eval", () => {
  it.each(CSP_APPS)("%s never allows unsafe-eval", (app) => {
    expect(buildContentSecurityPolicy({ app })).not.toContain("unsafe-eval");
  });
});

describe("uploaded images and presigned uploads (#1622)", () => {
  it("lets the upload apps show stored images and upload to the object store", () => {
    for (const app of ["bookings", "events", "account"] as const) {
      const policy = directivesOf(buildContentSecurityPolicy({ app }));
      for (const origin of [
        "https://api.barrels.gd",
        "https://api.staging.barrels.gd",
        OBJECT_STORE,
      ]) {
        expect(policy["img-src"]).toContain(origin);
      }
      expect(policy["connect-src"]).toContain(OBJECT_STORE);
    }
  });

  it("keeps the object store out of apps that upload nothing", () => {
    for (const app of ["docs", "cms", "gmsdash", "babydoll"] as const) {
      const policy = directivesOf(buildContentSecurityPolicy({ app }));
      expect(policy["connect-src"] ?? []).not.toContain(OBJECT_STORE);
      expect(policy["img-src"] ?? []).not.toContain(OBJECT_STORE);
    }
  });
});
