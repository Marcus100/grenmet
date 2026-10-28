import { describe, expect, it, vi } from "vitest";

// vi.hoisted so the mock factory can read values the tests mutate per-case.
const envState = vi.hoisted(() => ({
  allowedHosts: "",
  nodeEnv: "production",
  appUrls: {} as Record<string, string | undefined>,
}));

vi.mock("@/lib/env", () => ({
  env: {
    get NODE_ENV() {
      return envState.nodeEnv;
    },
    get AUTH_ALLOWED_RETURN_HOSTS() {
      return envState.allowedHosts;
    },
    get AUTH_APP_URL() {
      return envState.appUrls.auth;
    },
    get ADMIN_APP_URL() {
      return envState.appUrls.admin;
    },
    get DOCS_APP_URL() {
      return envState.appUrls.docs;
    },
    get GMS_APP_URL() {
      return envState.appUrls.weather;
    },
    get MBIA_APP_URL() {
      return envState.appUrls.mbia;
    },
    get SIGNAL_APP_URL() {
      return envState.appUrls.signal;
    },
    get EVENTS_APP_URL() {
      return envState.appUrls.events;
    },
  },
}));

import { getRequestedAppName, getSafeReturnTo } from "@/lib/return-to";

function configure(options: {
  hosts?: string;
  nodeEnv?: string;
  apps?: Record<string, string>;
}) {
  envState.allowedHosts = options.hosts ?? "";
  envState.nodeEnv = options.nodeEnv ?? "production";
  envState.appUrls = options.apps ?? {};
}

const DEPLOYED = {
  auth: "https://auth.barrels.gd",
  admin: "https://admin.barrels.gd",
  events: "https://events.barrels.gd",
};

describe("getSafeReturnTo: local paths", () => {
  it("allows relative paths regardless of the allowlist", () => {
    configure({});
    expect(getSafeReturnTo("/dashboard")).toBe("/dashboard");
    expect(getSafeReturnTo("/")).toBe("/");
    expect(getSafeReturnTo("/continue?app=events&state=abc")).toBe(
      "/continue?app=events&state=abc"
    );
  });

  it("rejects protocol-relative URLs", () => {
    configure({ apps: DEPLOYED });
    expect(getSafeReturnTo("//evil.example.com/steal")).toBeNull();
  });

  it("rejects paths that the URL parser resolves to another host", () => {
    configure({ apps: DEPLOYED });
    expect(getSafeReturnTo("/\\evil.example.com/steal")).toBeNull();
    expect(getSafeReturnTo("/\n/evil.example.com/steal")).toBeNull();
  });

  it("returns null for empty or missing input", () => {
    configure({ apps: DEPLOYED });
    expect(getSafeReturnTo(null)).toBeNull();
    expect(getSafeReturnTo(undefined)).toBeNull();
    expect(getSafeReturnTo("   ")).toBeNull();
  });
});

describe("getSafeReturnTo: exact registry origins", () => {
  it("allows a configured app origin and keeps the path", () => {
    configure({ apps: DEPLOYED });
    expect(getSafeReturnTo("https://admin.barrels.gd/hr?x=1")).toBe(
      "https://admin.barrels.gd/hr?x=1"
    );
    expect(getSafeReturnTo("https://auth.barrels.gd/continue")).toBe(
      "https://auth.barrels.gd/continue"
    );
  });

  it("allows an exact host listed in AUTH_ALLOWED_RETURN_HOSTS", () => {
    configure({ hosts: "bookings.barrels.gd, cms.barrels.gd" });
    expect(getSafeReturnTo("https://bookings.barrels.gd/studio")).toBe(
      "https://bookings.barrels.gd/studio"
    );
    expect(getSafeReturnTo("https://cms.barrels.gd/")).toBe(
      "https://cms.barrels.gd/"
    );
  });

  it("allows a full origin entry", () => {
    configure({ hosts: "https://hr.barrels.gd" });
    expect(getSafeReturnTo("https://hr.barrels.gd/acme")).toBe(
      "https://hr.barrels.gd/acme"
    );
  });

  it("refuses a sibling subdomain that is not listed", () => {
    configure({ apps: DEPLOYED, hosts: "bookings.barrels.gd" });
    expect(getSafeReturnTo("https://unlisted.barrels.gd/")).toBeNull();
    expect(getSafeReturnTo("https://staging.barrels.gd/")).toBeNull();
  });

  it("refuses the apex when only subdomains are listed", () => {
    configure({ apps: DEPLOYED });
    expect(getSafeReturnTo("https://barrels.gd/")).toBeNull();
  });

  it("no longer honours a .barrels.gd wildcard entry", () => {
    configure({ hosts: ".barrels.gd" });
    expect(getSafeReturnTo("https://admin.barrels.gd/")).toBeNull();
    expect(getSafeReturnTo("https://barrels.gd/")).toBeNull();
    expect(getSafeReturnTo("https://deep.sub.barrels.gd/")).toBeNull();
  });

  it("ignores wildcard entries but still honours exact ones beside them", () => {
    configure({ hosts: ".barrels.gd,*.barrels.gd,bookings.barrels.gd" });
    expect(getSafeReturnTo("https://other.barrels.gd/")).toBeNull();
    expect(getSafeReturnTo("https://bookings.barrels.gd/")).toBe(
      "https://bookings.barrels.gd/"
    );
  });

  it("matches hosts case-insensitively", () => {
    configure({ apps: DEPLOYED });
    expect(getSafeReturnTo("https://Admin.BARRELS.gd/")).toBe(
      "https://admin.barrels.gd/"
    );
  });
});

