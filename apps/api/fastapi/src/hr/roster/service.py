import csv
import uuid
from datetime import datetime
from io import StringIO

from sqlmodel import Session, col, delete, select

from src.auth.models import User
from src.auth.policy import require_permission
from src.hr.constants import (
    ERROR_CSV_IMPORT_INVALID_ROWS,
    ERROR_CSV_MISSING_COLUMNS,
    ERROR_CSV_NO_HEADER,
    ERROR_PUBLIC_HOLIDAY_DUPLICATE_DATE,
    ERROR_ROSTER_PERIOD_ALREADY_CLOSED,
    ERROR_ROSTER_PERIOD_ALREADY_PUBLISHED,
    ERROR_ROSTER_PERIOD_END_BEFORE_START,
    ERROR_ROSTER_PERIOD_NOT_PUBLISHED,
)
from src.hr.dependencies import (
    get_public_holiday_or_404,
    get_roster_period_or_404,
)
from src.hr.exceptions import (
    HRValidationError,
)

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
)
from .schemas import (
    PublicHolidayCreate,
    RosterAssignmentBulkCreate,
    RosterAssignmentInput,
    RosterCsvRowValidation,
    RosterCsvValidationRequest,
    RosterCsvValidationResponse,
    RosterPeriodCreate,
)

REQUIRED_CSV_COLUMNS = {"user_id", "assignment_date", "shift_code"}


# ---------------------------------------------------------------------------
# Public Holidays
# ---------------------------------------------------------------------------


def create_public_holiday(
    *, session: Session, current_user: User, payload: PublicHolidayCreate
) -> PublicHoliday:
    require_permission(current_user=current_user, permission_key="roster.manage")
    existing = session.exec(
        select(PublicHoliday).where(col(PublicHoliday.holiday_date) == payload.holiday_date)
    ).first()
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
    session.commit()
    session.refresh(holiday)
    return holiday


def list_public_holidays(
    *, session: Session, current_user: User, year: int | None = None
) -> list[PublicHoliday]:
    require_permission(current_user=current_user, permission_key="roster.view")
    statement = select(PublicHoliday).order_by(col(PublicHoliday.holiday_date))
    if year is not None:
        import sqlalchemy as sa_filter

        statement = statement.where(
            sa_filter.extract("year", PublicHoliday.holiday_date) == year
        )
    return list(session.exec(statement).all())


def delete_public_holiday(
    *, session: Session, current_user: User, holiday_id: uuid.UUID
) -> None:
    require_permission(current_user=current_user, permission_key="roster.manage")
    holiday = get_public_holiday_or_404(session=session, holiday_id=holiday_id)
    session.delete(holiday)
    session.commit()


# ---------------------------------------------------------------------------
# Roster Revisions
# ---------------------------------------------------------------------------


def _create_revision(
    *,
    session: Session,
    roster_period_id: uuid.UUID,
    action: RosterRevisionAction,
    changed_by_user_id: uuid.UUID,
    summary: str | None = None,
    snapshot: dict | None = None,
) -> RosterRevision:
    last_rev = session.exec(
        select(RosterRevision)
        .where(col(RosterRevision.roster_period_id) == roster_period_id)
        .order_by(col(RosterRevision.revision_number).desc())
    ).first()
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


def list_roster_revisions(
    *, session: Session, current_user: User, period_id: uuid.UUID
) -> list[RosterRevision]:
    require_permission(current_user=current_user, permission_key="roster.view")
    get_roster_period_or_404(session=session, period_id=period_id)
    return list(
        session.exec(
            select(RosterRevision)
            .where(col(RosterRevision.roster_period_id) == period_id)
            .order_by(col(RosterRevision.revision_number))
        ).all()
    )


def publish_roster_period(
    *, session: Session, current_user: User, period_id: uuid.UUID
) -> RosterPeriod:
    require_permission(current_user=current_user, permission_key="roster.manage")
    period = get_roster_period_or_404(session=session, period_id=period_id)
    if period.status == RosterPeriodStatus.PUBLISHED:
        raise HRValidationError(ERROR_ROSTER_PERIOD_ALREADY_PUBLISHED)
    if period.status == RosterPeriodStatus.CLOSED:
        raise HRValidationError(ERROR_ROSTER_PERIOD_ALREADY_CLOSED)
    period.status = RosterPeriodStatus.PUBLISHED
    period.updated_at = datetime.utcnow()
    session.add(period)
    assignment_count = len(
        list(
            session.exec(
                select(RosterAssignment).where(
                    col(RosterAssignment.roster_period_id) == period_id
                )
            ).all()
        )
    )
    _create_revision(
        session=session,
        roster_period_id=period_id,
        action=RosterRevisionAction.PUBLISHED,
        changed_by_user_id=current_user.id,
        summary=f"Published with {assignment_count} assignments",
        snapshot={"assignment_count": assignment_count},
    )
    session.commit()
    session.refresh(period)
    return period


