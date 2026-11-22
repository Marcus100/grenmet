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
- Which rail takes the deposit online (``deposit_route``, 21 Nov 2026), in order:
  the business's own WiPay account when it is ready (``wipay``); the Stripe TEST
  rail when ``PAYMENTS_STRIPE_SECRET_KEY`` is an ``sk_test_`` key (as before); the
  business's own payment link when it has one (``payment_link``: a manual intent,
  the checkout is the link, staff record the payment); otherwise no online deposit at
  all (``none``): the booking is paid in the salon and takes no hold.
- Stripe Checkout (test mode) or a WiPay checkout that cannot start falls back to a
  manual intent for staff, as before.
- ``profile.payment_at_booking == "full_price"`` charges the service price instead
  of its deposit, but only while that card rail is available: without Stripe keys
  the profile acts as ``deposit``, so nothing changes for anyone. The amount is
  stored in ``booking.deposit_minor`` ("paid at booking") either way.
- Stripe Checkout returns the customer to the bookings app's ``/checkout/return``
  page (``return_urls`` builder below), which sends them on to their manage page.
"""

import logging
import uuid
from datetime import datetime, timedelta
from enum import Enum
from urllib.parse import quote, urlencode

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
from .exceptions import BookingConflictError
from .models import (
    Booking,
    BookingPaymentMode,
    BookingProfile,
    BookingStatus,
    Service,
)
from .schemas import BookingPaymentKind, BookingPaymentStatus, BookingPaymentSummary

logger = logging.getLogger(__name__)

SOURCE_TYPE = "bookings.deposit"
PAID_TOPIC = "bookings.deposit_paid"
_TEST_KEY_PREFIX = "sk_test_"
#: The history note's wording when a deposit refund cannot be made here (WiPay has no
#: refund call): the studio is told by note and by email (public.refund_refused_notice).
REFUND_BY_HAND = "refund failed; refund it by hand"
#: Providers whose hosted checkout the customer is sent to (their summary links it).
ONLINE_PROVIDERS = (ProviderKey.STRIPE, ProviderKey.WIPAY)


class DepositRoute(str, Enum):
    """Which rail takes a booking's deposit online (see the module rules)."""

    WIPAY = "wipay"
    STRIPE_TEST = "stripe_test"
    PAYMENT_LINK = "payment_link"
    NONE = "none"


def intent_key(booking_id: object) -> str:
    return f"bookings.deposit:{booking_id}"


async def deposit_route(session: AsyncSession, profile: BookingProfile) -> DepositRoute:
    """The rail for this business's deposits right now. A WiPay account that is ready
    wins; the Stripe test rail comes next; then the business's own payment link; with
    none of them the booking takes no online deposit."""
    if await payments_service.wipay_ready(session, profile.organisation_id):
        return DepositRoute.WIPAY
    if stripe_available():
        return DepositRoute.STRIPE_TEST
    if profile.deposit_payment_link:
        return DepositRoute.PAYMENT_LINK
    return DepositRoute.NONE


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
    organisation holds ``payments``; otherwise the service deposit rule applies.
    With no online rail at all the booking takes nothing up front (paid in the salon)."""
    if await deposit_route(session, profile) is DepositRoute.NONE:
        logger.info(
            "no online deposit route; the booking is paid in the salon",
            extra={"organisation_id": profile.organisation_id},
        )
        return 0
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
    if await deposit_route(session, profile) is DepositRoute.NONE:
        return {svc.id: 0 for svc in services}
    entitled = await organisation_service.is_app_enabled(
        session, organisation_id=profile.organisation_id, app_key="payments"
    )
    full_price = charges_full_price(profile)
    return {
        svc.id: due_for(svc, full_price=full_price, entitled=entitled)
        for svc in services
    }


def payment_kind(booking: Booking) -> BookingPaymentKind:
    """Whether what the booking asks for at booking is a part of the price (a
    deposit) or all of it (a full payment); the studio words its screens by it."""
    if booking.deposit_minor >= booking.price_minor:
        return BookingPaymentKind.PAYMENT
    return BookingPaymentKind.DEPOSIT


def payment_noun(booking: Booking) -> str:
    """ "Payment" or "Deposit", for notes in the booking's history."""
    return (
        "Payment" if payment_kind(booking) is BookingPaymentKind.PAYMENT else "Deposit"
    )


