import type { RegisterObservationRead } from "@barrelsgd/api-client";
import { describe, expect, it } from "vitest";
import { iwxxmStatus } from "./eregister-iwxxm";

function row(iwxxm: unknown): RegisterObservationRead {
  return { iwxxm } as unknown as RegisterObservationRead;
}

describe("IWXXM status line", () => {
  it("is absent when the API stored no IWXXM record", () => {
    expect(iwxxmStatus(row(null))).toBeNull();
    expect(iwxxmStatus(row(undefined))).toBeNull();
  });

  it("says a valid record was built, and that business rules are not checked yet", () => {
    expect(
      iwxxmStatus(
        row({
          version: "2025-2",
          valid: true,
          errors: [],
          schematron: "not_run",
        })
      )
    ).toEqual({
      ok: true,
      text: "IWXXM 2025-2 METAR built; schema valid (WMO business rules not checked yet).",
    });
  });

  it("says validity is unknown when the server has no schemas (valid null)", () => {
    expect(
      iwxxmStatus(
        row({
          version: "2025-2",
          valid: null,
          errors: [],
          note: "schemas missing",
        })
      )
    ).toEqual({
      ok: true,
      text: "IWXXM 2025-2 METAR built; schema check not run on this server.",
    });
  });

  it("keeps a long schema message short", () => {
    const text =
      iwxxmStatus(row({ valid: false, errors: ["x".repeat(500)] }))?.text ?? "";
    expect(text.length).toBeLessThan(160);
    expect(text.endsWith("…")).toBe(true);
  });

  it("names the first problems of an invalid record", () => {
    expect(
      iwxxmStatus(
        row({
          version: "2025-2",
          valid: false,
          errors: ["missing visibility", "bad wind", "bad cloud"],
        })
      )
    ).toEqual({
      ok: false,
      text: "IWXXM 2025-2 METAR not valid: missing visibility; bad wind (+1 more)",
    });
    expect(iwxxmStatus(row({ valid: false, errors: [] }))?.text).toBe(
      "IWXXM METAR not valid."
    );
  });
});
