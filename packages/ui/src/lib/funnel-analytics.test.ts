import { afterEach, describe, expect, it, vi } from "vitest";

const HEX_ID = /^[0-9a-f-]{16,}$/u;

import {
  buildFunnelPayload,
  captureFunnelEvent,
  type FunnelDeps,
  type FunnelSettings,
  funnelSettings,
  refusesTracking,
  sanitizeFunnelProperties,
  sendWithFetch,
} from "./funnel-analytics";

const KEY = "phc_testproject123";
const settingsFrom =
  (values: Record<string, string | undefined>) => (key: string) =>
    values[key];

const SETTINGS: FunnelSettings = { host: "https://us.i.posthog.com", key: KEY };

function deps(overrides: Partial<FunnelDeps> = {}): FunnelDeps & {
  send: ReturnType<typeof vi.fn>;
} {
  return {
    distinctId: () => "anon-1",
    now: () => new Date("2026-11-22T10:00:00.000Z"),
    privacy: () => ({ dnt: false, gpc: false }),
    send: vi.fn(),
    settings: () => SETTINGS,
    ...overrides,
  } as FunnelDeps & { send: ReturnType<typeof vi.fn> };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("funnelSettings (kill switch and key)", () => {
  it("is off when no project key is set", () => {
    expect(funnelSettings(settingsFrom({}))).toBeNull();
    expect(
      funnelSettings(settingsFrom({ NEXT_PUBLIC_FUNNEL_ANALYTICS_KEY: "  " }))
    ).toBeNull();
  });

  it("rejects a malformed key", () => {
    expect(
      funnelSettings(
        settingsFrom({ NEXT_PUBLIC_FUNNEL_ANALYTICS_KEY: "not a key!" })
      )
    ).toBeNull();
  });

  it("is off when the kill switch is false, even with a key", () => {
    expect(
      funnelSettings(
        settingsFrom({
          NEXT_PUBLIC_FUNNEL_ANALYTICS_ENABLED: "false",
          NEXT_PUBLIC_FUNNEL_ANALYTICS_KEY: KEY,
        })
      )
    ).toBeNull();
  });

  it("defaults to the US ingest host", () => {
    expect(
      funnelSettings(settingsFrom({ NEXT_PUBLIC_FUNNEL_ANALYTICS_KEY: KEY }))
    ).toEqual({ host: "https://us.i.posthog.com", key: KEY });
  });

  it("accepts the EU host and trims a trailing slash", () => {
    expect(
      funnelSettings(
        settingsFrom({
          NEXT_PUBLIC_FUNNEL_ANALYTICS_HOST: "https://eu.i.posthog.com/",
          NEXT_PUBLIC_FUNNEL_ANALYTICS_KEY: KEY,
        })
      )
    ).toEqual({ host: "https://eu.i.posthog.com", key: KEY });
  });

  it("switches off for a host outside the allow-list (no fallback)", () => {
    expect(
      funnelSettings(
        settingsFrom({
          NEXT_PUBLIC_FUNNEL_ANALYTICS_HOST: "https://evil.example",
          NEXT_PUBLIC_FUNNEL_ANALYTICS_KEY: KEY,
        })
      )
    ).toBeNull();
  });
});

describe("privacy signals (DNT and GPC)", () => {
  it("refuses tracking for Do Not Track or Global Privacy Control", () => {
    expect(refusesTracking({ dnt: true, gpc: false })).toBe(true);
    expect(refusesTracking({ dnt: false, gpc: true })).toBe(true);
    expect(refusesTracking({ dnt: false, gpc: false })).toBe(false);
  });

  it("sends nothing when Do Not Track is on", () => {
    const d = deps({ privacy: () => ({ dnt: true, gpc: false }) });
    expect(captureFunnelEvent("bookings", "page_view", {}, d)).toBe(false);
    expect(d.send).not.toHaveBeenCalled();
  });

  it("sends nothing when Global Privacy Control is on", () => {
    const d = deps({ privacy: () => ({ dnt: false, gpc: true }) });
    expect(captureFunnelEvent("account", "sign_in_started", {}, d)).toBe(false);
    expect(d.send).not.toHaveBeenCalled();
  });

  it("reads navigator.doNotTrack in the browser", async () => {
    vi.stubGlobal("navigator", { doNotTrack: "1" });
    vi.stubGlobal("window", {});
    const { browserPrivacySignals } = await import("./funnel-analytics");
    expect(browserPrivacySignals()).toEqual({ dnt: true, gpc: false });
  });
});

describe("kill switch in capture", () => {
  it("sends nothing when settings are null", () => {
    const d = deps({ settings: () => null });
    expect(captureFunnelEvent("bookings", "booking_submitted", {}, d)).toBe(
      false
    );
    expect(d.send).not.toHaveBeenCalled();
  });
});

describe("payload has no personal data", () => {
  it("drops unknown keys and values that are not ids or enums", () => {
    const unsafe = {
      email: "person@example.com",
      name: "Jane Doe",
      notes: "free text",
      organisation: "jane@example.com",
      phone: "+1 473 555 0100",
      service_id: "svc 1 with spaces",
    } as unknown as Parameters<typeof sanitizeFunnelProperties>[0];
    expect(sanitizeFunnelProperties(unsafe)).toEqual({});
  });

  it("keeps a valid organisation slug, service id and page enum", () => {
    expect(
      sanitizeFunnelProperties({
        organisation: "island-cuts",
        page: "business",
        service_id: "9f1c2a3e-0000-4000-8000-000000000001",
      })
    ).toEqual({
      organisation: "island-cuts",
      page: "business",
      service_id: "9f1c2a3e-0000-4000-8000-000000000001",
    });
  });

  it("builds a payload with only reviewed fields and no person profile", () => {
    const payload = buildFunnelPayload({
      apiKey: KEY,
      app: "bookings",
      distinctId: "anon-1",
      event: "service_selected",
      properties: {
        organisation: "island-cuts",
        service_id: "svc-1",
      },
      timestamp: "2026-11-22T10:00:00.000Z",
    });
    expect(Object.keys(payload.properties).sort()).toEqual(
      [
        "$geoip_disable",
        "$process_person_profile",
        "app",
        "organisation",
        "schema_version",
        "service_id",
      ].sort()
    );
    expect(payload.properties.$process_person_profile).toBe(false);
    expect(JSON.stringify(payload)).not.toContain("@");
  });

  it("sends the event with the anonymous id and no email, name or phone", () => {
    const d = deps();
    expect(
      captureFunnelEvent(
        "bookings",
        "booking_confirmed",
        { organisation: "island-cuts", service_id: "svc-1" },
        d
      )
    ).toBe(true);
    const [url, body] = d.send.mock.calls[0] as [string, string];
    expect(url).toBe("https://us.i.posthog.com/capture/");
    const parsed = JSON.parse(body) as {
      api_key: string;
      distinct_id: string;
      event: string;
      properties: Record<string, unknown>;
    };
    expect(parsed.api_key).toBe(KEY);
    expect(parsed.distinct_id).toBe("anon-1");
    expect(parsed.event).toBe("booking_confirmed");
    expect(Object.keys(parsed.properties)).not.toContain("email");
    expect(Object.keys(parsed.properties)).not.toContain("name");
    expect(Object.keys(parsed.properties)).not.toContain("phone");
  });

  it("refuses an event that the app is not allowed to send", () => {
    const d = deps();
    expect(captureFunnelEvent("events", "sign_in_started", {}, d)).toBe(false);
    expect(captureFunnelEvent("bookings", "order_completed", {}, d)).toBe(
      false
    );
    expect(d.send).not.toHaveBeenCalled();
  });

  it("never throws, even when a dependency fails", () => {
    const d = deps({
      settings: () => {
        throw new Error("boom");
      },
    });
    expect(() =>
      captureFunnelEvent("events", "event_viewed", {}, d)
    ).not.toThrow();
    expect(captureFunnelEvent("events", "event_viewed", {}, d)).toBe(false);
  });
});

describe("no cookies and no storage", () => {
  it("writes no cookie and no web storage when an event is sent", () => {
    const cookieWrites: string[] = [];
    const storageWrites: string[] = [];
    const storage = {
      clear: () => storageWrites.push("clear"),
      getItem: () => null,
      key: () => null,
      length: 0,
      removeItem: () => storageWrites.push("remove"),
      setItem: () => storageWrites.push("set"),
    };
    vi.stubGlobal("document", {
      get cookie() {
        return "";
      },
      set cookie(value: string) {
        cookieWrites.push(value);
      },
    });
    vi.stubGlobal("localStorage", storage);
    vi.stubGlobal("sessionStorage", storage);
    const fetchMock = vi.fn(() => Promise.resolve(new Response(null)));
    vi.stubGlobal("fetch", fetchMock);

    const sent = captureFunnelEvent(
      "events",
      "checkout_started",
      { listing_id: "listing-1" },
      deps({ send: sendWithFetch })
    );

    expect(sent).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(cookieWrites).toEqual([]);
    expect(storageWrites).toEqual([]);
  });

  it("posts with credentials omitted and a text body (no preflight)", () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response(null)));
    vi.stubGlobal("fetch", fetchMock);
    sendWithFetch("https://eu.i.posthog.com/capture/", "{}");
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe("https://eu.i.posthog.com/capture/");
    expect(init.credentials).toBe("omit");
    expect(init.method).toBe("POST");
    expect(init.keepalive).toBe(true);
    expect(init.headers).toEqual({ "Content-Type": "text/plain" });
  });

  it("gives a new anonymous id on each page load (module reload) and keeps it within one", async () => {
    const first = await import("./funnel-analytics");
    const a = first.distinctIdForPageLoad();
    expect(first.distinctIdForPageLoad()).toBe(a);
    expect(a).toMatch(HEX_ID);
    vi.resetModules();
    const second = await import("./funnel-analytics");
    expect(second.distinctIdForPageLoad()).not.toBe(a);
  });
});
