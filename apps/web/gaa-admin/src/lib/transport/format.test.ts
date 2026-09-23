import { describe, expect, it } from "vitest";
import { formatDayType, formatDirection, formatTime } from "./format";

describe("formatTime", () => {
  it("formats 24h values (with or without seconds) to 12h", () => {
    expect(formatTime("05:30")).toBe("5:30 AM");
    expect(formatTime("22:30:00")).toBe("10:30 PM");
    expect(formatTime("12:00:00")).toBe("12:00 PM");
    expect(formatTime("00:00")).toBe("12:00 AM");
  });
});

describe("formatDirection / formatDayType", () => {
  it("labels directions and day-types", () => {
    expect(formatDirection("inbound")).toBe("To MBIA");
    expect(formatDirection("outbound")).toBe("From MBIA");
    expect(formatDayType("daily")).toBe("Daily");
    expect(formatDayType("sun_hol")).toBe("Sundays & public holidays");
    expect(formatDayType("mon_sat")).toBe("Mon–Sat");
  });
});
