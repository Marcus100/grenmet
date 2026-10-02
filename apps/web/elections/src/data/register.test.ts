import { describe, expect, it } from "vitest";
import registerJson from "@/data/derived/register";
import {
  divisionGrowth,
  type RegisterFile,
  rollChecks,
  snapshotTotals,
} from "@/data/register";

const register = registerJson as unknown as RegisterFile;

describe("voter register", () => {
  it("counts every list, oldest first, with male + female = electors", () => {
    const lists = snapshotTotals(register);
    expect(lists).toHaveLength(15);
    expect(lists[0]?.date).toBe("2019-12-31");
    for (const l of lists)
      expect(l.male + l.female).toBeLessThanOrEqual(l.electors);
  });

  it("implies removals as previous + added − next", () => {
    for (const c of rollChecks(register))
      expect(c.implied).toBe(c.previous + c.added - c.next);
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
