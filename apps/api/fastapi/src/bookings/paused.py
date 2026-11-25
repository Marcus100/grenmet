"""The paused state of a Bookings business (ADR-0066 item 6, slice 4a).

Paused is ``BookingProfile.paused_at``, not ``enabled = false``: customers keep their
links to bookings they already made. While ``BOOKINGS_ACCESS_FOLLOWS_SUBSCRIPTION`` is
on, a business whose ``bookings`` grant source is ``trial`` or ``subscription`` is
paused once all of these hold:

- no trial is left (``billing.app_subscription_trial.trial_ends_at`` has passed, or the
  business has no dated trial);
- no app subscription is ``active`` or ``past_due``;
- the 7-day grace has run out. The grace clock starts at the latest of the trial end and
  the end of its last subscription (``current_period_end``, else the row's last update).
  A business with neither starts it when its grant was created.

The pause clears when a subscription is active or past due again, when staff set the
grant to ``manual`` (or turn it off), or when the switch is off. ``manual`` grants never
pause. ``should_pause`` is pure; ``evaluate_organisation`` and ``evaluate_all`` apply it
and write one audit entry per change. Triggers: the daily worker job
``evaluate_paused_businesses`` and the app-subscription webhook. Commits are the
caller's. The bundled Contacts grant is not touched: nothing about Contacts reads
``paused_at``.
"""

from collections.abc import Sequence
from datetime import datetime, timedelta

from sqlalchemy import ColumnElement, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.audit import service as audit_service
from src.billing.models import (
    AppSubscription,
    AppSubscriptionStatus,
    AppSubscriptionTrial,
    Plan,
)
from src.organisations.models import EntitlementSource, OrganisationApp
from src.utils.datetime import utc_now

from .config import bookings_settings
from .models import BookingProfile

APP_KEY = "bookings"
#: How long a business keeps booking after its trial or subscription ended (owner rule).
GRACE = timedelta(days=7)
AUDIT_ENTITY = "booking_profile"
_PAUSABLE_SOURCES = (
    EntitlementSource.TRIAL.value,
    EntitlementSource.SUBSCRIPTION.value,
)
_PAYING = (
    AppSubscriptionStatus.ACTIVE.value,
    AppSubscriptionStatus.PAST_DUE.value,
)


def should_pause(
    *,
    switch_on: bool,
    grant_enabled: bool,
    source: str,
    now: datetime,
    trial_ends_at: datetime | None,
    grant_created_at: datetime,
    has_paying_subscription: bool,
    subscription_ended_at: datetime | None,
) -> bool:
    """The decision, with no database."""
    if not switch_on or not grant_enabled or source not in _PAUSABLE_SOURCES:
        return False
    if has_paying_subscription:
        return False
    if trial_ends_at is not None and trial_ends_at > now:
        return False
    anchors = [t for t in (trial_ends_at, subscription_ended_at) if t is not None]
    started = max(anchors) if anchors else grant_created_at
    return now >= started + GRACE


async def _facts(
    session: AsyncSession, organisation_id: str
) -> tuple[datetime | None, bool, datetime | None]:
    """``(trial_ends_at, has_paying_subscription, subscription_ended_at)`` in SQL."""
    trial_ends_at = await session.scalar(
        select(func.max(AppSubscriptionTrial.trial_ends_at))
        .join(Plan, Plan.key == AppSubscriptionTrial.plan_key)
        .where(
            AppSubscriptionTrial.organisation_id == organisation_id,
            Plan.app_key == APP_KEY,
        )
    )
    paying = await session.scalar(
        select(AppSubscription.id)
        .where(
            AppSubscription.organisation_id == organisation_id,
            AppSubscription.app_key == APP_KEY,
            AppSubscription.status.in_(_PAYING),
        )
        .limit(1)
    )
    # An incomplete checkout never ran, so it has no end; canceled and unpaid rows do.
    ended_at = await session.scalar(
        select(
            func.max(
                func.coalesce(
                    AppSubscription.current_period_end, AppSubscription.updated_at
                )
            )
        ).where(
            AppSubscription.organisation_id == organisation_id,
            AppSubscription.app_key == APP_KEY,
            AppSubscription.status.in_(
                (
                    AppSubscriptionStatus.CANCELED.value,
                    AppSubscriptionStatus.UNPAID.value,
                )
            ),
        )
    )
    return trial_ends_at, paying is not None, ended_at


