import csv
import uuid
from datetime import datetime
from io import StringIO

from fastapi import HTTPException
from sqlmodel import Session, col, delete, select

from src.auth.models import User
from src.hr.authz import require_permission

from .models import (
    ImportStatus,
    RosterAssignment,
    RosterImportJob,
    RosterImportRow,
    RosterPeriod,
    ShiftCatalog,
)
from .schemas import (
    RosterAssignmentBulkCreate,
    RosterAssignmentInput,
    RosterCsvRowValidation,
    RosterCsvValidationRequest,
    RosterCsvValidationResponse,
    RosterPeriodCreate,
)

REQUIRED_CSV_COLUMNS = {"user_id", "assignment_date", "shift_code"}


def read_shift_catalog(session: Session) -> list[ShiftCatalog]:
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
        raise HTTPException(status_code=400, detail="period_end must be after period_start")
    db_period = RosterPeriod.model_validate(
        period_in,
        update={
            "created_by_user_id": current_user.id,
        },
    )
    session.add(db_period)
    session.commit()
    session.refresh(db_period)
    return db_period


def bulk_upsert_roster_assignments(
    *, session: Session, current_user: User, payload: RosterAssignmentBulkCreate
) -> list[RosterAssignment]:
    require_permission(current_user=current_user, permission_key="roster.manage")
    period = session.get(RosterPeriod, payload.roster_period_id)
    if not period:
        raise HTTPException(status_code=404, detail="Roster period not found")
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
    *, session: Session, period_id: uuid.UUID
) -> tuple[RosterPeriod, list[RosterAssignment]]:
    period = session.get(RosterPeriod, period_id)
    if not period:
        raise HTTPException(status_code=404, detail="Roster period not found")
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
        raise HTTPException(status_code=400, detail="CSV has no header")
    normalized_headers = {header.strip() for header in reader.fieldnames if header}
    missing_headers = REQUIRED_CSV_COLUMNS - normalized_headers
    if missing_headers:
        raise HTTPException(
            status_code=400,
            detail=f"CSV missing columns: {', '.join(sorted(missing_headers))}",
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
        else "CSV import has invalid rows",
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
