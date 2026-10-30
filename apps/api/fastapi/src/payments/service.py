"""Payments core (ADR-0027): intents, callbacks, refunds, ledger, reconciliation.

Money is integer minor units. Funds are held on Barrels' merchant account; the
ledger records what each organisation is owed and payouts are manual entries.
Service functions flush and never commit: routers commit.
"""

import csv
import hashlib
import io
import logging
import uuid
from collections.abc import Mapping, Sequence
from datetime import date, time, timedelta
from typing import Any

import sqlalchemy as sa
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from src import outbox
from src.auth.models import User
from src.organisations.models import PlatformOrganisation
from src.utils.datetime import utc_now
from src.utils.timezones import GRENADA, local_to_utc
from src.webhooks_out import service as webhook_service

from . import schemas
from .exceptions import (
    IntentNotFoundError,
    PaymentsConflictError,
    PaymentsValidationError,
)
from .models import (
    Attempt,
    AttemptStatus,
    Intent,
    IntentStatus,
    LedgerEntry,
    LedgerKind,
    ProviderKey,
    Refund,
    RefundStatus,
)
from .providers import registry
from .providers.base import EventKind, ProviderEvent, ProviderRefund

logger = logging.getLogger(__name__)

#: Outbox topic enqueued, in the transaction that records the charge, for a
#: source type whose owning domain must react to a captured payment. Payments
#: imports no consumer: the consumer registers a handler for the topic.
PAID_TOPICS = {
    "bookings.deposit": "bookings.deposit_paid",
    "events.order": "events.order_paid",
}

#: Same idea for a recorded refund (dedupe key = refund id). A source type with
#: no entry is not told: Bookings starts its own refunds and needs no callback.
REFUND_TOPICS = {"events.order": "events.order_refunded"}

#: Refunds that still count against what can be handed back.
_LIVE_REFUND = (RefundStatus.PENDING.value, RefundStatus.SUCCEEDED.value)

#: Source types owned by another domain (it creates them through the service with
#: its own idempotency key and reacts to their payments): the generic org route
#: refuses them so nobody can plant a look-alike intent.
RESERVED_SOURCE_TYPES = frozenset(PAID_TOPICS) | frozenset(REFUND_TOPICS)


def reject_reserved_source(source_type: str) -> None:
    if source_type in RESERVED_SOURCE_TYPES:
        raise PaymentsValidationError(
            f"source_type {source_type} is reserved for the domain that owns it"
        )


def hash_email(email: str) -> str:
    """SHA-256 hex of the trimmed, lower-cased address. The address is not kept."""
    return hashlib.sha256(email.strip().lower().encode()).hexdigest()


# --- reading ------------------------------------------------------------------------


def _captured() -> sa.ScalarSelect[Any]:
    return (
        select(func.coalesce(func.sum(LedgerEntry.amount_minor), 0))
        .where(
            LedgerEntry.intent_id == Intent.id,
            LedgerEntry.kind == LedgerKind.CHARGE.value,
        )
        .correlate(Intent)
        .scalar_subquery()
    )


def _refunded() -> sa.ScalarSelect[Any]:
    return (
        select(func.coalesce(func.sum(Refund.amount_minor), 0))
        .where(Refund.intent_id == Intent.id, Refund.status.in_(_LIVE_REFUND))
        .correlate(Intent)
        .scalar_subquery()
    )


def _intent_select() -> sa.Select[Any]:
    return select(
        Intent, _captured().label("captured_minor"), _refunded().label("refunded_minor")
    )


def _public(row: Any) -> schemas.PaymentIntentPublic:
    intent: Intent = row[0]
    return schemas.PaymentIntentPublic(
        id=intent.id,
        organisation_id=intent.organisation_id,
        amount_minor=intent.amount_minor,
        currency=intent.currency,
        status=IntentStatus(intent.status),
        provider=ProviderKey(intent.provider),
        source_type=intent.source_type,
        source_id=intent.source_id,
        metadata=intent.metadata_,
        captured_minor=int(row[1]),
        refunded_minor=int(row[2]),
        created_at=intent.created_at,
        updated_at=intent.updated_at,
    )


async def _public_by_id(
    session: AsyncSession, intent_id: uuid.UUID
) -> schemas.PaymentIntentPublic:
    row = (await session.execute(_intent_select().where(Intent.id == intent_id))).one()
    return _public(row)


async def list_intents(
    session: AsyncSession,
    *,
    organisation_id: str | None,
    status: IntentStatus | None,
    source_type: str | None,
    source_id: str | None,
    skip: int,
    limit: int,
) -> tuple[list[schemas.PaymentIntentPublic], int]:
    conditions = []
    if organisation_id is not None:
        conditions.append(Intent.organisation_id == organisation_id)
    if status is not None:
        conditions.append(Intent.status == status.value)
    if source_type is not None:
        conditions.append(Intent.source_type == source_type)
    if source_id is not None:
        conditions.append(Intent.source_id == source_id)
    total = (
        await session.execute(
            select(func.count()).select_from(Intent).where(*conditions)
        )
    ).scalar_one()
    rows = (
        await session.execute(
            _intent_select()
            .where(*conditions)
            .order_by(Intent.created_at.desc(), Intent.id)
            .offset(skip)
            .limit(limit)
        )
    ).all()
    return [_public(row) for row in rows], total