def checkout_title(
    booking: Booking, svc: Service, profile: BookingProfile, amount_minor: int
) -> str:
    """The line the customer sees on the hosted checkout page. Deposit or payment
    is judged against the booking's own price snapshot, like ``payment_kind``."""
    kind = "Deposit" if amount_minor < booking.price_minor else "Payment"
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

#: The business's sandbox test checkout (payments, ADR-0027 amendment): the customer
#: returns to the studio settings page of the business. The source id is the
#: organisation's slug, so the page is built from settings and the slug only.
TEST_SOURCE_TYPE = "payments.wipay-test"


def _test_return_address(source_id: str | None) -> return_urls.ReturnAddress | None:
    if not source_id:
        return None
    base = bookings_settings.APP_URL.rstrip("/")

    def url(result: str) -> str:
        query = urlencode({"wipay_test": result})
        return f"{base}/studio/{quote(source_id, safe='')}/settings?{query}"

    return return_urls.ReturnAddress(url("paid"), url("cancelled"))


return_urls.register(TEST_SOURCE_TYPE, _test_return_address)


def _payload(
    booking: Booking,
    provider: ProviderKey,
    customer_email: str | None,
    description: str | None = None,
) -> payment_schemas.PaymentIntentCreate:
    # ``description`` is shown on the admin payments ledger (service and business).
    metadata: dict[str, str | int | bool] = {"booking_id": str(booking.id)}
    if description:
        metadata["description"] = description[:200]
    return payment_schemas.PaymentIntentCreate(
        amount_minor=booking.deposit_minor,
        currency=booking.currency,
        provider=provider,
        source_type=SOURCE_TYPE,
        source_id=str(booking.id),
        customer_email=customer_email,
        metadata=metadata,
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
    profile: BookingProfile | None = None,
) -> str | None:
    """Create the deposit intent. Returns where the customer pays: the hosted checkout
    URL (WiPay, Stripe test), the business's payment link, or None when the studio
    must record a manual payment."""
    if profile is None:
        profile = await session.scalar(
            select(BookingProfile).where(
                BookingProfile.organisation_id == booking.organisation_id
            )
        )
        assert profile is not None
    route = await deposit_route(session, profile)
    if route is DepositRoute.WIPAY:
        # No fallback to another rail: a failed WiPay checkout fails the booking,
        # and the customer tries again (the amount is the same either way).
        result = await payments_service.create_intent(
            session,
            organisation_id=booking.organisation_id,
            actor=None,
            payload=_payload(booking, ProviderKey.WIPAY, customer_email, title),
            checkout_title=title,
        )
        return result.checkout_url
    if route is DepositRoute.PAYMENT_LINK:
        # Staff confirm the payment when it arrives (manual-deposit, method payment_link).
        await payments_service.create_intent(
            session,
            organisation_id=booking.organisation_id,
            actor=None,
            payload=_payload(booking, ProviderKey.MANUAL, customer_email, title),
        )
        return profile.deposit_payment_link
    if route is DepositRoute.NONE:
        # Asked for an online deposit with no rail (the rail changed after the amount was
        # set): fail the booking. No manual intent is silently created in its place.
        raise BookingConflictError(
            "Online payment for this deposit is not available right now; try again"
        )
    if stripe_available():
        try:
            async with session.begin_nested():
                result = await payments_service.create_intent(
                    session,
                    organisation_id=booking.organisation_id,
                    actor=None,
                    payload=_payload(
                        booking, ProviderKey.STRIPE, customer_email, title
                    ),
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
        payload=_payload(booking, ProviderKey.MANUAL, customer_email, title),
    )
    return manual.checkout_url


