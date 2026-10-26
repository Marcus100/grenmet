"""GMS staff notifications: the eight owner-approved events and who hears them.

Decisions of 2026-10-23: forecast overdue, review requested, warning issued,
updated or cancelled, warning expiring, hourly observation missing, send failed,
query on your record and a new National Hurricane Center product. Each goes to
the bell and by email; every person chooses per event (``notification_preference``).
Urgent events (forecast overdue, warning changed, send failed) always reach the bell.

Recipients are never hard-coded. The Met duty roster (published or closed
``hr.roster_period`` of a GMS department) says who is on shift now; when it
names nobody who qualifies, holders of the relevant permission hear instead.
Domain code (CAP) calls the helpers here inside its own transaction; the
time-based events are swept by ``gms_sweeps`` from an ARQ cron.
"""

import uuid
from collections.abc import Collection
from datetime import UTC, datetime, time, timedelta
from urllib.parse import quote

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.models import Permission, Role, RolePermissionLink, User
from src.baseline.department import GMS_DEPARTMENT_IDS
from src.hr.models import EmploymentRecord, EmploymentStatus
from src.hr.roster.models import (
    RosterAssignment,
    RosterPeriod,
    RosterPeriodStatus,
    ShiftCatalog,
    ShiftCategory,
)
from src.utils.timezones import GRENADA
from src.wxwatch.config import wxwatch_settings

from . import events
from . import service as notification_service
from .events import EventDef

FORECAST_OVERDUE = "gms.forecast_overdue"
REVIEW_REQUESTED = "gms.review_requested"
WARNING_CHANGED = "gms.warning_changed"
WARNING_EXPIRING = "gms.warning_expiring"
OBSERVATION_MISSING = "gms.observation_missing"
SEND_FAILED = "gms.send_failed"
RECORD_QUERY = "gms.record_query"
NHC_PRODUCT = "gms.nhc_product"

# Permissions that make someone a recipient (on duty first, else every holder).
REGISTER_REVIEW_PERMISSIONS = ("eregister.qc", "eregister.send")
OBSERVER_PERMISSIONS = ("eregister.observe",)
SENDER_PERMISSIONS = ("eregister.send", "cap.alert.publish", "cap.integrations.manage")
CAP_DUTY_PERMISSIONS = ("cap.alert.publish", "cap.alert.publish_emergency")

_AUDIENCE = "{} by default; each person chooses the bell and email in their profile"