async def _get_owned(
    session: AsyncSession, organisation_id: str, intent_id: uuid.UUID, *, lock: bool
) -> Intent:
    """The intent if it belongs to the organisation; otherwise 404 (never 403)."""
    statement = select(Intent).where(
        Intent.id == intent_id, Intent.organisation_id == organisation_id
    )
    if lock:
        statement = statement.with_for_update()
    intent = (await session.execute(statement)).scalar_one_or_none()
    if intent is None:
        raise IntentNotFoundError()
    return intent


async def get_intent_detail(
    session: AsyncSession, organisation_id: str, intent_id: uuid.UUID
) -> schemas.PaymentIntentDetailPublic:
    await _get_owned(session, organisation_id, intent_id, lock=False)
    attempts = (
        (
            await session.execute(
                select(Attempt)
                .where(Attempt.intent_id == intent_id)
                .order_by(Attempt.created_at, Attempt.id)
            )
        )
        .scalars()
        .all()
    )
    refunds = (
        (
            await session.execute(
                select(Refund)
                .where(Refund.intent_id == intent_id)
                .order_by(Refund.created_at, Refund.id)
            )
        )
        .scalars()
        .all()
    )
    return schemas.PaymentIntentDetailPublic(
        intent=await _public_by_id(session, intent_id),
        attempts=[
            schemas.PaymentAttemptPublic(
                id=a.id,
                provider=ProviderKey(a.provider),
                status=AttemptStatus(a.status),
                failure_code=a.failure_code,
                created_at=a.created_at,
            )
            for a in attempts
        ],
        refunds=[_refund_public(r) for r in refunds],
    )


def _refund_public(refund: Refund) -> schemas.PaymentRefundPublic:
    return schemas.PaymentRefundPublic(
        id=refund.id,
        intent_id=refund.intent_id,
        amount_minor=refund.amount_minor,
        reason=refund.reason,
        status=RefundStatus(refund.status),
        created_at=refund.created_at,
    )


# --- creating -------------------------------------------------------------------------


async def create_intent(
    session: AsyncSession,
    *,
    organisation_id: str,
    actor: User | None,
    payload: schemas.PaymentIntentCreate,
    checkout_title: str | None = None,
) -> schemas.PaymentCheckoutPublic:
    """Create an intent (idempotent per organisation and ``idempotency_key``).

    A repeat with the same key and the same request returns the first intent; the
    same key with a different request is a 409. ``actor`` is the signed-in member,
    or ``None`` when the system acts for an anonymous customer (a public booking
    deposit): ``created_by_user_id`` is then NULL. ``checkout_title`` is the human
    name the buyer sees on the hosted checkout (not stored; no personal data).
    """
    # Resolve the provider first so an unavailable rail fails before any row exists.
    provider = registry.get_provider(payload.provider.value)

    existing = await _by_idempotency_key(
        session, organisation_id, payload.idempotency_key
    )
    if existing is not None:
        return await _replay(session, existing, payload)

    intent = Intent(
        organisation_id=organisation_id,
        amount_minor=payload.amount_minor,
        currency=payload.currency,
        provider=payload.provider.value,
        source_type=payload.source_type,
        source_id=payload.source_id,
        customer_email_hash=hash_email(payload.customer_email)
        if payload.customer_email
        else None,
        metadata_=dict(payload.metadata),
        idempotency_key=payload.idempotency_key,
        created_by_user_id=actor.id if actor else None,
    )
    try:
        async with session.begin_nested():
            session.add(intent)
            await session.flush()
    except IntegrityError:
        # A concurrent request used the same key between our read and insert.
        existing = await _by_idempotency_key(
            session, organisation_id, payload.idempotency_key
        )
        if existing is None:
            raise
        return await _replay(session, existing, payload)

    start = await provider.create_payment(intent, title=checkout_title)
    intent.provider_ref = start.provider_ref
    intent.checkout_url = start.checkout_url
    if start.checkout_url is not None:
        intent.status = IntentStatus.PROCESSING.value
        session.add(
            Attempt(
                intent_id=intent.id,
                provider=intent.provider,
                provider_ref=start.provider_ref,
            )
        )
    await session.flush()
    logger.info(
        "payment intent created",
        extra={
            "intent_id": str(intent.id),
            "organisation_id": organisation_id,
            "provider": intent.provider,
        },
    )
    return schemas.PaymentCheckoutPublic(
        intent=await _public_by_id(session, intent.id),
        checkout_url=intent.checkout_url,
    )


async def _by_idempotency_key(
    session: AsyncSession, organisation_id: str, key: str
) -> Intent | None:
    return (
        await session.execute(
            select(Intent).where(
                Intent.organisation_id == organisation_id,
                Intent.idempotency_key == key,
            )
        )
    ).scalar_one_or_none()


