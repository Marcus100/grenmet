import { describe, expect, it } from "vitest";
import {
  buildContentSecurityPolicy,
  contentSecurityPolicyHeaders,
  sentryReporting,
} from "./content-security-policy";

const DSN = "https://abc123@o1.ingest.sentry.io/4507";
const REPORT =
  "https://o1.ingest.sentry.io/api/4507/security/?sentry_key=abc123&sentry_environment=production";

const GA_CONNECT =
  "https://www.google-analytics.com https://region1.google-analytics.com https://www.googletagmanager.com";

function expected(sentry: boolean): string {
  return [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' https://www.googletagmanager.com https://challenges.cloudflare.com",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://www.google-analytics.com https://www.googletagmanager.com",
    "font-src 'self'",
    `connect-src 'self' ${GA_CONNECT} https://challenges.cloudflare.com${sentry ? " https://o1.ingest.sentry.io" : ""}`,
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

  it.each(["docs", "signal"] as const)(
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

describe("bookings policy", () => {
  // No analytics and no third-party sources yet: self plus Sentry reporting only.
  function expectedBookings(sentry: boolean): string {
    return [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self'",
      `connect-src 'self'${sentry ? " https://o1.ingest.sentry.io" : ""}`,
      "frame-src 'none'",
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
