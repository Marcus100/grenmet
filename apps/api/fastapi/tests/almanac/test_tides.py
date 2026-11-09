"""Tide table parsing (pure). The fixture is synthetic: no owner data in git."""

from datetime import datetime
from decimal import Decimal

import pytest

from src.almanac.tides import TideTableError, parse_tide_csv

HEADER = (
    "date_ast,event_number,event_type,time_ast,time_utc,"
    "height_m_pric_radar_datum,"
    "height_m_uhslc_station_datum_provisional_crosswalk,"
    "height_m_relative_uhslc_mllw_provisional_crosswalk,"
    "status,timing_quality,minimum_adjacent_excursion_m"
)
STATUS = "PROVISIONAL_INTERNAL_NOT_FOR_NAVIGATION"


def _row(
    *,
    event_type: str = "LOW",
    time_utc: str = "2026-10-01 04:46 UTC",
    height: str = "0.02583892",
    status: str = STATUS,
) -> str:
    return ",".join(
        [
            "2026-10-01",
            "1",
            event_type,
            "2026-10-01 00:46 AST",
            time_utc,
            "1.10",
            "0.50",
            height,
            status,
            "STANDARD_MODEL_TURNING_POINT",
            "0.10",
        ]
    )


def _csv(*rows: str) -> list[str]:
    return [HEADER, *rows]


def test_parses_events_into_utc_rows_with_relative_mllw_height() -> None:
    rows = parse_tide_csv(
        _csv(
            _row(),
            _row(event_type="HIGH", time_utc="2026-10-01 10:50 UTC", height="0.8"),
        ),
        station_key="pric",
        source_version="v1.4",
    )
    assert len(rows) == 2
    first = rows[0]
    assert first.station_key == "pric"
    assert first.event_type == "LOW"
    assert first.time_utc == datetime(2026, 10, 1, 4, 46)  # naive UTC
    assert first.height_m_mllw == Decimal("0.0258")  # rounded to 4 dp
    assert first.status == STATUS
    assert first.timing_quality == "STANDARD_MODEL_TURNING_POINT"
    assert first.source_version == "v1.4"
    assert first.source_label
    assert rows[1].event_type == "HIGH"
    assert rows[1].height_m_mllw == Decimal("0.8000")


def test_rejects_unknown_event_type_with_line_number() -> None:
    with pytest.raises(TideTableError, match="line 3"):
        parse_tide_csv(
            _csv(_row(), _row(event_type="SLACK")),
            station_key="pric",
            source_version="v1.4",
        )


def test_rejects_bad_utc_timestamp() -> None:
    with pytest.raises(TideTableError, match="time_utc"):
        parse_tide_csv(
            _csv(_row(time_utc="2026-10-01T04:46Z")),
            station_key="pric",
            source_version="v1.4",
        )


def test_rejects_blank_height() -> None:
    with pytest.raises(TideTableError, match="height"):
        parse_tide_csv(_csv(_row(height="")), station_key="pric", source_version="v1.4")


def test_rejects_missing_required_columns() -> None:
    with pytest.raises(TideTableError, match="columns"):
        parse_tide_csv(
            ["date_ast,event_type,time_utc", "2026-10-01,LOW,2026-10-01 04:46 UTC"],
            station_key="pric",
            source_version="v1.4",
        )


def test_empty_file_is_an_error() -> None:
    with pytest.raises(TideTableError, match="no rows"):
        parse_tide_csv(_csv(), station_key="pric", source_version="v1.4")


def test_unknown_station_is_rejected() -> None:
    with pytest.raises(TideTableError, match="station"):
        parse_tide_csv(_csv(_row()), station_key="nowhere", source_version="v1.4")
