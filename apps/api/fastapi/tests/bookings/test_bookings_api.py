"""Bookings B1/B2: studio configuration, tenancy, the overlap guard and public pages."""

import uuid
from datetime import date, datetime, timedelta

import httpx
import pytest
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.models import User
from src.bookings import service
from src.bookings.models import Booking, BookingStatus, Customer
from src.organisations.models import MembershipRole
from tests.factories import make_user
from tests.organisations.support import headers_for, make_org

API = "/api/v1/bookings"
NEXT_YEAR_MONDAY = date(
    2027, 1, 4
)  # far enough ahead of lead time, inside no horizon check


async def _studio(db: AsyncSession) -> tuple[User, User, str]:
    owner = await make_user(db)
    member = await make_user(db)
    org = await make_org(
        db,
        f"Salon {uuid.uuid4().hex[:6]}",
        members=((owner, MembershipRole.OWNER), (member, MembershipRole.MEMBER)),
    )
    return owner, member, org.id


async def _configure(
    client: httpx.AsyncClient, owner: User, org_id: str, slug: str
) -> tuple[str, str]:
    headers = headers_for(owner, org_id)
    profile = await client.put(
        f"{API}/studio/profile",
        headers=headers,
        json={
            "public_slug": slug,
            "display_name": "Babydoll Beauty Bar",
            "enabled": True,
            "lead_time_min": 0,
            "horizon_days": 365,
        },
    )
    assert profile.status_code == 200, profile.text
    created = await client.post(
        f"{API}/studio/services",
        headers=headers,
        json={
            "name": "Classic full set",
            "duration_min": 120,
            "buffer_after_min": 15,
            "price_minor": 21000,
            "deposit_minor": 5000,
        },
    )
    assert created.status_code == 201, created.text
    service_id = created.json()["id"]
    provider = await client.post(
        f"{API}/studio/providers",
        headers=headers,
        json={"name": "Jeriann", "service_ids": [service_id]},
    )
    assert provider.status_code == 201, provider.text
    provider_id = provider.json()["id"]
    hours = await client.put(
        f"{API}/studio/providers/{provider_id}/hours",
        headers=headers,
        json={
            "periods": [
                {"weekday": 0, "start_time": "09:30", "end_time": "12:30"},
                {"weekday": 0, "start_time": "13:30", "end_time": "17:30"},
            ]
        },
    )
    assert hours.status_code == 200, hours.text
    return service_id, provider_id


