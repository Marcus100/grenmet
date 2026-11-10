"""Provider events out of order and delivered twice (Stripe does both).

A late or repeated report must never move a payment or a refund backwards, and must
never repeat a side effect. A report the table refuses is ignored: it is logged at
INFO with its event id, and the webhook still answers 2xx so Stripe stops retrying.
Money that arrives after a failure or a cancellation is still recorded (the payer
paid), which is a forward move and is asserted as such.
"""

import uuid
from typing import Any
from unittest.mock import MagicMock

import httpx
import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.payments import service
from src.payments.models import LedgerEntry, LedgerKind, Refund, RefundStatus
from tests.organisations.support import headers_for
from tests.payments.conftest import (
    checkout_completed,
    refund_event,
    refund_object,
    signed,
)
from tests.payments.test_payments import API, _create, _org, _stripe_intent
from tests.payments.test_refund_reconciliation import _paid_card_intent

pytestmark = pytest.mark.asyncio

WEBHOOK = f"{API}/public/webhooks/stripe"
PAID = 5000


def _payment_failed(event_id: str, intent_id: str) -> dict[str, Any]:
    return {
        "id": event_id,
        "type": "payment_intent.payment_failed",
        "data": {
            "object": {
                "id": "pi_test_1",
                "metadata": {"intent_id": intent_id},
                "last_payment_error": {"code": "card_declined"},
            }
        },
    }


async def _post(client: httpx.AsyncClient, event: dict[str, Any]) -> None:
    body, headers = signed(event)
    response = await client.post(WEBHOOK, content=body, headers=headers)
    assert response.status_code == 200, response.text


async def _status(
    client: httpx.AsyncClient, org: Any, admin: Any, intent_id: str
) -> str:
    detail = await client.get(
        f"{API}/org/intents/{intent_id}", headers=headers_for(admin, org.id)
    )
    assert detail.status_code == 200, detail.text
    return str(detail.json()["intent"]["status"])


async def _entries(db: AsyncSession, intent_id: str, kind: LedgerKind) -> list[int]:
    rows = await db.scalars(
        select(LedgerEntry)
        .where(
            LedgerEntry.intent_id == uuid.UUID(intent_id),
            LedgerEntry.kind == kind.value,
        )
        .execution_options(populate_existing=True)
    )
    return sorted(entry.amount_minor for entry in rows)


async def _refund_row(db: AsyncSession, refund_id: uuid.UUID) -> Refund:
    row = await db.get(Refund, refund_id, populate_existing=True)
    assert row is not None
    return row


def _ignored_event_ids(logged: MagicMock) -> list[object]:
    """The event ids of the reports the service logged as ignored at INFO."""
    return [
        call.kwargs["extra"]["event_id"]
        for call in logged.info.call_args_list
        if "ignored" in call.args[0]
    ]


def _refund_report(
    refund_id: uuid.UUID, intent_id: str, event_id: str, event_type: str, status: str
) -> dict[str, Any]:
    return refund_event(
        event_id,
        event_type,
        refund_object(
            "re_order",
            2000,
            status=status,
            refund_id=refund_id,
            intent_id=intent_id,
        ),
    )


