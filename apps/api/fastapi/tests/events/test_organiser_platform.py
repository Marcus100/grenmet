"""Organisers backed by platform organisations (F5, ADR-0022 decision 5)."""

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.events import backfill
from src.events.models import Organiser, OrganiserMember
from src.events.service import create_organiser
from src.organisations import service as organisation_service
from src.organisations import verification
from src.organisations.models import (
    Membership,
    MembershipRole,
    MembershipStatus,
    PlatformOrganisation,
)
from src.utils.datetime import utc_now
from tests.events.roles import user_with_role
from tests.events.support import BASE, SessionFactory, client_with_real_roles
from tests.events.test_organiser_admin import _organiser, _payload
from tests.factories import make_user
from tests.organisations.support import make_org

MANAGE = f"{BASE}/manage"


@pytest.mark.asyncio
async def test_legacy_only_member_keeps_access(
    events_db: SessionFactory, db_async: AsyncSession
):
    user = await _organiser(events_db, db_async)
    async with client_with_real_roles(user) as client:
        response = await client.get(MANAGE)
        assert response.status_code == 200
        assert response.json()["organisation_id"] is None
        assert (
            await client.post(f"{MANAGE}/listings", json=_payload())
        ).status_code == 201


@pytest.mark.asyncio
async def test_platform_only_member_gets_access(
    events_db: SessionFactory, db_async: AsyncSession
):
    user = await user_with_role(db_async, None)  # no events.organiser.manage
    organisation = await make_org(
        db_async, "Crew", members=((user, MembershipRole.ADMIN),)
    )
    async with events_db() as db:
        db.add(Organiser(slug="crew", name="Crew", organisation_id=organisation.id))
        await db.commit()
    async with client_with_real_roles(user) as client:
        response = await client.get(MANAGE)
        assert response.status_code == 200
        assert response.json()["organisation_id"] == organisation.id
        # Unverified: drafts are fine, publishing waits for platform verification.
        draft = await client.post(f"{MANAGE}/listings", json=_payload(status="draft"))
        assert draft.status_code == 201
        assert (
            await client.post(f"{MANAGE}/listings", json=_payload())
        ).status_code == 403
        organisation.verified_at = utc_now()
        db_async.add(organisation)
        await db_async.commit()
        verification.clear_cache()
        assert (
            await client.post(f"{MANAGE}/listings", json=_payload())
        ).status_code == 201


@pytest.mark.asyncio
async def test_plain_platform_member_is_refused(
    events_db: SessionFactory, db_async: AsyncSession
):
    user = await user_with_role(db_async, None)
    organisation = await make_org(
        db_async, "Crew", members=((user, MembershipRole.MEMBER),)
    )
    async with events_db() as db:
        db.add(Organiser(slug="crew", name="Crew", organisation_id=organisation.id))
        await db.commit()
    async with client_with_real_roles(user) as client:
        assert (await client.get(MANAGE)).status_code == 403


@pytest.mark.asyncio
async def test_removed_platform_member_loses_access(
    events_db: SessionFactory, db_async: AsyncSession
):
    user = await user_with_role(db_async, "events-organiser")
    organisation = await make_org(
        db_async, "Crew", members=((user, MembershipRole.OWNER),)
    )
    async with events_db() as db:
        organiser = Organiser(slug="crew", name="Crew", organisation_id=organisation.id)
        db.add(organiser)
        await db.flush()
        # A stale legacy row must not outlive the platform membership.
        db.add(OrganiserMember(organiser_id=organiser.id, user_id=user.id))
        await db.commit()
    async with client_with_real_roles(user) as client:
        assert (await client.get(MANAGE)).status_code == 200
    membership = await db_async.scalar(
        select(Membership).where(Membership.organisation_id == organisation.id)
    )
    assert membership is not None
    membership.status = MembershipStatus.REMOVED.value
    await db_async.commit()
    async with client_with_real_roles(user) as client:
        assert (await client.get(MANAGE)).status_code == 403