def register() -> None:
    for event in (
        EventDef(
            key=FORECAST_OVERDUE,
            label="Forecast overdue",
            description="A scheduled forecast was not issued 15 minutes after its issue time.",
            audience=_AUDIENCE.format("The forecasters on duty"),
            title="{{ product }} forecast is overdue",
            body="The {{ product }} forecast was due at {{ due }} and has not been issued.",
            variables=("product", "due"),
            urgent=True,
        ),
        EventDef(
            key=REVIEW_REQUESTED,
            label="Review requested",
            description="A warning was submitted for review, or a register record awaits an optional review.",
            audience=_AUDIENCE.format("Reviewers (warning approvers, register staff)"),
            title="Review requested: {{ subject }}",
            body="{{ detail }}",
            variables=("subject", "detail"),
            grouped=True,
        ),
        EventDef(
            key=WARNING_CHANGED,
            label="Warning issued, updated or cancelled",
            description="A weather warning was published, replaced by an update, or cancelled.",
            audience=_AUDIENCE.format("All GMS staff"),
            title="Warning {{ action }}: {{ headline }}",
            body="{{ identifier }} was {{ action }}.",
            variables=("action", "headline", "identifier"),
            urgent=True,
        ),
        EventDef(
            key=WARNING_EXPIRING,
            label="Warning expiring",
            description="A published warning expires within an hour and has not been updated.",
            audience=_AUDIENCE.format("The staff on duty and the warning's author"),
            title="Warning expires soon: {{ headline }}",
            body="{{ identifier }} expires at {{ expires }} and has not been updated or replaced.",
            variables=("headline", "identifier", "expires"),
        ),
        EventDef(
            key=OBSERVATION_MISSING,
            label="Hourly observation missing",
            description="No observation was recorded in the register 15 minutes after the hour.",
            audience=_AUDIENCE.format(
                "The observer on duty; with no roster or nobody on shift, all register staff who record observations"
            ),
            title="Observation missing for {{ hour }}",
            body="No observation for station {{ station }} at {{ hour }} has been recorded.",
            variables=("station", "hour"),
            grouped=True,
        ),
        EventDef(
            key=SEND_FAILED,
            label="Send failed",
            description="A WIS2 publication, an email or a warning delivery used every attempt and failed.",
            audience=_AUDIENCE.format(
                "The staff on duty who can send, and administrators"
            ),
            title="Send failed: {{ what }}",
            body="{{ detail }} Check the sending history and retry.",
            variables=("what", "detail"),
            urgent=True,
            grouped=True,
        ),
        EventDef(
            key=RECORD_QUERY,
            label="Query on your record",
            description="A reviewer asked a question about an observation you recorded.",
            audience=_AUDIENCE.format("The observer who recorded the observation"),
            title="A reviewer has a query on your observation",
            body="Station {{ station }}, {{ hour }}. Open the register to read it and respond.",
            variables=("station", "hour"),
        ),
        EventDef(
            key=NHC_PRODUCT,
            label="New National Hurricane Center product",
            description="A new National Hurricane Center product was collected into the archive.",
            audience=_AUDIENCE.format("All GMS staff"),
            title="New National Hurricane Center product",
            body="{{ product }} was collected.",
            variables=("product",),
            grouped=True,
        ),
    ):
        events.register(event)


# ── Recipients ───────────────────────────────────────────────────────────────


def organisation_id() -> str:
    """The organisation whose settings and roles choose GMS recipients."""
    return wxwatch_settings.ALERT_ORGANISATION_ID


async def gms_staff(session: AsyncSession) -> set[uuid.UUID]:
    """Active staff of a GMS department."""
    rows = await session.execute(
        select(EmploymentRecord.user_id)
        .join(User, User.id == EmploymentRecord.user_id)
        .where(
            EmploymentRecord.status == EmploymentStatus.ACTIVE,
            EmploymentRecord.department_id.in_(GMS_DEPARTMENT_IDS),
            User.is_active.is_(True),
        )
    )
    return set(rows.scalars().all())


async def permission_holders(
    session: AsyncSession, permission_keys: Collection[str]
) -> set[uuid.UUID]:
    """Active holders (in the GMS organisation) of a role that grants any of the keys."""
    names = (
        (
            await session.execute(
                select(Role.name)
                .join(RolePermissionLink, RolePermissionLink.role_id == Role.id)
                .join(Permission, Permission.id == RolePermissionLink.permission_id)
                .where(Permission.key.in_(list(permission_keys)))
            )
        )
        .scalars()
        .all()
    )
    return await notification_service.users_with_roles(
        session,
        set(names),
        organisation_id=organisation_id(),
        department_ids=GMS_DEPARTMENT_IDS,
    )


def alert_link(identifier: str) -> str:
    """Portal path of a warning; identifiers may hold reserved URL characters."""
    return f"/cap/alerts/{quote(identifier, safe='')}"


def _clock(value: str | None) -> time | None:
    if not value:
        return None
    try:
        hour, minute = value.split(":")[:2]
        return time(int(hour), int(minute))
    except ValueError:
        return None


