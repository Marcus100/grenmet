"""The daily summary of an operations log (#1875)."""

import uuid
from datetime import timedelta

import httpx
import pytest
from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.models import User
from src.notifications.models import Notification
from src.opslog import summary
from src.opslog.models import OpsLog, OpsLogEntry
from src.organisations.models import (
    Membership,
    MembershipGrant,
    MembershipRole,
    MembershipStatus,
    OrganisationStatus,
    PlatformOrganisation,
    new_grant_id,
)
from src.utils.datetime import utc_now
from tests.factories import make_user
from tests.organisations.support import headers_for, make_org

API = "/api/v1/opslog/org"

pytestmark = pytest.mark.asyncio


async def _setup(
    client: httpx.AsyncClient, db: AsyncSession
) -> tuple[str, User, User, str]:
    owner = await make_user(db)
    keeper = await make_user(db)
    org = await make_org(
        db,
        f"Airport {uuid.uuid4().hex[:6]}",
        members=((owner, MembershipRole.OWNER), (keeper, MembershipRole.MEMBER)),
        apps=("opslog",),
    )
    membership = await db.scalar(
        select(Membership).where(
            Membership.organisation_id == org.id, Membership.user_id == keeper.id
        )
    )
    assert membership is not None
    db.add(
        MembershipGrant(
            id=new_grant_id(),
            membership_id=membership.id,
            organisation_id=org.id,
            role_key="opslog-writer",
            granted_at=utc_now(),
        )
    )
    await db.commit()
    log = await client.post(
        f"{API}/logs", headers=headers_for(owner, org.id), json={"name": "Operations"}
    )
    log_id: str = log.json()["id"]
    return org.id, owner, keeper, log_id


async def _mine(db: AsyncSession, user: User, log_id: str) -> list[Notification]:
    return list(
        (
            await db.scalars(
                select(Notification).where(
                    Notification.recipient_user_id == user.id,
                    Notification.entity_id == log_id,
                )
            )
        ).all()
    )


async def test_subscribers_get_one_summary_without_private_entries(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    org_id, owner, keeper, log_id = await _setup(async_client, db_async)
    k = headers_for(keeper, org_id)
    path = f"{API}/logs/{log_id}/summary-subscription"
    assert (await async_client.get(path, headers=k)).json() == {"subscribed": False}
    on = await async_client.put(path, headers=k, json={"subscribed": True})
    assert on.json() == {"subscribed": True}
    again = await async_client.put(path, headers=k, json={"subscribed": True})
    assert again.status_code == 200

    # Nothing written yet: no summary.
    assert await summary.send_daily_summaries(db_async, now=utc_now()) == 0

    await async_client.post(
        f"{API}/logs/{log_id}/entries", headers=k, json={"text": "Runway inspected"}
    )
    await async_client.post(
        f"{API}/logs/{log_id}/entries",
        headers=headers_for(owner, org_id),
        json={"text": "Disciplinary matter", "private": True},
    )
    now = utc_now()
    assert await summary.send_daily_summaries(db_async, now=now) == 1
    [note] = await _mine(db_async, keeper, log_id)
    assert note.event_key == "opslog.daily_summary"
    assert "Operations" in note.title
    assert "1 entry." in note.body
    assert "Runway inspected" in note.body
    assert "Disciplinary" not in note.body
    # The owner did not subscribe; a second run the same day tells nobody again.
    assert await _mine(db_async, owner, log_id) == []
    assert await summary.send_daily_summaries(db_async, now=now) == 0
    # Entries older than 24 hours are not summarised.
    assert (
        await summary.send_daily_summaries(db_async, now=now + timedelta(days=2)) == 0
    )


async def test_summary_stops_for_people_who_left_or_unsubscribed(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    org_id, owner, keeper, log_id = await _setup(async_client, db_async)
    path = f"{API}/logs/{log_id}/summary-subscription"
    for user in (owner, keeper):
        await async_client.put(
            path, headers=headers_for(user, org_id), json={"subscribed": True}
        )
    await async_client.post(
        f"{API}/logs/{log_id}/entries",
        headers=headers_for(owner, org_id),
        json={"text": "Fuel delivery"},
    )
    # The keeper leaves the organisation; the owner unsubscribes.
    membership = await db_async.scalar(
        select(Membership).where(
            Membership.organisation_id == org_id, Membership.user_id == keeper.id
        )
    )
    assert membership is not None
    membership.status = MembershipStatus.REMOVED.value
    await db_async.commit()
    off = await async_client.put(
        path, headers=headers_for(owner, org_id), json={"subscribed": False}
    )
    assert off.json() == {"subscribed": False}
    assert await summary.send_daily_summaries(db_async, now=utc_now()) == 0

    other = await make_user(db_async)
    other_org = await make_org(
        db_async,
        f"Other {uuid.uuid4().hex[:6]}",
        members=((other, MembershipRole.OWNER),),
        apps=("opslog",),
    )
    foreign = await async_client.put(
        path, headers=headers_for(other, other_org.id), json={"subscribed": True}
    )
    assert foreign.status_code == 404


async def test_no_summary_without_the_read_key_or_for_a_suspended_organisation(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    org_id, owner, keeper, log_id = await _setup(async_client, db_async)
    path = f"{API}/logs/{log_id}/summary-subscription"
    for user in (owner, keeper):
        await async_client.put(
            path, headers=headers_for(user, org_id), json={"subscribed": True}
        )
    await async_client.post(
        f"{API}/logs/{log_id}/entries",
        headers=headers_for(owner, org_id),
        json={"text": "x" * 4000},
    )
    # The keeper loses the role: only the owner is told.
    await db_async.execute(
        delete(MembershipGrant).where(MembershipGrant.organisation_id == org_id)
    )
    await db_async.commit()
    now = utc_now()
    assert await summary.send_daily_summaries(db_async, now=now) == 1
    assert await _mine(db_async, keeper, log_id) == []
    [note] = await _mine(db_async, owner, log_id)
    assert len(note.body) <= 1000

    # A suspended organisation gets nothing, even on a new day.
    organisation = await db_async.get(PlatformOrganisation, org_id)
    assert organisation is not None
    organisation.status = OrganisationStatus.SUSPENDED.value
    await db_async.commit()
    await db_async.execute(
        update(OpsLogEntry)
        .values(created_at=now + timedelta(hours=20))
        .where(OpsLogEntry.organisation_id == org_id)
    )
    await db_async.commit()
    later = now + timedelta(days=1)
    assert await summary.send_daily_summaries(db_async, now=later) == 0
    organisation.status = OrganisationStatus.ACTIVE.value
    await db_async.commit()
    # An archived log is skipped too.
    log = await db_async.get(OpsLog, log_id)
    assert log is not None
    log.archived_at = now
    await db_async.commit()
    assert await summary.send_daily_summaries(db_async, now=later) == 0
