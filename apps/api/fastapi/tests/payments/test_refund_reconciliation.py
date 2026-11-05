"""Refunds seen twice: our own call and the provider's ``charge.refunded`` (#512).

The crash window: the provider refund succeeds, then our transaction is lost before
commit, so the refund row and its ledger entry roll back. Stripe's webhook reports
the refund, and the outbox retries the original request with the same refund id.
The refund must be counted once. Refunds made in Stripe's dashboard (no id of ours)
must still be recorded once.
"""

import uuid
from unittest.mock import MagicMock

import httpx
import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.models import User
from src.organisations.models import PlatformOrganisation
from src.payments import schemas, service
from src.payments import service as service_module
from src.payments.exceptions import PaymentsConflictError
from src.payments.models import LedgerEntry, LedgerKind, Refund, RefundStatus
from tests.organisations.support import headers_for
from tests.payments.conftest import (
    StripeStub,
    charge_refunded,
    checkout_completed,
    provider_refund,
    refund_event,
    refund_object,
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
    client: httpx.AsyncClient,
    org: PlatformOrganisation,
    admin: User,
    payment_intent: str = "pi_test_1",
) -> str:
    intent_id = await _stripe_intent(client, org, admin)
    body, headers = signed(
        checkout_completed(intent_id, amount=PAID, payment_intent=payment_intent)
    )
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


async def _refund_entries(db: AsyncSession, intent_id: str, kind: str) -> list[int]:
    rows = await db.scalars(
        select(LedgerEntry)
        .where(LedgerEntry.intent_id == uuid.UUID(intent_id), LedgerEntry.kind == kind)
        .execution_options(populate_existing=True)
    )
    return [entry.amount_minor for entry in rows]


async def _post(
    client: httpx.AsyncClient, body: bytes, headers: dict[str, str]
) -> None:
    assert (
        await client.post(WEBHOOK, content=body, headers=headers)
    ).status_code == 200


async def test_a_charge_refunded_without_a_refund_list_records_nothing_then_the_retry_counts_once(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    stripe_env: StripeStub,
) -> None:
    """Current Stripe API versions do not list refunds on a charge unless expanded,
    and webhooks are never expanded. Without the list nothing is guessed from the
    total, so the lost refund is not written under a random id; the outbox retry
    writes it under our id, once."""
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
    await db_async.rollback()

    body, headers = signed(charge_refunded("evt_no_list", amount_refunded=2000))
    await _post(async_client, body, headers)
    assert await _refund_rows(db_async, intent_id) == []

    await service.refund_intent(
        db_async,
        organisation_id=org_id,
        intent_id=uuid.UUID(intent_id),
        actor=None,
        payload=schemas.PaymentRefundCreate(amount_minor=2000, reason="Partial"),
        refund_id=refund_id,
    )
    await db_async.commit()
    assert [row.id for row in await _refund_rows(db_async, intent_id)] == [refund_id]
    assert await _refund_entries(db_async, intent_id, "refund") == [-2000]
    # Nothing was recorded, so the retry sends again, under the same idempotency key:
    # Stripe answers with the refund it already made, and moves no more money.
    sent = [r for r in stripe_env.requests if r.url.path == "/v1/refunds"]
    assert len(sent) == 2
    assert {r.headers["idempotency-key"] for r in sent} == {f"refund-{refund_id}"}
    assert await _refunded_minor(async_client, org_headers, intent_id) == 2000


