"""Display-only "deposit paid to the business" mode, and the structured late fee.

No money moves through Barrels in this mode: the booking records the amount the
customer was told to pay, shows the business's instructions and goes the normal
request or confirmed way. Service price in these tests is 21000 minor."""

import uuid

import httpx
import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.bookings import deposit_payments
from src.bookings.models import Booking, Service
from src.payments.models import Intent
from tests.bookings.test_public_bookings import (
    API,
    Studio,
    _book,
    _emails,
    _slots,
    _studio,
)
from tests.email_payload import payload_text

INSTRUCTIONS = "Send it by PayPal to pay@babydoll.example\nUse your name as the note."


async def _business(
    db: AsyncSession,
    client: httpx.AsyncClient,
    *,
    apps: tuple[str, ...] = ("bookings",),
    **profile: object,
) -> Studio:
    settings: dict[str, object] = {
        "deposit_collection": "business",
        "deposit_instructions": INSTRUCTIONS,
        "deposit_mode": "percent",
        "deposit_percent": 25,
        **profile,
    }
    return await _studio(db, client, apps=apps, **settings)


async def _booked(client: httpx.AsyncClient, studio: Studio) -> dict:
    starts_at = (await _slots(client, studio))[0]
    response = await _book(client, studio, starts_at)
    assert response.status_code == 201, response.text
    return response.json()


async def _intents(db: AsyncSession, studio: Studio) -> int:
    return (
        await db.scalar(
            select(func.count())
            .select_from(Intent)
            .where(Intent.organisation_id == studio.org_id)
        )
        or 0
    )


# --- the booking ------------------------------------------------------------------------


