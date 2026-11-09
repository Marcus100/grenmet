import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  matrixProblems,
  PROFILE_COLOUR_MEANING,
  PROFILE_COLOURS,
  PROFILE_IMPACTS,
  PROFILE_LIKELIHOODS,
  wmoStarterMatrix,
} from "./profile-matrix";

// Walks up from this file to the FastAPI source (apps/web/cap/src/lib/desk).
function backendSource(): string {
  return readFileSync(
    resolve(import.meta.dirname, "../../../../../api/fastapi/src/cap/ibf.py"),
    "utf8"
  );
}

function quoted(text: string): string[] {
  return [...text.matchAll(/"([^"]+)"/gu)].map((m) => m[1] ?? "");
}

describe("starter grid matches the backend standard", () => {
  const source = backendSource();

  it("has the same grid", () => {
    const block = source.split("WMO_MATRIX")[1]?.split("\n)\n")[0] ?? "";
    const rows = block
      .split("\n")
      .filter((line) => line.trim().startsWith("("))
      .map((line) => quoted(line));
    expect(wmoStarterMatrix().cells).toEqual(rows);
  });

  it("has the same levels, colours and meanings", () => {
    const tuple = (name: string) =>
      quoted(source.split(`${name} = (`)[1]?.split(")")[0] ?? "");
    expect(PROFILE_LIKELIHOODS).toEqual(tuple("LIKELIHOODS"));
    expect(PROFILE_IMPACTS).toEqual(tuple("IMPACTS"));
    expect(PROFILE_COLOURS).toEqual(tuple("COLOURS"));
    const meanings = Object.fromEntries(
      [
        ...(
          source.split("COLOUR_MEANING = {")[1]?.split("}")[0] ?? ""
        ).matchAll(/"(\w+)": "([^"]+)"/gu),
      ].map((m) => [m[1], m[2]])
    );
    expect(PROFILE_COLOUR_MEANING).toEqual(meanings);
  });
});

describe("matrixProblems", () => {
  it("accepts the standard grid", () => {
    expect(matrixProblems(wmoStarterMatrix().cells)).toEqual([]);
  });

  it("flags a grid that is not four by four", () => {
    expect(matrixProblems([["green"]])).toHaveLength(1);
    const short = wmoStarterMatrix().cells.map((row) => row.slice(0, 3));
    expect(matrixProblems(short).join(" ")).toContain("4 rows of 4");
  });

  it("flags a colour that gets milder as impact rises", () => {
    const cells = wmoStarterMatrix().cells.map((row) => [...row]);
    cells[0] = ["red", "green", "yellow", "yellow"];
    const problems = matrixProblems(cells);
    expect(problems.join(" ")).toContain("Very low likelihood");
  });

  it("flags a colour that gets milder as likelihood rises", () => {
    const cells = wmoStarterMatrix().cells.map((row) => [...row]);
    cells[3] = ["green", "yellow", "orange", "green"];
    const problems = matrixProblems(cells);
    expect(problems.join(" ")).toContain("Severe impact");
  });
});
