"""Single source of truth for UTC now (timezone-aware, stored as naive for DB compatibility)."""

from datetime import UTC, datetime


def utc_now() -> datetime:
    """Return current UTC time as naive datetime for DB columns and consistency."""
    return datetime.now(UTC).replace(tzinfo=None)
