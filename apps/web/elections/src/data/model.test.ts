import { describe, expect, it } from "vitest";
import {
  CODES,
  codeFromSlug,
  constituencyHref,
  contestStats,
  divisionResults,
  EVENTS,
  generalResult,
  leanLabel,
  nationalResult,
  nationalTwoParty,
  pollScore,
  prevGeneral,
  seatHistory,
  seatLean,
  seatTwoParty,
  slugify,
} from "@/data/model";
import resultsJson from "@/data/source/results.json";
import type { ResultsFile } from "@/data/types";

const results = resultsJson as unknown as ResultsFile;

describe("nationalResult", () => {
  it("matches the PEO final summary for 2022", () => {
    const n = nationalResult(results, "2022");
    expect(n.seats).toEqual({ NDC: 9, NNP: 6 });
    expect(n.votes.NDC).toBe(31_432);
    expect(n.votes.NNP).toBe(28_960);
    expect(n.cast).toBe(60_853);
    expect(n.registered).toBe(87_566);
    expect(n.rejected).toBe(218);
    expect(n.turnout).toBeCloseTo(0.695, 3);
  });

  it("matches the PEO final summary for 2018 (a clean sweep)", () => {
    const n = nationalResult(results, "2018");
    expect(n.seats).toEqual({ NNP: 15 });
    expect(n.votes.NNP).toBe(33_792);
    expect(n.votes.NDC).toBe(23_249);
  });
});

describe("contestStats", () => {
  it("works out majority, margin and turnout from raw votes", () => {
    const contest = generalResult(results, "2022", "A");
    if (!contest) throw new Error("missing 2022 A");
    const s = contestStats(contest);
    expect(s.winner[1]).toBe("NDC");
    expect(s.majority).toBe(1956 - 1806);
    expect(s.margin).toBeCloseTo(150 / (1956 + 1806), 6);
    expect(s.turnout).toBeCloseTo(3780 / 5448, 6);
    expect(s.twoParty).toBeCloseTo(1956 / (1956 + 1806), 6);
  });
});

describe("events", () => {
  it("lists every general election and both referendums in order", () => {
    expect(EVENTS.filter((e) => e.kind === "general")).toHaveLength(17);
    const ids = EVENTS.map((e) => e.id);
    expect(ids.indexOf("2016r")).toBeLessThan(ids.indexOf("2018"));
    expect(ids.indexOf("2018")).toBeLessThan(ids.indexOf("2018r"));
  });

  it("finds the previous mapped general election, skipping the 1979–83 gap", () => {
    expect(prevGeneral("1984")).toBe("1976");
    expect(prevGeneral("2022")).toBe("2018");
    expect(prevGeneral("1972")).toBeNull();
    expect(prevGeneral("2016r")).toBeNull();
  });
});

describe("nationalTwoParty", () => {
  it("gives the NDC share of the NDC–NNP vote", () => {
    expect(nationalTwoParty(results, "2022")).toBeCloseTo(
      31_432 / (31_432 + 28_960),
      3
    );
  });
});

describe("seatLean", () => {
  it("is zero-sum around the country and labels its direction", () => {
    expect(leanLabel(0.071)).toBe("NDC+7");
    expect(leanLabel(-0.03)).toBe("NNP+3");
    expect(leanLabel(0.004)).toBe("EVEN");
    const e = seatTwoParty(results, "2022", "E");
    const nation = nationalTwoParty(results, "2022");
    const e18 = seatTwoParty(results, "2018", "E");
    const n18 = nationalTwoParty(results, "2018");
    if (e == null || nation == null || e18 == null || n18 == null)
      throw new Error("missing data");
    expect(seatLean(results, "E")).toBeCloseTo(
      0.75 * (e - nation) + 0.25 * (e18 - n18),
      9
    );
  });
});

describe("pollScore", () => {
  it("compares a poll's NDC share with the result that followed", () => {
    const s = pollScore(results, { NDC: 18, NNP: 40, target: "2018" });
    expect(s?.estimate).toBeCloseTo(18 / 58, 6);
    expect(s?.error).toBeLessThan(0);
    expect(
      pollScore(results, { NDC: null, NNP: 30, target: "2018" })
    ).toBeNull();
    expect(pollScore(results, { NDC: 40, NNP: 30, target: "next" })).toBeNull();
  });
});

describe("seatHistory and divisionResults", () => {
  it("lists every mapped election a seat was fought", () => {
    const history = seatHistory(results, "A");
    expect(history.at(-1)).toMatchObject({
      year: "2022",
      winner: { name: "Tevin Camilloh Andrews", party: "NDC", votes: 1956 },
    });
    expect(history[0]?.year).toBe("1972");
  });

  it("adds polling stations up to their divisions", () => {
    const divisions = divisionResults(results, "2022", "A");
    expect(divisions.length).toBeGreaterThan(5);
    const a01 = divisions.find((d) => d.division === "A01");
    expect(a01?.c.map((r) => r[1])).toContain("NDC");
    const ndc = divisions.reduce(
      (sum, d) => sum + (d.c.find((r) => r[1] === "NDC")?.[2] ?? 0),
      0
    );
    expect(ndc).toBe(1956);
  });
});

describe("constituency addresses", () => {
  it("slugs names, including ampersands and full stops", () => {
    expect(slugify("Carriacou & Petite Martinique")).toBe(
      "carriacou-and-petite-martinique"
    );
    expect(constituencyHref(results, "G")).toBe(
      "/constituencies/town-of-st-george"
    );
  });

  it("reads a name slug or an old PEO letter, and nothing else", () => {
    expect(codeFromSlug(results, "st-george-north-west")).toBe("J");
    expect(codeFromSlug(results, "n")).toBe("N");
    expect(codeFromSlug(results, "atlantis")).toBeNull();
  });

  it("gives every constituency a different address", () => {
    const hrefs = CODES.map((code) => constituencyHref(results, code));
    expect(new Set(hrefs).size).toBe(15);
  });
});