describe("getSafeReturnTo: look-alikes and parser tricks", () => {
  const tricks = [
    "https://barrels.gd.evil.com/",
    "https://admin.barrels.gd.evil.com/",
    "https://evilbarrels.gd/",
    "https://evil-admin.barrels.gd/",
    "https://auth.barrels.gd@evil.com/",
    "https://auth.barrels.gd:pw@evil.com/",
    "https://evil.com@auth.barrels.gd/",
    "https://auth.barrels.gd%40evil.com/",
    "https://auth.barrels.gd\\@evil.com/",
    "https://auth.barrels.gd\\.evil.com/",
    "https:\\\\evil.com",
    "https://auth.barrels.gd%2f@evil.com/",
    "https://auth.barrels.gd%00.evil.com/",
    "https://auth.barrels.gd\t.evil.com/",
    "https://auth.barrels.gd:8443/",
    "https://auth.barrels.gd:444/",
    "http://auth.barrels.gd/",
    "ftp://auth.barrels.gd/",
    "javascript:alert(1)",
    "data:text/html,hi",
    "//auth.barrels.gd@evil.com",
    "https:/evil.com",
    "https:evil.com",
  ];

  for (const attempt of tricks) {
    it(`refuses ${JSON.stringify(attempt)}`, () => {
      configure({ apps: DEPLOYED, hosts: ".barrels.gd,bookings.barrels.gd" });
      expect(getSafeReturnTo(attempt)).toBeNull();
    });
  }

  it("refuses credentials even on an allowed host", () => {
    configure({ apps: DEPLOYED });
    expect(getSafeReturnTo("https://user:pw@admin.barrels.gd/")).toBeNull();
  });
});

describe("getSafeReturnTo: origin entries and control characters", () => {
  it("applies the production rules to full-origin entries", () => {
    configure({
      hosts:
        "http://localhost:3015,http://admin.barrels.gd,https://localhost:3015,https://ok.barrels.gd",
    });
    expect(getSafeReturnTo("http://localhost:3015/")).toBeNull();
    expect(getSafeReturnTo("https://localhost:3015/")).toBeNull();
    expect(getSafeReturnTo("http://admin.barrels.gd/")).toBeNull();
    expect(getSafeReturnTo("https://ok.barrels.gd/")).toBe(
      "https://ok.barrels.gd/"
    );
  });

  it("allows an http localhost origin entry outside production", () => {
    configure({ nodeEnv: "test", hosts: "http://localhost:3015" });
    expect(getSafeReturnTo("http://localhost:3015/")).toBe(
      "http://localhost:3015/"
    );
  });

  for (const attempt of [
    "/x%0d%0aSet-Cookie:a=b",
    "/x%0D%0A",
    "/x%09y",
    "/x%00",
    "/x\u0000y",
    "/x\ty",
    "/x\r\nSet-Cookie:a=b",
    "https://admin.barrels.gd/x%0d%0aSet-Cookie:a=b",
    "https://admin.barrels.gd/x%00",
  ]) {
    it(`refuses ${JSON.stringify(attempt)}`, () => {
      configure({ apps: DEPLOYED });
      expect(getSafeReturnTo(attempt)).toBeNull();
    });
  }
});

