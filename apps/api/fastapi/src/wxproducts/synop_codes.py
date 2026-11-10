"""SYNOP links for forecast fields, for later verification against the eRegister.

Owner decision, 23 October 2026: forecast choices carry the SYNOP meaning of
the hourly observations at MBIA (78958), so a forecast can be checked against
what was observed. Mirrors `packages/gms/src/products.ts` (`CONDITION_OKTAS`,
`RAIN_CHANCE_BANDS`) and `packages/gms/src/weather-types.ts`
(`WEATHER_PHENOMENA`, `LEGACY_WEATHER_TYPES`); `tests/wxproducts/test_synop_codes.py`
keeps them equal.

- Conditions -> total cloud N in oktas (WMO code table 2700), METAR bands.
- Weather types -> present weather ww (WMO code table 4677) and METAR codes.
  Since 9 Nov 2026 (#1197) a forecast holds several, each with an optional
  coverage word, stored as `id` or `id:coverage` items separated by commas.
- Chance of rain -> probability band in percent, for scoring only.
"""

from typing import NamedTuple

CONDITION_OKTAS: dict[str, tuple[int, int]] = {
    "Clear": (0, 0),
    "Fair": (1, 2),
    "Partly cloudy": (3, 4),
    "Cloudy": (5, 7),
    "Overcast": (8, 8),
}

WEATHER_COVERAGE: dict[str, str] = {
    "isolated": "Isolated",
    "scattered": "Scattered",
    "numerous": "Numerous",
    "occasional": "Occasional",
    "periods": "Periods of",
}
_CONVECTIVE = ("isolated", "scattered", "numerous")
_STEADY = ("occasional", "periods")


class Phenomenon(NamedTuple):
    label: str
    phrase: str
    ww: tuple[int, ...]
    metar: tuple[str, ...]
    coverage: tuple[str, ...]


WEATHER_PHENOMENA: dict[str, Phenomenon] = {
    "fair": Phenomenon(
        "Fair, no significant weather", "fair weather", (0, 1, 2, 3), ("NSW",), ()
    ),
    "haze": Phenomenon("Haze", "haze", (5,), ("HZ",), ()),
    "saharan-dust": Phenomenon(
        "Saharan dust haze", "Saharan dust haze", (6,), ("DU", "HZ"), ()
    ),
    "showers-light": Phenomenon(
        "Light showers", "light showers", (80,), ("-SHRA",), _CONVECTIVE
    ),
    "showers-moderate": Phenomenon(
        "Moderate showers", "moderate showers", (81,), ("SHRA",), _CONVECTIVE
    ),
    "showers-heavy": Phenomenon(
        "Heavy showers", "heavy showers", (81, 82), ("+SHRA",), _CONVECTIVE
    ),
    "rain-light": Phenomenon("Light rain", "light rain", (51, 61), ("-RA",), _STEADY),
    "rain-moderate": Phenomenon(
        "Moderate rain", "moderate rain", (63,), ("RA",), _STEADY
    ),
    "rain-heavy": Phenomenon("Heavy rain", "heavy rain", (65,), ("+RA",), _STEADY),
    "thunderstorms": Phenomenon(
        "Thunderstorms", "thunderstorms", (17, 95, 97), ("TS", "TSRA"), _CONVECTIVE
    ),
    "mist": Phenomenon("Mist (rare)", "mist", (10,), ("BR",), ()),
    "fog": Phenomenon("Fog (rare)", "fog", (45,), ("FG",), ()),
}

# Single weather types stored before the multi-select (23 October 2026 list).
LEGACY_WEATHER_TYPES: dict[str, str] = {
    "Haze": "haze",
    "Dust haze": "saharan-dust",
    "Mist": "mist",
    "Thunder (no rain)": "thunderstorms",
    "Fog": "fog",
    "Drizzle": "rain-light",
    "Light rain": "rain-light",
    "Moderate rain": "rain-moderate",
    "Heavy rain": "rain-heavy",
    "Light showers": "showers-light",
    "Moderate or heavy showers": "showers-moderate",
    "Violent showers": "showers-heavy",
    "Thunderstorms": "thunderstorms",
    "Severe thunderstorms": "thunderstorms",
}

RAIN_CHANCE_BANDS: dict[str, tuple[int, int]] = {
    "Low": (0, 30),
    "Medium": (30, 60),
    "High": (60, 100),
}


def parse_weather(value: str | None) -> list[tuple[str, str]]:
    """(id, coverage) items in list order; unknown or repeated items are dropped.

    A legacy single label ("Light showers") reads as its new item.
    """
    text = (value or "").strip()
    if text in LEGACY_WEATHER_TYPES:
        return [(LEGACY_WEATHER_TYPES[text], "")]
    found: dict[str, str] = {}
    for part in text.split(","):
        identifier, _, coverage = part.strip().partition(":")
        phenomenon = WEATHER_PHENOMENA.get(identifier)
        if phenomenon is None or identifier in found:
            continue
        found[identifier] = coverage if coverage in phenomenon.coverage else ""
    return [(key, found[key]) for key in WEATHER_PHENOMENA if key in found]


def format_weather(items: list[tuple[str, str]]) -> str:
    return ",".join(f"{key}:{coverage}" if coverage else key for key, coverage in items)


def is_valid_weather(value: str) -> bool:
    text = value.strip()
    if not text or text in LEGACY_WEATHER_TYPES:
        return True
    for part in text.split(","):
        identifier, *rest = part.strip().split(":")
        phenomenon = WEATHER_PHENOMENA.get(identifier)
        if phenomenon is None or len(rest) > 1:
            return False
        if rest and rest[0] not in phenomenon.coverage:
            return False
    return True


def weather_sentence(value: str | None) -> str:
    """ "Scattered light showers and Saharan dust haze." (the public sentence)."""
    phrases = [
        f"{WEATHER_COVERAGE[coverage].lower()} {WEATHER_PHENOMENA[key].phrase}"
        if coverage
        else WEATHER_PHENOMENA[key].phrase
        for key, coverage in parse_weather(value)
    ]
    if not phrases:
        return ""
    text = (
        f"{', '.join(phrases[:-1])} and {phrases[-1]}"
        if len(phrases) > 1
        else phrases[0]
    )
    return f"{text[0].upper()}{text[1:]}."


def weather_codes(value: str | None) -> tuple[list[int], list[str]]:
    """SYNOP ww and METAR codes the stored items stand for (verification)."""
    items = [WEATHER_PHENOMENA[key] for key, _ in parse_weather(value)]
    ww = sorted({code for item in items for code in item.ww})
    metar = list(dict.fromkeys(code for item in items for code in item.metar))
    return ww, metar


def weather_icon(value: str | None) -> str:
    """Sheet icon for the most significant stored weather type, from its ww."""
    ww, _ = weather_codes(value)
    if not ww:
        return "cloud"
    if any(code in (17, 95, 97) for code in ww):
        return "cloud-lightning"
    if any(code >= 50 for code in ww):
        return "cloud-rain"
    if all(code <= 3 for code in ww):
        return "sun"
    return "haze"
