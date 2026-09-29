import { describe, expect, it } from "vitest";
import { nextIssueSlot } from "./issue-slots";

describe("nextIssueSlot", () => {
  it.each([
    ["2026-09-29T10:59:00Z", "2026-09-29T11:00:00.000Z"], // 06:59 AST → 07:00
    ["2026-09-29T11:00:00Z", "2026-09-29T16:00:00.000Z"], // 07:00 → 12:00
    ["2026-09-29T20:30:00Z", "2026-09-29T22:00:00.000Z"], // 16:30 → 18:00
    ["2026-09-30T02:00:00Z", "2026-09-30T11:00:00.000Z"], // 22:00 AST → 07:00 next day
    ["2026-12-31T23:30:00Z", "2027-01-01T11:00:00.000Z"], // year end
  ])("after %s is %s", (now, expected) => {
    expect(nextIssueSlot(new Date(now)).toISOString()).toBe(expected);
  });
});
