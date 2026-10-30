"""Display-ready weather parameters shared by the PDF sheets and the public feed.

Conversions happen here, once, so the issued PDF and weather.gd show the same
wind, sea and tide text, in the GMS public units only (mph, feet).
"""

from typing import Literal, NamedTuple

from . import synop_codes, units
from .validation import optional_number, period_values

RAIN_CHANCES = tuple(synop_codes.RAIN_CHANCE_BANDS)

# What a tile measures, in WMO storage units (degC, knots, metres), so the weather
# site can show it in whichever unit system a visitor picks.
Quantity = Literal["temperature", "speed", "height"]


class Tile(NamedTuple):
    """One display tile: its PDF text, and the numbers behind it when it has any."""

    icon: str
    value: str
    label: str
    quantity: Quantity | None = None
    low: float | None = None
    high: float | None = None
    # The label without units, for the public feed (the PDF label may carry feet).
    public_label: str | None = None


def conditions(values: dict[str, str], prefix: str = "") -> list[tuple[str, str, str]]:
    """(icon, value, label) tiles, in reading order, for the issued PDF."""
    return [(t.icon, t.value, t.label) for t in build_tiles(values, prefix)]


def build_tiles(values: dict[str, str], prefix: str = "") -> list[Tile]:
    """Every tile with its numbers, in reading order."""
    p = period_values(values, prefix)
    tiles: list[Tile] = []
    weather_type = p.get("weatherType", "").strip()
    if weather_type in synop_codes.WEATHER_TYPES:
        tiles.append(
            Tile(synop_codes.weather_icon(weather_type), weather_type, "Weather type")
        )
    # Evening outlook days store temperatures as `dayNMax` / `dayNMin`.
    high, low = (
        optional_number(p, key) if p.get(key) else optional_number(p, fallback)
        for key, fallback in (("maxTemperature", "max"), ("minTemperature", "min"))
    )
    if high is not None:
        tiles.append(
            Tile(
                "thermometer-sun",
                f"{units._num(high)}°C",
                "Max temp",
                "temperature",
                high,
                high,
            )
        )
    if low is not None:
        tiles.append(
            Tile(
                "thermometer-snowflake",
                f"{units._num(low)}°C",
                "Min temp",
                "temperature",
                low,
                low,
            )
        )
    speeds = [optional_number(p, k) for k in ("windSpeedMin", "windSpeedMax")]
    gust = optional_number(p, "windGust")
    if any(s is not None for s in speeds):
        unit = units.PUBLIC_WIND_UNIT
        converted = [None if s is None else units.convert_wind(s, unit) for s in speeds]
        tiles.append(
            Tile(
                "wind",
                f"{units._span(*converted)} {unit}",
                "Wind speed",
                "speed",
                speeds[0],
                speeds[1],
            )
        )
        if gust is not None:
            gusts = f"{round(units.convert_wind(gust, unit))} {unit}"
            tiles.append(Tile("wind", gusts, "Gusts", "speed", gust, None))
    elif p.get("wind"):
        tiles.append(Tile("wind", p["wind"], "Wind"))
    direction = units.direction_text(p.get("windDirFrom", ""), p.get("windDirTo", ""))
    if direction:
        tiles.append(Tile("compass", direction, "Wind direction"))
    # Low/Medium/High since 23 October 2026; older issues carry a percentage.
    rain_word = p.get("rainChance", "").strip()
    rain = optional_number(p, "rainChance")
    if rain is not None:
        tiles.append(Tile("umbrella", f"{units._num(rain)}%", "Chance of rain"))
    elif rain_word in RAIN_CHANCES:
        tiles.append(Tile("umbrella", rain_word, "Chance of rain"))
    sea = units.sea_state_text(p.get("seaStateFrom", ""), p.get("seaStateTo", ""))
    if sea:
        tiles.append(Tile("waves", sea, "Sea state"))
    elif p.get("seaState"):
        tiles.append(Tile("waves", p["seaState"], "Sea state"))
    waves = [optional_number(p, k) for k in ("waveHeightMin", "waveHeightMax")]
    if any(w is not None for w in waves):
        tiles.append(
            Tile(
                "waves",
                units.height_text(*waves),
                "Wave height",
                "height",
                waves[0],
                waves[1],
            )
        )
    swell = units.swell_text(
        p.get("swellDir", ""), optional_number(p, "swellPeriod"), None
    )
    swell_height = optional_number(p, "swellHeight")
    if swell or swell_height is not None:
        value = (
            units.height_text(swell_height, None) if swell_height is not None else swell
        )
        label = "Swell" + (f" · {swell}" if swell_height is not None and swell else "")
        tiles.append(
            Tile(
                "ship",
                value,
                label,
                "height" if swell_height is not None else None,
                swell_height,
                None,
            )
        )
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
        tiles.append(
            Tile(
                icon,
                time,
                f"{kind} tide{extra}",
                "height" if height is not None else None,
                height,
                None,
                f"{kind} tide",
            )
        )
    if not tides:
        for key, label in (("highTides", "High tides"), ("lowTides", "Low tides")):
            if p.get(key):
                tiles.append(
                    Tile(
                        "arrow-up-to-line"
                        if key == "highTides"
                        else "arrow-down-to-line",
                        p[key],
                        label,
                    )
                )
    if p.get("sunrise"):
        tiles.append(Tile("sunrise", p["sunrise"], "Sunrise"))
    if p.get("sunset"):
        tiles.append(Tile("sunset", p["sunset"], "Sunset"))
    return tiles
