"""Issue #1824: before a refund under an id we may already have sent is retried, the
core asks the provider which refunds it holds for the payment and records the one
that exists, instead of sending a second refund. Stripe forgets idempotency keys
after about 24 hours, so the key alone is not enough. The Stripe double models the
key rule too: a key reused with other parameters is a 400 ``idempotency_error``.
"""

import uuid

import httpx
import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.models import User
from src.organisations.models import PlatformOrganisation
from src.payments import schemas, service
from src.payments.exceptions import ProviderRequestError, RefundFailedAtProvider
from src.payments.models import Refund, RefundStatus
from src.payments.providers import stripe as stripe_module
from tests.payments.conftest import StripeStub, checkout_completed, signed
from tests.payments.test_payments import API, _org, _stripe_intent

pytestmark = pytest.mark.asyncio

WEBHOOK = f"{API}/public/webhooks/stripe"
PAID = 5000
STRIPE_API = "https://api.stripe.com"


async def _paid_card_intent(
    client: httpx.AsyncClient, org: PlatformOrganisation, admin: User
) -> str:
    intent_id = await _stripe_intent(client, org, admin)
    body, headers = signed(
        checkout_completed(intent_id, amount=PAID, payment_intent="pi_test_1")
    )
    assert (
        await client.post(WEBHOOK, content=body, headers=headers)
    ).status_code == 200
    return intent_id


async def _refund_rows(db: AsyncSession, intent_id: str) -> list[Refund]:
    return list(
        await db.scalars(
            select(Refund)
            .where(Refund.intent_id == uuid.UUID(intent_id))
            .execution_options(populate_existing=True)
        )
    )


async def _refund(
    db: AsyncSession,
    org_id: str,
    intent_id: str,
    refund_id: uuid.UUID,
    amount: int = 2000,
) -> None:
    await service.refund_intent(
        db,
        organisation_id=org_id,
        intent_id=uuid.UUID(intent_id),
        actor=None,
        payload=schemas.PaymentRefundCreate(amount_minor=amount, reason="Partial"),
        refund_id=refund_id,
    )


def _posts(stub: StripeStub) -> int:
    return len(stub.refund_keys())


async def test_a_refund_the_provider_already_holds_is_recorded_not_sent_again(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    stripe_env: StripeStub,
) -> None:
    org, admin = await _org(db_async)
    org_id = org.id
    intent_id = await _paid_card_intent(async_client, org, admin)
    refund_id = uuid.uuid4()

    # The provider refund succeeds, the commit is lost, and Stripe forgets the key.
    await _refund(db_async, org_id, intent_id, refund_id)
    await db_async.rollback()
    stripe_env.forget_keys()
    assert await _refund_rows(db_async, intent_id) == []

    await _refund(db_async, org_id, intent_id, refund_id)
    await db_async.commit()

    assert _posts(stripe_env) == 1, "the retry must not send a second refund"
    assert stripe_env.refunds_created == 1
    rows = await _refund_rows(db_async, intent_id)
    assert [(row.id, row.status, row.amount_minor) for row in rows] == [
        (refund_id, RefundStatus.SUCCEEDED.value, 2000)
    ]
    assert rows[0].provider_ref == "re_test_1"


async def test_a_provider_pending_refund_is_recorded_as_pending(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    stripe_env: StripeStub,
) -> None:
    org, admin = await _org(db_async)
    org_id = org.id
    intent_id = await _paid_card_intent(async_client, org, admin)
    refund_id = uuid.uuid4()
    stripe_env.refund_status = "pending"

    await _refund(db_async, org_id, intent_id, refund_id)
    await db_async.rollback()
    stripe_env.forget_keys()
    await _refund(db_async, org_id, intent_id, refund_id)
    await db_async.commit()

    assert _posts(stripe_env) == 1
    rows = await _refund_rows(db_async, intent_id)
    assert [row.status for row in rows] == [RefundStatus.PENDING.value]


