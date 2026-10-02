import { describe, expect, it } from "vitest";
import {
  backtest,
  leanTable,
  modelInputs,
  nationalShare,
  rate,
  seatChances,
  simulateThreeWay,
  spreads,
} from "@/data/outlook";
import campaignJson from "@/data/source/campaign.json";
import resultsJson from "@/data/source/results.json";
import type { CampaignFile, ResultsFile } from "@/data/types";

const results = resultsJson as unknown as ResultsFile;
const campaign = campaignJson as unknown as CampaignFile;
const dpb = campaign.polls.find((p) => p.id === "dpb26") as unknown as {
  bases: { NDC: [number, number]; NNP: [number, number] };
};

// Reference values from running the prototype's own model code on the same
// data, so the port can't drift from what was published.
describe("outlook model matches the prototype", () => {
  const sp = spreads(results, null);
  const lean = leanTable(results, "2022");
  const inputs = modelInputs(results, dpb.bases);

  it("measures national swing and local deviation", () => {
    expect(sp.sN).toBeCloseTo(0.129_000_434, 8);
    expect(sp.sL).toBeCloseTo(0.040_603_766, 8);
    expect(sp.sLall).toBeCloseTo(0.070_289_272, 8);
    expect(sp.df).toBe(6);
    expect(nationalShare(results, "2022")).toBeCloseTo(0.520_466_287, 8);
  });

  it("computes the Lean Index and the defaults", () => {
    expect(lean.E).toBeCloseTo(-0.023_466_121, 8);
    expect(lean.G).toBeCloseTo(-0.067_530_484, 8);
    expect(inputs.defaults).toEqual({
      national: nationalShare(results, "2022"),
      dpm: 0.05,
      fromNnp: 0.6,
      personal: 0.12,
    });
  });

  it("reproduces the seeded simulation exactly", () => {
    const sim = simulateThreeWay(
      inputs.defaults.national,
      sp.sN,
      sp.sL,
      lean,
      {
        seats: campaign.candidates.DPM ?? {},
        share: 0.05,
        fromNnp: 0.6,
        personal: { G: 0.12 },
      },
      10_000,
      7,
      sp.df
    );
    expect([sim.ndcMajority, sim.nnpMajority, sim.hung]).toEqual([
      5651, 4348, 1,
    ]);
    expect(sim.hist).toEqual([
      1829, 545, 404, 354, 328, 286, 313, 290, 290, 380, 421, 454, 649, 1099,
      1695, 663,
    ]);
  });

  it("reproduces the backtest", () => {
    const { rows } = backtest(results);
    expect(
      rows.map((r) => [r.from, r.to, r.lo, r.hi, r.actual, r.right])
    ).toEqual([
      ["1990", "1995", 8, 14, 5, 11],
      ["1995", "1999", 1, 13, 0, 13],
      ["1999", "2003", 0, 9, 7, 8],
      ["2003", "2008", 1, 14, 11, 12],
      ["2008", "2013", 0, 14, 0, 13],
      ["2013", "2018", 0, 14, 0, 15],
      ["2018", "2022", 0, 13, 9, 13],
    ]);
  });

  it("rates seats from their chances", () => {
    const chances = seatChances(
      lean,
      sp.sL,
      inputs.defaults,
      campaign.candidates.DPM ?? {}
    );
    expect(chances.E.NDC).toBeCloseTo(0.519_644_398, 8);
    expect(chances.G.NDC).toBeCloseTo(0.670_656_881, 8);
    expect(rate({ NDC: 0.97, NNP: 0.03, DPM: 0 })).toBe("Safe NDC");
    expect(rate({ NDC: 0.3, NNP: 0.7, DPM: 0 })).toBe("Lean NNP");
    expect(rate({ NDC: 0.55, NNP: 0.45, DPM: 0 })).toBe("Toss-up");
  });
});
