from datetime import date
from typing import Any

from fastapi import APIRouter, Response, status

from src.dependencies import CurrentUser, SessionDep
from src.hr.dependencies import StatusReportDep
from src.hr.submission import submission_list, submission_public
from src.pagination import PaginationDep

from . import service
from .schemas import (
    StatusReportCreate,
    StatusReportDetails,
    StatusReportEntryPublic,
    StatusReportListPublic,
    StatusReportPublic,
    StatusReportSubmit,
    StatusStaffingPublic,
)

router = APIRouter(prefix="/hr", tags=["hr-dailystatus"])


@router.get(
    "/status-reports/staffing",
    response_model=StatusStaffingPublic,
    status_code=status.HTTP_200_OK,
    operation_id="hrGetStatusStaffing",
    summary="Get planned shift staffing",
    description="Published or closed roster staff and approved exceptions for the local M/E/N shift start date. Scheduled staffing does not establish actual attendance. Requires scoped status.report.create permission.",
    responses={
        400: {"description": "Invalid reporting shift"},
        403: {"description": "Department access denied"},
        404: {"description": "Department not found"},
    },
)
async def get_status_staffing(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    department_id: str,
    report_date: date,
    shift_code: str,
) -> Any:
    return await service.staffing_for_shift(
        session=session,
        actor=current_user,
        department_id=department_id,
        report_date=report_date,
        shift_code=shift_code,
    )


@router.post(
    "/status-reports/preview-pdf",
    response_class=Response,
    status_code=status.HTTP_200_OK,
    operation_id="hrPreviewStatusReportPdf",
    summary="Preview a daily status report PDF",
    description="Render unsaved status values using the signed-document Python renderer. No report, workflow or signature is saved. Requires scoped status.report.create permission.",
    responses={
        200: {"content": {"application/pdf": {}}},
        400: {"description": "Invalid report values"},
        403: {"description": "Department access denied"},
        404: {"description": "Department not found"},
    },
)
async def preview_status_report_pdf(
    *, session: SessionDep, current_user: CurrentUser, payload: StatusReportCreate
) -> Response:
    pdf = await service.preview_status_report_pdf(
        session=session, actor=current_user, payload=payload
    )
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={
            "Cache-Control": "private, no-store",
            "X-Content-Type-Options": "nosniff",
            "Content-Disposition": 'inline; filename="daily-status-preview.pdf"',
        },
    )


@router.post(
    "/status-reports",
    response_model=StatusReportDetails,
    status_code=status.HTTP_201_CREATED,
    summary="Create status report",
    description="Create a scoped shift status report with persisted personnel entries. M/E/N submission requires confirmed operational answers and personnel status. Requires status.report.create permission.",
    responses={
        status.HTTP_201_CREATED: {"description": "Status report created"},
        status.HTTP_400_BAD_REQUEST: {
            "description": "Invalid personnel or operational answers"
        },
        status.HTTP_403_FORBIDDEN: {"description": "Insufficient permission"},
    },
)
async def create_status_report(
    *, session: SessionDep, current_user: CurrentUser, payload: StatusReportCreate
) -> Any:
    report, entries = await service.create_status_report(
        session=session, current_user=current_user, payload=payload
    )
    return StatusReportDetails(
        report=await submission_public(session, report, StatusReportPublic),
        entries=[
            StatusReportEntryPublic.model_validate(e, from_attributes=True)
            for e in entries
        ],
    )


@router.post(
    "/status-reports/{report_id}/submit",
    response_model=StatusReportPublic,
    summary="Submit a draft status report",
    description="Submit a previously-saved DRAFT status report, attaching named co-approvers. Requires status.report.create permission and ownership of the report.",
    responses={
        status.HTTP_200_OK: {"description": "Status report submitted"},
        status.HTTP_400_BAD_REQUEST: {
            "description": "Status report is not a draft or contains invalid personnel or operational answers"
        },
        status.HTTP_403_FORBIDDEN: {
            "description": "Not allowed to submit this status report"
        },
        status.HTTP_404_NOT_FOUND: {"description": "Status report not found"},
    },
)
async def submit_status_report(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    report: StatusReportDep,
    payload: StatusReportSubmit,
) -> Any:
    submitted = await service.submit_status_report(
        session=session,
        current_user=current_user,
        status_report_id=report.id,
        payload=payload,
    )
    return await submission_public(session, submitted, StatusReportPublic)


@router.patch(
    "/status-reports/{report_id}",
    response_model=StatusReportPublic,
    summary="Edit a draft status report",
    description="Update a still-DRAFT status report (and its personnel entries) in place. Requires status.report.create permission and ownership.",
    responses={
        status.HTTP_200_OK: {"description": "Status report updated"},
        status.HTTP_400_BAD_REQUEST: {
            "description": "Status report is not a draft or contains invalid personnel or operational answers"
        },
        status.HTTP_403_FORBIDDEN: {
            "description": "Not allowed to edit this status report"
        },
        status.HTTP_404_NOT_FOUND: {"description": "Status report not found"},
    },
)
async def update_status_report(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    report: StatusReportDep,
    payload: StatusReportCreate,
) -> Any:
    updated = await service.update_status_report(
        session=session,
        current_user=current_user,
        report_id=report.id,
        payload=payload,
    )
    return await submission_public(session, updated, StatusReportPublic)


@router.delete(
    "/status-reports/{report_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a draft status report",
    description="Delete an own DRAFT status report. Requires status.report.create permission and ownership.",
    responses={
        status.HTTP_204_NO_CONTENT: {"description": "Status report deleted"},
        status.HTTP_400_BAD_REQUEST: {
            "description": "Status report is not a draft or contains invalid personnel or operational answers"
        },
        status.HTTP_403_FORBIDDEN: {
            "description": "Not allowed to delete this status report"
        },
        status.HTTP_404_NOT_FOUND: {"description": "Status report not found"},
    },
)
async def delete_status_report(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    report: StatusReportDep,
) -> None:
    await service.delete_status_report(
        session=session,
        current_user=current_user,
        report_id=report.id,
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
async def read_status_reports(
    session: SessionDep,
    current_user: CurrentUser,
    pagination: PaginationDep,
    department_id: str | None = None,
) -> Any:
    rows, total = await service.list_status_reports(
        session=session,
        current_user=current_user,
        department_id=department_id,
        skip=pagination.skip,
        limit=pagination.limit,
    )
    return StatusReportListPublic(
        data=await submission_list(session, rows, StatusReportPublic),
        count=total,
        page=pagination.page,
        size=pagination.size,
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
async def read_status_report(
    session: SessionDep,
    current_user: CurrentUser,
    report: StatusReportDep,
) -> Any:
    report_data, entries = await service.read_status_report_details(
        session=session, current_user=current_user, report_id=report.id
    )
    return StatusReportDetails(
        report=await submission_public(session, report_data, StatusReportPublic),
        entries=[
            StatusReportEntryPublic.model_validate(e, from_attributes=True)
            for e in entries
        ],
    )
