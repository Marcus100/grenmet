"""Apply reversible exchanges without losing the published schedule history."""

import uuid
from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.hr.exceptions import HRValidationError
from src.hr.models import EmploymentRecord, EmploymentStatus
from src.hr.roster import service as roster_service
from src.hr.roster.models import (
    RosterAssignment,
    RosterPeriod,
    RosterPeriodStatus,
    RosterRevision,
    RosterRevisionAction,
    ShiftCatalog,
    ShiftCategory,
)
from src.utils.datetime import utc_now

from .models import ShiftSwapRequest, SwapType


async def ensure_no_recorded_work(
    session: AsyncSession, rows: list[RosterAssignment]
) -> None:
    """An exchange changes future scheduling, never a submitted work record."""
    from sqlalchemy import and_, or_

    from src.hr.timesheet.models import Timesheet, TimesheetEntry, TimesheetStatus

    recorded = await session.scalar(
        select(TimesheetEntry.id)
        .join(Timesheet)
        .where(
            or_(
                TimesheetEntry.roster_assignment_id.in_([row.id for row in rows]),
                or_(
                    *(
                        and_(
                            Timesheet.user_id == row.user_id,
                            TimesheetEntry.entry_date == row.assignment_date,
                        )
                        for row in rows
                    )
                ),
            ),
            or_(
                Timesheet.status.in_(
                    [TimesheetStatus.SUBMITTED, TimesheetStatus.APPROVED]
                ),
                TimesheetEntry.actual_hours > 0,
            ),
        )
        .limit(1)
    )
    if recorded:
        raise HRValidationError(
            "Recorded or submitted work requires an HR correction before exchanging shifts"
        )


async def validate_participants(
    session: AsyncSession, request: ShiftSwapRequest
) -> None:
    if request.requesting_user_id == request.counterpart_user_id:
        raise HRValidationError("Select another employee for the exchange")
    employment = list(
        (
            await session.execute(
                select(EmploymentRecord).where(
                    EmploymentRecord.user_id.in_(
                        [request.requesting_user_id, request.counterpart_user_id]
                    ),
                    EmploymentRecord.department_id == request.department_id,
                    EmploymentRecord.status == EmploymentStatus.ACTIVE,
                )
            )
        )
        .scalars()
        .all()
    )
    if len(employment) != 2:
        raise HRValidationError("Both employees must belong to the request department")
    if (
        request.swap_type != SwapType.TEMPORARY
        or request.effective_date
        or request.restoration_date
    ):
        raise HRValidationError(
            "Use a dated temporary exchange; permanent roster changes require roster planning"
        )


