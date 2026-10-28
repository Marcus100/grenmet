import type { SectorOutlook } from "@barrelsgd/api-client";
import { describe, expect, it } from "vitest";
import {
  buildSectorTiles,
  firstSentence,
  whenLabel,
} from "@/lib/sector-outlook";

// 28 Oct 2026, 11:00 in Grenada (UTC-4).
const NOW = new Date("2026-10-28T15:00:00Z");
const at = (iso: string) => new Date(iso);

describe("whenLabel", () => {
  it("says in effect for something already running", () => {
    expect(whenLabel(at("2026-10-28T10:00:00Z"), null, NOW)).toBe("In effect");
    expect(whenLabel(null, at("2026-10-30T22:00:00Z"), NOW)).toBe(
      "In effect until Fri 30 Oct"
    );
  });
  it("names the days for something that starts later", () => {
    expect(
      whenLabel(at("2026-10-30T10:00:00Z"), at("2026-10-31T22:00:00Z"), NOW)
    ).toBe("Fri 30 Oct to Sat 31 Oct");
    expect(whenLabel(at("2026-10-30T10:00:00Z"), null, NOW)).toBe(
      "From Fri 30 Oct"
    );
    expect(
      whenLabel(at("2026-10-30T10:00:00Z"), at("2026-10-30T20:00:00Z"), NOW)
    ).toBe("Fri 30 Oct");
  });
  it("counts days in Grenada time, not UTC", () => {
    // 02:00 UTC on the 29th is still the evening of the 28th in Grenada.
    expect(whenLabel(at("2026-10-29T02:00:00Z"), null, NOW)).toBe("In effect");
  });
});

describe("firstSentence", () => {
  it("keeps the first sentence and clips a long one", () => {
    expect(firstSentence("Floods are likely. Stay home.")).toBe(
      "Floods are likely."
    );
    expect(firstSentence("  one   two  ")).toBe("one two");
    expect(firstSentence("")).toBe("");
    const long = firstSentence(`${"word ".repeat(60)}.`);
    expect(long.length).toBeLessThanOrEqual(140);
    expect(long.endsWith("…")).toBe(true);
  });
});

describe("buildSectorTiles", () => {
  const item = (
    overrides: Partial<SectorOutlook["items"][number]>
  ): SectorOutlook["items"][number] => ({
    source: "CAP",
    title: "T",
    product: "Warning",
    impacts: "Impact. More.",
    response: "",
    reference: "r",
    sectors: [],
    affects_everyone: true,
    ...overrides,
  });
  const outlook = (items: SectorOutlook["items"]): SectorOutlook => ({
    as_of: "2026-10-28T15:00:00Z",
    window_start: "2026-10-28T04:00:00Z",
    window_end: "2026-11-04T04:00:00Z",
    complete: true,
    items,
  });

  it("makes one tile per sector, in menu order", () => {
    expect(
      buildSectorTiles(outlook([]), NOW).map((tile) => tile.sector)
    ).toEqual([
      "tourism",
      "marine",
      "aviation",
      "agriculture",
      "health",
      "roads-transport",
    ]);
  });
  it("puts tagged items under their sectors and untagged items under all, keeping the API order", () => {
    const tiles = buildSectorTiles(
      outlook([
        item({
          title: "First",
          sectors: ["marine"],
          affects_everyone: false,
          identifier: "A",
        }),
        item({ title: "Second", identifier: "B" }),
      ]),
      NOW
    );
    const marine = tiles.find((tile) => tile.sector === "marine");
    const health = tiles.find((tile) => tile.sector === "health");
    expect(marine?.items.map((entry) => entry.title)).toEqual([
      "First",
      "Second",
    ]);
    expect(health?.items.map((entry) => entry.title)).toEqual(["Second"]);
    expect(health?.items[0]?.everyone).toBe(true);
  });
  it("labels an outlook without a colour and links by identifier or product id", () => {
    const [tourism] = buildSectorTiles(
      outlook([
        item({ colour: null, identifier: "GMS 1:x" }),
        item({
          colour: "yellow",
          identifier: null,
          product_id: "11111111-1111-4111-8111-111111111111",
        }),
      ]),
      NOW
    );
    expect(tourism?.items.map((entry) => [entry.level, entry.href])).toEqual([
      ["Outlook", "/alerts/GMS%201%3Ax"],
      ["Yellow level", "/weather/issued/11111111-1111-4111-8111-111111111111"],
    ]);
  });
  it("limits a tile and counts the rest", () => {
    const many = Array.from({ length: 5 }, (_, index) =>
      item({ identifier: `I${index}` })
    );
    const [tourism] = buildSectorTiles(outlook(many), NOW, 2);
    expect(tourism?.items).toHaveLength(2);
    expect(tourism?.more).toBe(3);
  });
});
