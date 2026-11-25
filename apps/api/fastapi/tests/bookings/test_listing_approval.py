"""Barrels staff approve a business's home page listing (ADR-0066 item 4).

A listed business appears on ``GET /bookings/public/businesses`` only once a Barrels
staff member approved it. Approve and withdraw need ``bookings.listing.approve``, are
audited, and refuse a repeat with 409. The business's own booking page works by its
link whether or not it is approved.
"""

import uuid
from typing import Any

import httpx
import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.audit.models import AuditEntry
from src.auth import service as auth_service
from src.auth.models import User
from src.bookings.models import BookingProfile
from src.config import settings
from src.organisations.models import (
    Membership,
    MembershipRole,
    PlatformOrganisation,
)
from tests.bookings.test_public_bookings import API, Studio, _studio
from tests.bookings.test_public_listing import _page, _slugs

APPROVE = "listing/approve"
WITHDRAW = "listing/withdraw"


@pytest.fixture
async def superuser_async(db_async: AsyncSession) -> User:
    user = await auth_service.get_user_by_email(
        session=db_async, email=str(settings.FIRST_SUPERUSER)
    )
    assert user is not None
    return user


def _review_url(org_id: str, action: str = "listing") -> str:
    return f"{API}/admin/businesses/{org_id}/{action}"


async def _listed(db: AsyncSession, client: httpx.AsyncClient) -> Studio:
    return await _studio(db, client, display_name="Waiting Salon", listed=True)


async def _profile(db: AsyncSession, org_id: str) -> BookingProfile:
    db.expire_all()
    profile = await db.scalar(
        select(BookingProfile).where(BookingProfile.organisation_id == org_id)
    )
    assert profile is not None
    return profile


async def test_a_listed_business_waits_for_staff_approval(
    db_async: AsyncSession,
    async_client: httpx.AsyncClient,
    superuser_token_headers_async: dict[str, str],
) -> None:
    studio = await _listed(db_async, async_client)
    assert studio.slug not in _slugs(await _page(async_client))

    response = await async_client.post(
        _review_url(studio.org_id, APPROVE), headers=superuser_token_headers_async
    )
    assert response.status_code == 200, response.text
    body: dict[str, Any] = response.json()
    assert body["listing_approved_at"] is not None
    assert body["listed"] is True

    assert studio.slug in _slugs(await _page(async_client))


async def test_approval_is_recorded_once_and_withdrawal_hides_the_card(
    db_async: AsyncSession,
    async_client: httpx.AsyncClient,
    superuser_token_headers_async: dict[str, str],
    superuser_async: User,
) -> None:
    studio = await _listed(db_async, async_client)
    approve_url = _review_url(studio.org_id, APPROVE)
    withdraw_url = _review_url(studio.org_id, WITHDRAW)

    first = await async_client.post(approve_url, headers=superuser_token_headers_async)
    assert first.status_code == 200, first.text
    assert first.json()["listing_approved_by_user_id"] == str(superuser_async.id)
    again = await async_client.post(approve_url, headers=superuser_token_headers_async)
    assert again.status_code == 409

    withdrawn = await async_client.post(
        withdraw_url, headers=superuser_token_headers_async
    )
    assert withdrawn.status_code == 200, withdrawn.text
    assert withdrawn.json()["listing_approved_at"] is None
    assert studio.slug not in _slugs(await _page(async_client))
    twice = await async_client.post(withdraw_url, headers=superuser_token_headers_async)
    assert twice.status_code == 409

    entries = list(
        await db_async.scalars(
            select(AuditEntry).where(
                AuditEntry.entity_type == "booking_profile",
                AuditEntry.organisation_id == studio.org_id,
            )
        )
    )
    assert sorted(entry.action for entry in entries) == [
        "listing_approve",
        "listing_withdraw",
    ]
    assert all(entry.actor_user_id == superuser_async.id for entry in entries)


async def test_a_business_page_works_by_link_while_unapproved(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _listed(db_async, async_client)

    response = await async_client.get(f"{API}/public/{studio.slug}")
    assert response.status_code == 200, response.text


async def test_only_staff_with_the_permission_can_approve_or_read_the_review(
    db_async: AsyncSession,
    async_client: httpx.AsyncClient,
    normal_user_token_headers_async: dict[str, str],
) -> None:
    studio = await _listed(db_async, async_client)

    approve = await async_client.post(
        _review_url(studio.org_id, APPROVE), headers=normal_user_token_headers_async
    )
    assert approve.status_code == 403
    read = await async_client.get(
        _review_url(studio.org_id), headers=normal_user_token_headers_async
    )
    assert read.status_code == 403

    profile = await _profile(db_async, studio.org_id)
    assert profile.listing_approved_at is None


async def test_an_unknown_business_is_404(
    async_client: httpx.AsyncClient,
    superuser_token_headers_async: dict[str, str],
) -> None:
    response = await async_client.post(
        _review_url(f"org_{uuid.uuid4().hex[:12]}", APPROVE),
        headers=superuser_token_headers_async,
    )
    assert response.status_code == 404


async def test_the_review_flags_a_self_created_business(
    db_async: AsyncSession,
    async_client: httpx.AsyncClient,
    superuser_token_headers_async: dict[str, str],
) -> None:
    studio = await _listed(db_async, async_client)
    before = await async_client.get(
        _review_url(studio.org_id), headers=superuser_token_headers_async
    )
    assert before.status_code == 200, before.text
    assert before.json()["self_created"] is False
    assert before.json()["owner_left_at"] is None

    owner_id = await db_async.scalar(
        select(Membership.user_id).where(
            Membership.organisation_id == studio.org_id,
            Membership.role == MembershipRole.OWNER.value,
        )
    )
    organisation = await db_async.get(PlatformOrganisation, studio.org_id)
    assert organisation is not None
    organisation.created_by_user_id = owner_id
    await db_async.commit()

    after = await async_client.get(
        _review_url(studio.org_id), headers=superuser_token_headers_async
    )
    assert after.json()["self_created"] is True
