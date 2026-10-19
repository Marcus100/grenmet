"""Shared constants and Grenada calendar windows."""

import uuid
from collections.abc import Iterable
from datetime import UTC, datetime, timedelta
from typing import Any

from src.utils.timezones import GRENADA as GRENADA

from .. import schemas

#: Grenada does not observe daylight saving.

FRIDAY, SUNDAY = 4, 6  # datetime.weekday()

GOING_PREVIEW = 4


def _pairs(rows: Iterable[Any]) -> dict[uuid.UUID, Any]:
    """``{key: value}`` from two-column result rows."""
    return {row[0]: row[1] for row in rows}


# --- Time windows --------------------------------------------------------------


UTC_TZ = UTC


def _naive_utc(value: datetime) -> datetime:
    """Stored timestamps are naive UTC."""
    if value.tzinfo is None:
        return value
    return value.astimezone(UTC_TZ).replace(tzinfo=None)


def when_window(when: schemas.When, now: datetime) -> tuple[datetime, datetime]:
    """Grenada-calendar window as naive-UTC bounds ``[start, end)`` for start times."""
    local_now = now.replace(tzinfo=UTC_TZ).astimezone(GRENADA)
    today = local_now.replace(hour=0, minute=0, second=0, microsecond=0)
    if when == "tonight":
        start, end = today, today + timedelta(days=1)
    elif when == "weekend":
        # Friday–Sunday; on a weekend day the window starts today.
        weekday = local_now.weekday()
        start = today if weekday >= FRIDAY else today + timedelta(days=FRIDAY - weekday)
        end = (
            today + timedelta(days=SUNDAY - weekday + 1)
            if weekday >= FRIDAY
            else start + timedelta(days=3)
        )
    elif when == "week":
        start, end = today, today + timedelta(days=7)
    else:
        start, end = today, today + timedelta(days=31)
    return _naive_utc(start), _naive_utc(end)
