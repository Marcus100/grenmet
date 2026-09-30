"""Latest MBIA SYNOP decoded for the public site.

Readings go public when saved and are labelled provisional until accepted
(real-time practice); rejected and superseded readings never appear. Only the
decoded fields in ``PublicObservation`` leave this module.
"""

import math
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from .schemas import PressureTrend, PublicObservation

MBIA_STATION = "78958"
COMPASS = ("N NNE NE ENE E ESE SE SSE S SSW SW WSW W WNW NW NNW").split()
# WMO code table 4019 (tR): hours covered by the section 1 precipitation group.
RAIN_PERIOD_HOURS = {
    "1": 6,
    "2": 12,
    "3": 18,
    "4": 24,
    "5": 1,
    "6": 2,
    "7": 3,
    "8": 9,
    "9": 15,
}
CLOUD_WORDS = {
    0: "Clear",
    1: "Mostly clear",
    2: "Mostly clear",
    3: "Partly cloudy",
    4: "Partly cloudy",
    5: "Partly cloudy",
    6: "Mostly cloudy",
    7: "Mostly cloudy",
    8: "Overcast",
    9: "Sky obscured",
}
# WMO code table 4677 (ww), grouped into plain words for the public.
_WEATHER_RANGES: tuple[tuple[range, str], ...] = (
    (range(4, 6), "Haze"),
    (range(6, 10), "Dust haze"),
    (range(10, 11), "Mist"),
    (range(13, 14), "Lightning"),
    (range(17, 18), "Thunder"),
    (range(18, 19), "Squalls"),
    (range(20, 30), "Recent showers"),
    (range(40, 50), "Fog"),
    (range(50, 60), "Drizzle"),
    (range(60, 62), "Light rain"),
    (range(62, 66), "Rain"),
    (range(66, 80), "Rain"),
    (range(80, 81), "Light shower"),
    (range(81, 83), "Heavy showers"),
    (range(83, 91), "Showers"),
    (range(91, 95), "Thunderstorm nearby"),
    (range(95, 100), "Thunderstorm"),
)


def _value(workbook: dict[str, Any], key: str) -> str:
    value = workbook.get(key)
    return str(value).strip() if value is not None else ""


def _number(text_value: str) -> float | None:
    try:
        result = float(text_value)
    except ValueError:
        return None
    return result if math.isfinite(result) else None


def _code(text_value: str) -> int | None:
    return int(text_value) if text_value.isdigit() else None


def temperature(text_value: str) -> float | None:
    """Workbook temperatures are entered in °C (e.g. ``25.4``)."""
    value = _number(text_value)
    return value if value is not None and -10 <= value <= 50 else None


def humidity(temp: float | None, dew: float | None) -> int | None:
    if temp is None or dew is None or dew > temp + 0.5:
        return None

    # Magnus approximation (WMO No. 8, Annex 4.B).
    def vapour(t: float) -> float:
        return math.exp(17.62 * t / (243.12 + t))

    return min(100, round(100 * vapour(dew) / vapour(temp)))


def wind(workbook: dict[str, Any]) -> tuple[bool, int | None, int | None]:
    """(calm, direction in degrees, speed in knots)."""
    raw_dir, raw_speed = _value(workbook, "wind_dir"), _value(workbook, "wind_speed")
    direction = _code(raw_dir)
    speed = _code(raw_speed)
    if speed is not None and _value(workbook, "wind_indicator") in {"0", "1"}:
        speed = round(speed * 1.943844)  # metres per second to knots
    if direction == 0 and (speed in (None, 0)):
        return True, None, 0
    if direction is not None:
        # dd (tens of degrees) as two digits; three digits are whole degrees.
        if len(raw_dir) < 3:
            direction *= 10
        if not 1 <= direction <= 360:
            direction = None
    return False, direction, speed


def compass(degrees: int | None) -> str | None:
    return None if degrees is None else COMPASS[round(degrees / 22.5) % 16]


