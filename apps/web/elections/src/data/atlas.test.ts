import { describe, expect, it } from "vitest";
import { buildAtlas } from "@/data/atlas";
import geoJson from "@/data/derived/geo";
import referendumJson from "@/data/derived/referendum";
import resultsJson from "@/data/derived/results";
import type { Data, ReferendumFile } from "@/data/events";
import { EARLY_YEARS, EVENTS } from "@/data/model";
import type { GeoFile, ResultsFile } from "@/data/types";

const results = resultsJson as unknown as ResultsFile;
const data: Data = {
  results,
  referendum: referendumJson as unknown as ReferendumFile,
};
const atlas = buildAtlas(data, geoJson as unknown as GeoFile, results);

describe("atlas history", () => {
  it("includes every election and referendum in chronological order", () => {
    expect(atlas.events.map((event) => event.id)).toEqual(
      EVENTS.map((event) => event.id)
    );
  });
  it.each(EARLY_YEARS)(
    "preserves %s constituency names and verification markers without modern codes",
    (year) => {
      const event = atlas.events.find((item) => item.id === String(year));
      expect(event?.mapped).toBe(false);
      expect(event?.results).toEqual({});
      expect(event?.missing).toEqual([]);
      expect(event?.divisions).toEqual([]);
      expect(event?.historicalResults).toEqual(results.early[String(year)]);
      expect(event?.national.races).toBe(year <= 1957 ? 8 : 10);
      expect(event?.national.turnoutNote).toBe(
        "Turnout from Wikipedia (secondary)"
      );
    }
  );
  it("does not calculate a mapped swing across the 1972 boundary change", () => {
    expect(atlas.events.find((event) => event.id === "1972")?.prev).toBeNull();
    expect(atlas.events.find((event) => event.id === "1976")?.prev).toBe(
      "1972"
    );
    expect(
      atlas.events.find((event) => event.id === "2022")?.historicalResults
    ).toEqual([]);
  });
});
