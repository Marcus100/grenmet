"""The last owner of a self-created business leaves (ADR-0066 item 7).

Account deletion runs ``owner_leaves`` before the owner's memberships end. For a
business its own account created, where that account was the last active owner, online
booking closes, the business is unlisted, the owner's provider is renamed "Staff",
pending requests nobody can confirm are declined with the usual mail, and the business
is flagged for staff. Nothing is deleted, and confirmed bookings stay as they are.
"""

import uuid

import httpx
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from src.audit.models import AuditEntry
from src.auth import service as auth_service
from src.auth.models import User
from src.bookings.models import BookingProfile, BookingStatus, Provider
from src.bookings.owner_leaves import DECLINE_REASON
from src.organisations import service as organisation_service
from src.organisations.models import (
    Membership,
    MembershipRole,
    PlatformOrganisation,
)
from tests.bookings.test_public_bookings import (
    API,
    Studio,
    _book,
    _booking_for,
    _emails,
    _slots,
    _studio,
)
from tests.factories import make_user


async def _owner(db: AsyncSession, org_id: str) -> User:
    user_id = await db.scalar(
        select(Membership.user_id).where(
            Membership.organisation_id == org_id,
            Membership.role == MembershipRole.OWNER.value,
        )
    )
    assert user_id is not None
    user = await db.get(User, user_id)
    assert user is not None
    return user


async def _request(client: httpx.AsyncClient, studio: Studio, slot: int) -> str:
    """Book the slot ``slot`` of the business's open times; returns the booking id."""
    slots = await _slots(client, studio)
    response = await _book(client, studio, slots[slot])
    assert response.status_code == 201, response.text
    booking_id: str = response.json()["booking"]["id"]
    return booking_id


async def _self_created(
    db: AsyncSession, client: httpx.AsyncClient
) -> tuple[Studio, str, str]:
    """A listed business whose owner made it, with one pending request and one that
    staff confirmed. Returns the studio, the pending and the confirmed booking ids."""
    studio = await _studio(db, client, requires_confirmation=True, listed=True)
    pending = await _request(client, studio, 0)
    confirmed = await _request(client, studio, 0)
    response = await client.post(
        f"{API}/org/bookings/{confirmed}/confirm", headers=studio.headers
    )
    assert response.status_code == 200, response.text
    owner = await _owner(db, studio.org_id)
    await db.execute(
        update(PlatformOrganisation)
        .where(PlatformOrganisation.id == studio.org_id)
        .values(created_by_user_id=owner.id)
    )
    await db.execute(
        update(BookingProfile)
        .where(BookingProfile.organisation_id == studio.org_id)
        .values(owner_provider_id=uuid.UUID(studio.provider_ids[0]))
    )
    await db.commit()
    return studio, pending, confirmed


async def _profile(db: AsyncSession, org_id: str) -> BookingProfile:
    db.expire_all()
    profile = await db.scalar(
        select(BookingProfile).where(BookingProfile.organisation_id == org_id)
    )
    assert profile is not None
    return profile


async def test_the_last_owner_leaving_closes_unlists_and_flags_the_business(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio, pending, confirmed = await _self_created(db_async, async_client)
    owner = await _owner(db_async, studio.org_id)

    await auth_service.delete_user(session=db_async, user=owner)
    await db_async.commit()

    profile = await _profile(db_async, studio.org_id)
    assert profile.enabled is False
    assert profile.listed is False
    assert profile.owner_left_at is not None
    provider = await db_async.get(Provider, uuid.UUID(studio.provider_ids[0]))
    assert provider is not None
    assert provider.name == "Staff"


async def test_pending_requests_are_declined_with_the_usual_mail(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio, pending, confirmed = await _self_created(db_async, async_client)
    owner = await _owner(db_async, studio.org_id)

    await auth_service.delete_user(session=db_async, user=owner)
    await db_async.commit()

    db_async.expire_all()
    declined = await _booking_for(db_async, pending)
    assert declined.status == BookingStatus.CANCELLED.value
    assert declined.cancel_reason == DECLINE_REASON
    kept = await _booking_for(db_async, confirmed)
    assert kept.status == BookingStatus.CONFIRMED.value
    keys = {mail.dedupe_key for mail in await _emails(db_async, studio.org_id)}
    assert f"booking-declined:{pending}" in keys


async def test_the_change_is_audited_and_nothing_is_deleted(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio, pending, confirmed = await _self_created(db_async, async_client)
    owner = await _owner(db_async, studio.org_id)

    await auth_service.delete_user(session=db_async, user=owner)
    await db_async.commit()

    actions = set(
        await db_async.scalars(
            select(AuditEntry.action).where(
                AuditEntry.entity_type == "booking_profile",
                AuditEntry.organisation_id == studio.org_id,
            )
        )
    )
    assert "owner_left" in actions
    assert await _profile(db_async, studio.org_id) is not None
    assert await _booking_for(db_async, confirmed) is not None


async def test_a_remaining_owner_means_nothing_changes(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio, pending, _ = await _self_created(db_async, async_client)
    second = await make_user(db_async)
    await organisation_service.add_member(
        db_async,
        organisation_id=studio.org_id,
        user_id=second.id,
        role=MembershipRole.OWNER,
    )
    await db_async.commit()
    owner = await _owner(db_async, studio.org_id)
    assert owner.id != second.id

    await auth_service.delete_user(session=db_async, user=owner)
    await db_async.commit()

    profile = await _profile(db_async, studio.org_id)
    assert profile.enabled is True
    assert profile.listed is True
    assert profile.owner_left_at is None
    assert (await _booking_for(db_async, pending)).status == (
        BookingStatus.PENDING.value
    )


async def test_an_admin_who_can_confirm_keeps_pending_requests(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio, pending, _ = await _self_created(db_async, async_client)
    admin = await make_user(db_async)
    await organisation_service.add_member(
        db_async,
        organisation_id=studio.org_id,
        user_id=admin.id,
        role=MembershipRole.ADMIN,
    )
    await db_async.commit()
    owner = await _owner(db_async, studio.org_id)

    await auth_service.delete_user(session=db_async, user=owner)
    await db_async.commit()

    profile = await _profile(db_async, studio.org_id)
    assert profile.owner_left_at is not None
    assert profile.enabled is False
    assert (await _booking_for(db_async, pending)).status == (
        BookingStatus.PENDING.value
    )


async def test_a_business_barrels_set_up_is_left_alone(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client, requires_confirmation=True)
    pending = await _request(async_client, studio, 0)
    owner = await _owner(db_async, studio.org_id)

    await auth_service.delete_user(session=db_async, user=owner)
    await db_async.commit()

    profile = await _profile(db_async, studio.org_id)
    assert profile.enabled is True
    assert profile.owner_left_at is None
    assert (await _booking_for(db_async, pending)).status == (
        BookingStatus.PENDING.value
    )
