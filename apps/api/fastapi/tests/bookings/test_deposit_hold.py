"""Bookings: per-business hold time for unpaid deposits (issue #1752).

The hold is ``profile.deposit_hold_minutes`` (null = 30 minutes). A payment-link or
manual deposit may hold up to 7 days; an online Stripe checkout is capped at 120
minutes. A business-collected deposit is never held, so the sweeper never cancels it.
"""

from datetime import timedelta

import httpx
import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from src.bookings import deposit_payments, deposits
from src.bookings.models import BookingStatus
from src.utils.datetime import utc_now
from tests.bookings.booking_day import DAY, MONDAY
from tests.bookings.test_deposits import (
    _book_deposit,
    _deposit_studio,
    _intent,
    _pay_manually,
)
from tests.bookings.test_public_bookings import API, _booking_for, _studio
from tests.payments import conftest as payments_conftest

stripe_env = payments_conftest.stripe_env


# --- pure rule -------------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("profile_minutes", "online", "expected"),
    [
        (None, False, 30),
        (None, True, 30),
        (45, False, 45),
        (10080, False, 10080),
        (10080, True, 120),
        (90, True, 90),
        (120, True, 120),
    ],
)
def test_hold_minutes_for_each_route(
    profile_minutes: int | None, online: bool, expected: int
) -> None:
    assert deposit_payments.hold_minutes_for(profile_minutes, online=online) == expected


# --- profile validation ----------------------------------------------------------------------


@pytest.mark.parametrize(("value", "status"), [(0, 422), (10081, 422), (10080, 200)])
async def test_profile_accepts_one_minute_to_seven_days_only(
    db_async: AsyncSession, async_client: httpx.AsyncClient, value: int, status: int
) -> None:
    studio = await _studio(db_async, async_client)
    response = await async_client.put(
        f"{API}/org/profile",
        headers=studio.headers,
        json={
            "public_slug": studio.slug,
            "display_name": "Salon",
            "deposit_hold_minutes": value,
        },
    )
    assert response.status_code == status, response.text
    if status == 200:
        assert response.json()["deposit_hold_minutes"] == value


async def test_a_put_without_the_hold_keeps_the_stored_value(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client, deposit_hold_minutes=1440)
    response = await async_client.put(
        f"{API}/org/profile",
        headers=studio.headers,
        json={"public_slug": studio.slug, "display_name": "Salon"},
    )
    assert response.status_code == 200, response.text
    assert response.json()["deposit_hold_minutes"] == 1440


# --- expiry sweeper per profile value --------------------------------------------------------


@pytest.mark.parametrize(
    ("profile_hold", "before_minutes", "after_minutes"),
    [
        (None, 25, 35),  # default: 30 minutes
        (45, 40, 50),  # short bank-transfer style hold
        (1440, 60 * 23, 60 * 25),  # a day
        (10080, 60 * 24 * 6, 60 * 24 * 8),  # seven days
    ],
)
async def test_expiry_uses_the_business_hold(
    db_async: AsyncSession,
    async_client: httpx.AsyncClient,
    profile_hold: int | None,
    before_minutes: int,
    after_minutes: int,
) -> None:
    studio = await _deposit_studio(
        db_async, async_client, deposit_hold_minutes=profile_hold
    )
    receipt = await _book_deposit(async_client, studio, db=db_async)
    booking_id = receipt["booking"]["id"]
    created = (await _booking_for(db_async, booking_id)).created_at

    early = created + timedelta(minutes=before_minutes)
    assert (
        await deposits.expire_unpaid(db_async, now=early, organisation_id=studio.org_id)
        == 0
    )
    late = created + timedelta(minutes=after_minutes)
    assert (
        await deposits.expire_unpaid(db_async, now=late, organisation_id=studio.org_id)
        == 1
    )
    await db_async.commit()
    booking = await _booking_for(db_async, booking_id)
    assert booking.status == BookingStatus.CANCELLED.value


@pytest.mark.usefixtures("stripe_env")
async def test_an_online_checkout_is_held_at_most_120_minutes(
    db_async: AsyncSession,
    async_client: httpx.AsyncClient,
) -> None:
    studio = await _deposit_studio(db_async, async_client, deposit_hold_minutes=1440)
    receipt = await _book_deposit(async_client, studio, db=db_async)
    booking_id = receipt["booking"]["id"]
    intent = await _intent(db_async, booking_id)
    assert intent is not None
    assert intent.provider == "stripe"
    created = (await _booking_for(db_async, booking_id)).created_at

    assert (
        await deposits.expire_unpaid(
            db_async,
            now=created + timedelta(minutes=100),
            organisation_id=studio.org_id,
        )
        == 0
    )
    assert (
        await deposits.expire_unpaid(
            db_async,
            now=created + timedelta(minutes=125),
            organisation_id=studio.org_id,
        )
        == 1
    )


