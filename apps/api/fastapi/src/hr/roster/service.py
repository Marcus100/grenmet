import csv
import uuid
from datetime import date
from io import StringIO

from sqlalchemy import and_, case, exists, false, or_, select, tuple_
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.access import all_scope_permission_keys
from src.auth.models import User
from src.auth.policy import has_permission, require_permission
from src.hr import notifications as hr_notifications
from src.hr import organisations
from src.hr.absentee.models import AbsenteeReport
from src.hr.constants import (
    ERROR_CALENDAR_NO_DEPARTMENT,
    ERROR_CALENDAR_RANGE_INVALID,
    ERROR_CALENDAR_RANGE_TOO_LONG,
    ERROR_CSV_IMPORT_INVALID_ROWS,
    ERROR_CSV_MISSING_COLUMNS,
    ERROR_CSV_NO_HEADER,
    ERROR_GRID_NOT_IMPORTABLE,
    ERROR_PUBLIC_HOLIDAY_DUPLICATE_DATE,
    ERROR_ROSTER_PERIOD_ALREADY_CLOSED,
    ERROR_ROSTER_PERIOD_ALREADY_PUBLISHED,
    ERROR_ROSTER_PERIOD_END_BEFORE_START,
    ERROR_ROSTER_PERIOD_NOT_PUBLISHED,
    ERROR_SHIFT_CODE_ALREADY_EXISTS,
)
from src.hr.dependencies import (
    get_public_holiday_or_404,
    get_roster_period_or_404,
)
from src.hr.exceptions import (
    DepartmentNotFoundError,
    HRPermissionDeniedError,
    HRValidationError,
    RosterPeriodNotFoundError,
    ShiftCatalogNotFoundError,
)
from src.hr.leave.models import LeaveRequest
from src.hr.models import Department, EmploymentRecord, EmploymentStatus, RequestStatus
from src.hr.workflow.models import WorkflowInstance, WorkflowStatus
from src.utils.datetime import utc_now

from .expansion import expand_shift
from .grid import parse_grid, resolve_user
from .models import (
    ImportStatus,
    PublicHoliday,
    RosterAssignment,
    RosterAvailability,
    RosterImportJob,
    RosterImportRow,
    RosterPeriod,
    RosterPeriodStatus,
    RosterRevision,
    RosterRevisionAction,
    ShiftCatalog,
    ShiftCategory,
)
from .schemas import (
    PublicHolidayCreate,
    RosterAssignmentBulkCreate,
    RosterAssignmentInput,
    RosterCsvRowValidation,
    RosterCsvValidationRequest,
    RosterCsvValidationResponse,
    RosterGridImportRequest,
    RosterGridImportResult,
    RosterGridPreview,
    RosterPeriodCreate,
    ShiftCatalogCreate,
    ShiftCatalogUpdate,
)


async def require_roster_read_scope(
    session: AsyncSession, actor: User, department_id: str
) -> None:
    department = await organisations.department_for(session, department_id)
    allowed = await organisations.permitted_departments(
        session, actor, department.organisation_id, "roster.view"
    )
    if department_id not in allowed:
        raise HRPermissionDeniedError("Roster department is outside your scope")


async def require_roster_manage_scope(
    session: AsyncSession, actor: User, department_id: str, key: str = "roster.manage"
) -> None:
    department = await organisations.department_for(session, department_id)
    await organisations.require_organisation_permission(
        session, actor, department.organisation_id, key, department_id
    )


async def require_global_roster_manage(session: AsyncSession, actor: User) -> None:
    """Shared catalogues require live global or preserved legacy authority."""
    require_permission(current_user=actor, permission_key="roster.manage")
    if actor.is_superuser:
        return
    if "roster.manage" not in await all_scope_permission_keys(session, actor):
        raise HRPermissionDeniedError(
            "Global roster configuration requires global administrative authority"
        )


