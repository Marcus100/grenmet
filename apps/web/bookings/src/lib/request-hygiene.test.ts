import { describe, expect, it } from "vitest";
import {
  checkExpiry,
  checkMaxOpen,
  EXPIRY_INVALID,
  expiryText,
  MAX_OPEN_INVALID,
  maxOpenSentence,
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

  it("uses the API's expires_at when it is present", () => {
    const now = new Date("2026-11-28T10:00:00Z");
    expect(
      expiryText({
        expiresAt: "2026-11-28T15:30:00Z",
        hours: 24,
        now,
        startsAt: "2026-11-30T10:00:00Z",
      })
    ).toBe("Expires in 5 h");
    expect(
      expiryText({
        expiresAt: "2026-11-28T10:20:00Z",
        hours: null,
        now,
        startsAt: "2026-11-30T10:00:00Z",
      })
    ).toBe("Expires in 20 min");
  });
});

describe("maxOpenSentence", () => {
  it("says the limit in plain words, singular at 1", () => {
    expect(maxOpenSentence("1")).toContain(
      "A customer may hold 1 upcoming booking at once."
    );
    expect(maxOpenSentence("3")).toContain(
      "A customer may hold 3 upcoming bookings at once."
    );
  });

  it("says what the customer is told, so a business is not surprised", () => {
    const text = maxOpenSentence("3") ?? "";
    expect(text).toContain("link in their booking email");
    // The refusal is deliberately silent about the count and the limit.
    expect(text).toContain("never tells them the limit");
    expect(text).not.toContain("how many they hold");
  });

  it("is null for a value the API would refuse", () => {
    for (const text of ["", "0", "21", "two"]) {
      expect(maxOpenSentence(text)).toBeNull();
    }
  });
});