async def _replay(
    session: AsyncSession, existing: Intent, payload: schemas.PaymentIntentCreate
) -> schemas.PaymentCheckoutPublic:
    same = (
        existing.amount_minor == payload.amount_minor
        and existing.currency == payload.currency
        and existing.provider == payload.provider.value
        and existing.source_type == payload.source_type
        and existing.source_id == payload.source_id
    )
    if not same:
        raise PaymentsConflictError(
            "This idempotency key was already used for a different payment"
        )
    return schemas.PaymentCheckoutPublic(
        intent=await _public_by_id(session, existing.id),
        checkout_url=existing.checkout_url,
    )


# --- lookups for consuming domains ----------------------------------------------------


async def find_by_source(
    session: AsyncSession,
    *,
    organisation_id: str,
    source_type: str,
    source_id: str,
    idempotency_key: str | None = None,
) -> schemas.PaymentIntentPublic | None:
    """The newest intent sold for ``(source_type, source_id)``, or None. With
    ``idempotency_key`` the consumer's own intent is returned instead, whatever
    other intents share the source."""
    row = (
        await session.execute(
            _intent_select()
            .where(
                Intent.organisation_id == organisation_id,
                Intent.source_type == source_type,
                Intent.source_id == source_id,
                *(
                    [Intent.idempotency_key == idempotency_key]
                    if idempotency_key is not None
                    else []
                ),
            )
            .order_by(Intent.created_at.desc(), Intent.id)
            .limit(1)
        )
    ).first()
    return _public(row) if row else None


async def lock_intent_by_key(
    session: AsyncSession, *, organisation_id: str, idempotency_key: str
) -> Intent | None:
    """The organisation's intent with this idempotency key, row-locked and read
    fresh (so a payment recorded a moment ago is seen), or None. Unlike
    ``find_by_source`` this never picks "the newest" of several intents."""
    return (
        await session.execute(
            select(Intent)
            .where(
                Intent.organisation_id == organisation_id,
                Intent.idempotency_key == idempotency_key,
            )
            .with_for_update()
            .execution_options(populate_existing=True)
        )
    ).scalar_one_or_none()


