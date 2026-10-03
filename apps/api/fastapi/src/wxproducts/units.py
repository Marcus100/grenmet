"""Meteorological units and WMO code tables for forecast parameters.

Stored values follow WMO reporting units: wind in knots (SYNOP permits knots or
m/s; knots are the regional operational norm), heights in metres and periods in
seconds. Public display units are a presentation choice and live here too.

Sources:
- WMO-No. 306, Manual on Codes, code table 3700 (state of the sea).
- WMO-No. 306, BUFR Table B: 0 11 001 wind direction (degree true), 0 11 002
  wind speed and 0 11 041 maximum wind gust speed (both m/s). Knots convert
  exactly (`convert_wind(..., "m/s")`) when data is encoded for exchange.
"""

from typing import Literal

WindUnit = Literal["kt", "mph", "km/h", "m/s"]

# Exact factors: 1 kt = 1852 m/h; 1 mile = 1609.344 m; 1 ft = 0.3048 m.
KNOT_IN = {"kt": 1.0, "mph": 1852 / 1609.344, "km/h": 1.852, "m/s": 1852 / 3600}
METRES_PER_FOOT = 0.3048

PUBLIC_WIND_UNIT: WindUnit = "mph"

COMPASS_POINTS = (
    "N",
    "NNE",
    "NE",
    "ENE",
    "E",
    "ESE",
    "SE",
    "SSE",
    "S",
    "SSW",
    "SW",
    "WSW",
    "W",
    "WNW",
    "NW",
    "NNW",
)
VARIABLE = "Variable"
DIRECTIONS = (*COMPASS_POINTS, VARIABLE)

# WMO code table 3700: descriptive term -> (code, lower m, upper m or None).
SEA_STATES: dict[str, tuple[int, float, float | None]] = {
    "Calm (glassy)": (0, 0.0, 0.0),
    "Calm (rippled)": (1, 0.0, 0.1),
    "Smooth": (2, 0.1, 0.5),
    "Slight": (3, 0.5, 1.25),
    "Moderate": (4, 1.25, 2.5),
    "Rough": (5, 2.5, 4.0),
    "Very rough": (6, 4.0, 6.0),
    "High": (7, 6.0, 9.0),
    "Very high": (8, 9.0, 14.0),
    "Phenomenal": (9, 14.0, None),
}

TIDE_SLOTS = range(1, 5)

KM_PER_NAUTICAL_MILE = 1.852
# Marine visibility terms (as in shipping forecasts): upper bound in km.
VISIBILITY_TERMS = (
    (1.0, "very poor"),
    (2 * KM_PER_NAUTICAL_MILE, "poor"),
    (5 * KM_PER_NAUTICAL_MILE, "moderate"),
)


def convert_wind(knots: float, unit: WindUnit) -> float:
    return knots * KNOT_IN[unit]


def feet(metres: float) -> float:
    return metres / METRES_PER_FOOT


def degrees(point: str) -> float | None:
    """Centre bearing (degrees true) of a 16-point compass direction."""
    return COMPASS_POINTS.index(point) * 22.5 if point in COMPASS_POINTS else None


def _num(value: float) -> str:
    return f"{value:.1f}".rstrip("0").rstrip(".")


def _span(low: float | None, high: float | None, *, places: int = 0) -> str:
    def fmt(v: float) -> str:
        return str(round(v)) if places == 0 else _num(round(v, places))

    values = [v for v in (low, high) if v is not None]
    if not values:
        return ""
    if len(values) == 1 or fmt(values[0]) == fmt(values[-1]):
        return fmt(values[0])
    return f"{fmt(values[0])}–{fmt(values[-1])}"


def direction_text(start: str, end: str = "") -> str:
    if start and end and end != start:
        return f"{start} to {end}"
    return start or end


def wind_text(
    start: str,
    end: str,
    low: float | None,
    high: float | None,
    gust: float | None,
    unit: WindUnit = PUBLIC_WIND_UNIT,
) -> str:
    """e.g. "NE to E 12–23 mph (10–20 kt), gusts 35 mph (30 kt)"."""
    parts = [direction_text(start, end)]
    if low is not None or high is not None:
        speeds = _span(
            None if low is None else convert_wind(low, unit),
            None if high is None else convert_wind(high, unit),
        )
        if unit == "kt":
            parts.append(f"{_span(low, high)} kt")
        else:
            parts.append(f"{speeds} {unit} ({_span(low, high)} kt)")
    text = " ".join(p for p in parts if p)
    if gust is not None:
        gusts = (
            f"{round(gust)} kt"
            if unit == "kt"
            else f"{round(convert_wind(gust, unit))} {unit} ({round(gust)} kt)"
        )
        text = f"{text}, gusts {gusts}" if text else f"Gusts {gusts}"
    return text


def visibility_term(km: float) -> str:
    for limit, term in VISIBILITY_TERMS:
        if km < limit:
            return term
    return "good"


def visibility_text(low: float | None, high: float | None) -> str:
    """e.g. "5–10 km (2.7–5.4 nmi), moderate to good"."""
    values = [v for v in (low, high) if v is not None]
    if not values:
        return ""
    km = _span(low, high, places=1)
    nmi = _span(
        *(None if v is None else v / KM_PER_NAUTICAL_MILE for v in (low, high)),
        places=1,
    )
    terms = [visibility_term(values[0]), visibility_term(values[-1])]
    words = terms[0] if terms[0] == terms[-1] else f"{terms[0]} to {terms[-1]}"
    return f"{km} km ({nmi} nmi), {words}"


def height_text(low: float | None, high: float | None) -> str:
    """Metres first, feet in brackets: "1.8–2.7 m (6–9 ft)"."""
    metres = _span(low, high, places=1)
    if not metres:
        return ""
    return (
        f"{metres} m "
        f"({_span(None if low is None else feet(low), None if high is None else feet(high))} ft)"
    )


def sea_state_text(start: str, end: str = "") -> str:
    if start and end and end != start:
        return f"{start} to {end.lower()}"
    return start or end


def swell_text(direction: str, period: float | None, height: float | None) -> str:
    parts = [direction]
    if height is not None:
        parts.append(height_text(height, None))
    if period is not None:
        parts.append(f"every {_num(period)} s")
    return " ".join(p for p in parts if p)
