from datetime import UTC, date, datetime
from urllib.parse import unquote

from src.hr.filenames import (
    preview_filename,
    signed_document_filename,
    timesheet_week_filename,
)
from src.utils.filenames import (
    ascii_fallback,
    clean_part,
    content_disposition,
    grenada_date,
    pdf_filename,
)
from src.wxproducts.filenames import product_pdf_filename


def test_clean_part_removes_path_and_quote_characters() -> None:
    assert clean_part('  a/b\\c:"d"  ') == "a b c d"


def test_pdf_filename_joins_parts_and_note() -> None:
    assert (
        pdf_filename("Leave Application", "Ana Smith", "2026-10-23", note="rev 2")
        == "Leave Application - Ana Smith - 2026-10-23 (rev 2).pdf"
    )
    assert pdf_filename("", "  ") == "Document.pdf"


def test_pdf_filename_caps_length() -> None:
    assert len(pdf_filename("x" * 500)) <= 130


def test_content_disposition_has_ascii_and_utf8_forms() -> None:
    header = content_disposition("attachment", "Leave - José Núñez.pdf")
    assert header.startswith('attachment; filename="Leave - Jose Nunez.pdf"; ')
    star = header.split("filename*=UTF-8''")[1]
    assert unquote(star) == "Leave - José Núñez.pdf"
    assert header.isascii()


def test_ascii_fallback_never_empty() -> None:
    assert ascii_fallback("日本語.pdf") == "document.pdf"


def test_grenada_date_uses_local_day() -> None:
    # 01:00 UTC on the 24th is still the evening of the 23rd in Grenada (UTC-4).
    moment = datetime(2026, 10, 24, 1, 0, tzinfo=UTC).replace(tzinfo=None)
    assert grenada_date(moment) == date(2026, 10, 23)


def test_forecast_name_has_issue_hour_and_revision() -> None:
    name = product_pdf_filename(
        "morning",
        {"issuedAt": "2026-10-23T07:00"},
        recorded_at=None,
        revision=3,
    )
    assert name == "GMS Morning Forecast 2026-10-23 0700 (rev 3).pdf"


def test_bulletin_name_and_preview_label() -> None:
    values = {"issuedAt": "2026-10-23T09:30"}
    assert (
        product_pdf_filename("marine", values, recorded_at=None, revision=2)
        == "GMS Marine Bulletin 2026-10-23 (rev 2).pdf"
    )
    assert (
        product_pdf_filename("marine", values, recorded_at=None)
        == "GMS Marine Bulletin 2026-10-23 (draft preview).pdf"
    )


def test_product_name_falls_back_to_grenada_record_date() -> None:
    recorded = datetime(2026, 10, 24, 2, 0)
    assert (
        product_pdf_filename("heat", {}, recorded_at=recorded, revision=1)
        == "GMS Heat Bulletin 2026-10-23 (rev 1).pdf"
    )


def test_signed_document_name_uses_signer_and_local_date() -> None:
    signed_at = datetime(2026, 10, 24, 2, 0)
    assert (
        signed_document_filename("leave_request", "Ana Smith", signed_at, 1)
        == "Leave Application - Ana Smith - 2026-10-23.pdf"
    )
    assert signed_document_filename(
        "leave_request", "Ana Smith", signed_at, 2
    ).endswith("(rev 2).pdf")


def test_hr_preview_and_timesheet_names_hold_no_person() -> None:
    assert (
        preview_filename("leave_request", date(2026, 10, 23))
        == "Leave Application Preview - 2026-10-23.pdf"
    )
    assert (
        timesheet_week_filename(date(2026, 10, 19))
        == "Timesheet - week of 2026-10-19.pdf"
    )
