"""Barrels app subscriptions (ADR-0065): Barrels sells its own app plans.

Test mode only until the owner decides otherwise (ADR-0027). This module creates
subscription checkouts and applies Stripe's subscription reports. It changes no
entitlement: an organisation's app access is still set by the organisation routes.

Service functions flush and never commit; the router commits.
"""

import logging
import uuid
from collections.abc import Mapping
from datetime import UTC, datetime, timedelta
from typing import Any
from urllib.parse import quote

from fastapi.concurrency import run_in_threadpool
from sqlalchemy import and_, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from src.audit import service as audit_service
from src.auth.models import User
from src.bookings.config import bookings_settings

from .app_subscription_transitions import move_app_subscription
from .config import billing_settings
from .exceptions import (
    AppSubscriptionAlreadyExistsError,
    AppSubscriptionNotYetWrittenError,
    AppSubscriptionPlanNotFoundError,
    AppSubscriptionPriceNotConfiguredError,
    AppSubscriptionPriceNotFoundError,
    AppSubscriptionStateError,
)
from .gateway import (
    LIVE_KEY_PREFIX,
    TEST_KEY_PREFIX,
    CheckoutSessionResult,
    CheckoutSessionState,
    StripeGateway,
    WebhookEventResult,
)
from .models import (
    LIVE_APP_SUBSCRIPTION_STATUSES,
    AppSubscription,
    AppSubscriptionChannel,
    AppSubscriptionStatus,
    AppSubscriptionTrial,
    Customer,
    Plan,
    PlanPrice,
    StripeEvent,
)
from .schemas import (
    AppSubscriptionCheckoutCreate,
    AppSubscriptionCheckoutPublic,
    AppSubscriptionPublic,
)

logger = logging.getLogger(__name__)

_INCOMPLETE = AppSubscriptionStatus.INCOMPLETE
_ACTIVE = AppSubscriptionStatus.ACTIVE
_PAST_DUE = AppSubscriptionStatus.PAST_DUE
_CANCELED = AppSubscriptionStatus.CANCELED
_UNPAID = AppSubscriptionStatus.UNPAID

#: Stripe subscription status -> the stored status. A Stripe status not listed here
#: is logged and leaves the stored status alone.
STRIPE_STATUS: dict[str, AppSubscriptionStatus] = {
    "incomplete": _INCOMPLETE,
    "trialing": _ACTIVE,
    "active": _ACTIVE,
    "past_due": _PAST_DUE,
    "unpaid": _UNPAID,
    "paused": _UNPAID,
    "canceled": _CANCELED,
    "incomplete_expired": _CANCELED,
}

_SUBSCRIPTION_EVENTS = frozenset(
    {
        "customer.subscription.created",
        "customer.subscription.updated",
        "customer.subscription.deleted",
    }
)


def price_key(plan_key: str, currency: str) -> str:
    """The ``BILLING_STRIPE_PRICES`` key for one plan and currency."""
    return f"{plan_key}:{currency}"


def purchasable_prices() -> list[str]:
    """``plan_key:currency`` keys a checkout can start for now: the Stripe key
    matches the live switch (``sk_live_`` when on, ``sk_test_`` when off) and the
    plan has a price id. Mirrors the gateway's key check, so a listed plan is
    never refused for its key."""
    key = billing_settings.STRIPE_SECRET_KEY or ""
    prefix = (
        LIVE_KEY_PREFIX if billing_settings.STRIPE_LIVE_ENABLED else TEST_KEY_PREFIX
    )
    if not key.startswith(prefix):
        return []
    return sorted(
        price_key
        for price_key, price_id in billing_settings.STRIPE_PRICES.items()
        if price_id
    )


