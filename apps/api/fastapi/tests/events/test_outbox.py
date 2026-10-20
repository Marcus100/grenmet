"""Events outbox (F6): written with the change, drained idempotently with retries."""

from datetime import timedelta
from uuid import UUID

import pytest
from sqlalchemy import Row, func, select
from sqlalchemy.exc import OperationalError
from sqlalchemy.ext.asyncio import AsyncSession

from src import operational_metrics
from src.events import outbox
from src.events.models import Follow, Listing, Organiser, Outbox, Rsvp, SavedListing
from src.notifications import service as notification_service
from src.notifications.models import Notification
from src.utils.datetime import utc_now
from tests.events.roles import user_with_role
from tests.events.support import (
    BASE,
    SessionFactory,
    client_with_real_roles,
)
from tests.events.test_organiser_admin import _organiser, _payload

MANAGE = f"{BASE}/manage/listings"


async def _outbox_rows(factory: SessionFactory) -> list[Outbox]:
    async with factory() as db:
        return list(
            (await db.scalars(select(Outbox).order_by(Outbox.created_at))).all()
        )


async def _notified(db: AsyncSession, event_key: str) -> list[Row[tuple[UUID, str]]]:
    result = await db.execute(
        select(Notification.recipient_user_id, Notification.title).where(
            Notification.event_key == event_key
        )
    )
    return list(result.all())


async def _drain(factory: SessionFactory, platform: AsyncSession, **kwargs) -> int:
    async with factory() as events:
        return await outbox.drain(events, platform, **kwargs)


async def _follow(factory: SessionFactory, user_id, slug: str = "harbour-crew") -> None:
    async with factory() as db:
        organiser = await db.scalar(select(Organiser).where(Organiser.slug == slug))
        assert organiser is not None
        db.add(Follow(organiser_id=organiser.id, user_id=user_id))
        await db.commit()


@pytest.mark.asyncio
async def test_publishing_queues_one_row_and_followers_hear_once(
    events_db: SessionFactory, db_async: AsyncSession
):
    organiser = await _organiser(events_db, db_async)
    follower = await user_with_role(db_async, None)
    await _follow(events_db, follower.id)
    await _follow(events_db, organiser.id)  # the author is never told about themselves
    async with client_with_real_roles(organiser) as client:
        body = _payload()
        response = await client.post(MANAGE, json=body)
        assert response.status_code == 201
        listing_id = response.json()["id"]
        # Saving again must not queue a second "published" effect.
        again = await client.put(f"{MANAGE}/{listing_id}", json=body)
        assert again.status_code == 200

    rows = await _outbox_rows(events_db)
    assert [row.kind for row in rows] == ["listing.published"]
    assert rows[0].payload["actor_id"] == str(organiser.id)
    assert "@" not in str(rows[0].payload)

    assert await _drain(events_db, db_async) == 1
    assert await _drain(events_db, db_async) == 0  # nothing left
    sent = await _notified(db_async, "events.listing_published")
    assert [row.recipient_user_id for row in sent] == [follower.id]
    assert "Harbour Lights Fete" in sent[0].title


@pytest.mark.asyncio
async def test_a_repeated_drain_of_the_same_row_notifies_nobody_twice(
    events_db: SessionFactory, db_async: AsyncSession
):
    organiser = await _organiser(events_db, db_async)
    follower = await user_with_role(db_async, None)
    await _follow(events_db, follower.id)
    async with client_with_real_roles(organiser) as client:
        assert (await client.post(MANAGE, json=_payload())).status_code == 201
    assert await _drain(events_db, db_async) == 1

    # Simulate a crash after the platform commit but before the Events commit.
    async with events_db() as db:
        row = (await db.scalars(select(Outbox))).one()
        row.processed_at = None
        await db.commit()
    assert await _drain(events_db, db_async) == 1
    assert len(await _notified(db_async, "events.listing_published")) == 1


@pytest.mark.asyncio
async def test_draft_and_invalid_saves_queue_nothing(
    events_db: SessionFactory, db_async: AsyncSession
):
    organiser = await _organiser(events_db, db_async)
    async with client_with_real_roles(organiser) as client:
        assert (
            await client.post(MANAGE, json=_payload(status="draft"))
        ).status_code == 201
        assert (await client.post(MANAGE, json=_payload(tiers=[]))).status_code == 409
    assert await _outbox_rows(events_db) == []


@pytest.mark.asyncio
async def test_cancel_and_reschedule_tell_going_and_saved_members(
    events_db: SessionFactory, db_async: AsyncSession
):
    organiser = await _organiser(events_db, db_async)
    going = await user_with_role(db_async, None)
    saved = await user_with_role(db_async, None)
    async with client_with_real_roles(organiser) as client:
        base = _payload()
        created = (await client.post(MANAGE, json=base)).json()
        listing_id = created["id"]
        async with events_db() as db:
            listing = await db.scalar(select(Listing).where(Listing.id == listing_id))
            assert listing is not None
            db.add(Rsvp(listing_id=listing.id, user_id=going.id))
            db.add(SavedListing(listing_id=listing.id, user_id=saved.id))
            await db.commit()
        moved = _payload(
            starts_at=(utc_now() + timedelta(days=12)).isoformat() + "Z",
            ends_at=(utc_now() + timedelta(days=12, hours=5)).isoformat() + "Z",
        )
        assert (
            await client.put(f"{MANAGE}/{listing_id}", json=moved)
        ).status_code == 200
        assert (
            await client.put(
                f"{MANAGE}/{listing_id}", json={**moved, "status": "cancelled"}
            )
        ).status_code == 200

    kinds = sorted(row.kind for row in await _outbox_rows(events_db))
    assert kinds == ["listing.cancelled", "listing.postponed", "listing.published"]
    await _drain(events_db, db_async)
    for key in ("events.listing_postponed", "events.listing_cancelled"):
        recipients = {row.recipient_user_id for row in await _notified(db_async, key)}
        assert recipients == {going.id, saved.id}, key
    assert await _notified(db_async, "events.listing_published") == []  # no followers


