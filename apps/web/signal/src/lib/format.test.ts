import { describe, expect, it } from "vitest";
import { formatLongDate, formatRelativeTime } from "./format";

const YEAR_RE = /2026/;

describe("formatRelativeTime", () => {
  const now = new Date("2026-06-13T12:00:00Z");

  it("returns 'just now' under a minute", () => {
    expect(formatRelativeTime("2026-06-13T11:59:40Z", now)).toBe("just now");
  });

  it("returns minutes for recent times", () => {
    expect(formatRelativeTime("2026-06-13T11:30:00Z", now)).toBe("30 min ago");
  });

  it("returns hours within a day", () => {
    expect(formatRelativeTime("2026-06-13T09:00:00Z", now)).toBe(
      "about 3 hours ago"
    );
  });

  it("uses singular hour", () => {
    expect(formatRelativeTime("2026-06-13T11:00:00Z", now)).toBe(
      "about 1 hour ago"
    );
  });

  it("returns days within a week", () => {
    expect(formatRelativeTime("2026-06-10T12:00:00Z", now)).toBe("3 days ago");
  });

  it("falls back to a date beyond a week", () => {
    expect(formatRelativeTime("2026-05-01T12:00:00Z", now)).toMatch(YEAR_RE);
  });
});

describe("formatLongDate", () => {
  it("renders a long, readable date", () => {
    expect(formatLongDate("2026-06-13")).toMatch(YEAR_RE);
  });
});