def _view(subscription: AppSubscription, amount_minor: int) -> AppSubscriptionPublic:
    return AppSubscriptionPublic(
        id=subscription.id,
        app_key=subscription.app_key,
        plan_key=subscription.plan_key,
        channel=AppSubscriptionChannel(subscription.channel),
        status=AppSubscriptionStatus(subscription.status),
        currency=subscription.currency,
        amount_minor=amount_minor,
        current_period_end=subscription.current_period_end,
        cancel_at_period_end=subscription.cancel_at_period_end,
        trial_end=subscription.trial_end,
        created_at=subscription.created_at,
    )


async def list_subscriptions(
    session: AsyncSession, *, organisation_id: str
) -> list[AppSubscriptionPublic]:
    """The organisation's app subscriptions, newest first, with the plan's amount."""
    rows = (
        await session.execute(
            select(AppSubscription, PlanPrice.amount_minor)
            .join(
                PlanPrice,
                and_(
                    PlanPrice.plan_key == AppSubscription.plan_key,
                    PlanPrice.currency == AppSubscription.currency,
                ),
            )
            .where(AppSubscription.organisation_id == organisation_id)
            .order_by(AppSubscription.created_at.desc(), AppSubscription.id)
        )
    ).all()
    return [_view(subscription, amount) for subscription, amount in rows]


async def _resume_pending(
    session: AsyncSession,
    *,
    gateway: StripeGateway,
    pending: AppSubscription,
    plan_key: str,
    currency: str,
) -> AppSubscriptionCheckoutPublic | None:
    """Answer a repeat checkout while a live row exists (issue #1723 item 2).

    Only an unpaid pending row with a stored Checkout Session can be resumed. An open
    session returns its own URL (same id), so nothing new is created and the customer
    is not blocked. An expired session cancels the pending row and returns ``None``, so
    the caller creates a fresh row. A session Stripe reports as complete (paid, webhook
    not yet applied) is refused, so a second payment cannot start."""
    if (
        pending.status != _INCOMPLETE.value
        or pending.stripe_subscription_id is not None
        or pending.plan_key != plan_key
        or pending.currency != currency
        or not pending.checkout_session_id
    ):
        raise AppSubscriptionAlreadyExistsError()

    state: CheckoutSessionState = await run_in_threadpool(
        gateway.get_app_subscription_checkout,
        session_id=pending.checkout_session_id,
    )
    if state.status == "open" and state.url:
        logger.info(
            "App subscription checkout resumed",
            extra={
                "organisation_id": pending.organisation_id,
                "target_id": str(pending.id),
            },
        )
        return AppSubscriptionCheckoutPublic.model_validate(
            {"id": pending.id, "url": state.url}
        )
    if state.status != "expired":
        raise AppSubscriptionAlreadyExistsError()

    move_app_subscription(pending, _CANCELED)
    await session.flush()
    logger.info(
        "Expired app subscription checkout replaced",
        extra={
            "organisation_id": pending.organisation_id,
            "target_id": str(pending.id),
        },
    )
    return None


def checkout_return_urls(organisation_slug: str | None) -> tuple[str, str]:
    """``(success_url, cancel_url)`` for one organisation's app checkout (ADR-0065).

    They are the organisation's studio plan page at the bookings app address
    (``BOOKINGS_APP_URL``), with ``checkout=success`` or ``checkout=cancelled``. The
    global Checkout settings are the fallback when the organisation has no slug or the
    address is unset. Built here from server settings only: a request cannot set them."""
    base = bookings_settings.APP_URL.rstrip("/")
    if not organisation_slug or not base:
        return (
            str(billing_settings.CHECKOUT_SUCCESS_URL),
            str(billing_settings.CHECKOUT_CANCEL_URL),
        )
    plan_page = f"{base}/studio/{quote(organisation_slug, safe='')}/plan"
    return f"{plan_page}?checkout=success", f"{plan_page}?checkout=cancelled"


