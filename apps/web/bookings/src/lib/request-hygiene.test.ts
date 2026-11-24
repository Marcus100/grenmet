import { describe, expect, it } from "vitest";
import {
  checkExpiry,
  checkMaxOpen,
  EXPIRY_INVALID,
  expiryText,
  MAX_OPEN_INVALID,
} from "./request-hygiene";

describe("checkExpiry", () => {
  it("accepts 1 to 168 whole hours", () => {
    expect(checkExpiry("hours", "1")).toEqual({ ok: true, value: 1 });
    expect(checkExpiry("hours", " 24 ")).toEqual({ ok: true, value: 24 });
    expect(checkExpiry("hours", "168")).toEqual({ ok: true, value: 168 });
  });

  it("refuses 0, 169, decimals, blanks and text", () => {
    for (const text of ["0", "169", "1.5", "", "abc", "-3"]) {
      expect(checkExpiry("hours", text)).toEqual({
        ok: false,
        message: EXPIRY_INVALID,
      });
    }
  });

  it("is null for only at the start time, whatever the hours say", () => {
    expect(checkExpiry("start", "")).toEqual({ ok: true, value: null });
    expect(checkExpiry("start", "999")).toEqual({ ok: true, value: null });
  });
});

describe("checkMaxOpen", () => {
  it("accepts 1 to 20", () => {
    expect(checkMaxOpen("1")).toEqual({ ok: true, value: 1 });
    expect(checkMaxOpen("20")).toEqual({ ok: true, value: 20 });
  });

  it("refuses 0, 21, decimals and blanks", () => {
    for (const text of ["0", "21", "2.5", ""]) {
      expect(checkMaxOpen(text)).toEqual({
        ok: false,
        message: MAX_OPEN_INVALID,
      });
    }
  });
});

describe("expiryText", () => {
  const now = new Date("2026-11-29T12:00:00Z");
  const farStart = "2026-12-20T12:00:00Z";

  it("counts hours inside the window from the request time", () => {
    expect(
      expiryText({
        createdAt: "2026-11-29T10:00:00Z",
        hours: 24,
        now,
        startsAt: farStart,
      })
    ).toBe("Expires in 22 h");
  });

  it("counts minutes under an hour", () => {
    expect(
      expiryText({
        createdAt: "2026-11-28T12:20:00Z",
        hours: 24,
        now,
        startsAt: farStart,
      })
    ).toBe("Expires in 20 min");
  });

  it("uses the start time when it is sooner than the window", () => {
    expect(
      expiryText({
        createdAt: "2026-11-29T11:00:00Z",
        hours: 24,
        now,
        startsAt: "2026-11-29T15:00:00Z",
      })
    ).toBe("Expires in 3 h");
  });

  it("uses the start time when the setting is null", () => {
    expect(
      expiryText({ hours: null, now, startsAt: "2026-11-29T12:45:00Z" })
    ).toBe("Expires in 45 min");
  });

  it("reads Expiring now when it is past", () => {
    expect(
      expiryText({
        createdAt: "2026-11-27T12:00:00Z",
        hours: 24,
        now,
        startsAt: farStart,
      })
    ).toBe("Expiring now");
  });

  it("says nothing when a window is set but the request time is unknown", () => {
    expect(expiryText({ hours: 24, now, startsAt: farStart })).toBeNull();
  });
});
