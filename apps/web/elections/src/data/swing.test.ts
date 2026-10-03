import { describe, expect, it } from "vitest";
import resultsJson from "@/data/derived/results";
import { CODES } from "@/data/model";
import {
  gallagher,
  governmentAt,
  resultQuality,
  seatsAt,
  swingSeat,
  swingToFlip,
  tippingPoint,
  winnerAt,
} from "@/data/swing";
import type { ResultsFile } from "@/data/types";

const results = resultsJson as unknown as ResultsFile;
const seats2022 = CODES.flatMap((c) => {
  const r = results.results["2022"]?.[c];
  return r ? [swingSeat(c, r.c)] : [];
});

describe("uniform swing", () => {
  it("reproduces the actual result at zero swing", () => {
    expect(seatsAt(seats2022, 0)).toEqual({ NDC: 9, NNP: 6 });
    expect(governmentAt(seats2022, 0)).toBe("NDC");
  });

  it("flips a seat exactly past its swing-to-flip", () => {
    const a = seats2022.find((s) => s.code === "A");
    if (!a) throw new Error("no A");
    const flip = swingToFlip(a);
    expect(flip).toBeLessThan(0);
    expect(winnerAt(a, flip + 0.05)).toBe("NDC");
    expect(winnerAt(a, flip - 0.05)).toBe("NNP");
  });

  it("finds the smallest swing that changes the government", () => {
    const tp = tippingPoint(seats2022);
    expect(tp?.from).toBe("NDC");
    expect(tp?.s).toBeLessThan(0);
    expect(governmentAt(seats2022, (tp?.s ?? 0) + 0.1)).toBe("NDC");
  });
});

describe("gallagher and quality", () => {
  it("is zero when seats match votes and large for a sweep", () => {
    expect(gallagher({ A: 50, B: 50 }, { A: 5, B: 5 }, 10)).toBe(0);
    expect(gallagher({ A: 60, B: 40 }, { A: 15 }, 15)).toBeCloseTo(40, 6);
  });

  it("grades a contest by its weakest figures", () => {
    expect(
      resultQuality([
        ["a", "X", 1, "official"],
        ["b", "Y", 1],
      ])
    ).toBe("official");
    expect(
      resultQuality([
        ["a", "X", 1, "official"],
        ["b", "Y", 1, "unverified"],
      ])
    ).toBe("partly");
    expect(
      resultQuality([
        ["a", "X", 1, "corroborated"],
        ["b", "Y", 1, "check"],
      ])
    ).toBe("conflict");
  });
});