async def test_a_refund_created_after_a_lost_commit_is_counted_once_through_the_retry(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    stripe_env: StripeStub,
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
    await db_async.rollback()

    created = refund_event(
        "evt_refund_created",
        "refund.created",
        refund_object("re_test_1", 2000, refund_id=refund_id, intent_id=intent_id),
    )
    body, headers = signed(created)
    await _post(async_client, body, headers)
    # The provider's report is recorded under our id, so the retry has a row to find.
    assert [row.id for row in await _refund_rows(db_async, intent_id)] == [refund_id]
    await _post(async_client, body, headers)  # a replay
    updated, updated_headers = signed(
        refund_event(
            "evt_refund_updated",
            "refund.updated",
            refund_object("re_test_1", 2000, refund_id=refund_id, intent_id=intent_id),
        )
    )
    await _post(async_client, updated, updated_headers)

    await service.refund_intent(
        db_async,
        organisation_id=org_id,
        intent_id=uuid.UUID(intent_id),
        actor=None,
        payload=schemas.PaymentRefundCreate(amount_minor=2000, reason="Partial"),
        refund_id=refund_id,
    )
    await db_async.commit()
    assert [row.id for row in await _refund_rows(db_async, intent_id)] == [refund_id]
    assert await _refund_entries(db_async, intent_id, "refund") == [-2000]
    assert [r.url.path for r in stripe_env.requests].count("/v1/refunds") == 1
    assert await _refunded_minor(async_client, org_headers, intent_id) == 2000


async def test_a_pending_refund_settles_once_when_the_provider_reports_it_succeeded(
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

    pending, pending_headers = signed(
        refund_event(
            "evt_refund_pending",
            "refund.created",
            refund_object(
                "re_test_1",
                2000,
                status="pending",
                refund_id=refund_id,
                intent_id=intent_id,
            ),
        )
    )
    await _post(async_client, pending, pending_headers)
    succeeded, succeeded_headers = signed(
        refund_event(
            "evt_refund_settled",
            "refund.updated",
            refund_object("re_test_1", 2000, refund_id=refund_id, intent_id=intent_id),
        )
    )
    await _post(async_client, succeeded, succeeded_headers)
    # The charge report (with the list) and a replay of the settled event add nothing.
    listed, listed_headers = signed(
        charge_refunded(
            "evt_charge_settled",
            amount_refunded=2000,
            refunds=[
                provider_refund(
                    "re_test_1", 2000, refund_id=refund_id, intent_id=intent_id
                )
            ],
        )
    )
    await _post(async_client, listed, listed_headers)
    await _post(async_client, succeeded, succeeded_headers)

    (row,) = await _refund_rows(db_async, intent_id)
    assert (row.id, row.status) == (refund_id, RefundStatus.SUCCEEDED.value)
    assert await _refund_entries(db_async, intent_id, "refund") == [-2000]
    assert await _refunded_minor(async_client, org_headers, intent_id) == 2000


async def test_a_refund_the_provider_reports_failed_is_recorded_failed_and_reversed(
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
    assert await _refunded_minor(async_client, org_headers, intent_id) == 2000

    failed, failed_headers = signed(
        refund_event(
            "evt_refund_failed",
            "refund.failed",
            refund_object(
                "re_test_1",
                2000,
                status="failed",
                refund_id=refund_id,
                intent_id=intent_id,
            ),
        )
    )
    await _post(async_client, failed, failed_headers)
    await _post(async_client, failed, failed_headers)  # a replay

    (row,) = await _refund_rows(db_async, intent_id)
    assert row.status == RefundStatus.FAILED.value
    assert await _refunded_minor(async_client, org_headers, intent_id) == 0
    assert await _refund_entries(db_async, intent_id, "refund") == [-2000]
    assert await _refund_entries(db_async, intent_id, "adjustment") == [2000]
    # A failed refund is not replayed as if it had worked.
    with pytest.raises(PaymentsConflictError):
        await service.refund_intent(
            db_async,
            organisation_id=org_id,
            intent_id=uuid.UUID(intent_id),
            actor=None,
            payload=schemas.PaymentRefundCreate(amount_minor=2000, reason="Partial"),
            refund_id=refund_id,
        )


@pytest.mark.usefixtures("stripe_env")
async def test_a_dashboard_refund_reported_by_refund_created_is_recorded_once(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
) -> None:
    org, admin = await _org(db_async)
    org_headers = headers_for(admin, org.id)
    intent_id = await _paid_card_intent(async_client, org, admin)
    body, headers = signed(
        refund_event(
            "evt_dash_created",
            "refund.created",
            refund_object("re_dashboard_9", 1500),
        )
    )
    await _post(async_client, body, headers)
    await _post(async_client, body, headers)
    (row,) = await _refund_rows(db_async, intent_id)
    assert (row.amount_minor, row.provider_ref) == (1500, "re_dashboard_9")
    assert await _refund_entries(db_async, intent_id, "refund") == [-1500]
    assert await _refunded_minor(async_client, org_headers, intent_id) == 1500


@pytest.mark.usefixtures("stripe_env")
async def test_a_listed_pending_refund_is_recorded_as_pending_once(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
) -> None:
    org, admin = await _org(db_async)
    org_headers = headers_for(admin, org.id)
    intent_id = await _paid_card_intent(async_client, org, admin)
    pending, pending_headers = signed(
        charge_refunded(
            "evt_list_pending",
            amount_refunded=0,
            refunds=[provider_refund("re_pend_1", 1500, status="pending")],
        )
    )
    await _post(async_client, pending, pending_headers)
    (row,) = await _refund_rows(db_async, intent_id)
    assert (row.status, row.provider_ref) == (RefundStatus.PENDING.value, "re_pend_1")
    # Pending refunds are live: they count against what can still be refunded.
    assert await _refunded_minor(async_client, org_headers, intent_id) == 1500

    settled, settled_headers = signed(
        charge_refunded(
            "evt_list_settled",
            amount_refunded=1500,
            refunds=[provider_refund("re_pend_1", 1500)],
        )
    )
    await _post(async_client, settled, settled_headers)
    (row,) = await _refund_rows(db_async, intent_id)
    assert row.status == RefundStatus.SUCCEEDED.value
    assert await _refund_entries(db_async, intent_id, "refund") == [-1500]


@pytest.mark.usefixtures("stripe_env")
async def test_listed_refunds_are_capped_at_what_was_captured(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
) -> None:
    org, admin = await _org(db_async)
    org_headers = headers_for(admin, org.id)
    intent_id = await _paid_card_intent(async_client, org, admin)
    body, headers = signed(
        charge_refunded(
            "evt_too_big",
            amount_refunded=9000,
            refunds=[provider_refund("re_big", 9000)],
        )
    )
    await _post(async_client, body, headers)
    (row,) = await _refund_rows(db_async, intent_id)
    assert row.amount_minor == PAID
    assert await _refunded_minor(async_client, org_headers, intent_id) == PAID


@pytest.mark.usefixtures("stripe_env")
async def test_a_charge_refunded_without_a_list_says_the_refund_subscription_may_be_missing(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    org, admin = await _org(db_async)
    await _paid_card_intent(async_client, org, admin)
    log = MagicMock()
    monkeypatch.setattr(service_module, "logger", log)
    body, headers = signed(charge_refunded("evt_no_list_log", amount_refunded=2000))
    await _post(async_client, body, headers)
    (message,) = [call.args[0] for call in log.error.call_args_list]
    assert "refund.created" in message and "subscription may be missing" in message


@pytest.mark.usefixtures("stripe_env")
async def test_refund_events_name_the_payment_by_its_payment_intent_and_refuse_a_conflict(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The provider's payment_intent decides which payment a refund event is about.
    Our metadata is only a fallback. When both name different payments, nothing is
    recorded on either."""
    org, admin = await _org(db_async)
    org_headers = headers_for(admin, org.id)
    intent_a = await _paid_card_intent(async_client, org, admin, "pi_a")
    intent_b = await _paid_card_intent(async_client, org, admin, "pi_b")
    log = MagicMock()
    monkeypatch.setattr(service_module, "logger", log)

    conflict, conflict_headers = signed(
        refund_event(
            "evt_conflict",
            "refund.created",
            refund_object(
                "re_conflict", 1000, payment_intent="pi_a", intent_id=intent_b
            ),
        )
    )
    await _post(async_client, conflict, conflict_headers)
    assert await _refund_rows(db_async, intent_a) == []
    assert await _refund_rows(db_async, intent_b) == []
    assert any("two payments" in call.args[0] for call in log.error.call_args_list)

    by_payment, by_payment_headers = signed(
        refund_event(
            "evt_by_payment",
            "refund.created",
            refund_object("re_by_payment", 1000, payment_intent="pi_a"),
        )
    )
    await _post(async_client, by_payment, by_payment_headers)
    (row,) = await _refund_rows(db_async, intent_a)
    assert row.provider_ref == "re_by_payment"
    assert await _refund_rows(db_async, intent_b) == []
    assert await _refunded_minor(async_client, org_headers, intent_a) == 1000


@pytest.mark.usefixtures("stripe_env")
async def test_a_refund_reported_before_its_pending_report_is_settled_once(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
) -> None:
    """Out of order: refund.updated (succeeded) arrives before refund.created (pending).
    The late pending report must not move a settled refund back."""
    org, admin = await _org(db_async)
    org_headers = headers_for(admin, org.id)
    intent_id = await _paid_card_intent(async_client, org, admin)
    refund_id = uuid.uuid4()
    succeeded, succeeded_headers = signed(
        refund_event(
            "evt_first_succeeded",
            "refund.updated",
            refund_object("re_ooo", 2000, refund_id=refund_id, intent_id=intent_id),
        )
    )
    await _post(async_client, succeeded, succeeded_headers)
    late, late_headers = signed(
        refund_event(
            "evt_late_pending",
            "refund.created",
            refund_object(
                "re_ooo",
                2000,
                status="pending",
                refund_id=refund_id,
                intent_id=intent_id,
            ),
        )
    )
    await _post(async_client, late, late_headers)
    await _post(async_client, succeeded, succeeded_headers)

    (row,) = await _refund_rows(db_async, intent_id)
    assert (row.id, row.status) == (refund_id, RefundStatus.SUCCEEDED.value)
    assert await _refund_entries(db_async, intent_id, "refund") == [-2000]
    assert await _refunded_minor(async_client, org_headers, intent_id) == 2000


@pytest.mark.usefixtures("stripe_env")
async def test_a_refund_that_failed_then_succeeded_is_counted_once_and_a_stale_pending_is_ignored(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
) -> None:
    org, admin = await _org(db_async)
    org_headers = headers_for(admin, org.id)
    intent_id = await _paid_card_intent(async_client, org, admin)
    refund_id = uuid.uuid4()

    def report(
        event_id: str, event_type: str, status: str
    ) -> tuple[bytes, dict[str, str]]:
        return signed(
            refund_event(
                event_id,
                event_type,
                refund_object(
                    "re_flip",
                    2000,
                    status=status,
                    refund_id=refund_id,
                    intent_id=intent_id,
                ),
            )
        )

    await _post(async_client, *report("evt_flip_created", "refund.created", "pending"))
    await _post(async_client, *report("evt_flip_failed", "refund.failed", "failed"))
    assert await _refunded_minor(async_client, org_headers, intent_id) == 0
    # A pending report that arrives after the failure is stale: nothing moves.
    await _post(async_client, *report("evt_flip_stale", "refund.created", "pending"))
    assert await _refunded_minor(async_client, org_headers, intent_id) == 0
    # The provider then reports success: the money is taken off the balance again.
    await _post(async_client, *report("evt_flip_ok", "refund.updated", "succeeded"))
    await _post(async_client, *report("evt_flip_ok", "refund.updated", "succeeded"))

    (row,) = await _refund_rows(db_async, intent_id)
    assert (row.id, row.status) == (refund_id, RefundStatus.SUCCEEDED.value)
    assert await _refund_entries(db_async, intent_id, "refund") == [-2000, -2000]
    assert await _refund_entries(db_async, intent_id, "adjustment") == [2000]
    assert await _refunded_minor(async_client, org_headers, intent_id) == 2000
