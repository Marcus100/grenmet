"""Events outbox (F6): written with the change, drained idempotently with retries."""

from datetime import timedelta
from uuid import UUID

import pytest
from sqlalchemy import Row, select
from sqlalchemy.exc import OperationalError
from sqlalchemy.ext.asyncio import AsyncSession

from src import outbox as platform_outbox
from src.events.models import Follow, Listing, Organiser, Rsvp, SavedListing
from src.notifications import service as notification_service
from src.notifications.models import Notification
from src.utils.datetime import utc_now
from tests.events.roles import user_with_role
from tests.events.support import (
    BASE,
    SessionFactory,
    client_with_real_roles,
    drain_notifications,
    queued,
)
from tests.events.test_organiser_admin import _organiser, _payload

MANAGE = f"{BASE}/manage/listings"


async def _notified(db: AsyncSession, event_key: str) -> list[Row[tuple[UUID, str]]]:
    result = await db.execute(
        select(Notification.recipient_user_id, Notification.title).where(
            Notification.event_key == event_key
        )
    )
    return list(result.all())


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

    rows = await queued(events_db)
    assert [row.payload["kind"] for row in rows] == ["listing.published"]
    assert rows[0].payload["actor_id"] == str(organiser.id)
    assert "@" not in str(rows[0].payload)

    assert await drain_notifications(events_db) == 1
    assert await drain_notifications(events_db) == 0  # nothing left
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
        response = await client.post(MANAGE, json=_payload())
        assert response.status_code == 201
        created_id = response.json()["id"]
    assert await drain_notifications(events_db) == 1

    # Simulate a replay of the same message (a crash before the row was marked done).
    async with events_db() as db:
        (row,) = (
            await db.scalars(
                select(platform_outbox.Outbox).where(
                    platform_outbox.Outbox.topic == "events.notify"
                )
            )
        ).all()
        row.status = "pending"
        row.payload = {
            "kind": "listing.published",
            "entity_type": "listing",
            "entity_id": created_id,
        }
        await db.commit()
    assert await drain_notifications(events_db) == 1
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
    assert await queued(events_db) == []


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

    kinds = sorted(row.payload["kind"] for row in await queued(events_db))
    assert kinds == ["listing.cancelled", "listing.postponed", "listing.published"]
    await drain_notifications(events_db)
    for key in ("events.listing_postponed", "events.listing_cancelled"):
        recipients = {row.recipient_user_id for row in await _notified(db_async, key)}
        assert recipients == {going.id, saved.id}, key
    assert await _notified(db_async, "events.listing_published") == []  # no followers


@pytest.mark.asyncio
async def test_failures_are_retried_by_the_platform_outbox(
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

    assert await drain_notifications(events_db) == 0
    (row,) = await queued(events_db)
    assert row.attempts == 1
    assert row.status == "pending"
    assert row.next_attempt_at > utc_now()

    # Not due yet: a second drain leaves it alone.
    assert await drain_notifications(events_db) == 0
    assert calls["count"] == 1

    assert await drain_notifications(events_db, now=utc_now() + timedelta(hours=1)) == 1
    assert len(await _notified(db_async, "events.listing_published")) == 1
    (done,) = await queued(events_db)
    assert done.status == "done"


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
    assert [row.payload["kind"] for row in await queued(events_db)] == [
        "organiser.approved"
    ]
    assert await drain_notifications(events_db) == 1
    sent = await _notified(db_async, "events.organiser_approved")
    assert [row.recipient_user_id for row in sent] == [member.id]
    assert len(await queued(events_db)) == 1