@pytest.mark.usefixtures("stripe_env")
async def test_a_failure_reported_after_the_payment_succeeded_changes_nothing(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    org, admin = await _org(db_async)
    intent_id = await _paid_card_intent(async_client, org, admin)

    logged = MagicMock()
    monkeypatch.setattr(service, "logger", logged)
    await _post(async_client, _payment_failed("evt_late_failure", intent_id))
    # The same late report again: still nothing moves.
    await _post(async_client, _payment_failed("evt_late_failure_2", intent_id))

    assert await _status(async_client, org, admin, intent_id) == "succeeded"
    assert await _entries(db_async, intent_id, LedgerKind.CHARGE) == [PAID]
    assert _ignored_event_ids(logged) == ["evt_late_failure", "evt_late_failure_2"]


@pytest.mark.usefixtures("stripe_env")
async def test_money_reported_after_a_failure_is_recorded_once(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    org, admin = await _org(db_async)
    intent_id = await _stripe_intent(async_client, org, admin)
    await _post(async_client, _payment_failed("evt_failed_first", intent_id))
    assert await _status(async_client, org, admin, intent_id) == "failed"

    # A retry in the same checkout pays: the payer's money is recorded.
    paid = checkout_completed(intent_id, event_id="evt_paid_after_failure")
    await _post(async_client, paid)
    await _post(async_client, paid)
    # The earlier failure, delivered again afterwards, does not undo it.
    await _post(async_client, _payment_failed("evt_failed_replay", intent_id))

    assert await _status(async_client, org, admin, intent_id) == "succeeded"
    assert await _entries(db_async, intent_id, LedgerKind.CHARGE) == [PAID]


@pytest.mark.usefixtures("stripe_env")
async def test_a_repeated_failure_is_a_noop_and_keeps_the_first_attempt_answer(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    org, admin = await _org(db_async)
    intent_id = await _stripe_intent(async_client, org, admin)
    await _post(async_client, _payment_failed("evt_fail_1", intent_id))

    logged = MagicMock()
    monkeypatch.setattr(service, "logger", logged)
    await _post(async_client, _payment_failed("evt_fail_2", intent_id))

    assert await _status(async_client, org, admin, intent_id) == "failed"
    assert _ignored_event_ids(logged) == ["evt_fail_2"]
    assert await _entries(db_async, intent_id, LedgerKind.CHARGE) == []


@pytest.mark.usefixtures("stripe_env")
async def test_a_payment_cancelled_before_the_money_arrived_is_still_recorded(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    org, admin = await _org(db_async)
    key = uuid.uuid4().hex
    created = await _create(
        async_client, org, admin, provider="stripe", idempotency_key=key
    )
    intent_id = created["intent"]["id"]
    assert await service.cancel_open_intent(
        db_async,
        organisation_id=org.id,
        source_type="shop.sale",
        source_id="booking-1",
        idempotency_key=key,
    )
    await db_async.commit()
    assert await _status(async_client, org, admin, intent_id) == "cancelled"

    await _post(async_client, checkout_completed(intent_id, event_id="evt_paid_late"))

    assert await _status(async_client, org, admin, intent_id) == "succeeded"
    assert await _entries(db_async, intent_id, LedgerKind.CHARGE) == [PAID]


@pytest.mark.usefixtures("stripe_env")
async def test_cancelling_a_settled_payment_is_refused_and_it_stays_succeeded(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    org, admin = await _org(db_async)
    key = uuid.uuid4().hex
    created = await _create(
        async_client, org, admin, provider="stripe", idempotency_key=key
    )
    intent_id = created["intent"]["id"]
    await _post(async_client, checkout_completed(intent_id, event_id="evt_settle"))
    await db_async.commit()

    assert not await service.cancel_open_intent(
        db_async,
        organisation_id=org.id,
        source_type="shop.sale",
        source_id="booking-1",
        idempotency_key=key,
    )
    await db_async.commit()
    assert await _status(async_client, org, admin, intent_id) == "succeeded"


@pytest.mark.usefixtures("stripe_env")
async def test_a_failure_reported_after_a_cancellation_is_recorded_as_failed(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    # Kept as it was: no money is involved, so the lateral move is safe.
    org, admin = await _org(db_async)
    key = uuid.uuid4().hex
    created = await _create(
        async_client, org, admin, provider="stripe", idempotency_key=key
    )
    intent_id = created["intent"]["id"]
    await service.cancel_open_intent(
        db_async,
        organisation_id=org.id,
        source_type="shop.sale",
        source_id="booking-1",
        idempotency_key=key,
    )
    await db_async.commit()

    await _post(async_client, _payment_failed("evt_fail_after_cancel", intent_id))

    assert await _status(async_client, org, admin, intent_id) == "failed"
    assert await _entries(db_async, intent_id, LedgerKind.CHARGE) == []


@pytest.mark.usefixtures("stripe_env")
async def test_a_pending_report_after_a_settled_refund_is_ignored_and_logged(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    org, admin = await _org(db_async)
    intent_id = await _paid_card_intent(async_client, org, admin)
    refund_id = uuid.uuid4()
    await _post(
        async_client,
        _refund_report(
            refund_id, intent_id, "evt_settled", "refund.created", "succeeded"
        ),
    )

    logged = MagicMock()
    monkeypatch.setattr(service, "logger", logged)
    await _post(
        async_client,
        _refund_report(
            refund_id, intent_id, "evt_late_pending", "refund.updated", "pending"
        ),
    )

    row = await _refund_row(db_async, refund_id)
    assert row.status == RefundStatus.SUCCEEDED.value
    assert await _entries(db_async, intent_id, LedgerKind.REFUND) == [-2000]
    assert await _entries(db_async, intent_id, LedgerKind.ADJUSTMENT) == []
    assert _ignored_event_ids(logged) == ["evt_late_pending"]


@pytest.mark.usefixtures("stripe_env")
async def test_a_failure_reported_after_a_settled_refund_is_ignored(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    org, admin = await _org(db_async)
    intent_id = await _paid_card_intent(async_client, org, admin)
    refund_id = uuid.uuid4()
    await _post(
        async_client,
        _refund_report(
            refund_id, intent_id, "evt_settled_2", "refund.created", "succeeded"
        ),
    )

    logged = MagicMock()
    monkeypatch.setattr(service, "logger", logged)
    await _post(
        async_client,
        _refund_report(
            refund_id, intent_id, "evt_late_failed", "refund.failed", "failed"
        ),
    )

    row = await _refund_row(db_async, refund_id)
    assert row.status == RefundStatus.SUCCEEDED.value
    assert await _entries(db_async, intent_id, LedgerKind.REFUND) == [-2000]
    assert await _entries(db_async, intent_id, LedgerKind.ADJUSTMENT) == []
    assert _ignored_event_ids(logged) == ["evt_late_failed"]


@pytest.mark.usefixtures("stripe_env")
async def test_a_stale_pending_report_after_a_failed_refund_is_ignored_and_logged(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    org, admin = await _org(db_async)
    intent_id = await _paid_card_intent(async_client, org, admin)
    refund_id = uuid.uuid4()
    await _post(
        async_client,
        _refund_report(refund_id, intent_id, "evt_failed", "refund.failed", "failed"),
    )

    logged = MagicMock()
    monkeypatch.setattr(service, "logger", logged)
    await _post(
        async_client,
        _refund_report(refund_id, intent_id, "evt_stale", "refund.created", "pending"),
    )

    row = await _refund_row(db_async, refund_id)
    assert row.status == RefundStatus.FAILED.value
    assert await _entries(db_async, intent_id, LedgerKind.REFUND) == []
    assert _ignored_event_ids(logged) == ["evt_stale"]


@pytest.mark.usefixtures("stripe_env")
async def test_a_settlement_delivered_twice_under_two_event_ids_moves_money_once(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    org, admin = await _org(db_async)
    intent_id = await _paid_card_intent(async_client, org, admin)
    refund_id = uuid.uuid4()
    await _post(
        async_client,
        _refund_report(
            refund_id, intent_id, "evt_pending", "refund.created", "pending"
        ),
    )
    settled = _refund_report(
        refund_id, intent_id, "evt_ok_a", "refund.updated", "succeeded"
    )
    await _post(async_client, settled)
    await _post(
        async_client,
        _refund_report(refund_id, intent_id, "evt_ok_b", "refund.updated", "succeeded"),
    )

    row = await _refund_row(db_async, refund_id)
    assert row.status == RefundStatus.SUCCEEDED.value
    assert await _entries(db_async, intent_id, LedgerKind.REFUND) == [-2000]
    assert await _entries(db_async, intent_id, LedgerKind.ADJUSTMENT) == []
