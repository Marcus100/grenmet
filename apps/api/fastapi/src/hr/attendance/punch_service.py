"""Supervisor review of phone clock punches (ADR-0040).

A phone punch is pending until approved. Approval is what writes the attendance
record (through ``save_attendance`` as the employee, so roster, revision and
timesheet rules are the manual ones); a rejected or pending punch never reaches
``AttendanceRecord``, so hours and timesheets ignore it.
"""

import uuid
from datetime import UTC, date, datetime

from sqlalchemy import ColumnElement, and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from src.audit import service as audit_service
from src.auth.models import Role, RoleAssignmentScope, User
from src.auth.policy import require_permission
from src.exceptions import AppException
from src.hr import organisations
from src.hr.models import Department, EmploymentRecord
from src.hr.roster.models import RosterAssignment
from src.utils.datetime import utc_now

from .models import (
    AttendanceRecord,
    ClockPunch,
    ClockPunchKind,
    ClockPunchStatus,
    ClockSite,
)
from .schemas import AttendanceSave
from .service import save_attendance

REVIEW_PERMISSION = "timesheet.approve"


def _aware(value: datetime) -> datetime:
    return value.replace(tzinfo=UTC)


async def _review_scope(
    session: AsyncSession, actor: User
) -> tuple[set[str], set[str]]:
    """(organisations with ALL scope, departments with DEPARTMENT scope) in which
    the actor holds the review permission. SELF scope covers one's own records,
    which are never reviewable, so it grants nothing here."""
    role_ids = {
        role.id
        for role in actor.roles
        if any(p.key.lower() == REVIEW_PERMISSION for p in role.permissions)
    }
    organisation_ids: set[str] = set()
    department_ids: set[str] = set()
    for assignment in await organisations.active_assignments(session, actor.id):
        if assignment.role_id not in role_ids:
            continue
        if assignment.scope == RoleAssignmentScope.ALL:
            organisation_ids.add(assignment.organisation_id)
        elif (
            assignment.scope == RoleAssignmentScope.DEPARTMENT
            and assignment.department_id
        ):
            department_ids.add(assignment.department_id)
    return organisation_ids, department_ids


async def _reviewable(session: AsyncSession, actor: User) -> ColumnElement[bool]:
    """The one rule for who may decide a phone punch (owner decision 2026-10-25),
    shared by the pending list and by approve/reject so that anyone who sees a
    punch can act on it and the reverse.

    A punch is reviewable by a holder of the review permission who is any of:
    an ALL-scope holder in the organisation (or a superuser); the DEPARTMENT-scope
    manager of the department recorded on the punch; the DEPARTMENT-scope manager
    of the employee's current department; or the employee's named supervisor.
    Never the employee. The punch department matters because a transfer must not
    strand a punch its original manager was shown.

    The employee-keyed clauses (current department, organisation, supervisor)
    rely on the write-path guard that refuses cross-organisation transfers, so
    an employee's current organisation is the one their punches were made in.
    """
    never_own = ClockPunch.user_id != actor.id
    if actor.is_superuser:
        return never_own
    organisation_ids, department_ids = await _review_scope(session, actor)
    employed = EmploymentRecord.user_id
    grants: list[ColumnElement[bool]] = [
        ClockPunch.user_id.in_(
            select(employed).where(EmploymentRecord.supervisor_id == actor.id)
        )
    ]
    if department_ids:
        grants.append(ClockPunch.department_id.in_(department_ids))
        grants.append(
            ClockPunch.user_id.in_(
                select(employed).where(
                    EmploymentRecord.department_id.in_(department_ids)
                )
            )
        )
    if organisation_ids:
        grants.append(
            ClockPunch.department_id.in_(
                select(Department.id).where(
                    Department.organisation_id.in_(organisation_ids)
                )
            )
        )
        grants.append(
            ClockPunch.user_id.in_(
                select(employed).where(
                    EmploymentRecord.organisation_id.in_(organisation_ids)
                )
            )
        )
    return and_(never_own, or_(*grants))


async def _require_reviewer(
    session: AsyncSession, actor: User, punch: ClockPunch
) -> None:
    """Refuse unless the shared review rule (``_reviewable``) covers this punch."""
    require_permission(current_user=actor, permission_key=REVIEW_PERMISSION)
    if actor.id == punch.user_id:
        raise AppException("You cannot review your own clock punch", 403)
    allowed = await session.scalar(
        select(ClockPunch.id).where(
            ClockPunch.id == punch.id, await _reviewable(session, actor)
        )
    )
    if allowed is None:
        raise AppException("Not allowed to review this employee's clock punch", 403)


