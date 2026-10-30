"""Refunds seen twice: our own call and the provider's ``charge.refunded`` (#512).

The crash window: the provider refund succeeds, then our transaction is lost before
commit, so the refund row and its ledger entry roll back. Stripe's webhook reports
the refund, and the outbox retries the original request with the same refund id.
The refund must be counted once. Refunds made in Stripe's dashboard (no id of ours)
must still be recorded once.
"""

import uuid

import httpx
import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.models import User
from src.organisations.models import PlatformOrganisation
from src.payments import schemas, service
from src.payments.models import LedgerEntry, LedgerKind, Refund, RefundStatus
from tests.organisations.support import headers_for
from tests.payments.conftest import (
    StripeStub,
    charge_refunded,
    checkout_completed,
    provider_refund,
    signed,
)
from tests.payments.test_payments import API, _org, _stripe_intent

pytestmark = pytest.mark.asyncio

WEBHOOK = f"{API}/public/webhooks/stripe"
PAID = 5000


async def _refund_rows(db: AsyncSession, intent_id: str) -> list[Refund]:
    return list(
        await db.scalars(
            select(Refund)
            .where(Refund.intent_id == uuid.UUID(intent_id))
            .execution_options(populate_existing=True)
        )
    )


async def _refund_ledger(db: AsyncSession, intent_id: str) -> list[LedgerEntry]:
    return list(
        await db.scalars(
            select(LedgerEntry)
            .where(
                LedgerEntry.intent_id == uuid.UUID(intent_id),
                LedgerEntry.kind == LedgerKind.REFUND.value,
            )
            .execution_options(populate_existing=True)
        )
    )


async def _refunded_minor(
    client: httpx.AsyncClient, headers: dict[str, str], intent_id: str
) -> int:
    detail = await client.get(f"{API}/org/intents/{intent_id}", headers=headers)
    assert detail.status_code == 200, detail.text
    return int(detail.json()["intent"]["refunded_minor"])


async def _paid_card_intent(
    client: httpx.AsyncClient, org: PlatformOrganisation, admin: User
) -> str:
    intent_id = await _stripe_intent(client, org, admin)
    body, headers = signed(checkout_completed(intent_id, amount=PAID))
    assert (
        await client.post(WEBHOOK, content=body, headers=headers)
    ).status_code == 200
    return intent_id


async def test_a_refund_lost_before_commit_is_counted_once_after_the_webhook_and_retry(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    stripe_env: StripeStub,
) -> None:
    org, admin = await _org(db_async)
    org_id = org.id
    org_headers = headers_for(admin, org_id)
    intent_id = await _paid_card_intent(async_client, org, admin)
    refund_id = uuid.uuid4()
    payload = schemas.PaymentRefundCreate(amount_minor=2000, reason="Partial")

    # The provider refund succeeds, then the transaction is lost before commit.
    await service.refund_intent(
        db_async,
        organisation_id=org_id,
        intent_id=uuid.UUID(intent_id),
        actor=None,
        payload=payload,
        refund_id=refund_id,
    )
    await db_async.rollback()
    assert stripe_env.form(-1)["metadata[refund_id]"] == str(refund_id)
    assert await _refund_rows(db_async, intent_id) == []

    # Stripe reports the refund we made.
    body, headers = signed(
        charge_refunded(
            "evt_refund_lost",
            amount_refunded=2000,
            refunds=[
                provider_refund(
                    "re_test_1", 2000, refund_id=refund_id, intent_id=intent_id
                )
            ],
        )
    )
    response = await async_client.post(WEBHOOK, content=body, headers=headers)
    assert response.status_code == 200

    # The outbox retries the original request: same refund id, nothing new.
    retried = await service.refund_intent(
        db_async,
        organisation_id=org_id,
        intent_id=uuid.UUID(intent_id),
        actor=None,
        payload=payload,
        refund_id=refund_id,
    )
    await db_async.commit()

    assert retried.id == refund_id
    rows = await _refund_rows(db_async, intent_id)
    assert [(row.id, row.amount_minor) for row in rows] == [(refund_id, 2000)]
    assert rows[0].status == RefundStatus.SUCCEEDED.value
    assert rows[0].provider_ref == "re_test_1"
    ledger = await _refund_ledger(db_async, intent_id)
    assert [entry.amount_minor for entry in ledger] == [-2000]
    assert [r.url.path for r in stripe_env.requests].count("/v1/refunds") == 1
    assert await _refunded_minor(async_client, org_headers, intent_id) == 2000


@pytest.mark.usefixtures("stripe_env")
async def test_a_refund_made_in_the_dashboard_is_recorded_once_and_replays_change_nothing(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
) -> None:
    org, admin = await _org(db_async)
    org_id = org.id
    org_headers = headers_for(admin, org_id)
    intent_id = await _paid_card_intent(async_client, org, admin)
    body, headers = signed(
        charge_refunded(
            "evt_dashboard_1",
            amount_refunded=1500,
            refunds=[provider_refund("re_dashboard_1", 1500)],
        )
    )
    for _ in range(2):
        response = await async_client.post(WEBHOOK, content=body, headers=headers)
        assert response.status_code == 200

    # A later event for the same charge, listing the same refund, adds nothing.
    again, again_headers = signed(
        charge_refunded(
            "evt_dashboard_2",
            amount_refunded=1500,
            refunds=[provider_refund("re_dashboard_1", 1500)],
        )
    )
    assert (
        await async_client.post(WEBHOOK, content=again, headers=again_headers)
    ).status_code == 200

    rows = await _refund_rows(db_async, intent_id)
    assert len(rows) == 1
    assert rows[0].amount_minor == 1500
    assert rows[0].provider_ref == "re_dashboard_1"
    assert [
        entry.amount_minor for entry in await _refund_ledger(db_async, intent_id)
    ] == [-1500]
    assert await _refunded_minor(async_client, org_headers, intent_id) == 1500


