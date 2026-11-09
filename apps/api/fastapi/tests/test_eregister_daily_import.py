"""The daily values import: rainfall, extremes and gust, and where they are stored.

Values are made up for the tests; the real files hold observations and stay out of the
repository.
"""

from datetime import UTC, datetime
from decimal import Decimal

import httpx
import pytest

from src.auth.models import User
from src.eregister import cl1_import, daily_import
from tests import test_eregister_cl1_import as hourly
from tests import test_eregister_send

send_client = test_eregister_send.send_client

NOON = datetime(2026, 10, 5, 12, tzinfo=UTC)  # 08:00 local on the 5th


def day(**cells: str) -> daily_import.DayReport:
    return daily_import.convert_day(2, {"date": "2026-10-05", **cells})


def codes(report: daily_import.DayReport) -> dict[str, str]:
    return {issue.field: issue.code for issue in report.issues}


def live(**body: str) -> daily_import.LiveRow:
    return daily_import.LiveRow(
        state=str(body.pop("state", "draft")),
        notes=str(body.pop("notes", cl1_import.IMPORT_NOTE_PREFIX)),
        review_outcome=None,
        body={"wind_indicator": "4", "air_temp": "302", **body},
    )


def test_the_template_needs_a_date_and_at_least_one_value_column() -> None:
    with pytest.raises(daily_import.DailyFormatError):
        daily_import.read_daily("")
    with pytest.raises(daily_import.DailyFormatError):
        daily_import.read_daily("date,notes\n2026-10-01,hello\n")
    with pytest.raises(daily_import.DailyFormatError):
        daily_import.read_daily("rainfall_24h_mm\n1.0\n")


def test_rows_are_read_by_column_name_and_blank_rows_are_skipped() -> None:
    rows = daily_import.read_daily(
        "﻿Date, Rainfall_24h_mm ,extra\n2026-10-01, 1.2 \n,,\n2026-10-02\n"
    )
    assert rows == [
        (2, {"date": "2026-10-01", "rainfall_24h_mm": "1.2", "extra": ""}),
        (4, {"date": "2026-10-02", "rainfall_24h_mm": "", "extra": ""}),
    ]


def test_rainfall_goes_to_the_12_utc_entry_in_tenths_of_a_millimetre() -> None:
    report = day(rainfall_24h_mm="12.3", rain_reading_time_local="08:00")
    assert report.status == "ready"
    assert report.fields == {NOON: {"s3_rainfall_24h": "0123"}}
    assert report.issues == []


@pytest.mark.parametrize(
    ("cell", "code"),
    [
        ("0", "0000"),
        ("T", "9999"),
        ("trace", "9999"),
        ("0.1", "0001"),
        ("999.8", "9998"),
    ],
)
def test_dry_days_trace_and_the_largest_value_are_coded(cell: str, code: str) -> None:
    report = day(rainfall_24h_mm=cell, rain_reading_time_local="08:00")
    assert report.fields[NOON]["s3_rainfall_24h"] == code


@pytest.mark.parametrize(
    ("cell", "code"),
    [
        ("1.25", "too_precise"),
        ("-1", "unreadable_cell"),
        ("abc", "unreadable_cell"),
        ("999.9", "out_of_range"),
    ],
)
def test_unusable_rainfall_blocks_the_row(cell: str, code: str) -> None:
    report = day(rainfall_24h_mm=cell, rain_reading_time_local="08:00")
    assert report.status == "blocked"
    assert report.fields == {}
    assert codes(report) == {"s3_rainfall_24h": code}


def test_a_gauge_read_at_another_time_is_refused_not_moved() -> None:
    report = day(rainfall_24h_mm="5.0", rain_reading_time_local="09:00")
    assert report.status == "blocked"
    assert codes(report) == {"rain_reading_time_local": "reading_time"}
    assert report.fields == {}