async def grant_trial(
    session: AsyncSession, *, organisation_id: str, plan_key: str, trial_days: int
) -> bool:
    """Give an organisation a free trial on one plan. Create-only: an existing grant is
    kept, so a repeat seed never changes it. Returns True when this call created it.
    Flushes; the caller commits."""
    created = await session.scalar(
        pg_insert(AppSubscriptionTrial)
        .values(
            organisation_id=organisation_id,
            plan_key=plan_key,
            trial_days=trial_days,
            created_at=datetime.now(UTC).replace(tzinfo=None),
        )
        .on_conflict_do_nothing(index_elements=["organisation_id", "plan_key"])
        .returning(AppSubscriptionTrial.plan_key)
    )
    await session.flush()
    return created is not None


async def _trial_days(
    session: AsyncSession, *, organisation_id: str, plan_key: str
) -> int | None:
    """The organisation's trial days for this plan, given once per organisation.

    No grant means no trial. A grant is not used again once a Stripe subscription was
    ever started for this plan, so a cancelled subscription does not earn a second free
    month. An abandoned Checkout never reached Stripe as a subscription, so it keeps
    its trial."""
    trial_days = await session.scalar(
        select(AppSubscriptionTrial.trial_days).where(
            AppSubscriptionTrial.organisation_id == organisation_id,
            AppSubscriptionTrial.plan_key == plan_key,
        )
    )
    if trial_days is None:
        return None
    started = await session.scalar(
        select(AppSubscription.id)
        .where(
            AppSubscription.organisation_id == organisation_id,
            AppSubscription.plan_key == plan_key,
            AppSubscription.stripe_subscription_id.is_not(None),
        )
        .limit(1)
    )
    return None if started is not None else int(trial_days)


async def start_checkout(
    session: AsyncSession,
    *,
    gateway: StripeGateway,
    organisation_id: str,
    organisation_slug: str | None,
    user: User,
    payload: AppSubscriptionCheckoutCreate,
) -> AppSubscriptionCheckoutPublic:
    """Create the pending subscription row and its hosted Checkout Session.

    Every refusal (unknown plan, no price, no Stripe price id, a live subscription
    already) happens before the provider is called. The billing customer row (if
    new) is flushed before the call and the subscription row after it. If the call
    fails the router does not commit, so neither row is kept. The return URLs are
    this organisation's studio plan page (``checkout_return_urls``)."""
    plan = await session.get(Plan, payload.plan_key)
    if plan is None or not plan.active:
        raise AppSubscriptionPlanNotFoundError()
    price = await session.get(PlanPrice, (plan.key, payload.currency))
    if price is None:
        raise AppSubscriptionPriceNotFoundError()
    price_id = billing_settings.STRIPE_PRICES.get(price_key(plan.key, payload.currency))
    if not price_id:
        raise AppSubscriptionPriceNotConfiguredError()

    live = await session.scalar(
        select(AppSubscription)
        .where(
            AppSubscription.organisation_id == organisation_id,
            AppSubscription.app_key == plan.app_key,
            AppSubscription.status.in_(LIVE_APP_SUBSCRIPTION_STATUSES),
        )
        .limit(1)
        .with_for_update()
    )
    if live is not None:
        resumed = await _resume_pending(
            session,
            gateway=gateway,
            pending=live,
            plan_key=plan.key,
            currency=payload.currency,
        )
        if resumed is not None:
            return resumed

    customer = await session.scalar(
        select(Customer).where(Customer.organisation_id == organisation_id)
    )
    if customer is None:
        audit_service.set_actor(session, user.id)
        customer = Customer(
            organisation_id=organisation_id,
            billing_email=str(user.email).lower(),
        )
        session.add(customer)
        await session.flush()

    subscription_id = uuid.uuid4()
    success_url, cancel_url = checkout_return_urls(organisation_slug)
    trial_days = await _trial_days(
        session, organisation_id=organisation_id, plan_key=plan.key
    )
    checkout: CheckoutSessionResult = await run_in_threadpool(
        gateway.create_app_subscription_checkout,
        subscription_id=str(subscription_id),
        organisation_id=organisation_id,
        plan_key=plan.key,
        app_key=plan.app_key,
        price_id=price_id,
        customer_id=customer.stripe_customer_id,
        customer_email=None if customer.stripe_customer_id else customer.billing_email,
        trial_period_days=trial_days,
        success_url=success_url,
        cancel_url=cancel_url,
    )

    subscription = AppSubscription(
        id=subscription_id,
        organisation_id=organisation_id,
        plan_key=plan.key,
        app_key=plan.app_key,
        channel=AppSubscriptionChannel.STRIPE.value,
        currency=payload.currency,
        status=_INCOMPLETE.value,
        checkout_session_id=checkout.id,
        cancel_at_period_end=False,
    )
    session.add(subscription)
    try:
        async with session.begin_nested():
            await session.flush()
    except IntegrityError as exc:
        raise AppSubscriptionAlreadyExistsError() from exc

    logger.info(
        "App subscription checkout created",
        extra={
            "organisation_id": organisation_id,
            "target_id": str(subscription_id),
        },
    )
    return AppSubscriptionCheckoutPublic.model_validate(
        {"id": subscription_id, "url": checkout.url}
    )


