from typing import Any

from fastapi import APIRouter, status

from src.dependencies import CurrentUser, SessionDep
from src.hr.dependencies import PublicHolidayDep, RosterPeriodDep

from . import service
from .models import RosterPeriodStatus
from .schemas import (
    PublicHolidayCreate,
    PublicHolidayPublic,
    PublicHolidaysPublic,
    RosterAssignmentBulkCreate,
    RosterAssignmentPublic,
    RosterCsvImportResponse,
    RosterCsvValidationRequest,
    RosterCsvValidationResponse,
    RosterGridImportRequest,
    RosterGridImportResult,
    RosterGridPreview,
    RosterPeriodCreate,
    RosterPeriodDetails,
    RosterPeriodPublic,
    RosterPeriodsPublic,
    RosterRevisionPublic,
    RosterRevisionsPublic,
    ShiftCatalogCreate,
    ShiftCatalogPublic,
    ShiftCatalogsPublic,
    ShiftCatalogUpdate,
)

router = APIRouter(prefix="/hr/rosters", tags=["hr-rosters"])


@router.get(
    "/shifts",
    response_model=ShiftCatalogsPublic,
    summary="List shift catalog",
    description=(
        "Return the shift catalog for roster assignment. Pass "
        "include_inactive=true (requires roster.manage) to include deactivated "
        "shift types for management screens."
    ),
    responses={
        status.HTTP_200_OK: {"description": "Shift catalog returned"},
        status.HTTP_403_FORBIDDEN: {"description": "Insufficient permission"},
    },
)
async def list_shift_catalog(
    session: SessionDep,
    current_user: CurrentUser,
    include_inactive: bool = False,
) -> Any:
    shifts = await service.read_shift_catalog(
        session=session,
        current_user=current_user,
        include_inactive=include_inactive,
    )
    return ShiftCatalogsPublic(
        data=[
            ShiftCatalogPublic.model_validate(shift, from_attributes=True)
            for shift in shifts
        ],
        count=len(shifts),
    )


@router.post(
    "/shifts",
    response_model=ShiftCatalogPublic,
    status_code=status.HTTP_201_CREATED,
    summary="Create shift type",
    description="Create a shift catalog entry. Requires roster.manage permission.",
    responses={
        status.HTTP_201_CREATED: {"description": "Shift type created"},
        status.HTTP_400_BAD_REQUEST: {"description": "A shift with this code exists"},
        status.HTTP_403_FORBIDDEN: {"description": "Insufficient permission"},
    },
)
async def create_shift(
    *, session: SessionDep, current_user: CurrentUser, payload: ShiftCatalogCreate
) -> Any:
    shift = await service.create_shift(
        session=session, current_user=current_user, shift_in=payload
    )
    return ShiftCatalogPublic.model_validate(shift, from_attributes=True)


@router.patch(
    "/shifts/{code}",
    response_model=ShiftCatalogPublic,
    summary="Update or deactivate shift type",
    description=(
        "Update a shift catalog entry; set is_active=false to deactivate it "
        "(historical rosters are preserved). Requires roster.manage permission."
    ),
    responses={
        status.HTTP_200_OK: {"description": "Shift type updated"},
        status.HTTP_403_FORBIDDEN: {"description": "Insufficient permission"},
        status.HTTP_404_NOT_FOUND: {"description": "Shift type not found"},
    },
)
async def update_shift(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    code: str,
    payload: ShiftCatalogUpdate,
) -> Any:
    shift = await service.update_shift(
        session=session, current_user=current_user, code=code, shift_in=payload
    )
    return ShiftCatalogPublic.model_validate(shift, from_attributes=True)


@router.get(
    "/periods",
    response_model=RosterPeriodsPublic,
    summary="List roster periods",
    description="Return roster periods for a department, newest first. Requires roster.view permission.",
    responses={
        status.HTTP_200_OK: {"description": "Roster periods returned"},
        status.HTTP_403_FORBIDDEN: {"description": "Insufficient permission"},
    },
)
async def list_periods(
    session: SessionDep,
    current_user: CurrentUser,
    department_id: str,
    period_status: RosterPeriodStatus | None = None,
) -> Any:
    periods = await service.list_roster_periods(
        session=session,
        current_user=current_user,
        department_id=department_id,
        period_status=period_status,
    )
    return RosterPeriodsPublic(
        data=[
            RosterPeriodPublic.model_validate(period, from_attributes=True)
            for period in periods
        ],
        count=len(periods),
    )


@router.post(
    "/periods",
    response_model=RosterPeriodPublic,
    status_code=status.HTTP_201_CREATED,
    summary="Create roster period",
    description="Create a new roster period. Requires roster.manage permission.",
    responses={
        status.HTTP_201_CREATED: {"description": "Roster period created"},
        status.HTTP_400_BAD_REQUEST: {
            "description": "Validation error (e.g. period_end before period_start)"
        },
        status.HTTP_403_FORBIDDEN: {"description": "Insufficient permission"},
    },
)
async def create_period(
    *, session: SessionDep, current_user: CurrentUser, payload: RosterPeriodCreate
) -> Any:
    return await service.create_roster_period(
        session=session, current_user=current_user, period_in=payload
    )


