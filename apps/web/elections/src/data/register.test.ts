import { describe, expect, it } from "vitest";
import registerJson from "@/data/derived/register";
import {
  addendumTotals,
  divisionGrowth,
  type RegisterFile,
  rollChecks,
  snapshotTotals,
} from "@/data/register";

const register = registerJson as unknown as RegisterFile;

describe("voter register", () => {
  it("counts every dated list without discarding other source sex codes", () => {
    const lists = snapshotTotals(register);
    expect(lists).toHaveLength(16);
    expect(lists[0]?.date).toBe("2019-12-31");
    for (const l of lists)
      expect(l.male + l.female).toBeLessThanOrEqual(l.electors);
  });

  it("computes an arithmetic residual without establishing removals", () => {
    for (const c of rollChecks(register))
      expect(c.implied).toBe(c.previous + c.added - c.next);
  });

  it("retains the October non-police snapshot and its one U record", () => {
    expect(snapshotTotals(register).at(-1)).toMatchObject({
      date: "2026-10-16",
      electors: 95_908,
      female: 49_497,
      male: 46_410,
    });
    expect(divisionGrowth(register)).toHaveLength(134);
    expect(registerJson.snapshots.at(-1)).toMatchObject({
      scope: "NON-POLICE",
      audit: {
        records: 95_908,
        pages: 2640,
        sexCodes: { F: 49_497, M: 46_410, U: 1 },
      },
    });
  });

  it("keeps overlapping addenda as dated entries rather than net growth", () => {
    expect(addendumTotals(register).slice(-2)).toMatchObject([
      { date: "2026-09-30", added: 3477 },
      { date: "2026-10-16", added: 1026 },
    ]);
    expect(registerJson.addenda.at(-1)).toMatchObject({
      referenceDate: "2026-10-01",
    });
  });

  it("tracks every division on the latest list", () => {
    expect(divisionGrowth(register).length).toBeGreaterThan(120);
  });
});

describe("register schema", () => {
  it("reads published tuples as total, female, male", () => {
    const [list] = snapshotTotals({
      ...register,
      snapshots: [
        { date: "2019-12-31", file: "fixture", div: { A01: [357, 166, 191] } },
      ],
    });
    expect(list).toMatchObject({ electors: 357, female: 166, male: 191 });
  });
  it("preserves the historical reconciliation for the first two lists", () => {
    expect(rollChecks(register)[0]).toEqual({
      from: "2019-12-31",
      to: "2020-06-30",
      previous: 80_683,
      next: 81_072,
      added: 7663,
      implied: 7274,
    });
  });
});