@pytest.mark.asyncio
async def test_failures_back_off_then_succeed(
    events_db: SessionFactory,
    db_async: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
):
    organiser = await _organiser(events_db, db_async)
    follower = await user_with_role(db_async, None)
    await _follow(events_db, follower.id)
    async with client_with_real_roles(organiser) as client:
        assert (await client.post(MANAGE, json=_payload())).status_code == 201

    real_notify = notification_service.notify
    calls = {"count": 0}

    async def flaky(*args, **kwargs):
        calls["count"] += 1
        if calls["count"] == 1:
            raise OperationalError("insert", {}, Exception("connection reset"))
        return await real_notify(*args, **kwargs)

    monkeypatch.setattr(notification_service, "notify", flaky)

    assert await _drain(events_db, db_async) == 0
    (row,) = await _outbox_rows(events_db)
    assert row.attempts == 1
    assert row.processed_at is None
    assert row.last_error is not None
    assert row.available_at > utc_now() + timedelta(seconds=20)

    # Not due yet: a second drain leaves it alone.
    assert await _drain(events_db, db_async) == 0
    assert calls["count"] == 1

    async with events_db() as db:
        stored = (await db.scalars(select(Outbox))).one()
        stored.available_at = utc_now() - timedelta(seconds=1)
        await db.commit()
    assert await _drain(events_db, db_async) == 1
    assert len(await _notified(db_async, "events.listing_published")) == 1
    (done,) = await _outbox_rows(events_db)
    assert done.processed_at is not None
    assert done.last_error is None


@pytest.mark.asyncio
async def test_rows_give_up_after_max_attempts(
    events_db: SessionFactory,
    db_async: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
):
    organiser = await _organiser(events_db, db_async)
    async with client_with_real_roles(organiser) as client:
        assert (await client.post(MANAGE, json=_payload())).status_code == 201

    async def broken(*_args: object, **_kwargs: object):
        raise OperationalError("insert", {}, Exception("down"))

    monkeypatch.setattr(notification_service, "notify", broken)
    dead: list[tuple[str, str, object, int]] = []

    async def signal(name: str, kind: str, *, outbox_id: object, attempts: int) -> None:
        dead.append((name, kind, outbox_id, attempts))

    monkeypatch.setattr(operational_metrics, "outbox_dead_lettered", signal)
    for _ in range(3):
        async with events_db() as db:
            await db.execute(Outbox.__table__.update().values(available_at=utc_now()))
            await db.commit()
        await _drain(events_db, db_async, max_attempts=3)
    (row,) = await _outbox_rows(events_db)
    assert (row.attempts, row.failed_at is not None) == (3, True)
    assert await _drain(events_db, db_async, max_attempts=3) == 0
    # Exactly one countable dead-letter signal, carrying the kind and no payload.
    assert dead == [("events", row.kind, row.id, 3)]


@pytest.mark.asyncio
async def test_events_backlog_counts_recent_failures_and_overdue_rows(
    events_db: SessionFactory,
) -> None:
    from src.worker import outbox_health

    now = utc_now()
    async with events_db() as events:
        for key, available, processed, failed in [
            ("failed-recent", now, None, now - timedelta(hours=2)),
            ("failed-old", now, None, now - timedelta(days=2)),
            ("overdue", now - timedelta(hours=1), None, None),
            ("fresh", now - timedelta(minutes=1), None, None),
            ("processed", now - timedelta(hours=1), now, None),
        ]:
            events.add(
                Outbox(
                    kind="listing.published",
                    entity_type="listing",
                    entity_id=key,
                    dedupe_key=key,
                    available_at=available,
                    processed_at=processed,
                    failed_at=failed,
                )
            )
        await events.commit()
        backlog = await outbox_health.events_backlog(
            events,
            stale_after=timedelta(minutes=30),
            dead_window=timedelta(hours=24),
            now=now,
        )
    assert backlog == outbox_health.Backlog("events", dead=1, stale_pending=1)


def test_retry_delay_doubles_and_caps():
    assert [outbox.retry_delay_seconds(n) for n in (1, 2, 3)] == [30, 60, 120]
    assert outbox.retry_delay_seconds(20) == 3600


@pytest.mark.asyncio
async def test_moderator_approval_notifies_the_organiser_owners_once(
    events_db: SessionFactory, db_async: AsyncSession
):
    member = await user_with_role(db_async, None)
    async with client_with_real_roles(member) as client:
        created = (
            await client.post(f"{BASE}/manage/organiser", json={"name": "Island Beats"})
        ).json()
    moderator = await user_with_role(db_async, "events-moderator")
    url = f"{BASE}/moderation/organisers/{created['id']}"
    async with client_with_real_roles(moderator) as client:
        assert (await client.patch(url, json={"verified": True})).status_code == 200
        assert (await client.patch(url, json={"verified": True})).status_code == 200
    assert [row.kind for row in await _outbox_rows(events_db)] == ["organiser.approved"]
    assert await _drain(events_db, db_async) == 1
    sent = await _notified(db_async, "events.organiser_approved")
    assert [row.recipient_user_id for row in sent] == [member.id]
    async with events_db() as db:
        assert await db.scalar(select(func.count()).select_from(Outbox)) == 1
