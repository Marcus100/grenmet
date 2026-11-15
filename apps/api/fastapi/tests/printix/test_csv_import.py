"""The printer's CSV is parsed and checked before anything is written."""

from src.printix import constants
from src.printix.csv_import import ParsedImport, parse_ticket_csv


def messages(result: ParsedImport) -> list[str]:
    return [issue.message for issue in result.errors]


def test_number_and_barcode_columns_are_read() -> None:
    result = parse_ticket_csv(b"number,barcode\n001,PX-0001\n002,PX-0002\n")

    assert result.errors == []
    assert [(row.number, row.barcode) for row in result.rows] == [
        ("001", "PX-0001"),
        ("002", "PX-0002"),
    ]


def test_barcode_defaults_to_the_number_when_the_column_is_missing() -> None:
    result = parse_ticket_csv(b"number\n007\n")

    assert result.errors == []
    assert [(row.number, row.barcode) for row in result.rows] == [("007", "007")]


def test_leading_zeros_are_kept_as_text() -> None:
    result = parse_ticket_csv(b"number\n000\n")

    assert result.rows[0].number == "000"


def test_a_byte_order_mark_from_a_spreadsheet_is_accepted() -> None:
    result = parse_ticket_csv("﻿number,barcode\n1,A\n".encode())

    assert result.errors == []
    assert result.rows[0].number == "1"


def test_header_names_are_case_insensitive() -> None:
    result = parse_ticket_csv(b"Number,BARCODE\n1,A\n")

    assert result.errors == []
    assert result.rows[0].barcode == "A"


def test_missing_number_column_is_refused() -> None:
    result = parse_ticket_csv(b"barcode\nA\n")

    assert result.rows == []
    assert any("number" in message for message in messages(result))


def test_empty_file_is_refused() -> None:
    result = parse_ticket_csv(b"")

    assert result.rows == []
    assert result.errors


def test_blank_lines_are_skipped() -> None:
    result = parse_ticket_csv(b"number\n1\n\n2\n")

    assert result.errors == []
    assert [row.number for row in result.rows] == ["1", "2"]


def test_blank_number_names_the_line() -> None:
    result = parse_ticket_csv(b"number,barcode\n1,A\n,B\n")

    assert [(issue.line, issue.message) for issue in result.errors] == [
        (3, "number is empty")
    ]


def test_duplicate_number_in_the_file_names_the_first_line() -> None:
    result = parse_ticket_csv(b"number\n5\n6\n5\n")

    assert len(result.errors) == 1
    assert result.errors[0].line == 4
    assert "line 2" in result.errors[0].message


def test_duplicate_barcode_in_the_file_is_refused() -> None:
    result = parse_ticket_csv(b"number,barcode\n1,SAME\n2,SAME\n")

    assert len(result.errors) == 1
    assert result.errors[0].line == 3


def test_barcode_equal_to_another_number_is_not_a_duplicate() -> None:
    result = parse_ticket_csv(b"number,barcode\n1,2\n2,3\n")

    assert result.errors == []


def test_overlong_values_are_refused() -> None:
    long_number = "9" * (constants.PRINTED_NUMBER_MAX + 1)
    long_barcode = "B" * (constants.BARCODE_MAX + 1)
    result = parse_ticket_csv(
        f"number,barcode\n{long_number},X\n2,{long_barcode}\n".encode()
    )

    assert [issue.line for issue in result.errors] == [2, 3]


def test_non_utf8_file_is_refused() -> None:
    result = parse_ticket_csv(b"number\n\xff\xfe1\n")

    assert result.rows == []
    assert any("UTF-8" in message for message in messages(result))


def test_too_many_rows_is_refused() -> None:
    body = "".join(f"{n}\n" for n in range(constants.MAX_IMPORT_ROWS + 1))
    result = parse_ticket_csv(f"number\n{body}".encode())

    assert result.rows == []
    assert any("at most" in message for message in messages(result))


def test_reported_errors_are_capped() -> None:
    # A row with a barcode but no number is not blank, and has a problem.
    body = "".join(",X\n" for _ in range(constants.MAX_REPORTED_ERRORS + 10))
    result = parse_ticket_csv(f"number\n{body}".encode())

    assert len(result.errors) == constants.MAX_REPORTED_ERRORS
    assert result.errors_truncated is True
