"""The risk grid (ADR-0069 decision 4; ICAO Doc 9859, Safety Management Manual).

The default is the Doc 9859 example: likelihood 5 (frequent) to 1 (extremely
improbable) against severity A (catastrophic) to E (negligible), giving an index
such as ``4B``. ICAO leaves the tolerability table to each organisation, so an
organisation may relabel its levels and move cells between bands. What a band
means is fixed: ``acceptable`` needs nothing more, ``tolerable`` may be accepted
by the right level of management after mitigation, ``intolerable`` can never be
accepted.
"""

from dataclasses import dataclass
from typing import Any

from src.exceptions import AppValidationError

from .models import CaseRiskBand, CaseRiskGrid

DEFAULT_LIKELIHOODS: list[dict[str, Any]] = [
    {"value": 5, "label": "Frequent"},
    {"value": 4, "label": "Occasional"},
    {"value": 3, "label": "Remote"},
    {"value": 2, "label": "Improbable"},
    {"value": 1, "label": "Extremely improbable"},
]
DEFAULT_SEVERITIES: list[dict[str, Any]] = [
    {"code": "A", "label": "Catastrophic"},
    {"code": "B", "label": "Hazardous"},
    {"code": "C", "label": "Major"},
    {"code": "D", "label": "Minor"},
    {"code": "E", "label": "Negligible"},
]
_INTOLERABLE = {"5A", "5B", "5C", "4A", "4B", "3A"}
_ACCEPTABLE = {"3E", "2D", "2E", "1B", "1C", "1D", "1E"}


def _default_cells() -> dict[str, str]:
    cells: dict[str, str] = {}
    for likelihood in DEFAULT_LIKELIHOODS:
        for severity in DEFAULT_SEVERITIES:
            index = f"{likelihood['value']}{severity['code']}"
            if index in _INTOLERABLE:
                band = CaseRiskBand.INTOLERABLE
            elif index in _ACCEPTABLE:
                band = CaseRiskBand.ACCEPTABLE
            else:
                band = CaseRiskBand.TOLERABLE
            cells[index] = band.value
    return cells


@dataclass(frozen=True)
class Grid:
    likelihoods: list[dict[str, Any]]
    severities: list[dict[str, Any]]
    cells: dict[str, str]
    custom: bool

    def rate(self, likelihood: int, severity: str) -> tuple[str, str, CaseRiskBand]:
        """``(likelihood label, severity label, band)`` for one cell; 422 if the
        grid has no such level."""
        l_label = next(
            (str(x["label"]) for x in self.likelihoods if x["value"] == likelihood),
            None,
        )
        s_label = next(
            (str(x["label"]) for x in self.severities if x["code"] == severity), None
        )
        band = self.cells.get(f"{likelihood}{severity}")
        if l_label is None or s_label is None or band is None:
            raise AppValidationError("That likelihood or severity is not on the grid")
        return l_label, s_label, CaseRiskBand(band)


def default_grid() -> Grid:
    return Grid(
        likelihoods=[dict(x) for x in DEFAULT_LIKELIHOODS],
        severities=[dict(x) for x in DEFAULT_SEVERITIES],
        cells=_default_cells(),
        custom=False,
    )


def from_row(row: CaseRiskGrid | None) -> Grid:
    if row is None:
        return default_grid()
    return Grid(
        likelihoods=list(row.likelihoods),
        severities=list(row.severities),
        cells=dict(row.cells),
        custom=True,
    )


def validate(
    likelihoods: list[dict[str, Any]],
    severities: list[dict[str, Any]],
    cells: dict[str, str],
) -> None:
    """A usable grid: distinct levels each way and a band for every cell (the
    schema limits each way to 2 to 7 levels). Which cell falls in which band is
    the organisation's decision, as ICAO leaves it; nothing here forces bands to
    worsen with likelihood or severity."""
    values = [x["value"] for x in likelihoods]
    codes = [x["code"] for x in severities]
    if len(set(values)) != len(values) or len(set(codes)) != len(codes):
        raise AppValidationError(
            "Likelihood values and severity codes must be distinct"
        )
    expected = {f"{value}{code}" for value in values for code in codes}
    if set(cells) != expected:
        raise AppValidationError(
            "The grid needs exactly one band for every likelihood and severity"
        )
    bands = {band.value for band in CaseRiskBand}
    if not set(cells.values()) <= bands:
        raise AppValidationError("A band is acceptable, tolerable or intolerable")
