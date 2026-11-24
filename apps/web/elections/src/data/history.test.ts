import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import features from "@/data/derived/features.json";
import geo from "@/data/derived/geo";
import referendum from "@/data/derived/referendum";
import register from "@/data/derived/register";
import results from "@/data/derived/results";
import validation from "@/data/derived/validation.json";

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, canonical(item)])
    );
  return value;
}

// Fingerprints captured before splitting the checked archive. Update only for an
// intentional, independently reviewed correction—not to make a failed migration pass.
// Register/validation updated for the dated October 2026 public PEO import.
// Validation updated again for the 2026 provisional results (two new reconciliation checks).
const ORIGINAL = {
  results: "503d022d781c539302a30e904ea52f92490eeb494870f60b67225dd84afb8f10",
  referendum:
    "c7d88e06a34afcfee7e8879e1d3fec7412decee9561af5b3fa1d435d4b64798c",
  geo: "2b7687813fa0a3194419ed3bd3e7b23c2628e595089b8c7a7b0bb32a501baa3f",
  register: "ba896207bed4ad5352aba77039a2d227925635a90de7fb1ac03451d8848e7329",
  features: "3fd034dc93d77157734e0b2fb167edb1d21759d9457220199cba4dbe960ff0e4",
  validation:
    "09d5bb837dee933e93ca0c28f4042212255f23b6147226f5023da84d715cd4de",
};
/**
 * The 2026 provisional results are added to the archive; the fingerprints of
 * the results and features prove every earlier record is unchanged by
 * leaving 2026 out of the comparison.
 */
function dropYear(value: unknown): unknown {
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).filter(
      ([key]) => key !== "2026"
    )
  );
}
function without2026(value: typeof results): typeof results {
  return {
    ...value,
    results: dropYear(value.results),
    national: dropYear(value.national),
    stations: dropYear(value.stations),
  } as typeof results;
}
const archive = {
  results: without2026(results),
  referendum,
  geo,
  register,
  features: dropYear(features),
  validation,
};

describe("historical archive", () => {
  it.each(Object.keys(ORIGINAL) as (keyof typeof ORIGINAL)[])(
    "preserves every original %s record and source marker",
    (name) => {
      const actual = createHash("sha256")
        .update(JSON.stringify(canonical(archive[name])))
        .digest("hex");
      expect(actual).toBe(ORIGINAL[name]);
    }
  );
  it("keeps all generated imports, reports and CSV downloads current", () => {
    expect(
      execFileSync(process.execPath, ["scripts/history/check.mjs"], {
        encoding: "utf8",
      })
    ).toContain("in sync");
  });
});