# --- Stripe reports ----------------------------------------------------------------


def _from_unix(seconds: int) -> datetime:
    """Stripe's Unix seconds as the naive UTC datetime the columns store."""
    return datetime.fromtimestamp(seconds, UTC).replace(tzinfo=None)


def _optional_time(value: object) -> datetime | None:
    if isinstance(value, int) and not isinstance(value, bool):
        return _from_unix(value)
    return None


def _text(value: object) -> str | None:
    return value if isinstance(value, str) and value else None


def _metadata(obj: Mapping[str, Any]) -> Mapping[str, Any]:
    metadata = obj.get("metadata")
    return metadata if isinstance(metadata, dict) else {}


def _period_end(subscription: Mapping[str, Any]) -> object:
    """``current_period_end`` is on the subscription in older API versions and on its
    items in newer ones; read whichever the event carries."""
    if "current_period_end" in subscription:
        return subscription.get("current_period_end")
    items = subscription.get("items")
    if isinstance(items, dict):
        data = items.get("data")
        if isinstance(data, list) and data and isinstance(data[0], dict):
            return data[0].get("current_period_end")
    return None


#: Returned by a handler when the row an event names is not written yet: the event is
#: not recorded and the webhook answers 503, so Stripe sends it again (issue #1723).
_RETRY = "retry"


async def _by_subscription_id(
    session: AsyncSession, stripe_subscription_id: str
) -> AppSubscription | None:
    # Row lock: a concurrent pair of events for one subscription waits here instead of
    # both inserting the same stripe_subscription_id (issue #1723 item 3).
    subscription: AppSubscription | None = await session.scalar(
        select(AppSubscription)
        .where(AppSubscription.stripe_subscription_id == stripe_subscription_id)
        .with_for_update()
    )
    return subscription


async def _by_app_subscription_id(
    session: AsyncSession, obj: Mapping[str, Any]
) -> AppSubscription | None:
    """The row named in our metadata (``app_subscription_id``), or the checkout's
    ``client_reference_id``, which is the same id. Locked like ``_by_subscription_id``."""
    raw = _text(_metadata(obj).get("app_subscription_id")) or _text(
        obj.get("client_reference_id")
    )
    if raw is None:
        return None
    try:
        subscription_id = uuid.UUID(raw)
    except ValueError:
        return None
    subscription: AppSubscription | None = await session.scalar(
        select(AppSubscription)
        .where(AppSubscription.id == subscription_id)
        .with_for_update()
    )
    return subscription


