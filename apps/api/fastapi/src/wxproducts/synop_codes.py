"""SYNOP links for forecast fields, for later verification against the eRegister.

Owner decision, 23 October 2026: forecast choices carry the SYNOP meaning of
the hourly observations at MBIA (78958), so a forecast can be checked against
what was observed. Mirrors `packages/gms/src/products.ts` (`CONDITION_OKTAS`,
`WEATHER_TYPES`, `RAIN_CHANCE_BANDS`); `tests/wxproducts/test_synop_codes.py`
keeps the two equal.

- Conditions -> total cloud N in oktas (WMO code table 2700), METAR bands.
- Weather type -> present weather ww (WMO code table 4677).
- Chance of rain -> probability band in percent, for scoring only.
"""

CONDITION_OKTAS: dict[str, tuple[int, int]] = {
    "Clear": (0, 0),
    "Fair": (1, 2),
    "Partly cloudy": (3, 4),
    "Cloudy": (5, 7),
    "Overcast": (8, 8),
}

WEATHER_TYPES: dict[str, int] = {
    "Haze": 5,
    "Dust haze": 6,
    "Mist": 10,
    "Thunder (no rain)": 17,
    "Fog": 45,
    "Drizzle": 51,
    "Light rain": 61,
    "Moderate rain": 63,
    "Heavy rain": 65,
    "Light showers": 80,
    "Moderate or heavy showers": 81,
    "Violent showers": 82,
    "Thunderstorms": 95,
    "Severe thunderstorms": 97,
}

RAIN_CHANCE_BANDS: dict[str, tuple[int, int]] = {
    "Low": (0, 30),
    "Medium": (30, 60),
    "High": (60, 100),
}


def weather_icon(label: str) -> str:
    """Sheet icon for a weather type, from its ww group."""
    ww = WEATHER_TYPES.get(label)
    if ww is None:
        return "cloud"
    if ww in (17, 95, 97):
        return "cloud-lightning"
    if ww >= 50:
        return "cloud-rain"
    return "haze"
