// @vitest-environment node
//
// Node, not jsdom: @t3-oss/env-nextjs refuses to read a server-only variable
// when it sees a `window`, so under jsdom `env.CAP_API_URL` throws before
// fetchActiveAlerts reaches the network. That made the "unavailable" cases pass
// for the wrong reason — they would have passed with the fetch logic removed.
import { afterEach, describe, expect, it } from "vitest";
import {
  alertsLevel,
  alertsSummary,
  exerciseStatuses,
  fetchActiveAlerts,
  fetchPastAlerts,
  fetchPublicAlert,
  type PublicAlert,
} from "@/lib/cap";

function alert(overrides: Partial<PublicAlert> = {}): PublicAlert {
  return {
    areas: [],
    event: "Small Craft Advisory",
    expires: null,
    headline: "Small craft should remain in port",
    identifier: "id-1",
    severity: "Moderate",
    status: "Actual",
    ...overrides,
  };
}

describe("alertsSummary", () => {
  it("never presents an outage as an all-clear", () => {
    expect(alertsSummary({ status: "unavailable" })).toBe(
      "Warnings unavailable"
    );
  });

  it("reports no active warnings when the count is zero", () => {
    expect(alertsSummary({ activeCount: 0, groups: [], status: "ok" })).toBe(
      "No active warnings"
    );
  });

  it("names the most severe level with the count", () => {
    expect(
      alertsSummary({
        activeCount: 2,
        groups: [
          {
            alerts: [alert(), alert({ identifier: "id-2", severity: "Minor" })],
            name: "Marine / Small Craft",
          },
        ],
        status: "ok",
      })
    ).toBe("Be prepared · 2 active");
    expect(
      alertsSummary({
        activeCount: 1,
        groups: [{ alerts: [alert({ severity: "Extreme" })], name: "Wind" }],
        status: "ok",
      })
    ).toBe("Take action now · 1 active");
  });

  it("falls back to the bare count when no alert detail is present", () => {
    expect(alertsSummary({ activeCount: 3, groups: [], status: "ok" })).toBe(
      "3 active"
    );
  });
});

describe("fetchActiveAlerts", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("reads the warnings uncached so an outage cannot be masked", async () => {
    const calls: RequestInit[] = [];
    globalThis.fetch = ((_url: string, init: RequestInit) => {
      calls.push(init);
      return Promise.resolve({
        json: () =>
          Promise.resolve({
            as_of: "2026-09-17T12:00:00Z",
            groups: [],
            activeCount: 0,
          }),
        ok: true,
      } as Response);
    }) as typeof fetch;

    await fetchActiveAlerts();
    expect(calls[0]?.cache).toBe("no-store");
  });

  it("gives up on a service that accepts the connection but never answers", async () => {
    globalThis.fetch = ((_url: string, init: RequestInit) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener("abort", () =>
          reject(new Error("aborted"))
        );
      })) as typeof fetch;
    expect(await fetchActiveAlerts()).toEqual({ status: "unavailable" });
  }, 10_000);

  it("reports unavailable when the request throws", async () => {
    globalThis.fetch = (() =>
      Promise.reject(new Error("connect ECONNREFUSED"))) as typeof fetch;
    expect(await fetchActiveAlerts()).toEqual({ status: "unavailable" });
  });

  it("reports unavailable on a non-ok response rather than an empty list", async () => {
    globalThis.fetch = (() =>
      Promise.resolve({ ok: false, status: 503 } as Response)) as typeof fetch;
    expect(await fetchActiveAlerts()).toEqual({ status: "unavailable" });
  });
});

describe("exerciseStatuses", () => {
  function ok(alerts: PublicAlert[]) {
    return {
      status: "ok" as const,
      groups: [{ name: "Warnings", alerts }],
      activeCount: alerts.length,
    };
  }

  it("is empty when every alert is Actual", () => {
    expect(exerciseStatuses(ok([alert()]))).toEqual([]);
  });

  it("reports each distinct non-Actual status once", () => {
    const statuses = exerciseStatuses(
      ok([
        alert({ identifier: "a", status: "Exercise" }),
        alert({ identifier: "b", status: "Exercise" }),
        alert({ identifier: "c", status: "Test" }),
        alert({ identifier: "d" }),
      ])
    );
    expect(statuses.sort()).toEqual(["Exercise", "Test"]);
  });

  it("is empty when the feed is unavailable", () => {
    expect(exerciseStatuses({ status: "unavailable" })).toEqual([]);
  });
});

