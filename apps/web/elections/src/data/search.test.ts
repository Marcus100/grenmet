import { describe, expect, it } from "vitest";
import geoJson from "@/data/derived/geo";
import resultsJson from "@/data/derived/results";
import { buildSearchIndex, searchConstituencies } from "@/data/search";
import campaignJson from "@/data/source/campaign.json";
import type { CampaignFile, GeoFile, ResultsFile } from "@/data/types";

const index = buildSearchIndex(
  resultsJson as unknown as ResultsFile,
  geoJson as unknown as GeoFile,
  campaignJson as unknown as CampaignFile
);

describe("constituency search", () => {
  it("finds a constituency by name, first", () => {
    const [top] = searchConstituencies(index, "st. mark");
    expect(top).toMatchObject({
      kind: "constituency",
      label: "St. Mark",
      href: "/constituencies/st-mark",
    });
  });

  it("finds a village and sends it to its constituency", () => {
    const hit = searchConstituencies(index, "grand anse").find(
      (e) => e.kind === "place"
    );
    expect(hit?.href).toBe("/constituencies/st-george-south");
    expect(hit?.note).toContain("St. George South");
  });

  it("finds sitting members and 2026 candidates", () => {
    expect(searchConstituencies(index, "peter david")[0]?.href).toBe(
      "/constituencies/town-of-st-george"
    );
    expect(searchConstituencies(index, "delma")[0]?.note).toContain(
      "NDC member"
    );
  });

  it("waits for two letters and caps the list", () => {
    expect(searchConstituencies(index, "s")).toEqual([]);
    expect(searchConstituencies(index, "st").length).toBeLessThanOrEqual(8);
  });
});

it("finds Niecal Joseph in St. Andrew North East", () => {
  expect(searchConstituencies(index, "niecal joseph")[0]).toMatchObject({
    label: "Niecal Joseph",
    href: "/constituencies/st-andrew-north-east",
  });
});