def close_roster_period(
    *, session: Session, current_user: User, period_id: uuid.UUID
) -> RosterPeriod:
    require_permission(current_user=current_user, permission_key="roster.manage")
    period = get_roster_period_or_404(session=session, period_id=period_id)
    if period.status == RosterPeriodStatus.CLOSED:
        raise HRValidationError(ERROR_ROSTER_PERIOD_ALREADY_CLOSED)
    if period.status != RosterPeriodStatus.PUBLISHED:
        raise HRValidationError(ERROR_ROSTER_PERIOD_NOT_PUBLISHED)
    period.status = RosterPeriodStatus.CLOSED
    period.updated_at = datetime.utcnow()
    session.add(period)
    _create_revision(
        session=session,
        roster_period_id=period_id,
        action=RosterRevisionAction.CLOSED,
        changed_by_user_id=current_user.id,
    )
    session.commit()
    session.refresh(period)
    return period


# ---------------------------------------------------------------------------
# Shift Catalog
# ---------------------------------------------------------------------------


def read_shift_catalog(*, session: Session, current_user: User) -> list[ShiftCatalog]:
    require_permission(current_user=current_user, permission_key="roster.view")
    return list(
        session.exec(
            select(ShiftCatalog).where(col(ShiftCatalog.is_active) == True)  # noqa: E712
        ).all()
    )


def create_roster_period(
    *, session: Session, current_user: User, period_in: RosterPeriodCreate
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
    session.commit()
    session.refresh(db_period)
    _create_revision(
        session=session,
        roster_period_id=db_period.id,
        action=RosterRevisionAction.CREATED,
        changed_by_user_id=current_user.id,
        summary=f"Period {period_in.period_start} to {period_in.period_end}",
    )
    session.commit()
    return db_period


def bulk_upsert_roster_assignments(
    *, session: Session, current_user: User, payload: RosterAssignmentBulkCreate
) -> list[RosterAssignment]:
    require_permission(current_user=current_user, permission_key="roster.manage")
    get_roster_period_or_404(session=session, period_id=payload.roster_period_id)
    if not payload.assignments:
        return []

    # Replace existing rows for the provided users+dates with fresh rows.
    for assignment in payload.assignments:
        statement = delete(RosterAssignment).where(
            col(RosterAssignment.user_id) == assignment.user_id,
            col(RosterAssignment.assignment_date) == assignment.assignment_date,
        )
        session.exec(statement)
        session.add(
            RosterAssignment(
                roster_period_id=payload.roster_period_id,
                user_id=assignment.user_id,
                assignment_date=assignment.assignment_date,
                shift_code=assignment.shift_code,
                remarks=assignment.remarks,
            )
        )
    _create_revision(
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
    session.commit()
    created_assignments = list(
        session.exec(
            select(RosterAssignment).where(
                col(RosterAssignment.roster_period_id) == payload.roster_period_id
            )
        ).all()
    )
    return created_assignments


def read_roster_period_details(
    *, session: Session, current_user: User, period_id: uuid.UUID
) -> tuple[RosterPeriod, list[RosterAssignment]]:
    require_permission(current_user=current_user, permission_key="roster.view")
    period = get_roster_period_or_404(session=session, period_id=period_id)
    assignments = list(
        session.exec(
            select(RosterAssignment)
            .where(col(RosterAssignment.roster_period_id) == period_id)
            .order_by(col(RosterAssignment.assignment_date))
        ).all()
    )
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


def validate_roster_csv(
    *, session: Session, current_user: User, payload: RosterCsvValidationRequest
) -> RosterCsvValidationResponse:
    require_permission(current_user=current_user, permission_key="roster.import")
    shift_codes = {
        item.code
        for item in session.exec(
            select(ShiftCatalog).where(col(ShiftCatalog.is_active) == True)  # noqa: E712
        ).all()
    }
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


def import_roster_csv(
    *, session: Session, current_user: User, payload: RosterCsvValidationRequest
) -> RosterImportJob:
    validation_result = validate_roster_csv(
        session=session, current_user=current_user, payload=payload
    )
    _, valid_assignments = _validate_csv_rows(
        csv_text=payload.csv_text,
        known_shift_codes={
            shift.code
            for shift in session.exec(select(ShiftCatalog)).all()
            if shift.is_active
        },
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
    session.commit()
    session.refresh(job)

    for row in validation_result.rows:
        raw_data = {}
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
    session.commit()

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
        job.updated_at = datetime.utcnow()
        session.add(job)
        session.commit()
        session.refresh(job)
    return job
