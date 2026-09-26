"""Display-ready weather parameters shared by the PDF sheets and the public feed.

Conversions happen here, once, so the issued PDF and weather.gd show the same
wind, sea and tide text (public units first, WMO units in brackets).
"""

from . import units
from .validation import optional_number, period_values


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
        label = f"Wind speed ({units._span(*speeds)} kt)"
        tiles.append(("wind", f"{units._span(*converted)} {unit}", label))
        if gust is not None:
            gusts = f"{round(units.convert_wind(gust, unit))} {unit}"
            tiles.append(("wind", gusts, f"Gusts ({round(gust)} kt)"))
    elif p.get("wind"):
        tiles.append(("wind", p["wind"], "Wind"))
    direction = units.direction_text(p.get("windDirFrom", ""), p.get("windDirTo", ""))
    if direction:
        tiles.append(("compass", direction, "Wind direction"))
    rain = optional_number(p, "rainChance")
    if rain is not None:
        tiles.append(("umbrella", f"{units._num(rain)}%", "Chance of rain"))
    sea = units.sea_state_text(p.get("seaStateFrom", ""), p.get("seaStateTo", ""))
    if sea:
        tiles.append(("waves", sea, "Sea state"))
    elif p.get("seaState"):
        tiles.append(("waves", p["seaState"], "Sea state"))
    waves = [optional_number(p, k) for k in ("waveHeightMin", "waveHeightMax")]
    if any(w is not None for w in waves):
        metres = units._span(*waves, places=1)
        feet = units._span(*(None if w is None else units.feet(w) for w in waves))
        tiles.append(("waves", f"{metres} m", f"Wave height ({feet} ft)"))
    swell = units.swell_text(
        p.get("swellDir", ""), optional_number(p, "swellPeriod"), None
    )
    swell_height = optional_number(p, "swellHeight")
    if swell or swell_height is not None:
        value = f"{units._num(swell_height)} m" if swell_height is not None else swell
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
        extra = f" ({units._num(height)} m)" if height is not None else ""
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
