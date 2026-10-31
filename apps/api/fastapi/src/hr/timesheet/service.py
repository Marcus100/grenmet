import calendar
import logging
import re
import uuid
from collections import defaultdict
from datetime import date
from decimal import Decimal

from pydantic import ValidationError
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.models import User
from src.auth.policy import can_act_on_user, require_permission
from src.hr.constants import (
    ERROR_TIMESHEET_ALREADY_SUBMITTED,
    ERROR_TIMESHEET_NOT_SUBMITTED,
    ERROR_TIMESHEET_PROXY_SUBMIT_DISABLED,
    ERROR_TIMESHEET_PROXY_SUBMIT_NOT_ALLOWED,
    ERROR_TIMESHEET_SELF_SUBMIT_DISABLED,
    ERROR_TIMESHEET_SELF_SUBMIT_ONLY_OWN,
    ERROR_TIMESHEET_SUBMIT_FOR_USER_NOT_ALLOWED,
)
from src.hr.dependencies import get_timesheet_or_404
from src.hr.exceptions import (
    HRPermissionDeniedError,
    HRValidationError,
)
from src.hr.models import Department, EmploymentRecord, EmploymentStatus
from src.hr.organisations import require_organisation_permission
from src.hr.roster import service as roster_service
from src.hr.roster.expansion import shift_hours
from src.hr.roster.holidays import PROVISIONAL_SOURCE
from src.hr.roster.models import (
    PublicHoliday,
    RosterAssignment,
    RosterAvailability,
    RosterPeriod,
    RosterPeriodStatus,
    ShiftCatalog,
    ShiftCategory,
)
from src.hr.signatures import service as signature_service
from src.hr.workflow import service as workflow_service
from src.hr.workflow.models import (
    WorkflowAction,
    WorkflowInstance,
    WorkflowStepInstance,
    WorkflowTemplate,
    WorkflowType,
)
from src.hr.workflow.schemas import WorkflowActionRequest, WorkflowInstanceCreate
from src.utils.datetime import utc_now

from .models import (
    DepartmentPolicy,
    SubmissionMode,
    Timesheet,
    TimesheetEntry,
    TimesheetStatus,
    TimesheetSubmission,
)
from .schemas import (
    ShiftHoursSummary,
    TimesheetCreate,
    TimesheetPrefillEntry,
    TimesheetPrefillHoliday,
    TimesheetPrefillPublic,
    TimesheetSummaryByShift,
)

logger = logging.getLogger(__name__)


async def _get_or_create_policy(
    *, session: AsyncSession, department_id: str
) -> DepartmentPolicy:
    await session.execute(
        select(Department).where(Department.id == department_id).with_for_update()
    )
    result = await session.execute(
        select(DepartmentPolicy).where(DepartmentPolicy.department_id == department_id)
    )
    policy = result.scalars().first()
    if policy:
        return policy
    policy = DepartmentPolicy(department_id=department_id)
    session.add(policy)
    await session.flush()
    return policy


async def _validate_department_membership(
    session: AsyncSession, user_id: uuid.UUID, department_id: str
) -> None:
    employment = await session.scalar(
        select(EmploymentRecord).where(EmploymentRecord.user_id == user_id)
    )
    if (
        employment is None
        or employment.department_id != department_id
        or employment.status != EmploymentStatus.ACTIVE
    ):
        raise HRPermissionDeniedError(
            "Timesheet department must match the employee's active employment"
        )


async def _require_record_access(
    session: AsyncSession,
    current_user: User,
    timesheet: Timesheet,
    permission_key: str,
    *,
    allow_self: bool = False,
) -> None:
    if allow_self and current_user.id == timesheet.user_id:
        return
    latest_workflow = (
        select(WorkflowInstance.id)
        .where(
            WorkflowInstance.entity_type == "timesheet",
            WorkflowInstance.entity_id == timesheet.id,
        )
        .order_by(WorkflowInstance.created_at.desc())
        .limit(1)
        .scalar_subquery()
    )
    named_workflow_id = await session.scalar(
        select(WorkflowStepInstance.workflow_instance_id)
        .where(
            WorkflowStepInstance.workflow_instance_id == latest_workflow,
            WorkflowStepInstance.required_user_id == current_user.id,
        )
        .limit(1)
    )
    if named_workflow_id is not None:
        # Named history follows the workflow's live detail policy, including
        # employer membership and view authority; a recorded ID is not a grant.
        await workflow_service.read_workflow_instance_details(
            session=session,
            current_user=current_user,
            workflow_instance_id=named_workflow_id,
        )
        return
    department = await session.get(Department, timesheet.department_id)
    if department is None:
        raise HRValidationError("Timesheet department not found")
    await require_organisation_permission(
        session,
        current_user,
        department.organisation_id,
        permission_key,
        timesheet.department_id,
    )


