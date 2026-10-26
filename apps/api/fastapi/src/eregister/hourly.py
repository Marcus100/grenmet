"""Hour-to-hour checks: this observation against the saved ones 1 and 3 hours earlier.

Every hour of station 78958 is keyed by hand, so the previous hours exist. These are
quality-control warnings (standard climatological step and internal-consistency tests,
WMO Guide to Instruments and Methods of Observation); nothing here blocks saving.
The limits are one object so a station can change them: until they are stored per
station (a register migration), ``DEFAULT_LIMITS`` applies everywhere.

The checks are pure and work on decoded SI values.
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass

from .schemas import SynopDecoded, SynopValidationIssue, SynopWorkbook

# Code table 0200: the characteristic a gives the sign of the 3 h pressure change.
_RISING = (0, 1, 2, 3)
_FALLING = (5, 6, 7, 8)
# Present weather that explains a drop in visibility (haze, dust, mist, fog,
# precipitation, thunderstorm): ww 04 to 12, 20 to 99.
_EXPLAINS_VISIBILITY = (*range(4, 13), *range(20, 100))
DEGREES_IN_CIRCLE = 360
HALF_CIRCLE = 180
TENTHS = 10
PASCALS_PER_HPA = 100


@dataclass(frozen=True)
class HourlyLimits:
    """Limits for one station; every value is a warning threshold."""

    air_temperature_step_c: float = 5.0
    dew_point_step_c: float = 5.0
    wind_speed_step_ms: float = 8.0
    wind_direction_step_deg: float = 90.0
    # Light winds veer freely; compare directions only above this speed.
    wind_direction_min_speed_ms: float = 5.0
    # Station pressure now minus 3 h ago against the keyed 5appp.
    pressure_tendency_tolerance_hpa: float = 0.5
    visibility_drop_from_m: float = 10_000.0
    visibility_drop_to_m: float = 1_000.0


DEFAULT_LIMITS = HourlyLimits()


def _warn(field: str, code: str, message: str) -> SynopValidationIssue:
    return SynopValidationIssue(
        field=field, code=code, message=message, severity="warning"
    )


def _step(now: float | None, before: float | None, limit: float) -> float | None:
    """The change when it reaches the limit, else None."""
    if now is None or before is None:
        return None
    change = now - before
    return change if abs(change) >= limit else None


def _direction_change(now: float, before: float) -> float:
    gap = abs(now - before) % DEGREES_IN_CIRCLE
    return DEGREES_IN_CIRCLE - gap if gap > HALF_CIRCLE else gap


def _temperature_checks(
    now: SynopDecoded, before: SynopDecoded, limits: HourlyLimits
) -> list[SynopValidationIssue]:
    found: list[SynopValidationIssue] = []
    change = _step(
        now.air_temperature_k, before.air_temperature_k, limits.air_temperature_step_c
    )
    if change is not None:
        found.append(
            _warn(
                "air_temp",
                "temperature_jump",
                f"Air temperature changed by {change:+.1f} degrees since the previous "
                f"hour (limit {limits.air_temperature_step_c:g}); check the reading.",
            )
        )
    change = _step(now.dew_point_k, before.dew_point_k, limits.dew_point_step_c)
    if change is not None:
        found.append(
            _warn(
                "dew_point",
                "dew_point_jump",
                f"Dew point changed by {change:+.1f} degrees since the previous hour "
                f"(limit {limits.dew_point_step_c:g}); check the reading.",
            )
        )
    return found


def _variable(workbook: SynopWorkbook | None) -> bool:
    """Variable wind (dd 99) decodes as direction 0, so it has no direction to compare."""
    return workbook is not None and (workbook.wind_dir or "").strip() == "99"


def _wind_checks(
    now: SynopDecoded,
    before: SynopDecoded,
    workbook: SynopWorkbook,
    previous_workbook: SynopWorkbook | None,
    limits: HourlyLimits,
) -> list[SynopValidationIssue]:
    found: list[SynopValidationIssue] = []
    change = _step(now.wind_speed_ms, before.wind_speed_ms, limits.wind_speed_step_ms)
    if change is not None:
        found.append(
            _warn(
                "wind_speed",
                "wind_speed_jump",
                f"Wind speed changed by {change:+.1f} m/s since the previous hour "
                f"(limit {limits.wind_speed_step_ms:g}); check the reading.",
            )
        )
    now_speed, before_speed = now.wind_speed_ms, before.wind_speed_ms
    now_direction, before_direction = now.wind_direction_deg, before.wind_direction_deg
    if (
        now_speed is not None
        and before_speed is not None
        and now_direction is not None
        and before_direction is not None
        and not _variable(workbook)
        and not _variable(previous_workbook)
        and min(now_speed, before_speed) >= limits.wind_direction_min_speed_ms
    ):
        turned = _direction_change(now_direction, before_direction)
        if turned >= limits.wind_direction_step_deg:
            found.append(
                _warn(
                    "wind_dir",
                    "wind_direction_jump",
                    f"Wind direction turned {turned:.0f} degrees since the previous "
                    f"hour at {min(now_speed, before_speed):.0f} m/s or more "
                    f"(limit {limits.wind_direction_step_deg:g}); check the reading.",
                )
            )
    return found


def _visibility_check(
    now: SynopDecoded,
    before: SynopDecoded,
    workbook: SynopWorkbook,
    limits: HourlyLimits,
) -> list[SynopValidationIssue]:
    if (
        now.visibility_m is None
        or before.visibility_m is None
        or before.visibility_m < limits.visibility_drop_from_m
        or now.visibility_m >= limits.visibility_drop_to_m
    ):
        return []
    ww = (workbook.present_wx or "").strip()
    if ww.isdigit() and int(ww) in _EXPLAINS_VISIBILITY:
        return []
    return [
        _warn(
            "visibility",
            "visibility_drop",
            f"Visibility fell from {before.visibility_m / 1000:g} km to "
            f"{now.visibility_m / 1000:g} km without present weather that explains it "
            "(haze, mist, fog, precipitation); check ww and VV.",
        )
    ]


def _tendency_check(
    now: SynopDecoded,
    three_hours_ago: SynopDecoded,
    workbook: SynopWorkbook,
    limits: HourlyLimits,
) -> list[SynopValidationIssue]:
    tendency = (workbook.pressure_tendency or "").strip()
    change = (workbook.pressure_change or "").strip()
    if (
        not (tendency.isdigit() and change.isdigit())
        or now.station_pressure_pa is None
        or three_hours_ago.station_pressure_pa is None
    ):
        return []
    a = int(tendency)
    sign = 1 if a in _RISING else -1 if a in _FALLING else 0
    keyed = sign * int(change) / TENTHS
    measured = (
        now.station_pressure_pa - three_hours_ago.station_pressure_pa
    ) / PASCALS_PER_HPA
    if abs(measured - keyed) <= limits.pressure_tendency_tolerance_hpa:
        return []
    return [
        _warn(
            "pressure_change",
            "tendency_vs_pressure",
            f"Station pressure changed {measured:+.1f} hPa in 3 h but 5appp says "
            f"{keyed:+.1f} (tolerance {limits.pressure_tendency_tolerance_hpa:g}); "
            "check a, ppp and the pressures.",
        )
    ]


def check(
    workbook: SynopWorkbook,
    decoded: SynopDecoded,
    history: Mapping[int, SynopDecoded],
    limits: HourlyLimits = DEFAULT_LIMITS,
    previous_workbook: SynopWorkbook | None = None,
) -> list[SynopValidationIssue]:
    """Warnings comparing this observation with the saved ones 1 and 3 hours earlier.

    ``previous_workbook`` is the keyed workbook of the previous hour; it tells whether
    that hour's wind was variable.
    """
    found: list[SynopValidationIssue] = []
    previous = history.get(1)
    if previous is not None:
        found += _temperature_checks(decoded, previous, limits)
        found += _wind_checks(decoded, previous, workbook, previous_workbook, limits)
        found += _visibility_check(decoded, previous, workbook, limits)
    earlier = history.get(3)
    if earlier is not None:
        found += _tendency_check(decoded, earlier, workbook, limits)
    return found
