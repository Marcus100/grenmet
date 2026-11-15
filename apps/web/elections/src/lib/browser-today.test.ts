import { describe, expect, it } from "vitest";
import { grenadaDate } from "@/data/election-2026";
import { grenadaNoon, msUntilNextGrenadaDay } from "@/lib/browser-today";

const SECOND = 1000;

describe("grenadaNoon", () => {
  it("is a moment on the same Grenada calendar day", () => {
    expect(grenadaDate(grenadaNoon("2026-11-05"))).toBe("2026-11-05");
    expect(grenadaDate(grenadaNoon("2026-01-01"))).toBe("2026-01-01");
  });
});

describe("msUntilNextGrenadaDay", () => {
  it("counts to 00:00 in Grenada (04:00 UTC), plus a one-second margin", () => {
    // 03:59:59 UTC is 23:59:59 on 4 November in Grenada: one second to go.
    expect(msUntilNextGrenadaDay(Date.parse("2026-11-05T03:59:59Z"))).toBe(
      2 * SECOND
    );
  });

  it("is about a day just after Grenada midnight", () => {
    const delay = msUntilNextGrenadaDay(Date.parse("2026-11-05T04:00:01Z"));
    expect(delay).toBe(24 * 3600 * SECOND);
  });

  it("never returns zero or a negative delay", () => {
    for (const iso of [
      "2026-11-05T00:00:00Z",
      "2026-11-05T03:00:00Z",
      "2026-11-05T04:00:00Z",
      "2026-11-05T23:59:59Z",
    ]) {
      expect(msUntilNextGrenadaDay(Date.parse(iso))).toBeGreaterThan(0);
    }
  });
});