async def _has_recorded_work(
    session: AsyncSession, rows: list[RosterAssignment], code: str | None = None
) -> bool:
    from src.hr.attendance.models import AttendanceRecord
    from src.hr.timesheet.models import Timesheet, TimesheetEntry, TimesheetStatus

    if await session.scalar(
        select(AttendanceRecord.id)
        .where(AttendanceRecord.roster_assignment_id.in_([row.id for row in rows]))
        .limit(1)
    ):
        return True
    cells = [
        and_(
            Timesheet.user_id == row.user_id,
            TimesheetEntry.entry_date == row.assignment_date,
        )
        for row in rows
    ]
    return bool(
        await session.scalar(
            select(TimesheetEntry.id)
            .join(Timesheet)
            .where(
                or_(
                    TimesheetEntry.roster_assignment_id.in_([row.id for row in rows]),
                    or_(*cells) if cells else false(),
                    TimesheetEntry.shift_code == code if code else false(),
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
    )


async def assignment_availability(
    session: AsyncSession, assignment_ids: list[uuid.UUID]
) -> dict[uuid.UUID, RosterAvailability]:
    """Compose approved exceptions without changing the published schedule or exposing reasons."""
    if not assignment_ids:
        return {}
    active_absence = or_(
        AbsenteeReport.workflow_instance_id.is_(None),
        exists().where(
            WorkflowInstance.id == AbsenteeReport.workflow_instance_id,
            WorkflowInstance.status == WorkflowStatus.APPROVED,
        ),
    )
    absence = (
        select(AbsenteeReport.id)
        .where(
            AbsenteeReport.user_id == RosterAssignment.user_id,
            AbsenteeReport.department_id == RosterPeriod.department_id,
            AbsenteeReport.report_date == RosterAssignment.assignment_date,
            AbsenteeReport.status == RequestStatus.APPROVED,
            or_(
                AbsenteeReport.expected_shift_code.is_(None),
                AbsenteeReport.expected_shift_code == RosterAssignment.shift_code,
            ),
            active_absence,
        )
        .correlate(RosterAssignment, RosterPeriod, ShiftCatalog)
    )
    full_absence = absence.where(
        or_(
            (
                AbsenteeReport.absence_start_time.is_(None)
                & AbsenteeReport.absence_end_time.is_(None)
            ),
            (
                (AbsenteeReport.absence_start_time == ShiftCatalog.start_time)
                & (AbsenteeReport.absence_end_time == ShiftCatalog.end_time)
            ),
        )
    )
    active_leave = or_(
        LeaveRequest.workflow_instance_id.is_(None),
        exists().where(
            WorkflowInstance.id == LeaveRequest.workflow_instance_id,
            WorkflowInstance.status == WorkflowStatus.APPROVED,
        ),
    )
    leave = (
        select(LeaveRequest.id)
        .where(
            LeaveRequest.user_id == RosterAssignment.user_id,
            LeaveRequest.department_id == RosterPeriod.department_id,
            LeaveRequest.start_date <= RosterAssignment.assignment_date,
            LeaveRequest.end_date >= RosterAssignment.assignment_date,
            LeaveRequest.status == RequestStatus.APPROVED,
            active_leave,
        )
        .correlate(RosterAssignment, RosterPeriod)
    )
    rows = await session.execute(
        select(
            RosterAssignment.id,
            case(
                (full_absence.exists(), RosterAvailability.ABSENT.value),
                (leave.exists(), RosterAvailability.LEAVE.value),
                (absence.exists(), RosterAvailability.PARTIAL_ABSENCE.value),
                else_=RosterAvailability.SCHEDULED.value,
            ),
        )
        .join(RosterPeriod, RosterAssignment.roster_period_id == RosterPeriod.id)
        .join(ShiftCatalog, RosterAssignment.shift_code == ShiftCatalog.code)
        .where(
            RosterAssignment.id.in_(assignment_ids),
            ShiftCatalog.category == ShiftCategory.WORK,
        )
    )
    return {row[0]: RosterAvailability(row[1]) for row in rows}


REQUIRED_CSV_COLUMNS = {"user_id", "assignment_date", "shift_code"}


# ---------------------------------------------------------------------------
# Public Holidays
# ---------------------------------------------------------------------------


async def create_public_holiday(
    *, session: AsyncSession, current_user: User, payload: PublicHolidayCreate
) -> PublicHoliday:
    await require_global_roster_manage(session, current_user)
    result = await session.execute(
        select(PublicHoliday).where(PublicHoliday.holiday_date == payload.holiday_date)
    )
    existing = result.scalars().first()
    if existing:
        raise HRValidationError(ERROR_PUBLIC_HOLIDAY_DUPLICATE_DATE)
    holiday = PublicHoliday(
        name=payload.name,
        holiday_date=payload.holiday_date,
        is_recurring=payload.is_recurring,
        country_code=payload.country_code,
        created_by_user_id=current_user.id,
    )
    session.add(holiday)
    await session.commit()
    await session.refresh(holiday)
    return holiday


async def list_public_holidays(
    *, session: AsyncSession, current_user: User, year: int | None = None
) -> list[PublicHoliday]:
    require_permission(current_user=current_user, permission_key="roster.view")
    statement = select(PublicHoliday).order_by(PublicHoliday.holiday_date)
    if year is not None:
        import sqlalchemy as sa_filter

        statement = statement.where(
            sa_filter.extract("year", PublicHoliday.holiday_date) == year
        )
    result = await session.execute(statement.limit(100))
    return list(result.scalars().all())


async def delete_public_holiday(
    *, session: AsyncSession, current_user: User, holiday_id: uuid.UUID
) -> None:
    await require_global_roster_manage(session, current_user)
    holiday = await get_public_holiday_or_404(session=session, holiday_id=holiday_id)
    await session.delete(holiday)
    await session.commit()


# ---------------------------------------------------------------------------
# Roster Revisions
# ---------------------------------------------------------------------------


async def _create_revision(
    *,
    session: AsyncSession,
    roster_period_id: uuid.UUID,
    action: RosterRevisionAction,
    changed_by_user_id: uuid.UUID,
    summary: str | None = None,
    snapshot: dict[str, object] | None = None,
) -> RosterRevision:
    result = await session.execute(
        select(RosterRevision)
        .where(RosterRevision.roster_period_id == roster_period_id)
        .order_by(RosterRevision.revision_number.desc())
    )
    last_rev = result.scalars().first()
    next_number = (last_rev.revision_number + 1) if last_rev else 1
    revision = RosterRevision(
        roster_period_id=roster_period_id,
        revision_number=next_number,
        action=action,
        changed_by_user_id=changed_by_user_id,
        summary=summary,
        snapshot=snapshot or {},
    )
    session.add(revision)
    return revision


async def list_roster_revisions(
    *, session: AsyncSession, current_user: User, period_id: uuid.UUID
) -> list[RosterRevision]:
    require_permission(current_user=current_user, permission_key="roster.view")
    period = await get_roster_period_or_404(session=session, period_id=period_id)
    await require_roster_read_scope(session, current_user, period.department_id)
    result = await session.execute(
        select(RosterRevision)
        .where(RosterRevision.roster_period_id == period_id)
        .order_by(RosterRevision.revision_number)
        .limit(100)
    )
    return list(result.scalars().all())


async def publish_roster_period(
    *, session: AsyncSession, current_user: User, period_id: uuid.UUID
) -> RosterPeriod:
    require_permission(current_user=current_user, permission_key="roster.manage")
    period = await get_roster_period_or_404(session=session, period_id=period_id)
    await require_roster_manage_scope(session, current_user, period.department_id)
    if period.status == RosterPeriodStatus.PUBLISHED:
        raise HRValidationError(ERROR_ROSTER_PERIOD_ALREADY_PUBLISHED)
    if period.status == RosterPeriodStatus.CLOSED:
        raise HRValidationError(ERROR_ROSTER_PERIOD_ALREADY_CLOSED)
    period.status = RosterPeriodStatus.PUBLISHED
    period.updated_at = utc_now()
    session.add(period)
    assign_result = await session.execute(
        select(RosterAssignment)
        .where(RosterAssignment.roster_period_id == period_id)
        .order_by(RosterAssignment.assignment_date, RosterAssignment.user_id)
    )
    assignments = list(assign_result.scalars().all())
    # The publish snapshot is the authoritative "signed" state of the roster;
    # later write-throughs (leave, swaps, amendments) diff against it.
    await _create_revision(
        session=session,
        roster_period_id=period_id,
        action=RosterRevisionAction.PUBLISHED,
        changed_by_user_id=current_user.id,
        summary=f"Published with {len(assignments)} assignments",
        snapshot={
            "assignment_count": len(assignments),
            "assignments": [
                {
                    "user_id": str(assignment.user_id),
                    "assignment_date": assignment.assignment_date.isoformat(),
                    "shift_code": assignment.shift_code,
                    "remarks": assignment.remarks,
                }
                for assignment in assignments
            ],
        },
    )
    await hr_notifications.roster_published(
        session,
        period=period,
        recipients={assignment.user_id for assignment in assignments},
        actor_id=current_user.id,
    )
    await session.commit()
    await session.refresh(period)
    return period


async def close_roster_period(
    *, session: AsyncSession, current_user: User, period_id: uuid.UUID
) -> RosterPeriod:
    require_permission(current_user=current_user, permission_key="roster.manage")
    period = await get_roster_period_or_404(session=session, period_id=period_id)
    await require_roster_manage_scope(session, current_user, period.department_id)
    if period.status == RosterPeriodStatus.CLOSED:
        raise HRValidationError(ERROR_ROSTER_PERIOD_ALREADY_CLOSED)
    if period.status != RosterPeriodStatus.PUBLISHED:
        raise HRValidationError(ERROR_ROSTER_PERIOD_NOT_PUBLISHED)
    period.status = RosterPeriodStatus.CLOSED
    period.updated_at = utc_now()
    session.add(period)
    await _create_revision(
        session=session,
        roster_period_id=period_id,
        action=RosterRevisionAction.CLOSED,
        changed_by_user_id=current_user.id,
    )
    await session.commit()
    await session.refresh(period)
    return period


# ---------------------------------------------------------------------------
# Shift Catalog
# ---------------------------------------------------------------------------


async def read_shift_catalog(
    *, session: AsyncSession, current_user: User, include_inactive: bool = False
) -> list[ShiftCatalog]:
    # Listing inactive shifts is a management view; gate it on roster.manage.
    if include_inactive:
        require_permission(current_user=current_user, permission_key="roster.manage")
    else:
        require_permission(current_user=current_user, permission_key="roster.view")
    statement = select(ShiftCatalog).order_by(ShiftCatalog.code)
    if not include_inactive:
        statement = statement.where(ShiftCatalog.is_active == True)  # noqa: E712
    result = await session.execute(statement)
    return list(result.scalars().all())


def _default_shift_flags(category: ShiftCategory) -> dict[str, bool]:
    """Category-derived defaults for the advanced flags (overridable per shift)."""
    is_work = category == ShiftCategory.WORK
    is_leave = category == ShiftCategory.LEAVE
    return {
        "counts_as_work_hours": is_work,
        "needs_reason": is_leave,
        "needs_approval": is_leave,
    }


async def create_shift(
    *, session: AsyncSession, current_user: User, shift_in: ShiftCatalogCreate
) -> ShiftCatalog:
    await require_global_roster_manage(session, current_user)
    existing = await session.get(ShiftCatalog, shift_in.code)
    if existing is not None:
        raise HRValidationError(ERROR_SHIFT_CODE_ALREADY_EXISTS)
    data = shift_in.model_dump()
    # Fill any advanced flag left unset with the category-derived default.
    for key, default_value in _default_shift_flags(shift_in.category).items():
        if data.get(key) is None:
            data[key] = default_value
    db_shift = ShiftCatalog(**data)
    session.add(db_shift)
    await session.commit()
    await session.refresh(db_shift)
    return db_shift


async def update_shift(
    *,
    session: AsyncSession,
    current_user: User,
    code: str,
    shift_in: ShiftCatalogUpdate,
) -> ShiftCatalog:
    await require_global_roster_manage(session, current_user)
    db_shift = await session.scalar(
        select(ShiftCatalog)
        .where(ShiftCatalog.code == code)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if db_shift is None:
        raise ShiftCatalogNotFoundError()
    changes = shift_in.model_dump(exclude_unset=True)
    if any(
        key
        in {
            "start_time",
            "end_time",
            "ends_next_day",
            "category",
            "counts_as_work_hours",
        }
        and getattr(db_shift, key) != value
        for key, value in changes.items()
    ):
        # Catalogue-first locks match punches and bulk assignment writes.
        assignments = list(
            await session.scalars(
                select(RosterAssignment)
                .where(RosterAssignment.shift_code == code)
                .order_by(RosterAssignment.id)
                .with_for_update()
            )
        )
        if await _has_recorded_work(session, assignments, code):
            raise HRValidationError(
                "Recorded attendance protects shift times and category; use a new shift code for future schedules"
            )
    for key, value in changes.items():
        setattr(db_shift, key, value)
    db_shift.updated_at = utc_now()
    session.add(db_shift)
    await session.commit()
    await session.refresh(db_shift)
    return db_shift


async def list_roster_periods(
    *,
    session: AsyncSession,
    current_user: User,
    department_id: str,
    period_status: RosterPeriodStatus | None = None,
) -> list[RosterPeriod]:
    require_permission(current_user=current_user, permission_key="roster.view")
    await require_roster_read_scope(session, current_user, department_id)
    statement = (
        select(RosterPeriod)
        .where(RosterPeriod.department_id == department_id)
        .order_by(RosterPeriod.period_start.desc())
        .limit(100)
    )
    if period_status is not None:
        statement = statement.where(RosterPeriod.status == period_status)
    result = await session.execute(statement)
    return list(result.scalars().all())


async def create_roster_period(
    *, session: AsyncSession, current_user: User, period_in: RosterPeriodCreate
) -> RosterPeriod:
    require_permission(current_user=current_user, permission_key="roster.manage")
    await require_roster_manage_scope(session, current_user, period_in.department_id)
    if period_in.period_end < period_in.period_start:
        raise HRValidationError(ERROR_ROSTER_PERIOD_END_BEFORE_START)
    db_period = RosterPeriod(
        **period_in.model_dump(), created_by_user_id=current_user.id
    )
    session.add(db_period)
    await session.commit()
    await session.refresh(db_period)
    await _create_revision(
        session=session,
        roster_period_id=db_period.id,
        action=RosterRevisionAction.CREATED,
        changed_by_user_id=current_user.id,
        summary=f"Period {period_in.period_start} to {period_in.period_end}",
    )
    await session.commit()
    return db_period


async def bulk_upsert_roster_assignments(
    *,
    session: AsyncSession,
    current_user: User,
    payload: RosterAssignmentBulkCreate,
    permission_key: str = "roster.manage",
    commit: bool = True,
) -> list[RosterAssignment]:
    require_permission(current_user=current_user, permission_key=permission_key)
    period = await session.scalar(
        select(RosterPeriod)
        .where(RosterPeriod.id == payload.roster_period_id)
        .with_for_update()
    )
    if period is None:
        raise RosterPeriodNotFoundError()
    await require_roster_manage_scope(
        session, current_user, period.department_id, permission_key
    )
    if period.status == RosterPeriodStatus.CLOSED:
        raise HRValidationError("A closed roster cannot be edited")
    if not payload.assignments:
        return []

    pairs = [(a.user_id, a.assignment_date) for a in payload.assignments]
    if len(set(pairs)) != len(pairs):
        raise HRValidationError("Each employee can have only one assignment per date")
    if any(not period.period_start <= day <= period.period_end for _, day in pairs):
        raise HRValidationError("Assignment dates must fall within the roster period")
    employee_ids = {item.user_id for item in payload.assignments}
    members = set(
        await session.scalars(
            select(EmploymentRecord.user_id).where(
                EmploymentRecord.user_id.in_(employee_ids),
                EmploymentRecord.department_id == period.department_id,
            )
        )
    )
    if members != employee_ids:
        raise HRValidationError("Every employee must belong to the roster department")
    codes = {assignment.shift_code for assignment in payload.assignments}
    known_codes = set(
        (
            await session.scalars(
                select(ShiftCatalog.code)
                .where(ShiftCatalog.code.in_(codes))
                .order_by(ShiftCatalog.code)
                .with_for_update()
            )
        ).all()
    )
    if codes != known_codes:
        raise HRValidationError("Choose shifts from the shift catalogue")
    existing = (
        await session.scalars(
            select(RosterAssignment)
            .where(
                tuple_(
                    RosterAssignment.user_id,
                    RosterAssignment.assignment_date,
                ).in_(pairs)
            )
            .order_by(RosterAssignment.id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
    ).all()
    if any(row.roster_period_id != period.id for row in existing):
        raise HRValidationError(
            "An assignment already belongs to another roster period; amend that period instead"
        )
    by_cell = {(row.user_id, row.assignment_date): row for row in existing}
    changed_ids = [
        row.id
        for item in payload.assignments
        if (row := by_cell.get((item.user_id, item.assignment_date))) is not None
        and row.shift_code != item.shift_code
    ]
    if changed_ids and await _has_recorded_work(
        session, [row for row in existing if row.id in changed_ids]
    ):
        raise HRValidationError(
            "Recorded attendance or submitted work prevents changing the roster shift; review an HR correction"
        )
    # Preserve identifiers: timesheets and attendance refer to these rows, even
    # when the same roster is imported or saved again.
    for assignment in payload.assignments:
        row = by_cell.get((assignment.user_id, assignment.assignment_date))
        if row is None:
            row = RosterAssignment(
                roster_period_id=payload.roster_period_id,
                user_id=assignment.user_id,
                assignment_date=assignment.assignment_date,
            )
        row.shift_code = assignment.shift_code
        row.remarks = assignment.remarks
        row.updated_at = utc_now()
        session.add(row)
    await _create_revision(
        session=session,
        roster_period_id=payload.roster_period_id,
        action=RosterRevisionAction.ASSIGNMENTS_UPDATED,
        changed_by_user_id=current_user.id,
        summary=f"Upserted {len(payload.assignments)} assignments",
        snapshot={
            "upserted_count": len(payload.assignments),
            "user_ids": list({str(a.user_id) for a in payload.assignments}),
        },
    )
    if commit:
        await session.commit()
    else:
        await session.flush()
    result = await session.execute(
        select(RosterAssignment).where(
            RosterAssignment.roster_period_id == payload.roster_period_id
        )
    )
    created_assignments = list(result.scalars().all())
    return created_assignments


async def read_roster_period_details(
    *, session: AsyncSession, current_user: User, period_id: uuid.UUID
) -> tuple[RosterPeriod, list[RosterAssignment]]:
    require_permission(current_user=current_user, permission_key="roster.view")
    period = await get_roster_period_or_404(session=session, period_id=period_id)
    await require_roster_read_scope(session, current_user, period.department_id)
    result = await session.execute(
        select(RosterAssignment)
        .where(RosterAssignment.roster_period_id == period_id)
        .order_by(RosterAssignment.assignment_date)
    )
    assignments = list(result.scalars().all())
    return period, assignments


def _validate_csv_rows(
    *, csv_text: str, known_shift_codes: set[str]
) -> tuple[list[RosterCsvRowValidation], list[RosterAssignmentInput]]:
    reader = csv.DictReader(StringIO(csv_text))
    if not reader.fieldnames:
        raise HRValidationError(ERROR_CSV_NO_HEADER)
    normalized_headers = {header.strip() for header in reader.fieldnames if header}
    missing_headers = REQUIRED_CSV_COLUMNS - normalized_headers
    if missing_headers:
        raise HRValidationError(
            ERROR_CSV_MISSING_COLUMNS.format(", ".join(sorted(missing_headers)))
        )

    validations: list[RosterCsvRowValidation] = []
    valid_assignments: list[RosterAssignmentInput] = []
    for index, row in enumerate(reader, start=2):
        errors: list[str] = []
        try:
            assignment = RosterAssignmentInput.model_validate(row)
        except Exception as exc:  # pragma: no cover - defensive parsing guard
            errors.append(str(exc))
            assignment = None

        if assignment and assignment.shift_code not in known_shift_codes:
            errors.append(f"Unknown shift_code '{assignment.shift_code}'")
        if assignment:
            is_valid = len(errors) == 0
            if is_valid:
                valid_assignments.append(assignment)
        else:
            is_valid = False

        validations.append(
            RosterCsvRowValidation(
                row_number=index,
                is_valid=is_valid,
                errors=errors,
            )
        )
    return validations, valid_assignments


# ---------------------------------------------------------------------------
# Calendar feed
# ---------------------------------------------------------------------------

#: A calendar view asks for at most a few months. The cap keeps one request from
#: walking the whole assignment table.
CALENDAR_MAX_DAYS = 92


async def read_roster_calendar(
    *,
    session: AsyncSession,
    current_user: User,
    start: date,
    end: date,
    department_id: str | None = None,
    department_scope: bool = False,
) -> list[tuple[RosterAssignment, ShiftCatalog, User, EmploymentRecord, bool]]:
    """Rostered days in a window, for the calendar.

    Two scopes: the caller's own assignments (any signed-in member of staff), or
    a whole department's (requires roster.view). Draft periods are included only
    for callers who can manage the roster — for everyone else a roster is not
    real until it is published.
    """
    if end < start:
        raise HRValidationError(ERROR_CALENDAR_RANGE_INVALID)
    if (end - start).days + 1 > CALENDAR_MAX_DAYS:
        raise HRValidationError(
            ERROR_CALENDAR_RANGE_TOO_LONG.format(max_days=CALENDAR_MAX_DAYS)
        )

    if department_scope:
        require_permission(current_user=current_user, permission_key="roster.view")

    if department_id is None:
        own = await session.execute(
            select(EmploymentRecord).where(EmploymentRecord.user_id == current_user.id)
        )
        employment = own.scalars().first()
        if employment is None:
            if department_scope:
                raise HRValidationError(ERROR_CALENDAR_NO_DEPARTMENT)
            return []
        department_id = employment.department_id
    else:
        department = await session.get(Department, department_id)
        if department is None:
            raise DepartmentNotFoundError()

    include_draft = has_permission(
        current_user=current_user, permission_key="roster.manage"
    )
    if department_scope:
        await require_roster_read_scope(session, current_user, department_id)
    visible_statuses = [RosterPeriodStatus.PUBLISHED, RosterPeriodStatus.CLOSED]
    if include_draft:
        visible_statuses.append(RosterPeriodStatus.DRAFT)

    # Resolve the visible periods first: a window spans at most a few of them,
    # and it keeps the assignment query to four joined entities.
    periods = await session.execute(
        select(RosterPeriod).where(
            RosterPeriod.department_id == department_id,
            RosterPeriod.status.in_(visible_statuses),
            RosterPeriod.period_start <= end,
            RosterPeriod.period_end >= start,
        )
    )
    draft_period_ids = set()
    period_ids = []
    for period in periods.scalars().all():
        period_ids.append(period.id)
        if period.status == RosterPeriodStatus.DRAFT:
            draft_period_ids.add(period.id)
    if not period_ids:
        return []

    statement = (
        select(RosterAssignment, ShiftCatalog, User, EmploymentRecord)
        .join(
            ShiftCatalog,
            RosterAssignment.shift_code == ShiftCatalog.code,
        )
        .join(User, RosterAssignment.user_id == User.id)
        .join(
            EmploymentRecord,
            RosterAssignment.user_id == EmploymentRecord.user_id,
        )
        .where(
            RosterAssignment.roster_period_id.in_(period_ids),
            RosterAssignment.assignment_date >= start,
            RosterAssignment.assignment_date <= end,
        )
        .order_by(RosterAssignment.assignment_date, User.last_name)
    )
    if not department_scope:
        statement = statement.where(RosterAssignment.user_id == current_user.id)

    result = await session.execute(statement)
    return [
        (
            assignment,
            shift,
            user,
            employment,
            assignment.roster_period_id in draft_period_ids,
        )
        for assignment, shift, user, employment in result.all()
    ]


def calendar_times(
    assignment: RosterAssignment, shift: ShiftCatalog
) -> tuple[str | None, str | None]:
    """Local wall-clock ISO strings for a rostered day, or (None, None).

    Goes through `expand_shift` rather than reading the catalog times directly —
    it is the module's single translation from a roster cell to concrete time,
    and the only thing that knows a night shift ends the following morning.
    """
    interval = expand_shift(assignment.assignment_date, shift)
    if interval is None:
        return None, None
    starts_at, ends_at = interval
    return starts_at.isoformat(), ends_at.isoformat()


# ---------------------------------------------------------------------------
# Grid import (name × day-of-month CSV)
# ---------------------------------------------------------------------------


async def _dept_active_members(
    session: AsyncSession, department_id: str
) -> list[tuple[EmploymentRecord, User]]:
    """Active members with their employment record, which carries roster_name."""
    result = await session.execute(
        select(EmploymentRecord, User)
        .join(User, EmploymentRecord.user_id == User.id)
        .where(
            EmploymentRecord.department_id == department_id,
            EmploymentRecord.status == EmploymentStatus.ACTIVE,
        )
    )
    return [(employment, user) for employment, user in result.all()]


async def _resolve_grid(
    session: AsyncSession, payload: RosterGridImportRequest
) -> tuple[list[RosterAssignmentInput], RosterGridPreview]:
    """Parse the grid, match names to department staff, validate codes.

    Names are matched only within the department's active members. Unmatched
    names and unknown shift codes are reported, never silently dropped.
    """
    department = await session.get(Department, payload.department_id)
    if department is None:
        raise DepartmentNotFoundError()

    try:
        grid = parse_grid(payload.csv_text, payload.period_end.day)
    except ValueError as exc:
        return [], RosterGridPreview(
            total_people=0,
            matched_people=0,
            unmatched_names=[],
            total_assignments=0,
            errors=[str(exc)],
            can_import=False,
        )

    members = await _dept_active_members(session, payload.department_id)
    catalog = await session.execute(
        select(ShiftCatalog).where(ShiftCatalog.is_active == True)  # noqa: E712
    )
    valid_codes = {shift.code for shift in catalog.scalars().all()}

    assignments: list[RosterAssignmentInput] = []
    unmatched: list[str] = []
    errors: list[str] = []
    matched = 0
    for name, codes in grid.items():
        user = resolve_user(name, members)
        if user is None:
            unmatched.append(name)
            continue
        matched += 1
        for day, code in codes.items():
            if code not in valid_codes:
                errors.append(f"{name} day {day}: unknown shift code {code!r}")
                continue
            assignments.append(
                RosterAssignmentInput(
                    user_id=user.id,
                    assignment_date=payload.period_start.replace(day=day),
                    shift_code=code,
                )
            )

    preview = RosterGridPreview(
        total_people=len(grid),
        matched_people=matched,
        unmatched_names=unmatched,
        total_assignments=len(assignments),
        errors=errors,
        can_import=not (unmatched or errors),
    )
    return assignments, preview


async def validate_roster_grid(
    *, session: AsyncSession, current_user: User, payload: RosterGridImportRequest
) -> RosterGridPreview:
    require_permission(current_user=current_user, permission_key="roster.manage")
    await require_roster_manage_scope(session, current_user, payload.department_id)
    _, preview = await _resolve_grid(session, payload)
    return preview


async def import_roster_grid(
    *, session: AsyncSession, current_user: User, payload: RosterGridImportRequest
) -> RosterGridImportResult:
    require_permission(current_user=current_user, permission_key="roster.manage")
    await require_roster_manage_scope(session, current_user, payload.department_id)
    if payload.period_end < payload.period_start:
        raise HRValidationError(ERROR_ROSTER_PERIOD_END_BEFORE_START)
    assignments, preview = await _resolve_grid(session, payload)
    if not preview.can_import:
        raise HRValidationError(ERROR_GRID_NOT_IMPORTABLE)

    result = await session.execute(
        select(RosterPeriod).where(
            RosterPeriod.department_id == payload.department_id,
            RosterPeriod.period_start == payload.period_start,
        )
    )
    period = result.scalars().first()
    if period is None:
        period = await create_roster_period(
            session=session,
            current_user=current_user,
            period_in=RosterPeriodCreate(
                department_id=payload.department_id,
                period_start=payload.period_start,
                period_end=payload.period_end,
            ),
        )

    await bulk_upsert_roster_assignments(
        session=session,
        current_user=current_user,
        payload=RosterAssignmentBulkCreate(
            roster_period_id=period.id, assignments=assignments
        ),
    )

    published = False
    if payload.publish and period.status == RosterPeriodStatus.DRAFT:
        await publish_roster_period(
            session=session, current_user=current_user, period_id=period.id
        )
        published = True

    return RosterGridImportResult(
        roster_period_id=period.id,
        total_assignments=len(assignments),
        published=published,
    )


async def validate_roster_csv(
    *, session: AsyncSession, current_user: User, payload: RosterCsvValidationRequest
) -> RosterCsvValidationResponse:
    require_permission(current_user=current_user, permission_key="roster.import")
    await require_roster_manage_scope(
        session, current_user, payload.department_id, "roster.import"
    )
    if payload.roster_period_id:
        period = await get_roster_period_or_404(
            session=session, period_id=payload.roster_period_id
        )
        if period.department_id != payload.department_id:
            raise HRValidationError("Import department must match the roster period")
    result = await session.execute(
        select(ShiftCatalog).where(ShiftCatalog.is_active == True)  # noqa: E712
    )
    shift_codes = {item.code for item in result.scalars().all()}
    row_results, _ = _validate_csv_rows(
        csv_text=payload.csv_text, known_shift_codes=shift_codes
    )
    valid_rows = len([row for row in row_results if row.is_valid])
    invalid_rows = len(row_results) - valid_rows
    return RosterCsvValidationResponse(
        total_rows=len(row_results),
        valid_rows=valid_rows,
        invalid_rows=invalid_rows,
        rows=row_results,
    )


async def import_roster_csv(
    *, session: AsyncSession, current_user: User, payload: RosterCsvValidationRequest
) -> RosterImportJob:
    validation_result = await validate_roster_csv(
        session=session, current_user=current_user, payload=payload
    )
    codes = set(
        await session.scalars(
            select(ShiftCatalog.code).where(ShiftCatalog.is_active.is_(True))
        )
    )
    _, assignments = _validate_csv_rows(
        csv_text=payload.csv_text, known_shift_codes=codes
    )
    valid = validation_result.invalid_rows == 0
    if valid and payload.roster_period_id:
        # Use the same scope, membership, history and catalogue locks as the
        # editor. Keep assignments, revision and import evidence atomic.
        await bulk_upsert_roster_assignments(
            session=session,
            current_user=current_user,
            payload=RosterAssignmentBulkCreate(
                roster_period_id=payload.roster_period_id, assignments=assignments
            ),
            permission_key="roster.import",
            commit=False,
        )
    job = RosterImportJob(
        department_id=payload.department_id,
        roster_period_id=payload.roster_period_id,
        file_name=payload.file_name,
        status=(
            ImportStatus.COMPLETED
            if payload.roster_period_id
            else ImportStatus.VALIDATED
        )
        if valid
        else ImportStatus.FAILED,
        created_by_user_id=current_user.id,
        total_rows=validation_result.total_rows,
        valid_rows=validation_result.valid_rows,
        invalid_rows=validation_result.invalid_rows,
        error_summary=None if valid else ERROR_CSV_IMPORT_INVALID_ROWS,
    )
    session.add(job)
    await session.flush()
    raw_rows = list(csv.DictReader(StringIO(payload.csv_text)))
    for row in validation_result.rows:
        session.add(
            RosterImportRow(
                roster_import_job_id=job.id,
                row_number=row.row_number,
                raw_data=dict(raw_rows[row.row_number - 2]),
                validation_errors=row.errors,
                is_valid=row.is_valid,
            )
        )
    await session.commit()
    await session.refresh(job)
    return job
