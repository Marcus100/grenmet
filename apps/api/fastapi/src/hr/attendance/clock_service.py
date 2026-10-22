"""Token-based clock-in that feeds the existing attendance journey.

A phone punch is not attendance until a supervisor approves it (ADR-0040): a scan
stores a pending ``ClockPunch`` and ``punch_service`` writes the attendance record
on approval, through ``save_attendance``. The site token only proves presence at
a department's clock point.
"""

import hashlib
import secrets
import uuid
from datetime import UTC, date, datetime, timedelta

from sqlalchemy import exists, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from src.audit import service as audit_service
from src.auth.models import User
from src.auth.policy import require_permission
from src.exceptions import AppException
from src.hr.models import EmploymentRecord
from src.hr.roster.models import (
    RosterAssignment,
    RosterPeriod,
    RosterPeriodStatus,
    ShiftCatalog,
    ShiftCategory,
)
from src.hr.roster.service import require_roster_manage_scope
from src.utils.datetime import utc_now
from src.utils.timezones import GRENADA

from .models import (
    AttendanceRecord,
    ClockPunch,
    ClockPunchKind,
    ClockPunchStatus,
    ClockSite,
)
from .service import scheduled_bounds

EARLY_WINDOW = timedelta(hours=2)
LATE_WINDOW = timedelta(hours=1)
DOUBLE_SCAN = timedelta(seconds=60)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def new_token() -> str:
    return secrets.token_urlsafe(24)


def _aware(value: datetime) -> datetime:
    return value.replace(tzinfo=UTC)


async def _site_for_manage(
    session: AsyncSession, current_user: User, site_id: uuid.UUID
) -> ClockSite:
    site = await session.get(ClockSite, site_id)
    if site is None:
        raise AppException("Clock site not found", 404)
    await require_roster_manage_scope(session, current_user, site.department_id)
    return site


async def create_site(
    *,
    session: AsyncSession,
    current_user: User,
    department_id: str,
    name: str,
) -> tuple[ClockSite, str]:
    require_permission(current_user=current_user, permission_key="roster.manage")
    await require_roster_manage_scope(session, current_user, department_id)
    audit_service.set_actor(session, current_user.id)
    token = new_token()
    site = ClockSite(
        department_id=department_id,
        name=name.strip(),
        token_hash=hash_token(token),
        created_by_user_id=current_user.id,
    )
    session.add(site)
    await session.commit()
    await session.refresh(site)
    return site, token


async def list_sites(
    *, session: AsyncSession, current_user: User, department_id: str
) -> list[ClockSite]:
    require_permission(current_user=current_user, permission_key="roster.manage")
    await require_roster_manage_scope(session, current_user, department_id)
    result = await session.execute(
        select(ClockSite)
        .where(ClockSite.department_id == department_id)
        .order_by(ClockSite.name)
    )
    return list(result.scalars().all())


async def rotate_site(
    *, session: AsyncSession, current_user: User, site_id: uuid.UUID
) -> tuple[ClockSite, str]:
    require_permission(current_user=current_user, permission_key="roster.manage")
    site = await _site_for_manage(session, current_user, site_id)
    audit_service.set_actor(session, current_user.id)
    token = new_token()
    site.token_hash = hash_token(token)
    site.updated_at = utc_now()
    await session.commit()
    await session.refresh(site)
    return site, token


async def set_site_active(
    *, session: AsyncSession, current_user: User, site_id: uuid.UUID, active: bool
) -> ClockSite:
    require_permission(current_user=current_user, permission_key="roster.manage")
    site = await _site_for_manage(session, current_user, site_id)
    audit_service.set_actor(session, current_user.id)
    site.is_active = active
    site.updated_at = utc_now()
    await session.commit()
    await session.refresh(site)
    return site


async def _open_record(
    session: AsyncSession, user_id: uuid.UUID, now: datetime
) -> AttendanceRecord | None:
    result = await session.execute(
        select(AttendanceRecord)
        .where(
            AttendanceRecord.user_id == user_id,
            AttendanceRecord.departed_at.is_(None),
            AttendanceRecord.arrived_at >= now - timedelta(hours=24),
        )
        .order_by(AttendanceRecord.arrived_at.desc())
        .limit(1)
    )
    return result.scalars().first()


