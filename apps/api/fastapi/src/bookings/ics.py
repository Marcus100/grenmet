"""Hand-written RFC 5545 calendar text for one booking. Pure: no database, no clock.

Rules implemented: CRLF line ends, TEXT escaping (backslash, semicolon, comma,
newline), content lines folded at 75 octets (never inside a UTF-8 character; each
continuation starts with one space), UTC date-times (``...Z``), and a stable
``UID`` so a calendar updates the same event when a booking moves.
"""

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
    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        f"PRODID:{PRODID}",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        "BEGIN:VEVENT",
        f"UID:{escape_text(uid)}",
        f"DTSTAMP:{format_utc(stamp)}",
        f"DTSTART:{format_utc(starts_at)}",
        f"DTEND:{format_utc(ends_at)}",
        f"SUMMARY:{escape_text(summary)}",
    ]
    if description:
        lines.append(f"DESCRIPTION:{escape_text(description)}")
    if location:
        lines.append(f"LOCATION:{escape_text(location)}")
    lines += [
        f"STATUS:{status}",
        f"SEQUENCE:{max(sequence, 0)}",
        "END:VEVENT",
        "END:VCALENDAR",
    ]
    return CRLF.join(fold(line) for line in lines) + CRLF
