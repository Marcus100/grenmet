"""Values the register calculates instead of asking the observer to key.

Owner decisions (2026-10-23): visibility is typed in kilometres and the coded
visibility group VV is derived from it; the dew point, vapour pressure and
relative humidity are calculated from the dry bulb and wet bulb temperatures.
Pure functions only: no I/O. The same formulas run on screen in
``eregister-derived.ts`` (gaa-admin) so the grey cells match what is stored.

* Visibility km to VV follows WMO Code table 4377: 100 m steps to 5 km
  (00 is below 100 m), whole kilometres from 6 to 30 km (VV = km + 50), five
  kilometre steps from 35 to 70 km (VV 81 to 88), 89 above 70 km. Codes 51 to 55
  are unused, so 5.1 to 5.9 km reads 50. Values round down.
* Vapour pressure is the psychrometer equation ``e = ew(Tw) - A * P * (T - Tw)``
  with ``A = 0.00066 * (1 + 0.00115 * Tw)`` (ventilated psychrometer), where
  ``ew`` is the Magnus formula over water (the same constants the screen already
  used for vapour pressure). P is the keyed station pressure, so a row without
  it keeps whatever dew point was keyed. The GMS psychrometric table is still to
  be confirmed; over ice (wet bulb below 0 degrees) the water formula is used.
* Pressures (owner confirmed for 78958, 2026-10-24) use fixed station amounts,
  not a reduction formula: station pressure = barometer as read + total
  correction (0.0); QFE = station pressure + 0.3; mean sea level pressure =
  station pressure + 1.0; QNH = mean sea level pressure + 0.1. Barometer 1012.8
  gives station 1012.8 (group 3 0128), QFE 1013.1, sea level 1013.8 (group 4
  0138) and QNH 1013.9. A keyed group 3 or 4 is kept; ``pressure_mismatches``
  reports one that differs from the rule.
"""

import re
from collections.abc import Mapping
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
from math import exp, floor, log
from typing import Any

from .schemas import SynopWorkbook

MAGNUS_A = 6.1094
MAGNUS_B = 17.625
MAGNUS_C = 243.04
PSYCHROMETER_A = 0.00066
PSYCHROMETER_TW_FACTOR = 0.00115
BAROMETER_REFERENCE_CODE = 5000
PRESSURE_RANGE_HPA = (500.0, 1085.7)
FOUR_DIGITS = 4
THREE_DIGITS = 3
MAX_PERCENT = 100

FINE_MAX_KM = Decimal(5)
FINE_MAX_CODE = 50
WHOLE_KM_MAX = Decimal(30)
WHOLE_KM_MAX_CODE = 80
COARSE_STEP_KM = 5
COARSE_MAX_KM = Decimal(70)
OVER_70KM_CODE = 89
KM_CODE_OFFSET = 50
VISIBILITY_KM_LIMIT = Decimal(1000)
# Plain ASCII digits only: no exponent, sign, spaces or extra decimals.
KILOMETRES_FORMAT = re.compile(r"[0-9]+(\.[0-9]+)?")
BAROMETER_FORMAT = re.compile(r"[0-9]{3,4}(\.[0-9])?")


def parse_visibility_km(text: str | None) -> Decimal | None:
    """The typed kilometres, or None when blank or not a plain non-negative number."""
    value = (text or "").strip()
    if KILOMETRES_FORMAT.fullmatch(value) is None:
        return None
    try:
        km = Decimal(value)
    except InvalidOperation:
        return None
    if not km.is_finite() or km < 0 or km >= VISIBILITY_KM_LIMIT:
        return None
    return km


def visibility_code_from_km(km: Decimal) -> str:
    """Code table 4377 VV (two digits) for a visibility in kilometres."""
    if km <= FINE_MAX_KM:
        code = floor(km * 10)
    elif km < FINE_MAX_KM + 1:
        code = FINE_MAX_CODE  # 51 to 55 are unused
    elif km <= WHOLE_KM_MAX:
        code = KM_CODE_OFFSET + floor(km)
    elif km < WHOLE_KM_MAX + COARSE_STEP_KM:
        code = WHOLE_KM_MAX_CODE
    elif km <= COARSE_MAX_KM:
        code = WHOLE_KM_MAX_CODE + floor((km - WHOLE_KM_MAX) / COARSE_STEP_KM)
    else:
        code = OVER_70KM_CODE
    return f"{code:02d}"


def saturation_vapour_pressure_hpa(celsius: float) -> float:
    """Magnus formula over water."""
    return MAGNUS_A * exp(MAGNUS_B * celsius / (MAGNUS_C + celsius))


def dew_point_from_vapour_pressure(vapour_pressure_hpa: float) -> float:
    ratio = log(vapour_pressure_hpa / MAGNUS_A)
    return MAGNUS_C * ratio / (MAGNUS_B - ratio)


