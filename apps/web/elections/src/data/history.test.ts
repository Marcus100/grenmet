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
const ORIGINAL = {
  results: "503d022d781c539302a30e904ea52f92490eeb494870f60b67225dd84afb8f10",
  referendum:
    "c7d88e06a34afcfee7e8879e1d3fec7412decee9561af5b3fa1d435d4b64798c",
  geo: "2b7687813fa0a3194419ed3bd3e7b23c2628e595089b8c7a7b0bb32a501baa3f",
  register: "1ddf7bd9baa68e2dd1f0fbdd085ef4f06bd3e198c51c00275e77186e951353f0",
  features: "3fd034dc93d77157734e0b2fb167edb1d21759d9457220199cba4dbe960ff0e4",
  validation:
    "2a5030dae8211414cb85f1aae80fa21860bc2eb568bb19b2ffa6d119b99f8295",
};
const archive = { results, referendum, geo, register, features, validation };

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