async def exchange_rows(
    session: AsyncSession, request: ShiftSwapRequest
) -> list[RosterAssignment]:
    """Lock both employees' dated rows and reject work, leave and period conflicts."""
    await validate_participants(session, request)
    period_ids = list(
        (
            await session.execute(
                select(RosterPeriod.id)
                .join(RosterAssignment)
                .where(
                    RosterPeriod.department_id == request.department_id,
                    RosterAssignment.user_id.in_(
                        [request.requesting_user_id, request.counterpart_user_id]
                    ),
                    RosterAssignment.assignment_date.in_(
                        [request.source_date, request.target_date]
                    ),
                )
                .distinct()
            )
        )
        .scalars()
        .all()
    )
    periods = list(
        (
            await session.execute(
                select(RosterPeriod)
                .where(RosterPeriod.id.in_(period_ids))
                .order_by(RosterPeriod.id)
                .with_for_update()
            )
        )
        .scalars()
        .all()
    )
    if any(period.status != RosterPeriodStatus.PUBLISHED for period in periods):
        raise HRValidationError("Exchange requires published, open roster periods")
    rows = list(
        (
            await session.execute(
                select(RosterAssignment)
                .where(
                    RosterAssignment.roster_period_id.in_(period_ids),
                    RosterAssignment.user_id.in_(
                        [request.requesting_user_id, request.counterpart_user_id]
                    ),
                    RosterAssignment.assignment_date.in_(
                        [request.source_date, request.target_date]
                    ),
                )
                .order_by(RosterAssignment.id)
                .with_for_update()
            )
        )
        .scalars()
        .all()
    )
    expected = 2 if request.source_date == request.target_date else 4
    if len(rows) != expected:
        raise HRValidationError(
            "Both employees need roster assignments on each exchange date"
        )
    by_cell = {(row.user_id, row.assignment_date): row for row in rows}
    source = by_cell[(request.requesting_user_id, request.source_date)]
    target = by_cell[(request.counterpart_user_id, request.target_date)]
    if (
        source.shift_code != request.source_shift_code
        or target.shift_code != request.target_shift_code
    ):
        raise HRValidationError(
            "The roster changed; review the requested shifts before approval"
        )
    if (
        source.assignment_date == target.assignment_date
        and source.shift_code == target.shift_code
    ):
        raise HRValidationError("The selected exchange would not change either shift")
    catalog = {
        shift.code: shift
        for shift in (
            await session.execute(
                select(ShiftCatalog).where(
                    ShiftCatalog.code.in_([row.shift_code for row in rows])
                )
            )
        )
        .scalars()
        .all()
    }
    if any(
        catalog[row.shift_code].category != ShiftCategory.WORK
        or not catalog[row.shift_code].is_active
        for row in [source, target]
    ):
        raise HRValidationError("Exchange dates must identify active work shifts")
    if request.source_date != request.target_date:
        other_rows = [
            by_cell[(request.counterpart_user_id, request.source_date)],
            by_cell[(request.requesting_user_id, request.target_date)],
        ]
        if any(
            catalog[row.shift_code].category != ShiftCategory.OFF for row in other_rows
        ):
            raise HRValidationError(
                "Each employee must be off on the shift they will take over"
            )
    await validate_shift_intervals(session, request, rows)
    # Approved leave/absence cannot be converted into work through an exchange.
    from sqlalchemy import or_

    from src.hr.absentee.models import AbsenteeReport
    from src.hr.leave.models import LeaveRequest
    from src.hr.models import RequestStatus
    from src.hr.workflow.models import WorkflowInstance, WorkflowStatus

    for row in rows:
        if await session.scalar(
            select(LeaveRequest.id)
            .where(
                LeaveRequest.user_id == row.user_id,
                LeaveRequest.department_id == request.department_id,
                LeaveRequest.status == RequestStatus.APPROVED,
                LeaveRequest.start_date <= row.assignment_date,
                LeaveRequest.end_date >= row.assignment_date,
                or_(
                    LeaveRequest.workflow_instance_id.is_(None),
                    LeaveRequest.workflow_instance_id.in_(
                        select(WorkflowInstance.id).where(
                            WorkflowInstance.status == WorkflowStatus.APPROVED
                        )
                    ),
                ),
            )
            .limit(1)
        ) or await session.scalar(
            select(AbsenteeReport.id)
            .where(
                AbsenteeReport.user_id == row.user_id,
                AbsenteeReport.department_id == request.department_id,
                AbsenteeReport.status == RequestStatus.APPROVED,
                AbsenteeReport.report_date == row.assignment_date,
                or_(
                    AbsenteeReport.workflow_instance_id.is_(None),
                    AbsenteeReport.workflow_instance_id.in_(
                        select(WorkflowInstance.id).where(
                            WorkflowInstance.status == WorkflowStatus.APPROVED
                        )
                    ),
                ),
            )
            .limit(1)
        ):
            raise HRValidationError(
                "An approved leave or absence conflicts with this exchange"
            )
    return rows


async def validate_shift_intervals(
    session: AsyncSession, request: ShiftSwapRequest, rows: list[RosterAssignment]
) -> None:
    """Overnight work can overlap the next date even when its cell is free."""
    from src.hr.roster.expansion import expand_shift

    dates = {
        day + timedelta(days=offset)
        for day in {request.source_date, request.target_date}
        for offset in (-1, 0, 1)
    }
    scheduled = list(
        (
            await session.execute(
                select(RosterAssignment, ShiftCatalog)
                .join(ShiftCatalog)
                .join(RosterPeriod)
                .where(
                    RosterAssignment.user_id.in_(
                        [request.requesting_user_id, request.counterpart_user_id]
                    ),
                    RosterAssignment.assignment_date.in_(dates),
                    RosterPeriod.status.in_(
                        [RosterPeriodStatus.PUBLISHED, RosterPeriodStatus.CLOSED]
                    ),
                )
            )
        ).all()
    )
    shifted = {(row.user_id, row.assignment_date): row.shift_code for row in rows}
    proposed = {
        row.id: shifted[
            (
                request.counterpart_user_id
                if row.user_id == request.requesting_user_id
                else request.requesting_user_id,
                row.assignment_date,
            )
        ]
        for row in rows
    }
    catalog = {shift.code: shift for _, shift in scheduled}
    intervals = [
        (
            row,
            expand_shift(
                row.assignment_date, catalog[proposed.get(row.id, row.shift_code)]
            ),
        )
        for row, _ in scheduled
    ]
    for row, interval in intervals:
        if row.id not in proposed or interval is None:
            continue
        for other, other_interval in intervals:
            if (
                other.id != row.id
                and other.user_id == row.user_id
                and other_interval is not None
                and interval[0] < other_interval[1]
                and other_interval[0] < interval[1]
            ):
                raise HRValidationError(
                    "The exchange would overlap another scheduled shift, including overnight work"
                )