def vapour_pressure_from_wet_bulb(
    dry_c: float, wet_c: float, pressure_hpa: float
) -> float:
    coefficient = PSYCHROMETER_A * (1 + PSYCHROMETER_TW_FACTOR * wet_c)
    return saturation_vapour_pressure_hpa(wet_c) - coefficient * pressure_hpa * (
        dry_c - wet_c
    )


def relative_humidity_percent(dry_c: float, vapour_pressure_hpa: float) -> int:
    ratio = vapour_pressure_hpa / saturation_vapour_pressure_hpa(dry_c)
    # Half rounds up, like the screen's Math.round.
    return max(0, min(MAX_PERCENT, floor(ratio * 100 + 0.5)))


def _tenths(group: str | None) -> float | None:
    """TTT or snTTT (sign digit 0 or 1) in tenths of a degree to degrees."""
    value = (group or "").strip()
    if not value.isdigit() or len(value) not in (THREE_DIGITS, FOUR_DIGITS):
        return None
    negative = False
    if len(value) == FOUR_DIGITS:
        if value[0] not in "01":
            return None
        negative = value[0] == "1"
    degrees = int(value[-3:]) / 10
    return -degrees if negative else degrees


def temperature_group(celsius: float) -> str:
    """snTTT (four digits) for a temperature in degrees; rounds half away from zero."""
    tenths = floor(abs(celsius) * 10 + 0.5)
    sign = "1" if celsius < 0 and tenths > 0 else "0"
    return f"{sign}{tenths:03d}"


def _station_pressure_hpa(group: str | None) -> float | None:
    value = (group or "").strip()
    if not value.isdigit() or len(value) != FOUR_DIGITS:
        return None
    number = int(value)
    hpa = number / 10 + (0 if number >= BAROMETER_REFERENCE_CODE else 1000)
    low, high = PRESSURE_RANGE_HPA
    return hpa if low <= hpa <= high else None


def humidity_from_workbook(
    values: Mapping[str, Any],
) -> tuple[float, float, int] | None:
    """(dew point C, vapour pressure hPa, relative humidity %) from dry and wet bulb.

    None when a source is missing or unusable (no keyed station pressure, wet bulb
    above the dry bulb, or a vapour pressure that is not positive).
    """
    dry = _tenths(values.get("air_temp"))
    wet = _tenths(values.get("wet_bulb"))
    pressure = _station_pressure_hpa(values.get("station_pressure"))
    if dry is None or wet is None or pressure is None or wet > dry:
        return None
    vapour = vapour_pressure_from_wet_bulb(dry, wet, pressure)
    if vapour <= 0:
        return None
    dew = min(dew_point_from_vapour_pressure(vapour), dry)
    return dew, vapour, relative_humidity_percent(dry, vapour)


@dataclass(frozen=True)
class PressureSettings:
    """A station's fixed pressure amounts in hPa; None while not supplied."""

    total_correction_hpa: float | None = None
    qfe_offset_hpa: float | None = None
    sea_level_offset_hpa: float | None = None
    qnh_offset_hpa: float | None = None


@dataclass(frozen=True)
class Pressures:
    """Pressures in hPa (exact tenths); None where a source or amount is missing."""

    station_hpa: Decimal | None
    sea_level_hpa: Decimal | None
    qfe_hpa: Decimal | None
    qnh_hpa: Decimal | None
    # What the rule gives, for comparing with keyed groups.
    station_from_barometer_hpa: Decimal | None
    sea_level_from_station_hpa: Decimal | None


BAROMETER_MIN_HPA = Decimal(500)
BAROMETER_MAX_HPA = Decimal(1100)
TENTH = Decimal("0.1")


def _amount(value: float | None) -> Decimal | None:
    return None if value is None else Decimal(str(value))


def parse_barometer(text: str | None) -> Decimal | None:
    """Barometer as read in hPa (one decimal), or None when blank or not a reading."""
    value = (text or "").strip()
    if BAROMETER_FORMAT.fullmatch(value) is None:
        return None
    hpa = Decimal(value)
    return hpa if BAROMETER_MIN_HPA <= hpa <= BAROMETER_MAX_HPA else None


def _group_hpa(group: str | None) -> Decimal | None:
    """A four-digit tenths group with the thousands omitted (3P0P0P0P0, 4PPPP)."""
    value = (group or "").strip()
    if not value.isdigit() or len(value) != FOUR_DIGITS:
        return None
    number = int(value)
    hpa = Decimal(number) / 10 + (0 if number >= BAROMETER_REFERENCE_CODE else 1000)
    return hpa


