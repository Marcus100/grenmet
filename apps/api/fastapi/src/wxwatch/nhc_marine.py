"""Read one zone block of an NHC Offshore Waters Forecast into structured periods.

Pure text parsing of archived NHC text (public domain). Wording that is not
recognised leaves a field empty; nothing is inferred or invented. Speeds stay
in knots and seas in feet, as NHC states them. Conversion to GMS storage units
happens in the editor.
"""

import re
from typing import NamedTuple

from .nhc_schemas import NhcMarinePeriod

DIRECTION = r"(?:NNE|ENE|ESE|SSE|SSW|WSW|WNW|NNW|NE|SE|SW|NW|N|E|S|W)"
VARIABLE = "Variable"
# "AMZ058-100800-" or grouped "AMZ056-058-100800-": every listed zone shares one block.
_HEADER = re.compile(
    r"^((?:[A-Z]{3}\d{3}(?:>\d{3})?-|\d{3}(?:>\d{3})?-)+)\d{6}-[ \t]*$", re.MULTILINE
)
_CODE = re.compile(r"([A-Z]{3})?(\d{3})(?:>(\d{3}))?-")
_TERMINATOR = re.compile(r"^\$\$[ \t]*$", re.MULTILINE)
_PERIOD = re.compile(r"^\.([A-Z][A-Z0-9 ]*?)\.{3}", re.MULTILINE)
_WIND = re.compile(
    rf"\b(?:({DIRECTION})(?:\s+(?:to|through)\s+({DIRECTION}))?\s+)?winds?\s+"
    r"(?:(\d+)\s+to\s+(\d+)|(\d+))\s*(?:kt|knots)\b",
    re.IGNORECASE,
)
_VARIABLE_WIND = re.compile(
    r"\bvariable(?:\s+winds?)?(?:\s+(?:less\s+than|at)\s+(\d+)\s*(?:kt|knots)\b)?",
    re.IGNORECASE,
)
_GUST = re.compile(
    r"\bgusts?\s+(?:up\s+)?(?:to\s+)?(\d+)\s*(?:kt|knots)\b", re.IGNORECASE
)
_SEAS = re.compile(
    r"\bseas?\s+(?:(\d+)\s+to\s+(\d+)|(\d+))\s*(?:ft|feet)\b(\s+or\s+less)?",
    re.IGNORECASE,
)
_WEATHER = re.compile(
    r"\b(?:(?:isolated|scattered|numerous|widely scattered|widespread)\s+)?"
    r"(?:showers|tstms|thunderstorms|rain|squalls|fog|haze)\b",
    re.IGNORECASE,
)


def zone_ids(codes: str) -> list[str]:
    """Expand a header such as "AMZ056-058-" or "AMZ050>052-" into zone identifiers."""
    result: list[str] = []
    prefix = ""
    for match in _CODE.finditer(codes):
        prefix = match[1] or prefix
        first = int(match[2])
        last = int(match[3] or match[2])
        result.extend(f"{prefix}{number:03d}" for number in range(first, last + 1))
    return result


def zone_block(text: str, zone_id: str) -> str | None:
    """Body of the first zone block that lists ``zone_id``, up to its ``$$``."""
    headers = list(_HEADER.finditer(text))
    for index, header in enumerate(headers):
        if zone_id not in zone_ids(header[1]):
            continue
        end = headers[index + 1].start() if index + 1 < len(headers) else len(text)
        return _TERMINATOR.split(text[header.end() : end], maxsplit=1)[0]
    return None


def zone_name(block: str) -> str | None:
    """The zone title: lines up to the one ending in "-" (NHC's name terminator)."""
    parts: list[str] = []
    for line in block.strip().splitlines()[:3]:
        stripped = line.strip()
        if stripped.startswith("."):
            break
        parts.append(stripped)
        if stripped.endswith("-"):
            return " ".join(parts)[:-1].strip() or None
    return None


class Wind(NamedTuple):
    direction_from: str | None = None
    direction_to: str | None = None
    min_kt: float | None = None
    max_kt: float | None = None


def _wind(text: str) -> Wind:
    wind = _WIND.search(text)
    variable = _VARIABLE_WIND.search(text)
    # The first wind statement in the period wins (the first named area).
    if variable and (wind is None or variable.start() < wind.start()):
        if variable[1]:
            return Wind(VARIABLE, None, 0.0, float(variable[1]))
        return Wind(VARIABLE)
    if wind is None:
        return Wind()
    start = wind[1].upper() if wind[1] else None
    end = wind[2].upper() if wind[2] else None
    if wind[3]:
        low, high = float(wind[3]), float(wind[4])
    else:
        low = high = float(wind[5])
    return Wind(start, end if end != start else None, low, high)


class Seas(NamedTuple):
    min_ft: float | None = None
    max_ft: float | None = None


def _seas(text: str) -> Seas:
    match = _SEAS.search(text)
    if match is None:
        return Seas()
    if match[1]:
        return Seas(float(match[1]), float(match[2]))
    if match[4]:
        return Seas(0.0, float(match[3]))
    return Seas(float(match[3]), float(match[3]))


def _weather(text: str) -> list[str]:
    words: list[str] = []
    for match in _WEATHER.finditer(text):
        phrase = " ".join(match[0].lower().split())
        if phrase not in words:
            words.append(phrase)
    return words


def _period(label: str, raw: str) -> NhcMarinePeriod:
    text = " ".join(raw.split())
    gust = _GUST.search(text)
    wind = _wind(text)
    seas = _seas(text)
    return NhcMarinePeriod(
        label=label.strip(),
        text=text,
        wind_direction_from=wind.direction_from,
        wind_direction_to=wind.direction_to,
        wind_min_kt=wind.min_kt,
        wind_max_kt=wind.max_kt,
        gust_kt=float(gust[1]) if gust else None,
        sea_min_ft=seas.min_ft,
        sea_max_ft=seas.max_ft,
        weather=_weather(text),
    )


def parse_periods(block: str) -> list[NhcMarinePeriod]:
    """Periods from a zone block: ``.LABEL...text`` runs until the next label."""
    matches = list(_PERIOD.finditer(block))
    periods = []
    for index, match in enumerate(matches):
        end = matches[index + 1].start() if index + 1 < len(matches) else len(block)
        periods.append(_period(match[1], block[match.end() : end]))
    return periods
