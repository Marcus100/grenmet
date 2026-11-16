"""Printix ticket registry: limits, outcome codes and status values (ADR-0060)."""

from datetime import UTC, datetime, timedelta
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
#: Scans that answer ``unknown``, per pairing and window. Past this the pairing is
#: slowed; valid barcode scans are not refused by this cap.
UNKNOWN_SCANS_PER_WINDOW = 20
#: Typed printed-number lookups, per pairing and window, when the pairing allows them.
TYPED_NUMBER_SCANS_PER_WINDOW = 20
#: Summary reads per pairing per minute (Redis-backed limiter, keyed on the secret's hash).
SUMMARY_READS_PER_MINUTE = 30
#: Scanner requests per client address per minute (gate wifi shares one address).
SCANNER_REQUESTS_PER_MINUTE = 600
#: Scan-log rows are purged this many days after their event's close time.
SCAN_LOG_RETENTION_DAYS = 90
#: Control characters (C0 and DEL) are never part of a barcode, a number or a name.
CONTROL_CHARACTER_PATTERN = r"[\x00-\x1f\x7f]"

#: Offline scanning (ADR-0060, offline amendment). A phone downloads the event's
#: ticket list as keyed hashes, at most this often per pairing per minute.
OFFLINE_LIST_READS_PER_MINUTE = 4
#: Sync requests of queued offline admissions, per pairing per minute.
OFFLINE_SYNC_REQUESTS_PER_MINUTE = 12
#: Queued admissions in one sync request.
OFFLINE_SYNC_BATCH_MAX = 100
#: Hex characters kept of each HMAC-SHA256 barcode hash (128 bits).
OFFLINE_HASH_HEX_LENGTH = 32
#: Stable code on the 409 that refuses offline mode for an event whose barcodes are
#: its printed numbers (the list's hashes would be reversible by trying every number).
OFFLINE_UNAVAILABLE_CODE = "offline_not_available"
#: Offline results that are not new admissions (already_admitted, void, event_closed,
#: unknown) per pairing per SCAN_WINDOW_SECONDS. Past it the rest of the batch is
#: deferred. Repeats cost a row each, so this bounds the writes one pairing can cause.
OFFLINE_NON_ADMISSIONS_PER_WINDOW = 60
#: A queued scan is refused when its sync arrives more than this long after the close
#: (the earlier of closes_at and closed_at). Phones must sync within this time of close.
OFFLINE_SYNC_GRACE_AFTER_CLOSE = timedelta(hours=12)
#: An offline ticket's barcode must be at least this many characters. A shorter one
#: can be recovered from its hash on the list by trying every value.
OFFLINE_MIN_BARCODE_LENGTH = 12
#: A phone's scanned time must fall between these bounds (UTC), or the sync is a 422.
OFFLINE_SCANNED_AT_EARLIEST = datetime(2020, 1, 1, tzinfo=UTC)
OFFLINE_SCANNED_AT_MAX_AHEAD = timedelta(days=1)

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


class PrintixOfflineTicketState(str, Enum):
    """A ticket's state in the offline list: may enter, void, or already in."""

    VALID = "valid"
    VOID = "void"
    ADMITTED = "admitted"
