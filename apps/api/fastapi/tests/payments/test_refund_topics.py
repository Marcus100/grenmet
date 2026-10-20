"""Payments tells the owning domain about a refund through the outbox (N4b)."""

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.organisations.models import MembershipRole
from src.outbox import Outbox
from src.payments import schemas, service
from src.payments.models import Refund
from tests.factories import make_user
from tests.organisations.support import make_org


async def _refunded_intent(
    db: AsyncSession, source_type: str
) -> tuple[str, str, uuid.UUID]:
    owner = await make_user(db)
    org = await make_org(
        db,
        f"Refunds {uuid.uuid4().hex[:6]}",
        members=((owner, MembershipRole.OWNER),),
        apps=("payments",),
    )
    source_id = str(uuid.uuid4())
    created = await service.create_intent(
        db,
        organisation_id=org.id,
        actor=None,
        payload=schemas.PaymentIntentCreate(
            amount_minor=3000,
            source_type=source_type,
            source_id=source_id,
            idempotency_key=f"{source_type}:{source_id}",
        ),
    )
    intent_id = created.intent.id
    await service.record_manual_payment(
        db,
        organisation_id=org.id,
        intent_id=intent_id,
        actor=owner,
        payload=schemas.ManualPaymentCreate(method="cash"),
    )
    await service.refund_intent(
        db,
        organisation_id=org.id,
        intent_id=intent_id,
        actor=None,
        payload=schemas.PaymentRefundCreate(reason="Test"),
    )
    await db.commit()
    return org.id, source_id, intent_id


async def test_an_events_order_refund_is_announced_once_per_refund(
    db_async: AsyncSession,
) -> None:
    org_id, source_id, intent_id = await _refunded_intent(db_async, "events.order")
    refund = await db_async.scalar(select(Refund).where(Refund.intent_id == intent_id))
    assert refund is not None
    rows = list(
        await db_async.scalars(
            select(Outbox).where(Outbox.topic == "events.order_refunded")
        )
    )
    assert len(rows) == 1
    assert rows[0].dedupe_key == str(refund.id)
    assert rows[0].organisation_id == org_id
    assert rows[0].payload == {
        "intent_id": str(intent_id),
        "source_id": source_id,
        "refund_id": str(refund.id),
    }
    # The payment itself was announced on its own topic.
    paid = await db_async.scalar(
        select(Outbox).where(Outbox.topic == "events.order_paid")
    )
    assert paid is not None


async def test_other_sources_are_not_sent_refund_topics(
    db_async: AsyncSession,
) -> None:
    await _refunded_intent(db_async, "bookings.deposit")
    topics = set(await db_async.scalars(select(Outbox.topic)))
    assert "bookings.deposit_paid" in topics
    assert not any(topic.endswith("_refunded") for topic in topics)
