"""Issue #1817: a deposit refund that is retried after a lost commit reuses the
provider's idempotency key, so the provider refunds once."""

import uuid

import httpx
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.bookings import deposit_payments
from src.payments import schemas as payment_schemas
from src.payments import service as payments_service
from src.payments.models import Intent, LedgerEntry
from tests.bookings.test_deposits import (
    DEPOSIT,
    PAYMENTS,
    _book_deposit,
    _booking_for,
    _deposit_studio,
    _drain,
    _intent,
    _refunded,
)
from tests.payments import conftest as payments_conftest

stripe_env = payments_conftest.stripe_env
WEBHOOK = f"{PAYMENTS}/public/webhooks/stripe"


async def _stripe_paid_booking(
    db: AsyncSession, client: httpx.AsyncClient
) -> tuple[str, Intent]:
    studio = await _deposit_studio(db, client)
    receipt = await _book_deposit(client, studio, db=db)
    booking_id = receipt["booking"]["id"]
    intent = await _intent(db, booking_id)
    assert intent is not None
    body, headers = payments_conftest.signed(
        payments_conftest.checkout_completed(intent.id, amount=DEPOSIT)
    )
    response = await client.post(
        f"{PAYMENTS}/public/webhooks/stripe", content=body, headers=headers
    )
    assert response.status_code == 200, response.text
    await _drain(db)
    return booking_id, intent


async def test_a_refund_retried_after_a_lost_commit_is_recorded_not_sent_again(
    db_async: AsyncSession,
    async_client: httpx.AsyncClient,
    stripe_env: payments_conftest.StripeStub,
) -> None:
    booking_id, _ = await _stripe_paid_booking(db_async, async_client)

    # The provider refund succeeds, then the database commit is lost.
    booking = await _booking_for(db_async, booking_id)
    assert await deposit_payments.refund_deposit(
        db_async, booking, reason="Booking cancelled"
    )
    await db_async.rollback()

    # The retry: the refund row and ledger entry were lost with the commit. The
    # provider's listing shows the refund, so it is recorded and nothing is sent.
    booking = await _booking_for(db_async, booking_id)
    assert await deposit_payments.refund_deposit(
        db_async, booking, reason="Booking cancelled"
    )
    await db_async.commit()

    keys = stripe_env.refund_keys()
    assert len(keys) == 1
    assert keys[0] is not None and keys[0].startswith("refund-")
    assert stripe_env.refunds_created == 1
    assert await _refunded(db_async, booking_id) == -DEPOSIT


async def test_partial_refunds_on_one_intent_get_distinct_keys(
    db_async: AsyncSession,
    async_client: httpx.AsyncClient,
    stripe_env: payments_conftest.StripeStub,
) -> None:
    booking_id, intent = await _stripe_paid_booking(db_async, async_client)
    booking_uuid = uuid.UUID(booking_id)

    def refund(amount: int) -> uuid.UUID:
        return deposit_payments.refund_id_for(
            booking_uuid, intent.id, amount, "Booking cancelled"
        )

    assert refund(1000) != refund(2000)
    for amount in (1000, 2000):
        await payments_service.refund_intent(
            db_async,
            organisation_id=intent.organisation_id,
            intent_id=intent.id,
            actor=None,
            payload=payment_schemas.PaymentRefundCreate(
                amount_minor=amount, reason="Booking cancelled"
            ),
            refund_id=refund(amount),
        )
    await db_async.commit()

    keys = stripe_env.refund_keys()
    assert len(keys) == 2
    assert keys[0] != keys[1]
    assert stripe_env.refunds_created == 2
    assert await _refunded(db_async, booking_id) == -3000


async def _balance(db: AsyncSession, booking_id: str) -> int:
    """What the payer has paid net of refunds: every ledger entry of the deposit. A
    refund the provider marked failed adds an adjustment that reverses its entry, so
    ``_refunded`` (refund entries only) cannot show it."""
    intent = await _intent(db, booking_id)
    assert intent is not None
    return int(
        await db.scalar(
            select(func.coalesce(func.sum(LedgerEntry.amount_minor), 0)).where(
                LedgerEntry.intent_id == intent.id
            )
        )
        or 0
    )


async def _refund_failed_at_provider(
    client: httpx.AsyncClient,
    db: AsyncSession,
    intent_id: uuid.UUID,
    refund_id: uuid.UUID,
    amount: int,
) -> None:
    """Stripe reports the refund we made as failed (refund.failed webhook)."""
    body, headers = payments_conftest.signed(
        refund_event_for(refund_id, intent_id, amount)
    )
    response = await client.post(WEBHOOK, content=body, headers=headers)
    assert response.status_code == 200, response.text
    await _drain(db)