async def create_timesheet(
    *, session: AsyncSession, current_user: User, payload: TimesheetCreate
) -> tuple[Timesheet, list[TimesheetEntry]]:
    target_user_id = payload.user_id or current_user.id
    is_proxy = target_user_id != current_user.id

    if not is_proxy:
        require_permission(
            current_user=current_user, permission_key="timesheet.submit.self"
        )
    if is_proxy:
        require_permission(
            current_user=current_user, permission_key="timesheet.submit.proxy"
        )
    if is_proxy and not await can_act_on_user(
        session=session,
        current_user=current_user,
        target_user_id=target_user_id,
        permission_key="timesheet.submit.proxy",
    ):
        raise HRPermissionDeniedError(ERROR_TIMESHEET_SUBMIT_FOR_USER_NOT_ALLOWED)

    await _validate_department_membership(
        session, target_user_id, payload.department_id
    )
    policy = await _get_or_create_policy(
        session=session, department_id=payload.department_id
    )
    if not is_proxy and not policy.allow_employee_self_submit:
        raise HRPermissionDeniedError(ERROR_TIMESHEET_SELF_SUBMIT_DISABLED)
    if is_proxy and not policy.allow_supervisor_proxy_submit:
        raise HRPermissionDeniedError(ERROR_TIMESHEET_PROXY_SUBMIT_DISABLED)
    codes = {entry.shift_code for entry in payload.entries if entry.shift_code}
    known = set(
        (
            await session.scalars(
                select(ShiftCatalog.code).where(ShiftCatalog.code.in_(codes))
            )
        ).all()
    )
    if codes - known:
        raise HRValidationError("Unknown timesheet shift code")

    timesheet = Timesheet(
        user_id=target_user_id,
        department_id=payload.department_id,
        period_start=payload.period_start,
        period_end=payload.period_end,
    )
    session.add(timesheet)
    await session.flush()

    roster_result = await session.execute(
        select(RosterAssignment)
        .join(RosterPeriod, RosterPeriod.id == RosterAssignment.roster_period_id)
        .where(
            RosterPeriod.department_id == payload.department_id,
            RosterPeriod.status.in_(
                [RosterPeriodStatus.PUBLISHED, RosterPeriodStatus.CLOSED]
            ),
            RosterAssignment.user_id == target_user_id,
            RosterAssignment.assignment_date >= payload.period_start,
            RosterAssignment.assignment_date <= payload.period_end,
        )
        .with_for_update(of=RosterAssignment)
    )
    roster_assignments = {
        ra.assignment_date: ra for ra in roster_result.scalars().all()
    }

    entries: list[TimesheetEntry] = []
    for entry in payload.entries:
        linked_ra = roster_assignments.get(entry.entry_date)
        if linked_ra and entry.shift_code and linked_ra.shift_code != entry.shift_code:
            raise HRValidationError(
                "Entry shift must match the published roster assignment"
            )
        db_entry = TimesheetEntry(
            timesheet_id=timesheet.id,
            entry_date=entry.entry_date,
            shift_code=entry.shift_code
            or (linked_ra.shift_code if linked_ra else None),
            roster_assignment_id=linked_ra.id if linked_ra else None,
            roster_hours=entry.roster_hours,
            actual_hours=entry.actual_hours,
            total_hours=entry.total_hours
            if entry.total_hours is not None
            else entry.actual_hours,
            overtime_hours=entry.overtime_hours,
            break_hours=entry.break_hours,
            hours_worked=entry.hours_worked
            if entry.hours_worked is not None
            else entry.actual_hours - entry.break_hours,
            medical_certificate_attached=entry.medical_certificate_attached,
            comments=entry.comments,
        )
        session.add(db_entry)
        entries.append(db_entry)
    await session.commit()
    # No per-row refresh: id/created_at/updated_at are Python-side default_factory
    # values, already populated, and expire_on_commit=False keeps them after commit.
    return timesheet, entries