async def apply_exchange(
    session: AsyncSession, request: ShiftSwapRequest, actor_id: uuid.UUID
) -> None:
    # Workflow instance locking serializes attempts for this request; period locks
    # serialize competing exchanges and ordinary roster edits.
    revisions = list(
        (
            await session.execute(
                select(RosterRevision).where(
                    RosterRevision.snapshot["shift_swap_id"].as_string()
                    == str(request.id),
                    RosterRevision.snapshot["effect"].as_string() == "APPLIED",
                )
            )
        )
        .scalars()
        .all()
    )
    if revisions:
        return
    rows = await exchange_rows(session, request)
    await ensure_no_recorded_work(session, rows)
    before = {row.id: row.shift_code for row in rows}
    by_cell = {(row.user_id, row.assignment_date): row for row in rows}
    for day in sorted({request.source_date, request.target_date}):
        left = by_cell[(request.requesting_user_id, day)]
        right = by_cell[(request.counterpart_user_id, day)]
        left.shift_code, right.shift_code = right.shift_code, left.shift_code
        left.updated_at = right.updated_at = utc_now()
    for period_id in sorted({row.roster_period_id for row in rows}):
        await roster_service._create_revision(
            session=session,
            roster_period_id=period_id,
            action=RosterRevisionAction.ASSIGNMENTS_UPDATED,
            changed_by_user_id=actor_id,
            summary=f"Approved shift exchange {request.id}",
            snapshot={
                "shift_swap_id": str(request.id),
                "effect": "APPLIED",
                "assignments": [
                    {
                        "id": str(row.id),
                        "user_id": str(row.user_id),
                        "assignment_date": row.assignment_date.isoformat(),
                        "before_shift_code": before[row.id],
                        "after_shift_code": row.shift_code,
                    }
                    for row in rows
                    if row.roster_period_id == period_id
                ],
            },
        )
    await session.flush()


async def reverse_exchange(
    session: AsyncSession, request: ShiftSwapRequest, actor_id: uuid.UUID
) -> None:
    revisions = list(
        (
            await session.execute(
                select(RosterRevision).where(
                    RosterRevision.snapshot["shift_swap_id"].as_string()
                    == str(request.id),
                )
            )
        )
        .scalars()
        .all()
    )
    if any(revision.snapshot.get("effect") == "REVERSED" for revision in revisions):
        return
    for revision in sorted(revisions, key=lambda row: row.roster_period_id):
        period = await session.scalar(
            select(RosterPeriod)
            .where(RosterPeriod.id == revision.roster_period_id)
            .with_for_update()
        )
        if period is None or period.status != RosterPeriodStatus.PUBLISHED:
            raise HRValidationError(
                "A closed or missing roster requires an HR correction before cancellation"
            )
        changes = revision.snapshot.get("assignments")
        if not isinstance(changes, list):
            raise HRValidationError("Exchange history is incomplete; contact HR")
        for change in changes:
            row = await session.scalar(
                select(RosterAssignment)
                .where(RosterAssignment.id == uuid.UUID(change["id"]))
                .with_for_update()
            )
            if (
                row is None
                or row.shift_code != change["after_shift_code"]
                or str(row.user_id) != change["user_id"]
                or row.assignment_date.isoformat() != change["assignment_date"]
            ):
                raise HRValidationError(
                    "The exchanged roster changed again; HR must reconcile before cancellation"
                )
            await ensure_no_recorded_work(session, [row])
            row.shift_code = change["before_shift_code"]
            row.updated_at = utc_now()
        await roster_service._create_revision(
            session=session,
            roster_period_id=revision.roster_period_id,
            action=RosterRevisionAction.ASSIGNMENTS_UPDATED,
            changed_by_user_id=actor_id,
            summary=f"Cancelled shift exchange {request.id}",
            snapshot={
                "shift_swap_id": str(request.id),
                "effect": "REVERSED",
                "assignments": changes,
            },
        )
    await session.flush()