async def cancel_open_intent(
    session: AsyncSession,
    *,
    organisation_id: str,
    source_type: str,
    source_id: str,
    idempotency_key: str | None = None,
) -> bool:
    """Stop collecting for a sale that no longer exists.

    Locks the intent, then cancels it while it is unpaid. Returns False when the
    payment already succeeded (the caller must not drop the sale); True when
    there is no intent, it was already finished unpaid, or it is now cancelled."""
    intent = (
        await session.execute(
            select(Intent)
            .where(
                Intent.organisation_id == organisation_id,
                Intent.source_type == source_type,
                Intent.source_id == source_id,
                *(
                    [Intent.idempotency_key == idempotency_key]
                    if idempotency_key is not None
                    else []
                ),
            )
            .order_by(Intent.created_at.desc(), Intent.id)
            .limit(1)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
    ).scalar_one_or_none()
    if intent is None:
        return True
    if intent.status == IntentStatus.SUCCEEDED.value:
        return False
    if intent.status in (
        IntentStatus.REQUIRES_PAYMENT.value,
        IntentStatus.PROCESSING.value,
    ):
        intent.status = IntentStatus.CANCELLED.value
        await session.flush()
    return True


# --- ledger helpers -------------------------------------------------------------------


async def _ledger_event_exists(
    session: AsyncSession, provider: str, event_id: str
) -> bool:
    return (
        await session.execute(
            select(LedgerEntry.id).where(
                LedgerEntry.provider == provider,
                LedgerEntry.provider_event_id == event_id,
            )
        )
    ).first() is not None


def _entry(
    intent: Intent,
    *,
    kind: LedgerKind,
    amount_minor: int,
    provider: str,
    event_id: str,
    actor: User | None = None,
    refund_id: uuid.UUID | None = None,
    reference: str | None = None,
    note: str | None = None,
) -> LedgerEntry:
    return LedgerEntry(
        organisation_id=intent.organisation_id,
        intent_id=intent.id,
        refund_id=refund_id,
        kind=kind.value,
        amount_minor=amount_minor,
        currency=intent.currency,
        provider=provider,
        provider_event_id=event_id,
        reference=reference,
        note=note,
        created_by_user_id=actor.id if actor else None,
    )


async def _mark_attempt(
    session: AsyncSession,
    intent: Intent,
    status: AttemptStatus,
    failure_code: str | None = None,
) -> None:
    attempt = (
        await session.execute(
            select(Attempt)
            .where(
                Attempt.intent_id == intent.id,
                Attempt.status == AttemptStatus.STARTED.value,
            )
            .order_by(Attempt.created_at.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    if attempt is None:
        attempt = Attempt(intent_id=intent.id, provider=intent.provider)
        session.add(attempt)
    attempt.status = status.value
    attempt.failure_code = failure_code


async def _capture(
    session: AsyncSession,
    intent: Intent,
    *,
    provider: str,
    event_id: str,
    actor: User | None,
    payment_ref: str | None = None,
    reference: str | None = None,
    note: str | None = None,
) -> None:
    intent.status = IntentStatus.SUCCEEDED.value
    if payment_ref:
        intent.provider_payment_ref = payment_ref
    await _mark_attempt(session, intent, AttemptStatus.SUCCEEDED)
    session.add(
        _entry(
            intent,
            kind=LedgerKind.CHARGE,
            amount_minor=intent.amount_minor,
            provider=provider,
            event_id=event_id,
            actor=actor,
            reference=reference,
            note=note,
        )
    )
    await session.flush()
    await _emit_payment_event(session, intent, "payment.succeeded")
    topic = PAID_TOPICS.get(intent.source_type)
    if topic is not None and intent.source_id:
        # Same transaction as the charge: the consumer sees the payment or neither.
        await outbox.enqueue(
            session,
            topic=topic,
            payload={"intent_id": str(intent.id), "source_id": intent.source_id},
            dedupe_key=str(intent.id),
            organisation_id=intent.organisation_id,
        )


async def _enqueue_refund_topic(
    session: AsyncSession, intent: Intent, refund_id: uuid.UUID
) -> None:
    """Tell the owning domain about a refund, in the transaction that records it."""
    topic = REFUND_TOPICS.get(intent.source_type)
    if topic is None or not intent.source_id:
        return
    await outbox.enqueue(
        session,
        topic=topic,
        payload={
            "intent_id": str(intent.id),
            "source_id": intent.source_id,
            "refund_id": str(refund_id),
        },
        dedupe_key=str(refund_id),
        organisation_id=intent.organisation_id,
    )


async def _emit_payment_event(
    session: AsyncSession,
    intent: Intent,
    event_type: str,
    *,
    refund_id: uuid.UUID | None = None,
    refunded_minor: int | None = None,
) -> None:
    """Webhook for the organisation: ids, amounts and the source reference only."""
    data: dict[str, object] = {
        "payment_id": str(intent.id),
        "amount_minor": intent.amount_minor,
        "currency": intent.currency,
        "source_type": intent.source_type,
        "source_id": intent.source_id,
    }
    if refund_id is not None and refunded_minor is not None:
        data["refund_id"] = str(refund_id)
        data["refunded_amount_minor"] = refunded_minor
    await webhook_service.emit_event_safely(
        session,
        intent.organisation_id,
        event_type,
        data,
        event_id=f"{event_type}:{refund_id or intent.id}",
    )


# --- manual payments ------------------------------------------------------------------


async def record_manual_payment(
    session: AsyncSession,
    *,
    organisation_id: str,
    intent_id: uuid.UUID,
    actor: User,
    payload: schemas.ManualPaymentCreate,
) -> schemas.PaymentIntentPublic:
    """Staff record cash, a bank transfer or a cheque: the intent succeeds now."""
    intent = await _get_owned(session, organisation_id, intent_id, lock=True)
    if intent.provider != ProviderKey.MANUAL.value:
        raise PaymentsConflictError("Only manual payments can be recorded by staff")
    if intent.status == IntentStatus.SUCCEEDED.value:
        raise PaymentsConflictError("This payment has already been recorded")
    if intent.status in (IntentStatus.CANCELLED.value, IntentStatus.FAILED.value):
        raise PaymentsConflictError("This payment can no longer be paid")
    await _capture(
        session,
        intent,
        provider=ProviderKey.MANUAL.value,
        event_id=f"manual:{intent.id}",
        actor=actor,
        reference=payload.reference,
        note=payload.method.value,
    )
    logger.info(
        "manual payment recorded",
        extra={"intent_id": str(intent.id), "method": payload.method.value},
    )
    return await _public_by_id(session, intent.id)


# --- refunds --------------------------------------------------------------------------


async def refund_intent(
    session: AsyncSession,
    *,
    organisation_id: str,
    intent_id: uuid.UUID,
    actor: User | None,
    payload: schemas.PaymentRefundCreate,
    refund_id: uuid.UUID | None = None,
) -> schemas.PaymentRefundPublic:
    """Hand money back. The total refunded can never exceed what was captured.

    ``actor`` is ``None`` when the system refunds (for example a booking
    deposit); the refund and ledger rows then record no user.

    ``refund_id`` lets a caller that retries (an outbox handler) derive the refund's
    id from its own request: a refund with that id on this intent is returned as it
    is, and the provider (Stripe uses ``refund-<id>`` as its idempotency key) never
    sees a second refund for the same request."""
    intent = await _get_owned(session, organisation_id, intent_id, lock=True)
    if refund_id is not None:
        existing = await session.get(Refund, refund_id)
        if existing is not None:
            if existing.intent_id != intent.id:
                raise PaymentsConflictError("That refund belongs to another payment")
            return _refund_public(existing)
    captured, refunded = await _totals(session, intent.id)
    if captured <= 0:
        raise PaymentsConflictError("Nothing has been collected on this payment")
    refundable = captured - refunded
    amount = payload.amount_minor if payload.amount_minor is not None else refundable
    if amount <= 0 or amount > refundable:
        raise PaymentsValidationError(
            f"Only {refundable} minor units can still be refunded on this payment"
        )

    provider = registry.get_provider(intent.provider)
    refund = Refund(
        id=refund_id or uuid.uuid4(),
        intent_id=intent.id,
        amount_minor=amount,
        reason=payload.reason,
        created_by_user_id=actor.id if actor else None,
    )
    session.add(refund)
    await session.flush()

    result = await provider.refund(intent, amount, refund.id)
    refund.provider_ref = result.provider_ref
    refund.status = (
        RefundStatus.SUCCEEDED.value
        if result.status == "succeeded"
        else RefundStatus.PENDING.value
    )
    session.add(
        _entry(
            intent,
            kind=LedgerKind.REFUND,
            amount_minor=-amount,
            provider=intent.provider,
            event_id=f"refund:{refund.id}",
            actor=actor,
            refund_id=refund.id,
            note=payload.reason,
        )
    )
    await session.flush()
    await _emit_payment_event(
        session,
        intent,
        "payment.refunded",
        refund_id=refund.id,
        refunded_minor=amount,
    )
    await _enqueue_refund_topic(session, intent, refund.id)
    logger.info(
        "payment refunded",
        extra={"intent_id": str(intent.id), "refund_id": str(refund.id)},
    )
    return _refund_public(refund)


async def _totals(session: AsyncSession, intent_id: uuid.UUID) -> tuple[int, int]:
    row = (
        await session.execute(
            select(_captured().label("c"), _refunded().label("r"))
            .select_from(Intent)
            .where(Intent.id == intent_id)
        )
    ).one()
    return int(row.c), int(row.r)


# --- provider callbacks ---------------------------------------------------------------


async def process_callback(
    session: AsyncSession,
    *,
    provider_key: str,
    headers: Mapping[str, str],
    body: bytes,
) -> str:
    """Verify and apply a provider callback; returns ``processed``, ``duplicate`` or
    ``ignored``. Raises 400 for a bad signature and 503 for an unsafe configuration.

    Idempotent: the ledger's unique ``(provider, provider_event_id)`` plus a row lock
    on the intent mean a replay changes nothing and still answers 2xx.
    """
    provider = registry.get_provider(provider_key)
    event = provider.verify_callback(headers, body)
    if event.kind is EventKind.IGNORED:
        return "ignored"

    intent = await _locate(session, event)
    if intent is None:
        logger.warning(
            "callback for an unknown payment",
            extra={"provider": event.provider, "event_id": event.event_id},
        )
        return "ignored"
    # Lock the row so concurrent deliveries of one event are serialised.
    intent = (
        await session.execute(
            select(Intent).where(Intent.id == intent.id).with_for_update()
        )
    ).scalar_one()
    if await _ledger_event_exists(session, event.provider, event.event_id):
        return "duplicate"

    if event.kind is EventKind.PAYMENT_SUCCEEDED:
        return await _apply_success(session, intent, event)
    if event.kind is EventKind.PAYMENT_FAILED:
        return await _apply_failure(session, intent, event)
    return await _apply_refunded(session, intent, event)


async def _locate(session: AsyncSession, event: ProviderEvent) -> Intent | None:
    conditions = []
    if event.intent_id is not None:
        conditions.append(Intent.id == event.intent_id)
    if event.payment_ref:
        conditions.append(Intent.provider_payment_ref == event.payment_ref)
    if event.provider_ref:
        conditions.append(Intent.provider_ref == event.provider_ref)
    if not conditions:
        return None
    return (
        await session.execute(
            select(Intent)
            .where(Intent.provider == event.provider, sa.or_(*conditions))
            .limit(1)
        )
    ).scalar_one_or_none()


async def _apply_success(
    session: AsyncSession, intent: Intent, event: ProviderEvent
) -> str:
    if intent.status == IntentStatus.SUCCEEDED.value:
        # Already captured by another event; never credit the same sale twice.
        return "duplicate"
    if event.amount_minor != intent.amount_minor or (
        event.currency is not None and event.currency != intent.currency
    ):
        logger.error(
            "callback amount does not match the payment; not credited",
            extra={"intent_id": str(intent.id), "event_id": event.event_id},
        )
        return "ignored"
    await _capture(
        session,
        intent,
        provider=event.provider,
        event_id=event.event_id,
        actor=None,
        payment_ref=event.payment_ref,
    )
    return "processed"


async def _apply_failure(
    session: AsyncSession, intent: Intent, event: ProviderEvent
) -> str:
    if intent.status in (IntentStatus.SUCCEEDED.value, IntentStatus.FAILED.value):
        return "duplicate"
    intent.status = IntentStatus.FAILED.value
    if event.payment_ref and not intent.provider_payment_ref:
        intent.provider_payment_ref = event.payment_ref
    await _mark_attempt(session, intent, AttemptStatus.FAILED, event.failure_code)
    await session.flush()
    return "processed"


async def _apply_refunded(
    session: AsyncSession, intent: Intent, event: ProviderEvent
) -> str:
    """Record money the provider refunded that the ledger does not hold yet.

    Each refund the provider lists is matched to our rows first by our refund id
    (echoed in its metadata) and then by the provider's refund id. A refund we made
    is therefore never recorded twice: if our own transaction was lost after the
    provider refunded, the row is created under the id the outbox retry asks for, so
    the retry finds it. A refund made in the provider's dashboard has no id of ours
    and is recorded once, under a new id.

    Money the list does not explain is taken from the running total, but only when
    the list is complete: on a truncated list a refund of ours may simply be missing
    from it, and a guess would count it twice. The listed refunds and the total are
    both read from the event, so a replay changes nothing."""
    changed = False
    for refund in event.refunds:
        if refund.status != "succeeded" or refund.amount_minor <= 0:
            continue
        if await _reconcile_listed_refund(session, intent, event, refund):
            changed = True
    if not event.refunds_complete:
        logger.error(
            "provider refund list is truncated; not reconciled from the total",
            extra={"intent_id": str(intent.id), "event_id": event.event_id},
        )
    else:
        total = event.refunded_total_minor or 0
        captured, recorded = await _totals(session, intent.id)
        missing = min(total, captured) - recorded
        if missing > 0:
            await _record_provider_refund(
                session,
                intent,
                provider=event.provider,
                amount_minor=missing,
                refund_id=uuid.uuid4(),
                provider_ref=None,
                event_id=event.event_id,
            )
            changed = True
    return "processed" if changed else "duplicate"


async def _reconcile_listed_refund(
    session: AsyncSession, intent: Intent, event: ProviderEvent, refund: ProviderRefund
) -> bool:
    """One refund the provider lists as succeeded. Returns True when it changed
    anything (a new row, or a row the provider now confirms as succeeded)."""
    existing: Refund | None = None
    if refund.refund_id is not None:
        existing = await session.get(Refund, refund.refund_id)
        if existing is not None and existing.intent_id != intent.id:
            logger.error(
                "provider refund names a refund of another payment; not recorded",
                extra={"intent_id": str(intent.id), "event_id": event.event_id},
            )
            return False
    if existing is None and refund.provider_ref:
        existing = await session.scalar(
            select(Refund)
            .where(
                Refund.intent_id == intent.id,
                Refund.provider_ref == refund.provider_ref,
            )
            .limit(1)
        )
    if existing is not None:
        changed = False
        if existing.status != RefundStatus.SUCCEEDED.value:
            # The provider has settled a refund we recorded as pending or failed.
            existing.status = RefundStatus.SUCCEEDED.value
            changed = True
        if refund.provider_ref and existing.provider_ref is None:
            existing.provider_ref = refund.provider_ref
            changed = True
        return changed
    await _record_provider_refund(
        session,
        intent,
        provider=event.provider,
        amount_minor=refund.amount_minor,
        refund_id=refund.refund_id or uuid.uuid4(),
        provider_ref=refund.provider_ref,
        event_id=None,
    )
    return True


async def _record_provider_refund(
    session: AsyncSession,
    intent: Intent,
    *,
    provider: str,
    amount_minor: int,
    refund_id: uuid.UUID,
    provider_ref: str | None,
    event_id: str | None,
) -> None:
    """Write a refund the provider made (not our call): its row, its ledger entry
    and the consumer notifications, as a refund made through ``refund_intent`` would.
    ``event_id`` is the ledger key for a total-based record; by default the ledger
    key is the refund id, as ``refund_intent`` uses."""
    refund = Refund(
        id=refund_id,
        intent_id=intent.id,
        amount_minor=amount_minor,
        reason="Refunded at the payment provider",
        status=RefundStatus.SUCCEEDED.value,
        provider_ref=provider_ref,
    )
    session.add(refund)
    await session.flush()
    session.add(
        _entry(
            intent,
            kind=LedgerKind.REFUND,
            amount_minor=-amount_minor,
            provider=provider,
            event_id=event_id or f"refund:{refund.id}",
            refund_id=refund.id,
        )
    )
    await session.flush()
    await _emit_payment_event(
        session,
        intent,
        "payment.refunded",
        refund_id=refund.id,
        refunded_minor=amount_minor,
    )
    await _enqueue_refund_topic(session, intent, refund.id)


# --- balances, payouts, ledger --------------------------------------------------------


async def balances(
    session: AsyncSession, organisation_id: str | None
) -> list[schemas.PaymentBalancePublic]:
    """What is owed per organisation and currency: SUM over the ledger."""
    statement = (
        select(
            LedgerEntry.organisation_id,
            LedgerEntry.currency,
            func.sum(LedgerEntry.amount_minor).label("owed"),
        )
        .group_by(LedgerEntry.organisation_id, LedgerEntry.currency)
        .order_by(LedgerEntry.organisation_id, LedgerEntry.currency)
    )
    if organisation_id is not None:
        statement = statement.where(LedgerEntry.organisation_id == organisation_id)
    rows = (await session.execute(statement)).all()
    return [
        schemas.PaymentBalancePublic(
            organisation_id=row.organisation_id,
            currency=row.currency,
            owed_minor=int(row.owed),
        )
        for row in rows
    ]


async def create_payout(
    session: AsyncSession, *, actor: User, payload: schemas.PaymentPayoutCreate
) -> schemas.PaymentLedgerEntryPublic:
    """Record that Barrels paid the organisation. Cannot exceed what is owed."""
    organisation = await session.get(PlatformOrganisation, payload.organisation_id)
    if organisation is None:
        raise PaymentsValidationError("Unknown organisation")
    # Serialise payouts per organisation so two cannot overspend the balance.
    await session.execute(
        select(
            func.pg_advisory_xact_lock(
                func.hashtext(f"payments:payout:{payload.organisation_id}")
            )
        )
    )
    event_id = f"payout:{payload.request_id}"
    existing = await session.scalar(
        select(LedgerEntry).where(
            LedgerEntry.provider == ProviderKey.MANUAL.value,
            LedgerEntry.provider_event_id == event_id,
        )
    )
    if existing is not None:
        # A repeat of the same request (a double click, a retry): return the
        # original entry. The same id with other details is a mistake.
        if (
            existing.organisation_id != payload.organisation_id
            or -existing.amount_minor != payload.amount_minor
            or existing.currency != payload.currency
        ):
            raise PaymentsConflictError("This request id was used for another payout")
        return schemas.PaymentLedgerEntryPublic.model_validate(
            existing, from_attributes=True
        )
    owed = (
        await session.execute(
            select(func.coalesce(func.sum(LedgerEntry.amount_minor), 0)).where(
                LedgerEntry.organisation_id == payload.organisation_id,
                LedgerEntry.currency == payload.currency,
            )
        )
    ).scalar_one()
    if payload.amount_minor > owed:
        raise PaymentsConflictError(
            f"The organisation is owed {owed} {payload.currency}; payout is larger"
        )
    entry = LedgerEntry(
        organisation_id=payload.organisation_id,
        kind=LedgerKind.PAYOUT.value,
        amount_minor=-payload.amount_minor,
        currency=payload.currency,
        provider=ProviderKey.MANUAL.value,
        provider_event_id=event_id,
        reference=payload.reference,
        note=payload.note,
        created_by_user_id=actor.id,
    )
    session.add(entry)
    await session.flush()
    logger.info(
        "payout recorded",
        extra={"organisation_id": payload.organisation_id, "entry_id": str(entry.id)},
    )
    return _ledger_public(entry)


def _ledger_public(entry: LedgerEntry) -> schemas.PaymentLedgerEntryPublic:
    return schemas.PaymentLedgerEntryPublic(
        id=entry.id,
        organisation_id=entry.organisation_id,
        intent_id=entry.intent_id,
        kind=LedgerKind(entry.kind),
        amount_minor=entry.amount_minor,
        currency=entry.currency,
        provider=ProviderKey(entry.provider),
        reference=entry.reference,
        note=entry.note,
        created_at=entry.created_at,
    )


async def list_ledger(
    session: AsyncSession,
    *,
    organisation_id: str | None,
    kind: LedgerKind | None,
    skip: int,
    limit: int,
) -> tuple[list[schemas.PaymentLedgerEntryPublic], int]:
    conditions = []
    if organisation_id is not None:
        conditions.append(LedgerEntry.organisation_id == organisation_id)
    if kind is not None:
        conditions.append(LedgerEntry.kind == kind.value)
    total = (
        await session.execute(
            select(func.count()).select_from(LedgerEntry).where(*conditions)
        )
    ).scalar_one()
    entries = (
        (
            await session.execute(
                select(LedgerEntry)
                .where(*conditions)
                .order_by(LedgerEntry.created_at.desc(), LedgerEntry.id)
                .offset(skip)
                .limit(limit)
            )
        )
        .scalars()
        .all()
    )
    return [_ledger_public(e) for e in entries], total


# --- reconciliation -------------------------------------------------------------------


_ROW_FIELDS = (
    "opening_minor",
    "charges_minor",
    "refunds_minor",
    "fees_minor",
    "adjustments_minor",
    "payouts_minor",
    "closing_minor",
    "intents_succeeded",
    "unmatched_intents",
)


def _sum_where(*conditions: Any) -> Any:
    return func.coalesce(
        func.sum(sa.case((sa.and_(*conditions), LedgerEntry.amount_minor), else_=0)), 0
    )


async def reconciliation(
    session: AsyncSession,
    *,
    start_date: date,
    end_date: date,
    organisation_id: str | None = None,
) -> schemas.PaymentReconciliationPublic:
    """Per organisation and currency: opening balance, movements by kind in the
    period (Grenada days, both ends inclusive), closing balance, and intents that
    succeeded without a ledger charge. All sums are computed in SQL."""
    if end_date < start_date:
        raise PaymentsValidationError("end_date must not be before start_date")
    start = local_to_utc(start_date, time.min, GRENADA)
    end = local_to_utc(end_date + timedelta(days=1), time.min, GRENADA)
    in_period = sa.and_(LedgerEntry.created_at >= start, LedgerEntry.created_at < end)

    def kind_sum(kind: LedgerKind) -> Any:
        return _sum_where(in_period, LedgerEntry.kind == kind.value)

    ledger = (
        select(
            LedgerEntry.organisation_id,
            LedgerEntry.currency,
            _sum_where(LedgerEntry.created_at < start).label("opening"),
            kind_sum(LedgerKind.CHARGE).label("charges"),
            kind_sum(LedgerKind.REFUND).label("refunds"),
            kind_sum(LedgerKind.FEE).label("fees"),
            kind_sum(LedgerKind.ADJUSTMENT).label("adjustments"),
            kind_sum(LedgerKind.PAYOUT).label("payouts"),
            _sum_where(LedgerEntry.created_at < end).label("closing"),
            func.count(
                sa.distinct(
                    sa.case(
                        (
                            sa.and_(in_period, LedgerEntry.kind == "charge"),
                            LedgerEntry.intent_id,
                        )
                    )
                )
            ).label("succeeded"),
        )
        .where(LedgerEntry.created_at < end)
        .group_by(LedgerEntry.organisation_id, LedgerEntry.currency)
    )
    unmatched = (
        select(Intent.organisation_id, Intent.currency, func.count().label("n"))
        .where(
            Intent.status == IntentStatus.SUCCEEDED.value,
            Intent.updated_at >= start,
            Intent.updated_at < end,
            ~sa.exists().where(
                LedgerEntry.intent_id == Intent.id,
                LedgerEntry.kind == LedgerKind.CHARGE.value,
            ),
        )
        .group_by(Intent.organisation_id, Intent.currency)
    )
    if organisation_id is not None:
        ledger = ledger.where(LedgerEntry.organisation_id == organisation_id)
        unmatched = unmatched.where(Intent.organisation_id == organisation_id)

    rows: dict[tuple[str, str], dict[str, int]] = {}
    for r in (await session.execute(ledger)).all():
        rows[(r.organisation_id, r.currency)] = {
            "opening_minor": int(r.opening),
            "charges_minor": int(r.charges),
            "refunds_minor": int(r.refunds),
            "fees_minor": int(r.fees),
            "adjustments_minor": int(r.adjustments),
            "payouts_minor": int(r.payouts),
            "closing_minor": int(r.closing),
            "intents_succeeded": int(r.succeeded),
            "unmatched_intents": 0,
        }
    for r in (await session.execute(unmatched)).all():
        row = rows.setdefault(
            (r.organisation_id, r.currency), dict.fromkeys(_ROW_FIELDS, 0)
        )
        row["unmatched_intents"] = int(r.n)

    return schemas.PaymentReconciliationPublic(
        start_date=start_date,
        end_date=end_date,
        generated_at=utc_now(),
        rows=[
            schemas.PaymentReconciliationRowPublic(
                organisation_id=org, currency=currency, **values
            )
            for (org, currency), values in sorted(rows.items())
        ],
    )


_FORMULA_LEADERS = ("=", "+", "-", "@", "\t", "\r")


def _cell(value: object) -> object:
    """Neutralise spreadsheet formulas in text taken from people."""
    if isinstance(value, str) and value.startswith(_FORMULA_LEADERS):
        return f"'{value}"
    return value


def _major(minor: int) -> str:
    sign = "-" if minor < 0 else ""
    return f"{sign}{abs(minor) // 100}.{abs(minor) % 100:02d}"


def reconciliation_csv(report: schemas.PaymentReconciliationPublic) -> str:
    """Spreadsheet-ready CSV in the Events settlement style (title block, then rows)."""
    out = io.StringIO()
    writer = csv.writer(out, lineterminator="\r\n")
    writer.writerow(["Payments reconciliation"])
    writer.writerow(
        [
            f"{report.start_date} to {report.end_date}; amounts in major units of"
            f" each row's currency; generated {report.generated_at:%Y-%m-%d %H:%M} UTC"
        ]
    )
    writer.writerow([])
    header: Sequence[str] = (
        "Organisation",
        "Currency",
        "Opening",
        "Charges",
        "Refunds",
        "Fees",
        "Adjustments",
        "Payouts",
        "Closing",
        "Intents succeeded",
        "Succeeded without charge",
    )
    writer.writerow(header)
    for row in report.rows:
        writer.writerow(
            [
                _cell(row.organisation_id),
                row.currency,
                _major(row.opening_minor),
                _major(row.charges_minor),
                _major(row.refunds_minor),
                _major(row.fees_minor),
                _major(row.adjustments_minor),
                _major(row.payouts_minor),
                _major(row.closing_minor),
                row.intents_succeeded,
                row.unmatched_intents,
            ]
        )
    return out.getvalue()
