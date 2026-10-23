"""Display-ready weather parameters shared by the PDF sheets and the public feed.

Conversions happen here, once, so the issued PDF and weather.gd show the same
wind, sea and tide text, in the GMS public units only (mph, feet).
"""

from . import units
from .validation import optional_number, period_values

RAIN_CHANCES = ("Low", "Medium", "High")


def conditions(values: dict[str, str], prefix: str = "") -> list[tuple[str, str, str]]:
    """(icon, value, label) tiles, in reading order."""
    p = period_values(values, prefix)
    tiles: list[tuple[str, str, str]] = []
    # Evening outlook days store temperatures as `dayNMax` / `dayNMin`.
    high, low = (
        optional_number(p, key) if p.get(key) else optional_number(p, fallback)
        for key, fallback in (("maxTemperature", "max"), ("minTemperature", "min"))
    )
    if high is not None:
        tiles.append(("thermometer-sun", f"{units._num(high)}°C", "Max temp"))
    if low is not None:
        tiles.append(("thermometer-snowflake", f"{units._num(low)}°C", "Min temp"))
    speeds = [optional_number(p, k) for k in ("windSpeedMin", "windSpeedMax")]
    gust = optional_number(p, "windGust")
    if any(s is not None for s in speeds):
        unit = units.PUBLIC_WIND_UNIT
        converted = [None if s is None else units.convert_wind(s, unit) for s in speeds]
        tiles.append(("wind", f"{units._span(*converted)} {unit}", "Wind speed"))
        if gust is not None:
            gusts = f"{round(units.convert_wind(gust, unit))} {unit}"
            tiles.append(("wind", gusts, "Gusts"))
    elif p.get("wind"):
        tiles.append(("wind", p["wind"], "Wind"))
    direction = units.direction_text(p.get("windDirFrom", ""), p.get("windDirTo", ""))
    if direction:
        tiles.append(("compass", direction, "Wind direction"))
    # Low/Medium/High since 23 October 2026; older issues carry a percentage.
    rain_word = p.get("rainChance", "").strip()
    rain = optional_number(p, "rainChance")
    if rain is not None:
        tiles.append(("umbrella", f"{units._num(rain)}%", "Chance of rain"))
    elif rain_word in RAIN_CHANCES:
        tiles.append(("umbrella", rain_word, "Chance of rain"))
    sea = units.sea_state_text(p.get("seaStateFrom", ""), p.get("seaStateTo", ""))
    if sea:
        tiles.append(("waves", sea, "Sea state"))
    elif p.get("seaState"):
        tiles.append(("waves", p["seaState"], "Sea state"))
    waves = [optional_number(p, k) for k in ("waveHeightMin", "waveHeightMax")]
    if any(w is not None for w in waves):
        tiles.append(("waves", units.height_text(*waves), "Wave height"))
    swell = units.swell_text(
        p.get("swellDir", ""), optional_number(p, "swellPeriod"), None
    )
    swell_height = optional_number(p, "swellHeight")
    if swell or swell_height is not None:
        value = (
            units.height_text(swell_height, None) if swell_height is not None else swell
        )
        label = "Swell" + (f" · {swell}" if swell_height is not None and swell else "")
        tiles.append(("ship", value, label))
    tides = sorted(
        (
            p.get(f"tide{n}Time", ""),
            p.get(f"tide{n}Type", ""),
            optional_number(p, f"tide{n}Height"),
        )
        for n in units.TIDE_SLOTS
        if p.get(f"tide{n}Time") and p.get(f"tide{n}Type")
    )
    for time, kind, height in tides:
        icon = "arrow-up-to-line" if kind == "High" else "arrow-down-to-line"
        extra = f" ({units._num(units.feet(height))} ft)" if height is not None else ""
        tiles.append((icon, time, f"{kind} tide{extra}"))
    if not tides:
        for key, label in (("highTides", "High tides"), ("lowTides", "Low tides")):
            if p.get(key):
                tiles.append(
                    (
                        "arrow-up-to-line"
                        if key == "highTides"
                        else "arrow-down-to-line",
                        p[key],
                        label,
                    )
                )
    if p.get("sunrise"):
        tiles.append(("sunrise", p["sunrise"], "Sunrise"))
    if p.get("sunset"):
        tiles.append(("sunset", p["sunset"], "Sunset"))
    return tiles
