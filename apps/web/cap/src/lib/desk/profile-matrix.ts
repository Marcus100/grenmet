import type {
  CapProfileCellTextPropertiesImpactEnum,
  CapProfileCellTextPropertiesLikelihoodEnum,
  CapProfileColourResponse,
  CapProfileImpactLevel,
  CapProfileMatrix,
  GmsColour,
} from "@barrelsgd/api-client";

/** Rows of the grid, from the lowest likelihood to the highest. */
export const PROFILE_LIKELIHOODS: CapProfileCellTextPropertiesLikelihoodEnum[] =
  ["Very low", "Low", "Medium", "High"];
/** Columns of the grid, from the mildest impact to the most severe. */
export const PROFILE_IMPACTS: CapProfileCellTextPropertiesImpactEnum[] = [
  "Minimal",
  "Minor",
  "Significant",
  "Severe",
];
export const PROFILE_COLOURS: GmsColour[] = [
  "green",
  "yellow",
  "orange",
  "red",
];

/** What each colour asks of the public (WMO-No. 1150), in plain words. */
export const PROFILE_COLOUR_MEANING: Record<GmsColour, string> = {
  green: "Business as usual",
  yellow: "Be aware",
  orange: "Be prepared",
  red: "Take action",
};

/**
 * The standard WMO grid, offered as a starting point only. Copied from
 * `WMO_MATRIX` in apps/api/fastapi/src/cap/ibf.py. The API validates every
 * saved grid, and GMS must review it before the version is approved.
 */
export function wmoStarterMatrix(): CapProfileMatrix {
  return {
    cells: [
      ["green", "green", "yellow", "yellow"],
      ["green", "green", "yellow", "orange"],
      ["green", "yellow", "orange", "orange"],
      ["green", "yellow", "orange", "red"],
    ],
  };
}

export function starterImpactLevels(): CapProfileImpactLevel[] {
  return PROFILE_IMPACTS.map((impact) => ({ impact, impacts: [] }));
}

export function starterColourResponses(): CapProfileColourResponse[] {
  return PROFILE_COLOURS.map((colour) => ({ colour, response: "" }));
}

/**
 * A grid never gets milder as likelihood or impact rises. Mirrors the rule
 * the API enforces, so the editor can explain a problem before saving.
 */
export function matrixProblems(cells: GmsColour[][]): string[] {
  const rank = (colour: GmsColour) => PROFILE_COLOURS.indexOf(colour);
  const problems: string[] = [];
  if (
    cells.length !== PROFILE_LIKELIHOODS.length ||
    cells.some((row) => row.length !== PROFILE_IMPACTS.length)
  ) {
    problems.push(
      `The grid needs ${PROFILE_LIKELIHOODS.length} rows of ${PROFILE_IMPACTS.length} colours.`
    );
  }
  cells.forEach((row, r) => {
    row.forEach((colour, c) => {
      const right = row[c + 1];
      const below = cells[r + 1]?.[c];
      if (right && rank(right) < rank(colour)) {
        problems.push(
          `${PROFILE_LIKELIHOODS[r]} likelihood: ${colour} at ${PROFILE_IMPACTS[c]} impact is stronger than ${right} at ${PROFILE_IMPACTS[c + 1]} impact.`
        );
      }
      if (below && rank(below) < rank(colour)) {
        problems.push(
          `${PROFILE_IMPACTS[c]} impact: ${colour} at ${PROFILE_LIKELIHOODS[r]} likelihood is stronger than ${below} at ${PROFILE_LIKELIHOODS[r + 1]} likelihood.`
        );
      }
    });
  });
  return problems;
}
