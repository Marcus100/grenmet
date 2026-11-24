"""Hand-written RFC 5545 calendar text for bookings. Pure: no database, no clock.

Rules implemented: CRLF line ends, TEXT escaping (backslash, semicolon, comma,
newline), content lines folded at 75 octets (never inside a UTF-8 character; each
continuation starts with one space), UTC date-times (``...Z``), and a stable
``UID`` so a calendar updates the same event when a booking moves.

Two writers share the same event lines: ``build_booking_ics`` (one booking, a
file download) and ``build_calendar_ics`` (every booking of a business, the
subscribed calendar feed, with ``X-WR-CALNAME`` for the calendar's name).
"""

from collections.abc import Sequence
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Literal

IcsStatus = Literal["CONFIRMED", "TENTATIVE", "CANCELLED"]

CRLF = "\r\n"
MAX_OCTETS = 75
PRODID = "-//Barrels Grenada//Bookings//EN"


def escape_text(value: str) -> str:
    """Escape a TEXT value (RFC 5545 section 3.3.11)."""
    cleaned = value.replace("\r\n", "\n").replace("\r", "\n")
    cleaned = "".join(
        ch for ch in cleaned if ch == "\n" or (ch >= " " and ch != "\x7f")
    )
    return (
        cleaned.replace("\\", "\\\\")
        .replace(";", "\\;")
        .replace(",", "\\,")
        .replace("\n", "\\n")
    )


def fold(line: str) -> str:
    """Fold one content line to at most 75 octets per physical line."""
    if len(line.encode()) <= MAX_OCTETS:
        return line
    parts: list[str] = []
    current = ""
    size = 0
    limit = MAX_OCTETS
    for char in line:
        width = len(char.encode())
        if size + width > limit:
            parts.append(current)
            current, size, limit = "", 0, MAX_OCTETS - 1  # the leading space counts
        current += char
        size += width
    parts.append(current)
    return (CRLF + " ").join(parts)


def format_utc(moment: datetime) -> str:
    """``YYYYMMDDTHHMMSSZ``; naive values are taken as UTC."""
    if moment.tzinfo is not None:
        moment = moment.astimezone(UTC)
    return moment.strftime("%Y%m%dT%H%M%SZ")


@dataclass(frozen=True)
class CalendarEvent:
    """One booking as a VEVENT. ``stamp`` should be the booking's last change, so
    the text is the same on every read until the booking really changes."""

    uid: str
    starts_at: datetime
    ends_at: datetime
    summary: str
    stamp: datetime
    description: str | None = None
    location: str | None = None
    status: IcsStatus = "CONFIRMED"
    sequence: int = 0


def _header(calendar_name: str | None = None) -> list[str]:
    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        f"PRODID:{PRODID}",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
    ]
    if calendar_name:
        lines.append(f"X-WR-CALNAME:{escape_text(calendar_name)}")
    return lines


def _event_lines(event: CalendarEvent) -> list[str]:
    lines = [
        "BEGIN:VEVENT",
        f"UID:{escape_text(event.uid)}",
        f"DTSTAMP:{format_utc(event.stamp)}",
        f"DTSTART:{format_utc(event.starts_at)}",
        f"DTEND:{format_utc(event.ends_at)}",
        f"SUMMARY:{escape_text(event.summary)}",
    ]
    if event.description:
        lines.append(f"DESCRIPTION:{escape_text(event.description)}")
    if event.location:
        lines.append(f"LOCATION:{escape_text(event.location)}")
    lines += [
        f"STATUS:{event.status}",
        f"SEQUENCE:{max(event.sequence, 0)}",
        "END:VEVENT",
    ]
    return lines


def _render(lines: list[str]) -> str:
    return CRLF.join(fold(line) for line in lines) + CRLF


def build_booking_ics(
    *,
    uid: str,
    starts_at: datetime,
    ends_at: datetime,
    summary: str,
    stamp: datetime,
    description: str | None = None,
    location: str | None = None,
    status: IcsStatus = "CONFIRMED",
    sequence: int = 0,
) -> str:
    """One VCALENDAR holding one VEVENT, ready to serve as ``text/calendar``."""
    event = CalendarEvent(
        uid=uid,
        starts_at=starts_at,
        ends_at=ends_at,
        summary=summary,
        stamp=stamp,
        description=description,
        location=location,
        status=status,
        sequence=sequence,
    )
    return _render([*_header(), *_event_lines(event), "END:VCALENDAR"])


def build_calendar_ics(*, calendar_name: str, events: Sequence[CalendarEvent]) -> str:
    """One VCALENDAR holding every event, named for subscribers' calendar apps.

    An empty feed is still a valid calendar (no VEVENT lines)."""
    lines = _header(calendar_name)
    for event in events:
        lines.extend(_event_lines(event))
    lines.append("END:VCALENDAR")
    return _render(lines)
