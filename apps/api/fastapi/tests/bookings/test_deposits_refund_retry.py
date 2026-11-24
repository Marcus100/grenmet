"""Issue #1817: a deposit refund that is retried after a lost commit reuses the
provider's idempotency key, so the provider refunds once."""

import uuid

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from src.bookings import deposit_payments
from src.payments import schemas as payment_schemas
from src.payments import service as payments_service
from src.payments.models import Intent
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


async def test_a_refund_retried_after_a_lost_commit_reuses_the_provider_key(
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

    # The retry: the refund row and ledger entry were lost with the commit.
    booking = await _booking_for(db_async, booking_id)
    assert await deposit_payments.refund_deposit(
        db_async, booking, reason="Booking cancelled"
    )
    await db_async.commit()

    keys = stripe_env.refund_keys()
    assert len(keys) == 2
    assert keys[0] is not None and keys[0].startswith("refund-")
    assert keys[0] == keys[1]
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
