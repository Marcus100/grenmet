"""Supervisor review of phone clock punches (ADR-0040).

A phone punch is pending until approved. Approval is what writes the attendance
record (through ``save_attendance`` as the employee, so roster, revision and
timesheet rules are the manual ones); a rejected or pending punch never reaches
``AttendanceRecord``, so hours and timesheets ignore it.
"""

import uuid
from datetime import UTC, date, datetime

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from src.audit import service as audit_service
from src.auth.models import Role, RoleAssignmentScope, User
from src.auth.policy import can_act_on_user, require_permission
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


async def _require_reviewer(
    session: AsyncSession, actor: User, punch: ClockPunch
) -> None:
    """Only a supervisor holding timesheet.approve, and never the punching person.

    The employee's named supervisor (ADR-0008) qualifies, as does anyone whose
    timesheet.approve role assignment covers the employee's organisation and
    department (``can_act_on_user``).
    """
    require_permission(current_user=actor, permission_key=REVIEW_PERMISSION)
    if actor.id == punch.user_id:
        raise AppException("You cannot review your own clock punch", 403)
    employment = await session.scalar(
        select(EmploymentRecord).where(EmploymentRecord.user_id == punch.user_id)
    )
    if employment is not None and employment.supervisor_id == actor.id:
        return
    if not await can_act_on_user(
        session=session,
        current_user=actor,
        target_user_id=punch.user_id,
        permission_key=REVIEW_PERMISSION,
    ):
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


async def _reviewable_departments(session: AsyncSession, actor: User) -> set[str]:
    """Departments whose punches the actor may decide: DEPARTMENT and ALL scopes
    only, matching ``can_act_on_user`` (a SELF scope covers one's own records,
    which are never reviewable)."""
    role_ids = {
        role.id
        for role in actor.roles
        if any(p.key.lower() == REVIEW_PERMISSION for p in role.permissions)
    }
    departments: set[str] = set()
    for assignment in await organisations.active_assignments(session, actor.id):
        if assignment.role_id not in role_ids:
            continue
        if assignment.scope == RoleAssignmentScope.ALL:
            departments |= set(
                (
                    await session.scalars(
                        select(Department.id).where(
                            Department.organisation_id == assignment.organisation_id
                        )
                    )
                ).all()
            )
        elif (
            assignment.scope == RoleAssignmentScope.DEPARTMENT
            and assignment.department_id
        ):
            departments.add(assignment.department_id)
    return departments


async def list_pending(
    *, session: AsyncSession, current_user: User, limit: int, offset: int
) -> tuple[list[tuple[ClockPunch, str, str, date, str]], int]:
    """Pending phone punches the caller may review, never their own.

    Rows are (punch, employee_name, site_name, shift_date, shift_code).
    """
    require_permission(current_user=current_user, permission_key=REVIEW_PERMISSION)
    conditions = [
        ClockPunch.status == ClockPunchStatus.PENDING.value,
        ClockPunch.user_id != current_user.id,
    ]
    if not current_user.is_superuser:
        departments = await _reviewable_departments(session, current_user)
        conditions.append(
            or_(
                ClockPunch.department_id.in_(departments),
                ClockPunch.user_id.in_(
                    select(EmploymentRecord.user_id).where(
                        EmploymentRecord.supervisor_id == current_user.id
                    )
                ),
            )
        )
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
