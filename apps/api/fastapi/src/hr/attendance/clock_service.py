"""Token-based clock-in that feeds the existing attendance journey.

A punch is not a second timesheet: it calls ``save_attendance`` so permissions,
roster checks, revisions and the supervisor workflow are exactly those of manual
attendance. The site token only proves presence at a department's clock point.
"""

import hashlib
import secrets
import uuid
from datetime import UTC, date, datetime, timedelta

from sqlalchemy import select
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

from .models import AttendanceRecord, ClockSite
from .schemas import AttendanceSave
from .service import GRENADA, save_attendance, scheduled_bounds

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


async def clock(
    *,
    session: AsyncSession,
    current_user: User,
    token: str,
    now: datetime | None = None,
) -> tuple[str, AttendanceRecord, ClockSite, int, int, int]:
    """Record an arrival, or a departure when a shift is already open.

    Returns (action, record, site, late, early_departure, overtime). ``now`` is
    injectable for tests; production uses the server clock.
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

    open_record = await _open_record(session, current_user.id, now)
    if open_record is not None:
        if now - open_record.arrived_at < DOUBLE_SCAN:
            return "ARRIVED", open_record, site, 0, 0, 0  # repeat scan, no change
        record = await save_attendance(
            session=session,
            current_user=current_user,
            payload=AttendanceSave(
                roster_assignment_id=open_record.roster_assignment_id,
                expected_revision=open_record.revision,
                arrived_at=_aware(open_record.arrived_at),
                departed_at=_aware(now),
                break_minutes=open_record.break_minutes,
                notes=open_record.notes,
            ),
        )
        assignment, shift = await _assignment_and_shift(session, record)
        start, end = scheduled_bounds(assignment, shift)
        return (
            "DEPARTED",
            record,
            site,
            _minutes(record.arrived_at - start),
            _minutes(end - now),
            _minutes(now - end),
        )

    found = await _current_assignment(session, current_user.id, now)
    if found is None:
        raise AppException("No rostered shift to clock in to at this time", 409)
    assignment, shift = found
    record = await save_attendance(
        session=session,
        current_user=current_user,
        payload=AttendanceSave(
            roster_assignment_id=assignment.id,
            expected_revision=0,
            arrived_at=_aware(now),
        ),
    )
    start, _ = scheduled_bounds(assignment, shift)
    return "ARRIVED", record, site, _minutes(now - start), 0, 0


async def _assignment_and_shift(
    session: AsyncSession, record: AttendanceRecord
) -> tuple[RosterAssignment, ShiftCatalog]:
    row = (
        await session.execute(
            select(RosterAssignment, ShiftCatalog)
            .join(ShiftCatalog, ShiftCatalog.code == RosterAssignment.shift_code)
            .where(RosterAssignment.id == record.roster_assignment_id)
        )
    ).one()
    return row[0], row[1]
