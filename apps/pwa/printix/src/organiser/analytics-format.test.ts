import { describe, expect, it } from "vitest";
import {
  agoWords,
  arrivalsSummary,
  durationWords,
  entryWords,
  numberWords,
  outcomeWords,
  peakIndex,
  percent,
  phoneNote,
  QUIET_AFTER_MINUTES,
  quietMinutes,
  refusalLabel,
  scanListFileName,
  timeOf,
  timeWithSeconds,
} from "@/organiser/analytics-format";
import {
  ANALYTICS,
  ANALYTICS_NOW,
  EMPTY_ANALYTICS,
  SCAN_ADMITTED,
  SCAN_OFFLINE_UNKNOWN,
  SCAN_TYPED_REFUSED,
} from "@/test/fixtures";

describe("times", () => {
  it("shows Grenada time, four hours behind UTC", () => {
    expect(timeOf("2026-12-26T22:01:00Z")).toBe("18:01");
    expect(timeWithSeconds("2026-12-27T03:59:09Z")).toBe("23:59:09");
  });

  it("says how long ago in whole words, from the server clock", () => {
    expect(agoWords("2026-12-26T23:29:30Z", ANALYTICS_NOW)).toBe("just now");
    expect(agoWords("2026-12-26T23:29:00Z", ANALYTICS_NOW)).toBe(
      "1 minute ago"
    );
    expect(agoWords("2026-12-26T23:05:00Z", ANALYTICS_NOW)).toBe(
      "25 minutes ago"
    );
    expect(agoWords("2026-12-26T22:25:00Z", ANALYTICS_NOW)).toBe(
      "1 hour 5 minutes ago"
    );
    // A last scan a moment after the server's clock never reads as negative.
    expect(agoWords("2026-12-26T23:31:00Z", ANALYTICS_NOW)).toBe("just now");
  });

  it("words a duration in its largest units", () => {
    expect(durationWords(1)).toBe("1 second");
    expect(durationWords(59)).toBe("59 seconds");
    expect(durationWords(1500)).toBe("25 minutes");
    expect(durationWords(7200)).toBe("2 hours");
    expect(durationWords(5400)).toBe("1 hour 30 minutes");
  });
});

describe("percent", () => {
  it("rounds a share and says so when there is none", () => {
    expect(percent(0.1667)).toBe("17%");
    expect(percent(0)).toBe("0%");
    expect(percent(1)).toBe("100%");
    expect(percent(null)).toBe("none yet");
    expect(percent(undefined)).toBe("none yet");
  });
});

describe("a quiet gate phone", () => {
  const phone = (last: string | null, active = true) => ({
    id: "a1000000-0000-4000-8000-000000000001",
    last_scan_at: last,
    active,
  });

  it(`is flagged after ${QUIET_AFTER_MINUTES} minutes without a scan`, () => {
    expect(
      quietMinutes(phone("2026-12-26T23:05:00Z"), ANALYTICS_NOW, true)
    ).toBe(25);
    expect(
      quietMinutes(phone("2026-12-26T23:15:00Z"), ANALYTICS_NOW, true)
    ).toBe(15);
    expect(
      quietMinutes(phone("2026-12-26T23:16:00Z"), ANALYTICS_NOW, true)
    ).toBeNull();
  });

  it("is not flagged when the event is over, the code is cancelled, or it never scanned", () => {
    expect(
      quietMinutes(phone("2026-12-26T23:05:00Z"), ANALYTICS_NOW, false)
    ).toBeNull();
    expect(
      quietMinutes(phone("2026-12-26T23:05:00Z", false), ANALYTICS_NOW, true)
    ).toBeNull();
    expect(quietMinutes(phone(null), ANALYTICS_NOW, true)).toBeNull();
  });
});

