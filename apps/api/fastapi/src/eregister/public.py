"""Latest MBIA SYNOP decoded for the public site.

Readings go public when saved and are labelled provisional until accepted
(real-time practice); rejected and superseded readings never appear. Only the
decoded fields in ``PublicObservation`` leave this module.
"""

import calendar
import math
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from .schemas import PressureTrend, PublicMonthSummary, PublicObservation

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


# WMO Guide to Climatological Practices (WMO-No. 100): a rain day has at least
# 0.2 mm in the climatological day. Daily totals come from the 24 h rainfall
# group (RRR, code table 3590) of the section 3 report, one per UTC date.
RAIN_DAY_MM = Decimal("0.2")

_MONTH_SQL = text(
    """
    WITH usable AS (
      SELECT o.station_name, o.observed_at, o.state,
             CASE WHEN jsonb_typeof(o.body -> 'workbook') = 'object'
                  THEN o.body -> 'workbook' ELSE o.body END AS wb
      FROM register_observations o
      WHERE o.kind = 'SYNOP'
        AND o.station_id = :station
        AND o.state NOT IN ('rejected', 'superseded')
        AND o.observed_at >= :start AND o.observed_at < :stop
        AND NOT EXISTS (
          SELECT 1 FROM register_observations newer
          WHERE newer.supersedes_id = o.id AND newer.state <> 'rejected'
        )
    ),
    raw AS (
      SELECT station_name, observed_at, state,
             btrim(wb ->> 's3_rainfall_24h') AS rr,
             btrim(wb ->> 's3_max_temp') AS tx,
             btrim(wb ->> 's3_min_temp') AS tn,
             btrim(wb ->> 'air_temp') AS ta
      FROM usable
    ),
    parsed AS (
      SELECT station_name, observed_at, state,
        CASE WHEN rr ~ '^[0-9]{3}$' THEN
               CASE WHEN CAST(rr AS int) = 990 THEN 0
                    WHEN CAST(rr AS int) > 990 THEN (CAST(rr AS int) - 990) / 10.0
                    ELSE CAST(rr AS int) END
             WHEN rr ~ '^[0-9]{1,2}([.][0-9]+)?$' THEN CAST(rr AS numeric)
        END AS rain,
        CASE WHEN tx ~ '^[01]?[0-9]{3}$' THEN
               CASE WHEN length(tx) = 4 AND left(tx, 1) = '1' THEN -1 ELSE 1 END
               * CAST(right(tx, 3) AS int) / 10.0 END AS tmax,
        CASE WHEN tn ~ '^[01]?[0-9]{3}$' THEN
               CASE WHEN length(tn) = 4 AND left(tn, 1) = '1' THEN -1 ELSE 1 END
               * CAST(right(tn, 3) AS int) / 10.0 END AS tmin,
        CASE WHEN ta ~ '^-?[0-9]{1,2}[.][0-9]+$' AND CAST(ta AS numeric) BETWEEN -10 AND 50
             THEN CAST(ta AS numeric) END AS tair
      FROM raw
    ),
    daily AS (
      SELECT max(rain) AS rain
      FROM parsed
      WHERE rain IS NOT NULL
      GROUP BY CAST(observed_at AT TIME ZONE 'UTC' AS date)
    ),
    extremes AS (
      SELECT observed_at,
             greatest(tmax, tair) AS hi,
             least(tmin, tair) AS lo
      FROM parsed
    )
    SELECT
      (SELECT count(*) FROM parsed) AS observation_count,
      (SELECT max(observed_at) FROM parsed) AS last_observation_at,
      (SELECT max(station_name) FROM parsed) AS station_name,
      (SELECT bool_or(state <> 'accepted') FROM parsed) AS provisional,
      (SELECT count(*) FROM daily) AS rain_report_days,
      (SELECT sum(rain) FROM daily) AS rainfall_mm,
      (SELECT count(*) FROM daily WHERE rain >= :rain_day) AS rain_days,
      (SELECT max(hi) FROM extremes) AS tmax,
      (SELECT min(observed_at) FROM extremes
         WHERE hi = (SELECT max(hi) FROM extremes)) AS tmax_at,
      (SELECT min(lo) FROM extremes) AS tmin,
      (SELECT min(observed_at) FROM extremes
         WHERE lo = (SELECT min(lo) FROM extremes)) AS tmin_at
    """
)


def month_bounds(month: str | None, now: datetime) -> tuple[str, datetime, datetime]:
    """(YYYY-MM, UTC start, exclusive end) for ``month`` or the current UTC month."""
    now = now.astimezone(UTC)
    year, number = (
        (now.year, now.month) if month is None else map(int, month.split("-"))
    )
    start = datetime(year, number, 1, tzinfo=UTC)
    stop = start + timedelta(days=calendar.monthrange(year, number)[1])
    return f"{year:04d}-{number:02d}", start, stop


def _tenths(value: Any) -> float | None:
    return None if value is None else round(float(value), 1)


async def month_summary(
    session: AsyncSession, month: str | None, now: datetime
) -> PublicMonthSummary | None:
    label, start, stop = month_bounds(month, now)
    now = now.astimezone(UTC)
    if start > now:
        return None
    # A reading timed in the future is a typo (same guard as ``latest``).
    cutoff = min(stop, now + timedelta(minutes=15))
    result = await session.execute(
        _MONTH_SQL,
        {
            "station": MBIA_STATION,
            "start": start,
            "stop": cutoff,
            "rain_day": RAIN_DAY_MM,
        },
    )
    row = result.mappings().one()
    if not row["observation_count"]:
        return None
    period_end = min(stop, now)
    rain_known = row["rain_report_days"] > 0
    return PublicMonthSummary(
        station_id=MBIA_STATION,
        station_name=row["station_name"],
        month=label,
        period_start=start,
        period_end=period_end,
        last_observation_at=row["last_observation_at"],
        observation_count=row["observation_count"],
        days_elapsed=(period_end - start).days + 1,
        rain_report_days=row["rain_report_days"],
        rainfall_mm=_tenths(row["rainfall_mm"]) if rain_known else None,
        rain_days=row["rain_days"] if rain_known else None,
        rain_day_threshold_mm=float(RAIN_DAY_MM),
        max_temperature_c=_tenths(row["tmax"]),
        max_temperature_at=row["tmax_at"] if row["tmax"] is not None else None,
        min_temperature_c=_tenths(row["tmin"]),
        min_temperature_at=row["tmin_at"] if row["tmin"] is not None else None,
        provisional=bool(row["provisional"]),
    )
