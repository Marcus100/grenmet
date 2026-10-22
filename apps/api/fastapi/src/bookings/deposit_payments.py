"""Deposit money for bookings (B6): the only place bookings talks to payments.

Pure payments plumbing with no dependency on ``public.py`` so the public create
and cancel paths can use it. The booking-side reactions (confirm on payment,
expire unpaid holds) live in ``deposits.py``.

Rules (ADR-0027, ADR-0024):
- A service deposit applies only when the organisation holds the ``payments``
  entitlement; otherwise the booking is made without one and a note is logged.
- One intent per booking: ``source_type="bookings.deposit"``, ``source_id`` the
  booking id, idempotency key ``bookings.deposit:<booking id>``. No user acts,
  so the intent records ``created_by_user_id`` as NULL.
- The card rail is Stripe in TEST mode only: it is used when
  ``PAYMENTS_STRIPE_SECRET_KEY`` is an ``sk_test_`` key. Otherwise, or when Stripe
  cannot start a checkout, a manual intent is created and the studio records
  the payment (``checkout_url`` is then None).
"""

import logging
from datetime import datetime, timedelta

from sqlalchemy.ext.asyncio import AsyncSession

from src.exceptions import AppException
from src.organisations import service as organisation_service
from src.payments import schemas as payment_schemas
from src.payments import service as payments_service
from src.payments.config import payments_settings
from src.payments.models import ProviderKey

from .models import Booking, BookingProfile, BookingStatus, Service

logger = logging.getLogger(__name__)

SOURCE_TYPE = "bookings.deposit"
PAID_TOPIC = "bookings.deposit_paid"
_TEST_KEY_PREFIX = "sk_test_"


def intent_key(booking_id: object) -> str:
    return f"bookings.deposit:{booking_id}"


async def effective_deposit(
    session: AsyncSession, organisation_id: str, svc: Service
) -> int:
    """The deposit to collect for ``svc``: zero unless the organisation is
    entitled to ``payments`` (logged once per booking, never an error)."""
    if svc.deposit_minor <= 0:
        return 0
    if await organisation_service.is_app_enabled(
        session, organisation_id=organisation_id, app_key="payments"
    ):
        return svc.deposit_minor
    logger.info(
        "booking deposit skipped: organisation has no payments entitlement",
        extra={"organisation_id": organisation_id, "service_id": str(svc.id)},
    )
    return 0


def _stripe_available() -> bool:
    key = payments_settings.STRIPE_SECRET_KEY
    return bool(key and key.startswith(_TEST_KEY_PREFIX))


def _payload(
    booking: Booking, provider: ProviderKey, customer_email: str | None
) -> payment_schemas.PaymentIntentCreate:
    return payment_schemas.PaymentIntentCreate(
        amount_minor=booking.deposit_minor,
        currency=booking.currency,
        provider=provider,
        source_type=SOURCE_TYPE,
        source_id=str(booking.id),
        customer_email=customer_email,
        metadata={"booking_id": str(booking.id)},
        idempotency_key=intent_key(booking.id),
    )


async def start_deposit(
    session: AsyncSession, booking: Booking, customer_email: str | None
) -> str | None:
    """Create the deposit intent. Returns the hosted checkout URL, or None when
    the studio must record a manual payment."""
    if _stripe_available():
        try:
            async with session.begin_nested():
                result = await payments_service.create_intent(
                    session,
                    organisation_id=booking.organisation_id,
                    actor=None,
                    payload=_payload(booking, ProviderKey.STRIPE, customer_email),
                )
            return result.checkout_url
        except AppException:
            logger.warning(
                "stripe checkout unavailable for a booking deposit; using manual",
                extra={"booking_id": str(booking.id)},
            )
    manual = await payments_service.create_intent(
        session,
        organisation_id=booking.organisation_id,
        actor=None,
        payload=_payload(booking, ProviderKey.MANUAL, customer_email),
    )
    return manual.checkout_url


async def start_manual_deposit(session: AsyncSession, booking: Booking) -> None:
    """Create the manual deposit intent for a booking that has none (staff record
    a deposit that was never started online)."""
    await payments_service.create_intent(
        session,
        organisation_id=booking.organisation_id,
        actor=None,
        payload=_payload(booking, ProviderKey.MANUAL, None),
    )


def refund_by_policy(booking: Booking, profile: BookingProfile, now: datetime) -> bool:
    """Deposits come back when the booking is cancelled at least
    ``cancel_cutoff_hours`` before it starts; inside the cutoff they are kept."""
    return booking.starts_at - now >= timedelta(hours=profile.cancel_cutoff_hours)


async def refund_deposit(
    session: AsyncSession, booking: Booking, *, reason: str
) -> bool:
    """Refund what is left of the captured deposit. Never raises for a payments
    problem: returns False (and logs) so the booking change itself still stands."""
    intent = await payments_service.find_by_source(
        session,
        organisation_id=booking.organisation_id,
        source_type=SOURCE_TYPE,
        source_id=str(booking.id),
    )
    if intent is None or intent.captured_minor - intent.refunded_minor <= 0:
        return True
    try:
        async with session.begin_nested():
            await payments_service.refund_intent(
                session,
                organisation_id=booking.organisation_id,
                intent_id=intent.id,
                actor=None,
                payload=payment_schemas.PaymentRefundCreate(reason=reason),
            )
    except AppException as error:
        logger.warning(
            "booking deposit refund failed",
            extra={
                "booking_id": str(booking.id),
                "intent_id": str(intent.id),
                "status_code": error.status_code,
                "reason": error.message,
            },
        )
        return False
    return True


async def settle_cancellation(
    session: AsyncSession,
    booking: Booking,
    profile: BookingProfile,
    *,
    previous: BookingStatus,
    refund: bool | None,
    now: datetime,
) -> str | None:
    """Money side of a cancelled booking. Returns a note for the booking's history,
    or None when no deposit was involved.

    - Was ``pending_payment``: the open intent is cancelled; if the payment had
      just succeeded it is refunded in full.
    - Otherwise ``refund`` decides (``None`` = the cutoff policy)."""
    if booking.deposit_minor <= 0:
        return None
    if previous is BookingStatus.PENDING_PAYMENT:
        unpaid = await payments_service.cancel_open_intent(
            session,
            organisation_id=booking.organisation_id,
            source_type=SOURCE_TYPE,
            source_id=str(booking.id),
        )
        if unpaid:
            return "Unpaid deposit cancelled"
        refund = True
    if refund is None:
        refund = refund_by_policy(booking, profile, now)
    if not refund:
        return "Deposit kept"
    done = await refund_deposit(session, booking, reason="Booking cancelled")
    return "Deposit refunded" if done else "Deposit refund failed; refund it by hand"
