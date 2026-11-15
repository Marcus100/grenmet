"""Printix ticket registry: limits, outcome codes and status values (ADR-0060)."""

from datetime import timedelta
from enum import Enum

#: Permission key every administrator route checks (``src/auth/permissions.py``).
MANAGE_PERMISSION_KEY = "printix.manage"

#: The pairing secret is ``secrets.token_urlsafe(32)``: 32 random bytes, 43 characters.
PAIRING_SECRET_BYTES = 32
PAIRING_SECRET_MIN_LENGTH = 43
PAIRING_SECRET_MAX_LENGTH = 128
#: A new pairing lasts until six hours after the event closes, by default.
PAIRING_DEFAULT_AFTER_CLOSE = timedelta(hours=6)
#: An administrator may choose an expiry, but not later than a day after close.
PAIRING_MAX_AFTER_CLOSE = timedelta(hours=24)

EVENT_NAME_MAX_LENGTH = 120
GATE_MAX_LENGTH = 40
PRINTED_NUMBER_MAX = 32
BARCODE_MAX = 128
#: A scanned value of at most this many digits is also matched on printed_number.
SHORT_NUMBER_MAX_DIGITS = 6

SCAN_VALUE_MAX = 256
#: The scan log keeps only this much of the scanned value.
SCAN_VALUE_LOG_LENGTH = 128
#: Scans one pairing may make in a rolling window (a gate's peak pace is far below).
SCANS_PER_WINDOW = 120
SCAN_WINDOW_SECONDS = 60

MAX_IMPORT_BYTES = 2 * 1024 * 1024
MAX_IMPORT_ROWS = 20_000
MAX_REPORTED_ERRORS = 100


class PrintixEventStatus(str, Enum):
    OPEN = "open"
    CLOSED = "closed"


class PrintixTicketStatus(str, Enum):
    VALID = "valid"
    VOID = "void"


class PrintixScanOutcome(str, Enum):
    """Stable machine codes returned to the scanner. ``unknown`` covers both a
    value that is not on the event and one that is on another event, so a
    pairing never learns whether another event's ticket exists."""

    ADMITTED = "admitted"
    ALREADY_ADMITTED = "already_admitted"
    VOID = "void"
    UNKNOWN = "unknown"
    EVENT_CLOSED = "event_closed"