async def _current_assignment(
    session: AsyncSession, user_id: uuid.UUID, now: datetime
) -> tuple[RosterAssignment, ShiftCatalog] | None:
    """Rostered work shift to arrive at: the one starting closest to ``now`` among
    those whose window (two hours early to one hour after the end) contains it."""
    local: date = _aware(now).astimezone(GRENADA).date()
    rows = (
        await session.execute(
            select(RosterAssignment, ShiftCatalog)
            .join(RosterPeriod, RosterPeriod.id == RosterAssignment.roster_period_id)
            .join(ShiftCatalog, ShiftCatalog.code == RosterAssignment.shift_code)
            .outerjoin(
                AttendanceRecord,
                AttendanceRecord.roster_assignment_id == RosterAssignment.id,
            )
            .where(
                RosterAssignment.user_id == user_id,
                RosterAssignment.assignment_date >= local - timedelta(days=1),
                RosterAssignment.assignment_date <= local + timedelta(days=1),
                RosterPeriod.status == RosterPeriodStatus.PUBLISHED,
                ShiftCatalog.category == ShiftCategory.WORK,
                AttendanceRecord.id.is_(None),
                ~exists().where(
                    ClockPunch.roster_assignment_id == RosterAssignment.id,
                    ClockPunch.kind == ClockPunchKind.ARRIVE.value,
                    ClockPunch.status != ClockPunchStatus.REJECTED.value,
                ),
            )
        )
    ).all()
    best: tuple[timedelta, RosterAssignment, ShiftCatalog] | None = None
    for assignment, shift in rows:
        start, end = scheduled_bounds(assignment, shift)
        if start - EARLY_WINDOW <= now <= end + LATE_WINDOW:
            distance = abs(now - start)
            if best is None or distance < best[0]:
                best = (distance, assignment, shift)
    return None if best is None else (best[1], best[2])