def _summary(
    booking: Booking,
    intent: payment_schemas.PaymentIntentPublic | None,
    checkout_url: str | None,
    payment_link: str | None = None,
) -> BookingPaymentSummary | None:
    if booking.deposit_minor <= 0:
        return None
    paid = intent.captured_minor if intent else 0
    refunded = intent.refunded_minor if intent else 0
    held = booking.status == BookingStatus.PENDING_PAYMENT.value
    link: str | None = None
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
        if intent is not None and intent.provider in ONLINE_PROVIDERS:
            link = checkout_url
        else:
            # The business's own payment link, when it has one (manual intent).
            link = payment_link
    else:
        status = BookingPaymentStatus.UNPAID
    return BookingPaymentSummary(
        status=status,
        amount_minor=booking.deposit_minor,
        paid_minor=paid,
        refunded_minor=refunded,
        currency=booking.currency,
        checkout_url=link,
    )


async def payment_summary(
    session: AsyncSession,
    booking: Booking,
    *,
    payment_link: str | None = None,
) -> BookingPaymentSummary | None:
    """The money side of a booking as its customer sees it; None when nothing
    was due at booking. ``checkout_url`` is the place to pay while the slot is still
    held: the online checkout (WiPay, Stripe test) or, for a manual deposit, the
    business's ``payment_link``."""
    if booking.deposit_minor <= 0:
        return None
    intent = await find_deposit(session, booking)
    checkout_url: str | None = None
    if (
        intent is not None
        and intent.provider in ONLINE_PROVIDERS
        and booking.status == BookingStatus.PENDING_PAYMENT.value
    ):
        checkout_url = await session.scalar(
            select(Intent.checkout_url).where(Intent.id == intent.id)
        )
    return _summary(booking, intent, checkout_url, payment_link)


async def payment_summaries(
    session: AsyncSession, bookings: list[Booking]
) -> dict[uuid.UUID, BookingPaymentSummary | None]:
    """``payment_summary`` for many bookings in three queries at most (the intents
    with their totals, the checkout links of the ones still due, and the businesses'
    payment links)."""
    owing = [b for b in bookings if b.deposit_minor > 0]
    intents = await payments_service.find_by_idempotency_keys(
        session,
        organisation_ids={b.organisation_id for b in owing},
        source_type=SOURCE_TYPE,
        idempotency_keys={intent_key(b.id) for b in owing},
    )
    found = {b.id: intents.get((b.organisation_id, intent_key(b.id))) for b in owing}
    due_ids = [
        intent.id
        for b in owing
        if (intent := found[b.id]) is not None
        and intent.provider in ONLINE_PROVIDERS
        and b.status == BookingStatus.PENDING_PAYMENT.value
    ]
    links: dict[uuid.UUID, str | None] = {}
    if due_ids:
        links = dict(
            (
                await session.execute(
                    select(Intent.id, Intent.checkout_url).where(Intent.id.in_(due_ids))
                )
            )
            .tuples()
            .all()
        )
    payment_links: dict[object, str | None] = {}
    if owing:
        payment_links = dict(
            (
                await session.execute(
                    select(
                        BookingProfile.organisation_id,
                        BookingProfile.deposit_payment_link,
                    ).where(
                        BookingProfile.organisation_id.in_(
                            {b.organisation_id for b in owing}
                        )
                    )
                )
            )
            .tuples()
            .all()
        )
    result: dict[uuid.UUID, BookingPaymentSummary | None] = {}
    for b in bookings:
        intent = found.get(b.id)
        result[b.id] = _summary(
            b,
            intent,
            links.get(intent.id) if intent else None,
            payment_link=payment_links.get(b.organisation_id),
        )
    return result


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
    noun = payment_noun(booking)
    if previous is BookingStatus.PENDING_PAYMENT:
        unpaid = await cancel_unpaid_deposit(session, booking)
        if unpaid:
            return f"Unpaid {noun.lower()} cancelled"
        refund = True
    if refund is None:
        refund = refund_by_policy(booking, profile, now)
    if not refund:
        return f"{noun} kept"
    done = await refund_deposit(session, booking, reason="Booking cancelled")
    return f"{noun} refunded" if done else f"{noun} {REFUND_BY_HAND}"
