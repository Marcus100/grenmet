import type { CapAlertPublic } from "@barrelsgd/api-client";
import { describe, expect, it } from "vitest";
import {
  type AlertView,
  formatClock,
  freshness,
  isInForce,
  overallLevel,
  paginate,
  sortBySeverity,
  splitActive,
  statusLine,
  toAlertView,
} from "@/lib/alerts";

function alert(
  identifier: string,
  info: Record<string, unknown> = {},
  top: Record<string, unknown> = {}
): CapAlertPublic {
  return {
    identifier,
    msg_type: "Alert",
    sent: "2026-10-18T12:00:00Z",
    status: "Actual",
    info: [
      {
        areas: [{ area_desc: "Grenada" }, { area_desc: "Grenada" }],
        certainty: "Likely",
        description: "Heavy rain",
        event: "Rain",
        headline: `Headline ${identifier}`,
        language: "en",
        severity: "Moderate",
        urgency: "Expected",
        ...info,
      },
    ],
    ...top,
  } as unknown as CapAlertPublic;
}

const NOW = new Date("2026-10-18T14:00:00Z");

describe("toAlertView", () => {
  it("flattens the English info block and de-duplicates areas", () => {
    const view = toAlertView(alert("a"));
    expect(view?.areas).toEqual(["Grenada"]);
    expect(view?.level).toBe("be-prepared");
  });

  it("returns null when there is no info block", () => {
    expect(toAlertView(alert("a", {}, { info: [] }))).toBeNull();
  });
});

describe("severity ordering", () => {
  it("puts the most severe, then most urgent, then newest first", () => {
    const views = [
      toAlertView(alert("minor", { severity: "Minor" })),
      toAlertView(
        alert("severe-later", { severity: "Severe", urgency: "Future" })
      ),
      toAlertView(
        alert("severe-now", { severity: "Severe", urgency: "Immediate" })
      ),
      toAlertView(alert("extreme", { severity: "Extreme" })),
    ] as AlertView[];
    expect(sortBySeverity(views).map((v) => v.identifier)).toEqual([
      "extreme",
      "severe-now",
      "severe-later",
      "minor",
    ]);
  });

  it("lets the worst alert set the overall level", () => {
    const { actual } = splitActive(
      [alert("a", { severity: "Minor" }), alert("b", { severity: "Severe" })],
      NOW
    );
    expect(overallLevel(actual)).toBe("take-action");
    expect(statusLine(actual)).toBe("Take action now · 2 active");
    expect(statusLine([])).toBe("No active alerts");
  });
});

describe("active filtering", () => {
  it("drops expired alerts and cancel messages, and splits exercises", () => {
    const { actual, exercise } = splitActive(
      [
        alert("live", { expires: "2026-10-18T20:00:00Z" }),
        alert("ended", { expires: "2026-10-18T13:00:00Z" }),
        alert("cancel", {}, { msg_type: "Cancel" }),
        alert("drill", {}, { status: "Exercise" }),
      ],
      NOW
    );
    expect(actual.map((v) => v.identifier)).toEqual(["live"]);
    expect(exercise.map((v) => v.identifier)).toEqual(["drill"]);
  });

  it("treats an alert without an expiry as in force", () => {
    const view = toAlertView(alert("a")) as AlertView;
    expect(isInForce(view, NOW)).toBe(true);
  });
});

describe("freshness", () => {
  it("is fresh under five minutes and stale from five", () => {
    const fetched = new Date("2026-10-18T13:57:00Z");
    expect(freshness(fetched, NOW)).toEqual({ ageMinutes: 3, stale: false });
    expect(freshness(new Date("2026-10-18T13:55:00Z"), NOW).stale).toBe(true);
  });

  it("formats the clock in Grenada time (UTC-4)", () => {
    expect(formatClock(new Date("2026-10-18T14:05:00Z"))).toBe("10:05");
  });
});

describe("paginate", () => {
  const items = Array.from({ length: 45 }, (_, i) => i);
  it("slices and clamps the page", () => {
    expect(paginate(items, "2", 20).items[0]).toBe(20);
    expect(paginate(items, "99", 20).page).toBe(3);
    expect(paginate(items, "-4", 20).page).toBe(1);
    expect(paginate(items, "abc", 20).page).toBe(1);
    expect(paginate([], undefined).pageCount).toBe(1);
  });
});