def test_a_missing_reading_time_is_assumed_and_warned() -> None:
    report = day(rainfall_24h_mm="5.0")
    assert report.status == "ready"
    assert codes(report) == {"rain_reading_time_local": "reading_time_assumed"}
    assert report.errors == []
    assert report.fields == {NOON: {"s3_rainfall_24h": "0050"}}


def test_a_very_wet_day_is_saved_with_a_warning() -> None:
    report = day(rainfall_24h_mm="310.0", rain_reading_time_local="08:00")
    assert report.status == "ready"
    assert codes(report) == {"s3_rainfall_24h": "very_wet_day"}


def test_extremes_go_to_the_same_entry_as_four_digit_groups() -> None:
    report = day(highest_temp_c="31.2", lowest_temp_c="23.9")
    assert report.fields == {NOON: {"s3_max_temp": "0312", "s3_min_temp": "0239"}}
    assert (report.max_c, report.min_c) == (Decimal("31.2"), Decimal("23.9"))


def test_a_negative_temperature_uses_the_sign_digit() -> None:
    report = day(lowest_temp_c="-1.5")
    assert report.fields[NOON]["s3_min_temp"] == "1015"
    assert codes(report) == {"s3_min_temp": "unusual_temperature"}


def test_highest_below_lowest_blocks_the_row() -> None:
    report = day(highest_temp_c="22.0", lowest_temp_c="25.0")
    assert report.status == "blocked"
    assert codes(report) == {"s3_max_temp": "max_below_min"}


def test_temperatures_with_too_many_decimals_or_text_are_refused() -> None:
    assert codes(day(highest_temp_c="31.25")) == {"s3_max_temp": "too_precise"}
    assert codes(day(lowest_temp_c="warm")) == {"s3_min_temp": "unreadable_cell"}


def test_an_unusual_temperature_is_a_warning_only() -> None:
    report = day(highest_temp_c="45.0")
    assert report.status == "ready"
    assert codes(report) == {"s3_max_temp": "unusual_temperature"}


def test_a_gust_goes_to_the_observation_at_or_after_it() -> None:
    at = day(strongest_gust_kt="28", gust_time_local="14:00").gusts
    assert at == {datetime(2026, 10, 5, 18, tzinfo=UTC): 28}
    after = day(strongest_gust_kt="28", gust_time_local="14:20").gusts
    assert after == {datetime(2026, 10, 5, 19, tzinfo=UTC): 28}


def test_a_gust_late_in_the_evening_reaches_the_next_utc_day() -> None:
    gusts = day(strongest_gust_kt="31", gust_time_local="23:30").gusts
    assert gusts == {datetime(2026, 10, 6, 4, tzinfo=UTC): 31}


def test_a_gust_needs_a_whole_number_and_a_time() -> None:
    assert codes(day(strongest_gust_kt="28")) == {"gust_time_local": "gust_time"}
    assert codes(day(strongest_gust_kt="28", gust_time_local="soon")) == {
        "gust_time_local": "gust_time"
    }
    assert codes(day(strongest_gust_kt="28.5", gust_time_local="14:00")) == {
        "wind_gust": "unreadable_cell"
    }


def test_a_row_with_nothing_to_save_is_empty_and_a_bad_date_is_unreadable() -> None:
    assert day(notes="calm day").status == "empty"
    assert daily_import.convert_day(3, {"date": "5/10/2026"}).status == "unreadable"


def test_the_same_date_twice_blocks_both_rows() -> None:
    rows = [
        (2, {"date": "2026-10-05", "rainfall_24h_mm": "1.0"}),
        (3, {"date": "2026-10-05", "rainfall_24h_mm": "2.0"}),
        (4, {"date": "2026-10-06", "rainfall_24h_mm": "3.0"}),
    ]
    reports = daily_import.check_days(rows)
    assert [r.status for r in reports] == ["blocked", "blocked", "ready"]
    assert codes(reports[0]) == {
        "date": "duplicate_day",
        "rain_reading_time_local": "reading_time_assumed",
    }


