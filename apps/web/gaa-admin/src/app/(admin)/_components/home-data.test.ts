import type { PublishedProduct } from "@barrelsgd/gms/products";
import { describe, expect, it } from "vitest";
import type { ImagesBySynoptic } from "@/db/wxwatch/queries";
import type { WeatherImage } from "@/db/wxwatch/schema";
import {
  grenadaToday,
  relativeTime,
  summarizeImagery,
  summarizeProducts,
} from "./home-data";

function published(
  kind: PublishedProduct["kind"],
  issuedAt: string
): PublishedProduct {
  return {
    id: `${kind}-${issuedAt}`,
    kind,
    publishedAt: `${issuedAt}:00Z`,
    revision: 1,
    values: { issuedAt },
  };
}

function image(overrides: Partial<WeatherImage> = {}): WeatherImage {
  return {
    observationTime: new Date("2026-09-09T06:00:00Z"),
    ...overrides,
  } as WeatherImage;
}

const EMPTY_SLOTS = {
  "00": null,
  "03": null,
  "06": null,
  "09": null,
  "12": null,
  "15": null,
  "18": null,
  "21": null,
};

describe("summarizeProducts", () => {
  it("counts only today's scheduled suite and keeps bulletins separate", () => {
    const summary = summarizeProducts(
      [
        published("morning", "2026-09-09T05:30"),
        published("midday", "2026-09-09T11:00"),
        published("evening", "2026-09-08T17:00"),
        published("marine", "2026-09-09T06:00"),
      ],
      "2026-09-09"
    );

    expect(summary.issued).toBe(2);
    expect(summary.expected).toBe(4);
    expect(summary.schedule.map((item) => item.status)).toEqual([
      "issued",
      "issued",
      "pending",
      "pending",
    ]);
    expect(summary.schedule[0].issuedAt).toBe("2026-09-09T05:30");
    expect(summary.bulletins.map((item) => item.kind)).toEqual(["marine"]);
  });

  it("treats a missing issue stamp as not issued today", () => {
    const summary = summarizeProducts(
      [{ id: "x", kind: "morning", publishedAt: "", revision: 1, values: {} }],
      "2026-09-09"
    );
    expect(summary.issued).toBe(0);
  });
});

describe("summarizeImagery", () => {
  it("counts captured slots against the full synoptic day and finds the newest frame", () => {
    const groups: ImagesBySynoptic = [
      {
        name: "goes19",
        synopticImages: {
          ...EMPTY_SLOTS,
          "00": image({ observationTime: new Date("2026-09-09T00:00:00Z") }),
          "06": image({ observationTime: new Date("2026-09-09T06:00:00Z") }),
        },
      },
      {
        name: "model",
        synopticImages: {
          ...EMPTY_SLOTS,
          "12": image({ observationTime: new Date("2026-09-09T12:00:00Z") }),
        },
      },
    ];

    const summary = summarizeImagery(groups);

    expect(summary.captured).toBe(3);
    expect(summary.expected).toBe(16);
    expect(summary.sources).toBe(2);
    expect(summary.latest?.observationTime).toEqual(
      new Date("2026-09-09T12:00:00Z")
    );
  });

  it("reports an empty day without a latest frame", () => {
    expect(summarizeImagery([])).toEqual({
      captured: 0,
      expected: 0,
      latest: null,
      sources: 0,
    });
  });
});

describe("relativeTime", () => {
  const now = new Date("2026-09-09T12:00:00Z").getTime();

  it.each([
    ["2026-09-09T11:59:40Z", "Just now"],
    ["2026-09-09T11:48:00Z", "12 min ago"],
    ["2026-09-09T09:00:00Z", "3 h ago"],
    ["2026-09-07T12:00:00Z", "2 d ago"],
    ["2026-09-09T12:30:00Z", "Scheduled"],
  ])("renders %s as %s", (value, expected) => {
    expect(relativeTime(value, now)).toBe(expected);
  });

  it("does not invent an age for missing or unparseable stamps", () => {
    expect(relativeTime(null, now)).toBe("Unknown");
    expect(relativeTime("not a date", now)).toBe("Unknown");
  });
});

it("reads the desk's calendar day in Grenada time, not UTC", () => {
  // 01:30 UTC on the 10th is still the 9th at the station (UTC-4).
  expect(grenadaToday(new Date("2026-09-10T01:30:00Z"))).toBe("2026-09-09");
});
