import { describe, expect, it } from "vitest";
import {
  type Data,
  eventDivisions,
  eventNational,
  eventResult,
  eventSource,
  isOfficial,
  type ReferendumFile,
} from "@/data/events";
import referendumJson from "@/data/source/referendum.json";
import resultsJson from "@/data/source/results.json";
import type { ResultsFile } from "@/data/types";

const data: Data = {
  results: resultsJson as unknown as ResultsFile,
  referendum: referendumJson as unknown as ReferendumFile,
};

describe("referendums", () => {
  it("2016: station totals equal the certificate’s national Yes and No", () => {
    const n = eventNational(data, "2016r");
    expect(n.votes).toEqual({ YES: 51_946, NO: 100_140 });
    expect(n.registered).toBe(71_240);
    expect(n.cast).toBe(23_651);
    expect(n.bills).toHaveLength(7);
  });

  it("2018: national totals from the Gazette, with damaged constituencies missing", () => {
    const n = eventNational(data, "2018r");
    expect(n.votes).toEqual({ YES: 9848, NO: 12_134 });
    expect(n.missing).toEqual(["A", "B", "H", "J", "K"]);
    expect(eventResult(data, "2018r", "J")).toBeNull();
    expect(eventResult(data, "2018r", "N")?.c[0]?.[1]).toBeDefined();
  });

  it("gives referendum stations a place name", () => {
    const divisions = eventDivisions(data, "2016r", "A");
    expect(divisions.length).toBeGreaterThan(5);
    expect(divisions.find((d) => d.division === "A01")?.places[0]).toBe(
      "Windward Medical Station"
    );
  });
});

describe("general elections", () => {
  it("records where turnout comes from", () => {
    expect(eventNational(data, "2022").turnoutSource).toBe("peo");
    expect(eventNational(data, "1972").turnoutSource).toBe("gazette-valid");
    expect(eventNational(data, "1990").turnoutSource).toBe("newsletter");
    expect(eventNational(data, "1951").turnoutSource).toBe("wikipedia");
  });

  it("names the source, down to the page", () => {
    expect(eventSource(data, "2022", "A").text).toBe(
      "Parliamentary Elections Office, General Election Report 2022, p. 17"
    );
    expect(eventSource(data, "1951").official).toBe(false);
    expect(isOfficial("1976")).toBe(false);
    expect(isOfficial("1972")).toBe(true);
  });

  it("counts early elections on their own boundaries", () => {
    const n = eventNational(data, "1951");
    expect(n.races).toBe(8);
    expect(Object.values(n.seats).reduce((a, b) => a + b, 0)).toBe(8);
  });
});
