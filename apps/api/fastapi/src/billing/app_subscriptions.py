"""Barrels app subscriptions (ADR-0065): Barrels sells its own app plans.

Test mode only until the owner decides otherwise (ADR-0027). This module creates
subscription checkouts and applies Stripe's subscription reports. It changes no
entitlement: an organisation's app access is still set by the organisation routes.

Service functions flush and never commit; the router commits.
"""

import logging
import uuid
from collections.abc import Mapping
from datetime import UTC, datetime
from typing import Any

from fastapi.concurrency import run_in_threadpool
from sqlalchemy import and_, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from src.audit import service as audit_service
from src.auth.models import User

from .app_subscription_transitions import move_app_subscription
from .config import billing_settings
from .exceptions import (
    AppSubscriptionAlreadyExistsError,
    AppSubscriptionPlanNotFoundError,
    AppSubscriptionPriceNotConfiguredError,
    AppSubscriptionPriceNotFoundError,
    AppSubscriptionStateError,
)
from .gateway import CheckoutSessionResult, StripeGateway, WebhookEventResult
from .models import (
    LIVE_APP_SUBSCRIPTION_STATUSES,
    AppSubscription,
    AppSubscriptionChannel,
    AppSubscriptionStatus,
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


async def start_checkout(
    session: AsyncSession,
    *,
    gateway: StripeGateway,
    organisation_id: str,
    user: User,
    payload: AppSubscriptionCheckoutCreate,
) -> AppSubscriptionCheckoutPublic:
    """Create the pending subscription row and its hosted Checkout Session.

    Every refusal (unknown plan, no price, no Stripe price id, a live subscription
    already) happens before the provider is called. The billing customer row (if
    new) is flushed before the call and the subscription row after it. If the call
    fails the router does not commit, so neither row is kept."""
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
        select(AppSubscription.id)
        .where(
            AppSubscription.organisation_id == organisation_id,
            AppSubscription.app_key == plan.app_key,
            AppSubscription.status.in_(LIVE_APP_SUBSCRIPTION_STATUSES),
        )
        .limit(1)
    )
    if live is not None:
        raise AppSubscriptionAlreadyExistsError()

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
    checkout: CheckoutSessionResult = await run_in_threadpool(
        gateway.create_app_subscription_checkout,
        subscription_id=str(subscription_id),
        organisation_id=organisation_id,
        plan_key=plan.key,
        app_key=plan.app_key,
        price_id=price_id,
        customer_id=customer.stripe_customer_id,
        customer_email=None if customer.stripe_customer_id else customer.billing_email,
        trial_period_days=billing_settings.APP_TRIAL_DAYS.get(plan.key) or None,
    )

    subscription = AppSubscription(
        id=subscription_id,
        organisation_id=organisation_id,
        plan_key=plan.key,
        app_key=plan.app_key,
        channel=AppSubscriptionChannel.STRIPE.value,
        currency=payload.currency,
        status=_INCOMPLETE.value,
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


async def _by_subscription_id(
    session: AsyncSession, stripe_subscription_id: str
) -> AppSubscription | None:
    subscription: AppSubscription | None = await session.scalar(
        select(AppSubscription).where(
            AppSubscription.stripe_subscription_id == stripe_subscription_id
        )
    )
    return subscription


async def _by_app_subscription_id(
    session: AsyncSession, obj: Mapping[str, Any]
) -> AppSubscription | None:
    """The row named in our metadata (``app_subscription_id``), or the checkout's
    ``client_reference_id``, which is the same id."""
    raw = _text(_metadata(obj).get("app_subscription_id")) or _text(
        obj.get("client_reference_id")
    )
    if raw is None:
        return None
    try:
        subscription_id = uuid.UUID(raw)
    except ValueError:
        return None
    subscription: AppSubscription | None = await session.get(
        AppSubscription, subscription_id
    )
    return subscription


def _is_stale(subscription: AppSubscription, event_time: datetime) -> bool:
    return (
        subscription.last_event_at is not None
        and event_time < subscription.last_event_at
    )


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
        return "ignored"
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
    if subscription is None or _is_stale(subscription, event_time):
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
    if subscription is None or _is_stale(subscription, event_time):
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
    if subscription is None or _is_stale(subscription, event_time):
        return "ignored"
    _move(subscription, _PAST_DUE)
    subscription.last_event_at = event_time
    return "applied"


async def apply_stripe_event(session: AsyncSession, event: WebhookEventResult) -> str:
    """Apply one verified Stripe event exactly once.

    The event id is inserted first (ON CONFLICT DO NOTHING) in the caller's
    transaction, so a repeat delivery finds it and changes nothing, and a failure
    leaves no id behind to suppress a retry. Returns ``duplicate``, ``applied`` or
    ``ignored``."""
    recorded = await session.scalar(
        pg_insert(StripeEvent)
        .values(event_id=event.id, received_at=datetime.now(UTC).replace(tzinfo=None))
        .on_conflict_do_nothing(index_elements=["event_id"])
        .returning(StripeEvent.event_id)
    )
    if recorded is None:
        logger.info(
            "Stripe event already applied", extra={"stripe_event_type": event.type}
        )
        return "duplicate"

    obj = event.data_object
    event_time = _from_unix(event.created) if event.created else None
    result = "ignored"
    if event.type == "checkout.session.completed":
        result = await _checkout_completed(session, obj)
    elif event.type == "checkout.session.expired" and event_time is not None:
        result = await _checkout_expired(session, obj, event_time)
    elif event.type in _SUBSCRIPTION_EVENTS and event_time is not None:
        result = await _subscription_event(
            session,
            obj,
            event_time,
            deleted=event.type == "customer.subscription.deleted",
        )
    elif event.type == "invoice.payment_failed" and event_time is not None:
        result = await _invoice_payment_failed(session, obj, event_time)
    else:
        logger.info(
            "Stripe event type not used by app subscriptions",
            extra={"stripe_event_type": event.type},
        )
    return result