def test_a_time_zone_other_than_grenadas_moves_the_entry() -> None:
    report = daily_import.convert_day(
        2,
        {
            "date": "2026-10-05",
            "rainfall_24h_mm": "1.0",
            "rain_reading_time_local": "07:00",
        },
        utc_offset_hours=5,
    )
    assert list(report.fields) == [NOON]


def test_dry_bulb_readings_outside_the_extremes_are_warned_about() -> None:
    report = day(highest_temp_c="30.0", lowest_temp_c="24.0")
    air = {
        datetime(2026, 10, 4, 20, tzinfo=UTC): 28.0,  # inside the window
        datetime(2026, 10, 5, 3, tzinfo=UTC): 31.0,  # above the highest
        datetime(2026, 10, 5, 9, tzinfo=UTC): 23.0,  # below the lowest
        datetime(2026, 10, 4, 12, tzinfo=UTC): 40.0,  # before the window: ignored
    }
    daily_import.check_against_hourly(report, air, utc_offset_hours=4)
    assert codes(report) == {
        "s3_max_temp": "air_above_max",
        "s3_min_temp": "air_below_min",
    }
    assert report.errors == []
    clean = day(highest_temp_c="32.0", lowest_temp_c="22.0")
    daily_import.check_against_hourly(clean, air, utc_offset_hours=4)
    assert clean.issues == []


def test_hourly_air_reads_the_coded_temperature() -> None:
    found = daily_import.hourly_air(
        {NOON: {"air_temp": "302"}, NOON.replace(hour=13): {"air_temp": "bad"}}
    )
    assert found == {NOON: 30.2}


def test_the_gust_is_coded_in_the_entrys_wind_unit() -> None:
    assert daily_import.gust_code(28, "4") == "28"
    assert daily_import.gust_code(28, "3") == "28"
    assert daily_import.gust_code(28, "1") == "14"  # m/s
    assert daily_import.gust_code(101, "4") == "101"
    assert daily_import.gust_code(5, "4") == "05"
    assert daily_import.gust_code(28, "") is None


def test_values_are_added_to_an_unreviewed_imported_draft() -> None:
    report = day(
        rainfall_24h_mm="12.3", rain_reading_time_local="08:00", highest_temp_c="31.2"
    )
    (plan,) = daily_import.plan_merge([report], {NOON: live()})
    assert plan.action == "update"
    assert plan.added == {"s3_rainfall_24h": "0123", "s3_max_temp": "0312"}
    assert plan.body is not None
    assert plan.body["air_temp"] == "302"  # everything else kept
    assert plan.body["s3_max_temp"] == "0312"


def test_a_gust_is_coded_with_the_entrys_unit_when_merged() -> None:
    report = day(strongest_gust_kt="28", gust_time_local="14:00")
    at = next(iter(report.gusts))
    (plan,) = daily_import.plan_merge([report], {at: live()})
    assert plan.added == {"wind_gust": "28"}
    (metric,) = daily_import.plan_merge([report], {at: live(wind_indicator="1")})
    assert metric.added == {"wind_gust": "14"}
    (unknown,) = daily_import.plan_merge([report], {at: live(wind_indicator="")})
    assert unknown.action == "skip" and "wind indicator" in unknown.reason


def test_values_already_there_are_kept_and_never_replaced() -> None:
    report = day(rainfall_24h_mm="12.3", rain_reading_time_local="08:00")
    (same,) = daily_import.plan_merge([report], {NOON: live(s3_rainfall_24h="0123")})
    assert same.action == "unchanged" and same.body is None
    (different,) = daily_import.plan_merge(
        [report], {NOON: live(s3_rainfall_24h="0050")}
    )
    assert different.action == "skip"
    assert "already has a different value" in different.reason


@pytest.mark.parametrize(
    "row",
    [
        daily_import.LiveRow("draft", "typed by an observer", None, {}),
        daily_import.LiveRow("accepted", cl1_import.IMPORT_NOTE_PREFIX, None, {}),
        daily_import.LiveRow("draft", cl1_import.IMPORT_NOTE_PREFIX, "accept", {}),
    ],
)
def test_only_an_unreviewed_imported_draft_is_ever_changed(
    row: daily_import.LiveRow,
) -> None:
    report = day(rainfall_24h_mm="1.0", rain_reading_time_local="08:00")
    (plan,) = daily_import.plan_merge([report], {NOON: row})
    assert plan.action == "skip" and plan.body is None


