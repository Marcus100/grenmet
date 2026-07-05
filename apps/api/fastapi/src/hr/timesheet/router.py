from typing import Any

from fastapi import APIRouter, status

from src.dependencies import CurrentUser, SessionDep
from src.hr.dependencies import TimesheetDep
from src.pagination import PaginationDep

from . import service
from .schemas import (
    TimesheetCreate,
    TimesheetDetails,
    TimesheetEntryPublic,
    TimesheetListPublic,
    TimesheetPublic,
    TimesheetSubmitRequest,
    TimesheetSummaryByShift,
)

router = APIRouter(prefix="/hr/timesheets", tags=["hr-timesheets"])


@router.post(
    "",
    response_model=TimesheetDetails,
    status_code=status.HTTP_201_CREATED,
    summary="Create timesheet",
    description="Create a new timesheet (self or proxy). Policy controls self/proxy submission.",
    responses={
        status.HTTP_200_OK: {"description": "Timesheet and entries created"},
        status.HTTP_403_FORBIDDEN: {
            "description": "Self/proxy submission disabled or not allowed for user"
        },
    },
)
async def create_timesheet(
    *, session: SessionDep, current_user: CurrentUser, payload: TimesheetCreate
) -> Any:
    timesheet, entries = await service.create_timesheet(
        session=session, current_user=current_user, payload=payload
    )
    return TimesheetDetails(
        timesheet=TimesheetPublic.model_validate(timesheet, from_attributes=True),
        entries=[
            TimesheetEntryPublic.model_validate(entry, from_attributes=True)
            for entry in entries
        ],
    )


@router.patch(
    "/{timesheet_id}/submit",
    response_model=TimesheetPublic,
    summary="Submit timesheet",
    description="Submit a draft timesheet (self or proxy). Requires timesheet.submit.self or timesheet.submit.proxy.",
    responses={
        status.HTTP_200_OK: {"description": "Timesheet submitted"},
        status.HTTP_400_BAD_REQUEST: {"description": "Timesheet already submitted"},
        status.HTTP_403_FORBIDDEN: {
            "description": "Not allowed (self only for own; proxy not allowed)"
        },
        status.HTTP_404_NOT_FOUND: {"description": "Timesheet not found"},
    },
)
async def submit_timesheet(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    timesheet: TimesheetDep,
    payload: TimesheetSubmitRequest,
) -> Any:
    return await service.submit_timesheet(
        session=session,
        current_user=current_user,
        timesheet_id=timesheet.id,
        submission_mode=payload.mode,
    )


@router.patch(
    "/{timesheet_id}/approve",
    response_model=TimesheetPublic,
    summary="Approve timesheet",
    description="Approve a submitted timesheet. Requires timesheet.approve and scope over the user.",
    responses={
        status.HTTP_200_OK: {"description": "Timesheet approved"},
        status.HTTP_400_BAD_REQUEST: {"description": "Timesheet is not submitted"},
        status.HTTP_403_FORBIDDEN: {
            "description": "Not allowed to approve this timesheet"
        },
        status.HTTP_404_NOT_FOUND: {"description": "Timesheet not found"},
    },
)
async def approve_timesheet(
    *, session: SessionDep, current_user: CurrentUser, timesheet: TimesheetDep
) -> Any:
    return await service.approve_timesheet(
        session=session, current_user=current_user, timesheet_id=timesheet.id
    )


@router.get(
    "/me",
    response_model=TimesheetListPublic,
    summary="List my timesheets",
    description="Return timesheets for the current user.",
    responses={status.HTTP_200_OK: {"description": "Timesheets returned"}},
)
async def read_my_timesheets(
    session: SessionDep, current_user: CurrentUser, pagination: PaginationDep
) -> Any:
    rows, total = await service.list_my_timesheets(
        session=session,
        current_user=current_user,
        skip=pagination.skip,
        limit=pagination.limit,
    )
    return TimesheetListPublic(
        data=[
            TimesheetPublic.model_validate(item, from_attributes=True) for item in rows
        ],
        count=total,
        page=pagination.page,
        size=pagination.size,
    )


@router.get(
    "/department",
    response_model=TimesheetListPublic,
    summary="List department timesheets",
    description="Return timesheets for a department. Requires timesheet.read.department permission.",
    responses={
        status.HTTP_200_OK: {"description": "Timesheets returned"},
        status.HTTP_403_FORBIDDEN: {"description": "Insufficient permission"},
    },
)
async def read_department_timesheets(
    session: SessionDep,
    current_user: CurrentUser,
    pagination: PaginationDep,
    department_id: str,
) -> Any:
    rows, total = await service.list_department_timesheets(
        session=session,
        current_user=current_user,
        department_id=department_id,
        skip=pagination.skip,
        limit=pagination.limit,
    )
    return TimesheetListPublic(
        data=[
            TimesheetPublic.model_validate(item, from_attributes=True) for item in rows
        ],
        count=total,
        page=pagination.page,
        size=pagination.size,
    )


@router.get(
    "/{timesheet_id}/summary",
    response_model=TimesheetSummaryByShift,
    summary="Get timesheet summary by shift",
    description="Return hours aggregated by shift code. Owner or user with timesheet.read.department over the owner.",
    responses={
        status.HTTP_200_OK: {"description": "Summary returned"},
        status.HTTP_403_FORBIDDEN: {
            "description": "Not allowed to read this timesheet"
        },
        status.HTTP_404_NOT_FOUND: {"description": "Timesheet not found"},
    },
)
async def read_timesheet_summary(
    session: SessionDep,
    current_user: CurrentUser,
    timesheet: TimesheetDep,
) -> Any:
    return await service.get_timesheet_summary(
        session=session, current_user=current_user, timesheet_id=timesheet.id
    )


@router.get(
    "/{timesheet_id}",
    response_model=TimesheetDetails,
    summary="Get timesheet details",
    description="Return a timesheet and its entries. Owner or user with timesheet.read.department over the owner.",
    responses={
        status.HTTP_200_OK: {"description": "Timesheet and entries returned"},
        status.HTTP_403_FORBIDDEN: {
            "description": "Not allowed to read this timesheet"
        },
        status.HTTP_404_NOT_FOUND: {"description": "Timesheet not found"},
    },
)
async def read_timesheet(
    session: SessionDep,
    current_user: CurrentUser,
    timesheet: TimesheetDep,
) -> Any:
    timesheet_data, entries = await service.read_timesheet_details(
        session=session, current_user=current_user, timesheet_id=timesheet.id
    )
    return TimesheetDetails(
        timesheet=TimesheetPublic.model_validate(timesheet_data, from_attributes=True),
        entries=[
            TimesheetEntryPublic.model_validate(entry, from_attributes=True)
            for entry in entries
        ],
    )
