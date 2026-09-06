// @vitest-environment node
//
// Node, not jsdom: @t3-oss/env-nextjs refuses to read a server-only variable
// when it sees a `window`, so under jsdom `env.CAP_API_URL` throws before
// fetchActiveAlerts reaches the network. That made the "unavailable" cases pass
// for the wrong reason — they would have passed with the fetch logic removed.
import { afterEach, describe, expect, it } from "vitest";
import {
  alertsSummary,
  exerciseStatuses,
  fetchActiveAlerts,
  groupAlerts,
  HAZARD_GROUPS,
  OTHER_HAZARD,
  type PublicAlert,
  toPublicAlerts,
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

describe("groupAlerts", () => {
  it("keeps every hazard name, in order, even when empty", () => {
    const groups = groupAlerts([]);
    // Derived from the source so adding a hazard cannot silently break this.
    expect(groups).toHaveLength(HAZARD_GROUPS.length);
    expect(groups.map((g) => g.name)).toEqual(HAZARD_GROUPS.map((g) => g.name));
    expect(groups[0].name).toBe("Tropical Cyclone");
    expect(groups.every((g) => g.alerts.length === 0)).toBe(true);
  });

  it("files a tsunami message under its own hazard, not the catch-all", () => {
    const groups = groupAlerts([
      alert({ event: "Tsunami Warning", identifier: "id-tsunami" }),
    ]);
    expect(groups.find((g) => g.name === "Tsunami")?.alerts).toHaveLength(1);
    expect(groups.find((g) => g.name === OTHER_HAZARD)).toBeUndefined();
  });

  it("files an alert under the hazard its event name matches", () => {
    const groups = groupAlerts([alert()]);
    const marine = groups.find((g) => g.name === "Marine / Small Craft");
    expect(marine?.alerts).toHaveLength(1);
  });

  it("never loses an alert whose event matches no hazard", () => {
    const groups = groupAlerts([
      alert({ event: "Volcanic Ashfall", identifier: "id-ash" }),
    ]);
    const other = groups.find((g) => g.name === OTHER_HAZARD);
    expect(other?.alerts.map((a) => a.identifier)).toEqual(["id-ash"]);
  });

  it("omits the catch-all group when everything matched", () => {
    const groups = groupAlerts([alert()]);
    expect(groups.some((g) => g.name === OTHER_HAZARD)).toBe(false);
  });

  it("orders alerts within a hazard by descending severity", () => {
    const groups = groupAlerts([
      alert({ identifier: "minor", severity: "Minor" }),
      alert({ identifier: "extreme", severity: "Extreme" }),
      alert({ identifier: "moderate", severity: "Moderate" }),
    ]);
    const marine = groups.find((g) => g.name === "Marine / Small Craft");
    expect(marine?.alerts.map((a) => a.identifier)).toEqual([
      "extreme",
      "moderate",
      "minor",
    ]);
  });
});

describe("alertsSummary", () => {
  it("never presents an outage as an all-clear", () => {
    expect(alertsSummary({ status: "unavailable" })).toBe("Unavailable");
  });

  it("reports no active warnings when the count is zero", () => {
    expect(alertsSummary({ activeCount: 0, groups: [], status: "ok" })).toBe(
      "No active warnings"
    );
  });

  it("reports the active count otherwise", () => {
    expect(alertsSummary({ activeCount: 3, groups: [], status: "ok" })).toBe(
      "3 active"
    );
  });
});

describe("toPublicAlerts", () => {
  it("flattens the CAP alert/info structure", () => {
    const [result] = toPublicAlerts([
      {
        identifier: "GD-2026-001",
        info: [
          {
            areas: [{ area_desc: "Grenada coastal waters" }],
            event: "Gale Warning",
            expires: "2026-08-19T18:00:00Z",
            headline: "Gale force winds expected",
            severity: "Severe",
          },
        ],
      },
    ]);
    expect(result).toEqual({
      areas: ["Grenada coastal waters"],
      event: "Gale Warning",
      expires: "2026-08-19T18:00:00Z",
      headline: "Gale force winds expected",
      identifier: "GD-2026-001",
      severity: "Severe",
      status: "Actual",
    });
  });

  it("treats an unrecognised severity as Unknown rather than trusting it", () => {
    const [result] = toPublicAlerts([
      { identifier: "x", info: [{ event: "Wind", severity: "Catastrophic" }] },
    ]);
    expect(result.severity).toBe("Unknown");
  });

  it("skips records with no event or identifier", () => {
    expect(
      toPublicAlerts([{ identifier: "x" }, { info: [{ event: "Wind" }] }])
    ).toEqual([]);
  });

  it("falls back to the event name when no headline is given", () => {
    const [result] = toPublicAlerts([
      { identifier: "x", info: [{ event: "Heat Advisory" }] },
    ]);
    expect(result.headline).toBe("Heat Advisory");
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
        json: () => Promise.resolve({ data: [] }),
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

describe("toPublicAlerts status", () => {
  function raw(status?: string) {
    return [
      {
        identifier: "id-1",
        status,
        info: [{ event: "Tsunami Warning", headline: "Move to high ground" }],
      },
    ];
  }

  it("reads the CAP status off the alert", () => {
    expect(toPublicAlerts(raw("Exercise"))[0].status).toBe("Exercise");
  });

  it("falls back to Actual when the status is missing", () => {
    expect(toPublicAlerts(raw(undefined))[0].status).toBe("Actual");
  });

  it("falls back to Actual for an unrecognised status", () => {
    // Safe direction: a real warning shown plainly beats a real warning
    // wrongly badged as a drill.
    expect(toPublicAlerts(raw("Nonsense"))[0].status).toBe("Actual");
  });
});

describe("exerciseStatuses", () => {
  function ok(alerts: PublicAlert[]) {
    return {
      status: "ok" as const,
      groups: groupAlerts(alerts),
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