@pytest.mark.asyncio
async def test_owner_configures_and_member_reads(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    owner, member, org_id = await _studio(db_async)
    service_id, provider_id = await _configure(
        async_client, owner, org_id, f"salon-{uuid.uuid4().hex[:6]}"
    )

    services = await async_client.get(
        f"{API}/studio/services", headers=headers_for(member, org_id)
    )
    assert services.status_code == 200
    assert [s["id"] for s in services.json()] == [service_id]

    providers = await async_client.get(
        f"{API}/studio/providers", headers=headers_for(member, org_id)
    )
    assert providers.json()[0]["service_ids"] == [service_id]

    hours = await async_client.get(
        f"{API}/studio/providers/{provider_id}/hours",
        headers=headers_for(member, org_id),
    )
    assert [(p["weekday"], p["start_time"]) for p in hours.json()] == [
        (0, "09:30:00"),
        (0, "13:30:00"),
    ]


@pytest.mark.asyncio
async def test_members_cannot_change_configuration(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    _, member, org_id = await _studio(db_async)
    response = await async_client.post(
        f"{API}/studio/services",
        headers=headers_for(member, org_id),
        json={"name": "Brow wax", "duration_min": 30},
    )
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_other_organisations_see_nothing(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    owner, _, org_id = await _studio(db_async)
    service_id, provider_id = await _configure(
        async_client, owner, org_id, f"salon-{uuid.uuid4().hex[:6]}"
    )
    rival, _, rival_org = await _studio(db_async)
    headers = headers_for(rival, rival_org)

    assert (
        await async_client.get(f"{API}/studio/services", headers=headers)
    ).json() == []
    assert (
        await async_client.patch(
            f"{API}/studio/services/{service_id}",
            headers=headers,
            json={"active": False},
        )
    ).status_code == 404
    assert (
        await async_client.get(
            f"{API}/studio/providers/{provider_id}/hours", headers=headers
        )
    ).status_code == 404
    # A rival cannot attach another organisation's service to its own provider.
    attach = await async_client.post(
        f"{API}/studio/providers",
        headers=headers,
        json={"name": "Spy", "service_ids": [service_id]},
    )
    assert attach.status_code == 404
    # Without the organisation header the request is refused.
    assert (
        await async_client.get(f"{API}/studio/services", headers=headers_for(rival))
    ).status_code == 400


@pytest.mark.asyncio
async def test_slug_is_unique_across_organisations(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    slug = f"salon-{uuid.uuid4().hex[:6]}"
    owner, _, org_id = await _studio(db_async)
    await _configure(async_client, owner, org_id, slug)
    other, _, other_org = await _studio(db_async)
    clash = await async_client.put(
        f"{API}/studio/profile",
        headers=headers_for(other, other_org),
        json={"public_slug": slug, "display_name": "Copycat"},
    )
    assert clash.status_code == 409


@pytest.mark.asyncio
async def test_invalid_configuration_is_rejected(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    owner, _, org_id = await _studio(db_async)
    headers = headers_for(owner, org_id)
    bad_timezone = await async_client.put(
        f"{API}/studio/profile",
        headers=headers,
        json={"public_slug": "fine-slug", "display_name": "X", "timezone": "Mars/Base"},
    )
    assert bad_timezone.status_code == 422
    no_token = await async_client.put(
        f"{API}/studio/profile",
        headers=headers,
        json={
            "public_slug": "fine-slug",
            "display_name": "X",
            "manage_url_template": "http://example.com/booking",
        },
    )
    assert no_token.status_code == 422
    deposit = await async_client.post(
        f"{API}/studio/services",
        headers=headers,
        json={
            "name": "Lash lift",
            "duration_min": 60,
            "price_minor": 100,
            "deposit_minor": 500,
        },
    )
    assert deposit.status_code == 422
    provider = await async_client.post(
        f"{API}/studio/providers", headers=headers, json={"name": "Jeriann"}
    )
    overlap = await async_client.put(
        f"{API}/studio/providers/{provider.json()['id']}/hours",
        headers=headers,
        json={
            "periods": [
                {"weekday": 1, "start_time": "09:00", "end_time": "12:00"},
                {"weekday": 1, "start_time": "11:00", "end_time": "13:00"},
            ]
        },
    )
    assert overlap.status_code == 422


async def _booking(
    db: AsyncSession,
    *,
    org_id: str,
    service_id: str,
    provider_id: str,
    starts_at: datetime,
    minutes: int = 120,
    status: BookingStatus = BookingStatus.CONFIRMED,
) -> Booking:
    customer = Customer(organisation_id=org_id, name="Test client")
    db.add(customer)
    await db.flush()
    ends_at = starts_at + timedelta(minutes=minutes)
    booking = Booking(
        organisation_id=org_id,
        provider_id=uuid.UUID(provider_id),
        service_id=uuid.UUID(service_id),
        customer_id=customer.id,
        starts_at=starts_at,
        ends_at=ends_at,
        blocked_from=starts_at,
        blocked_until=ends_at + timedelta(minutes=15),
        status=status.value,
        currency="XCD",
    )
    db.add(booking)
    await db.commit()
    return booking


@pytest.mark.asyncio
async def test_database_refuses_overlapping_active_bookings(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    owner, _, org_id = await _studio(db_async)
    service_id, provider_id = await _configure(
        async_client, owner, org_id, f"salon-{uuid.uuid4().hex[:6]}"
    )
    start = datetime(2027, 1, 4, 14, 0)
    await _booking(
        db_async,
        org_id=org_id,
        service_id=service_id,
        provider_id=provider_id,
        starts_at=start,
    )

    with pytest.raises(IntegrityError) as caught:
        await _booking(
            db_async,
            org_id=org_id,
            service_id=service_id,
            provider_id=provider_id,
            starts_at=start + timedelta(minutes=60),
        )
    assert service.is_overlap_violation(caught.value)
    await db_async.rollback()

    # Cancelled bookings free their time.
    cancelled = await _booking(
        db_async,
        org_id=org_id,
        service_id=service_id,
        provider_id=provider_id,
        starts_at=start + timedelta(days=1),
        status=BookingStatus.CANCELLED,
    )
    again = await _booking(
        db_async,
        org_id=org_id,
        service_id=service_id,
        provider_id=provider_id,
        starts_at=cancelled.starts_at,
    )
    assert again.id != cancelled.id


@pytest.mark.asyncio
async def test_public_storefront_and_availability(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    slug = f"salon-{uuid.uuid4().hex[:6]}"
    owner, _, org_id = await _studio(db_async)
    service_id, provider_id = await _configure(async_client, owner, org_id, slug)

    page = await async_client.get(f"{API}/public/{slug}")
    assert page.status_code == 200
    body = page.json()
    assert body["display_name"] == "Babydoll Beauty Bar"
    assert body["services"][0]["price_minor"] == 21000
    assert body["providers"][0]["service_ids"] == [service_id]

    params = {
        "service_id": service_id,
        "first_day": NEXT_YEAR_MONDAY.isoformat(),
        "last_day": NEXT_YEAR_MONDAY.isoformat(),
    }
    open_before = (
        await async_client.get(f"{API}/public/{slug}/availability", params=params)
    ).json()
    starts = [s["starts_at"] for s in open_before["slots"]]
    # 120-minute service, 30-minute step, 09:30-12:30 and 13:30-17:30 Grenada (UTC-4).
    assert starts[0] == "2027-01-04T13:30:00Z"
    assert "2027-01-04T15:30:00Z" not in starts  # would run into the lunch break
    assert open_before["timezone"] == "America/Grenada"

    # A confirmed 10:00 local booking (14:00 UTC, blocks to 16:15) removes overlapping slots.
    await _booking(
        db_async,
        org_id=org_id,
        service_id=service_id,
        provider_id=provider_id,
        starts_at=datetime(2027, 1, 4, 14, 0),
    )
    open_after = (
        await async_client.get(f"{API}/public/{slug}/availability", params=params)
    ).json()
    after = [s["starts_at"] for s in open_after["slots"]]
    assert "2027-01-04T13:30:00Z" not in after
    assert "2027-01-04T17:30:00Z" in after
    assert all(s["provider_ids"] == [provider_id] for s in open_after["slots"])


@pytest.mark.asyncio
async def test_public_page_hidden_when_disabled_or_unknown(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    slug = f"salon-{uuid.uuid4().hex[:6]}"
    owner, _, org_id = await _studio(db_async)
    await _configure(async_client, owner, org_id, slug)
    await async_client.put(
        f"{API}/studio/profile",
        headers=headers_for(owner, org_id),
        json={"public_slug": slug, "display_name": "Babydoll", "enabled": False},
    )
    assert (await async_client.get(f"{API}/public/{slug}")).status_code == 404
    assert (await async_client.get(f"{API}/public/nobody-here")).status_code == 404


@pytest.mark.asyncio
async def test_availability_range_is_limited(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    slug = f"salon-{uuid.uuid4().hex[:6]}"
    owner, _, org_id = await _studio(db_async)
    service_id, _ = await _configure(async_client, owner, org_id, slug)
    response = await async_client.get(
        f"{API}/public/{slug}/availability",
        params={
            "service_id": service_id,
            "first_day": NEXT_YEAR_MONDAY.isoformat(),
            "last_day": (NEXT_YEAR_MONDAY + timedelta(days=30)).isoformat(),
        },
    )
    assert response.status_code == 422
