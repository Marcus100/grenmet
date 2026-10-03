import { describe, expect, it } from "vitest";
import { formatDate, formatDirection, formatTime } from "./format";

describe("formatTime", () => {
  it("formats 24h values (with or without seconds) to 12h", () => {
    expect(formatTime("05:30")).toBe("5:30 AM");
    expect(formatTime("22:30:00")).toBe("10:30 PM");
    expect(formatTime("12:00:00")).toBe("12:00 PM");
    expect(formatTime("00:00")).toBe("12:00 AM");
  });

  it("marks service times past midnight as the next day", () => {
    expect(formatTime("24:20")).toBe("12:20 AM (next day)");
    expect(formatTime("30:05")).toBe("6:05 AM (next day)");
  });
});

describe("formatDirection", () => {
  it("labels directions relative to the airport", () => {
    expect(formatDirection("inbound")).toBe("To MBIA");
    expect(formatDirection("outbound")).toBe("From MBIA");
  });
});

describe("formatDate", () => {
  it("formats calendar dates without a timezone shift", () => {
    expect(formatDate("2026-10-05")).toBe("5 Oct 2026");
    expect(formatDate("2026-09-25")).toBe("25 Sep 2026");
  });
});
