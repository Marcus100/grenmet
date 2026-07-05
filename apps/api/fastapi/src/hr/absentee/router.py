import uuid
from typing import Any

from fastapi import APIRouter, status

from src.dependencies import CurrentUser, SessionDep
from src.pagination import PaginationDep

from . import service
from .schemas import (
    AbsenteeReportCreate,
    AbsenteeReportListPublic,
    AbsenteeReportPublic,
    AbsenteeReportSubmit,
)

router = APIRouter(prefix="/hr", tags=["hr-absentee"])


@router.post(
    "/absentee-reports",
    response_model=AbsenteeReportPublic,
    status_code=status.HTTP_201_CREATED,
    summary="Create absentee report",
    description="Create an absentee report. Requires absentee.report.create permission.",
    responses={
        status.HTTP_200_OK: {"description": "Absentee report created"},
        status.HTTP_403_FORBIDDEN: {"description": "Insufficient permission"},
    },
)
async def create_absentee_report(
    *, session: SessionDep, current_user: CurrentUser, payload: AbsenteeReportCreate
) -> Any:
    return await service.create_absentee_report(
        session=session, current_user=current_user, payload=payload
    )


@router.post(
    "/absentee-reports/{absentee_report_id}/submit",
    response_model=AbsenteeReportPublic,
    summary="Submit a draft absentee report",
    description="Submit a previously-saved DRAFT absentee report, attaching named co-approvers. Requires absentee.report.create permission and ownership of the report.",
    responses={
        status.HTTP_200_OK: {"description": "Absentee report submitted"},
        status.HTTP_400_BAD_REQUEST: {
            "description": "Absentee report is not a draft"
        },
        status.HTTP_403_FORBIDDEN: {
            "description": "Not allowed to submit this absentee report"
        },
        status.HTTP_404_NOT_FOUND: {"description": "Absentee report not found"},
    },
)
async def submit_absentee_report(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    absentee_report_id: uuid.UUID,
    payload: AbsenteeReportSubmit,
) -> Any:
    return await service.submit_absentee_report(
        session=session,
        current_user=current_user,
        absentee_report_id=absentee_report_id,
        payload=payload,
    )


@router.patch(
    "/absentee-reports/{absentee_report_id}",
    response_model=AbsenteeReportPublic,
    summary="Edit a draft absentee report",
    description="Update a still-DRAFT absentee report in place. Requires absentee.report.create permission and ownership.",
    responses={
        status.HTTP_200_OK: {"description": "Absentee report updated"},
        status.HTTP_400_BAD_REQUEST: {"description": "Absentee report is not a draft"},
        status.HTTP_403_FORBIDDEN: {
            "description": "Not allowed to edit this absentee report"
        },
        status.HTTP_404_NOT_FOUND: {"description": "Absentee report not found"},
    },
)
async def update_absentee_report(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    absentee_report_id: uuid.UUID,
    payload: AbsenteeReportCreate,
) -> Any:
    return await service.update_absentee_report(
        session=session,
        current_user=current_user,
        absentee_report_id=absentee_report_id,
        payload=payload,
    )


@router.delete(
    "/absentee-reports/{absentee_report_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a draft absentee report",
    description="Delete an own DRAFT absentee report. Requires absentee.report.create permission and ownership.",
    responses={
        status.HTTP_204_NO_CONTENT: {"description": "Absentee report deleted"},
        status.HTTP_400_BAD_REQUEST: {"description": "Absentee report is not a draft"},
        status.HTTP_403_FORBIDDEN: {
            "description": "Not allowed to delete this absentee report"
        },
        status.HTTP_404_NOT_FOUND: {"description": "Absentee report not found"},
    },
)
async def delete_absentee_report(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    absentee_report_id: uuid.UUID,
) -> None:
    await service.delete_absentee_report(
        session=session,
        current_user=current_user,
        absentee_report_id=absentee_report_id,
    )


@router.get(
    "/absentee-reports",
    response_model=AbsenteeReportListPublic,
    summary="List absentee reports",
    description="List absentee reports (own or by department). Department filter requires absentee.report.read.department.",
    responses={
        status.HTTP_200_OK: {"description": "Absentee reports returned"},
        status.HTTP_403_FORBIDDEN: {"description": "Insufficient permission"},
    },
)
async def read_absentee_reports(
    session: SessionDep,
    current_user: CurrentUser,
    pagination: PaginationDep,
    department_id: str | None = None,
) -> Any:
    rows, total = await service.list_absentee_reports(
        session=session,
        current_user=current_user,
        department_id=department_id,
        skip=pagination.skip,
        limit=pagination.limit,
    )
    return AbsenteeReportListPublic(
        data=[
            AbsenteeReportPublic.model_validate(item, from_attributes=True)
            for item in rows
        ],
        count=total,
        page=pagination.page,
        size=pagination.size,
    )
