"""Impact-based forecasting risk matrix (WMO-No. 1150, figure 2).

The colour of a warning is read from a grid of likelihood against impact. This
module holds the standard grid and the pure functions that read and check one;
it imports nothing from the rest of the application, so PDF rendering, CAP
drafting and the hazard library share one definition.

GMS may adopt a different grid for a hazard (``CapProfileMatrix`` in
``profile_schemas.py``); every grid must pass ``matrix_errors``.
"""

from collections.abc import Sequence

LIKELIHOODS = ("Very low", "Low", "Medium", "High")
IMPACTS = ("Minimal", "Minor", "Significant", "Severe")
# Ascending: a colour later in this tuple is the more serious warning.
COLOURS = ("green", "yellow", "orange", "red")

# The probability each likelihood stands for in WMO's worked example. A guide
# for forecasters, not a rule the software enforces.
LIKELIHOOD_PERCENT = {"Very low": 10, "Low": 30, "Medium": 60, "High": 80}

# What each colour asks of the public (WMO-No. 1150).
COLOUR_MEANING = {
    "green": "Business as usual",
    "yellow": "Be aware",
    "orange": "Be prepared",
    "red": "Take action",
}

# Rows run from "Very low" to "High" likelihood, columns from "Minimal" to
# "Severe" impact.
WMO_MATRIX: tuple[tuple[str, ...], ...] = (
    ("green", "green", "yellow", "yellow"),
    ("green", "green", "yellow", "orange"),
    ("green", "yellow", "orange", "orange"),
    ("green", "yellow", "orange", "red"),
)


def colour_for(
    likelihood: str, impact: str, matrix: Sequence[Sequence[str]] | None = None
) -> str:
    """The colour in the cell for this likelihood and impact."""
    if likelihood not in LIKELIHOODS:
        raise ValueError(f"Unknown likelihood: {likelihood!r}")
    if impact not in IMPACTS:
        raise ValueError(f"Unknown impact: {impact!r}")
    grid = WMO_MATRIX if matrix is None else matrix
    return grid[LIKELIHOODS.index(likelihood)][IMPACTS.index(impact)]


def matrix_errors(matrix: Sequence[Sequence[str]]) -> list[str]:
    """Why a grid cannot be used: wrong shape, unknown colour, or a colour that
    gets milder as likelihood or impact rises."""
    if len(matrix) != len(LIKELIHOODS) or any(
        len(row) != len(IMPACTS) for row in matrix
    ):
        return [
            f"The matrix needs {len(LIKELIHOODS)} rows (likelihood) of "
            f"{len(IMPACTS)} cells (impact)."
        ]
    errors = []
    for row_index, row in enumerate(matrix):
        for column_index, colour in enumerate(row):
            if colour not in COLOURS:
                errors.append(
                    f"{LIKELIHOODS[row_index]} likelihood, {IMPACTS[column_index]} "
                    f"impact: {colour!r} is not one of {', '.join(COLOURS)}."
                )
    if errors:
        return errors
    rank = COLOURS.index
    for row_index, row in enumerate(matrix):
        for column_index, colour in enumerate(row):
            if column_index + 1 < len(row) and rank(colour) > rank(
                row[column_index + 1]
            ):
                errors.append(
                    f"{LIKELIHOODS[row_index]} likelihood: the colour must not get "
                    f"milder from {IMPACTS[column_index]} to {IMPACTS[column_index + 1]} impact."
                )
            if row_index + 1 < len(matrix) and rank(colour) > rank(
                matrix[row_index + 1][column_index]
            ):
                errors.append(
                    f"{IMPACTS[column_index]} impact: the colour must not get milder "
                    f"from {LIKELIHOODS[row_index]} to {LIKELIHOODS[row_index + 1]} likelihood."
                )
    return errors
