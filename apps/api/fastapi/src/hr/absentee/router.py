from typing import Any

from fastapi import APIRouter, status

from src.dependencies import CurrentUser, SessionDep
from src.pagination import PaginationDep

from . import service
from .schemas import (
    AbsenteeReportCreate,
    AbsenteeReportListPublic,
    AbsenteeReportPublic,
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
