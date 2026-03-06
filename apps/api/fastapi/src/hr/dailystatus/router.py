import uuid
from typing import Any

from fastapi import APIRouter, status

from src.dependencies import CurrentUser, SessionDep

from .schemas import (
    StatusReportCreate,
    StatusReportDetails,
    StatusReportEntryPublic,
    StatusReportListPublic,
    StatusReportPublic,
)
from .service import (
    create_status_report,
    list_status_reports,
    read_status_report_details,
)

router = APIRouter(prefix="/hr", tags=["hr-dailystatus"])


@router.post(
    "/status-reports",
    response_model=StatusReportDetails,
    summary="Create status report",
    description="Create a status report with optional personnel entries. Requires status.report.create permission.",
    responses={
        status.HTTP_200_OK: {"description": "Status report created"},
        status.HTTP_403_FORBIDDEN: {"description": "Insufficient permission"},
    },
)
def create_status_report_endpoint(
    *, session: SessionDep, current_user: CurrentUser, payload: StatusReportCreate
) -> Any:
    report, entries = create_status_report(
        session=session, current_user=current_user, payload=payload
    )
    return StatusReportDetails(
        report=StatusReportPublic.model_validate(report, from_attributes=True),
        entries=[
            StatusReportEntryPublic.model_validate(e, from_attributes=True)
            for e in entries
        ],
    )


@router.get(
    "/status-reports",
    response_model=StatusReportListPublic,
    summary="List status reports",
    description="List status reports. Requires status.report.read permission. Optionally filter by department_id.",
    responses={
        status.HTTP_200_OK: {"description": "Status reports returned"},
        status.HTTP_403_FORBIDDEN: {"description": "Insufficient permission"},
    },
)
def read_status_reports(
    session: SessionDep,
    current_user: CurrentUser,
    department_id: str | None = None,
) -> Any:
    rows = list_status_reports(
        session=session, current_user=current_user, department_id=department_id
    )
    return StatusReportListPublic(
        data=[StatusReportPublic.model_validate(item, from_attributes=True) for item in rows],
        count=len(rows),
    )


@router.get(
    "/status-reports/{report_id}",
    response_model=StatusReportDetails,
    summary="Get status report details",
    description="Return a status report with its personnel entries. Requires status.report.read permission.",
    responses={
        status.HTTP_200_OK: {"description": "Status report and entries returned"},
        status.HTTP_404_NOT_FOUND: {"description": "Status report not found"},
        status.HTTP_403_FORBIDDEN: {"description": "Insufficient permission"},
    },
)
def read_status_report_endpoint(
    session: SessionDep, current_user: CurrentUser, report_id: uuid.UUID
) -> Any:
    report, entries = read_status_report_details(
        session=session, current_user=current_user, report_id=report_id
    )
    return StatusReportDetails(
        report=StatusReportPublic.model_validate(report, from_attributes=True),
        entries=[
            StatusReportEntryPublic.model_validate(e, from_attributes=True)
            for e in entries
        ],
    )