// What the web-auth service receives on staging (infra/docker/docker-compose.deploy.yml
// with BASE_DOMAIN=staging.barrels.gd). The app-URL variables are honoured as they
// are; every other app that signs in here is named in AUTH_ALLOWED_RETURN_HOSTS.
// scripts/production/auth-return-origins.test.mjs keeps that file and this list in step.
const STAGING = {
  apps: {
    auth: "https://auth.staging.barrels.gd",
    admin: "https://gms.staging.barrels.gd",
    docs: "https://docs.staging.barrels.gd",
    weather: "https://weather.staging.barrels.gd",
    signal: "https://signal.staging.barrels.gd",
    mbia: "https://mbia.staging.barrels.gd",
    events: "https://events.staging.barrels.gd",
  },
  hosts:
    "https://admin.staging.barrels.gd,https://bookings.staging.barrels.gd,https://cms.staging.barrels.gd,https://elections.staging.barrels.gd,https://gmsdash.staging.barrels.gd",
};

describe("getSafeReturnTo: the staging compose configuration", () => {
  it("returns to every app that signs in through the auth app", () => {
    configure(STAGING);
    const origins = [
      ...Object.values(STAGING.apps),
      ...STAGING.hosts.split(","),
    ];
    expect(origins).toHaveLength(12);
    for (const origin of origins) {
      expect(getSafeReturnTo(`${origin}/start?x=1`)).toBe(
        `${origin}/start?x=1`
      );
    }
  });

  it("returns to the staff console and studio, which a leading-dot entry never reached", () => {
    configure({ apps: STAGING.apps, hosts: ".staging.barrels.gd" });
    expect(getSafeReturnTo("https://admin.staging.barrels.gd/")).toBeNull();
    expect(getSafeReturnTo("https://bookings.staging.barrels.gd/")).toBeNull();
    configure(STAGING);
    expect(getSafeReturnTo("https://admin.staging.barrels.gd/")).toBe(
      "https://admin.staging.barrels.gd/"
    );
    expect(getSafeReturnTo("https://bookings.staging.barrels.gd/studio")).toBe(
      "https://bookings.staging.barrels.gd/studio"
    );
  });

  it("still refuses an unregistered sibling, the apex, production and look-alikes", () => {
    configure(STAGING);
    for (const url of [
      "https://unregistered.staging.barrels.gd/",
      "https://staging.barrels.gd/",
      "https://admin.barrels.gd/",
      "https://admin.staging.barrels.gd.evil.example/",
      "https://evil.example/https://admin.staging.barrels.gd/",
      "http://admin.staging.barrels.gd/",
    ]) {
      expect(getSafeReturnTo(url), url).toBeNull();
    }
  });
});

describe("getSafeReturnTo: local development", () => {
  it("allows the local app ports only when NODE_ENV is development", () => {
    configure({ nodeEnv: "development" });
    expect(getSafeReturnTo("http://localhost:3012/")).toBe(
      "http://localhost:3012/"
    );
    expect(getSafeReturnTo("http://localhost:3999/")).toBeNull();
    expect(getSafeReturnTo("http://localhost.evil.com:3012/")).toBeNull();
  });

  it("does not allow local ports in production", () => {
    configure({ nodeEnv: "production" });
    expect(getSafeReturnTo("http://localhost:3012/")).toBeNull();
  });

  it("ignores localhost defaults and entries in production", () => {
    configure({
      nodeEnv: "production",
      hosts: "localhost:3001",
      apps: { auth: "http://localhost:3000" },
    });
    expect(getSafeReturnTo("http://localhost:3001/")).toBeNull();
    expect(getSafeReturnTo("http://localhost:3000/")).toBeNull();
  });

  it("matches localhost entries with ports exactly outside production", () => {
    configure({ nodeEnv: "test", hosts: "localhost:3001,localhost:3002" });
    expect(getSafeReturnTo("http://localhost:3001/hr")).toBe(
      "http://localhost:3001/hr"
    );
    expect(getSafeReturnTo("http://localhost:3005/")).toBeNull();
  });
});

describe("getRequestedAppName", () => {
  it("prefers the explicit app", () => {
    configure({ apps: DEPLOYED });
    expect(getRequestedAppName("bookings", "https://admin.barrels.gd/")).toBe(
      "bookings"
    );
  });

  it("recovers the app only from an exact configured origin", () => {
    configure({ apps: DEPLOYED });
    expect(getRequestedAppName(null, "https://events.barrels.gd/x")).toBe(
      "events"
    );
  });

  it("does not guess from the first DNS label", () => {
    configure({ apps: DEPLOYED, hosts: "bookings.barrels.gd" });
    expect(
      getRequestedAppName(null, "https://bookings.barrels.gd/")
    ).toBeNull();
    expect(getRequestedAppName(null, "https://admin.evil.com/")).toBeNull();
  });

  it("is null for local paths and missing input", () => {
    configure({ apps: DEPLOYED });
    expect(getRequestedAppName(null, "/continue")).toBeNull();
    expect(getRequestedAppName("  ", null)).toBeNull();
  });
});
