import uuid
from typing import Any

from fastapi import APIRouter

from src.dependencies import CurrentUser, SessionDep

from .schemas import (
    TimesheetCreate,
    TimesheetDetails,
    TimesheetEntryPublic,
    TimesheetListPublic,
    TimesheetPublic,
    TimesheetSubmitRequest,
)
from .service import (
    approve_timesheet,
    create_timesheet,
    list_department_timesheets,
    list_my_timesheets,
    read_timesheet_details,
    submit_timesheet,
)

router = APIRouter(prefix="/hr/timesheets", tags=["hr-timesheets"])


@router.post("/", response_model=TimesheetDetails)
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


@router.patch("/{timesheet_id}/submit", response_model=TimesheetPublic)
def submit_timesheet_endpoint(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    timesheet_id: uuid.UUID,
    payload: TimesheetSubmitRequest,
) -> Any:
    return submit_timesheet(
        session=session,
        current_user=current_user,
        timesheet_id=timesheet_id,
        submission_mode=payload.mode,
    )


@router.patch("/{timesheet_id}/approve", response_model=TimesheetPublic)
def approve_timesheet_endpoint(
    *, session: SessionDep, current_user: CurrentUser, timesheet_id: uuid.UUID
) -> Any:
    return approve_timesheet(
        session=session, current_user=current_user, timesheet_id=timesheet_id
    )


@router.get("/me", response_model=TimesheetListPublic)
def read_my_timesheets(session: SessionDep, current_user: CurrentUser) -> Any:
    rows = list_my_timesheets(session=session, current_user=current_user)
    return TimesheetListPublic(
        data=[TimesheetPublic.model_validate(item, from_attributes=True) for item in rows],
        count=len(rows),
    )


@router.get("/department", response_model=TimesheetListPublic)
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


@router.get("/{timesheet_id}", response_model=TimesheetDetails)
def read_timesheet_endpoint(session: SessionDep, timesheet_id: uuid.UUID) -> Any:
    timesheet, entries = read_timesheet_details(session=session, timesheet_id=timesheet_id)
    return TimesheetDetails(
        timesheet=TimesheetPublic.model_validate(timesheet, from_attributes=True),
        entries=[
            TimesheetEntryPublic.model_validate(entry, from_attributes=True)
            for entry in entries
        ],
    )
