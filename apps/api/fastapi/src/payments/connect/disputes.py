"""Card disputes on a business's connected account (ADR-0027, Connect).

A dispute is recorded and shown to the business. It is never a ledger entry and
Barrels never answers or reverses it: the business handles it in its own Stripe
Dashboard, as the seller.
"""

import logging
import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from src.payments import schemas
from src.payments.models import Intent

from .models import Dispute

logger = logging.getLogger(__name__)


async def dispute_for(
    session: AsyncSession, provider_dispute_ref: str
) -> Dispute | None:
    return (
        await session.execute(
            select(Dispute).where(Dispute.provider_dispute_ref == provider_dispute_ref)
        )
    ).scalar_one_or_none()


def _when(value: object) -> datetime | None:
    if isinstance(value, int) and not isinstance(value, bool):
        return datetime.fromtimestamp(value, UTC).replace(tzinfo=None)
    return None


async def record_dispute(
    session: AsyncSession,
    *,
    organisation_id: str,
    connected_account_id: str,
    dispute: dict[str, Any],
) -> str:
    """Record one dispute the business must answer. Returns ``processed`` or
    ``duplicate``; a dispute with a malformed amount or currency is ``ignored``."""
    ref = dispute.get("id")
    amount = dispute.get("amount")
    currency = dispute.get("currency")
    if not isinstance(ref, str) or not ref:
        return "ignored"
    if not isinstance(amount, int) or isinstance(amount, bool) or amount <= 0:
        return "ignored"
    if not isinstance(currency, str) or len(currency) != 3:
        return "ignored"
    if await dispute_for(session, ref) is not None:
        return "duplicate"

    payment_ref = dispute.get("payment_intent")
    payment_ref = payment_ref if isinstance(payment_ref, str) else None
    intent_id: uuid.UUID | None = None
    if payment_ref is not None:
        intent_id = await session.scalar(
            select(Intent.id)
            .where(
                Intent.provider == "stripe",
                Intent.provider_payment_ref == payment_ref,
                Intent.connected_account_id == connected_account_id,
            )
            .limit(1)
        )
    evidence = dispute.get("evidence_details")
    due_by = _when(evidence.get("due_by")) if isinstance(evidence, dict) else None
    status = dispute.get("status")
    reason = dispute.get("reason")
    row = Dispute(
        organisation_id=organisation_id,
        intent_id=intent_id,
        provider_dispute_ref=ref,
        provider_payment_ref=payment_ref,
        amount_minor=amount,
        currency=currency.upper(),
        status=(status if isinstance(status, str) else "unknown")[:40],
        reason=reason[:60] if isinstance(reason, str) and reason else None,
        evidence_due_by=due_by,
    )
    try:
        async with session.begin_nested():
            session.add(row)
            await session.flush()
    except IntegrityError:
        # A concurrent delivery recorded it first.
        return "duplicate"
    logger.warning(
        "card dispute recorded for the business",
        extra={
            "organisation_id": organisation_id,
            "intent_id": str(intent_id) if intent_id else None,
        },
    )
    return "processed"


def _public(row: Dispute) -> schemas.DisputePublic:
    return schemas.DisputePublic(
        id=row.id,
        intent_id=row.intent_id,
        provider_dispute_ref=row.provider_dispute_ref,
        amount_minor=row.amount_minor,
        currency=row.currency,
        status=row.status,
        reason=row.reason,
        evidence_due_by=row.evidence_due_by,
        created_at=row.created_at,
    )


async def list_disputes(
    session: AsyncSession, *, organisation_id: str, skip: int, limit: int
) -> tuple[list[schemas.DisputePublic], int]:
    """The organisation's disputes, newest first."""
    total = (
        await session.execute(
            select(func.count())
            .select_from(Dispute)
            .where(Dispute.organisation_id == organisation_id)
        )
    ).scalar_one()
    rows = (
        await session.execute(
            select(Dispute)
            .where(Dispute.organisation_id == organisation_id)
            .order_by(Dispute.created_at.desc(), Dispute.id)
            .offset(skip)
            .limit(limit)
        )
    ).scalars()
    return [_public(row) for row in rows], total
