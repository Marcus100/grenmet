"""The hourly register sheet (CL1) import: mapping, time zone and validation.

Rows are made up for the tests; the real sheets hold observations and stay out of the
repository.
"""

import csv
import io
from datetime import UTC, datetime

import httpx
import pytest

from src.auth.models import User
from src.eregister import cl1_import, derive
from tests import test_eregister_send

AMOUNTS = derive.PressureSettings(0.0, 0.3, 1.0, 0.1)  # 78958, owner confirmed

# The API fixture with both databases, shared with the send tests.
send_client = test_eregister_send.send_client

HEADER = [
    "YEAR", "MONTH", "DAY", "HOUR (LST)", "Total cloud Amt.", "Wind indicator",
    "DIRECTION", "SPEED", "VISIBILITY", "Weather Indicator", "PRESENT WEATHER",
    "PAST WEATHER", "SEA LEVEL \nPRESSURE", "Dry Bulb", "Wet Bulb", "Vapour Pressure",
    "Relative humidity", "Dew Point", "Total amt. Nh", "Form of CL", "Form of CM",
    "Form of CH", "Amount", "Form", "Height", "Indicator", "Amount", "Form", "Height",
    "Amount", "Form", "Height", "Amount", "Form", "Height", "REMARKS", "909Spspsp",
]  # fmt: skip


def cells(**changes: object) -> list[str]:
    """A plausible daytime row (made up); ``changes`` replaces cells by column index."""
    row: list[object] = [
        2026, 10, 1, 12, 6, 4, 8, 9, 67, 1, 6, 22, 140.0000000001, 302, 268,
        290.2, 77.3, 256.4, 4, 8, 4, 3, 2, 8, 48.00000048, 8, 4, 6, 120.0000012,
        0, 0, 0, 0, 0, 0, "HZ", 0,
    ]  # fmt: skip
    for key, value in changes.items():
        row[int(key.removeprefix("c"))] = value
    return ["" if value is None else str(value) for value in row]


def check(
    rows: list[list[str]], *, utc_offset_hours: int = cl1_import.UTC_OFFSET_HOURS
) -> list[cl1_import.HourReport]:
    numbered = list(enumerate(rows, start=2))
    return cl1_import.check_sheet(numbered, AMOUNTS, utc_offset_hours=utc_offset_hours)


def errors(report: cl1_import.HourReport) -> dict[str, str]:
    return {issue.field: issue.code for issue in report.errors}


def test_a_clean_row_passes_and_is_coded_as_on_the_paper_register() -> None:
    (report,) = check([cells()])
    assert report.status == "ready"
    assert report.errors == []
    body = report.workbook.model_dump(exclude_none=True) if report.workbook else {}
    assert body["station_id"] == "78958"
    assert (body["wind_dir"], body["wind_speed"], body["visibility"]) == (
        "08",
        "09",
        "67",
    )
    assert (body["air_temp"], body["wet_bulb"], body["dew_point"]) == (
        "302",
        "268",
        "256",
    )
    assert body["msl_pressure"] == "0140"
    assert (body["past_wx_1"], body["past_wx_2"]) == ("2", "2")
    assert "row 2" in body["notes"]


def test_local_standard_time_becomes_utc_across_the_end_of_the_month() -> None:
    (report,) = check([cells(c2=31, c3=22)])
    assert report.observed_at == datetime(2026, 11, 1, 2, tzinfo=UTC)
    assert report.workbook is not None
    assert (report.workbook.day, report.workbook.time_utc) == ("01", "02")
    assert report.errors == []  # the keyed day and hour match the UTC time


def test_the_offset_is_a_parameter() -> None:
    (report,) = check([cells(c3=12)], utc_offset_hours=0)
    assert report.observed_at == datetime(2026, 10, 1, 12, tzinfo=UTC)


@pytest.mark.parametrize(
    ("sheet_value", "code"),
    [(0, "00"), (42.0000004, "14"), (54, "18"), (150, "50"), (840, "78"), (870, "79")],
)
def test_layer_heights_are_turned_back_into_register_codes(
    sheet_value: float, code: str
) -> None:
    assert cl1_import.height_code(sheet_value) == code


def test_cloud_layers_use_the_register_codes_and_empty_layers_are_left_out() -> None:
    (report,) = check([cells()])
    body = report.workbook.model_dump(exclude_none=True) if report.workbook else {}
    assert (
        body["s3_layer1_amount"],
        body["s3_layer1_form"],
        body["s3_layer1_height"],
    ) == ("2", "8", "16")
    assert body["s3_layer2_height"] == "40"
    assert "s3_layer3_amount" not in body


