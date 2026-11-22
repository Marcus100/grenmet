"""Bookings deposits by provider (21 Nov 2026): WiPay first, then the business's own
payment link, then Stripe test mode, else no online deposit (paid in the salon)."""

import uuid

import httpx
import pytest
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.audit.models import AuditEntry
from src.bookings import deposit_payments
from src.bookings.models import BookingProfile
from src.bookings.schemas import BookingProfileUpdate
from src.payments.models import LedgerEntry, LedgerKind
from tests.bookings.test_deposits import (
    DEPOSIT,
    _book_deposit,
    _deposit_studio,
    _drain,
    _events,
    _intent,
)
from tests.bookings.test_public_bookings import API, MANAGE, Studio, _booking_for
from tests.payments import wipay_support
from tests.payments.wipay_support import (
    WIPAY_ACCOUNT_NUMBER,
    WIPAY_API_KEY,
    WIPAY_WEBHOOK_SECRET,
    payment_webhook,
    return_query,
    signed_webhook,
)

# The fixtures live in wipay_support; bound here by name (as test_deposits does).
org_secret_keys = wipay_support.org_secret_keys
wipay_env = wipay_support.wipay_env

LINK = "https://pay.example.test/deposit/salon"
PAYMENTS = "/api/v1/payments"


async def _enable_wipay(client: httpx.AsyncClient, studio: Studio) -> None:
    response = await client.put(
        f"{PAYMENTS}/org/merchant-accounts/wipay",
        headers=studio.headers,
        json={
            "environment": "sandbox",
            "enabled": True,
            "account_number": WIPAY_ACCOUNT_NUMBER,
            "api_key": WIPAY_API_KEY,
            "webhook_secret": WIPAY_WEBHOOK_SECRET,
        },
    )
    assert response.status_code == 200, response.text


async def _set_link(db: AsyncSession, studio: Studio, link: str | None) -> None:
    profile = await db.scalar(
        select(BookingProfile).where(BookingProfile.organisation_id == studio.org_id)
    )
    assert profile is not None
    profile.deposit_payment_link = link
    await db.commit()


async def _detail(client: httpx.AsyncClient, studio: Studio, booking_id: str) -> dict:
    response = await client.get(
        f"{API}/org/bookings/{booking_id}", headers=studio.headers
    )
    assert response.status_code == 200, response.text
    return response.json()


# --- which rail a booking uses -----------------------------------------------------------


