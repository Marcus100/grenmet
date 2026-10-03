import { describe, expect, it } from "vitest";
import {
  encode,
  hexToRgb,
  mix,
  modeLegend,
  type Palette,
} from "@/data/atlas-encode";

const p: Palette = {
  land: [0.8, 0.8, 0.8],
  "div-mid": [0.5, 0.5, 0.5],
  ndc: [1, 0.6, 0],
  "ndc-tint": [1, 0.9, 0.7],
  nnp: [0, 0.5, 0.3],
  "nnp-tint": [0.8, 0.9, 0.85],
  "seq-0": [0.9, 0.9, 1],
  "seq-1": [0.1, 0.2, 0.5],
};
const contest = {
  c: [
    ["A", "NDC", 600],
    ["B", "NNP", 400],
  ] as [string, string, number][],
  cast: 1010,
  reg: 1500,
};

describe("atlas encodings", () => {
  it("parses token hex values", () => {
    expect(hexToRgb("#ff0000")).toEqual([1, 0, 0]);
    expect(mix([0, 0, 0], [1, 1, 1], 0.5)).toEqual([0.5, 0.5, 0.5]);
  });

  it("colours the winner and scales height by votes", () => {
    const e = encode(p, contest, null, "winner", false, "cons");
    expect(e.rgb).toEqual(p.ndc);
    expect(e.height).toBeCloseTo(0.25 + 2.4 * (1000 / 7500), 6);
  });

  it("shades share and swing toward the party ahead", () => {
    const share = encode(p, contest, null, "share", false, "cons").rgb;
    const expected = mix(p["div-mid"] ?? [0, 0, 0], p.ndc ?? [0, 0, 0], 0.4);
    for (const [i, v] of share.entries())
      expect(v).toBeCloseTo(expected[i] ?? 0, 9);
    const before = {
      c: [
        ["A", "NDC", 500],
        ["B", "NNP", 500],
      ] as [string, string, number][],
      cast: 1000,
      reg: 1500,
    };
    const swing = encode(p, contest, before, "swing", false, "cons");
    expect(swing.height).toBeCloseTo(0.25 + 12 * 0.1, 6);
  });

  it("falls back to land when there is no result", () => {
    expect(encode(p, null, null, "winner", false, "cons")).toEqual({
      rgb: p.land,
      height: 0.08,
    });
  });

  it("labels each mode’s legend", () => {
    expect(modeLegend("swing", false, "2018").title).toBe("Swing since 2018");
    expect(modeLegend("share", true, null).title).toBe("Yes vs No");
  });
});
