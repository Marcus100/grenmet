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
_NUMBER = r"\d+(?:\.\d+)?"
# One wind statement: a direction ("E", "E to SE") or the word "winds" before a
# speed. "and E 10 to 15 kt in the Atlc" (a second area) counts as its own statement.
_WIND = re.compile(
    rf"\b(?:({DIRECTION})(?:\s+(?:to|through)\s+({DIRECTION}))?\s+(?:winds?\s+)?"
    rf"|winds?\s+)(?:({_NUMBER})\s+to\s+({_NUMBER})|({_NUMBER}))\s*(?:kt|knots)\b",
    re.IGNORECASE,
)
_VARIABLE_WIND = re.compile(
    rf"\bvariable(?:\s+winds?)?(?:\s+(?:less\s+than|at)\s+({_NUMBER})\s*(?:kt|knots)\b)?",
    re.IGNORECASE,
)
_GUST = re.compile(
    rf"\bgusts?\s+(?:up\s+)?(?:to\s+)?({_NUMBER})\s*(?:kt|knots)\b", re.IGNORECASE
)
_SEAS = re.compile(
    rf"\bseas?\s+(?:({_NUMBER})\s+to\s+({_NUMBER})|to\s+({_NUMBER})|({_NUMBER}))"
    r"\s*(?:ft|feet)\b(\s+or\s+less)?",
    re.IGNORECASE,
)
# Every height in feet; a second one ("and 4 to 6 ft") is a second sea statement.
_FEET = re.compile(
    rf"\b(?:{_NUMBER}\s+to\s+{_NUMBER}|to\s+{_NUMBER}|{_NUMBER})\s*(?:ft|feet)\b",
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
    """The period's one wind statement; two or more (areas or changes) leave it empty."""
    winds = list(_WIND.finditer(text))
    variables = list(_VARIABLE_WIND.finditer(text))
    if len(winds) + len(variables) != 1:
        return Wind()
    if variables:
        limit = variables[0][1]
        # "less than 5 kt" states only an upper limit; no lower bound is invented.
        return Wind(VARIABLE, None, None, float(limit) if limit else None)
    wind = winds[0]
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
    """The period's one sea statement; two heights (areas or changes) leave it empty."""
    match = _SEAS.search(text)
    if match is None or len(_FEET.findall(text)) != 1:
        return Seas()
    if match[1]:
        return Seas(float(match[1]), float(match[2]))
    if match[3]:
        return Seas(None, float(match[3]))
    height = float(match[4])
    # "3 ft or less" states only an upper limit; no lower bound is invented.
    return Seas(None, height) if match[5] else Seas(height, height)


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