def test_a_row_of_zeros_is_an_hour_that_was_not_observed() -> None:
    zeros = [2026, 10, 31, 6, *([0] * 33)]
    (report,) = check([[str(v) for v in zeros]])
    assert report.status == "not_observed"
    assert report.workbook is None
    assert report.observed_at == datetime(2026, 10, 31, 10, tzinfo=UTC)


def test_weather_is_not_coded_when_the_indicator_says_it_is_omitted() -> None:
    (report,) = check([cells(c9=2, c10=0, c11=22)])
    assert report.status == "ready"
    assert report.workbook is not None
    assert report.workbook.present_wx is None
    assert report.workbook.past_wx_1 is None
    assert "W1W2 22" in (report.workbook.notes or "")


def test_four_layers_without_cumulonimbus_is_an_error_and_is_not_saved() -> None:
    row = cells(c29=4, c30=3, c31=270, c32=7, c33=2, c34=810)
    (report,) = check([row])
    assert report.status == "blocked"
    assert errors(report) == {"s3_layer4_amount": "too_many_layers"}


def test_a_slash_in_the_mid_cloud_form_is_kept() -> None:
    (report,) = check([cells(c20="/")])
    assert report.workbook is not None
    assert report.workbook.mid_cloud_type == "/"
    assert report.errors == []


def test_an_unreadable_cell_blocks_the_hour_with_the_field_named() -> None:
    (report,) = check([cells(c13="warm")])
    assert report.status == "blocked"
    assert errors(report)["air_temp"] == "unreadable_cell"


def test_an_unreadable_date_is_reported_without_a_time() -> None:
    (report,) = check([cells(c2="x")])
    assert report.status == "unreadable"
    assert report.observed_at is None


def test_a_dew_point_far_from_the_register_formula_warns_but_does_not_block() -> None:
    (report,) = check([cells(c17=200)])
    codes = {(i.field, i.code, i.severity) for i in report.issues}
    assert ("dew_point", "sheet_differs_from_formula", "warning") in codes
    assert report.status == "ready"


def test_a_consistent_sheet_has_no_formula_warnings() -> None:
    (report,) = check([cells()])
    assert "sheet_differs_from_formula" not in {i.code for i in report.issues}


def test_the_hour_checks_see_the_previous_hour_that_passed() -> None:
    previous = cells(c3=9, c13=250, c14=240, c17=235, c16=90)
    current = cells(c3=10)  # 5 degrees warmer in one hour
    both = check([current, previous])  # out of order on purpose
    alone = check([current])
    assert "temperature_jump" in {i.code for i in both[0].issues}
    assert "temperature_jump" not in {i.code for i in alone[0].issues}


def test_a_blocked_hour_is_not_used_as_history() -> None:
    blocked = cells(c3=9, c13=250, c29=4, c30=3, c31=270, c32=7, c33=2, c34=810)
    current = cells(c3=10)
    reports = check([blocked, current])
    assert reports[0].status == "blocked"
    assert "temperature_jump" not in {i.code for i in reports[1].issues}


def test_two_rows_for_the_same_hour_block_the_later_one() -> None:
    first, second = check([cells(), cells(c13=303)])
    assert first.status == "ready"
    assert second.status == "blocked"
    assert errors(second) == {"time_utc": "duplicate_hour"}


def test_a_value_too_long_for_the_register_blocks_the_hour_without_crashing() -> None:
    reports = check([cells(c8=100), cells(c3=13, c7=1000)])
    assert [r.status for r in reports] == ["blocked", "blocked"]
    assert errors(reports[0])
    assert errors(reports[1])


@pytest.mark.parametrize("column", [4, 8, 18, 19, 21])
def test_a_slash_means_not_observed_for_cloud_and_visibility_cells(column: int) -> None:
    (report,) = check([cells(**{f"c{column}": "/"})])
    assert "unreadable_cell" not in {i.code for i in report.issues}


@pytest.mark.parametrize(("column", "value"), [(10, "x"), (11, "100"), (11, "-1")])
def test_a_weather_cell_that_is_not_0_to_99_is_flagged(column: int, value: str) -> None:
    (report,) = check([cells(**{f"c{column}": value})])
    assert "unreadable_cell" in {i.code for i in report.issues}
    assert report.status == "blocked"


