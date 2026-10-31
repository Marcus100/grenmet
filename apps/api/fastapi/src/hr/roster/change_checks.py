"""Roster rule checks at workflow decisions (#380).

Called from ``workflow.finalize.finalize_entity`` before the decision takes
effect, so a breach stops the approval (409) unless the approver gives a reason:

- shift exchange approval: breaches the exchange introduces, and short notice;
- cancelling approved leave or an approved absence: the rostered shifts come back,
  so any breach that brings back is checked (approval only removes work and can
  never introduce a breach);
- timesheet and attendance approval (overtime): the hours actually worked replace
  the rostered hours, so overtime that breaks a daily or weekly limit, or work on
  a rostered day off, is checked.
"""

import uuid
from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.models import User
from src.exceptions import AppException

from . import rule_service
from .expansion import shift_hours
from .models import (
    RosterAssignment,
    RuleOverrideContext,
    ShiftCatalog,
    ShiftCategory,
)


def overtime_shift() -> ShiftCatalog:
    """A transient (never saved) work shift for hours on a day with no worked
    shift; its duration is ignored because worked hours are always given."""
    return ShiftCatalog(
        code="OT",
        label="Overtime",
        category=ShiftCategory.WORK,
        start_time="00:00",
        end_time="00:00",
        ends_next_day=True,
        counts_as_work_hours=True,
    )


async def _actor(session: AsyncSession, actor_id: uuid.UUID) -> User:
    actor = await session.get(User, actor_id)
    if actor is None:
        raise AppException("Approver not found", 404)
    return actor


async def check_swap_approval(
    session: AsyncSession,
    *,
    swap: object,
    actor_id: uuid.UUID,
    reason: str | None,
) -> None:
    from src.hr.exchange.models import ShiftSwapRequest
    from src.hr.exchange.swap_rules import swap_violations

    assert isinstance(swap, ShiftSwapRequest)
    _, violations = await swap_violations(session, swap)
    await rule_service.enforce(
        session,
        actor=await _actor(session, actor_id),
        violations=violations,
        reason=reason,
        context=RuleOverrideContext.SHIFT_SWAP,
        entity_type="shift_swap",
        entity_id=str(swap.id),
        department_id=swap.department_id,
    )


async def check_cancelled_absence(
    session: AsyncSession,
    *,
    entity: object,
    actor_id: uuid.UUID,
    reason: str | None,
) -> None:
    """Approved leave or absence being cancelled: its shifts return to work."""
    from src.hr.absentee.models import AbsenteeReport
    from src.hr.leave.models import LeaveRequest

    if isinstance(entity, LeaveRequest):
        start, end = entity.start_date, entity.end_date
        context, entity_type = RuleOverrideContext.LEAVE, "leave_request"
    elif isinstance(entity, AbsenteeReport):
        start = end = entity.report_date
        context, entity_type = RuleOverrideContext.ABSENCE, "absentee_report"
    else:
        return
    days = [start + timedelta(days=n) for n in range((end - start).days + 1)]
    entity_id = entity.id

    def without(row: object) -> bool:
        return getattr(row, "id", None) != entity_id

    _, violations = await rule_service.change_violations(
        session,
        department_id=entity.department_id,
        user_ids={entity.user_id},
        dates=days,
        include_after=without,
    )
    await rule_service.enforce(
        session,
        actor=await _actor(session, actor_id),
        violations=violations,
        reason=reason,
        context=context,
        entity_type=entity_type,
        entity_id=str(entity_id),
        department_id=entity.department_id,
    )


async def _worked_check(
    session: AsyncSession,
    *,
    department_id: str,
    user_id: uuid.UUID,
    worked: dict[rule_service.Cell, tuple[ShiftCatalog, Decimal]],
    actor_id: uuid.UUID,
    reason: str | None,
    context: RuleOverrideContext,
    entity_type: str,
    entity_id: uuid.UUID,
) -> None:
    if not worked:
        return
    _, violations = await rule_service.change_violations(
        session,
        department_id=department_id,
        user_ids={user_id},
        dates={day for _, day in worked},
        mutate=lambda cells: rule_service.worked_hours_cells(cells, worked),
    )
    await rule_service.enforce(
        session,
        actor=await _actor(session, actor_id),
        violations=violations,
        reason=reason,
        context=context,
        entity_type=entity_type,
        entity_id=str(entity_id),
        department_id=department_id,
    )


async def check_timesheet_approval(
    session: AsyncSession,
    *,
    timesheet: object,
    actor_id: uuid.UUID,
    reason: str | None,
) -> None:
    """Entries with overtime: the day counts as its shift plus the overtime."""
    from src.hr.timesheet.models import Timesheet, TimesheetEntry

    assert isinstance(timesheet, Timesheet)
    entries = (
        await session.scalars(
            select(TimesheetEntry).where(
                TimesheetEntry.timesheet_id == timesheet.id,
                TimesheetEntry.overtime_hours > 0,
            )
        )
    ).all()
    if not entries:
        return
    rostered = {
        assignment.assignment_date: shift
        for assignment, shift in (
            await session.execute(
                select(RosterAssignment, ShiftCatalog)
                .join(ShiftCatalog, ShiftCatalog.code == RosterAssignment.shift_code)
                .where(
                    RosterAssignment.user_id == timesheet.user_id,
                    RosterAssignment.assignment_date.in_(
                        [entry.entry_date for entry in entries]
                    ),
                )
            )
        ).all()
    }
    worked: dict[rule_service.Cell, tuple[ShiftCatalog, Decimal]] = {}
    for entry in entries:
        shift = rostered.get(entry.entry_date)
        base = (
            shift_hours(shift) or Decimal(0)
            if shift is not None and shift.counts_as_work_hours
            else Decimal(0)
        )
        worked[(timesheet.user_id, entry.entry_date)] = (
            shift if shift is not None and base > 0 else overtime_shift(),
            base + entry.overtime_hours,
        )
    await _worked_check(
        session,
        department_id=timesheet.department_id,
        user_id=timesheet.user_id,
        worked=worked,
        actor_id=actor_id,
        reason=reason,
        context=RuleOverrideContext.TIMESHEET,
        entity_type="timesheet",
        entity_id=timesheet.id,
    )


async def check_attendance_approval(
    session: AsyncSession,
    *,
    record: object,
    hours: Decimal | None,
    actor_id: uuid.UUID,
    reason: str | None,
    entity_type: str,
    entity_id: uuid.UUID,
) -> None:
    """Attendance (or a correction): the day counts as the hours worked."""
    from src.hr.attendance.models import AttendanceRecord

    assert isinstance(record, AttendanceRecord)
    if hours is None:
        return
    row = (
        await session.execute(
            select(RosterAssignment, ShiftCatalog)
            .join(ShiftCatalog, ShiftCatalog.code == RosterAssignment.shift_code)
            .where(RosterAssignment.id == record.roster_assignment_id)
        )
    ).first()
    if row is None:
        return
    assignment, shift = row
    day: date = assignment.assignment_date
    await _worked_check(
        session,
        department_id=record.department_id,
        user_id=record.user_id,
        worked={(record.user_id, day): (shift, hours)},
        actor_id=actor_id,
        reason=reason,
        context=RuleOverrideContext.ATTENDANCE,
        entity_type=entity_type,
        entity_id=entity_id,
    )
