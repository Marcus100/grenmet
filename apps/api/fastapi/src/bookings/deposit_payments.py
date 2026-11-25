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
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta
from urllib.parse import urlencode

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src import outbox
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
    BookingDepositMode,
    BookingPaymentMode,
    BookingProfile,
    BookingStatus,
    Service,
)
from .schemas import BookingPaymentKind, BookingPaymentStatus, BookingPaymentSummary

logger = logging.getLogger(__name__)

SOURCE_TYPE = "bookings.deposit"
PAID_TOPIC = "bookings.deposit_paid"
#: A refund that must not call the payment provider inside the caller's transaction (the
#: last owner leaving an account). The worker runs ``refund_deposit`` afterwards.
REFUND_TOPIC = "bookings.deposit_refund"
_TEST_KEY_PREFIX = "sk_test_"


def intent_key(booking_id: object) -> str:
    return f"bookings.deposit:{booking_id}"


@dataclass(frozen=True)
class DepositRule:
    """The business-wide deposit rule, as the profile stores it."""

    mode: str = BookingDepositMode.NONE.value
    percent: int | None = None
    fixed_minor: int | None = None
    #: Services priced below this take no deposit from the rule; None = no minimum.
    min_price_minor: int | None = None


def deposit_rule_of(profile: BookingProfile) -> DepositRule:
    return DepositRule(
        mode=profile.deposit_mode,
        percent=profile.deposit_percent,
        fixed_minor=profile.deposit_fixed_minor,
        min_price_minor=profile.deposit_min_price_minor,
    )


