"""Grenada-calendar ``when`` windows: ``[start, end)`` in naive UTC.

Grenada is UTC-4 all year, so local midnight is 04:00 UTC. The ``month``
window is not pinned here yet: the API uses 31 days while the web filter says
"Next 30 days", and that choice is still open.
"""

from datetime import UTC, datetime, timedelta, timezone

import pytest

from src.events import service
from src.events.models import Listing, Organiser
from src.events.service.common import _naive_utc
from tests.events.support import SessionFactory


@pytest.mark.parametrize(
    ("now", "start", "end"),
    [
        # 23:59 on Wed 14 Oct in Grenada: still the 14th.
        (
            datetime(2026, 10, 15, 3, 59),
            datetime(2026, 10, 14, 4, 0),
            datetime(2026, 10, 15, 4, 0),
        ),
        # Grenada midnight: the window rolls to Thu 15 Oct.
        (
            datetime(2026, 10, 15, 4, 0),
            datetime(2026, 10, 15, 4, 0),
            datetime(2026, 10, 16, 4, 0),
        ),
    ],
)
def test_tonight_follows_the_grenada_date(now, start, end):
    assert service.when_window("tonight", now) == (start, end)


@pytest.mark.parametrize(
    ("now", "start"),
    [
        (datetime(2026, 10, 14, 12, 0), datetime(2026, 10, 16, 4, 0)),  # Wednesday
        (datetime(2026, 10, 16, 12, 0), datetime(2026, 10, 16, 4, 0)),  # Friday
        (datetime(2026, 10, 17, 12, 0), datetime(2026, 10, 17, 4, 0)),  # Saturday
        (datetime(2026, 10, 18, 12, 0), datetime(2026, 10, 18, 4, 0)),  # Sunday
    ],
)
def test_weekend_runs_to_monday_midnight(now, start):
    assert service.when_window("weekend", now) == (start, datetime(2026, 10, 19, 4, 0))


def test_week_is_seven_grenada_days_across_the_year_end():
    assert service.when_window("week", datetime(2026, 12, 28, 12, 0)) == (
        datetime(2026, 12, 28, 4, 0),
        datetime(2027, 1, 4, 4, 0),
    )


def test_naive_utc_converts_aware_values_and_keeps_naive_ones():
    grenada = timezone(timedelta(hours=-4))
    assert _naive_utc(datetime(2026, 10, 15, 0, 0, tzinfo=grenada)) == datetime(
        2026, 10, 15, 4, 0
    )
    assert _naive_utc(datetime(2026, 10, 15, 4, 0, tzinfo=UTC)) == datetime(
        2026, 10, 15, 4, 0
    )
    naive = datetime(2026, 10, 15, 4, 0)
    assert _naive_utc(naive) == naive


@pytest.mark.asyncio
async def test_listing_filter_includes_the_start_and_excludes_the_end(
    events_db: SessionFactory,
):
    now = datetime(2026, 10, 15, 12, 0)  # window [15 Oct 04:00, 16 Oct 04:00)
    async with events_db() as db:
        organiser = Organiser(slug="harbour-crew", name="Harbour Crew")
        db.add(organiser)
        await db.flush()
        for slug, starts_at in (
            ("at-start", datetime(2026, 10, 15, 4, 0)),
            ("before-end", datetime(2026, 10, 16, 3, 59)),
            ("at-end", datetime(2026, 10, 16, 4, 0)),
        ):
            db.add(
                Listing(
                    slug=slug,
                    title=slug,
                    summary="Boundary check",
                    category="music",
                    parish="st-george",
                    venue="Carenage",
                    starts_at=starts_at,
                    ends_at=starts_at + timedelta(hours=20),
                    admission="free",
                    organiser_id=organiser.id,
                    status="published",
                )
            )
        await db.commit()

    async with events_db() as db:
        cards, total = await service.list_listings(
            db, viewer_id=None, when="tonight", now=now
        )
    assert [card.slug for card in cards] == ["at-start", "before-end"]
    assert total == 2
