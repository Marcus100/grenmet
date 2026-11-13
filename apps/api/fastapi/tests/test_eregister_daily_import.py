"""The observers' values import: rainfall, extremes and gust, and where they are stored.

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
DRAFT = {"state": "draft", "notes": cl1_import.IMPORT_NOTE_PREFIX}


def row(local_time: str = "2026-10-05 08:00", **cells: str) -> daily_import.RowReport:
    return daily_import.convert_row(2, {"local_time": local_time, **cells})


def codes(report: daily_import.RowReport) -> dict[str, str]:
    return {issue.field: issue.code for issue in report.issues}


def live(**body: str) -> daily_import.LiveRow:
    return daily_import.LiveRow(
        state=DRAFT["state"],
        notes=DRAFT["notes"],
        review_outcome=None,
        body={"wind_indicator": "4", "air_temp": "302", **body},
    )


def test_the_template_needs_a_time_and_at_least_one_value_column() -> None:
    with pytest.raises(daily_import.DailyFormatError):
        daily_import.read_daily("")
    with pytest.raises(daily_import.DailyFormatError):
        daily_import.read_daily("local_time,notes\n2026-10-01 08:00,hello\n")
    with pytest.raises(daily_import.DailyFormatError):
        daily_import.read_daily("rainfall_24h_mm\n1.0\n")


def test_rows_are_read_by_column_name_and_blank_rows_are_skipped() -> None:
    rows = daily_import.read_daily(
        "﻿Local_Time, Rainfall_24h_mm ,extra\n2026-10-01 08:00, 1.2 \n,,\n"
        "2026-10-02 08:00\n"
    )
    assert rows == [
        (
            2,
            {
                "local_time": "2026-10-01 08:00",
                "rainfall_24h_mm": "1.2",
                "extra": "",
            },
        ),
        (4, {"local_time": "2026-10-02 08:00", "rainfall_24h_mm": "", "extra": ""}),
    ]


def test_rainfall_goes_to_the_12_utc_entry_in_tenths_of_a_millimetre() -> None:
    report = row(rainfall_24h_mm="12.3")
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
    assert row(rainfall_24h_mm=cell).fields[NOON]["s3_rainfall_24h"] == code


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
    report = row(rainfall_24h_mm=cell)
    assert report.status == "blocked"
    assert report.fields == {}
    assert codes(report) == {"s3_rainfall_24h": code}


@pytest.mark.parametrize(
    "time", ["2026-10-05 02:00", "2026-10-05 09:00", "2026-10-05 14:00"]
)
def test_rainfall_on_a_row_other_than_8am_is_refused_not_moved(time: str) -> None:
    report = row(time, rainfall_24h_mm="5.0")
    assert report.status == "blocked"
    assert codes(report) == {"s3_rainfall_24h": "reading_time"}
    assert report.fields == {}


def test_a_very_wet_day_is_saved_with_a_warning() -> None:
    report = row(rainfall_24h_mm="310.0")
    assert report.status == "ready"
    assert codes(report) == {"s3_rainfall_24h": "very_wet_day"}


@pytest.mark.parametrize(
    ("local", "utc"),
    [
        ("2026-10-04 20:00", datetime(2026, 10, 5, 0, tzinfo=UTC)),
        ("2026-10-05 02:00", datetime(2026, 10, 5, 6, tzinfo=UTC)),
        ("2026-10-05 08:00", NOON),
        ("2026-10-05 14:00", datetime(2026, 10, 5, 18, tzinfo=UTC)),
    ],
)
def test_extremes_go_to_the_entry_of_that_main_hour(local: str, utc: datetime) -> None:
    report = row(local, highest_temp_c="31.2", lowest_temp_c="23.9")
    assert report.fields == {utc: {"s3_max_temp": "0312", "s3_min_temp": "0239"}}
    assert (report.max_c, report.min_c) == (Decimal("31.2"), Decimal("23.9"))


def test_extremes_on_a_row_that_is_not_a_main_hour_are_refused() -> None:
    report = row("2026-10-05 10:00", highest_temp_c="31.2")
    assert report.status == "blocked"
    assert codes(report) == {"s3_max_temp": "reading_time"}


def test_a_row_can_carry_rainfall_and_extremes_together() -> None:
    report = row(rainfall_24h_mm="1.0", highest_temp_c="30.0", lowest_temp_c="24.0")
    assert report.fields == {
        NOON: {
            "s3_rainfall_24h": "0010",
            "s3_max_temp": "0300",
            "s3_min_temp": "0240",
        }
    }


def test_a_negative_temperature_uses_the_sign_digit() -> None:
    report = row(lowest_temp_c="-1.5")
    assert report.fields[NOON]["s3_min_temp"] == "1015"
    assert codes(report) == {"s3_min_temp": "unusual_temperature"}


def test_highest_below_lowest_blocks_the_row() -> None:
    report = row(highest_temp_c="22.0", lowest_temp_c="25.0")
    assert report.status == "blocked"
    assert codes(report) == {"s3_max_temp": "max_below_min"}


def test_temperatures_with_too_many_decimals_text_or_impossible_are_refused() -> None:
    assert codes(row(highest_temp_c="31.25")) == {"s3_max_temp": "too_precise"}
    assert codes(row(lowest_temp_c="warm")) == {"s3_min_temp": "unreadable_cell"}
    assert codes(row(highest_temp_c="75")) == {"s3_max_temp": "out_of_range"}


def test_an_unusual_temperature_is_a_warning_only() -> None:
    report = row(highest_temp_c="45.0")
    assert report.status == "ready"
    assert codes(report) == {"s3_max_temp": "unusual_temperature"}


def test_a_gust_goes_to_the_observation_at_or_after_it() -> None:
    on_the_hour = row(
        "", strongest_gust_kt="28", gust_time_local="2026-10-05 14:00"
    ).gusts
    assert on_the_hour == {datetime(2026, 10, 5, 18, tzinfo=UTC): 28}
    after = row("", strongest_gust_kt="28", gust_time_local="2026-10-05 14:20").gusts
    assert after == {datetime(2026, 10, 5, 19, tzinfo=UTC): 28}


def test_a_gust_late_in_the_evening_reaches_the_next_utc_day() -> None:
    gusts = row("", strongest_gust_kt="31", gust_time_local="2026-10-05 23:30").gusts
    assert gusts == {datetime(2026, 10, 6, 4, tzinfo=UTC): 31}


def test_a_gust_needs_a_whole_number_and_a_dated_time() -> None:
    assert codes(row("", strongest_gust_kt="28")) == {"gust_time_local": "gust_time"}
    assert codes(row("", strongest_gust_kt="28", gust_time_local="14:20")) == {
        "gust_time_local": "gust_time"
    }
    assert codes(
        row("", strongest_gust_kt="28.5", gust_time_local="2026-10-05 14:00")
    ) == {"wind_gust": "unreadable_cell"}


def test_a_row_with_nothing_to_save_is_empty_and_a_bad_time_is_unreadable() -> None:
    assert row(notes="calm day").status == "empty"
    assert row("5/10/2026 8am").status == "unreadable"


def test_the_same_time_twice_blocks_both_rows() -> None:
    rows = [
        (2, {"local_time": "2026-10-05 08:00", "rainfall_24h_mm": "1.0"}),
        (3, {"local_time": "2026-10-05 08:00", "rainfall_24h_mm": "2.0"}),
        (4, {"local_time": "2026-10-06 08:00", "rainfall_24h_mm": "3.0"}),
    ]
    reports = daily_import.check_rows(rows)
    assert [r.status for r in reports] == ["blocked", "blocked", "ready"]
    assert codes(reports[0]) == {"local_time": "duplicate_time"}


def test_a_time_zone_other_than_grenadas_moves_the_entry() -> None:
    report = daily_import.convert_row(
        2,
        {"local_time": "2026-10-05 07:00", "rainfall_24h_mm": "1.0"},
        utc_offset_hours=5,
    )
    assert list(report.fields) == [NOON]


def test_dry_bulb_readings_outside_the_extremes_are_warned_about() -> None:
    report = row("2026-10-05 14:00", highest_temp_c="30.0", lowest_temp_c="24.0")
    air = {
        datetime(2026, 10, 5, 13, tzinfo=UTC): 28.0,  # inside the six hours
        datetime(2026, 10, 5, 15, tzinfo=UTC): 31.0,  # above the highest
        datetime(2026, 10, 5, 17, tzinfo=UTC): 23.0,  # below the lowest
        datetime(2026, 10, 5, 10, tzinfo=UTC): 40.0,  # before the window: ignored
    }
    daily_import.check_against_hourly(report, air, utc_offset_hours=4)
    assert codes(report) == {
        "s3_max_temp": "air_above_max",
        "s3_min_temp": "air_below_min",
    }
    assert report.errors == []
    clean = row("2026-10-05 14:00", highest_temp_c="32.0", lowest_temp_c="22.0")
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
    report = row(rainfall_24h_mm="12.3", highest_temp_c="31.2")
    (plan,) = daily_import.plan_merge([report], {NOON: live()})
    assert plan.action == "update"
    assert plan.added == {"s3_rainfall_24h": "0123", "s3_max_temp": "0312"}
    assert plan.body is not None
    assert plan.body["air_temp"] == "302"  # everything else kept
    assert plan.body["s3_max_temp"] == "0312"


def test_a_gust_is_coded_with_the_entrys_unit_when_merged() -> None:
    report = row("", strongest_gust_kt="28", gust_time_local="2026-10-05 14:00")
    at = next(iter(report.gusts))
    (plan,) = daily_import.plan_merge([report], {at: live()})
    assert plan.added == {"wind_gust": "28"}
    (metric,) = daily_import.plan_merge([report], {at: live(wind_indicator="1")})
    assert metric.added == {"wind_gust": "14"}
    (unknown,) = daily_import.plan_merge([report], {at: live(wind_indicator="")})
    assert unknown.action == "skip" and "wind indicator" in unknown.reason


def test_a_gust_below_the_mean_wind_is_listed_as_a_warning() -> None:
    report = row("", strongest_gust_kt="10", gust_time_local="2026-10-05 14:00")
    at = next(iter(report.gusts))
    (plan,) = daily_import.plan_merge([report], {at: live(wind_speed="15")})
    assert plan.action == "update"
    assert len(plan.warnings) == 1 and "below the mean wind" in plan.warnings[0]


def test_a_gust_already_in_the_910_group_is_not_sent_twice() -> None:
    report = row("", strongest_gust_kt="28", gust_time_local="2026-10-05 14:00")
    at = next(iter(report.gusts))
    (plan,) = daily_import.plan_merge(
        [report], {at: live(s3_special_phenomena="91028")}
    )
    assert plan.action == "skip" and "910 group" in plan.reason


def test_values_already_there_are_kept_and_never_replaced() -> None:
    report = row(rainfall_24h_mm="12.3")
    (same,) = daily_import.plan_merge([report], {NOON: live(s3_rainfall_24h="0123")})
    assert same.action == "unchanged" and same.body is None
    (different,) = daily_import.plan_merge(
        [report], {NOON: live(s3_rainfall_24h="0050")}
    )
    assert different.action == "skip"
    assert "already has a different value" in different.reason


@pytest.mark.parametrize(
    "existing",
    [
        daily_import.LiveRow("draft", "typed by an observer", None, {}),
        daily_import.LiveRow("accepted", cl1_import.IMPORT_NOTE_PREFIX, None, {}),
        daily_import.LiveRow("draft", cl1_import.IMPORT_NOTE_PREFIX, "accept", {}),
    ],
)
def test_only_an_unreviewed_imported_draft_is_ever_changed(
    existing: daily_import.LiveRow,
) -> None:
    (plan,) = daily_import.plan_merge([row(rainfall_24h_mm="1.0")], {NOON: existing})
    assert plan.action == "skip" and plan.body is None


def test_an_hour_with_no_entry_is_listed_not_created() -> None:
    (plan,) = daily_import.plan_merge([row(rainfall_24h_mm="1.0")], {})
    assert plan.action == "skip"
    assert plan.reason == "no hourly entry for that hour in the register"


def test_a_blocked_row_contributes_nothing() -> None:
    report = row(rainfall_24h_mm="1.25")
    assert daily_import.plan_merge([report], {NOON: live()}) == []


def test_two_gusts_for_one_observation_are_not_guessed_between() -> None:
    first = daily_import.convert_row(
        2, {"strongest_gust_kt": "20", "gust_time_local": "2026-10-04 23:30"}
    )
    second = daily_import.convert_row(
        3, {"strongest_gust_kt": "25", "gust_time_local": "2026-10-05 00:00"}
    )
    at = datetime(2026, 10, 5, 4, tzinfo=UTC)
    (plan,) = daily_import.plan_merge([first, second], {at: live()})
    assert plan.action == "skip"
    assert "different values" in plan.reason


def test_a_fresh_plan_for_the_same_hour_agrees_with_the_first() -> None:
    # The script plans again just before saving; the result must not depend on history.
    report = row(rainfall_24h_mm="12.3")
    (plan,) = daily_import.plan_merge([report], {NOON: live()})
    again = daily_import.plan_hour(
        daily_import.Planned(NOON, [2], "skip"), plan.wanted, live()
    )
    assert again.action == "update" and again.body == plan.body
    reviewed = daily_import.LiveRow("draft", DRAFT["notes"], "accept", {})
    stale = daily_import.plan_hour(
        daily_import.Planned(NOON, [2], "skip"), plan.wanted, reviewed
    )
    assert stale.action == "skip"


def test_a_refresh_of_the_hourly_import_keeps_the_daily_values() -> None:
    fresh = {"air_temp": "302", "wind_indicator": "4"}
    live_body = {
        "air_temp": "299",
        "wind_indicator": "4",
        "s3_rainfall_24h": "0123",
        "s3_max_temp": "0312",
        "wind_gust": "28",
    }
    assert cl1_import.carry_over(fresh, live_body) == {
        **fresh,
        "s3_rainfall_24h": "0123",
        "s3_max_temp": "0312",
        "wind_gust": "28",
    }
    # A value the sheet itself provides wins.
    assert cl1_import.carry_over({"wind_gust": "30"}, {"wind_gust": "28"}) == {
        "wind_gust": "30"
    }


def test_a_gust_is_dropped_when_the_refresh_changes_the_wind_unit() -> None:
    kept = cl1_import.carry_over(
        {"wind_indicator": "1"},
        {"wind_indicator": "4", "wind_gust": "28", "s3_max_temp": "0312"},
    )
    assert kept == {"wind_indicator": "1", "s3_max_temp": "0312"}


async def test_values_are_saved_into_the_draft_through_the_api(
    send_client: tuple[httpx.AsyncClient, User],
) -> None:
    register_client, _user = send_client
    (hour,) = hourly.check([hourly.cells(c2=5, c3=8)])  # 08:00 local on the 5th
    assert hour.status == "ready" and hour.observed_at == NOON and hour.workbook
    record = {
        "station_id": cl1_import.STATION_ID,
        "kind": "SYNOP",
        "observed_at": NOON.isoformat(),
        "body": hour.workbook.model_dump(exclude_none=True),
    }
    first = await register_client.post("/api/v1/eregister/observations", json=record)
    assert first.status_code == 201, first.text

    report = row(rainfall_24h_mm="12.3", highest_temp_c="31.2", lowest_temp_c="23.9")
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
