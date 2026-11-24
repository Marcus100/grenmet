import { describe, expect, it } from "vitest";
import { buildPeople, findPerson } from "@/data/candidates";
import resultsJson from "@/data/derived/results";
import {
  type Data,
  eventDivisions,
  eventNational,
  eventResult,
  eventSource,
} from "@/data/events";
import {
  CODES,
  contestStats,
  divisionResults,
  nationalResult,
} from "@/data/model";
import campaignJson from "@/data/source/campaign.json";
import constituencies from "@/data/source/reference/constituencies.json";
import type { CampaignFile, ConstituencyCode, ResultsFile } from "@/data/types";

const results = resultsJson as unknown as ResultsFile;
const data = { results } as unknown as Data;
const contests = results.results["2026"] ?? {};

describe("2026 provisional results", () => {
  it("covers all 15 constituencies, named from the reference file", () => {
    expect(Object.keys(contests).sort()).toEqual(Object.keys(constituencies));
    expect(CODES).toHaveLength(15);
  });

  it("adds up to the national totals on the Parliamentary Elections Office page", () => {
    const national = nationalResult(results, "2026");
    expect(national.total).toBe(61_317);
    expect(national.registered).toBe(97_077);
    expect(national.seats).toEqual({ NDC: 14, NNP: 1 });
    expect(results.national["2026"]).toMatchObject({
      registered: 97_077,
      turnout: 0.634,
      provisional: true,
    });
  });

  it("gives every winner the most votes, listed first", () => {
    for (const contest of Object.values(contests)) {
      const votes = contest.c.map((row) => row[2]);
      expect(votes[0]).toBe(Math.max(...votes));
      expect(contestStats(contest).majority).toBeGreaterThan(0);
    }
    expect(contests.J?.c[0]?.[1]).toBe("NNP");
  });

  it("marks every figure provisional and leaves national-only figures empty", () => {
    for (const contest of Object.values(contests)) {
      expect(contest.provisional).toBe(true);
      expect(contest.src).toBe("peo-provisional");
      // Ballots cast and rejected exist only nationally: never derived or zero-filled.
      expect(contest.cast).toBeNull();
      expect(contest.rej).toBeNull();
    }
    expect(eventSource(data, "2026").text).toContain("provisional");
  });

  it("keeps polling-division returns that add up to each constituency", () => {
    for (const [code, contest] of Object.entries(contests)) {
      const rows = results.stations["2026"]?.[code as keyof typeof contests];
      expect(rows?.length).toBeGreaterThan(0);
      const byParty: Record<string, number> = {};
      let registered = 0;
      for (const row of rows ?? []) {
        registered += row[3] ?? 0;
        for (const [party, votes] of Object.entries(row[6]))
          byParty[party] = (byParty[party] ?? 0) + votes;
      }
      expect(byParty).toEqual(
        Object.fromEntries(contest.c.map((row) => [row[1], row[2]]))
      );
      expect(registered).toBe(contest.reg);
    }
    const stations = Object.values(results.stations["2026"] ?? {}).flat();
    expect(stations).toHaveLength(282);
  });

  it("reads through the event helpers", () => {
    expect(eventResult(data, "2026", "J")?.c[0]?.[1]).toBe("NNP");
  });

  it("keeps ballots cast and rejected empty instead of zero", () => {
    const national = eventNational(data, "2026");
    expect(national.cast).toBeNull();
    expect(national.rejected).toBeNull();
    expect(nationalResult(results, "2026").cast).toBeNull();
    for (const d of eventDivisions(data, "2026")) expect(d.cast).toBeNull();
    for (const code of CODES)
      for (const d of divisionResults(results, "2026", code))
        expect(d.cast).toBeNull();
    // Earlier elections keep their figures.
    expect(eventNational(data, "2022").cast).toBeGreaterThan(0);
    expect(eventDivisions(data, "2022")[0]?.cast).toBeGreaterThan(0);
  });

  it("joins every campaign record that is on the ballot to its result", () => {
    const campaign = campaignJson as unknown as CampaignFile;
    const people = buildPeople(results);
    const notJoined: string[] = [];
    const notOnBallot: string[] = [];
    for (const [party, slate] of Object.entries(campaign.candidates))
      for (const [code, name] of Object.entries(slate) as [
        ConstituencyCode,
        string,
      ][]) {
        const onBallot = contests[code]?.c.find((row) => row[1] === party);
        if (!onBallot) {
          notOnBallot.push(`${party} ${code} ${name}`);
          continue;
        }
        const person = findPerson(people, name);
        const joined = person?.races.some(
          (race) =>
            race.year === 2026 && race.code === code && race.party === party
        );
        if (!joined)
          notJoined.push(`${party} ${code}: ${name} / ${onBallot[0]}`);
      }
    // Reported but not on the ballot, and one probably different person.
    expect(notOnBallot.sort()).toEqual([
      "DPM A Christopher Cudjoe",
      "DPM C Aaron Lewis",
    ]);
    expect(notJoined).toEqual(["DPM B: Rolanda McQueen / Shirley Mc Queen"]);
  });
});
