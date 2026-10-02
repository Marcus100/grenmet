import { describe, expect, it } from "vitest";
import resultsJson from "@/data/derived/results";
import {
  calendarFrom,
  candidateNote,
  candidateSource,
  currentHouse,
  daysUntil,
  type ElectionCalendar,
  electionPhase,
  electionStatus,
  grenadaDate,
  seatOutlook,
  slateSources,
} from "@/data/election-2026";
import campaignJson from "@/data/source/campaign.json";
import type { CampaignFile, ResultsFile } from "@/data/types";

const results = resultsJson as unknown as ResultsFile;
const campaign = campaignJson as unknown as CampaignFile;
const calendar = calendarFrom(campaign);
const withPollingDay: ElectionCalendar = {
  ...calendar,
  pollingDay: "2026-11-12",
};

describe("grenadaDate", () => {
  it("uses Grenada time (UTC−4), not UTC", () => {
    expect(grenadaDate(new Date("2026-10-04T02:00:00Z"))).toBe("2026-10-03");
    expect(grenadaDate(new Date("2026-10-04T05:00:00Z"))).toBe("2026-10-04");
  });
});

describe("electionPhase", () => {
  it("waits for a date until polling day is set", () => {
    expect(electionPhase(calendar, new Date("2026-10-02T12:00:00Z"))).toBe(
      "awaiting-date"
    );
  });

  it("moves through campaign, polling day and counting", () => {
    expect(
      electionPhase(withPollingDay, new Date("2026-11-01T12:00:00Z"))
    ).toBe("campaign");
    expect(
      electionPhase(withPollingDay, new Date("2026-11-12T12:00:00Z"))
    ).toBe("polling-day");
    expect(
      electionPhase(withPollingDay, new Date("2026-11-13T12:00:00Z"))
    ).toBe("counting");
  });
});

describe("electionStatus", () => {
  it("counts down to the announcement, then to polling day", () => {
    expect(daysUntil("2026-10-04", new Date("2026-10-02T12:00:00Z"))).toBe(2);
    expect(electionStatus(calendar, new Date("2026-10-02T12:00:00Z"))).toBe(
      "Election date due 4 October 2026"
    );
    expect(electionStatus(calendar, new Date("2026-10-04T12:00:00Z"))).toBe(
      "Election date due today"
    );
    expect(electionStatus(calendar, new Date("2026-10-05T12:00:00Z"))).toBe(
      "Election date not yet announced"
    );
    expect(
      electionStatus(withPollingDay, new Date("2026-11-02T12:00:00Z"))
    ).toBe("Grenada votes in 10 days");
  });
});

describe("seatOutlook", () => {
  const seats = seatOutlook(results, campaign);

  it("has one row per constituency, named from the data", () => {
    expect(seats).toHaveLength(15);
    expect(seats.find((s) => s.code === "G")?.name).toBe("Town of St. George");
    expect(seats.find((s) => s.code === "J")?.name).toBe(
      "St. George North West"
    );
  });

  it("applies floor crossings since 2022", () => {
    const e = seats.find((s) => s.code === "E");
    expect(e?.winner2022.party).toBe("NNP");
    expect(e?.sitting).toMatchObject({
      name: "Delma Thomas",
      party: "NDC",
      was: "NNP",
    });
    expect(currentHouse(seats)).toEqual({ NDC: 10, NNP: 4, DPM: 1 });
  });

  it("lists named candidates with notes for uncertain ones", () => {
    const g = seats.find((s) => s.code === "G");
    expect(g?.candidates).toEqual([
      { name: "Claudette Joseph", party: "NDC" },
      { name: "Troy Noel", party: "NNP" },
      { name: "Peter David", party: "DPM" },
    ]);
    // Named later in a commentary, so the NNP slot carries a ✱ note.
    const e = seats.find((s) => s.code === "E");
    expect(e?.candidates.some((c) => c.party === "NNP")).toBe(true);
    expect(e?.notes.NNP).toContain("Not yet confirmed");
  });
});

describe("candidate attribution", () => {
  it("uses a seat-specific source, then the party slate, then no source", () => {
    expect(candidateSource(campaign, "NDC", "D")).toBe("owner2oct");
    expect(candidateSource(campaign, "NNP", "G")).toBe("nnp14");
    expect(candidateSource(campaign, "unknown", "D")).toBeNull();
  });
  it("deduplicates sources shared by several candidates", () => {
    const sources = slateSources(campaign, "NDC");
    expect(sources.filter((source) => source === "owner2oct")).toHaveLength(1);
    expect(sources).toContain("gbn-ndc2");
    expect(slateSources(campaign, "unknown")).toEqual([]);
  });
  it("propagates Niecal Joseph and the owner confirmation to St. Andrew North East", () => {
    const seat = seatOutlook(results, campaign).find((s) => s.code === "D");
    expect(seat?.name).toBe("St. Andrew North East");
    expect(seat?.candidates).toContainEqual({
      name: "Niecal Joseph",
      party: "NDC",
    });
    expect(seat?.notes.NDC).toContain("Confirmed to us on 2 October");
    expect(candidateNote(campaign, "NDC", "D")).toBe(seat?.notes.NDC);
    expect(candidateNote(campaign, "NNP", "E")).toContain("Not yet confirmed");
    expect(candidateNote(campaign, "unknown", "D")).toBeUndefined();
  });
  it("resolves every declared candidate source to a recorded source", () => {
    for (const seat of seatOutlook(results, campaign)) {
      for (const candidate of seat.candidates) {
        const source = candidateSource(campaign, candidate.party, seat.code);
        expect(source).not.toBeNull();
        if (source) expect(campaign.sources[source]).toBeDefined();
      }
    }
  });
});

it.each([
  ["E", "Delma Thomas"],
  ["B", "David Andrew"],
  ["G", "Claudette Joseph"],
  ["H", "Ron Livingston Redhead"],
  ["M", "Kerryne James"],
  ["C", "Lennox Andrews"],
] as const)(
  "keeps the owner's NDC confirmation for constituency %s",
  (code, name) => {
    expect(campaign.candidates.NDC?.[code]).toBe(name);
    expect(candidateSource(campaign, "NDC", code)).toBe("owner2oct");
    expect(candidateNote(campaign, "NDC", code)).toContain("Confirmed to us");
  }
);

it("lists one named NDC candidate in every constituency", () => {
  const seats = seatOutlook(results, campaign);
  expect(seats).toHaveLength(15);
  for (const seat of seats)
    expect(
      seat.candidates.filter((candidate) => candidate.party === "NDC")
    ).toHaveLength(1);
});
