"""Tide table parsing (pure). The fixture is synthetic: no owner data in git."""

from datetime import date, datetime, timedelta
from decimal import Decimal

import pytest

from src.almanac.tides import (
    TideRow,
    TideTableError,
    parse_tide_csv,
    summarize_tides,
    to_ast,
)

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


def _events(*times_and_types: tuple[str, str]) -> list[TideRow]:
    return parse_tide_csv(
        _csv(
            *(
                _row(event_type=kind, time_utc=f"{time} UTC")
                for time, kind in times_and_types
            )
        ),
        station_key="pric",
        source_version="v1.5",
    )


def _alternating(
    start: datetime, count: int, step_hours: float = 6.2
) -> list[tuple[str, str]]:
    return [
        (
            (start + timedelta(hours=step_hours * index)).strftime("%Y-%m-%d %H:%M"),
            "LOW" if index % 2 == 0 else "HIGH",
        )
        for index in range(count)
    ]


def test_summary_reports_counts_range_and_months_in_ast() -> None:
    # 05:00 UTC is 01:00 AST; eight events span 31 January and 1 February AST.
    rows = _events(*_alternating(datetime(2027, 1, 31, 5, 0), 8))
    summary = summarize_tides(
        rows, expect_from=date(2027, 1, 31), expect_to=date(2027, 2, 1)
    )
    assert summary.ok, summary.errors
    assert summary.count == 8
    assert (summary.highs, summary.lows) == (4, 4)
    assert summary.first.time_utc == datetime(2027, 1, 31, 5, 0)
    assert summary.first_date_ast == date(2027, 1, 31)
    assert summary.last_date_ast == date(2027, 2, 1)
    assert summary.per_month_ast == {"2027-01": 4, "2027-02": 4}
    assert summary.same_type_neighbours == 0


def test_summary_uses_ast_dates_at_the_year_boundary() -> None:
    # 02:25 UTC on 1 January is still 31 December in Grenada.
    rows = _events(("2027-01-01 02:25", "HIGH"))
    summary = summarize_tides(rows)
    assert summary.first_date_ast == date(2026, 12, 31)
    assert to_ast(rows[0].time_utc).hour == 22


def test_summary_flags_gaps_and_dates_without_events() -> None:
    rows = _events(
        ("2027-03-01 06:00", "LOW"),
        ("2027-03-01 12:00", "HIGH"),
        ("2027-03-03 06:00", "LOW"),
    )
    summary = summarize_tides(rows)
    assert not summary.ok
    assert len(summary.gaps) == 1
    assert summary.gaps[0].hours == pytest.approx(42)
    assert summary.missing_dates_ast == [date(2027, 3, 2)]


def test_summary_flags_one_skipped_event() -> None:
    # Normal spacing is about 6.2 hours; dropping one event leaves about 12.4.
    events = _alternating(datetime(2027, 3, 1, 5, 0), 10)
    del events[4]
    summary = summarize_tides(_events(*events))
    assert not summary.ok
    assert len(summary.gaps) == 1
    assert summary.gaps[0].hours == pytest.approx(12.4)


def test_summary_accepts_the_longest_normal_spacing() -> None:
    events = _alternating(datetime(2027, 3, 1, 5, 0), 8, step_hours=9.3)
    assert summarize_tides(_events(*events)).gaps == []


def test_summary_flags_duplicates_and_disorder() -> None:
    rows = _events(
        ("2027-03-01 12:00", "HIGH"),
        ("2027-03-01 06:00", "LOW"),
        ("2027-03-01 06:00", "LOW"),
    )
    summary = summarize_tides(rows)
    assert summary.duplicate_times == [datetime(2027, 3, 1, 6, 0)]
    assert summary.out_of_order == 1
    assert any("duplicate" in error for error in summary.errors)
    assert any("order" in error for error in summary.errors)


def test_summary_requires_expected_coverage() -> None:
    rows = _events(*_alternating(datetime(2027, 1, 2, 5, 0), 4))
    summary = summarize_tides(
        rows, expect_from=date(2027, 1, 1), expect_to=date(2027, 12, 31)
    )
    assert any("starts 2027-01-02" in error for error in summary.errors)
    assert any("ends 2027-01-02" in error for error in summary.errors)


def test_same_type_neighbours_are_counted_but_allowed() -> None:
    rows = _events(
        ("2027-03-01 06:00", "LOW"),
        ("2027-03-01 12:00", "HIGH"),
        ("2027-03-01 12:45", "HIGH"),
        ("2027-03-01 18:00", "LOW"),
    )
    summary = summarize_tides(rows)
    assert summary.ok
    assert summary.same_type_neighbours == 1


def test_summary_of_nothing_is_an_error() -> None:
    with pytest.raises(TideTableError, match="no rows"):
        summarize_tides([])