describe("alertsLevel", () => {
  const ok = (alerts: PublicAlert[]) => ({
    activeCount: alerts.length,
    groups: [{ name: "Warnings", alerts }],
    status: "ok" as const,
  });

  it("is 'none' when nothing is in effect", () => {
    expect(alertsLevel(ok([]))).toBe("none");
  });

  it("maps each CAP severity onto its response level", () => {
    expect(alertsLevel(ok([alert({ severity: "Minor" })]))).toBe("be-aware");
    expect(alertsLevel(ok([alert({ severity: "Moderate" })]))).toBe(
      "be-prepared"
    );
    expect(alertsLevel(ok([alert({ severity: "Severe" })]))).toBe(
      "take-action"
    );
    expect(alertsLevel(ok([alert({ severity: "Extreme" })]))).toBe(
      "take-action"
    );
  });

  it("takes the most severe alert, never an average", () => {
    const mixed = ok([
      alert({ identifier: "a", severity: "Minor" }),
      alert({ identifier: "b", severity: "Extreme" }),
      alert({ identifier: "c", severity: "Moderate" }),
    ]);
    expect(alertsLevel(mixed)).toBe("take-action");
  });

  it("treats an unknown severity as worth being aware of, not as clear", () => {
    expect(alertsLevel(ok([alert({ severity: "Unknown" })]))).toBe("be-aware");
  });

  it("never reports an outage as 'none'", () => {
    expect(alertsLevel({ status: "unavailable" })).toBe("unknown");
  });
});

it("rejects malformed warning data rather than treating missing status as Actual", async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = (() =>
      Promise.resolve(
        Response.json({
          as_of: "2026-09-17T12:00:00Z",
          activeCount: 1,
          groups: [
            {
              name: "Wind",
              alerts: [
                {
                  identifier: "id",
                  event: "Wind",
                  headline: "Warning",
                  severity: "Severe",
                  expires: null,
                  areas: [],
                },
              ],
            },
          ],
        })
      )) as typeof fetch;
    expect(await fetchActiveAlerts()).toEqual({ status: "unavailable" });
  } finally {
    globalThis.fetch = original;
  }
});

it("uses backend groups without classifying the event again", async () => {
  const original = globalThis.fetch;
  const groups = [
    {
      name: "Backend category",
      alerts: [alert({ event: "Novel hazard", status: "Exercise" })],
    },
  ];
  try {
    globalThis.fetch = (() =>
      Promise.resolve(
        Response.json({
          as_of: "2026-09-17T12:00:00Z",
          activeCount: 1,
          groups,
        })
      )) as typeof fetch;
    expect(await fetchActiveAlerts()).toEqual({
      status: "ok",
      activeCount: 1,
      groups,
    });
  } finally {
    globalThis.fetch = original;
  }
});

const ENCODED_ALERT_URL = /\/api\/cap\/alerts\/urn%3Aoid%3A1\.2$/;

describe("fetchPublicAlert", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("treats a 404 as not found, never as an outage", async () => {
    globalThis.fetch = (() =>
      Promise.resolve({ ok: false, status: 404 } as Response)) as typeof fetch;
    expect(await fetchPublicAlert("missing-404")).toEqual({
      status: "not-found",
    });
  });

  it("reports unavailable on a server error", async () => {
    globalThis.fetch = (() =>
      Promise.resolve({ ok: false, status: 503 } as Response)) as typeof fetch;
    expect(await fetchPublicAlert("down-503")).toEqual({
      status: "unavailable",
    });
  });

  it("requests the identifier encoded and uncached", async () => {
    const calls: [string, RequestInit][] = [];
    globalThis.fetch = ((url: string, init: RequestInit) => {
      calls.push([url, init]);
      return Promise.reject(new Error("stop"));
    }) as typeof fetch;
    await fetchPublicAlert("urn:oid:1.2");
    expect(calls[0]?.[0]).toMatch(ENCODED_ALERT_URL);
    expect(calls[0]?.[1].cache).toBe("no-store");
  });
});

describe("fetchPastAlerts", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("degrades to an empty list: the all-clear is supplementary", async () => {
    globalThis.fetch = (() =>
      Promise.reject(new Error("connect ECONNREFUSED"))) as typeof fetch;
    expect(await fetchPastAlerts()).toEqual([]);
  });
});
