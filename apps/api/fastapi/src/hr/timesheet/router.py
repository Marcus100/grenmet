import uuid
from typing import Any

from fastapi import APIRouter, status

from src.dependencies import CurrentUser, SessionDep
from src.hr.dependencies import TimesheetDep

from .schemas import (
    TimesheetCreate,
    TimesheetDetails,
    TimesheetEntryPublic,
    TimesheetListPublic,
    TimesheetPublic,
    TimesheetSubmitRequest,
    TimesheetSummaryByShift,
)
from .service import (
    approve_timesheet,
    create_timesheet,
    get_timesheet_summary,
    list_department_timesheets,
    list_my_timesheets,
    read_timesheet_details,
    submit_timesheet,
)

router = APIRouter(prefix="/hr/timesheets", tags=["hr-timesheets"])


@router.post(
    "/",
    response_model=TimesheetDetails,
    summary="Create timesheet",
    description="Create a new timesheet (self or proxy). Policy controls self/proxy submission.",
    responses={
        status.HTTP_200_OK: {"description": "Timesheet and entries created"},
        status.HTTP_403_FORBIDDEN: {"description": "Self/proxy submission disabled or not allowed for user"},
    },
)
def create_timesheet_endpoint(
    *, session: SessionDep, current_user: CurrentUser, payload: TimesheetCreate
) -> Any:
    timesheet, entries = create_timesheet(
        session=session, current_user=current_user, payload=payload
    )
    return TimesheetDetails(
        timesheet=TimesheetPublic.model_validate(timesheet, from_attributes=True),
        entries=[TimesheetEntryPublic.model_validate(entry, from_attributes=True) for entry in entries],
    )


@router.patch(
    "/{timesheet_id}/submit",
    response_model=TimesheetPublic,
    summary="Submit timesheet",
    description="Submit a draft timesheet (self or proxy). Requires timesheet.submit.self or timesheet.submit.proxy.",
    responses={
        status.HTTP_200_OK: {"description": "Timesheet submitted"},
        status.HTTP_400_BAD_REQUEST: {"description": "Timesheet already submitted"},
        status.HTTP_403_FORBIDDEN: {"description": "Not allowed (self only for own; proxy not allowed)"},
        status.HTTP_404_NOT_FOUND: {"description": "Timesheet not found"},
    },
)
def submit_timesheet_endpoint(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    _timesheet: TimesheetDep,
    timesheet_id: uuid.UUID,
    payload: TimesheetSubmitRequest,
) -> Any:
    return submit_timesheet(
        session=session,
        current_user=current_user,
        timesheet_id=timesheet_id,
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
        status.HTTP_403_FORBIDDEN: {"description": "Not allowed to approve this timesheet"},
        status.HTTP_404_NOT_FOUND: {"description": "Timesheet not found"},
    },
)
def approve_timesheet_endpoint(
    *, session: SessionDep, current_user: CurrentUser, timesheet_id: uuid.UUID
) -> Any:
    return approve_timesheet(
        session=session, current_user=current_user, timesheet_id=timesheet_id
    )


@router.get(
    "/me",
    response_model=TimesheetListPublic,
    summary="List my timesheets",
    description="Return timesheets for the current user.",
    responses={status.HTTP_200_OK: {"description": "Timesheets returned"}},
)
def read_my_timesheets(session: SessionDep, current_user: CurrentUser) -> Any:
    rows = list_my_timesheets(session=session, current_user=current_user)
    return TimesheetListPublic(
        data=[TimesheetPublic.model_validate(item, from_attributes=True) for item in rows],
        count=len(rows),
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
def read_department_timesheets(
    session: SessionDep, current_user: CurrentUser, department_id: str
) -> Any:
    rows = list_department_timesheets(
        session=session, current_user=current_user, department_id=department_id
    )
    return TimesheetListPublic(
        data=[TimesheetPublic.model_validate(item, from_attributes=True) for item in rows],
        count=len(rows),
    )


@router.get(
    "/{timesheet_id}/summary",
    response_model=TimesheetSummaryByShift,
    summary="Get timesheet summary by shift",
    description="Return hours aggregated by shift code. Owner or user with timesheet.read.department over the owner.",
    responses={
        status.HTTP_200_OK: {"description": "Summary returned"},
        status.HTTP_403_FORBIDDEN: {"description": "Not allowed to read this timesheet"},
        status.HTTP_404_NOT_FOUND: {"description": "Timesheet not found"},
    },
)
def read_timesheet_summary(
    session: SessionDep,
    current_user: CurrentUser,
    _timesheet: TimesheetDep,
    timesheet_id: uuid.UUID,
) -> Any:
    return get_timesheet_summary(
        session=session, current_user=current_user, timesheet_id=timesheet_id
    )


@router.get(
    "/{timesheet_id}",
    response_model=TimesheetDetails,
    summary="Get timesheet details",
    description="Return a timesheet and its entries. Owner or user with timesheet.read.department over the owner.",
    responses={
        status.HTTP_200_OK: {"description": "Timesheet and entries returned"},
        status.HTTP_403_FORBIDDEN: {"description": "Not allowed to read this timesheet"},
        status.HTTP_404_NOT_FOUND: {"description": "Timesheet not found"},
    },
)
def read_timesheet_endpoint(
    session: SessionDep,
    current_user: CurrentUser,
    _timesheet: TimesheetDep,
    timesheet_id: uuid.UUID,
) -> Any:
    timesheet, entries = read_timesheet_details(
        session=session, current_user=current_user, timesheet_id=timesheet_id
    )
    return TimesheetDetails(
        timesheet=TimesheetPublic.model_validate(timesheet, from_attributes=True),
        entries=[
            TimesheetEntryPublic.model_validate(entry, from_attributes=True)
            for entry in entries
        ],
    )