def _on_shift(shift: ShiftCatalog, day: datetime, now: datetime) -> bool:
    """Whether ``shift`` worked on ``day`` (local midnight) covers ``now``."""
    start, end = _clock(shift.start_time), _clock(shift.end_time)
    if start is None or end is None:
        # A work shift with no printed hours covers its whole day.
        return day <= now < day + timedelta(days=1)
    began = day.replace(hour=start.hour, minute=start.minute)
    ended = day.replace(hour=end.hour, minute=end.minute)
    if shift.ends_next_day or ended <= began:
        ended += timedelta(days=1)
    return began <= now < ended


async def duty_roster(
    session: AsyncSession, now: datetime | None = None
) -> tuple[set[uuid.UUID], bool]:
    """Who the published GMS roster has on shift now, and whether it covers today.

    The second value is False when no published roster row exists for today, so
    callers can tell "nobody is on shift" from "no roster was entered".
    """
    moment = (now or datetime.now(UTC)).astimezone(GRENADA)
    today = moment.date()
    rows = await session.execute(
        select(RosterAssignment.user_id, RosterAssignment.assignment_date, ShiftCatalog)
        .join(RosterPeriod, RosterPeriod.id == RosterAssignment.roster_period_id)
        .join(ShiftCatalog, ShiftCatalog.code == RosterAssignment.shift_code)
        .where(
            RosterPeriod.department_id.in_(GMS_DEPARTMENT_IDS),
            RosterPeriod.status.in_(
                (RosterPeriodStatus.PUBLISHED, RosterPeriodStatus.CLOSED)
            ),
            RosterAssignment.assignment_date.in_((today - timedelta(days=1), today)),
        )
    )
    on_duty: set[uuid.UUID] = set()
    covered = False
    for user_id, assignment_date, shift in rows.all():
        if assignment_date == today:
            covered = True
        if shift.category != ShiftCategory.WORK:
            continue
        day = datetime.combine(assignment_date, time(0), tzinfo=GRENADA)
        if _on_shift(shift, day, moment):
            on_duty.add(user_id)
    return on_duty, covered


async def duty_or_holders(
    session: AsyncSession,
    permission_keys: Collection[str],
    *,
    now: datetime | None = None,
) -> set[uuid.UUID]:
    """The qualified people on shift now, else every qualified holder.

    Owner decision 2026-10-24: when no roster covers today, or it names nobody
    qualified on shift, every holder hears, so nothing is missed unseen.
    """
    holders = await permission_holders(session, permission_keys)
    on_duty, _covered = await duty_roster(session, now)
    return (holders & on_duty) or holders


async def duty_forecasters(
    session: AsyncSession, kind: str, *, now: datetime | None = None
) -> set[uuid.UUID]:
    """Forecasters allowed to author ``kind``, on shift if the roster says, else all."""
    from src.baseline import product_access

    staff = await gms_staff(session)
    allowed = await product_access.users_who_may_author(session, kind, staff)
    # Nobody may author this kind: do not page every GMS employee. Ask the
    # people who already hear other GMS events (senior forecasters, approvers).
    candidates = allowed or await permission_holders(
        session, (*REGISTER_REVIEW_PERMISSIONS, "cap.alert.approve")
    )
    on_duty, _covered = await duty_roster(session, now)
    return (candidates & on_duty) or candidates


# ── Delivery ─────────────────────────────────────────────────────────────────


async def tell(
    session: AsyncSession,
    event_key: str,
    recipients: Collection[uuid.UUID],
    context: dict[str, object],
    *,
    link_path: str | None,
    entity_type: str | None = None,
    entity_id: str | None = None,
    dedupe_key: str | None = None,
    exclude: Collection[uuid.UUID] = (),
    group_key: str | None = None,
) -> int:
    """Queue a GMS event in the caller's transaction (the caller commits)."""
    if not recipients:
        return 0
    return await notification_service.notify(
        session,
        event_key=event_key,
        organisation_id=organisation_id(),
        recipients=recipients,
        context=context,
        link_path=link_path,
        entity_type=entity_type,
        entity_id=entity_id,
        dedupe_key=dedupe_key,
        exclude=exclude,
        group_key=group_key,
    )
