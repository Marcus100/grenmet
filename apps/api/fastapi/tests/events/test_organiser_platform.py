"""Organisers backed by platform organisations (F5, ADR-0022 decision 5)."""

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.events.models import Organiser, OrganiserMember
from src.events.service import create_organiser
from src.organisations import verification
from src.organisations.models import (
    Membership,
    MembershipRole,
    MembershipStatus,
)
from src.utils.datetime import utc_now
from tests.events.roles import user_with_role
from tests.events.support import BASE, SessionFactory, client_with_real_roles
from tests.events.test_organiser_admin import _organiser, _payload
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
        db_async, "Crew", members=((user, MembershipRole.ADMIN),), apps=("events",)
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
        db_async, "Crew", members=((user, MembershipRole.OWNER),), apps=("events",)
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
    first = await make_org(
        db_async, "Alpha", members=((user, MembershipRole.OWNER),), apps=("events",)
    )
    second = await make_org(
        db_async, "Beta", members=((user, MembershipRole.ADMIN),), apps=("events",)
    )
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
async def test_new_organiser_creates_organisation_and_owner(
    events_db: SessionFactory, db_async: AsyncSession
):
    creator = await user_with_role(db_async, None)
    async with events_db() as db:
        organiser = await create_organiser(db, creator, name="Fresh Crew")
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


@pytest.mark.asyncio
async def test_self_service_request_needs_a_verified_email(
    events_db: SessionFactory, db_async: AsyncSession
):
    from src.auth.email_verification import EmailNotVerifiedError
    from src.events import schemas
    from src.events.service import request_organiser

    requester = await user_with_role(db_async, None)
    requester.email_verified_at = None
    await db_async.commit()
    async with events_db() as db:
        with pytest.raises(EmailNotVerifiedError):
            await request_organiser(
                db, requester, schemas.OrganiserCreate(name="Nope Crew")
            )
        # the administrator-created path works for the same unverified account
        organiser = await create_organiser(db, requester, name="Admin Crew")
    assert organiser.organisation_id is not None


@pytest.mark.asyncio
async def test_new_organiser_refuses_a_reserved_address(
    events_db: SessionFactory, db_async: AsyncSession
):
    """The organiser's organisation takes the same slug, so ADR-0043 applies."""
    from src.events.exceptions import EventsConflict

    creator = await user_with_role(db_async, None)
    async with events_db() as db:
        with pytest.raises(EventsConflict):
            await create_organiser(db, creator, name="Studio", slug="studio")
