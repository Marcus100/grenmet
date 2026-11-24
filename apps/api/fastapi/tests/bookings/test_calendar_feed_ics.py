"""Bookings: the multi-event calendar feed writer (pure, no database).

``build_calendar_ics`` reuses the per-booking writer's escaping, folding and
UTC rules. These tests pin the feed-level rules: one VCALENDAR with the business
name in ``X-WR-CALNAME``, one VEVENT per booking, CRLF line ends only, and no
content line over 75 octets.
"""

from datetime import UTC, datetime, timedelta

from src.bookings import ics

STAMP = datetime(2026, 11, 23, 12, 0, tzinfo=UTC)
START = datetime(2026, 11, 25, 13, 30, tzinfo=UTC)


def _event(uid: str, **overrides: object) -> ics.CalendarEvent:
    values: dict[str, object] = {
        "uid": uid,
        "starts_at": START,
        "ends_at": START + timedelta(hours=2),
        "summary": "Classic full set - Ada",
        "stamp": STAMP,
        "description": "Provider: Jeriann",
        "location": "St. George's",
        "status": "CONFIRMED",
        "sequence": 0,
    }
    values.update(overrides)
    return ics.CalendarEvent(**values)  # type: ignore[arg-type]


def test_feed_has_one_calendar_with_the_business_name_and_one_event_each() -> None:
    text = ics.build_calendar_ics(
        calendar_name="Babydoll Beauty Bar",
        events=[_event("booking-1@barrels.gd"), _event("booking-2@barrels.gd")],
    )
    assert text.count("BEGIN:VCALENDAR\r\n") == 1
    assert text.count("END:VCALENDAR\r\n") == 1
    assert text.count("BEGIN:VEVENT\r\n") == 2
    assert text.count("END:VEVENT\r\n") == 2
    assert "X-WR-CALNAME:Babydoll Beauty Bar\r\n" in text
    assert text.endswith("END:VCALENDAR\r\n")


def test_feed_uses_crlf_only() -> None:
    text = ics.build_calendar_ics(
        calendar_name="Salon", events=[_event("booking-1@barrels.gd")]
    )
    assert "\n" not in text.replace("\r\n", "")


def test_calendar_name_and_summary_are_escaped() -> None:
    text = ics.build_calendar_ics(
        calendar_name="Nails, hair; spa",
        events=[_event("booking-1@barrels.gd", summary="Pedicure, deluxe\nAda")],
    )
    assert "X-WR-CALNAME:Nails\\, hair\\; spa\r\n" in text
    assert "SUMMARY:Pedicure\\, deluxe\\nAda\r\n" in text


def test_long_summary_is_folded_at_75_octets() -> None:
    long_summary = "Classic full set with the extra long name " * 3 + "Ada"
    text = ics.build_calendar_ics(
        calendar_name="Salon",
        events=[_event("booking-1@barrels.gd", summary=long_summary)],
    )
    for physical in text.split("\r\n"):
        assert len(physical.encode()) <= 75, physical
    unfolded = text.replace("\r\n ", "")
    assert "SUMMARY:" + long_summary.replace("\n", "") in unfolded


def test_cancelled_and_sequence_are_written_per_event() -> None:
    text = ics.build_calendar_ics(
        calendar_name="Salon",
        events=[
            _event("booking-1@barrels.gd", status="CANCELLED", sequence=2),
            _event("booking-2@barrels.gd", status="TENTATIVE", sequence=0),
        ],
    )
    assert "STATUS:CANCELLED\r\nSEQUENCE:2\r\n" in text
    assert "STATUS:TENTATIVE\r\nSEQUENCE:0\r\n" in text


def test_per_booking_writer_output_is_unchanged() -> None:
    text = ics.build_booking_ics(
        uid="booking-1@barrels.gd",
        starts_at=START,
        ends_at=START + timedelta(hours=1),
        summary="Classic full set at Babydoll Beauty Bar",
        stamp=STAMP,
    )
    assert text.startswith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n")
    assert "X-WR-CALNAME" not in text
    assert text.count("BEGIN:VEVENT\r\n") == 1