def refund_event_for(
    refund_id: uuid.UUID, intent_id: uuid.UUID, amount: int
) -> dict[str, object]:
    return payments_conftest.refund_event(
        f"evt_failed_{refund_id.hex[:8]}",
        "refund.failed",
        payments_conftest.refund_object(
            "re_test_1",
            amount,
            status="failed",
            refund_id=refund_id,
            intent_id=intent_id,
        ),
    )


async def test_a_refund_the_provider_marks_failed_is_retried_under_a_new_attempt(
    db_async: AsyncSession,
    async_client: httpx.AsyncClient,
    stripe_env: payments_conftest.StripeStub,
) -> None:
    stripe_env.refund_status = "pending"
    booking_id, intent = await _stripe_paid_booking(db_async, async_client)
    booking_uuid = uuid.UUID(booking_id)
    intent_id = intent.id
    first = deposit_payments.refund_id_for(
        booking_uuid, intent_id, DEPOSIT, "Booking cancelled", 1
    )
    booking = await _booking_for(db_async, booking_id)
    assert await deposit_payments.refund_deposit(
        db_async, booking, reason="Booking cancelled"
    )
    await db_async.commit()
    await _refund_failed_at_provider(async_client, db_async, intent_id, first, DEPOSIT)
    assert await _balance(db_async, booking_id) == DEPOSIT

    # The money is due again: the next refund is a new attempt with its own id.
    booking = await _booking_for(db_async, booking_id)
    assert await deposit_payments.refund_deposit(
        db_async, booking, reason="Booking cancelled"
    )
    await db_async.commit()

    keys = stripe_env.refund_keys()
    second = deposit_payments.refund_id_for(
        booking_uuid, intent_id, DEPOSIT, "Booking cancelled", 2
    )
    assert second != first
    assert keys == [f"refund-{first}", f"refund-{second}"]
    assert stripe_env.refunds_created == 2
    assert await _balance(db_async, booking_id) == 0


async def test_a_retry_of_the_new_attempt_after_a_lost_commit_is_not_sent_again(
    db_async: AsyncSession,
    async_client: httpx.AsyncClient,
    stripe_env: payments_conftest.StripeStub,
) -> None:
    stripe_env.refund_status = "pending"
    booking_id, intent = await _stripe_paid_booking(db_async, async_client)
    booking_uuid = uuid.UUID(booking_id)
    intent_id = intent.id
    first = deposit_payments.refund_id_for(
        booking_uuid, intent_id, DEPOSIT, "Booking cancelled", 1
    )
    booking = await _booking_for(db_async, booking_id)
    assert await deposit_payments.refund_deposit(
        db_async, booking, reason="Booking cancelled"
    )
    await db_async.commit()
    await _refund_failed_at_provider(async_client, db_async, intent_id, first, DEPOSIT)

    # Attempt two goes out, then its commit is lost.
    booking = await _booking_for(db_async, booking_id)
    assert await deposit_payments.refund_deposit(
        db_async, booking, reason="Booking cancelled"
    )
    await db_async.rollback()
    stripe_env.forget_keys()

    # The retry finds attempt two at the provider and records it.
    booking = await _booking_for(db_async, booking_id)
    assert await deposit_payments.refund_deposit(
        db_async, booking, reason="Booking cancelled"
    )
    await db_async.commit()

    assert len(stripe_env.refund_keys()) == 2
    assert stripe_env.refunds_created == 2
    assert await _balance(db_async, booking_id) == 0


async def test_a_refund_retried_after_the_key_is_forgotten_is_not_sent_twice(
    db_async: AsyncSession,
    async_client: httpx.AsyncClient,
    stripe_env: payments_conftest.StripeStub,
) -> None:
    booking_id, _ = await _stripe_paid_booking(db_async, async_client)

    booking = await _booking_for(db_async, booking_id)
    assert await deposit_payments.refund_deposit(
        db_async, booking, reason="Booking cancelled"
    )
    await db_async.rollback()
    # More than 24 hours later Stripe no longer knows the key.
    stripe_env.forget_keys()

    booking = await _booking_for(db_async, booking_id)
    assert await deposit_payments.refund_deposit(
        db_async, booking, reason="Booking cancelled"
    )
    await db_async.commit()

    assert len(stripe_env.refund_keys()) == 1
    assert stripe_env.refunds_created == 1
    assert await _refunded(db_async, booking_id) == -DEPOSIT