async def test_business_mode_records_the_amount_without_the_payments_entitlement(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _business(db_async, async_client, requires_confirmation=True)
    receipt = await _booked(async_client, studio)
    booking = receipt["booking"]
    assert receipt["payment_required"] is False
    assert receipt["checkout_url"] is None
    assert booking["status"] == "pending"
    assert booking["deposit_minor"] == 0
    assert booking["payment"] is None
    # 25% of 21000, rounded up to whole units.
    assert booking["deposit_to_business_minor"] == 5300
    # A request: the amount is stated, how to pay it only once the business accepts.
    assert booking["deposit_instructions"] is None
    assert await _intents(db_async, studio) == 0
    stored = await db_async.get(Booking, uuid.UUID(booking["id"]))
    assert stored is not None
    assert stored.deposit_to_business_minor == 5300

    accepted = await async_client.post(
        f"{API}/org/bookings/{booking['id']}/confirm", headers=studio.headers
    )
    assert accepted.status_code == 200, accepted.text
    view = await async_client.get(f"{API}/public/bookings/{receipt['manage_token']}")
    assert view.json()["status"] == "confirmed"
    assert view.json()["deposit_instructions"] == INSTRUCTIONS


async def test_business_mode_confirms_straight_away_when_no_confirmation_is_needed(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _business(db_async, async_client, requires_confirmation=False)
    booking = (await _booked(async_client, studio))["booking"]
    assert booking["status"] == "confirmed"
    assert booking["deposit_to_business_minor"] == 5300


async def test_the_request_email_asks_for_nothing_and_the_accepted_one_says_how_to_pay(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _business(
        db_async,
        async_client,
        requires_confirmation=True,
        deposit_non_refundable=True,
    )
    receipt = await _booked(async_client, studio)
    rows = await _emails(db_async, studio.org_id)
    mail = next(r for r in rows if r.dedupe_key.startswith("booking-confirmation:"))
    text = payload_text(mail.payload)
    # The request: the amount that follows, but nothing to pay and no instructions.
    assert "Nothing to pay yet: you then pay a deposit of XCD 53.00 directly to" in text
    assert "Deposit to pay" not in text
    assert "Send it by PayPal to pay@babydoll.example" not in text
    assert "Your deposit is non-refundable" in text

    accepted = await async_client.post(
        f"{API}/org/bookings/{receipt['booking']['id']}/confirm",
        headers=studio.headers,
    )
    assert accepted.status_code == 200, accepted.text
    rows = await _emails(db_async, studio.org_id)
    mail = next(r for r in rows if r.dedupe_key.startswith("booking-confirmed:"))
    text = payload_text(mail.payload)
    assert "Deposit to pay" in text
    assert "XCD 53.00" in text
    assert "Send it by PayPal to pay@babydoll.example" in text
    assert "Use your name as the note." in text
    assert "Your deposit is non-refundable" in text
    # The instructions are labelled as the business's own, not a Barrels request.
    assert "paid directly to" in text
    assert "not through Barrels" in text


async def test_the_confirmed_email_shows_the_deposit_due(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _business(db_async, async_client, requires_confirmation=False)
    await _booked(async_client, studio)
    rows = await _emails(db_async, studio.org_id)
    mail = next(r for r in rows if r.dedupe_key.startswith("booking-confirmation:"))
    text = payload_text(mail.payload)
    assert "Deposit to pay" in text
    assert "XCD 53.00" in text
    assert "Use your name as the note." in text


async def test_a_service_at_or_below_the_minimum_price_gets_no_deposit(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _business(db_async, async_client, deposit_min_price_minor=21001)
    booking = (await _booked(async_client, studio))["booking"]
    assert booking["deposit_to_business_minor"] == 0
    assert booking["deposit_instructions"] is None
    rows = await _emails(db_async, studio.org_id)
    mail = next(r for r in rows if r.dedupe_key.startswith("booking-confirmation:"))
    assert "Deposit to pay" not in payload_text(mail.payload)


async def test_the_service_deposit_overrides_the_business_rule(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _business(db_async, async_client)
    svc = await db_async.get(Service, uuid.UUID(studio.service_id))
    assert svc is not None
    svc.deposit_minor = 4000
    await db_async.commit()
    booking = (await _booked(async_client, studio))["booking"]
    assert booking["deposit_to_business_minor"] == 4000
    assert booking["deposit_minor"] == 0


async def test_online_mode_is_unchanged_and_records_nothing_for_the_business(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _business(db_async, async_client, deposit_collection="online")
    booking = (await _booked(async_client, studio))["booking"]
    assert booking["deposit_to_business_minor"] == 0
    assert booking["deposit_instructions"] is None
    assert booking["deposit_minor"] == 0  # no payments entitlement: none, as before


async def test_business_mode_never_charges_online_even_with_payments(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _business(
        db_async,
        async_client,
        apps=("bookings", "payments"),
        payment_at_booking="full_price",
    )
    receipt = await _booked(async_client, studio)
    booking = receipt["booking"]
    assert receipt["payment_required"] is False
    assert booking["status"] != "pending_payment"
    assert booking["deposit_minor"] == 0
    assert booking["deposit_to_business_minor"] == 5300
    assert await _intents(db_async, studio) == 0
    profile = await async_client.get(f"{API}/org/profile", headers=studio.headers)
    assert profile.status_code == 200
    storefront = await async_client.get(f"{API}/public/{studio.slug}")
    assert storefront.json()["services"][0]["due_at_booking_minor"] == 0


def test_business_mode_functions_never_charge(monkeypatch: pytest.MonkeyPatch) -> None:
    from src.bookings.models import BookingProfile

    profile = BookingProfile(
        deposit_collection="business",
        payment_at_booking="full_price",
        deposit_mode="percent",
        deposit_percent=25,
    )
    monkeypatch.setattr(deposit_payments, "stripe_available", lambda: True)
    assert deposit_payments.charges_full_price(profile) is False
    svc = Service(price_minor=21000, deposit_minor=0)
    assert deposit_payments.deposit_to_business(profile, svc) == 5300
    profile.deposit_collection = "online"
    assert deposit_payments.deposit_to_business(profile, svc) == 0


# --- the public surfaces ------------------------------------------------------------------


async def test_the_storefront_shows_the_mode_the_instructions_and_the_amount(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _business(db_async, async_client)
    data = (await async_client.get(f"{API}/public/{studio.slug}")).json()
    assert data["deposit_collection"] == "business"
    assert data["deposit_instructions"] == INSTRUCTIONS
    assert data["late_fee"] is None
    service = data["services"][0]
    assert service["deposit_to_business_minor"] == 5300
    assert service["due_at_booking_minor"] == 0


async def test_online_storefront_has_no_business_deposit(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _business(db_async, async_client, deposit_collection="online")
    data = (await async_client.get(f"{API}/public/{studio.slug}")).json()
    assert data["deposit_collection"] == "online"
    assert data["services"][0]["deposit_to_business_minor"] == 0
    # Stored instructions stay private once the business collects online again.
    assert data["deposit_instructions"] is None


async def test_the_manage_page_and_the_studio_detail_carry_the_amount(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _business(db_async, async_client, late_fee_minor=2000)
    receipt = await _booked(async_client, studio)
    managed = await async_client.get(f"{API}/public/bookings/{receipt['manage_token']}")
    assert managed.status_code == 200, managed.text
    assert managed.json()["deposit_to_business_minor"] == 5300
    assert managed.json()["deposit_instructions"] == INSTRUCTIONS
    assert managed.json()["late_fee"] == {"amount_minor": 2000, "grace_min": 0}
    studio_view = await async_client.get(
        f"{API}/org/bookings/{receipt['booking']['id']}", headers=studio.headers
    )
    assert studio_view.status_code == 200, studio_view.text
    assert studio_view.json()["deposit_to_business_minor"] == 5300


# --- the late fee -----------------------------------------------------------------------------


async def test_the_late_fee_is_on_the_storefront_and_in_the_email(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(
        db_async, async_client, late_fee_minor=2000, late_grace_min=15
    )
    data = (await async_client.get(f"{API}/public/{studio.slug}")).json()
    assert data["late_fee"] == {"amount_minor": 2000, "grace_min": 15}
    await _booked(async_client, studio)
    rows = await _emails(db_async, studio.org_id)
    mail = next(r for r in rows if r.dedupe_key.startswith("booking-confirmation:"))
    assert (
        "Arriving more than 15 minutes late adds a late fee of XCD 20.00."
        in payload_text(mail.payload)
    )


async def test_a_late_fee_without_grace_says_arriving_late(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client, late_fee_minor=2000)
    data = (await async_client.get(f"{API}/public/{studio.slug}")).json()
    assert data["late_fee"] == {"amount_minor": 2000, "grace_min": 0}
    await _booked(async_client, studio)
    rows = await _emails(db_async, studio.org_id)
    mail = next(r for r in rows if r.dedupe_key.startswith("booking-confirmation:"))
    assert "Arriving late adds a late fee of XCD 20.00." in payload_text(mail.payload)


# --- validation and kept values ------------------------------------------------------------------


async def _put(
    client: httpx.AsyncClient, studio: Studio, **fields: object
) -> httpx.Response:
    body = {
        "public_slug": studio.slug,
        "display_name": "Babydoll Beauty Bar",
        "enabled": True,
        **fields,
    }
    return await client.put(f"{API}/org/profile", headers=studio.headers, json=body)


@pytest.mark.parametrize(
    "fields",
    [
        {"deposit_instructions": "x" * 501},
        {"late_grace_min": 300},
        {"late_fee_minor": 0},
        {"deposit_collection": "cash"},
    ],
)
async def test_invalid_values_are_refused(
    db_async: AsyncSession, async_client: httpx.AsyncClient, fields: dict
) -> None:
    studio = await _studio(db_async, async_client)
    assert (await _put(async_client, studio, **fields)).status_code == 422


async def test_instructions_are_plain_text_and_blank_clears_them(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client)
    saved = await _put(
        async_client,
        studio,
        deposit_instructions="  Pay\x00 by\x07 link\r\nthen send a screenshot  ",
    )
    assert saved.status_code == 200, saved.text
    assert saved.json()["deposit_instructions"] == "Pay by link\nthen send a screenshot"
    cleared = await _put(async_client, studio, deposit_instructions="   ")
    assert cleared.json()["deposit_instructions"] is None


async def test_fields_left_out_of_the_put_are_kept(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _business(
        db_async, async_client, late_fee_minor=2000, late_grace_min=15
    )
    kept = await _put(async_client, studio)
    assert kept.status_code == 200, kept.text
    body = kept.json()
    assert body["deposit_collection"] == "business"
    assert body["deposit_instructions"] == INSTRUCTIONS
    assert body["late_fee_minor"] == 2000
    assert body["late_grace_min"] == 15
    # A new profile defaults to online with none of them.
    fresh = await _studio(db_async, async_client)
    profile = (
        await async_client.get(f"{API}/org/profile", headers=fresh.headers)
    ).json()
    assert profile["deposit_collection"] == "online"
    assert profile["deposit_instructions"] is None
    assert profile["late_fee_minor"] is None


async def test_a_cancelled_booking_no_longer_shows_the_instructions(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _business(db_async, async_client, cancel_cutoff_hours=0)
    receipt = await _booked(async_client, studio)
    token = receipt["manage_token"]
    cancelled = await async_client.post(f"{API}/public/bookings/{token}/cancel")
    assert cancelled.status_code == 200, cancelled.text

    managed = await async_client.get(f"{API}/public/bookings/{token}")

    assert managed.status_code == 200, managed.text
    assert managed.json()["deposit_instructions"] is None