async def test_a_refund_the_provider_marked_failed_is_not_sent_under_the_same_id(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    stripe_env: StripeStub,
) -> None:
    org, admin = await _org(db_async)
    org_id = org.id
    intent_id = await _paid_card_intent(async_client, org, admin)
    refund_id = uuid.uuid4()
    stripe_env.refund_status = "pending"

    await _refund(db_async, org_id, intent_id, refund_id)
    await db_async.rollback()
    # The provider later marks the refund failed; the key is forgotten too.
    provider_id = next(iter(stripe_env.refunds))
    stripe_env.refunds[provider_id]["status"] = "failed"
    stripe_env.forget_keys()

    with pytest.raises(RefundFailedAtProvider):
        await _refund(db_async, org_id, intent_id, refund_id)
    await db_async.rollback()

    assert _posts(stripe_env) == 1
    assert await _refund_rows(db_async, intent_id) == []


async def test_an_incomplete_provider_listing_stops_a_refund_retry(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    stripe_env: StripeStub,
) -> None:
    org, admin = await _org(db_async)
    org_id = org.id
    intent_id = await _paid_card_intent(async_client, org, admin)
    stripe_env.list_incomplete = True

    # The listing cannot show whether this refund exists, so nothing is sent.
    with pytest.raises(ProviderRequestError):
        await _refund(db_async, org_id, intent_id, uuid.uuid4())
    await db_async.rollback()

    assert _posts(stripe_env) == 0
    assert await _refund_rows(db_async, intent_id) == []


async def test_a_first_refund_lists_the_provider_before_it_sends(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    stripe_env: StripeStub,
) -> None:
    org, admin = await _org(db_async)
    org_id = org.id
    intent_id = await _paid_card_intent(async_client, org, admin)
    before = len(stripe_env.requests)

    await _refund(db_async, org_id, intent_id, uuid.uuid4())
    await db_async.commit()

    sent = [
        (request.method, request.url.path) for request in stripe_env.requests[before:]
    ]
    assert sent == [("GET", "/v1/refunds"), ("POST", "/v1/refunds")]


async def test_a_refund_without_an_id_is_not_listed(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    stripe_env: StripeStub,
) -> None:
    # A refund with no caller id (a staff refund) can never be retried under the same
    # id, so the provider is not asked first.
    org, admin = await _org(db_async)
    org_id = org.id
    intent_id = await _paid_card_intent(async_client, org, admin)
    before = len(stripe_env.requests)

    await service.refund_intent(
        db_async,
        organisation_id=org_id,
        intent_id=uuid.UUID(intent_id),
        actor=None,
        payload=schemas.PaymentRefundCreate(amount_minor=1000, reason="Staff"),
    )
    await db_async.commit()

    sent = [request.method for request in stripe_env.requests[before:]]
    assert sent == ["POST"]


async def test_the_double_refuses_a_reused_key_with_other_parameters(
    stripe_env: StripeStub,
) -> None:
    async with httpx.AsyncClient(transport=stripe_module._transport) as client:
        first = await client.post(
            f"{STRIPE_API}/v1/refunds",
            data={"payment_intent": "pi_test_1", "amount": "1000"},
            headers={"Idempotency-Key": "refund-same"},
        )
        assert first.status_code == 200
        reused = await client.post(
            f"{STRIPE_API}/v1/refunds",
            data={"payment_intent": "pi_test_1", "amount": "2000"},
            headers={"Idempotency-Key": "refund-same"},
        )
        replayed = await client.post(
            f"{STRIPE_API}/v1/refunds",
            data={"payment_intent": "pi_test_1", "amount": "1000"},
            headers={"Idempotency-Key": "refund-same"},
        )

    assert reused.status_code == 400
    assert reused.json()["error"]["type"] == "idempotency_error"
    assert replayed.status_code == 200
    assert replayed.json()["id"] == first.json()["id"]
    assert stripe_env.refunds_created == 1
