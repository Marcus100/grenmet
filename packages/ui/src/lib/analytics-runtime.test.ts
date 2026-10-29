import type { CaptureResult } from "posthog-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CONSENT_KEY, CONSENT_MS, pageSection } from "./analytics-policy";
import { filterAnalyticsEvent, startAnalytics } from "./analytics-runtime";

const config = {
  app: "gms",
  environment: "production",
  ga4: null,
  origin: "https://weather.barrels.gd",
  posthog: null,
  release: "test",
} as const;

// Signed links carry the token in the query string. The PostHog SDK adds
// URL and referrer fields to every event; the filter must drop them.
const TOKEN = "eyJzZWNyZXQtdG9rZW4tZm9yLXByZXZpZXc";
const PREFERENCES_TOKEN = "eyJzZWNyZXQtdG9rZW4tZm9yLXByZWZzLTE";

function captured(properties: Record<string, unknown>): CaptureResult {
  return {
    uuid: "00000000-0000-4000-8000-000000000001",
    event: "page_viewed",
    timestamp: new Date("2026-10-29T12:00:00Z"),
    properties,
  } as unknown as CaptureResult;
}

beforeEach(() => {
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, value),
    removeItem: (key: string) => store.delete(key),
  });
  store.set(
    CONSENT_KEY,
    JSON.stringify({
      value: "accepted",
      expires: Date.now() + CONSENT_MS - 1000,
    })
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("analytics never records a query string", () => {
  it("drops the full URL and referrer, with their tokens, from a page view", async () => {
    await startAnalytics(config);
    const out = filterAnalyticsEvent(
      captured({
        $current_url: `https://weather.barrels.gd/preview?token=${TOKEN}`,
        $pathname: "/preview",
        $referrer: `https://weather.barrels.gd/climate/newsletter/preferences?token=${PREFERENCES_TOKEN}`,
        $initial_referrer: `https://weather.barrels.gd/preview?token=${TOKEN}`,
        reviewed: { section: "other" },
        token: "phc_public_project_key",
        distinct_id: "anonymous-1",
      })
    );
    expect(out).not.toBeNull();
    expect(out?.properties).not.toHaveProperty("$current_url");
    expect(out?.properties).not.toHaveProperty("$referrer");
    expect(out?.properties).not.toHaveProperty("$initial_referrer");
    expect(JSON.stringify(out)).not.toContain(TOKEN);
    expect(JSON.stringify(out)).not.toContain(PREFERENCES_TOKEN);
    expect(out?.properties).toMatchObject({ section: "other", app: "gms" });
  });

  it("names the preview and newsletter preference pages by section, never by query", () => {
    expect(pageSection(`/preview?token=${TOKEN}`)).toBe("other");
    expect(
      pageSection(`/climate/newsletter/preferences?token=${PREFERENCES_TOKEN}`)
    ).toBe("climate");
  });
});
