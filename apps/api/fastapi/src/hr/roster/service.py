import csv
import uuid
from io import StringIO

from sqlalchemy import tuple_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import col, delete, select

from src.auth.models import User
from src.auth.policy import require_permission
from src.hr.constants import (
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
    HRValidationError,
    ShiftCatalogNotFoundError,
)
from src.hr.models import Department, EmploymentRecord, EmploymentStatus
from src.utils.datetime import utc_now

from .grid import parse_grid, resolve_user
from .models import (
    ImportStatus,
    PublicHoliday,
    RosterAssignment,
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

REQUIRED_CSV_COLUMNS = {"user_id", "assignment_date", "shift_code"}


# ---------------------------------------------------------------------------
# Public Holidays
# ---------------------------------------------------------------------------


async def create_public_holiday(
    *, session: AsyncSession, current_user: User, payload: PublicHolidayCreate
) -> PublicHoliday:
    require_permission(current_user=current_user, permission_key="roster.manage")
    result = await session.execute(
        select(PublicHoliday).where(
            col(PublicHoliday.holiday_date) == payload.holiday_date
        )
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
    statement = select(PublicHoliday).order_by(col(PublicHoliday.holiday_date))
    if year is not None:
        import sqlalchemy as sa_filter

        statement = statement.where(
            sa_filter.extract("year", col(PublicHoliday.holiday_date)) == year
        )
    result = await session.execute(statement.limit(100))
    return list(result.scalars().all())


async def delete_public_holiday(
    *, session: AsyncSession, current_user: User, holiday_id: uuid.UUID
) -> None:
    require_permission(current_user=current_user, permission_key="roster.manage")
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
        .where(col(RosterRevision.roster_period_id) == roster_period_id)
        .order_by(col(RosterRevision.revision_number).desc())
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
    await get_roster_period_or_404(session=session, period_id=period_id)
    result = await session.execute(
        select(RosterRevision)
        .where(col(RosterRevision.roster_period_id) == period_id)
        .order_by(col(RosterRevision.revision_number))
        .limit(100)
    )
    return list(result.scalars().all())


async def publish_roster_period(
    *, session: AsyncSession, current_user: User, period_id: uuid.UUID
) -> RosterPeriod:
    require_permission(current_user=current_user, permission_key="roster.manage")
    period = await get_roster_period_or_404(session=session, period_id=period_id)
    if period.status == RosterPeriodStatus.PUBLISHED:
        raise HRValidationError(ERROR_ROSTER_PERIOD_ALREADY_PUBLISHED)
    if period.status == RosterPeriodStatus.CLOSED:
        raise HRValidationError(ERROR_ROSTER_PERIOD_ALREADY_CLOSED)
    period.status = RosterPeriodStatus.PUBLISHED
    period.updated_at = utc_now()
    session.add(period)
    assign_result = await session.execute(
        select(RosterAssignment)
        .where(col(RosterAssignment.roster_period_id) == period_id)
        .order_by(col(RosterAssignment.assignment_date), col(RosterAssignment.user_id))
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
    await session.commit()
    await session.refresh(period)
    return period


async def close_roster_period(
    *, session: AsyncSession, current_user: User, period_id: uuid.UUID
) -> RosterPeriod:
    require_permission(current_user=current_user, permission_key="roster.manage")
    period = await get_roster_period_or_404(session=session, period_id=period_id)
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
    statement = select(ShiftCatalog).order_by(col(ShiftCatalog.code))
    if not include_inactive:
        statement = statement.where(col(ShiftCatalog.is_active) == True)  # noqa: E712
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
    require_permission(current_user=current_user, permission_key="roster.manage")
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
    require_permission(current_user=current_user, permission_key="roster.manage")
    db_shift = await session.get(ShiftCatalog, code)
    if db_shift is None:
        raise ShiftCatalogNotFoundError()
    for key, value in shift_in.model_dump(exclude_unset=True).items():
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
    statement = (
        select(RosterPeriod)
        .where(col(RosterPeriod.department_id) == department_id)
        .order_by(col(RosterPeriod.period_start).desc())
        .limit(100)
    )
    if period_status is not None:
        statement = statement.where(col(RosterPeriod.status) == period_status)
    result = await session.execute(statement)
    return list(result.scalars().all())


async def create_roster_period(
    *, session: AsyncSession, current_user: User, period_in: RosterPeriodCreate
) -> RosterPeriod:
    require_permission(current_user=current_user, permission_key="roster.manage")
    if period_in.period_end < period_in.period_start:
        raise HRValidationError(ERROR_ROSTER_PERIOD_END_BEFORE_START)
    db_period = RosterPeriod.model_validate(
        period_in,
        update={
            "created_by_user_id": current_user.id,
        },
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
    *, session: AsyncSession, current_user: User, payload: RosterAssignmentBulkCreate
) -> list[RosterAssignment]:
    require_permission(current_user=current_user, permission_key="roster.manage")
    await get_roster_period_or_404(session=session, period_id=payload.roster_period_id)
    if not payload.assignments:
        return []

    # Replace existing rows for the provided users+dates with fresh rows. Clear the
    # whole set in one DELETE (tuple IN) instead of a query per assignment.
    pairs = [(a.user_id, a.assignment_date) for a in payload.assignments]
    await session.execute(
        delete(RosterAssignment).where(
            tuple_(
                col(RosterAssignment.user_id),
                col(RosterAssignment.assignment_date),
            ).in_(pairs)
        )
    )
    for assignment in payload.assignments:
        session.add(
            RosterAssignment(
                roster_period_id=payload.roster_period_id,
                user_id=assignment.user_id,
                assignment_date=assignment.assignment_date,
                shift_code=assignment.shift_code,
                remarks=assignment.remarks,
            )
        )
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
    await session.commit()
    result = await session.execute(
        select(RosterAssignment).where(
            col(RosterAssignment.roster_period_id) == payload.roster_period_id
        )
    )
    created_assignments = list(result.scalars().all())
    return created_assignments


async def read_roster_period_details(
    *, session: AsyncSession, current_user: User, period_id: uuid.UUID
) -> tuple[RosterPeriod, list[RosterAssignment]]:
    require_permission(current_user=current_user, permission_key="roster.view")
    period = await get_roster_period_or_404(session=session, period_id=period_id)
    result = await session.execute(
        select(RosterAssignment)
        .where(col(RosterAssignment.roster_period_id) == period_id)
        .order_by(col(RosterAssignment.assignment_date))
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
# Grid import (name × day-of-month CSV)
# ---------------------------------------------------------------------------


async def _dept_active_users(session: AsyncSession, department_id: str) -> list[User]:
    result = await session.execute(
        select(User)
        .join(EmploymentRecord, col(EmploymentRecord.user_id) == col(User.id))
        .where(
            col(EmploymentRecord.department_id) == department_id,
            col(EmploymentRecord.status) == EmploymentStatus.ACTIVE,
        )
    )
    return list(result.scalars().all())


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

    users = await _dept_active_users(session, payload.department_id)
    catalog = await session.execute(
        select(ShiftCatalog).where(col(ShiftCatalog.is_active) == True)  # noqa: E712
    )
    valid_codes = {shift.code for shift in catalog.scalars().all()}

    assignments: list[RosterAssignmentInput] = []
    unmatched: list[str] = []
    errors: list[str] = []
    matched = 0
    for name, codes in grid.items():
        user = resolve_user(name, users)
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
    _, preview = await _resolve_grid(session, payload)
    return preview


async def import_roster_grid(
    *, session: AsyncSession, current_user: User, payload: RosterGridImportRequest
) -> RosterGridImportResult:
    require_permission(current_user=current_user, permission_key="roster.manage")
    if payload.period_end < payload.period_start:
        raise HRValidationError(ERROR_ROSTER_PERIOD_END_BEFORE_START)
    assignments, preview = await _resolve_grid(session, payload)
    if not preview.can_import:
        raise HRValidationError(ERROR_GRID_NOT_IMPORTABLE)

    result = await session.execute(
        select(RosterPeriod).where(
            col(RosterPeriod.department_id) == payload.department_id,
            col(RosterPeriod.period_start) == payload.period_start,
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
    result = await session.execute(
        select(ShiftCatalog).where(col(ShiftCatalog.is_active) == True)  # noqa: E712
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
    catalog_result = await session.execute(select(ShiftCatalog))
    known_shifts = [s for s in catalog_result.scalars().all() if s.is_active]
    _, valid_assignments = _validate_csv_rows(
        csv_text=payload.csv_text,
        known_shift_codes={shift.code for shift in known_shifts},
    )
    job = RosterImportJob(
        department_id=payload.department_id,
        roster_period_id=payload.roster_period_id,
        file_name=payload.file_name,
        status=ImportStatus.VALIDATED
        if validation_result.invalid_rows == 0
        else ImportStatus.FAILED,
        created_by_user_id=current_user.id,
        total_rows=validation_result.total_rows,
        valid_rows=validation_result.valid_rows,
        invalid_rows=validation_result.invalid_rows,
        error_summary=None
        if validation_result.invalid_rows == 0
        else ERROR_CSV_IMPORT_INVALID_ROWS,
    )
    session.add(job)
    await session.commit()
    await session.refresh(job)

    for row in validation_result.rows:
        raw_data: dict[str, object] = {}
        if row.row_number - 2 < len(valid_assignments):
            valid_assignment = valid_assignments[row.row_number - 2]
            raw_data = valid_assignment.model_dump(mode="json")
        session.add(
            RosterImportRow(
                roster_import_job_id=job.id,
                row_number=row.row_number,
                raw_data=raw_data,
                validation_errors=row.errors,
                is_valid=row.is_valid,
            )
        )
    await session.commit()

    if validation_result.invalid_rows == 0 and payload.roster_period_id:
        created_assignments = [
            RosterAssignment(
                roster_period_id=payload.roster_period_id,
                user_id=assignment.user_id,
                assignment_date=assignment.assignment_date,
                shift_code=assignment.shift_code,
                remarks=assignment.remarks,
            )
            for assignment in valid_assignments
        ]
        session.add_all(created_assignments)
        job.status = ImportStatus.COMPLETED
        job.updated_at = utc_now()
        session.add(job)
        await session.commit()
        await session.refresh(job)
    return job