async def _locked_punch(session: AsyncSession, punch_id: uuid.UUID) -> ClockPunch:
    punch = await session.scalar(
        select(ClockPunch)
        .where(ClockPunch.id == punch_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if punch is None:
        raise AppException("Clock punch not found", 404)
    return punch


async def approve_punch(
    *,
    session: AsyncSession,
    current_user: User,
    punch_id: uuid.UUID,
    note: str | None = None,
) -> ClockPunch:
    punch = await _locked_punch(session, punch_id)
    await _require_reviewer(session, current_user, punch)
    if punch.status == ClockPunchStatus.APPROVED.value:
        return punch  # a retried approval changes nothing
    if punch.status != ClockPunchStatus.PENDING.value:
        raise AppException("This clock punch was already rejected", 409)
    # Roles and permissions are loaded eagerly: save_attendance checks the
    # employee's own timesheet.submit.self, and a lazy load would fail in async.
    owner = (
        (
            await session.execute(
                select(User)
                .where(User.id == punch.user_id)
                .options(selectinload(User.roles).selectinload(Role.permissions))
                .execution_options(populate_existing=True)
            )
        )
        .scalars()
        .first()
    )
    if owner is None:
        raise AppException("Employee not found", 404)
    audit_service.set_actor(session, current_user.id)
    punch.status = ClockPunchStatus.APPROVED.value
    punch.reviewed_by_user_id = current_user.id
    punch.reviewed_at = utc_now()
    punch.review_note = note.strip() if note and note.strip() else None
    punch_id_value = punch.id
    assignment_id = punch.roster_assignment_id
    punched_at = punch.punched_at
    # save_attendance commits, so the status change and the attendance write land
    # in one transaction; any refusal rolls both back and the punch stays pending.
    try:
        if punch.kind == ClockPunchKind.ARRIVE.value:
            await save_attendance(
                session=session,
                current_user=owner,
                payload=AttendanceSave(
                    roster_assignment_id=assignment_id,
                    expected_revision=0,
                    arrived_at=_aware(punched_at),
                ),
            )
        else:
            record = await session.scalar(
                select(AttendanceRecord).where(
                    AttendanceRecord.roster_assignment_id == assignment_id
                )
            )
            if record is None:
                raise AppException(
                    "Approve the matching arrival before this departure", 409
                )
            if record.departed_at is not None and record.departed_at != punched_at:
                raise AppException(
                    "Attendance already has a recorded departure; the employee "
                    "must propose a correction instead of overwriting it",
                    409,
                )
            await save_attendance(
                session=session,
                current_user=owner,
                payload=AttendanceSave(
                    roster_assignment_id=assignment_id,
                    expected_revision=record.revision,
                    arrived_at=_aware(record.arrived_at),
                    departed_at=_aware(punched_at),
                    break_minutes=record.break_minutes,
                    notes=record.notes,
                ),
            )
    except AppException:
        await session.rollback()
        raise
    return await _locked_punch(session, punch_id_value)


async def reject_punch(
    *,
    session: AsyncSession,
    current_user: User,
    punch_id: uuid.UUID,
    reason: str,
) -> ClockPunch:
    punch = await _locked_punch(session, punch_id)
    await _require_reviewer(session, current_user, punch)
    if punch.status == ClockPunchStatus.REJECTED.value:
        return punch
    if punch.status != ClockPunchStatus.PENDING.value:
        raise AppException("This clock punch was already approved", 409)
    audit_service.set_actor(session, current_user.id)
    now = utc_now()
    punch.status = ClockPunchStatus.REJECTED.value
    punch.reviewed_by_user_id = current_user.id
    punch.reviewed_at = now
    punch.review_note = reason.strip()
    if punch.kind == ClockPunchKind.ARRIVE.value:
        # A departure cannot stand without its arrival.
        orphans = (
            await session.execute(
                select(ClockPunch)
                .where(
                    ClockPunch.roster_assignment_id == punch.roster_assignment_id,
                    ClockPunch.kind == ClockPunchKind.DEPART.value,
                    ClockPunch.status == ClockPunchStatus.PENDING.value,
                )
                .with_for_update()
            )
        ).scalars()
        for orphan in orphans:
            orphan.status = ClockPunchStatus.REJECTED.value
            orphan.reviewed_by_user_id = current_user.id
            orphan.reviewed_at = now
            orphan.review_note = "Arrival was rejected"
    await session.commit()
    await session.refresh(punch)
    return punch


async def list_pending(
    *, session: AsyncSession, current_user: User, limit: int, offset: int
) -> tuple[list[tuple[ClockPunch, str, str, date, str]], int]:
    """Pending phone punches the caller may review (``_reviewable``), never their own.

    Rows are (punch, employee_name, site_name, shift_date, shift_code).
    """
    require_permission(current_user=current_user, permission_key=REVIEW_PERMISSION)
    conditions = [ClockPunch.status == ClockPunchStatus.PENDING.value]
    conditions.append(await _reviewable(session, current_user))
    total = await session.scalar(
        select(func.count()).select_from(ClockPunch).where(*conditions)
    )
    rows = (
        await session.execute(
            select(
                ClockPunch,
                func.concat(User.first_name, " ", User.last_name),
                ClockSite.name,
                RosterAssignment.assignment_date,
                RosterAssignment.shift_code,
            )
            .join(User, User.id == ClockPunch.user_id)
            .join(ClockSite, ClockSite.id == ClockPunch.clock_site_id)
            .join(
                RosterAssignment,
                RosterAssignment.id == ClockPunch.roster_assignment_id,
            )
            .where(*conditions)
            .order_by(ClockPunch.punched_at, ClockPunch.id)
            .limit(limit)
            .offset(offset)
        )
    ).all()
    return [tuple(row) for row in rows], int(total or 0)