@router.post(
    "/assignments/bulk",
    response_model=list[RosterAssignmentPublic],
    summary="Bulk upsert roster assignments",
    description="Create or replace roster assignments for a period. Requires roster.manage permission.",
    responses={
        status.HTTP_200_OK: {"description": "Assignments created or updated"},
        status.HTTP_404_NOT_FOUND: {"description": "Roster period not found"},
        status.HTTP_403_FORBIDDEN: {"description": "Insufficient permission"},
    },
)
async def bulk_assignments(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    payload: RosterAssignmentBulkCreate,
) -> Any:
    assignments = await service.bulk_upsert_roster_assignments(
        session=session, current_user=current_user, payload=payload
    )
    return [
        RosterAssignmentPublic.model_validate(assignment, from_attributes=True)
        for assignment in assignments
    ]


@router.get(
    "/periods/{period_id}",
    response_model=RosterPeriodDetails,
    summary="Get roster period details",
    description="Return a roster period and its assignments. Requires roster.view permission.",
    responses={
        status.HTTP_200_OK: {"description": "Period and assignments returned"},
        status.HTTP_404_NOT_FOUND: {"description": "Roster period not found"},
        status.HTTP_403_FORBIDDEN: {"description": "Insufficient permission"},
    },
)
async def get_period(
    session: SessionDep,
    current_user: CurrentUser,
    period: RosterPeriodDep,
) -> Any:
    period_data, assignments = await service.read_roster_period_details(
        session=session, current_user=current_user, period_id=period.id
    )
    return RosterPeriodDetails(
        period=RosterPeriodPublic.model_validate(period_data, from_attributes=True),
        assignments=[
            RosterAssignmentPublic.model_validate(assignment, from_attributes=True)
            for assignment in assignments
        ],
    )


@router.post(
    "/import-grid/validate",
    response_model=RosterGridPreview,
    summary="Preview a grid roster import",
    description="Parse a name×day grid CSV, match names to department staff, and report unmatched names / invalid codes without importing. Requires roster.manage permission.",
    responses={
        status.HTTP_200_OK: {"description": "Preview returned"},
        status.HTTP_403_FORBIDDEN: {"description": "Insufficient permission"},
        status.HTTP_404_NOT_FOUND: {"description": "Department not found"},
    },
)
async def validate_grid(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    payload: RosterGridImportRequest,
) -> Any:
    return await service.validate_roster_grid(
        session=session, current_user=current_user, payload=payload
    )


@router.post(
    "/import-grid",
    response_model=RosterGridImportResult,
    summary="Import a grid roster",
    description="Import a name×day grid CSV into a draft roster period (created or reused for the month). Blocked if any name is unmatched or any code invalid. Requires roster.manage permission.",
    responses={
        status.HTTP_200_OK: {"description": "Roster imported"},
        status.HTTP_400_BAD_REQUEST: {
            "description": "Grid has unmatched names or invalid codes"
        },
        status.HTTP_403_FORBIDDEN: {"description": "Insufficient permission"},
        status.HTTP_404_NOT_FOUND: {"description": "Department not found"},
    },
)
async def import_grid(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    payload: RosterGridImportRequest,
) -> Any:
    return await service.import_roster_grid(
        session=session, current_user=current_user, payload=payload
    )


@router.post(
    "/import-csv/validate",
    response_model=RosterCsvValidationResponse,
    summary="Validate roster CSV",
    description="Validate CSV content for roster import. Requires roster.import permission.",
    responses={
        status.HTTP_200_OK: {"description": "Validation result returned"},
        status.HTTP_400_BAD_REQUEST: {
            "description": "Invalid CSV (e.g. missing header or columns)"
        },
        status.HTTP_403_FORBIDDEN: {"description": "Insufficient permission"},
    },
)
async def validate_csv(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    payload: RosterCsvValidationRequest,
) -> Any:
    return await service.validate_roster_csv(
        session=session, current_user=current_user, payload=payload
    )


@router.post(
    "/import-csv",
    response_model=RosterCsvImportResponse,
    summary="Import roster from CSV",
    description="Create roster import job and optionally apply valid rows. Requires roster.import permission.",
    responses={
        status.HTTP_200_OK: {"description": "Import job created"},
        status.HTTP_400_BAD_REQUEST: {"description": "Invalid CSV"},
        status.HTTP_403_FORBIDDEN: {"description": "Insufficient permission"},
    },
)
async def import_csv(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    payload: RosterCsvValidationRequest,
) -> Any:
    job = await service.import_roster_csv(
        session=session, current_user=current_user, payload=payload
    )
    return RosterCsvImportResponse(
        job_id=job.id,
        status=job.status,
        total_rows=job.total_rows,
        valid_rows=job.valid_rows,
        invalid_rows=job.invalid_rows,
    )