describe("scan wording", () => {
  it("names every outcome in plain words", () => {
    expect(outcomeWords("admitted")).toBe("Let in");
    expect(outcomeWords("already_admitted")).toBe("Refused, already in");
    expect(outcomeWords("void")).toBe("Refused, void ticket");
    expect(outcomeWords("unknown")).toBe("Refused, not recognised");
    expect(outcomeWords("event_closed")).toBe("Refused, event closed");
  });

  it("describes how a scan was made and which ticket it matched", () => {
    expect(entryWords(SCAN_ADMITTED)).toBe("scanned");
    expect(entryWords(SCAN_TYPED_REFUSED)).toBe("typed");
    expect(entryWords(SCAN_OFFLINE_UNKNOWN)).toBe("scanned, sent late");
    expect(numberWords(SCAN_ADMITTED)).toBe("205");
    expect(numberWords(SCAN_OFFLINE_UNKNOWN)).toBe("no ticket matched");
  });

  it("labels a refusal reason, and falls back to the code for a new one", () => {
    expect(refusalLabel("already_admitted")).toBe("Already in");
    expect(refusalLabel("unknown")).toBe("Not recognised");
    expect(refusalLabel("something_new")).toBe("something_new");
  });
});

describe("the chart's text summary", () => {
  it("states the total, the span and the busiest five minutes", () => {
    expect(arrivalsSummary(ANALYTICS)).toBe(
      "120 people let in, from 18:01 to 19:28 (1 hour 27 minutes). The busiest five minutes began at 18:10, with 40 people."
    );
  });

  it("says plainly that no one has arrived", () => {
    expect(arrivalsSummary(EMPTY_ANALYTICS)).toBe(
      "No one has been let in yet. The chart fills in as people arrive."
    );
  });

  it("finds the first tallest bar", () => {
    expect(peakIndex(ANALYTICS.arrivals)).toBe(2);
    expect(peakIndex([])).toBe(-1);
    expect(
      peakIndex([{ starts_at: "2026-12-26T22:00:00Z", admitted: 0 }])
    ).toBe(-1);
  });
});

describe("the download name", () => {
  it("carries the event date and no personal or ticket data", () => {
    expect(scanListFileName("2026-12-26")).toBe("printix-scans-2026-12-26.csv");
  });
});

describe("the note about a gate phone", () => {
  const phone = (last: string | null, active = true) => ({
    id: "a1000000-0000-4000-8000-000000000001",
    last_scan_at: last,
    active,
  });
  const alone = { many: false, number: 1 };
  const second = { many: true, number: 2 };

  it("flags a quiet phone with what to do", () => {
    expect(
      phoneNote(phone("2026-12-26T23:05:00Z"), alone, ANALYTICS_NOW, true)
    ).toEqual({
      flagged: true,
      key: "a1000000-0000-4000-8000-000000000001",
      text: "This phone has not scanned for 25 minutes. Check it.",
    });
    expect(
      phoneNote(phone("2026-12-26T23:05:00Z"), second, ANALYTICS_NOW, true)
        ?.text
    ).toBe("Phone 2 has not scanned for 25 minutes. Check it.");
  });

  it("says nothing about a healthy single phone", () => {
    expect(
      phoneNote(phone("2026-12-26T23:29:00Z"), alone, ANALYTICS_NOW, true)
    ).toBeNull();
  });

  it("lists every phone of a gate that has several, and a cancelled code", () => {
    expect(
      phoneNote(phone("2026-12-26T23:29:00Z"), second, ANALYTICS_NOW, true)
        ?.text
    ).toBe("Phone 2: last scan 19:29.");
    expect(phoneNote(phone(null), second, ANALYTICS_NOW, true)?.text).toBe(
      "Phone 2: no scan yet."
    );
    expect(
      phoneNote(phone(null, false), second, ANALYTICS_NOW, true)?.text
    ).toBe("Phone 2: no scan yet, gate code no longer active.");
    expect(
      phoneNote(phone(null, false), alone, ANALYTICS_NOW, true)?.text
    ).toBe("This gate code is no longer active.");
  });
});