async def submit_timesheet(
    *,
    session: AsyncSession,
    current_user: User,
    timesheet_id: uuid.UUID,
    submission_mode: SubmissionMode,
    signature_version: uuid.UUID | None = None,
    rule_override_reason: str | None = None,
) -> Timesheet:
    await session.execute(
        select(Timesheet).where(Timesheet.id == timesheet_id).with_for_update()
    )
    timesheet = await get_timesheet_or_404(session=session, timesheet_id=timesheet_id)
    if timesheet.status not in {TimesheetStatus.DRAFT, TimesheetStatus.RETURNED}:
        raise HRValidationError(ERROR_TIMESHEET_ALREADY_SUBMITTED)

    if submission_mode == SubmissionMode.SELF and current_user.id != timesheet.user_id:
        raise HRPermissionDeniedError(ERROR_TIMESHEET_SELF_SUBMIT_ONLY_OWN)
    if submission_mode == SubmissionMode.SELF:
        require_permission(
            current_user=current_user, permission_key="timesheet.submit.self"
        )
    if submission_mode == SubmissionMode.PROXY:
        require_permission(
            current_user=current_user, permission_key="timesheet.submit.proxy"
        )
        if not await can_act_on_user(
            session=session,
            current_user=current_user,
            target_user_id=timesheet.user_id,
            permission_key="timesheet.submit.proxy",
        ):
            raise HRPermissionDeniedError(ERROR_TIMESHEET_PROXY_SUBMIT_NOT_ALLOWED)

    await _validate_department_membership(
        session, timesheet.user_id, timesheet.department_id
    )
    policy = await _get_or_create_policy(
        session=session, department_id=timesheet.department_id
    )
    if submission_mode == SubmissionMode.SELF and not policy.allow_employee_self_submit:
        raise HRPermissionDeniedError(ERROR_TIMESHEET_SELF_SUBMIT_DISABLED)
    if (
        submission_mode == SubmissionMode.PROXY
        and not policy.allow_supervisor_proxy_submit
    ):
        raise HRPermissionDeniedError(ERROR_TIMESHEET_PROXY_SUBMIT_DISABLED)
    entries = list(
        (
            await session.scalars(
                select(TimesheetEntry).where(
                    TimesheetEntry.timesheet_id == timesheet.id
                )
            )
        ).all()
    )
    try:
        TimesheetCreate.model_validate(
            {
                "department_id": timesheet.department_id,
                "period_start": timesheet.period_start,
                "period_end": timesheet.period_end,
                "entries": entries,
            },
            from_attributes=True,
        )
    except ValidationError:
        raise HRValidationError(
            "Correct invalid dates or hours before submitting this timesheet"
        ) from None

    linked_ids = {
        entry.roster_assignment_id for entry in entries if entry.roster_assignment_id
    }
    linked_assignments = {
        assignment.id: assignment
        for assignment in await session.scalars(
            select(RosterAssignment)
            .join(RosterPeriod, RosterPeriod.id == RosterAssignment.roster_period_id)
            .where(
                RosterAssignment.id.in_(linked_ids),
                RosterAssignment.user_id == timesheet.user_id,
                RosterPeriod.department_id == timesheet.department_id,
                RosterPeriod.status.in_(
                    [RosterPeriodStatus.PUBLISHED, RosterPeriodStatus.CLOSED]
                ),
            )
            .with_for_update(of=RosterAssignment)
        )
    }
    for entry in entries:
        if not entry.roster_assignment_id:
            continue
        assignment = linked_assignments.get(entry.roster_assignment_id)
        if (
            assignment is None
            or assignment.assignment_date != entry.entry_date
            or assignment.shift_code != entry.shift_code
        ):
            raise HRValidationError(
                "Correct the roster date, employee, department or shift before submitting"
            )

    await ensure_timesheet_workflow(
        session=session,
        current_user=current_user,
        timesheet=timesheet,
        rule_override_reason=rule_override_reason,
    )
    timesheet.status = TimesheetStatus.SUBMITTED
    timesheet.submitted_by_user_id = current_user.id
    timesheet.submitted_at = utc_now()
    timesheet.updated_at = utc_now()
    session.add(timesheet)
    session.add(
        TimesheetSubmission(
            timesheet_id=timesheet.id,
            submitted_by_user_id=current_user.id,
            submission_mode=submission_mode,
        )
    )
    await signature_service.capture(
        session=session,
        actor=current_user,
        entity=timesheet,
        entity_type="timesheet",
        signature_version=signature_version,
    )
    await session.commit()
    await session.refresh(timesheet)
    logger.info(
        "Timesheet submitted",
        extra={
            "timesheet_id": str(timesheet.id),
            "mode": submission_mode.value,
            "actor_id": str(current_user.id),
        },
    )
    return timesheet


