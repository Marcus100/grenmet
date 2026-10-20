"""Where Events talks to the shared payments core (N4b, ADR-0027).

Everything here runs on the main database session (``payments.*`` lives there);
the Events database is a separate session and is never joined (ADR-0003).

Rules:
- One intent per order: ``source_type="events.order"``, ``source_id`` the order id,
  idempotency key ``events.order:<order id>``, ``actor=None`` (the system acts for
  the buyer, so ``created_by_user_id`` is NULL).
- The organiser's organisation is the payee and must hold the ``payments``
  entitlement; an organiser without a platform organisation (legacy) cannot sell
  paid tiers online.
- The card rail is Stripe in TEST mode only (``sk_test_`` key). Otherwise, or when
  Stripe cannot start a checkout, a manual intent is created and the organiser's
  staff record the payment through ``POST /payments/org/intents/{id}/manual-payments``
  (``checkout_url`` is then None).
"""

import logging
import uuid

from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.exceptions import AppException
from src.organisations import service as organisation_service
from src.payments import schemas as payment_schemas
from src.payments import service as payments_service
from src.payments.config import payments_settings
from src.payments.models import Intent, LedgerEntry, LedgerKind, ProviderKey

from .models import Order

logger = logging.getLogger(__name__)

SOURCE_TYPE = "events.order"
PAID_TOPIC = "events.order_paid"
REFUNDED_TOPIC = "events.order_refunded"
_TEST_KEY_PREFIX = "sk_test_"


def intent_key(order_id: uuid.UUID) -> str:
    return f"{SOURCE_TYPE}:{order_id}"


async def can_collect(session: AsyncSession, organisation_id: str | None) -> bool:
    """Whether the organiser's organisation may be paid through the payments core."""
    if organisation_id is None:
        return False
    return await organisation_service.is_app_enabled(
        session, organisation_id=organisation_id, app_key="payments"
    )


def _stripe_available() -> bool:
    key = payments_settings.STRIPE_SECRET_KEY
    return bool(key and key.startswith(_TEST_KEY_PREFIX))


def _payload(
    order: Order, provider: ProviderKey, customer_email: str | None
) -> payment_schemas.PaymentIntentCreate:
    return payment_schemas.PaymentIntentCreate(
        amount_minor=order.total_minor,
        currency=order.currency,
        provider=provider,
        source_type=SOURCE_TYPE,
        source_id=str(order.id),
        customer_email=customer_email,
        metadata={"order_id": str(order.id), "listing_id": str(order.listing_id)},
        idempotency_key=intent_key(order.id),
    )


async def start_payment(
    session: AsyncSession,
    *,
    organisation_id: str,
    order: Order,
    customer_email: str | None,
) -> payment_schemas.PaymentCheckoutPublic:
    """Create (or find) the order's intent. Flushes; the caller commits.

    Safe to repeat: the intent is keyed by the order, so a replay returns the
    first one. A Stripe failure falls back to the manual rail."""
    if _stripe_available():
        try:
            async with session.begin_nested():
                return await payments_service.create_intent(
                    session,
                    organisation_id=organisation_id,
                    actor=None,
                    payload=_payload(order, ProviderKey.STRIPE, customer_email),
                )
        except AppException:
            logger.warning(
                "stripe checkout unavailable for an event order; using manual",
                extra={"order_id": str(order.id)},
            )
    return await payments_service.create_intent(
        session,
        organisation_id=organisation_id,
        actor=None,
        payload=_payload(order, ProviderKey.MANUAL, customer_email),
    )


async def ensure_intent(
    session: AsyncSession,
    *,
    organisation_id: str,
    order: Order,
    customer_email: str | None,
) -> tuple[uuid.UUID, str | None]:
    """The order's intent id and checkout URL, creating the intent if there is
    none yet. An existing intent is returned as it is (whatever its rail)."""
    existing = (
        await session.execute(
            select(Intent.id, Intent.checkout_url)
            .where(
                Intent.organisation_id == organisation_id,
                Intent.source_type == SOURCE_TYPE,
                Intent.source_id == str(order.id),
            )
            .order_by(Intent.created_at.desc(), Intent.id)
            .limit(1)
        )
    ).first()
    if existing is not None:
        return existing[0], existing[1]
    started = await start_payment(
        session,
        organisation_id=organisation_id,
        order=order,
        customer_email=customer_email,
    )
    return started.intent.id, started.checkout_url


async def intent_for(
    session: AsyncSession, *, organisation_id: str, order_id: uuid.UUID
) -> payment_schemas.PaymentIntentPublic | None:
    return await payments_service.find_by_source(
        session,
        organisation_id=organisation_id,
        source_type=SOURCE_TYPE,
        source_id=str(order_id),
    )


async def stop_collecting(
    session: AsyncSession, *, organisation_id: str, order_id: uuid.UUID
) -> bool:
    """Cancel the open intent. False when the payment already succeeded."""
    return await payments_service.cancel_open_intent(
        session,
        organisation_id=organisation_id,
        source_type=SOURCE_TYPE,
        source_id=str(order_id),
    )


async def refund_in_full(
    session: AsyncSession,
    *,
    organisation_id: str,
    order_id: uuid.UUID,
    reason: str,
) -> payment_schemas.PaymentIntentPublic | None:
    """Hand back what is left of the captured money (nothing to do when none is).

    A payments failure propagates: the outbox retries the handler, which is the
    right outcome for money, unlike a bookings cancel that must still stand."""
    intent = await intent_for(
        session, organisation_id=organisation_id, order_id=order_id
    )
    if intent is None or intent.captured_minor - intent.refunded_minor <= 0:
        return intent
    await payments_service.refund_intent(
        session,
        organisation_id=organisation_id,
        intent_id=intent.id,
        actor=None,
        payload=payment_schemas.PaymentRefundCreate(reason=reason),
    )
    return await intent_for(session, organisation_id=organisation_id, order_id=order_id)


async def ledger_totals(
    session: AsyncSession, *, organisation_id: str, listing_id: uuid.UUID
) -> tuple[int, int]:
    """What the payments ledger holds for one event's orders: ``(collected,
    refunded)`` in minor units, summed in SQL over the intents tagged with the
    listing id (``metadata.listing_id``)."""
    row = (
        await session.execute(
            select(
                func.coalesce(
                    func.sum(
                        case(
                            (
                                LedgerEntry.kind == LedgerKind.CHARGE.value,
                                LedgerEntry.amount_minor,
                            ),
                            else_=0,
                        )
                    ),
                    0,
                ),
                func.coalesce(
                    func.sum(
                        case(
                            (
                                LedgerEntry.kind == LedgerKind.REFUND.value,
                                -LedgerEntry.amount_minor,
                            ),
                            else_=0,
                        )
                    ),
                    0,
                ),
            )
            .join(Intent, Intent.id == LedgerEntry.intent_id)
            .where(
                Intent.organisation_id == organisation_id,
                Intent.source_type == SOURCE_TYPE,
                Intent.metadata_["listing_id"].as_string() == str(listing_id),
            )
        )
    ).one()
    return int(row[0]), int(row[1])
