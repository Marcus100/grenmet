"""Bookings B6: deposits, paid handler, expiry sweeper, refund policy."""

import uuid
from datetime import timedelta
from importlib import import_module

import httpx
import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src import outbox
from src.bookings import deposit_payments, deposits
from src.bookings.models import Booking, BookingEvent, BookingStatus, Service
from src.outbox import Outbox
from src.payments.models import Intent, IntentStatus, LedgerEntry, LedgerKind
from src.utils.datetime import utc_now
from src.worker import main as worker
from tests.bookings.email_code_helpers import get_proof
from tests.bookings.test_public_bookings import (
    API,
    Studio,
    _book,
    _booking_for,
    _emails,
    _slots,
    _studio,
)
from tests.payments import conftest as payments_conftest

import_module("src.bookings.outbox_handlers")  # registers bookings.deposit_paid
stripe_env = payments_conftest.stripe_env
DEPOSIT = 5000
PAYMENTS = "/api/v1/payments"


async def _deposit_studio(
    db: AsyncSession,
    client: httpx.AsyncClient,
    *,
    apps: tuple[str, ...] = ("bookings", "payments"),
    **profile: object,
) -> Studio:
    studio = await _studio(db, client, apps=apps, **profile)
    # The service route is behind the bookings entitlement; set the deposit in SQL
    # so the helper works whatever `apps` holds.
    service = await db.get(Service, uuid.UUID(studio.service_id))
    assert service is not None
    service.deposit_minor = DEPOSIT
    await db.commit()
    return studio


async def _book_deposit(
    client: httpx.AsyncClient,
    studio: Studio,
    slot: int = 0,
    *,
    db: AsyncSession,
    verify: bool = True,
) -> dict:
    slots = await _slots(client, studio)
    email = f"ada-{uuid.uuid4().hex[:8]}@example.com"
    proof = await get_proof(db, client, studio, slots[slot], email) if verify else None
    response = await _book(
        client, studio, slots[slot], customer_email=email, email_proof=proof
    )
    assert response.status_code == 201, response.text
    return response.json()


async def _intent(db: AsyncSession, booking_id: str) -> Intent | None:
    return await db.scalar(
        select(Intent)
        .where(Intent.source_type == "bookings.deposit", Intent.source_id == booking_id)
        .execution_options(populate_existing=True)
    )


async def _pay_manually(
    client: httpx.AsyncClient, studio: Studio, intent_id: object
) -> None:
    response = await client.post(
        f"{PAYMENTS}/org/intents/{intent_id}/manual-payments",
        headers=studio.headers,
        json={"method": "cash", "reference": "R-1"},
    )
    assert response.status_code == 201, response.text


async def _drain(db: AsyncSession) -> int:
    db.expire_all()  # the API changed rows in other sessions; the worker starts fresh
    return await outbox.drain(db, only_topics={deposit_payments.PAID_TOPIC})


async def _paid_booking(
    db: AsyncSession, client: httpx.AsyncClient, **profile: object
) -> tuple[Studio, str]:
    studio = await _deposit_studio(db, client, **profile)
    receipt = await _book_deposit(client, studio, db=db)
    booking_id = receipt["booking"]["id"]
    intent = await _intent(db, booking_id)
    assert intent is not None
    await _pay_manually(client, studio, intent.id)
    await _drain(db)
    return studio, booking_id


async def _events(db: AsyncSession, booking_id: str) -> list[BookingEvent]:
    return list(
        await db.scalars(
            select(BookingEvent)
            .where(BookingEvent.booking_id == uuid.UUID(booking_id))
            .order_by(BookingEvent.created_at, BookingEvent.id)
            .execution_options(populate_existing=True)
        )
    )


# --- create ------------------------------------------------------------------------------------