async def approve_timesheet(
    *,
    session: AsyncSession,
    current_user: User,
    timesheet_id: uuid.UUID,
    rule_override_reason: str | None = None,
) -> Timesheet:
    require_permission(current_user=current_user, permission_key="timesheet.approve")
    timesheet = await get_timesheet_or_404(session=session, timesheet_id=timesheet_id)
    if timesheet.status != TimesheetStatus.SUBMITTED:
        raise HRValidationError(ERROR_TIMESHEET_NOT_SUBMITTED)
    await _require_record_access(session, current_user, timesheet, "timesheet.approve")

    instance = (
        (
            await session.execute(
                select(WorkflowInstance)
                .where(
                    WorkflowInstance.entity_type == "timesheet",
                    WorkflowInstance.entity_id == timesheet.id,
                )
                .order_by(WorkflowInstance.created_at.desc())
                .limit(1)
            )
        )
        .scalars()
        .first()
    )
    if instance:
        await workflow_service.apply_workflow_action(
            session=session,
            current_user=current_user,
            workflow_instance_id=instance.id,
            action_in=WorkflowActionRequest(
                action=WorkflowAction.APPROVE,
                rule_override_reason=rule_override_reason,
            ),
        )
        await session.refresh(timesheet)
        return timesheet
    from src.baseline.models import StaffCredential

    if await session.get(StaffCredential, timesheet.user_id):
        raise HRValidationError(
            "Staff timesheets require the configured approval workflow"
        )
    # Legacy approval without a workflow runs the same roster rule checks (#380).
    from src.hr.roster import change_checks

    await change_checks.check_timesheet_approval(
        session,
        timesheet=timesheet,
        actor_id=current_user.id,
        reason=rule_override_reason,
    )
    timesheet.status = TimesheetStatus.APPROVED
    timesheet.approved_by_user_id = current_user.id
    timesheet.approved_at = utc_now()
    timesheet.updated_at = utc_now()
    session.add(timesheet)
    await session.commit()
    await session.refresh(timesheet)
    logger.info(
        "Timesheet approved",
        extra={"timesheet_id": str(timesheet.id), "actor_id": str(current_user.id)},
    )
    return timesheet


async def list_my_timesheets(
    *, session: AsyncSession, current_user: User, skip: int = 0, limit: int = 100
) -> tuple[list[Timesheet], int]:
    base = select(Timesheet).where(Timesheet.user_id == current_user.id)
    total = await session.scalar(select(func.count()).select_from(base.subquery()))
    result = await session.execute(
        base.order_by(Timesheet.created_at.desc()).offset(skip).limit(limit)
    )
    return list(result.scalars().all()), total or 0


async def list_department_timesheets(
    *,
    session: AsyncSession,
    current_user: User,
    department_id: str,
    skip: int = 0,
    limit: int = 100,
) -> tuple[list[Timesheet], int]:
    require_permission(
        current_user=current_user, permission_key="timesheet.read.department"
    )
    department = await session.get(Department, department_id)
    if department is None:
        raise HRValidationError("Department not found")
    await require_organisation_permission(
        session,
        current_user,
        department.organisation_id,
        "timesheet.read.department",
        department_id,
    )
    base = select(Timesheet).where(Timesheet.department_id == department_id)
    total = await session.scalar(select(func.count()).select_from(base.subquery()))
    result = await session.execute(
        base.order_by(Timesheet.created_at.desc()).offset(skip).limit(limit)
    )
    return list(result.scalars().all()), total or 0


