"""iCalendar output and the status table: pure functions, no database."""

from datetime import UTC, datetime
from typing import Any

import pytest

from src.bookings import ics, transitions
from src.bookings.models import BookingStatus

STAMP = datetime(2026, 10, 20, 12, 0, 5)
STARTS = datetime(2027, 1, 4, 13, 30)
ENDS = datetime(2027, 1, 4, 15, 30)


def _build(**overrides: object) -> str:
    values: dict[str, Any] = {
        "uid": "booking-1@barrels.gd",
        "starts_at": STARTS,
        "ends_at": ENDS,
        "summary": "Classic full set at Babydoll",
        "stamp": STAMP,
    }
    values.update(overrides)
    return ics.build_booking_ics(**values)


def test_document_shape_uses_crlf_utc_and_required_properties() -> None:
    text = _build(description="With Jeriann.", sequence=2)
    assert text.endswith("\r\n")
    assert "\n" not in text.replace("\r\n", "")
    lines = text.split("\r\n")[:-1]
    assert lines[:2] == ["BEGIN:VCALENDAR", "VERSION:2.0"]
    assert lines[-2:] == ["END:VEVENT", "END:VCALENDAR"]
    assert "UID:booking-1@barrels.gd" in lines
    assert "DTSTAMP:20261020T120005Z" in lines
    assert "DTSTART:20270104T133000Z" in lines
    assert "DTEND:20270104T153000Z" in lines
    assert "SUMMARY:Classic full set at Babydoll" in lines
    assert "DESCRIPTION:With Jeriann." in lines
    assert "STATUS:CONFIRMED" in lines
    assert "SEQUENCE:2" in lines
    assert "PRODID:-//Barrels Grenada//Bookings//EN" in lines


def test_aware_datetimes_convert_to_utc() -> None:
    from zoneinfo import ZoneInfo

    local = datetime(2027, 1, 4, 9, 30, tzinfo=ZoneInfo("America/Grenada"))
    assert ics.format_utc(local) == "20270104T133000Z"
    assert (
        ics.format_utc(datetime(2027, 1, 4, 13, 30, tzinfo=UTC)) == "20270104T133000Z"
    )


def test_text_values_are_escaped() -> None:
    assert ics.escape_text("a;b,c\\d\ne") == "a\\;b\\,c\\\\d\\ne"
    assert ics.escape_text("line1\r\nline2") == "line1\\nline2"
    assert ics.escape_text("bell\x07gone") == "bellgone"
    text = _build(summary="Lash; brow, tint")
    assert "SUMMARY:Lash\\; brow\\, tint\r\n" in text


def test_long_lines_fold_at_75_octets_and_unfold_losslessly() -> None:
    description = "x" * 300
    text = _build(description=description)
    physical = text.split("\r\n")[:-1]
    assert all(len(line.encode()) <= 75 for line in physical)
    assert any(line.startswith(" ") for line in physical)
    unfolded = text.replace("\r\n ", "")
    assert f"DESCRIPTION:{description}\r\n" in unfolded


def test_folding_never_splits_a_multibyte_character() -> None:
    summary = "é" * 100  # two octets each
    text = _build(summary=summary)
    physical = text.split("\r\n")[:-1]
    assert all(len(line.encode()) <= 75 for line in physical)
    for line in physical:
        line.encode().decode("utf-8")  # every physical line is valid UTF-8
    assert f"SUMMARY:{summary}\r\n" in text.replace("\r\n ", "")


def test_optional_properties_and_status_values() -> None:
    plain = _build()
    assert "DESCRIPTION" not in plain
    assert "LOCATION" not in plain
    assert "STATUS:CANCELLED" in _build(status="CANCELLED")
    assert "STATUS:TENTATIVE" in _build(status="TENTATIVE")
    assert "LOCATION:Main St\\, St George's" in _build(location="Main St, St George's")


def test_every_status_has_a_row_and_final_states_are_final() -> None:
    assert set(transitions.TRANSITIONS) == set(BookingStatus)
    for final in (
        BookingStatus.CANCELLED,
        BookingStatus.NO_SHOW,
        BookingStatus.COMPLETED,
    ):
        assert not transitions.TRANSITIONS[final]
        assert not transitions.is_active(final)


@pytest.mark.parametrize(
    ("current", "target", "allowed"),
    [
        (BookingStatus.PENDING, BookingStatus.CONFIRMED, True),
        (BookingStatus.PENDING, BookingStatus.CANCELLED, True),
        (BookingStatus.PENDING, BookingStatus.COMPLETED, False),
        (BookingStatus.CONFIRMED, BookingStatus.CANCELLED, True),
        (BookingStatus.CONFIRMED, BookingStatus.NO_SHOW, True),
        (BookingStatus.CONFIRMED, BookingStatus.PENDING, False),
        (BookingStatus.CANCELLED, BookingStatus.CONFIRMED, False),
        (BookingStatus.PENDING_PAYMENT, BookingStatus.CONFIRMED, True),
        (BookingStatus.COMPLETED, BookingStatus.CANCELLED, False),
    ],
)
def test_transition_table(
    current: BookingStatus, target: BookingStatus, allowed: bool
) -> None:
    assert transitions.can_transition(current, target) is allowed