def _names_our_row(obj: Mapping[str, Any]) -> bool:
    """True when the object carries our ``app_subscription_id`` metadata, on the object
    itself or on an invoice's ``subscription_details``. Such an event belongs to a row
    we should have, so a missing row means "not written yet", not "not ours".
    ``client_reference_id`` is not enough: the invoicing-era checkout puts a user id
    there."""
    if _text(_metadata(obj).get("app_subscription_id")) is not None:
        return True
    details = obj.get("subscription_details")
    if isinstance(details, dict):
        return _text(_metadata(details).get("app_subscription_id")) is not None
    return False


def _is_stale(subscription: AppSubscription, event_time: datetime) -> bool:
    """An event strictly older than the newest applied one is stale. A same-second
    event is not stale: Stripe's times are whole seconds, and a subscription's created
    and updated events often share one. Same-second events apply in delivery order;
    the transition table refuses a backward move (a canceled row stays canceled) and a
    repeat of the same status is a no-op."""
    return (
        subscription.last_event_at is not None
        and event_time < subscription.last_event_at
    )


#: A Stripe event that names one of our rows but finds no row is answered 503 (Stripe
#: retries) only this long after Stripe created it. Later than that, the row is in
#: another environment or was never written, so the event is recorded and ignored.
_RETRY_WINDOW = timedelta(hours=2)


def _past_retry_window(event: WebhookEventResult) -> bool:
    """True when the event is too old to wait for its row (or its age is unknown)."""
    if not event.created:
        return True
    created = _from_unix(event.created)
    return datetime.now(UTC).replace(tzinfo=None) - created > _RETRY_WINDOW


def _move(subscription: AppSubscription, target: AppSubscriptionStatus) -> None:
    """Apply a status report; a refused move is logged, never raised to Stripe."""
    try:
        move_app_subscription(subscription, target)
    except AppSubscriptionStateError:
        logger.info(
            "app subscription status report ignored",
            extra={
                "organisation_id": subscription.organisation_id,
                "target_id": str(subscription.id),
            },
        )


async def _checkout_completed(session: AsyncSession, obj: Mapping[str, Any]) -> str:
    """Link the Stripe subscription and customer to our row. Status comes from the
    subscription events, so this does not move ``last_event_at`` (Stripe may send
    the subscription's own event with an earlier timestamp)."""
    subscription = await _by_app_subscription_id(session, obj)
    if subscription is None:
        return _RETRY if _names_our_row(obj) else "ignored"
    stripe_subscription_id = _text(obj.get("subscription"))
    if stripe_subscription_id and subscription.stripe_subscription_id is None:
        subscription.stripe_subscription_id = stripe_subscription_id
    stripe_customer_id = _text(obj.get("customer"))
    if stripe_customer_id:
        customer = await session.scalar(
            select(Customer).where(
                Customer.organisation_id == subscription.organisation_id
            )
        )
        if customer is not None and customer.stripe_customer_id is None:
            customer.stripe_customer_id = stripe_customer_id
    return "applied"


async def _checkout_expired(
    session: AsyncSession, obj: Mapping[str, Any], event_time: datetime
) -> str:
    subscription = await _by_app_subscription_id(session, obj)
    if subscription is None:
        return _RETRY if _names_our_row(obj) else "ignored"
    if _is_stale(subscription, event_time):
        return "ignored"
    if subscription.stripe_subscription_id is None:
        _move(subscription, _CANCELED)
    subscription.last_event_at = event_time
    return "applied"


