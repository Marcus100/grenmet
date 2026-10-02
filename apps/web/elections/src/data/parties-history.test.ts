import { describe, expect, it } from "vitest";
import referendumJson from "@/data/derived/referendum";
import resultsJson from "@/data/derived/results";
import type { Data, ReferendumFile } from "@/data/events";
import { partyRecords } from "@/data/parties-history";
import type { ResultsFile } from "@/data/types";

const data: Data = {
  results: resultsJson as unknown as ResultsFile,
  referendum: referendumJson as unknown as ReferendumFile,
};
const records = partyRecords(data);

describe("party records", () => {
  it("matches the PEO 2022 totals for the two main parties", () => {
    const ndc = records
      .find((r) => r.code === "NDC")
      ?.years.find((y) => y.year === 2022);
    const nnp = records
      .find((r) => r.code === "NNP")
      ?.years.find((y) => y.year === 2022);
    expect(ndc).toMatchObject({ votes: 31_432, seats: 9, candidates: 15 });
    expect(nnp).toMatchObject({ votes: 28_960, seats: 6, candidates: 15 });
  });

  it("records the NNP’s clean sweeps", () => {
    const nnp = records.find((r) => r.code === "NNP");
    expect(nnp?.years.filter((y) => y.seats === 15).map((y) => y.year)).toEqual(
      [1999, 2013, 2018]
    );
  });
});
