import { describe, expect, it } from "vitest";
import { CODES } from "@/data/model";
import {
  decodeMap,
  encodeMap,
  ratingFromChances,
  ratingsFor,
  tally,
  type UserRating,
} from "@/data/ratings";
import type { ConstituencyCode } from "@/data/types";

const all = (rating: UserRating) =>
  Object.fromEntries(CODES.map((c) => [c, rating])) as Record<
    ConstituencyCode,
    UserRating
  >;

describe("your prediction", () => {
  it("offers DPM ratings only where the DPM stands", () => {
    expect(ratingsFor(false)).toHaveLength(7);
    expect(ratingsFor(true)).toContain("Lean DPM");
    expect(ratingsFor(false)).not.toContain("Solid DPM");
  });

  it("counts seats Lean or better and finds a majority at eight", () => {
    const map = all("Toss-up");
    for (const c of ["A", "B", "C", "D", "E", "F", "G"] as const)
      map[c] = "Lean NDC";
    expect(tally(map).majority).toBeNull();
    map.H = "Solid NDC";
    const t = tally(map);
    expect(t.seats.NDC).toBe(8);
    expect(t.majority).toBe("NDC");
    expect(t.tossUps).toBe(7);
    expect(t.byRating["Lean NDC"]).toBe(7);
  });

  it("round-trips a shared map and rejects DPM where it doesn’t stand", () => {
    const map = all("Likely NNP");
    map.G = "Lean DPM";
    const dpm = new Set<ConstituencyCode>(["G"]);
    const text = encodeMap(CODES, map);
    expect(text).toHaveLength(15);
    expect(decodeMap(CODES, text, dpm)).toEqual(map);
    expect(decodeMap(CODES, text, new Set())).toBeNull();
    expect(decodeMap(CODES, "zz", dpm)).toBeNull();
  });

  it("maps model chances onto the scale", () => {
    expect(ratingFromChances({ NDC: 0.97, NNP: 0.03, DPM: 0 })).toBe(
      "Solid NDC"
    );
    expect(ratingFromChances({ NDC: 0.15, NNP: 0.85, DPM: 0 })).toBe(
      "Likely NNP"
    );
    expect(ratingFromChances({ NDC: 0.45, NNP: 0.5, DPM: 0.05 })).toBe(
      "Toss-up"
    );
  });
});