async def _subscription_event(
    session: AsyncSession,
    obj: Mapping[str, Any],
    event_time: datetime,
    *,
    deleted: bool,
) -> str:
    stripe_subscription_id = _text(obj.get("id"))
    subscription = (
        await _by_subscription_id(session, stripe_subscription_id)
        if stripe_subscription_id
        else None
    )
    if subscription is None:
        subscription = await _by_app_subscription_id(session, obj)
    if subscription is None:
        return _RETRY if _names_our_row(obj) else "ignored"
    if _is_stale(subscription, event_time):
        return "ignored"
    if subscription.stripe_subscription_id is None and stripe_subscription_id:
        subscription.stripe_subscription_id = stripe_subscription_id

    if deleted:
        _move(subscription, _CANCELED)
    else:
        target = STRIPE_STATUS.get(_text(obj.get("status")) or "")
        if target is None:
            logger.info(
                "app subscription status not used; stored status kept",
                extra={"target_id": str(subscription.id)},
            )
        else:
            _move(subscription, target)
    period_end = _optional_time(_period_end(obj))
    if period_end is not None:
        subscription.current_period_end = period_end
    subscription.cancel_at_period_end = bool(obj.get("cancel_at_period_end"))
    subscription.trial_end = _optional_time(obj.get("trial_end"))
    subscription.last_event_at = event_time
    return "applied"


async def _invoice_payment_failed(
    session: AsyncSession, obj: Mapping[str, Any], event_time: datetime
) -> str:
    stripe_subscription_id = _text(obj.get("subscription"))
    if stripe_subscription_id is None:
        return "ignored"
    subscription = await _by_subscription_id(session, stripe_subscription_id)
    if subscription is None:
        return _RETRY if _names_our_row(obj) else "ignored"
    if _is_stale(subscription, event_time):
        return "ignored"
    _move(subscription, _PAST_DUE)
    subscription.last_event_at = event_time
    return "applied"


async def _apply_event(
    session: AsyncSession, event: WebhookEventResult, obj: Mapping[str, Any]
) -> str:
    event_time = _from_unix(event.created) if event.created else None
    if event.type == "checkout.session.completed":
        return await _checkout_completed(session, obj)
    if event.type == "checkout.session.expired" and event_time is not None:
        return await _checkout_expired(session, obj, event_time)
    if event.type in _SUBSCRIPTION_EVENTS and event_time is not None:
        return await _subscription_event(
            session,
            obj,
            event_time,
            deleted=event.type == "customer.subscription.deleted",
        )
    if event.type == "invoice.payment_failed" and event_time is not None:
        return await _invoice_payment_failed(session, obj, event_time)
    logger.info(
        "Stripe event type not used by app subscriptions",
        extra={"stripe_event_type": event.type},
    )
    return "ignored"


async def apply_stripe_event(session: AsyncSession, event: WebhookEventResult) -> str:
    """Apply one verified Stripe event exactly once.

    The gateway (``construct_webhook_event``) has already checked the event's mode
    against the billing mode, so a refused event never gets here.

    The event id is inserted first (ON CONFLICT DO NOTHING) inside a savepoint, so a
    repeat delivery finds it and changes nothing. An event whose row is not written yet
    returns ``retry``: the savepoint is rolled back, the id is not kept, and the caller
    answers 503 so Stripe sends it again (issue #1723). Returns ``duplicate``,
    ``applied`` or ``ignored``."""
    obj = event.data_object
    async with session.begin_nested():
        recorded = await session.scalar(
            pg_insert(StripeEvent)
            .values(
                event_id=event.id, received_at=datetime.now(UTC).replace(tzinfo=None)
            )
            .on_conflict_do_nothing(index_elements=["event_id"])
            .returning(StripeEvent.event_id)
        )
        if recorded is None:
            logger.info(
                "Stripe event already applied",
                extra={"stripe_event_type": event.type},
            )
            return "duplicate"

        result = await _apply_event(session, event, obj)
        if result == _RETRY and _past_retry_window(event):
            logger.warning(
                "Stripe event names a subscription row that does not exist and is too "
                "old to wait for; recorded and ignored",
                extra={"stripe_event_type": event.type},
            )
            result = "ignored"
        if result == _RETRY:
            logger.info(
                "Stripe event waits for its subscription row; Stripe will retry",
                extra={"stripe_event_type": event.type},
            )
            # Raising rolls the savepoint back, so the id insert above is undone too.
            raise AppSubscriptionNotYetWrittenError()
    return result
