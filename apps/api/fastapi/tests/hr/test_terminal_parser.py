"""Terminal export parser (ADR-0040, Decision 4). Pure: no database."""

from datetime import datetime

from src.hr.attendance.terminal_parser import parse_export


def test_attlog_tab_separated_with_ignored_columns() -> None:
    text = "1\t2026-07-06 05:31:02\t1\t0\t0\t0\n"

    result = parse_export(text)

    assert result.format == "ZKTECO_ATTLOG"
    assert result.errors == []
    [punch] = result.punches
    assert punch.line == 1
    assert punch.device_user_id == "1"
    # Grenada is UTC-4 with no daylight saving.
    assert punch.punched_at == datetime(2026, 7, 6, 9, 31, 2)


def test_attlog_space_separated_and_minimal_columns() -> None:
    result = parse_export("42 2026-07-06 18:00:00\n")

    [punch] = result.punches
    assert punch.device_user_id == "42"
    assert punch.punched_at == datetime(2026, 7, 6, 22, 0, 0)


def test_attlog_local_late_evening_rolls_into_next_utc_day() -> None:
    result = parse_export("7\t2026-07-06 23:30:00\n")

    assert result.punches[0].punched_at == datetime(2026, 7, 7, 3, 30, 0)


def test_bad_attlog_lines_are_reported_and_do_not_stop_the_file() -> None:
    text = (
        "1\t2026-07-06 05:31:02\t1\n"
        "\n"
        "2\t2026-13-40 05:31:02\t1\n"
        "3\t2026-07-06 05:31\t1\n"
        "lonely\n"
        "4\t2026-07-06 06:00:00\t1\n"
    )

    result = parse_export(text)

    assert [p.device_user_id for p in result.punches] == ["1", "4"]
    assert [e.line for e in result.errors] == [3, 4, 5]
    assert all(error.message for error in result.errors)


def test_csv_with_header_parses_iso_separator_and_space() -> None:
    text = "device_user_id,punched_at\n12,2026-07-06 05:31:02\n13,2026-07-06T05:32:00\n"

    result = parse_export(text)

    assert result.format == "CSV"
    assert result.errors == []
    assert [(p.device_user_id, p.punched_at) for p in result.punches] == [
        ("12", datetime(2026, 7, 6, 9, 31, 2)),
        ("13", datetime(2026, 7, 6, 9, 32, 0)),
    ]


def test_csv_header_is_case_insensitive_and_column_order_free() -> None:
    text = " Punched_At , Device_User_ID \n2026-07-06 05:31:02,12\n"

    result = parse_export(text)

    assert result.format == "CSV"
    assert [p.device_user_id for p in result.punches] == ["12"]


def test_csv_bad_rows_are_reported_with_line_numbers() -> None:
    text = (
        "device_user_id,punched_at\n"
        "12,2026-07-06 05:31:02\n"
        "13,\n"
        ",2026-07-06 05:31:02\n"
        "14,06/07/2026 05:31\n"
    )

    result = parse_export(text)

    assert [p.device_user_id for p in result.punches] == ["12"]
    assert [e.line for e in result.errors] == [3, 4, 5]


def test_device_user_id_must_be_at_most_32_characters() -> None:
    too_long = "x" * 33
    result = parse_export(f"{too_long}\t2026-07-06 05:31:02\n")

    assert result.punches == []
    assert [e.line for e in result.errors] == [1]


def test_csv_device_user_id_must_not_contain_spaces() -> None:
    text = 'device_user_id,punched_at\n"bad id",2026-07-06 05:31:02\n'

    result = parse_export(text)

    assert result.punches == []
    assert [e.line for e in result.errors] == [2]


def test_blank_file_has_no_punches_and_no_errors() -> None:
    result = parse_export("\n   \n")

    assert result.punches == []
    assert result.errors == []