async def evaluate_organisation(
    session: AsyncSession, organisation_id: str, *, now: datetime | None = None
) -> bool | None:
    """Set or clear ``paused_at`` for one business. Returns whether it is paused
    afterwards, or None when it has no bookings profile. Flushes; the caller commits."""
    moment = now or utc_now()
    # A status change made in this transaction must be visible to the queries below.
    await session.flush()
    profile = await session.scalar(
        select(BookingProfile)
        .where(BookingProfile.organisation_id == organisation_id)
        .with_for_update()
    )
    if profile is None:
        return None
    grant = await session.get(OrganisationApp, (organisation_id, APP_KEY))
    switch_on = bookings_settings.ACCESS_FOLLOWS_SUBSCRIPTION
    if grant is None:
        paused = False
    else:
        trial_ends_at, paying, ended_at = await _facts(session, organisation_id)
        paused = should_pause(
            switch_on=switch_on,
            grant_enabled=grant.enabled,
            source=grant.source,
            now=moment,
            trial_ends_at=trial_ends_at,
            grant_created_at=grant.created_at,
            has_paying_subscription=paying,
            subscription_ended_at=ended_at,
        )
    if paused and profile.paused_at is None:
        await _write(session, profile, moment, "paused")
    elif not paused and profile.paused_at is not None:
        await _write(session, profile, None, "unpaused")
    return paused


async def _write(
    session: AsyncSession,
    profile: BookingProfile,
    value: datetime | None,
    action: str,
) -> None:
    before = profile.paused_at
    profile.paused_at = value
    await session.flush()
    await audit_service.record_change(
        session,
        entity_type=AUDIT_ENTITY,
        entity_id=str(profile.id),
        record_type=AUDIT_ENTITY,
        record_id=str(profile.id),
        action=action,
        changes={
            "paused_at": (
                before.isoformat() if before else None,
                value.isoformat() if value else None,
            )
        },
        organisation_id=profile.organisation_id,
    )


async def _candidates(session: AsyncSession) -> Sequence[str]:
    """Businesses worth looking at: trial or subscription grants while the switch is on,
    and every paused business (so a switch turned off, or a grant set to ``manual``,
    clears it). Filtered in SQL."""
    condition: ColumnElement[bool] = BookingProfile.paused_at.is_not(None)
    if bookings_settings.ACCESS_FOLLOWS_SUBSCRIPTION:
        pausable = (
            select(OrganisationApp.organisation_id)
            .where(
                OrganisationApp.organisation_id == BookingProfile.organisation_id,
                OrganisationApp.app_key == APP_KEY,
                OrganisationApp.source.in_(_PAUSABLE_SOURCES),
            )
            .exists()
        )
        condition = or_(condition, pausable)
    rows = await session.scalars(
        select(BookingProfile.organisation_id)
        .where(condition)
        .order_by(BookingProfile.organisation_id)
    )
    return rows.all()


async def evaluate_all(session: AsyncSession, *, now: datetime | None = None) -> int:
    """Evaluate every candidate business; returns how many changed state. Idempotent."""
    moment = now or utc_now()
    changed = 0
    for organisation_id in await _candidates(session):
        before = await session.scalar(
            select(BookingProfile.paused_at).where(
                BookingProfile.organisation_id == organisation_id
            )
        )
        after = await evaluate_organisation(session, organisation_id, now=moment)
        if after is not None and (before is not None) != after:
            changed += 1
    return changed
