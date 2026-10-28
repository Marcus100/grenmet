import { describe, expect, it } from "vitest";
import { constituencyGrowth, type RegisterFile } from "./register";

describe("constituency register change", () => {
  it("retains removed divisions and weights change by electors, not division percentages", () => {
    const file: RegisterFile = {
      addenda: [],
      note: "fixture",
      topOccupations: [],
      snapshots: [
        {
          date: "2026-06-30",
          file: "last",
          div: { A01: [150, 80, 70], A03: [450, 250, 200] },
        },
        {
          date: "2025-12-31",
          file: "first",
          div: { A01: [100, 50, 50], A02: [900, 450, 450] },
        },
      ],
    };
    expect(constituencyGrowth(file).find((r) => r.code === "A")).toEqual({
      code: "A",
      divisions: 2,
      first: 1000,
      last: 600,
      change: -0.4,
    });
  });
});
