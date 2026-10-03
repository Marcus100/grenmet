import { describe, expect, it } from "vitest";
import { buildDemoEvents } from "@/data/community-fixtures";
import { buildIcs } from "./ics";

const now = new Date("2026-10-03T12:00:00-04:00");

describe("buildIcs", () => {
  const event = buildDemoEvents(now).find(
    (candidate) => candidate.slug === "feel-free-sunset"
  );
  if (!event) {
    throw new Error("fixture missing");
  }
  const ics = buildIcs(
    event,
    "https://example.test/events/feel-free-sunset",
    now
  );

  it("writes Grenada local time as UTC", () => {
    // 4:00 PM Grenada (UTC−4) is 20:00 UTC.
    expect(ics).toContain("DTSTART:20261003T200000Z");
  });

  it("uses CRLF line endings and escapes newlines", () => {
    expect(ics).toContain("\r\nEND:VCALENDAR\r\n");
    expect(ics).toContain("SUMMARY:Feel Free: Sunset");
    expect(ics).toContain("three DJs and a live band.\\n");
    expect(ics).toContain("LOCATION:Grenada National Stadium grounds");
  });

  it("escapes RFC 5545 special characters", () => {
    const tricky = buildIcs(
      { ...event, title: "Food; drink, and \\ more" },
      "u",
      now
    );
    expect(tricky).toContain("SUMMARY:Food\\; drink\\, and \\\\ more");
  });
});
