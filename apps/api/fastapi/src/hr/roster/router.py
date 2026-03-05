import uuid
from typing import Any

from fastapi import APIRouter

from src.dependencies import CurrentUser, SessionDep

from .schemas import (
    RosterAssignmentBulkCreate,
    RosterAssignmentPublic,
    RosterCsvImportResponse,
    RosterCsvValidationRequest,
    RosterCsvValidationResponse,
    RosterPeriodCreate,
    RosterPeriodDetails,
    RosterPeriodPublic,
    ShiftCatalogPublic,
    ShiftCatalogsPublic,
)
from .service import (
    bulk_upsert_roster_assignments,
    create_roster_period,
    import_roster_csv,
    read_roster_period_details,
    read_shift_catalog,
    validate_roster_csv,
)

router = APIRouter(prefix="/hr/rosters", tags=["hr-rosters"])


@router.get("/shifts", response_model=ShiftCatalogsPublic)
def list_shift_catalog(session: SessionDep, current_user: CurrentUser) -> Any:
    shifts = read_shift_catalog(session=session, current_user=current_user)
    return ShiftCatalogsPublic(
        data=[ShiftCatalogPublic.model_validate(shift, from_attributes=True) for shift in shifts],
        count=len(shifts),
    )


@router.post("/periods", response_model=RosterPeriodPublic)
def create_period(
    *, session: SessionDep, current_user: CurrentUser, payload: RosterPeriodCreate
) -> Any:
    return create_roster_period(session=session, current_user=current_user, period_in=payload)


@router.post("/assignments/bulk", response_model=list[RosterAssignmentPublic])
def bulk_assignments(
    *, session: SessionDep, current_user: CurrentUser, payload: RosterAssignmentBulkCreate
) -> Any:
    assignments = bulk_upsert_roster_assignments(
        session=session, current_user=current_user, payload=payload
    )
    return [
        RosterAssignmentPublic.model_validate(assignment, from_attributes=True)
        for assignment in assignments
    ]


@router.get("/periods/{period_id}", response_model=RosterPeriodDetails)
def get_period(
    session: SessionDep, current_user: CurrentUser, period_id: uuid.UUID
) -> Any:
    period, assignments = read_roster_period_details(
        session=session, current_user=current_user, period_id=period_id
    )
    return RosterPeriodDetails(
        period=RosterPeriodPublic.model_validate(period, from_attributes=True),
        assignments=[
            RosterAssignmentPublic.model_validate(assignment, from_attributes=True)
            for assignment in assignments
        ],
    )


@router.post("/import-csv/validate", response_model=RosterCsvValidationResponse)
def validate_csv(
    *, session: SessionDep, current_user: CurrentUser, payload: RosterCsvValidationRequest
) -> Any:
    return validate_roster_csv(session=session, current_user=current_user, payload=payload)


@router.post("/import-csv", response_model=RosterCsvImportResponse)
def import_csv(
    *, session: SessionDep, current_user: CurrentUser, payload: RosterCsvValidationRequest
) -> Any:
    job = import_roster_csv(session=session, current_user=current_user, payload=payload)
    return RosterCsvImportResponse(
        job_id=job.id,
        status=job.status,
        total_rows=job.total_rows,
        valid_rows=job.valid_rows,
        invalid_rows=job.invalid_rows,
    )
