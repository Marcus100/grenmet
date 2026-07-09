import { describe, expect, it } from "vitest";

import { formatDate, formatDateTime, getInitials } from "@/lib/profile";

const RE_JUL = /jul/i;
const RE_JULY = /july/i;
const RE_CLOCK_TIME = /\d{1,2}:\d{2}/;

describe("getInitials", () => {
  it("uses first and last name initials", () => {
    expect(getInitials("Eugine Whint", "e@example.com")).toBe("EW");
  });

  it("skips middle names", () => {
    expect(getInitials("Eugine Kofi Whint", "e@example.com")).toBe("EW");
  });

  it("uses a single initial for a single name", () => {
    expect(getInitials("Eugine", "e@example.com")).toBe("E");
  });

  it("collapses extra whitespace", () => {
    expect(getInitials("  Eugine   Whint  ", "e@example.com")).toBe("EW");
  });

  it("falls back to the email when full name is null", () => {
    expect(getInitials(null, "kwame@example.com")).toBe("K");
  });

  it("falls back to the email when full name is blank", () => {
    expect(getInitials("   ", "ama@example.com")).toBe("A");
  });

  it("returns a placeholder when nothing is usable", () => {
    expect(getInitials(null, "")).toBe("?");
  });
});

describe("formatDateTime", () => {
  it("formats an ISO timestamp with date and time", () => {
    const formatted = formatDateTime("2026-07-07T14:30:00Z");
    expect(formatted).toContain("2026");
    expect(formatted).toMatch(RE_JUL);
    expect(formatted).toMatch(RE_CLOCK_TIME);
  });
});

describe("formatDate", () => {
  it("formats an ISO timestamp as a date without time", () => {
    const formatted = formatDate("2026-07-07T14:30:00Z");
    expect(formatted).toContain("2026");
    expect(formatted).toMatch(RE_JULY);
    expect(formatted).not.toMatch(RE_CLOCK_TIME);
  });
});