@pytest.mark.asyncio
async def test_switching_between_organisers(
    events_db: SessionFactory, db_async: AsyncSession
):
    user = await user_with_role(db_async, None)
    first = await make_org(db_async, "Alpha", members=((user, MembershipRole.OWNER),))
    second = await make_org(db_async, "Beta", members=((user, MembershipRole.ADMIN),))
    async with events_db() as db:
        db.add_all(
            [
                Organiser(slug="alpha", name="Alpha", organisation_id=first.id),
                Organiser(slug="beta", name="Beta", organisation_id=second.id),
            ]
        )
        await db.commit()
    async with client_with_real_roles(user) as client:
        default = (await client.get(MANAGE)).json()
        assert default["slug"] == "alpha"
        assert [o["slug"] for o in default["organisers"]] == ["alpha", "beta"]
        chosen = (await client.get(MANAGE, params={"organiser": "beta"})).json()
        assert chosen["slug"] == "beta"
        assert (
            await client.get(MANAGE, params={"organiser": "nope"})
        ).status_code == 403


@pytest.mark.asyncio
async def test_backfill_links_legacy_organisers_and_is_idempotent(
    events_db: SessionFactory, db_async: AsyncSession
):
    users = [await make_user(db_async) for _ in range(3)]
    async with events_db() as db:
        organiser = Organiser(slug="old-crew", name="Old Crew")
        db.add(organiser)
        await db.flush()
        db.add_all(
            OrganiserMember(organiser_id=organiser.id, user_id=u.id) for u in users
        )
        await db.commit()
    async with events_db() as db:
        result = await backfill.backfill(db, db_async)
    assert (result.linked, result.memberships_created) == (1, 3)
    async with events_db() as db:
        row = await db.scalar(select(Organiser))
        assert row is not None and row.organisation_id is not None
        organisation_id = row.organisation_id
    organisation = await db_async.get(PlatformOrganisation, organisation_id)
    assert organisation is not None
    assert (organisation.kind, organisation.slug) == ("business", "old-crew")
    roles = sorted(
        await db_async.scalars(
            select(Membership.role).where(Membership.organisation_id == organisation_id)
        )
    )
    assert roles == ["admin", "admin", "owner"]
    async with events_db() as db:
        again = await backfill.backfill(db, db_async)
    assert (again.linked, again.memberships_created) == (0, 0)
    assert (
        await db_async.scalar(
            select(func.count())
            .select_from(PlatformOrganisation)
            .where(PlatformOrganisation.id == organisation_id)
        )
        == 1
    )


@pytest.mark.asyncio
async def test_backfill_repairs_an_interrupted_run(
    events_db: SessionFactory, db_async: AsyncSession
):
    user = await make_user(db_async)
    async with events_db() as db:
        organiser = Organiser(slug="half", name="Half")
        db.add(organiser)
        await db.flush()
        db.add(OrganiserMember(organiser_id=organiser.id, user_id=user.id))
        await db.commit()
        organiser_id = organiser.id
    # Platform side committed, Events column never set.
    await organisation_service.create_organisation(
        db_async,
        name="Half",
        slug="half-x",
        organisation_id=backfill.platform_id_for(organiser_id),
    )
    await db_async.commit()
    async with events_db() as db:
        result = await backfill.backfill(db, db_async)
    assert (result.linked, result.memberships_created) == (1, 1)
    async with events_db() as db:
        row = await db.scalar(select(Organiser))
        assert row is not None
        assert row.organisation_id == backfill.platform_id_for(organiser_id)


@pytest.mark.asyncio
async def test_new_organiser_creates_organisation_and_owner(
    events_db: SessionFactory, db_async: AsyncSession
):
    creator = await user_with_role(db_async, None)
    async with events_db() as db:
        organiser = await create_organiser(db, db_async, creator, name="Fresh Crew")
    assert organiser.organisation_id is not None
    assert organiser.organisation_id.startswith("org_")
    membership = await db_async.scalar(
        select(Membership).where(
            Membership.organisation_id == organiser.organisation_id
        )
    )
    assert membership is not None
    assert (membership.user_id, membership.role) == (creator.id, "owner")
    async with client_with_real_roles(creator) as client:
        response = await client.get(MANAGE)
        assert response.status_code == 200
        assert response.json()["organisation_id"] == organiser.organisation_id