async def test_a_paid_deposit_is_not_expired_whatever_the_hold(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _deposit_studio(db_async, async_client, deposit_hold_minutes=10080)
    receipt = await _book_deposit(async_client, studio, db=db_async)
    booking_id = receipt["booking"]["id"]
    intent = await _intent(db_async, booking_id)
    assert intent is not None
    await _pay_manually(async_client, studio, intent.id)
    later = utc_now() + timedelta(days=30)
    assert (
        await deposits.expire_unpaid(db_async, now=later, organisation_id=studio.org_id)
        == 0
    )


# --- business-collected deposits are never held ----------------------------------------------


async def test_a_business_collected_deposit_is_never_auto_cancelled(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _deposit_studio(
        db_async,
        async_client,
        deposit_collection="business",
        deposit_instructions="Bank: 123",
        deposit_hold_minutes=60,
    )
    receipt = await _book_deposit(async_client, studio, db=db_async, verify=False)
    booking = receipt["booking"]
    assert booking["status"] != BookingStatus.PENDING_PAYMENT.value
    assert booking["hold_ends_at"] is None
    assert booking["hold_minutes"] is None
    seven_days = utc_now() + timedelta(days=7)
    assert (
        await deposits.expire_unpaid(
            db_async, now=seven_days, organisation_id=studio.org_id
        )
        == 0
    )
    stored = await _booking_for(db_async, booking["id"])
    assert stored.status == booking["status"]


# --- public field ---------------------------------------------------------------------------


async def test_the_booking_page_shows_the_effective_hold(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _deposit_studio(db_async, async_client, deposit_hold_minutes=1440)
    receipt = await _book_deposit(async_client, studio, db=db_async)
    booking = receipt["booking"]
    assert booking["hold_minutes"] == 1440
    created = (await _booking_for(db_async, booking["id"])).created_at
    assert booking["hold_ends_at"].startswith(
        (created + timedelta(minutes=1440)).strftime("%Y-%m-%dT%H:%M")
    )


async def test_a_default_hold_is_30_minutes_on_the_booking_page(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _deposit_studio(db_async, async_client)
    receipt = await _book_deposit(async_client, studio, db=db_async)
    assert receipt["booking"]["hold_minutes"] == 30


@pytest.mark.usefixtures("stripe_env")
async def test_the_online_checkout_page_shows_at_most_120(
    db_async: AsyncSession,
    async_client: httpx.AsyncClient,
) -> None:
    studio = await _deposit_studio(db_async, async_client, deposit_hold_minutes=1440)
    receipt = await _book_deposit(async_client, studio, db=db_async)
    assert receipt["booking"]["hold_minutes"] == 120


# --- agenda flag -----------------------------------------------------------------------------


async def _agenda_items(
    client: httpx.AsyncClient, studio_headers: dict[str, str]
) -> list[dict]:
    response = await client.get(
        f"{API}/org/agenda",
        headers=studio_headers,
        params={"from_date": DAY, "to_date": (MONDAY + timedelta(days=6)).isoformat()},
    )
    assert response.status_code == 200, response.text
    return [item for day in response.json()["days"] for item in day["bookings"]]


async def test_agenda_flags_a_hold_expiring_within_two_hours(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    short = await _deposit_studio(db_async, async_client)  # 30 minutes
    receipt = await _book_deposit(async_client, short, db=db_async)
    items = await _agenda_items(async_client, short.headers)
    item = next(i for i in items if i["id"] == receipt["booking"]["id"])
    assert item["status"] == BookingStatus.PENDING_PAYMENT.value
    assert item["hold_expires_soon"] is True
    assert item["hold_expires_at"] is not None


async def test_agenda_does_not_flag_a_long_hold(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    long_hold = await _deposit_studio(db_async, async_client, deposit_hold_minutes=1440)
    receipt = await _book_deposit(async_client, long_hold, db=db_async)
    items = await _agenda_items(async_client, long_hold.headers)
    item = next(i for i in items if i["id"] == receipt["booking"]["id"])
    assert item["hold_expires_soon"] is False
    assert item["hold_expires_at"] is not None


async def test_agenda_shows_an_unpaid_business_collected_deposit_as_due(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _deposit_studio(
        db_async,
        async_client,
        deposit_collection="business",
        deposit_instructions="Bank: 123",
    )
    receipt = await _book_deposit(async_client, studio, db=db_async, verify=False)
    items = await _agenda_items(async_client, studio.headers)
    item = next(i for i in items if i["id"] == receipt["booking"]["id"])
    assert item["deposit_minor"] == 0
    assert item["deposit_to_business_minor"] == 5000
    assert item["deposit_received_at"] is None
    assert item["hold_expires_at"] is None
    assert item["hold_expires_soon"] is False