async def read_timesheet_details(
    *, session: AsyncSession, current_user: User, timesheet_id: uuid.UUID
) -> tuple[Timesheet, list[TimesheetEntry]]:
    timesheet = await get_timesheet_or_404(session=session, timesheet_id=timesheet_id)
    await _require_record_access(
        session, current_user, timesheet, "timesheet.read.department", allow_self=True
    )
    result = await session.execute(
        select(TimesheetEntry).where(TimesheetEntry.timesheet_id == timesheet_id)
    )
    entries = list(result.scalars().all())
    return timesheet, entries


async def get_timesheet_summary(
    *, session: AsyncSession, current_user: User, timesheet_id: uuid.UUID
) -> TimesheetSummaryByShift:
    timesheet = await get_timesheet_or_404(session=session, timesheet_id=timesheet_id)
    await _require_record_access(
        session, current_user, timesheet, "timesheet.read.department", allow_self=True
    )

    result = await session.execute(
        select(TimesheetEntry).where(TimesheetEntry.timesheet_id == timesheet_id)
    )
    entries = list(result.scalars().all())

    by_shift: dict[str, list[TimesheetEntry]] = defaultdict(list)
    for entry in entries:
        key = entry.shift_code or "UNLINKED"
        by_shift[key].append(entry)

    shifts: list[ShiftHoursSummary] = []
    grand_roster = Decimal("0.0")
    grand_actual = Decimal("0.0")
    grand_overtime = Decimal("0.0")
    for code, group in sorted(by_shift.items()):
        total_roster = sum((e.roster_hours for e in group), Decimal("0.0"))
        total_actual = sum((e.actual_hours for e in group), Decimal("0.0"))
        total_overtime = sum((e.overtime_hours for e in group), Decimal("0.0"))
        total_break = sum((e.break_hours for e in group), Decimal("0.0"))
        shifts.append(
            ShiftHoursSummary(
                shift_code=code,
                total_roster_hours=total_roster,
                total_actual_hours=total_actual,
                total_overtime_hours=total_overtime,
                total_break_hours=total_break,
                entry_count=len(group),
            )
        )
        grand_roster += total_roster
        grand_actual += total_actual
        grand_overtime += total_overtime

    from src.hr.roster import overtime_service
    from src.hr.roster.overtime import merge_bands
    from src.hr.roster.schemas import OvertimeBandPublic

    bands = await overtime_service.timesheet_bands(
        session,
        user_id=timesheet.user_id,
        department_id=timesheet.department_id,
        entries=entries,
    )
    return TimesheetSummaryByShift(
        timesheet_id=timesheet_id,
        shifts=shifts,
        grand_total_roster=grand_roster,
        grand_total_actual=grand_actual,
        grand_total_overtime=grand_overtime,
        overtime_bands=[
            OvertimeBandPublic(rate=band.rate, hours=band.hours)
            for band in merge_bands(bands.values())
        ],
    )


async def ensure_timesheet_workflow(
    *,
    session: AsyncSession,
    current_user: User,
    timesheet: Timesheet,
    rule_override_reason: str | None = None,
) -> None:
    result = await session.execute(
        select(WorkflowTemplate).where(
            WorkflowTemplate.department_id == timesheet.department_id,
            WorkflowTemplate.workflow_type == WorkflowType.TIMESHEET,
            WorkflowTemplate.is_active.is_(True),
        )
    )
    template = result.scalars().first()
    if not template:
        from src.baseline.models import StaffCredential

        if await session.get(StaffCredential, timesheet.user_id):
            raise HRValidationError("Configure a timesheet approval workflow first")
        return
    owner = await session.get(User, timesheet.user_id)
    if owner is None:
        raise HRValidationError("Timesheet owner not found")
    instance = await workflow_service.create_workflow_instance(
        session=session,
        current_user=owner,
        require_actor_permission=False,
        commit=False,
        instance_in=WorkflowInstanceCreate(
            workflow_template_id=template.id,
            entity_type="timesheet",
            entity_id=timesheet.id,
        ),
    )

    await workflow_service.apply_workflow_action(
        session=session,
        current_user=current_user,
        workflow_instance_id=instance.id,
        action_in=WorkflowActionRequest(
            action=WorkflowAction.SUBMIT,
            rule_override_reason=rule_override_reason,
        ),
        require_actor_permission=False,
        commit=False,
    )


