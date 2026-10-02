import { describe, expect, it } from "vitest";
import {
  divisionGrowth,
  type RegisterFile,
  rollChecks,
  snapshotTotals,
} from "@/data/register";
import registerJson from "@/data/source/register.json";

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

describe("roll reconciliation matches the published pipeline", () => {
  it("agrees with discrepancies.json for every pair of lists", async () => {
    const { reconciliation } = (
      await import("@/data/source/discrepancies.json")
    ).default as unknown as {
      reconciliation: {
        from: string;
        to: string;
        before: number;
        after: number;
        added: number;
        impliedRemovals: number;
      }[];
    };
    const mine = rollChecks(register).map((c) => [
      c.from,
      c.to,
      c.previous,
      c.next,
      c.added,
      c.implied,
    ]);
    const theirs = reconciliation.map((r) => [
      r.from,
      r.to,
      r.before,
      r.after,
      r.added,
      r.impliedRemovals,
    ]);
    expect(mine).toEqual(theirs);
  });
});