@pytest.mark.usefixtures("stripe_env")
async def test_a_refund_the_app_already_recorded_is_not_recorded_again(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
) -> None:
    org, admin = await _org(db_async)
    org_id = org.id
    org_headers = headers_for(admin, org_id)
    intent_id = await _paid_card_intent(async_client, org, admin)
    refund_id = uuid.uuid4()
    await service.refund_intent(
        db_async,
        organisation_id=org_id,
        intent_id=uuid.UUID(intent_id),
        actor=None,
        payload=schemas.PaymentRefundCreate(amount_minor=2000, reason="Partial"),
        refund_id=refund_id,
    )
    await db_async.commit()

    body, headers = signed(
        charge_refunded(
            "evt_app_refund",
            amount_refunded=2000,
            refunds=[
                provider_refund(
                    "re_test_1", 2000, refund_id=refund_id, intent_id=intent_id
                )
            ],
        )
    )
    assert (
        await async_client.post(WEBHOOK, content=body, headers=headers)
    ).status_code == 200
    assert [row.id for row in await _refund_rows(db_async, intent_id)] == [refund_id]
    assert await _refunded_minor(async_client, org_headers, intent_id) == 2000


@pytest.mark.usefixtures("stripe_env")
async def test_a_refund_known_by_provider_id_is_matched_when_the_metadata_is_missing(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
) -> None:
    org, admin = await _org(db_async)
    org_id = org.id
    org_headers = headers_for(admin, org_id)
    intent_id = await _paid_card_intent(async_client, org, admin)
    await service.refund_intent(
        db_async,
        organisation_id=org_id,
        intent_id=uuid.UUID(intent_id),
        actor=None,
        payload=schemas.PaymentRefundCreate(amount_minor=2000, reason="Partial"),
    )
    await db_async.commit()
    # The refund's provider id is known on our row; the listed refund carries none.
    body, headers = signed(
        charge_refunded(
            "evt_by_provider_id",
            amount_refunded=2000,
            refunds=[provider_refund("re_test_1", 2000)],
        )
    )
    assert (
        await async_client.post(WEBHOOK, content=body, headers=headers)
    ).status_code == 200
    assert len(await _refund_rows(db_async, intent_id)) == 1
    assert await _refunded_minor(async_client, org_headers, intent_id) == 2000


async def test_a_refund_still_pending_at_the_provider_is_completed_by_the_webhook(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    stripe_env: StripeStub,
) -> None:
    org, admin = await _org(db_async)
    org_id = org.id
    org_headers = headers_for(admin, org_id)
    intent_id = await _paid_card_intent(async_client, org, admin)
    refund_id = uuid.uuid4()
    stripe_env.refund_status = "pending"
    await service.refund_intent(
        db_async,
        organisation_id=org_id,
        intent_id=uuid.UUID(intent_id),
        actor=None,
        payload=schemas.PaymentRefundCreate(amount_minor=2000, reason="Partial"),
        refund_id=refund_id,
    )
    await db_async.commit()
    (row,) = await _refund_rows(db_async, intent_id)
    assert row.status == RefundStatus.PENDING.value

    body, headers = signed(
        charge_refunded(
            "evt_settled",
            amount_refunded=2000,
            refunds=[
                provider_refund(
                    "re_test_1", 2000, refund_id=refund_id, intent_id=intent_id
                )
            ],
        )
    )
    assert (
        await async_client.post(WEBHOOK, content=body, headers=headers)
    ).status_code == 200
    (row,) = await _refund_rows(db_async, intent_id)
    assert row.status == RefundStatus.SUCCEEDED.value
    assert await _refunded_minor(async_client, org_headers, intent_id) == 2000


@pytest.mark.usefixtures("stripe_env")
async def test_a_truncated_refund_list_is_not_guessed_from_the_total(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
) -> None:
    """More refunds than the event carries: the remainder is not recorded from the
    running total, because it could be a refund of ours already on its way."""
    org, admin = await _org(db_async)
    intent_id = await _paid_card_intent(async_client, org, admin)
    body, headers = signed(
        charge_refunded(
            "evt_truncated",
            amount_refunded=3000,
            refunds=[provider_refund("re_listed", 1000)],
            has_more=True,
        )
    )
    assert (
        await async_client.post(WEBHOOK, content=body, headers=headers)
    ).status_code == 200
    rows = await _refund_rows(db_async, intent_id)
    assert [row.amount_minor for row in rows] == [1000]
    assert [
        entry.amount_minor for entry in await _refund_ledger(db_async, intent_id)
    ] == [-1000]