def test_weather_is_kept_in_the_notes_for_every_indicator_but_one() -> None:
    (report,) = check([cells(c9=4, c10=61, c11=62)])
    assert report.workbook is not None
    assert report.workbook.present_wx is None
    assert "ww 61" in (report.workbook.notes or "")


def test_group_909_and_remarks_are_carried_over() -> None:
    (report,) = check([cells(c36=24, c35="CB-NE, VCSH-SE")])
    assert report.workbook is not None
    assert report.workbook.s3_group_909 == "90924"
    assert report.workbook.s3_remarks == "CB-NE, VCSH-SE"
    (zero,) = check([cells(c36=0, c35="0")])
    assert zero.workbook is not None
    assert zero.workbook.s3_group_909 is None
    assert zero.workbook.s3_remarks is None
    (wide,) = check([cells(c36=90912)])
    assert "s3_group_909" in errors(wide)


def test_the_importer_only_refreshes_its_own_unreviewed_drafts() -> None:
    note = f"{cl1_import.IMPORT_NOTE_PREFIX}, row 5, 2026-10-01 12:00 local time."
    assert cl1_import.may_update("draft", note, None)
    assert not cl1_import.may_update("draft", "typed by an observer", None)
    assert not cl1_import.may_update("draft", None, None)
    assert not cl1_import.may_update("draft", note, "reviewed")
    assert not cl1_import.may_update("qc_pending", note, None)
    assert not cl1_import.may_update("accepted", note, None)


@pytest.mark.parametrize(
    "url",
    [
        "postgresql://u:p@127.0.0.1:5432/eregister",
        "postgresql://u:p@localhost/eregister",
        "postgresql://u:p@grenmet-postgres:5432/eregister",
        "postgresql://u:p@host.docker.internal:5432/eregister",
    ],
)
def test_saving_is_allowed_only_into_the_local_register(url: str) -> None:
    assert cl1_import.local_register_problem(url, "local", "eregister") is None


@pytest.mark.parametrize(
    ("url", "environment"),
    [
        ("postgresql://u:p@db.example.com:5432/eregister", "local"),  # remote host
        ("postgresql://u:p@10.0.0.5/eregister", "local"),  # a tunnel or private host
        ("postgresql://u:p@127.0.0.1/app", "local"),  # wrong database
        ("postgresql://u:p@127.0.0.1/eregister", "production"),
        ("postgresql://u:p@127.0.0.1/eregister", "staging"),
        ("mysql://u:p@127.0.0.1/eregister", "local"),
        ("", "local"),
        (None, "local"),
    ],
)
def test_saving_is_refused_for_anything_else(url: str | None, environment: str) -> None:
    assert cl1_import.local_register_problem(url, environment, "eregister")


def test_read_sheet_checks_the_header_and_skips_blank_lines() -> None:
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(HEADER)
    writer.writerow(cells())
    writer.writerow([""] * 37)
    rows = cl1_import.read_sheet("﻿" + buffer.getvalue())
    assert [number for number, _ in rows] == [2]
    with pytest.raises(cl1_import.Cl1FormatError):
        cl1_import.read_sheet("name,1,2,3\nA,L,L,L\n")
    with pytest.raises(cl1_import.Cl1FormatError):
        cl1_import.read_sheet("")


async def test_converted_hours_save_through_the_api_as_drafts_and_repeat_safely(
    send_client: tuple[httpx.AsyncClient, User],
) -> None:
    register_client, _user = send_client
    reports = check([cells(c3=8), cells(c3=9)])
    assert [r.status for r in reports] == ["ready", "ready"]
    for report in reports:
        assert report.workbook is not None and report.observed_at is not None
        record = {
            "station_id": cl1_import.STATION_ID,
            "kind": "SYNOP",
            "observed_at": report.observed_at.isoformat(),
            "body": report.workbook.model_dump(exclude_none=True),
        }
        saved = await register_client.post(
            "/api/v1/eregister/observations", json=record
        )
        assert saved.status_code == 201, saved.text
        assert saved.json()["state"] == "draft"
        assert saved.json()["body"]["dew_point"] == "256"
        # The same hour again by the same person updates the draft in place.
        again = await register_client.post(
            "/api/v1/eregister/observations", json=record
        )
        assert again.status_code == 200, again.text
    listed = await register_client.get(
        "/api/v1/eregister/observations", params={"station_id": cl1_import.STATION_ID}
    )
    assert len(listed.json()["observations"]) == 2