def test_an_hour_with_no_entry_is_listed_not_created() -> None:
    report = day(rainfall_24h_mm="1.0", rain_reading_time_local="08:00")
    (plan,) = daily_import.plan_merge([report], {})
    assert plan.action == "skip"
    assert plan.reason == "no hourly entry for that hour in the register"


def test_a_blocked_row_contributes_nothing() -> None:
    report = day(rainfall_24h_mm="1.25", rain_reading_time_local="08:00")
    assert daily_import.plan_merge([report], {NOON: live()}) == []


def test_two_gusts_for_one_observation_are_not_guessed_between() -> None:
    # 23:30 on the 4th and 00:00 on the 5th both belong to the 00 local observation.
    evening = daily_import.convert_day(
        2, {"date": "2026-10-04", "strongest_gust_kt": "20", "gust_time_local": "23:30"}
    )
    midnight = daily_import.convert_day(
        3, {"date": "2026-10-05", "strongest_gust_kt": "25", "gust_time_local": "00:00"}
    )
    at = datetime(2026, 10, 5, 4, tzinfo=UTC)
    (plan,) = daily_import.plan_merge([evening, midnight], {at: live()})
    assert plan.action == "skip"
    assert "different values" in plan.reason


def test_a_refresh_of_the_hourly_import_keeps_the_daily_values() -> None:
    fresh = {"air_temp": "302", "wind_indicator": "4"}
    live_body = {
        "air_temp": "299",
        "s3_rainfall_24h": "0123",
        "s3_max_temp": "0312",
        "wind_gust": "",
    }
    assert cl1_import.carry_over(fresh, live_body) == {
        **fresh,
        "s3_rainfall_24h": "0123",
        "s3_max_temp": "0312",
    }
    # A value the sheet itself provides wins.
    assert cl1_import.carry_over({"wind_gust": "30"}, {"wind_gust": "28"}) == {
        "wind_gust": "30"
    }


async def test_daily_values_are_saved_into_the_draft_through_the_api(
    send_client: tuple[httpx.AsyncClient, User],
) -> None:
    register_client, _user = send_client
    (hour,) = hourly.check([hourly.cells(c2=5, c3=8)])  # 08:00 local on the 5th
    assert hour.status == "ready" and hour.observed_at == NOON and hour.workbook
    body = hour.workbook.model_dump(exclude_none=True)
    record = {
        "station_id": cl1_import.STATION_ID,
        "kind": "SYNOP",
        "observed_at": NOON.isoformat(),
        "body": body,
    }
    first = await register_client.post("/api/v1/eregister/observations", json=record)
    assert first.status_code == 201, first.text

    report = day(
        rainfall_24h_mm="12.3",
        rain_reading_time_local="08:00",
        highest_temp_c="31.2",
        lowest_temp_c="23.9",
    )
    saved_body = first.json()["body"]
    (plan,) = daily_import.plan_merge(
        [report],
        {
            NOON: daily_import.LiveRow(
                state=first.json()["state"],
                notes=saved_body.get("notes"),
                review_outcome=first.json().get("review_outcome"),
                body=saved_body,
            )
        },
    )
    assert plan.action == "update" and plan.body is not None
    second = await register_client.post(
        "/api/v1/eregister/observations", json={**record, "body": plan.body}
    )
    assert second.status_code == 200, second.text
    stored = second.json()
    assert stored["state"] == "draft"
    assert stored["body"]["s3_rainfall_24h"] == "0123"
    assert stored["body"]["s3_max_temp"] == "0312"
    assert stored["body"]["s3_min_temp"] == "0239"
    assert stored["body"]["air_temp"] == saved_body["air_temp"]
