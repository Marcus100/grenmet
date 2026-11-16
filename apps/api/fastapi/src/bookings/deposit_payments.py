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
- ``profile.payment_at_booking == "full_price"`` charges the service price instead
  of its deposit, but only while that card rail is available: without Stripe keys
  the profile acts as ``deposit``, so nothing changes for anyone. The amount is
  stored in ``booking.deposit_minor`` ("paid at booking") either way.
- Stripe Checkout returns the customer to the bookings app's ``/checkout/return``
  page (``return_urls`` builder below), which sends them on to their manage page.
"""

import logging
from datetime import datetime, timedelta
from urllib.parse import urlencode

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.exceptions import AppException
from src.organisations import service as organisation_service
from src.payments import return_urls
from src.payments import schemas as payment_schemas
from src.payments import service as payments_service
from src.payments.config import payments_settings
from src.payments.models import Intent, IntentStatus, ProviderKey

from .config import bookings_settings
from .models import (
    Booking,
    BookingPaymentMode,
    BookingProfile,
    BookingStatus,
    Service,
)
from .schemas import BookingPaymentStatus, BookingPaymentSummary

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


def stripe_available() -> bool:
    """True while the card rail is on: a Stripe TEST secret key is configured."""
    key = payments_settings.STRIPE_SECRET_KEY
    return bool(key and key.startswith(_TEST_KEY_PREFIX))


def charges_full_price(profile: BookingProfile) -> bool:
    """The business asked for the full price and the card rail is on."""
    return (
        profile.payment_at_booking == BookingPaymentMode.FULL_PRICE.value
        and stripe_available()
    )


def due_for(svc: Service, *, full_price: bool, entitled: bool) -> int:
    """Pure rule: what a booking of ``svc`` pays when it is made (0 = nothing)."""
    if not entitled:
        return 0
    if full_price and svc.price_minor > 0:
        return svc.price_minor
    return max(svc.deposit_minor, 0)


async def amount_due(
    session: AsyncSession, profile: BookingProfile, svc: Service
) -> int:
    """What an online booking of ``svc`` pays when it is made (0 = nothing).

    ``full_price`` charges the price only while Stripe is available and the
    organisation holds ``payments``; otherwise the service deposit rule applies."""
    full_price = charges_full_price(profile)
    if (
        profile.payment_at_booking == BookingPaymentMode.FULL_PRICE.value
        and not full_price
    ):
        logger.info(
            "full price at booking needs card payments; using the service deposit",
            extra={"organisation_id": profile.organisation_id},
        )
    if full_price and svc.price_minor > 0:
        entitled = await organisation_service.is_app_enabled(
            session, organisation_id=profile.organisation_id, app_key="payments"
        )
        return due_for(svc, full_price=True, entitled=entitled)
    return await effective_deposit(session, profile.organisation_id, svc)


async def due_by_service(
    session: AsyncSession, profile: BookingProfile, services: list[Service]
) -> dict[object, int]:
    """``amount_due`` for a whole storefront, with one entitlement query."""
    entitled = await organisation_service.is_app_enabled(
        session, organisation_id=profile.organisation_id, app_key="payments"
    )
    full_price = charges_full_price(profile)
    return {
        svc.id: due_for(svc, full_price=full_price, entitled=entitled)
        for svc in services
    }


def checkout_title(svc: Service, profile: BookingProfile, amount_minor: int) -> str:
    """The line the customer sees on the hosted checkout page."""
    kind = "Deposit" if amount_minor < svc.price_minor else "Payment"
    return f"{kind}: {svc.name}, {profile.display_name}"


def _return_address(source_id: str | None) -> return_urls.ReturnAddress | None:
    """Stripe sends the customer back to the bookings app's return page. Built
    from settings and the booking id only (no request data, no open redirect)."""
    if not source_id:
        return None
    base = bookings_settings.APP_URL.rstrip("/")

    def url(result: str) -> str:
        query = urlencode({"booking": source_id, "result": result})
        return f"{base}/checkout/return?{query}"

    return return_urls.ReturnAddress(url("paid"), url("cancelled"))


return_urls.register(SOURCE_TYPE, _return_address)


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


async def find_deposit(
    session: AsyncSession, booking: Booking
) -> payment_schemas.PaymentIntentPublic | None:
    """The booking's own deposit intent (found by its idempotency key, never "the
    newest intent for the booking"), with captured and refunded totals."""
    return await payments_service.find_by_source(
        session,
        organisation_id=booking.organisation_id,
        source_type=SOURCE_TYPE,
        source_id=str(booking.id),
        idempotency_key=intent_key(booking.id),
    )


async def cancel_unpaid_deposit(session: AsyncSession, booking: Booking) -> bool:
    """Cancel the booking's own deposit intent while unpaid; False if it was paid."""
    return await payments_service.cancel_open_intent(
        session,
        organisation_id=booking.organisation_id,
        source_type=SOURCE_TYPE,
        source_id=str(booking.id),
        idempotency_key=intent_key(booking.id),
    )


async def start_deposit(
    session: AsyncSession,
    booking: Booking,
    customer_email: str | None,
    *,
    title: str | None = None,
) -> str | None:
    """Create the deposit intent. Returns the hosted checkout URL, or None when
    the studio must record a manual payment."""
    if stripe_available():
        try:
            async with session.begin_nested():
                result = await payments_service.create_intent(
                    session,
                    organisation_id=booking.organisation_id,
                    actor=None,
                    payload=_payload(booking, ProviderKey.STRIPE, customer_email),
                    checkout_title=title,
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


async def payment_summary(
    session: AsyncSession, booking: Booking
) -> BookingPaymentSummary | None:
    """The money side of a booking as its customer sees it; None when nothing
    was due at booking. ``checkout_url`` is set only while the slot is still held
    for an unpaid online checkout, so the customer can return to it."""
    if booking.deposit_minor <= 0:
        return None
    intent = await find_deposit(session, booking)
    paid = intent.captured_minor if intent else 0
    refunded = intent.refunded_minor if intent else 0
    held = booking.status == BookingStatus.PENDING_PAYMENT.value
    checkout_url: str | None = None
    if paid > 0:
        status = (
            BookingPaymentStatus.REFUNDED
            if refunded >= paid
            else BookingPaymentStatus.PAID
        )
    elif held and (
        intent is None
        or intent.status in (IntentStatus.REQUIRES_PAYMENT, IntentStatus.PROCESSING)
    ):
        status = BookingPaymentStatus.DUE
        if intent is not None and intent.provider is ProviderKey.STRIPE:
            checkout_url = await session.scalar(
                select(Intent.checkout_url).where(Intent.id == intent.id)
            )
    else:
        status = BookingPaymentStatus.UNPAID
    return BookingPaymentSummary(
        status=status,
        amount_minor=booking.deposit_minor,
        paid_minor=paid,
        refunded_minor=refunded,
        currency=booking.currency,
        checkout_url=checkout_url,
    )


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
    intent = await find_deposit(session, booking)
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
        unpaid = await cancel_unpaid_deposit(session, booking)
        if unpaid:
            return "Unpaid deposit cancelled"
        refund = True
    if refund is None:
        refund = refund_by_policy(booking, profile, now)
    if not refund:
        return "Deposit kept"
    done = await refund_deposit(session, booking, reason="Booking cancelled")
    return "Deposit refunded" if done else "Deposit refund failed; refund it by hand"
