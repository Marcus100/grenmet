import { describe, expect, it } from "vitest";
import {
  calendarFrom,
  currentHouse,
  daysUntil,
  type ElectionCalendar,
  electionPhase,
  electionStatus,
  grenadaDate,
  seatOutlook,
} from "@/data/election-2026";
import campaignJson from "@/data/source/campaign.json";
import resultsJson from "@/data/source/results.json";
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

  it("lists named candidates and keeps the note for an unnamed slot", () => {
    const g = seats.find((s) => s.code === "G");
    expect(g?.candidates).toEqual([
      { name: "Troy Noel", party: "NNP" },
      { name: "Peter David", party: "DPM" },
    ]);
    const e = seats.find((s) => s.code === "E");
    expect(e?.candidates.some((c) => c.party === "NNP")).toBe(false);
    expect(e?.notes.NNP).toContain("no named NNP candidate");
  });
});
