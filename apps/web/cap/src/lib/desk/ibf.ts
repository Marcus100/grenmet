import type { IbfMatrixPublic } from "@barrelsgd/api-client";
import { z } from "zod";

/** The same shape as a hazard profile key (cap/ibf_router.py Kind). */
export const KIND_PATTERN = /^[a-z][a-z0-9-]{1,39}$/;

export const LIKELIHOODS = ["Very low", "Low", "Medium", "High"] as const;
export const IMPACTS = ["Minimal", "Minor", "Significant", "Severe"] as const;

/** Input for the advice check. Validated again on the server before any call. */
export const suggestInputSchema = z.object({
  impact: z.enum(IMPACTS),
  kind: z.string().regex(KIND_PATTERN, "Choose a hazard."),
  likelihood: z.enum(LIKELIHOODS),
  subtype: z.string().trim().max(200).optional(),
});

export type SuggestInput = z.infer<typeof suggestInputSchema>;

const COLOUR_WORDS: Record<string, string> = {
  green: "Green",
  orange: "Orange",
  red: "Red",
  yellow: "Yellow",
};

/** Plain words for a colour; colour is never the only signal. */
export function colourWord(colour: string): string {
  return COLOUR_WORDS[colour] ?? colour;
}

export interface MatrixView {
  columns: { label: string; percent: number | null }[];
  /** One row per likelihood, from the lowest to the highest. */
  rows: {
    cells: { colour: string; word: string }[];
    label: string;
    percent: number | null;
  }[];
  /** Where the grid comes from, in words. */
  source: string;
}

/** The read-only grid a forecaster reads: likelihood down, impact across. */
export function matrixView(matrix: IbfMatrixPublic, kind: string): MatrixView {
  const source =
    matrix.library_key && matrix.library_version
      ? `Approved library grid for ${kind}, version ${matrix.library_version}.`
      : "Standard World Meteorological Organization grid (no approved grid of its own for this hazard).";
  return {
    columns: matrix.impacts.map((impact) => ({
      label: impact.label,
      percent: impact.percent ?? null,
    })),
    rows: matrix.likelihoods.map((likelihood, row) => ({
      cells: (matrix.cells[row] ?? []).map((colour) => ({
        colour,
        word: colourWord(colour),
      })),
      label: likelihood.label,
      percent: likelihood.percent ?? null,
    })),
    source,
  };
}