def pressure(text_value: str) -> float | None:
    """MSL pressure in hPa; accepts ``1014.9`` or the coded PPPP ``0149``."""
    value: float | None
    if "." not in text_value and len(text_value) == 4 and text_value.isdigit():
        tenths = int(text_value) / 10
        value = tenths + 1000 if tenths < 100 else tenths
    else:
        value = _number(text_value)
    return value if value is not None and 870 <= value <= 1085 else None


def tendency(code: str) -> PressureTrend | None:
    # WMO code table 0200 (a): 0-3 higher, 4 same, 5-8 lower than 3 h ago.
    value = _code(code)
    if value is None or value > 8:
        return None
    return "rising" if value < 4 else "steady" if value == 4 else "falling"


def rain(text_value: str) -> tuple[float | None, bool]:
    """WMO code table 3590 (RRR): 990 trace, 991-999 tenths of a millimetre."""
    value = _code(text_value)
    if value is None:
        return _number(text_value), False
    if value == 990:
        return 0.0, True
    if value > 990:
        return (value - 990) / 10, False
    return float(value), False


def weather(code: str) -> str | None:
    value = _code(code)
    if value is None:
        return None
    return next((words for codes, words in _WEATHER_RANGES if value in codes), None)


def decode(row: dict[str, Any]) -> PublicObservation:
    body: dict[str, Any] = row["body"] or {}
    # gaa-admin saves the workbook flat; earlier clients nested it.
    nested = body.get("workbook")
    workbook: dict[str, Any] = nested if isinstance(nested, dict) else body
    temp = temperature(_value(workbook, "air_temp"))
    dew = temperature(_value(workbook, "dew_point"))
    calm, direction, speed_kt = wind(workbook)
    change = _code(_value(workbook, "pressure_change"))
    amount, trace = rain(_value(workbook, "precip_amount"))
    rain_24h, _ = rain(_value(workbook, "s3_rainfall_24h"))
    oktas = _code(_value(workbook, "total_cloud"))
    return PublicObservation(
        station_id=row["station_id"],
        station_name=row["station_name"],
        observed_at=row["observed_at"],
        status="accepted" if row["state"] == "accepted" else "provisional",
        temperature_c=temp,
        dew_point_c=dew,
        relative_humidity=humidity(temp, dew),
        wind_calm=calm,
        wind_direction_deg=direction,
        wind_direction=compass(direction),
        wind_speed_kt=speed_kt,
        wind_speed_mph=None if speed_kt is None else round(speed_kt * 1.150779),
        msl_pressure_hpa=pressure(_value(workbook, "msl_pressure")),
        pressure_trend=tendency(_value(workbook, "pressure_tendency")),
        pressure_change_hpa=None if change is None else change / 10,
        rain_mm=amount,
        rain_trace=trace,
        rain_period_hours=RAIN_PERIOD_HOURS.get(_value(workbook, "precip_period")),
        rain_24h_mm=rain_24h,
        weather=weather(_value(workbook, "present_wx")),
        cloud_oktas=oktas if oktas is not None and oktas <= 9 else None,
        cloud=CLOUD_WORDS.get(oktas) if oktas is not None else None,
    )


async def latest(session: AsyncSession, now: datetime) -> PublicObservation | None:
    result = await session.execute(
        text(
            """
            SELECT o.station_id, o.station_name, o.observed_at, o.state, o.body
            FROM register_observations o
            WHERE o.kind = 'SYNOP'
              AND o.station_id = :station
              AND o.state NOT IN ('rejected', 'superseded')
              AND o.observed_at <= :latest
              AND NOT EXISTS (
                SELECT 1 FROM register_observations newer
                WHERE newer.supersedes_id = o.id AND newer.state <> 'rejected'
              )
            ORDER BY o.observed_at DESC, o.created_at DESC
            LIMIT 1
            """
        ),
        # A reading timed in the future is a typo; never show it as current.
        {
            "station": MBIA_STATION,
            "latest": now.astimezone(UTC) + timedelta(minutes=15),
        },
    )
    row = result.mappings().first()
    return decode(dict(row)) if row else None