async def test_deposit_booking_waits_for_payment_and_holds_the_slot(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _deposit_studio(db_async, async_client)
    slots = await _slots(async_client, studio)
    receipt = await _book_deposit(async_client, studio, db=db_async)

    assert receipt["payment_required"] is True
    assert receipt["checkout_url"] is None  # no Stripe key: the studio records it
    booking = receipt["booking"]
    assert booking["status"] == "pending_payment"
    assert booking["deposit_minor"] == DEPOSIT
    assert slots[0] not in await _slots(async_client, studio)

    intent = await _intent(db_async, booking["id"])
    assert intent is not None
    assert intent.amount_minor == DEPOSIT
    assert intent.provider == "manual"
    assert intent.currency == "XCD"
    assert intent.created_by_user_id is None
    assert intent.idempotency_key == f"bookings.deposit:{booking['id']}"
    assert intent.status == IntentStatus.REQUIRES_PAYMENT.value
    # Nobody is emailed until the deposit is paid.
    # The only mail so far is the verification code, not a booking notice.
    sent = [
        row.dedupe_key.split(":")[0] for row in await _emails(db_async, studio.org_id)
    ]
    assert sent == ["booking-email-code"]


async def test_stripe_test_key_returns_a_checkout_url(
    db_async: AsyncSession,
    async_client: httpx.AsyncClient,
    stripe_env: payments_conftest.StripeStub,
) -> None:
    studio = await _deposit_studio(db_async, async_client)
    receipt = await _book_deposit(async_client, studio, db=db_async)
    assert receipt["payment_required"] is True
    assert receipt["checkout_url"] == "https://checkout.stripe.com/c/pay/cs_test_1"
    intent = await _intent(db_async, receipt["booking"]["id"])
    assert intent is not None
    assert intent.provider == "stripe"
    assert intent.status == IntentStatus.PROCESSING.value
    assert len(stripe_env.requests) == 1


async def test_a_replayed_create_returns_the_same_checkout(
    db_async: AsyncSession,
    async_client: httpx.AsyncClient,
    stripe_env: payments_conftest.StripeStub,
) -> None:
    studio = await _deposit_studio(db_async, async_client)
    slots = await _slots(async_client, studio)
    proof = await get_proof(db_async, async_client, studio, slots[0], "ada@example.com")
    same = {
        "key": "deposit-replay-key-1",
        "customer_email": "ada@example.com",
        "email_proof": proof,
    }
    first = await _book(async_client, studio, slots[0], **same)
    replay = await _book(async_client, studio, slots[0], **same)
    assert first.status_code == replay.status_code == 201
    assert replay.headers["Idempotency-Replayed"] == "true"
    assert replay.json() == first.json()
    assert len(stripe_env.requests) == 1
    count = await db_async.scalar(
        select(func.count())
        .select_from(Intent)
        .where(Intent.organisation_id == studio.org_id)
    )
    assert count == 1


async def test_a_deposit_without_the_payments_entitlement_is_ignored(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _deposit_studio(db_async, async_client, apps=("bookings",))
    receipt = await _book_deposit(async_client, studio, db=db_async, verify=False)
    assert receipt["payment_required"] is False
    assert receipt["checkout_url"] is None
    assert receipt["booking"]["status"] == "confirmed"
    assert receipt["booking"]["deposit_minor"] == 0
    assert await _intent(db_async, receipt["booking"]["id"]) is None


# --- payment received -----------------------------------------------------------------------------


async def test_payment_confirms_the_booking_and_replays_safely(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio, booking_id = await _paid_booking(db_async, async_client)
    booking = await _booking_for(db_async, booking_id)
    assert booking.status == BookingStatus.CONFIRMED.value
    events = await _events(db_async, booking_id)
    assert [e.to_status for e in events] == ["pending_payment", "confirmed"]
    assert events[-1].note == "Deposit paid"
    keys = [row.dedupe_key for row in await _emails(db_async, studio.org_id)]
    assert f"booking-confirmation:{booking_id}" in keys
    assert f"booking-studio-created:{booking_id}" in keys

    # A second delivery of the same message changes nothing.
    outcome = await deposits.confirm_paid(
        db_async, organisation_id=studio.org_id, booking_id=uuid.UUID(booking_id)
    )
    await db_async.commit()
    assert outcome == "ignored"
    assert len(await _events(db_async, booking_id)) == 2
    assert await _drain(db_async) == 0
    charges = await db_async.scalar(
        select(func.count())
        .select_from(LedgerEntry)
        .where(
            LedgerEntry.organisation_id == studio.org_id,
            LedgerEntry.kind == LedgerKind.CHARGE.value,
        )
    )
    assert charges == 1


async def test_payment_moves_to_pending_when_the_business_confirms_by_hand(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    _, booking_id = await _paid_booking(
        db_async, async_client, requires_confirmation=True
    )
    assert (await _booking_for(db_async, booking_id)).status == "pending"


async def test_stripe_callback_confirms_through_the_outbox(
    db_async: AsyncSession,
    async_client: httpx.AsyncClient,
    stripe_env: payments_conftest.StripeStub,
) -> None:
    _ = stripe_env
    studio = await _deposit_studio(db_async, async_client)
    receipt = await _book_deposit(async_client, studio, db=db_async)
    booking_id = receipt["booking"]["id"]
    intent = await _intent(db_async, booking_id)
    assert intent is not None
    body, headers = payments_conftest.signed(
        payments_conftest.checkout_completed(intent.id, amount=DEPOSIT)
    )
    response = await async_client.post(
        f"{PAYMENTS}/public/webhooks/stripe", content=body, headers=headers
    )
    assert response.status_code == 200, response.text
    pending = await db_async.scalar(
        select(func.count())
        .select_from(Outbox)
        .where(
            Outbox.topic == deposit_payments.PAID_TOPIC,
            Outbox.organisation_id == studio.org_id,
        )
    )
    assert pending == 1
    assert await _drain(db_async) == 1
    assert (
        await _booking_for(db_async, booking_id)
    ).status == BookingStatus.CONFIRMED.value


async def test_a_late_payment_for_an_expired_booking_is_refunded(
    db_async: AsyncSession,
    async_client: httpx.AsyncClient,
    stripe_env: payments_conftest.StripeStub,
) -> None:
    studio = await _deposit_studio(db_async, async_client)
    receipt = await _book_deposit(async_client, studio, db=db_async)
    booking_id = receipt["booking"]["id"]
    later = utc_now() + timedelta(minutes=45)
    assert (
        await deposits.expire_unpaid(db_async, now=later, organisation_id=studio.org_id)
        == 1
    )
    await db_async.commit()
    intent = await _intent(db_async, booking_id)
    assert intent is not None
    assert intent.status == IntentStatus.CANCELLED.value

    body, headers = payments_conftest.signed(
        payments_conftest.checkout_completed(intent.id, amount=DEPOSIT)
    )
    assert (
        await async_client.post(
            f"{PAYMENTS}/public/webhooks/stripe", content=body, headers=headers
        )
    ).status_code == 200
    assert await _drain(db_async) == 1
    booking = await _booking_for(db_async, booking_id)
    assert booking.status == BookingStatus.CANCELLED.value
    refunds = [r for r in stripe_env.requests if r.url.path == "/v1/refunds"]
    assert len(refunds) == 1


# --- expiry sweeper --------------------------------------------------------------------------------------


async def test_expiry_releases_the_slot_and_is_idempotent(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _deposit_studio(db_async, async_client)
    slots = await _slots(async_client, studio)
    receipt = await _book_deposit(async_client, studio, db=db_async)
    booking_id = receipt["booking"]["id"]
    now = utc_now()

    # Inside the hold nothing happens.
    soon = now + timedelta(minutes=10)
    assert (
        await deposits.expire_unpaid(db_async, now=soon, organisation_id=studio.org_id)
        == 0
    )
    assert slots[0] not in await _slots(async_client, studio)

    later = now + timedelta(minutes=31)
    assert (
        await deposits.expire_unpaid(db_async, now=later, organisation_id=studio.org_id)
        == 1
    )
    await db_async.commit()
    booking = await _booking_for(db_async, booking_id)
    assert booking.status == BookingStatus.CANCELLED.value
    assert booking.cancel_reason == "Deposit not paid in time"
    intent = await _intent(db_async, booking_id)
    assert intent is not None
    assert intent.status == IntentStatus.CANCELLED.value
    events = await _events(db_async, booking_id)
    assert events[-1].note == "Deposit not paid in time; slot released"
    assert slots[0] in await _slots(async_client, studio)

    assert (
        await deposits.expire_unpaid(db_async, now=later, organisation_id=studio.org_id)
        == 0
    )
    assert len(await _events(db_async, booking_id)) == 2


async def test_expiry_leaves_a_paid_booking_alone(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _deposit_studio(db_async, async_client)
    receipt = await _book_deposit(async_client, studio, db=db_async)
    booking_id = receipt["booking"]["id"]
    intent = await _intent(db_async, booking_id)
    assert intent is not None
    await _pay_manually(async_client, studio, intent.id)  # outbox not drained yet
    later = utc_now() + timedelta(hours=2)
    assert (
        await deposits.expire_unpaid(db_async, now=later, organisation_id=studio.org_id)
        == 0
    )
    await db_async.commit()
    assert await _drain(db_async) == 1
    assert (
        await _booking_for(db_async, booking_id)
    ).status == BookingStatus.CONFIRMED.value


def test_the_expiry_job_is_registered_once_in_both_lists() -> None:
    job = worker.expire_unpaid_bookings
    assert job in worker.WorkerSettings.functions
    assert sum(1 for c in worker.WorkerSettings.cron_jobs if c.coroutine is job) == 1


async def test_the_expiry_job_commits_and_records_metrics(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    recorded: list[tuple[str, bool]] = []

    async def record(_redis: object, name: str, _job_id: str, ok: bool) -> None:
        recorded.append((name, ok))

    async def expire(_session: object) -> int:
        return 3

    monkeypatch.setattr(worker.operational_metrics, "record_job", record)
    monkeypatch.setattr(deposits, "expire_unpaid", expire)
    assert await worker.expire_unpaid_bookings({"job_id": "t"}) == 3
    assert recorded == [("expire_unpaid_bookings", True)]


# --- refund policy ----------------------------------------------------------------------------------------


async def _refunded(db: AsyncSession, booking_id: str) -> int:
    intent = await _intent(db, booking_id)
    assert intent is not None
    return int(
        await db.scalar(
            select(func.coalesce(func.sum(LedgerEntry.amount_minor), 0)).where(
                LedgerEntry.intent_id == intent.id,
                LedgerEntry.kind == LedgerKind.REFUND.value,
            )
        )
        or 0
    )


async def _cancel(
    client: httpx.AsyncClient,
    studio: Studio,
    booking_id: str,
    **body: object,
) -> httpx.Response:
    return await client.post(
        f"{API}/org/bookings/{booking_id}/cancel",
        headers=studio.headers,
        json={"reason": "Studio closed", **body},
    )


async def test_cancelling_before_the_cutoff_refunds_the_deposit(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio, booking_id = await _paid_booking(db_async, async_client)
    response = await _cancel(async_client, studio, booking_id)
    assert response.status_code == 200, response.text
    assert response.json()["deposit_captured_minor"] == DEPOSIT
    assert response.json()["deposit_refunded_minor"] == DEPOSIT
    assert await _refunded(db_async, booking_id) == -DEPOSIT
    notes = [e.note for e in await _events(db_async, booking_id)]
    assert "Deposit refunded" in notes


async def test_cancelling_inside_the_cutoff_keeps_the_deposit(
    db_async: AsyncSession,
    async_client: httpx.AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    studio, booking_id = await _paid_booking(db_async, async_client)
    booking = await _booking_for(db_async, booking_id)
    monkeypatch.setattr(
        "src.bookings.studio.utc_now", lambda: booking.starts_at - timedelta(hours=2)
    )
    response = await _cancel(async_client, studio, booking_id)
    assert response.status_code == 200, response.text
    assert response.json()["deposit_refunded_minor"] == 0
    assert await _refunded(db_async, booking_id) == 0
    assert "Deposit kept" in [e.note for e in await _events(db_async, booking_id)]


async def test_the_studio_can_override_the_policy(
    db_async: AsyncSession,
    async_client: httpx.AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    studio, inside = await _paid_booking(db_async, async_client)
    booking = await _booking_for(db_async, inside)
    monkeypatch.setattr(
        "src.bookings.studio.utc_now", lambda: booking.starts_at - timedelta(hours=2)
    )
    forced = await _cancel(async_client, studio, inside, refund_deposit=True)
    assert forced.json()["deposit_refunded_minor"] == DEPOSIT

    monkeypatch.undo()
    other, outside = await _paid_booking(db_async, async_client)
    kept = await _cancel(async_client, other, outside, refund_deposit=False)
    assert kept.json()["deposit_refunded_minor"] == 0


async def test_a_customer_cancel_refunds_and_a_decline_refunds(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _deposit_studio(db_async, async_client)
    receipt = await _book_deposit(async_client, studio, db=db_async)
    booking_id = receipt["booking"]["id"]
    intent = await _intent(db_async, booking_id)
    assert intent is not None
    await _pay_manually(async_client, studio, intent.id)
    await _drain(db_async)
    cancelled = await async_client.post(
        f"{API}/public/bookings/{receipt['manage_token']}/cancel"
    )
    assert cancelled.status_code == 200, cancelled.text
    assert await _refunded(db_async, booking_id) == -DEPOSIT

    pending, waiting = await _paid_booking(
        db_async, async_client, requires_confirmation=True
    )
    declined = await async_client.post(
        f"{API}/org/bookings/{waiting}/decline",
        headers=pending.headers,
        json={"reason": "No capacity"},
    )
    assert declined.status_code == 200, declined.text
    assert await _refunded(db_async, waiting) == -DEPOSIT


async def test_cancelling_an_unpaid_deposit_booking_cancels_the_intent(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _deposit_studio(db_async, async_client)
    receipt = await _book_deposit(async_client, studio, db=db_async)
    booking_id = receipt["booking"]["id"]
    response = await _cancel(async_client, studio, booking_id)
    assert response.status_code == 200, response.text
    intent = await _intent(db_async, booking_id)
    assert intent is not None
    assert intent.status == IntentStatus.CANCELLED.value
    booking = await db_async.get(Booking, uuid.UUID(booking_id))
    assert booking is not None


async def test_a_refund_that_fails_does_not_undo_the_cancel(
    db_async: AsyncSession,
    async_client: httpx.AsyncClient,
    stripe_env: payments_conftest.StripeStub,
) -> None:
    studio = await _deposit_studio(db_async, async_client)
    receipt = await _book_deposit(async_client, studio, db=db_async)
    booking_id = receipt["booking"]["id"]
    intent = await _intent(db_async, booking_id)
    assert intent is not None
    body, headers = payments_conftest.signed(
        payments_conftest.checkout_completed(intent.id, amount=DEPOSIT)
    )
    await async_client.post(
        f"{PAYMENTS}/public/webhooks/stripe", content=body, headers=headers
    )
    await _drain(db_async)
    stripe_env.fail_refund = True
    response = await _cancel(async_client, studio, booking_id)
    assert response.status_code == 200, response.text
    assert response.json()["status"] == "cancelled"
    assert response.json()["deposit_refunded_minor"] == 0
    notes = [e.note for e in await _events(db_async, booking_id)]
    assert "Deposit refund failed; refund it by hand" in notes