def _minutes(delta: timedelta) -> int:
    return max(0, int(delta.total_seconds() // 60))


async def _latest_live_punch(
    session: AsyncSession, user_id: uuid.UUID, now: datetime
) -> ClockPunch | None:
    return (
        (
            await session.execute(
                select(ClockPunch)
                .where(
                    ClockPunch.user_id == user_id,
                    ClockPunch.status != ClockPunchStatus.REJECTED.value,
                    ClockPunch.punched_at >= now - timedelta(hours=24),
                )
                .order_by(ClockPunch.punched_at.desc())
                .limit(1)
            )
        )
        .scalars()
        .first()
    )


async def _assignment_and_shift(
    session: AsyncSession, assignment_id: uuid.UUID
) -> tuple[RosterAssignment, ShiftCatalog]:
    row = (
        await session.execute(
            select(RosterAssignment, ShiftCatalog)
            .join(ShiftCatalog, ShiftCatalog.code == RosterAssignment.shift_code)
            .where(RosterAssignment.id == assignment_id)
        )
    ).one()
    return row[0], row[1]


async def _open_arrival(
    session: AsyncSession, user_id: uuid.UUID, now: datetime
) -> tuple[uuid.UUID, datetime] | None:
    """The shift this scan departs from: an arrival punch not yet closed, or a
    manually recorded open attendance with no departure punch against it."""
    last = await _latest_live_punch(session, user_id, now)
    if last is not None and last.kind == ClockPunchKind.ARRIVE.value:
        return last.roster_assignment_id, last.punched_at
    record = await _open_record(session, user_id, now)
    if record is None:
        return None
    closing = await session.scalar(
        select(ClockPunch.id).where(
            ClockPunch.roster_assignment_id == record.roster_assignment_id,
            ClockPunch.kind == ClockPunchKind.DEPART.value,
            ClockPunch.status != ClockPunchStatus.REJECTED.value,
        )
    )
    return None if closing else (record.roster_assignment_id, record.arrived_at)


async def clock(
    *,
    session: AsyncSession,
    current_user: User,
    token: str,
    now: datetime | None = None,
) -> tuple[str, ClockPunch, ClockSite, int, int, int, datetime | None]:
    """Record a pending arrival, or a pending departure when a shift is open.

    Returns (action, punch, site, late, early_departure, overtime, arrived_at).
    ``arrived_at`` is the arrival a departure closes (None for an arrival). ``now``
    is injectable for tests; production uses the server clock. Nothing here
    writes attendance: a supervisor's approval does.
    """
    require_permission(
        current_user=current_user, permission_key="timesheet.submit.self"
    )
    site = await session.scalar(
        select(ClockSite).where(ClockSite.token_hash == hash_token(token))
    )
    if site is None or not site.is_active:
        raise AppException("Clock-in code is not valid", 404)
    employment = await session.scalar(
        select(EmploymentRecord).where(EmploymentRecord.user_id == current_user.id)
    )
    if employment is None or employment.department_id != site.department_id:
        raise AppException("This clock point belongs to another department", 403)
    now = now or utc_now()

    last = await _latest_live_punch(session, current_user.id, now)
    if last is not None and now - last.punched_at < DOUBLE_SCAN:
        repeat = "DEPARTED" if last.kind == ClockPunchKind.DEPART.value else "ARRIVED"
        return repeat, last, site, 0, 0, 0, None  # repeat scan, no change

    open_arrival = await _open_arrival(session, current_user.id, now)
    if open_arrival is not None:
        assignment_id, arrived_at = open_arrival
        assignment, shift = await _assignment_and_shift(session, assignment_id)
        start, end = scheduled_bounds(assignment, shift)
        kind = ClockPunchKind.DEPART
        late, early, overtime = (
            _minutes(arrived_at - start),
            _minutes(end - now),
            _minutes(now - end),
        )
    else:
        found = await _current_assignment(session, current_user.id, now)
        if found is None:
            raise AppException("No rostered shift to clock in to at this time", 409)
        assignment, shift = found
        start, _ = scheduled_bounds(assignment, shift)
        kind = ClockPunchKind.ARRIVE
        arrived_at = None
        late, early, overtime = _minutes(now - start), 0, 0

    punch = ClockPunch(
        user_id=current_user.id,
        department_id=site.department_id,
        clock_site_id=site.id,
        roster_assignment_id=assignment.id,
        kind=kind.value,
        punched_at=now,
        status=ClockPunchStatus.PENDING.value,
    )
    audit_service.set_actor(session, current_user.id)
    assignment_id_value = assignment.id
    session.add(punch)
    try:
        await session.commit()
    except IntegrityError:
        # A concurrent scan won the race for this shift: return its punch.
        await session.rollback()
        existing = await session.scalar(
            select(ClockPunch).where(
                ClockPunch.roster_assignment_id == assignment_id_value,
                ClockPunch.kind == kind.value,
                ClockPunch.status != ClockPunchStatus.REJECTED.value,
            )
        )
        if existing is None:
            raise AppException("Clock punch conflict; try again", 409) from None
        await session.refresh(site)
        repeat = "DEPARTED" if kind == ClockPunchKind.DEPART else "ARRIVED"
        return repeat, existing, site, 0, 0, 0, arrived_at
    await session.refresh(punch)
    action = "DEPARTED" if kind == ClockPunchKind.DEPART else "ARRIVED"
    return action, punch, site, late, early, overtime, arrived_at


def provisional_attendance(
    punch: ClockPunch, arrived_at: datetime | None
) -> AttendanceRecord:
    """A transient, never-persisted view of what the punch would record."""
    departing = punch.kind == ClockPunchKind.DEPART.value
    return AttendanceRecord(
        roster_assignment_id=punch.roster_assignment_id,
        user_id=punch.user_id,
        department_id=punch.department_id,
        arrived_at=arrived_at if departing and arrived_at else punch.punched_at,
        departed_at=punch.punched_at if departing else None,
        break_minutes=0,
        revision=0,
        workflow_instance_id=None,
    )