# ---------------------------------------------------------------------------
# Roster period lifecycle
# ---------------------------------------------------------------------------


@router.patch(
    "/periods/{period_id}/publish",
    response_model=RosterPeriodPublic,
    summary="Publish roster period",
    description="Transition a draft roster period to published. Requires roster.manage permission.",
    responses={
        status.HTTP_200_OK: {"description": "Roster period published"},
        status.HTTP_400_BAD_REQUEST: {
            "description": "Period already published or closed"
        },
        status.HTTP_404_NOT_FOUND: {"description": "Roster period not found"},
        status.HTTP_403_FORBIDDEN: {"description": "Insufficient permission"},
    },
)
async def publish_period(
    *, session: SessionDep, current_user: CurrentUser, period: RosterPeriodDep
) -> Any:
    return await service.publish_roster_period(
        session=session, current_user=current_user, period_id=period.id
    )


@router.patch(
    "/periods/{period_id}/close",
    response_model=RosterPeriodPublic,
    summary="Close roster period",
    description="Close a published roster period. Requires roster.manage permission.",
    responses={
        status.HTTP_200_OK: {"description": "Roster period closed"},
        status.HTTP_400_BAD_REQUEST: {
            "description": "Period not published or already closed"
        },
        status.HTTP_404_NOT_FOUND: {"description": "Roster period not found"},
        status.HTTP_403_FORBIDDEN: {"description": "Insufficient permission"},
    },
)
async def close_period(
    *, session: SessionDep, current_user: CurrentUser, period: RosterPeriodDep
) -> Any:
    return await service.close_roster_period(
        session=session, current_user=current_user, period_id=period.id
    )


@router.get(
    "/periods/{period_id}/revisions",
    response_model=RosterRevisionsPublic,
    summary="List roster period revisions",
    description="Return the revision history for a roster period. Requires roster.view permission.",
    responses={
        status.HTTP_200_OK: {"description": "Revisions returned"},
        status.HTTP_404_NOT_FOUND: {"description": "Roster period not found"},
        status.HTTP_403_FORBIDDEN: {"description": "Insufficient permission"},
    },
)
async def get_period_revisions(
    session: SessionDep,
    current_user: CurrentUser,
    period: RosterPeriodDep,
) -> Any:
    revisions = await service.list_roster_revisions(
        session=session, current_user=current_user, period_id=period.id
    )
    return RosterRevisionsPublic(
        data=[
            RosterRevisionPublic.model_validate(rev, from_attributes=True)
            for rev in revisions
        ],
        count=len(revisions),
    )


# ---------------------------------------------------------------------------
# Public Holidays
# ---------------------------------------------------------------------------


@router.post(
    "/public-holidays",
    response_model=PublicHolidayPublic,
    status_code=status.HTTP_201_CREATED,
    summary="Create public holiday",
    description="Add a public holiday. Requires roster.manage permission.",
    responses={
        status.HTTP_200_OK: {"description": "Public holiday created"},
        status.HTTP_400_BAD_REQUEST: {"description": "Duplicate date"},
        status.HTTP_403_FORBIDDEN: {"description": "Insufficient permission"},
    },
)
async def create_holiday(
    *, session: SessionDep, current_user: CurrentUser, payload: PublicHolidayCreate
) -> Any:
    return await service.create_public_holiday(
        session=session, current_user=current_user, payload=payload
    )


@router.get(
    "/public-holidays",
    response_model=PublicHolidaysPublic,
    summary="List public holidays",
    description="Return public holidays, optionally filtered by year. Requires roster.view permission.",
    responses={
        status.HTTP_200_OK: {"description": "Public holidays returned"},
        status.HTTP_403_FORBIDDEN: {"description": "Insufficient permission"},
    },
)
async def list_holidays(
    session: SessionDep, current_user: CurrentUser, year: int | None = None
) -> Any:
    holidays = await service.list_public_holidays(
        session=session, current_user=current_user, year=year
    )
    return PublicHolidaysPublic(
        data=[
            PublicHolidayPublic.model_validate(h, from_attributes=True)
            for h in holidays
        ],
        count=len(holidays),
    )


@router.delete(
    "/public-holidays/{holiday_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete public holiday",
    description="Remove a public holiday. Requires roster.manage permission.",
    responses={
        status.HTTP_204_NO_CONTENT: {"description": "Public holiday deleted"},
        status.HTTP_404_NOT_FOUND: {"description": "Public holiday not found"},
        status.HTTP_403_FORBIDDEN: {"description": "Insufficient permission"},
    },
)
async def remove_holiday(
    *, session: SessionDep, current_user: CurrentUser, holiday: PublicHolidayDep
) -> None:
    await service.delete_public_holiday(
        session=session, current_user=current_user, holiday_id=holiday.id
    )
