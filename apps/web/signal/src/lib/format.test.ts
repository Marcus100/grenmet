import { describe, expect, it } from "vitest";
import { daysSince } from "@/lib/format";

const NOW = new Date("2026-11-16T12:00:00Z");

describe("daysSince", () => {
  it("counts whole days from the calendar date", () => {
    expect(daysSince("2026-11-16", NOW)).toBe(0);
    expect(daysSince("2026-11-14", NOW)).toBe(2);
    expect(daysSince("2026-11-13", NOW)).toBe(3);
  });

  it("never reports a future date as in the past", () => {
    expect(daysSince("2026-11-20", NOW)).toBe(0);
  });

  it("treats an unreadable date as infinitely old, never as recent", () => {
    expect(daysSince("not-a-date", NOW)).toBe(Number.POSITIVE_INFINITY);
  });

  it("counts the old briefing from the sample (3 October) as stale", () => {
    expect(daysSince("2026-10-03", NOW)).toBeGreaterThan(2);
  });
});
