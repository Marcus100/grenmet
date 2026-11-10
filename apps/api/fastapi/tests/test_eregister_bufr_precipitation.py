"""BUFR precipitation (CSV column ``precipitation`` -> descriptor #3#) and tolerance edges.

Golden values come from the 6RRRtR group as keyed on the register: 012 is 1.2 mm over one
hour, 000 is no rain, 990 is trace (stored as -0.1 mm, as the CSV carries it).
"""

from datetime import UTC, datetime
from typing import Any

import pytest

from src.eregister import bufr, derive, encode, rules

OBSERVED = datetime(2026, 3, 30, 12, 0, tzinfo=UTC)
STATION_78958 = derive.PressureSettings(
    total_correction_hpa=0.0,
    qfe_offset_hpa=0.3,
    sea_level_offset_hpa=1.0,
    qnh_offset_hpa=0.1,
)
CALM: dict[str, Any] = {
    "report_type": "AAXX",
    "day": "30",
    "time_utc": "12",
    "station_id": "78958",
    "wind_indicator": "4",
    "precip_indicator": "1",
    "station_wx_indicator": "1",
    "visibility": "50",
    "total_cloud": "0",
    "wind_dir": "00",
    "wind_speed": "00",
    "air_temp": "254",
    "dew_point": "213",
    "station_pressure": "0153",
    "msl_pressure": "0163",
    "present_wx": "00",
    "source": "eregister-workbook",
}


def convert(body: dict[str, Any]) -> dict[str, Any]:
    workbook = encode.workbook_from_body(body)
    _issues, decoded = rules.validate_synop(
        workbook, STATION_78958, None, recompute=False
    )
    row = encode.wis2_row(workbook, decoded, OBSERVED, bufr.wis2box_settings)
    return bufr.decode(bufr.to_bufr(encode.wis2_csv(row)))


@pytest.mark.parametrize(
    ("amount", "expected"),
    [("012", 12.0), ("000", 0.0), ("990", -0.1), ("991", 0.1)],
    ids=["rain", "no-rain", "trace", "tenth-of-a-millimetre"],
)
def test_precipitation_reads_back_from_descriptor_three(
    amount: str, expected: float
) -> None:
    values = convert({**CALM, "precip_amount": amount, "precip_period": "1"})
    assert values[bufr.PRECIPITATION_KEY] == pytest.approx(expected, abs=0.05)


@pytest.mark.parametrize("amount", ["012", "000", "990", "991"])
def test_precipitation_golden_records_are_valid(amount: str) -> None:
    record = bufr.record_for_row(
        body={**CALM, "precip_amount": amount, "precip_period": "1"},
        station=STATION_78958,
        observed_at=OBSERVED,
    )
    assert record["valid"] is True, record["errors"]
    checks = {check["name"]: check for check in record["checks"]}
    assert checks["precipitation_kg_m2"]["ok"] is True


def test_wind_speed_at_exactly_half_a_step_passes() -> None:
    # The BUFR resolution is 0.1 m/s; half a step (0.05) is the largest honest difference.
    check = bufr._numeric(
        "wind_speed_ms",
        "windSpeed",
        6.2,
        {"windSpeed": 6.25},
        bufr.WIND_SPEED_TOLERANCE_MS,
    )
    assert check.ok is True


def test_wind_speed_one_full_step_away_fails() -> None:
    check = bufr._numeric(
        "wind_speed_ms",
        "windSpeed",
        6.2,
        {"windSpeed": 6.3},
        bufr.WIND_SPEED_TOLERANCE_MS,
    )
    assert check.ok is False
