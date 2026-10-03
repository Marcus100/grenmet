import { describe, expect, it } from "vitest";
import referendumJson from "@/data/derived/referendum";
import resultsJson from "@/data/derived/results";
import type { Data, ReferendumFile } from "@/data/events";
import { metricEvidence, sourceKind } from "@/data/evidence";
import type { ResultsFile } from "@/data/types";

const data: Data = {
  results: resultsJson as unknown as ResultsFile,
  referendum: referendumJson as unknown as ReferendumFile,
};
describe("calculation evidence", () => {
  it("does not promote mixed 1990 vote totals just because winners are officially declared", () => {
    expect(metricEvidence(data, "1990", "votes").official).toBe(false);
    expect(metricEvidence(data, "1990", "seats").official).toBe(true);
    expect(metricEvidence(data, "1990", "turnout").official).toBe(false);
  });
  it("keeps official inputs and proxy methods separate", () => {
    expect(metricEvidence(data, "2022", "votes").official).toBe(true);
    expect(metricEvidence(data, "1984", "turnout").formula).toContain("proxy");
    expect(metricEvidence(data, "1976", "turnout").official).toBe(false);
    expect(metricEvidence(data, "1951", "votes").official).toBe(false);
  });
  it("does not recalculate a complete national statistic from incomplete contests", () => {
    const incomplete = structuredClone(data);
    incomplete.results.results["2022"] = Object.fromEntries(
      Object.entries(incomplete.results.results["2022"] ?? {}).filter(
        ([code]) => code !== "A"
      )
    );
    expect(metricEvidence(incomplete, "2022", "votes").official).toBe(false);
    expect(metricEvidence(incomplete, "2022", "seats").official).toBe(false);
  });
  it("retains referendum response units and source conflicts", () => {
    expect(metricEvidence(data, "2016r", "votes").note).toContain(
      "not counts of unique voters"
    );
    expect(metricEvidence(data, "1972", "votes").note).toContain(
      "discrepancies"
    );
  });
  it("classifies the publication without claiming it proves a nomination", () => {
    expect(sourceKind(["PEO", "https://www.peogrenada.org/Documents/"])).toBe(
      "official"
    );
    expect(sourceKind(["Owner confirmation", ""])).toBe("supplied");
    expect(sourceKind(["Report", "https://nowgrenada.com/article"])).toBe(
      "secondary"
    );
    expect(
      sourceKind(["Party", "https://www.facebook.com/supportndc/videos/1/"])
    ).toBe("original");
    expect(
      sourceKind(["Fake PEO", "https://peogrenada.org.example.com/"])
    ).toBe("secondary");
  });
});
