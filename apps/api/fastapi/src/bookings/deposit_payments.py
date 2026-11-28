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
from src.payments.exceptions import PaymentsValidationError, RefundFailedAtProvider
from src.payments.models import Intent, IntentStatus, ProviderKey

from .config import bookings_settings
from .models import (
    Booking,
    BookingDepositCollection,
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


def collected_by_business(profile: BookingProfile) -> bool:
    """True when the customer pays the deposit to the business by hand (display
    only): nothing is charged online and no payments entitlement is needed."""
    return profile.deposit_collection == BookingDepositCollection.BUSINESS.value


def deposit_to_business(
    profile: BookingProfile, svc: Service, price_minor: int | None = None
) -> int:
    """The deposit shown to the customer in ``business`` collection: the service's
    own deposit, else the business rule (with its minimum price). 0 in ``online``."""
    if not collected_by_business(profile):
        return 0
    return planned_deposit(svc, deposit_rule_of(profile), price_minor)


def needs_acceptance(profile: BookingProfile, svc: Service) -> bool:
    """True when a booking of ``svc`` is a request the business accepts by hand:
    the profile confirms every booking, or the service is for new clients only."""
    return bool(profile.requires_confirmation or svc.new_clients_only)


def awaits_acceptance(booking: Booking) -> bool:
    """A request whose payment is asked only after the business accepts it, and
    which the business has not accepted yet: nothing is due and nothing was paid."""
    return (
        booking.pay_after_acceptance
        and booking.status == BookingStatus.PENDING.value
        and booking.deposit_minor > 0
    )


def accepted_awaiting_payment(booking: Booking) -> bool:
    """A request the business accepted that now waits for its payment."""
    return (
        booking.pay_after_acceptance
        and booking.status == BookingStatus.PENDING_PAYMENT.value
    )


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
    if collected_by_business(profile):
        return 0
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
        and not collected_by_business(profile)
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
    if collected_by_business(profile):
        return 0
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
    if collected_by_business(profile):
        return {svc.id: 0 for svc in services}
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
    if awaits_acceptance(booking):
        due = money_text(booking.deposit_minor, booking.currency)
        return f"Nothing to pay yet. {due} is due once your request is accepted."
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


#: An online card checkout holds the slot at most this long (minutes), whatever
#: the business set. Payment-link and manual deposits use the business's own hold.
ONLINE_HOLD_CAP_MINUTES = 120


def hold_minutes_for(profile_minutes: int | None, *, online: bool) -> int:
    """Pure: how many minutes an unpaid deposit holds the slot. ``profile_minutes``
    is the business's ``deposit_hold_minutes`` (null = ``DEPOSIT_HOLD_MINUTES``).
    An online (Stripe) checkout is capped at ``ONLINE_HOLD_CAP_MINUTES``."""
    base = (
        bookings_settings.DEPOSIT_HOLD_MINUTES
        if profile_minutes is None
        else profile_minutes
    )
    return min(base, ONLINE_HOLD_CAP_MINUTES) if online else base


#: A card checkout started when the business accepts a request holds the slot at
#: most this long. The 2-hour cap above does not apply (the customer answers an
#: email, not a page they are on), but a hosted checkout link stops working 24
#: hours after it is made, so the hold never outlives the link.
ACCEPTED_ONLINE_HOLD_CAP_MINUTES = 23 * 60
#: How long an accepted request has to pay when the business set no hold of its
#: own. The customer answers an email, so the 30 minutes of a payment made while
#: booking (``DEPOSIT_HOLD_MINUTES``) would be far too short.
ACCEPTED_HOLD_DEFAULT_MINUTES = 24 * 60
#: A request is not accepted into "pay online" with less than this before its
#: start: the customer could not reasonably pay in time.
ACCEPT_MIN_MINUTES_TO_START = 30
#: Stripe refuses a checkout that ends sooner than 30 minutes from now, so an accepted
#: request's checkout ends at least this long ahead (its hold can be 30 minutes).
CHECKOUT_MIN_MINUTES = 31


def accepted_hold_minutes_for(
    profile_minutes: int | None, *, online: bool, minutes_to_start: int
) -> int:
    """Pure: how many minutes a request holds its slot for payment once the
    business accepts it. The business's ``deposit_hold_minutes`` (null =
    ``ACCEPTED_HOLD_DEFAULT_MINUTES``), capped at ``ACCEPTED_ONLINE_HOLD_CAP_MINUTES``
    for a card checkout, never less than ``ACCEPT_MIN_MINUTES_TO_START`` (the accept
    itself is refused inside that window, so the floor never reaches past the start),
    and never past the booking's own start (at least one minute)."""
    base = ACCEPTED_HOLD_DEFAULT_MINUTES if profile_minutes is None else profile_minutes
    if online:
        base = min(base, ACCEPTED_ONLINE_HOLD_CAP_MINUTES)
    floor = min(ACCEPT_MIN_MINUTES_TO_START, minutes_to_start)
    return max(min(base, minutes_to_start), floor, 1)


def hold_started_at(booking: Booking) -> datetime:
    """The clock an unpaid hold runs from: the acceptance for a request paid after
    the business accepts, else the booking's creation. The sweeper uses the same."""
    if booking.pay_after_acceptance and booking.accepted_at is not None:
        return booking.accepted_at
    return booking.created_at


async def online_held_ids(
    session: AsyncSession, booking_ids: list[uuid.UUID]
) -> set[uuid.UUID]:
    """The bookings whose deposit intent is an online (Stripe) checkout, in one query."""
    if not booking_ids:
        return set()
    rows = await session.scalars(
        select(Intent.source_id).where(
            Intent.source_type == SOURCE_TYPE,
            Intent.provider == ProviderKey.STRIPE.value,
            Intent.source_id.in_([str(booking_id) for booking_id in booking_ids]),
        )
    )
    return {uuid.UUID(source_id) for source_id in rows if source_id}


async def snapshot_hold(
    session: AsyncSession, profile: BookingProfile, booking: Booking
) -> int:
    """Fix the booking's hold when it enters ``pending_payment``: the business's
    value, capped when its deposit is an online checkout. Sets ``booking.hold_minutes``
    and returns it. The route is decided once, at creation (``start_deposit``), so the
    snapshot is not recomputed later."""
    online = booking.id in await online_held_ids(session, [booking.id])
    booking.hold_minutes = hold_minutes_for(profile.deposit_hold_minutes, online=online)
    return booking.hold_minutes


def snapshot_accepted_hold(
    profile: BookingProfile, booking: Booking, now: datetime, *, online: bool
) -> int:
    """Fix the hold of a request the business has just accepted (``accepted_at`` is
    ``now``): see ``accepted_hold_minutes_for``. Sets ``booking.hold_minutes``. It runs
    before the checkout is made, so ``online`` is whether the checkout will be a card
    checkout (``stripe_available``), and the checkout can end when the hold does."""
    to_start = int((booking.starts_at - now).total_seconds() // 60)
    booking.hold_minutes = accepted_hold_minutes_for(
        profile.deposit_hold_minutes, online=online, minutes_to_start=to_start
    )
    return booking.hold_minutes


async def hold_minutes_for_bookings(
    session: AsyncSession, profile: BookingProfile, bookings: list[Booking]
) -> dict[uuid.UUID, int]:
    """Minutes held for each booking waiting for a deposit (``pending_payment``).
    The booking's snapshot wins; a booking with no snapshot (made before it existed)
    is computed from the profile now. Bookings in any other state, and
    business-collected ones, are not in the result. A request accepted for an
    online payment is held whatever the profile collects now: the booking decides."""
    business = collected_by_business(profile)
    held = [
        b
        for b in bookings
        if b.status == BookingStatus.PENDING_PAYMENT.value
        and (b.pay_after_acceptance or not business)
    ]
    unsnapped = [b.id for b in held if b.hold_minutes is None]
    online = await online_held_ids(session, unsnapped)
    return {
        b.id: (
            b.hold_minutes
            if b.hold_minutes is not None
            else hold_minutes_for(profile.deposit_hold_minutes, online=b.id in online)
        )
        for b in held
    }


async def online_payment_open(session: AsyncSession, profile: BookingProfile) -> bool:
    """May a request accepted now ask the customer to pay online? Only while the
    business still collects through Barrels and holds the ``payments`` entitlement.
    Checked at acceptance; a hold already started is then honoured whatever changes."""
    if collected_by_business(profile):
        return False
    return await organisation_service.is_app_enabled(
        session, organisation_id=profile.organisation_id, app_key="payments"
    )


async def start_deposit(
    session: AsyncSession,
    booking: Booking,
    customer_email: str | None,
    *,
    title: str | None = None,
    checkout_expires_at: datetime | None = None,
    strict: bool = False,
) -> str | None:
    """Create the deposit intent. Returns the hosted checkout URL, or None when
    the studio must record a manual payment. ``checkout_expires_at`` (naive UTC)
    ends a Stripe checkout at the booking's hold. ``strict`` raises the provider's
    error instead of falling back to a manual intent (acceptance uses it: a customer
    must not be emailed a payment with no way to pay)."""
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
                    checkout_expires_at=checkout_expires_at,
                )
            return result.checkout_url
        except AppException:
            if strict:
                raise
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
    if paid <= 0 and awaits_acceptance(booking):
        # Nothing is asked until the business accepts: there is no payment to show.
        return None
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


async def deposit_totals(
    session: AsyncSession, bookings: list[Booking]
) -> dict[uuid.UUID, tuple[int, int]]:
    """``(captured, refunded)`` minor units of each booking's own deposit intent, for
    many bookings in one query. A booking with no deposit or no intent has no entry
    and reads as ``(0, 0)``; the totals mean what they do on the booking detail.

    The agenda uses this so a page of bookings costs one extra query, not one each.
    """
    owing = [b for b in bookings if b.deposit_minor > 0]
    intents = await payments_service.find_by_idempotency_keys(
        session,
        organisation_ids={b.organisation_id for b in owing},
        source_type=SOURCE_TYPE,
        idempotency_keys={intent_key(b.id) for b in owing},
    )
    totals: dict[uuid.UUID, tuple[int, int]] = {}
    for b in owing:
        intent = intents.get((b.organisation_id, intent_key(b.id)))
        if intent is not None:
            totals[b.id] = (intent.captured_minor, intent.refunded_minor)
    return totals


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


#: Attempts at one refund. A provider that marks each attempt failed ends the loop.
REFUND_MAX_ATTEMPTS = 5


def refund_id_for(
    booking_id: uuid.UUID,
    intent_id: uuid.UUID,
    amount_minor: int,
    occasion: str,
    attempt: int = 1,
) -> uuid.UUID:
    """The refund id of one deposit refund, derived from the booking, the intent,
    the amount, the occasion (the reason) and the attempt. A retry after a lost commit
    derives the same id, so the provider sees the same idempotency key and refunds
    once. A partial refund (another amount) gets its own id. After the provider marks
    an attempt failed, the next attempt (2, 3, ...) gets its own id; attempt 1 keeps
    the id it always had, so refunds already in flight still match."""
    if attempt < 1:
        raise ValueError("a refund attempt starts at 1")
    name = f"bookings.deposit-refund:{booking_id}:{intent_id}:{amount_minor}:{occasion}"
    if attempt > 1:
        name += f":attempt:{attempt}"
    return uuid.uuid5(uuid.NAMESPACE_URL, name)


async def refund_deposit(
    session: AsyncSession, booking: Booking, *, reason: str
) -> bool:
    """Refund what is left of the captured deposit. Never raises for a payments
    problem: returns False (and logs) so the booking change itself still stands."""
    intent = await find_deposit(session, booking)
    if intent is None or intent.captured_minor - intent.refunded_minor <= 0:
        return True
    remaining = intent.captured_minor - intent.refunded_minor
    for attempt in range(1, REFUND_MAX_ATTEMPTS + 1):
        try:
            async with session.begin_nested():
                await payments_service.refund_intent(
                    session,
                    organisation_id=booking.organisation_id,
                    intent_id=intent.id,
                    actor=None,
                    payload=payment_schemas.PaymentRefundCreate(reason=reason),
                    refund_id=refund_id_for(
                        booking.id, intent.id, remaining, reason, attempt
                    ),
                )
        except RefundFailedAtProvider:
            # The provider marked an earlier attempt failed, so the money is due
            # again: the next attempt has its own id.
            continue
        except PaymentsValidationError as error:
            # The amount is no longer refundable. A concurrent refund may have
            # covered it: then there is nothing left to do, which is not an error.
            current = await find_deposit(session, booking)
            if current is None or current.captured_minor - current.refunded_minor <= 0:
                logger.info(
                    "booking deposit already refunded",
                    extra={"booking_id": str(booking.id), "intent_id": str(intent.id)},
                )
                return True
            logger.error(
                "booking deposit refund failed; refund it by hand",
                extra={
                    "booking_id": str(booking.id),
                    "intent_id": str(intent.id),
                    "amount_minor": remaining,
                    "status_code": error.status_code,
                },
            )
            return False
        except AppException as error:
            # Error level so Sentry alerts: the money is still held and needs a refund
            # by hand. Only ids, amounts and the status code are logged (no provider
            # text).
            logger.error(
                "booking deposit refund failed; refund it by hand",
                extra={
                    "booking_id": str(booking.id),
                    "intent_id": str(intent.id),
                    "amount_minor": remaining,
                    "status_code": error.status_code,
                },
            )
            return False
        return True
    logger.error(
        "booking deposit refund failed every attempt; refund it by hand",
        extra={
            "booking_id": str(booking.id),
            "intent_id": str(intent.id),
            "amount_minor": remaining,
            "attempts": REFUND_MAX_ATTEMPTS,
        },
    )
    return False


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
    if (
        previous is BookingStatus.PENDING
        and booking.pay_after_acceptance
        and await find_deposit(session, booking) is None
    ):
        # A request the business never accepted: no payment was ever started.
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