async def test_with_no_online_route_the_booking_takes_no_deposit(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _deposit_studio(db_async, async_client, deposit_payment_link=None)
    # No deposit, so no email proof is asked for either.
    receipt = await _book_deposit(async_client, studio, db=db_async, verify=False)

    booking = receipt["booking"]
    assert receipt["payment_required"] is False
    assert receipt["checkout_url"] is None
    assert booking["deposit_minor"] == 0
    assert booking["status"] != "pending_payment"
    assert await _intent(db_async, booking["id"]) is None


async def test_the_business_payment_link_is_the_deposit_checkout(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _deposit_studio(db_async, async_client, deposit_payment_link=LINK)
    receipt = await _book_deposit(async_client, studio, db=db_async)

    assert receipt["payment_required"] is True
    assert receipt["checkout_url"] == LINK
    booking = receipt["booking"]
    assert booking["status"] == "pending_payment"
    assert booking["payment"]["checkout_url"] == LINK
    assert booking["payment"]["amount_minor"] == DEPOSIT


@pytest.mark.usefixtures("wipay_env")
async def test_wipay_is_preferred_over_the_payment_link(
    db_async: AsyncSession,
    async_client: httpx.AsyncClient,
) -> None:
    studio = await _deposit_studio(db_async, async_client, deposit_payment_link=LINK)
    await _enable_wipay(async_client, studio)
    receipt = await _book_deposit(async_client, studio, db=db_async)

    assert receipt["checkout_url"] != LINK
    assert receipt["checkout_url"].startswith("https://gdsb.wipayfinancial.com/")
    intent = await _intent(db_async, receipt["booking"]["id"])
    assert intent is not None
    assert intent.provider == "wipay"


@pytest.mark.usefixtures("wipay_env")
async def test_a_disabled_wipay_falls_back_to_the_payment_link(
    db_async: AsyncSession,
    async_client: httpx.AsyncClient,
) -> None:
    studio = await _deposit_studio(db_async, async_client, deposit_payment_link=LINK)
    await _enable_wipay(async_client, studio)
    await async_client.put(
        f"{PAYMENTS}/org/merchant-accounts/wipay",
        headers=studio.headers,
        json={"environment": "sandbox", "enabled": False},
    )
    receipt = await _book_deposit(async_client, studio, db=db_async)
    assert receipt["checkout_url"] == LINK


# --- the payment link ---------------------------------------------------------------------


async def test_staff_mark_the_payment_link_deposit_received_and_it_is_audited(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _deposit_studio(db_async, async_client, deposit_payment_link=LINK)
    receipt = await _book_deposit(async_client, studio, db=db_async)
    booking_id = receipt["booking"]["id"]

    response = await async_client.post(
        f"{API}/org/bookings/{booking_id}/manual-deposit",
        headers={**studio.headers, "Idempotency-Key": uuid.uuid4().hex},
        json={"method": "payment_link", "reference": "LINK-REF-7"},
    )
    assert response.status_code == 200, response.text
    assert response.json()["deposit_captured_minor"] == DEPOSIT

    await _drain(db_async)
    assert (await _booking_for(db_async, booking_id)).status == "confirmed"
    assert "Deposit recorded by hand (payment_link)" in [
        e.note for e in await _events(db_async, booking_id)
    ]
    entry = await db_async.scalar(
        select(AuditEntry)
        .where(AuditEntry.entity_type == "booking", AuditEntry.entity_id == booking_id)
        .execution_options(populate_existing=True)
    )
    assert entry is not None
    assert entry.action == "manual_deposit"
    assert entry.actor_user_id is not None
    fields = {c["field"]: c["new"] for c in entry.changes}
    assert fields["method"] == "payment_link"


async def test_the_payment_link_survives_a_profile_save_that_leaves_it_out(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _deposit_studio(db_async, async_client, deposit_payment_link=LINK)
    response = await async_client.put(
        f"{API}/org/profile",
        headers=studio.headers,
        json={
            "public_slug": studio.slug,
            "display_name": "Babydoll Beauty Bar",
            "enabled": True,
            "lead_time_min": 0,
            "horizon_days": 365,
            "manage_url_template": MANAGE,
        },
    )
    assert response.status_code == 200, response.text
    profile = await db_async.scalar(
        select(BookingProfile).where(BookingProfile.organisation_id == studio.org_id)
    )
    assert profile is not None
    await db_async.refresh(profile)
    assert profile.deposit_payment_link == LINK


@pytest.mark.parametrize(
    "link",
    [
        "http://pay.example.test/deposit",  # not https
        "javascript:alert(1)",
        "ftp://pay.example.test/deposit",
        "https://user:secret@pay.example.test/deposit",  # credentials in the link
        "https:///deposit",  # no host
        "https://pay.example.test/deposit now",  # whitespace
        "https://pay.example.test/" + "a" * 2000,  # too long
    ],
)
def test_an_unsafe_payment_link_is_refused(link: str) -> None:
    with pytest.raises(ValidationError):
        BookingProfileUpdate(
            public_slug="salon-link-check",
            display_name="Salon",
            deposit_payment_link=link,
        )


@pytest.mark.parametrize(
    ("given", "stored"),
    [
        (LINK, LINK),
        (
            "https://pay.example.test/deposit?ref=salon",
            "https://pay.example.test/deposit?ref=salon",
        ),
        ("  " + LINK + "  ", LINK),
        ("", None),
        ("   ", None),
        (None, None),
    ],
)
def test_a_valid_payment_link_is_kept_and_blank_clears_it(
    given: str | None, stored: str | None
) -> None:
    profile = BookingProfileUpdate(
        public_slug="salon-link-check",
        display_name="Salon",
        deposit_payment_link=given,
    )
    assert profile.deposit_payment_link == stored


# --- WiPay confirms the deposit -------------------------------------------------------------


@pytest.mark.usefixtures("wipay_env")
async def test_a_verified_wipay_return_confirms_the_deposit(
    db_async: AsyncSession,
    async_client: httpx.AsyncClient,
) -> None:
    studio = await _deposit_studio(db_async, async_client, deposit_payment_link=None)
    await _enable_wipay(async_client, studio)
    receipt = await _book_deposit(async_client, studio, db=db_async)
    booking_id = receipt["booking"]["id"]
    intent = await _intent(db_async, booking_id)
    assert intent is not None

    response = await async_client.get(
        f"{PAYMENTS}/public/returns/wipay",
        params=return_query(
            order_id=intent.id.hex,
            transaction_id=intent.provider_ref or "",
            amount_minor=DEPOSIT,
        ),
        follow_redirects=False,
    )
    assert response.status_code == 303
    assert "result=paid" in response.headers["location"]
    assert booking_id in response.headers["location"]

    await _drain(db_async)
    assert (await _booking_for(db_async, booking_id)).status == "confirmed"
    detail = await _detail(async_client, studio, booking_id)
    assert detail["deposit_captured_minor"] == DEPOSIT


@pytest.mark.usefixtures("wipay_env")
async def test_a_tampered_wipay_return_leaves_the_deposit_unpaid(
    db_async: AsyncSession,
    async_client: httpx.AsyncClient,
) -> None:
    studio = await _deposit_studio(db_async, async_client, deposit_payment_link=None)
    await _enable_wipay(async_client, studio)
    receipt = await _book_deposit(async_client, studio, db=db_async)
    booking_id = receipt["booking"]["id"]
    intent = await _intent(db_async, booking_id)
    assert intent is not None
    intent_id, order_id = intent.id, intent.id.hex
    params = return_query(
        order_id=order_id,
        transaction_id=intent.provider_ref or "",
        amount_minor=DEPOSIT,
    )
    params["transaction_id"] = "SB-99-1-forged-20261121120000"

    response = await async_client.get(
        f"{PAYMENTS}/public/returns/wipay", params=params, follow_redirects=False
    )
    assert response.status_code == 400
    await _drain(db_async)
    assert (await _booking_for(db_async, booking_id)).status == "pending_payment"
    charges = await db_async.scalar(
        select(LedgerEntry.id).where(
            LedgerEntry.intent_id == intent_id,
            LedgerEntry.kind == LedgerKind.CHARGE.value,
        )
    )
    assert charges is None


@pytest.mark.usefixtures("wipay_env")
async def test_a_wipay_webhook_confirms_the_deposit_once(
    db_async: AsyncSession,
    async_client: httpx.AsyncClient,
) -> None:
    studio = await _deposit_studio(db_async, async_client, deposit_payment_link=None)
    await _enable_wipay(async_client, studio)
    receipt = await _book_deposit(async_client, studio, db=db_async)
    booking_id = receipt["booking"]["id"]
    intent = await _intent(db_async, booking_id)
    assert intent is not None
    intent_id, order_id, transaction_id = intent.id, intent.id.hex, intent.provider_ref
    envelope = payment_webhook(
        "payment.success",
        order_id=order_id,
        transaction_id=transaction_id or "",
        amount_minor=DEPOSIT,
    )
    body, headers = signed_webhook(envelope)
    for _ in range(2):  # WiPay retries; the second delivery must change nothing
        response = await async_client.post(
            f"{PAYMENTS}/public/webhooks/wipay", content=body, headers=headers
        )
        assert response.status_code == 200, response.text

    await _drain(db_async)
    assert (await _booking_for(db_async, booking_id)).status == "confirmed"
    charges = list(
        await db_async.scalars(
            select(LedgerEntry.id).where(
                LedgerEntry.intent_id == intent_id,
                LedgerEntry.kind == LedgerKind.CHARGE.value,
            )
        )
    )
    assert len(charges) == 1


# --- review round 2: summaries, no silent fall-through, refunds the studio must make ----


async def test_payment_summaries_carry_the_business_payment_link(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    from src.bookings.models import Booking
    from src.bookings.schemas import BookingPaymentStatus

    studio = await _deposit_studio(db_async, async_client, deposit_payment_link=LINK)
    receipt = await _book_deposit(async_client, studio, db=db_async)
    booking = await db_async.get(Booking, uuid.UUID(receipt["booking"]["id"]))
    assert booking is not None
    summaries = await deposit_payments.payment_summaries(db_async, [booking])
    summary = summaries[booking.id]
    assert summary is not None
    assert summary.status == BookingPaymentStatus.DUE
    assert summary.checkout_url == LINK


async def test_asking_for_an_online_deposit_with_no_rail_fails_the_booking(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    from src.bookings.exceptions import BookingConflictError
    from src.bookings.models import Booking, BookingProfile

    studio = await _deposit_studio(db_async, async_client, deposit_payment_link=LINK)
    receipt = await _book_deposit(async_client, studio, db=db_async)
    booking = await db_async.get(Booking, uuid.UUID(receipt["booking"]["id"]))
    assert booking is not None
    profile = await db_async.scalar(
        select(BookingProfile).where(BookingProfile.organisation_id == studio.org_id)
    )
    assert profile is not None
    profile.deposit_payment_link = None
    await db_async.commit()
    with pytest.raises(BookingConflictError) as raised:
        await deposit_payments.start_deposit(db_async, booking, None)
    assert raised.value.status_code == 409


@pytest.mark.usefixtures("wipay_env")
async def test_a_refused_refund_is_noted_and_the_studio_is_emailed(
    db_async: AsyncSession,
    async_client: httpx.AsyncClient,
) -> None:
    from src.bookings import deposits
    from src.bookings.models import Booking
    from src.outbox import Outbox

    studio = await _deposit_studio(db_async, async_client, deposit_payment_link=None)
    await _enable_wipay(async_client, studio)
    receipt = await _book_deposit(async_client, studio, db=db_async)
    booking_id = receipt["booking"]["id"]
    intent = await _intent(db_async, booking_id)
    assert intent is not None
    returned = await async_client.get(
        f"{PAYMENTS}/public/returns/wipay",
        params=return_query(
            order_id=intent.id.hex,
            transaction_id=intent.provider_ref or "",
            amount_minor=DEPOSIT,
        ),
        follow_redirects=False,
    )
    assert returned.status_code == 303, returned.text
    await db_async.refresh(intent)
    assert intent.status == "succeeded", intent.status
    # A payment lands after the booking was cancelled: WiPay cannot refund it here.
    booking = await db_async.get(Booking, uuid.UUID(booking_id))
    assert booking is not None
    booking.status = "cancelled"
    await db_async.commit()
    result = await deposits.confirm_paid(
        db_async,
        organisation_id=studio.org_id,
        booking_id=uuid.UUID(booking_id),
    )
    assert result == "refunded"

    notes = [e.note or "" for e in await _events(db_async, booking_id)]
    assert any("refund failed; refund it by hand" in note for note in notes), (
        result,
        notes,
    )
    queued = list(
        await db_async.scalars(
            select(Outbox).where(
                Outbox.organisation_id == studio.org_id,
                Outbox.dedupe_key.like("booking-refund-refused:%"),
            )
        )
    )
    assert len(queued) == 1


@pytest.mark.usefixtures("wipay_env")
async def test_the_refund_refused_email_is_queued_once_per_deposit(
    db_async: AsyncSession,
    async_client: httpx.AsyncClient,
) -> None:
    from src.bookings import deposits
    from src.bookings.models import Booking
    from src.outbox import Outbox

    studio = await _deposit_studio(db_async, async_client, deposit_payment_link=None)
    await _enable_wipay(async_client, studio)
    receipt = await _book_deposit(async_client, studio, db=db_async)
    booking_id = receipt["booking"]["id"]
    intent = await _intent(db_async, booking_id)
    assert intent is not None
    returned = await async_client.get(
        f"{PAYMENTS}/public/returns/wipay",
        params=return_query(
            order_id=intent.id.hex,
            transaction_id=intent.provider_ref or "",
            amount_minor=DEPOSIT,
        ),
        follow_redirects=False,
    )
    assert returned.status_code == 303
    booking = await db_async.get(Booking, uuid.UUID(booking_id))
    assert booking is not None
    booking.status = "cancelled"
    await db_async.commit()
    for _ in range(2):  # the same late payment reported twice
        await deposits.confirm_paid(
            db_async, organisation_id=studio.org_id, booking_id=uuid.UUID(booking_id)
        )
    queued = list(
        await db_async.scalars(
            select(Outbox).where(
                Outbox.organisation_id == studio.org_id,
                Outbox.dedupe_key.like("booking-refund-refused:%"),
            )
        )
    )
    assert len(queued) == 1
    assert queued[0].dedupe_key == f"booking-refund-refused:{booking_id}:{intent.id}"