def rule_deposit(price_minor: int, rule: DepositRule) -> int:
    """Pure: the business rule's deposit for a service priced ``price_minor``.

    A percentage is rounded up to whole currency units (``100`` minor each), so a
    priced service never rounds to nothing; a fixed amount is taken as given. The
    result never exceeds the price. A service priced below the rule's minimum
    takes nothing from it."""
    if price_minor <= 0:
        return 0
    if rule.min_price_minor and price_minor < rule.min_price_minor:
        return 0
    if rule.mode == BookingDepositMode.PERCENT.value and rule.percent:
        whole_units = -(-price_minor * rule.percent // (100 * 100))
        return min(whole_units * 100, price_minor)
    if rule.mode == BookingDepositMode.FIXED.value and rule.fixed_minor:
        return min(rule.fixed_minor, price_minor)
    return 0


def planned_deposit(
    svc: Service, rule: DepositRule, price_minor: int | None = None
) -> int:
    """Pure: the deposit a booking of ``svc`` carries, before entitlement. The
    service's own deposit wins when set; otherwise the business rule applies to
    ``price_minor`` (the booking's combined price with add-ons, default the price)."""
    if svc.deposit_minor > 0:
        return svc.deposit_minor
    return rule_deposit(svc.price_minor if price_minor is None else price_minor, rule)


def balance_at_salon(price_minor: int, deposit_minor: int) -> int:
    """What is still to pay at the business once the deposit is paid. Clients show
    it only when the deposit state is ``paid``; while due or unpaid it is not owed yet."""
    return max(price_minor - deposit_minor, 0)


def money_text(minor: int, currency: str) -> str:
    """ "XCD 1,234.56", the money style customers see in mail."""
    whole, cents = divmod(abs(minor), 100)
    sign = "-" if minor < 0 else ""
    return f"{currency} {sign}{whole:,}.{cents:02d}"


async def effective_deposit(
    session: AsyncSession,
    profile: BookingProfile,
    svc: Service,
    price_minor: int | None = None,
) -> int:
    """The deposit to collect for ``svc``: zero unless the organisation is
    entitled to ``payments`` (logged once per booking, never an error)."""
    amount = planned_deposit(svc, deposit_rule_of(profile), price_minor)
    if amount <= 0:
        return 0
    if await organisation_service.is_app_enabled(
        session, organisation_id=profile.organisation_id, app_key="payments"
    ):
        return amount
    logger.info(
        "booking deposit skipped: organisation has no payments entitlement",
        extra={"organisation_id": profile.organisation_id, "service_id": str(svc.id)},
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


def due_for(
    svc: Service,
    *,
    full_price: bool,
    entitled: bool,
    rule: DepositRule,
    price_minor: int | None = None,
) -> int:
    """Pure rule: what a booking of ``svc`` pays when it is made (0 = nothing).
    ``full_price`` charges the price; otherwise the planned deposit (service
    override first, then the business rule). Nothing without the entitlement.
    ``price_minor`` is the combined price when add-ons are booked."""
    if not entitled:
        return 0
    price = svc.price_minor if price_minor is None else price_minor
    if full_price and price > 0:
        return price
    return planned_deposit(svc, rule, price)


async def amount_due(
    session: AsyncSession,
    profile: BookingProfile,
    svc: Service,
    price_minor: int | None = None,
) -> int:
    """What an online booking of ``svc`` pays when it is made (0 = nothing).

    ``full_price`` charges the price only while Stripe is available and the
    organisation holds ``payments``; otherwise the service deposit or the business
    deposit rule applies. ``price_minor`` is the combined price with add-ons."""
    price = svc.price_minor if price_minor is None else price_minor
    full_price = charges_full_price(profile)
    if (
        profile.payment_at_booking == BookingPaymentMode.FULL_PRICE.value
        and not full_price
    ):
        logger.info(
            "full price at booking needs card payments; using the service deposit",
            extra={"organisation_id": profile.organisation_id},
        )
    if full_price and price > 0:
        entitled = await organisation_service.is_app_enabled(
            session, organisation_id=profile.organisation_id, app_key="payments"
        )
        return due_for(
            svc,
            full_price=True,
            entitled=entitled,
            rule=deposit_rule_of(profile),
            price_minor=price,
        )
    return await effective_deposit(session, profile, svc, price)


async def due_by_service(
    session: AsyncSession, profile: BookingProfile, services: list[Service]
) -> dict[object, int]:
    """``amount_due`` for a whole storefront, with one entitlement query."""
    entitled = await organisation_service.is_app_enabled(
        session, organisation_id=profile.organisation_id, app_key="payments"
    )
    full_price = charges_full_price(profile)
    rule = deposit_rule_of(profile)
    return {
        svc.id: due_for(svc, full_price=full_price, entitled=entitled, rule=rule)
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


def payment_line(booking: Booking) -> str | None:
    """The mail line for a payment that is in and the booking stands: "Deposit paid
    XCD x, remaining XCD y at the salon", or "Paid in full" when the deposit is the
    whole price. None for every other booking."""
    if booking.deposit_minor <= 0:
        return None
    if booking.status not in (
        BookingStatus.PENDING.value,
        BookingStatus.CONFIRMED.value,
    ):
        return None
    paid = money_text(booking.deposit_minor, booking.currency)
    if payment_kind(booking) is BookingPaymentKind.PAYMENT:
        # A deposit equal to the price is a full prepayment: nothing is left to pay.
        return f"Paid in full, {paid}."
    remaining = money_text(
        balance_at_salon(booking.price_minor, booking.deposit_minor), booking.currency
    )
    return f"Deposit paid {paid}, remaining {remaining} at the salon."


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
        if intent is not None and intent.provider is ProviderKey.STRIPE:
            link = checkout_url
    else:
        status = BookingPaymentStatus.UNPAID
    return BookingPaymentSummary(
        status=status,
        amount_minor=booking.deposit_minor,
        paid_minor=paid,
        refunded_minor=refunded,
        balance_at_salon_minor=balance_at_salon(
            booking.price_minor, booking.deposit_minor
        ),
        currency=booking.currency,
        checkout_url=link,
    )


async def payment_summary(
    session: AsyncSession, booking: Booking
) -> BookingPaymentSummary | None:
    """The money side of a booking as its customer sees it; None when nothing
    was due at booking. ``checkout_url`` is set only while the slot is still held
    for an unpaid online checkout, so the customer can return to it."""
    if booking.deposit_minor <= 0:
        return None
    intent = await find_deposit(session, booking)
    checkout_url: str | None = None
    if (
        intent is not None
        and intent.provider is ProviderKey.STRIPE
        and booking.status == BookingStatus.PENDING_PAYMENT.value
    ):
        checkout_url = await session.scalar(
            select(Intent.checkout_url).where(Intent.id == intent.id)
        )
    return _summary(booking, intent, checkout_url)


async def payment_summaries(
    session: AsyncSession, bookings: list[Booking]
) -> dict[uuid.UUID, BookingPaymentSummary | None]:
    """``payment_summary`` for many bookings in two queries at most (the intents
    with their totals, then the checkout links of the ones still due)."""
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
        and intent.provider is ProviderKey.STRIPE
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
    result: dict[uuid.UUID, BookingPaymentSummary | None] = {}
    for b in bookings:
        intent = found.get(b.id)
        result[b.id] = _summary(b, intent, links.get(intent.id) if intent else None)
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


def refund_by_policy(
    booking: Booking,
    profile: BookingProfile,
    now: datetime,
    *,
    previous: BookingStatus,
) -> bool:
    """Deposits come back when the booking is cancelled at least
    ``cancel_cutoff_hours`` before it starts; inside the cutoff they are kept.

    A booking made on non-refundable terms (its own snapshot, never the current
    profile) keeps its deposit once it was confirmed. A request the business has not
    accepted yet (``pending``) is refunded under the cutoff rule."""
    if booking.deposit_non_refundable and previous is BookingStatus.CONFIRMED:
        return False
    return booking.starts_at - now >= timedelta(hours=profile.cancel_cutoff_hours)


def refund_id_for(
    booking_id: uuid.UUID, intent_id: uuid.UUID, amount_minor: int, occasion: str
) -> uuid.UUID:
    """The refund id of one deposit refund, derived from the booking, the intent,
    the amount and the occasion (the reason). A retry after a lost commit derives the
    same id, so the provider sees the same idempotency key and refunds once. A partial
    refund (another amount) gets its own id."""
    return uuid.uuid5(
        uuid.NAMESPACE_URL,
        f"bookings.deposit-refund:{booking_id}:{intent_id}:{amount_minor}:{occasion}",
    )


async def refund_deposit(
    session: AsyncSession, booking: Booking, *, reason: str
) -> bool:
    """Refund what is left of the captured deposit. Never raises for a payments
    problem: returns False (and logs) so the booking change itself still stands."""
    intent = await find_deposit(session, booking)
    if intent is None or intent.captured_minor - intent.refunded_minor <= 0:
        return True
    remaining = intent.captured_minor - intent.refunded_minor
    try:
        async with session.begin_nested():
            await payments_service.refund_intent(
                session,
                organisation_id=booking.organisation_id,
                intent_id=intent.id,
                actor=None,
                payload=payment_schemas.PaymentRefundCreate(reason=reason),
                refund_id=refund_id_for(booking.id, intent.id, remaining, reason),
            )
    except AppException as error:
        # Error level so Sentry alerts: the money is still held and needs a refund by
        # hand. Only ids, amounts and the status code are logged (no provider text).
        logger.error(
            "booking deposit refund failed; refund it by hand",
            extra={
                "booking_id": str(booking.id),
                "intent_id": str(intent.id),
                "amount_minor": intent.captured_minor - intent.refunded_minor,
                "status_code": error.status_code,
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
    defer_refund: bool = False,
) -> str | None:
    """Money side of a cancelled booking. Returns a note for the booking's history,
    or None when no deposit was involved.

    - Was ``pending_payment``: the open intent is cancelled; if the payment had
      just succeeded it is refunded in full.
    - Otherwise ``refund`` decides (``None`` = the cutoff policy).
    - ``defer_refund``: a refund is queued on the outbox instead of called here, so no
      payment-provider call runs inside the caller's transaction."""
    if booking.deposit_minor <= 0:
        return None
    noun = payment_noun(booking)
    if previous is BookingStatus.PENDING_PAYMENT:
        unpaid = await cancel_unpaid_deposit(session, booking)
        if unpaid:
            return f"Unpaid {noun.lower()} cancelled"
        refund = True
    if refund is None:
        refund = refund_by_policy(booking, profile, now, previous=previous)
    if not refund:
        return f"{noun} kept"
    if defer_refund:
        await outbox.enqueue(
            session,
            topic=REFUND_TOPIC,
            payload={"booking_id": str(booking.id)},
            dedupe_key=f"bookings.deposit-refund:{booking.id}",
            organisation_id=booking.organisation_id,
        )
        return f"{noun} refund queued"
    done = await refund_deposit(session, booking, reason="Booking cancelled")
    return f"{noun} refunded" if done else f"{noun} refund failed; refund it by hand"