def pressure_group(hpa: Decimal) -> str:
    """Four digits in tenths of hPa with the thousands omitted (1012.8 -> 0128)."""
    tenths = int((hpa / TENTH).to_integral_value(rounding="ROUND_HALF_UP"))
    return f"{tenths % 10000:04d}"


def _plus(base: Decimal | None, amount: Decimal | None) -> Decimal | None:
    return None if base is None or amount is None else base + amount


def pressures(
    values: Mapping[str, Any], settings: PressureSettings | None
) -> Pressures:
    """Station, sea level, QFE and QNH from the barometer, keyed groups and amounts.

    A keyed group 3 or 4 wins over the rule (the observer's figure is what is
    sent); the rule fills in a group that is blank.
    """
    amounts = settings or PressureSettings()
    reading = parse_barometer(values.get("barometer_reading"))
    from_barometer = _plus(reading, _amount(amounts.total_correction_hpa))
    station = _group_hpa(values.get("station_pressure")) or from_barometer
    from_station = _plus(station, _amount(amounts.sea_level_offset_hpa))
    sea_level = _group_hpa(values.get("msl_pressure")) or from_station
    return Pressures(
        station_hpa=station,
        sea_level_hpa=sea_level,
        qfe_hpa=_plus(station, _amount(amounts.qfe_offset_hpa)),
        qnh_hpa=_plus(sea_level, _amount(amounts.qnh_offset_hpa)),
        station_from_barometer_hpa=from_barometer,
        sea_level_from_station_hpa=from_station,
    )


def pressure_fields(
    values: Mapping[str, Any], settings: PressureSettings | None
) -> dict[str, str]:
    """Groups 3 and 4 the rule fills in, only where the observer left them blank."""
    found = pressures(values, settings)
    derived: dict[str, str] = {}
    blank_station = (values.get("station_pressure") or "").strip() == ""
    if blank_station and found.station_from_barometer_hpa is not None:
        derived["station_pressure"] = pressure_group(found.station_from_barometer_hpa)
    blank_sea = (values.get("msl_pressure") or "").strip() == ""
    if blank_sea and found.sea_level_from_station_hpa is not None:
        derived["msl_pressure"] = pressure_group(found.sea_level_from_station_hpa)
    return derived


def pressure_mismatches(
    values: Mapping[str, Any], settings: PressureSettings | None
) -> list[tuple[str, str, str]]:
    """(field, code, message) for a keyed group 3 or 4 that differs from the rule."""
    if settings is None:
        return []
    found = pressures(values, settings)
    issues: list[tuple[str, str, str]] = []
    keyed_station = _group_hpa(values.get("station_pressure"))
    expected = found.station_from_barometer_hpa
    if keyed_station is not None and expected is not None and keyed_station != expected:
        issues.append(
            (
                "station_pressure",
                "station_pressure_mismatch",
                f"Station pressure {keyed_station} hPa differs from the barometer as "
                f"read plus the total correction ({expected} hPa).",
            )
        )
    keyed_sea = _group_hpa(values.get("msl_pressure"))
    expected_sea = found.sea_level_from_station_hpa
    if keyed_sea is not None and expected_sea is not None and keyed_sea != expected_sea:
        issues.append(
            (
                "msl_pressure",
                "sea_level_mismatch",
                f"Mean sea level pressure {keyed_sea} hPa differs from the station "
                f"pressure plus the station's sea level amount ({expected_sea} hPa).",
            )
        )
    return issues


def derived_fields(
    values: Mapping[str, Any], settings: PressureSettings | None = None
) -> dict[str, str]:
    """The coded fields the register calculates; only those whose sources are usable.

    Pressures first: the humidity calculation uses the station pressure.
    """
    derived = pressure_fields(values, settings)
    merged = {**values, **derived}
    km = parse_visibility_km(merged.get("visibility_km"))
    if km is not None:
        derived["visibility"] = visibility_code_from_km(km)
    humidity = humidity_from_workbook(merged)
    if humidity is not None:
        dew, _vapour, percent = humidity
        derived["dew_point"] = temperature_group(dew)
        derived["relative_humidity"] = str(percent)
    return derived


def apply_to_workbook(
    workbook: SynopWorkbook, settings: PressureSettings | None = None
) -> SynopWorkbook:
    """A copy of the workbook with the calculated fields filled in."""
    updates = derived_fields(workbook.model_dump(), settings)
    return workbook.model_copy(update=updates) if updates else workbook


def apply_to_body(
    body: dict[str, Any], settings: PressureSettings | None = None
) -> dict[str, Any]:
    """A stored body (flat, or nested under ``workbook``) with the calculated fields."""
    nested = body.get("workbook")
    values = nested if isinstance(nested, dict) else body
    updates = derived_fields(values, settings)
    if not updates:
        return body
    if isinstance(nested, dict):
        return {**body, "workbook": {**nested, **updates}}
    return {**body, **updates}
