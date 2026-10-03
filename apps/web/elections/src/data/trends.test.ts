import { describe, expect, it } from "vitest";
import referendumJson from "@/data/derived/referendum";
import resultsJson from "@/data/derived/results";
import type { Data, ReferendumFile } from "@/data/events";
import { constituencyName } from "@/data/model";
import {
  closestResult,
  marginsExample,
  nearestEven,
  partyChanges,
  sweeps,
  turnoutRange,
} from "@/data/trends";
import type { ResultsFile } from "@/data/types";

const results = resultsJson as unknown as ResultsFile;
const data: Data = {
  results,
  referendum: referendumJson as unknown as ReferendumFile,
};

describe("trends fact sheet", () => {
  it("finds the turnout range with its provenance", () => {
    const { high, low } = turnoutRange(data);
    expect(high.year).toBe(2013);
    expect(high.official).toBe(true);
    expect(low.turnout).toBeLessThan(high.turnout);
  });

  it("lists clean sweeps with the winner's vote share", () => {
    const years = sweeps(data).map((s) => s.year);
    expect(years).toEqual(expect.arrayContaining([1999, 2013, 2018]));
    for (const s of sweeps(data)) {
      expect(s.voteShare).toBeGreaterThan(0.5);
      expect(s.voteShare).toBeLessThan(1);
    }
  });

  it("takes the middle of 15 sorted margins as the median", () => {
    const { margins, median } = marginsExample(data, "2022");
    expect(margins).toHaveLength(15);
    expect(margins).toEqual([...margins].sort((a, b) => a - b));
    expect(median).toBe(margins[7]);
  });

  it("finds the closest result and the most even 2022 constituency", () => {
    expect(closestResult(data).majority).toBeGreaterThanOrEqual(0);
    const even = nearestEven(results, "2022");
    expect(Math.abs(even.share - 0.5)).toBeLessThan(0.01);
  });

  it("counts changes of party from the data, not from memory", () => {
    const changes = Object.fromEntries(
      partyChanges(data).map((r) => [
        constituencyName(results, r.code),
        r.changes,
      ])
    );
    // St. Mark: GULP in 1972 and 1976, then NNP at every election since 1984.
    expect(changes["St. Mark"]).toBe(1);
  });
});