_PERIOD_PATTERN = re.compile(r"^(\d{4})-(0[1-9]|1[0-2])$")


async def prefill_from_roster(
    *, session: AsyncSession, current_user: User, period: str
) -> TimesheetPrefillPublic:
    """The caller's published roster work shifts for a month, as timesheet rows.

    `period` is a calendar month (`YYYY-MM`). Only published or closed rosters
    count, matching what `create_timesheet` links. The figures are the
    scheduled hours; the employee still records what was actually worked.
    """
    require_permission(
        current_user=current_user, permission_key="timesheet.submit.self"
    )
    match = _PERIOD_PATTERN.match(period)
    if match is None:
        raise HRValidationError("Period must be a month in the form YYYY-MM")
    year, month = int(match.group(1)), int(match.group(2))
    period_start = date(year, month, 1)
    period_end = date(year, month, calendar.monthrange(year, month)[1])

    department_id = await session.scalar(
        select(EmploymentRecord.department_id).where(
            EmploymentRecord.user_id == current_user.id
        )
    )
    rows: list[tuple[RosterAssignment, ShiftCatalog]] = []
    if department_id is not None:
        result = await session.execute(
            select(RosterAssignment, ShiftCatalog)
            .join(RosterPeriod, RosterPeriod.id == RosterAssignment.roster_period_id)
            .join(ShiftCatalog, ShiftCatalog.code == RosterAssignment.shift_code)
            .where(
                RosterPeriod.department_id == department_id,
                RosterPeriod.status.in_(
                    [RosterPeriodStatus.PUBLISHED, RosterPeriodStatus.CLOSED]
                ),
                RosterAssignment.user_id == current_user.id,
                RosterAssignment.assignment_date >= period_start,
                RosterAssignment.assignment_date <= period_end,
                ShiftCatalog.category == ShiftCategory.WORK,
                ShiftCatalog.counts_as_work_hours.is_(True),
            )
            .order_by(RosterAssignment.assignment_date)
        )
        rows = [(row[0], row[1]) for row in result.all()]

    availability = await roster_service.assignment_availability(
        session, [assignment.id for assignment, _ in rows]
    )
    holiday_rows = (
        await session.scalars(
            select(PublicHoliday)
            .where(
                PublicHoliday.holiday_date >= period_start,
                PublicHoliday.holiday_date <= period_end,
                PublicHoliday.country_code == "GD",
            )
            .order_by(PublicHoliday.holiday_date)
        )
    ).all()
    holidays = [
        TimesheetPrefillHoliday(
            holiday_date=row.holiday_date,
            name=row.name,
            provisional=row.needs_verification or row.source == PROVISIONAL_SOURCE,
        )
        for row in holiday_rows
    ]
    holiday_by_date = {holiday.holiday_date: holiday for holiday in holidays}
    entries = [
        TimesheetPrefillEntry(
            entry_date=assignment.assignment_date,
            shift_code=shift.code,
            shift_label=shift.label,
            start_time=shift.start_time,
            end_time=shift.end_time,
            roster_hours=shift_hours(shift) or Decimal("0.00"),
            roster_assignment_id=assignment.id,
            availability=availability.get(assignment.id, RosterAvailability.SCHEDULED),
            holiday_name=(
                holiday_by_date[assignment.assignment_date].name
                if assignment.assignment_date in holiday_by_date
                else None
            ),
            holiday_provisional=(
                holiday_by_date[assignment.assignment_date].provisional
                if assignment.assignment_date in holiday_by_date
                else False
            ),
        )
        for assignment, shift in rows
    ]
    return TimesheetPrefillPublic(
        department_id=department_id,
        period=period,
        period_start=period_start,
        period_end=period_end,
        roster_published=bool(entries),
        entries=entries,
        holidays=holidays,
    )
