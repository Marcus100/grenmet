from collections.abc import Sequence
from typing import Annotated, Any

from fastapi import APIRouter, Body, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from src.dependencies import CurrentUser, SessionDep
from src.hr.dependencies import TimesheetDep
from src.hr.roster import overtime_service
from src.hr.roster import service as roster_service
from src.hr.roster.models import RosterAvailability
from src.hr.roster.schemas import OvertimeBandPublic, with_rule_warnings
from src.hr.submission import signed_document_ids
from src.models import ApiError
from src.openapi_responses import AUTHENTICATED
from src.pagination import PaginationDep

from . import service
from .models import Timesheet, TimesheetEntry
from .schemas import (
    TimesheetApproveRequest,
    TimesheetCreate,
    TimesheetDetails,
    TimesheetEntryPublic,
    TimesheetListPublic,
    TimesheetPrefillPublic,
    TimesheetPublic,
    TimesheetSubmitRequest,
    TimesheetSummaryByShift,
)

router = APIRouter(prefix="/hr/timesheets", tags=["hr-timesheets"])

# Approving without a body is the usual case: no override reason.
_NO_OVERRIDE = TimesheetApproveRequest()


async def _public_list(
    session: AsyncSession, rows: Sequence[Timesheet]
) -> list[TimesheetPublic]:
    signed = await signed_document_ids(session, [row.id for row in rows])
    results = []
    for row in rows:
        result = TimesheetPublic.model_validate(row, from_attributes=True)
        result.signed_document_id = signed.get(row.id)
        results.append(result)
    return results


async def _public(session: AsyncSession, row: Timesheet) -> TimesheetPublic:
    return (await _public_list(session, [row]))[0]


@router.post(
    "",
    response_model=TimesheetDetails,
    status_code=status.HTTP_201_CREATED,
    summary="Create timesheet",
    description="Create a timesheet atomically for active employment in the filing department. Validates dates and recorded hours; links only published or closed roster assignments. Policy controls self/proxy submission.",
    responses={
        status.HTTP_201_CREATED: {"description": "Timesheet and entries created"},
        status.HTTP_400_BAD_REQUEST: {
            "model": ApiError,
            "description": "Unknown or mismatched shift",
        },
        status.HTTP_403_FORBIDDEN: {
            "model": ApiError,
            "description": "Self/proxy submission disabled or not allowed for user",
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
        timesheet=await _public(session, timesheet),
        entries=await _entries_public(session, timesheet, entries),
    )


async def _entries_public(
    session: SessionDep, timesheet: Timesheet, entries: list[TimesheetEntry]
) -> list[TimesheetEntryPublic]:
    availability = await roster_service.assignment_availability(
        session,
        [entry.roster_assignment_id for entry in entries if entry.roster_assignment_id],
    )
    bands = await overtime_service.timesheet_bands(
        session,
        user_id=timesheet.user_id,
        department_id=timesheet.department_id,
        entries=entries,
    )
    return [
        TimesheetEntryPublic.model_validate(entry, from_attributes=True).model_copy(
            update={
                "availability": availability.get(
                    entry.roster_assignment_id, RosterAvailability.SCHEDULED
                )
                if entry.roster_assignment_id
                else RosterAvailability.SCHEDULED,
                "overtime_bands": [
                    OvertimeBandPublic(rate=band.rate, hours=band.hours)
                    for band in bands.get(entry.id, [])
                ],
            }
        )
        for entry in entries
    ]


@router.patch(
    "/{timesheet_id}/submit",
    response_model=TimesheetPublic,
    summary="Submit timesheet",
    description="Submit a draft timesheet (self or proxy). Requires timesheet.submit.self or timesheet.submit.proxy.",
    responses=with_rule_warnings(
        {
            status.HTTP_200_OK: {"description": "Timesheet submitted"},
            status.HTTP_400_BAD_REQUEST: {
                "model": ApiError,
                "description": "Timesheet already submitted or invalid stored dates, hours or roster link",
            },
            status.HTTP_403_FORBIDDEN: {
                "model": ApiError,
                "description": "Not allowed (self only for own; proxy not allowed)",
            },
            status.HTTP_404_NOT_FOUND: {
                "model": ApiError,
                "description": "Timesheet not found",
            },
        }
    ),
)
async def submit_timesheet(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    timesheet: TimesheetDep,
    payload: TimesheetSubmitRequest,
) -> Any:
    result = await service.submit_timesheet(
        session=session,
        current_user=current_user,
        timesheet_id=timesheet.id,
        submission_mode=payload.mode,
        signature_version=payload.signature_version,
        rule_override_reason=payload.rule_override_reason,
    )

    return await _public(session, result)


@router.patch(
    "/{timesheet_id}/approve",
    response_model=TimesheetPublic,
    summary="Approve timesheet",
    description="Approve a submitted timesheet. Requires timesheet.approve and scope over the filing department, or an explicitly named review stage. Workflow approval rules still apply.",
    responses=with_rule_warnings(
        {
            status.HTTP_200_OK: {"description": "Timesheet approved"},
            status.HTTP_400_BAD_REQUEST: {
                "model": ApiError,
                "description": "Timesheet is not submitted",
            },
            status.HTTP_403_FORBIDDEN: {
                "model": ApiError,
                "description": "Not allowed to approve this timesheet",
            },
            status.HTTP_404_NOT_FOUND: {
                "model": ApiError,
                "description": "Timesheet not found",
            },
        }
    ),
)
async def approve_timesheet(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    timesheet: TimesheetDep,
    payload: Annotated[TimesheetApproveRequest, Body()] = _NO_OVERRIDE,
) -> Any:
    result = await service.approve_timesheet(
        session=session,
        current_user=current_user,
        timesheet_id=timesheet.id,
        rule_override_reason=payload.rule_override_reason,
    )

    return await _public(session, result)


@router.get(
    "/prefill",
    response_model=TimesheetPrefillPublic,
    summary="Prefill my timesheet from the roster",
    description="Return the caller's published or closed roster work shifts for a month (`period=YYYY-MM`) with scheduled hours and approved leave or absence, so the timesheet editor can start from the roster. Requires timesheet.submit.self.",
    responses={
        **AUTHENTICATED,
        status.HTTP_200_OK: {"description": "Roster-derived rows returned"},
        status.HTTP_400_BAD_REQUEST: {
            "model": ApiError,
            "description": "Invalid period",
        },
        status.HTTP_403_FORBIDDEN: {
            "model": ApiError,
            "description": "Insufficient permission",
        },
    },
)
async def read_timesheet_prefill(
    session: SessionDep,
    current_user: CurrentUser,
    period: Annotated[
        str, Query(description="Calendar month, YYYY-MM", pattern=r"^\d{4}-\d{2}$")
    ],
) -> Any:
    return await service.prefill_from_roster(
        session=session, current_user=current_user, period=period
    )


@router.get(
    "/me",
    response_model=TimesheetListPublic,
    summary="List my timesheets",
    description="Return timesheets for the current user.",
    responses={
        **AUTHENTICATED,
        status.HTTP_200_OK: {"description": "Timesheets returned"},
    },
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
        data=await _public_list(session, rows),
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
        status.HTTP_400_BAD_REQUEST: {
            "model": ApiError,
            "description": "Department not found",
        },
        status.HTTP_403_FORBIDDEN: {
            "model": ApiError,
            "description": "Insufficient permission",
        },
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
        data=await _public_list(session, rows),
        count=total,
        page=pagination.page,
        size=pagination.size,
    )


@router.get(
    "/{timesheet_id}/summary",
    response_model=TimesheetSummaryByShift,
    summary="Get timesheet summary by shift",
    description="Return hours aggregated by shift code. Owner, explicitly named reviewer, or timesheet.read.department within the filing department. Employee transfers do not change historical access.",
    responses={
        status.HTTP_200_OK: {"description": "Summary returned"},
        status.HTTP_403_FORBIDDEN: {
            "model": ApiError,
            "description": "Not allowed to read this timesheet",
        },
        status.HTTP_404_NOT_FOUND: {
            "model": ApiError,
            "description": "Timesheet not found",
        },
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
    description="Return a timesheet and its entries. Owner, explicitly named reviewer, or timesheet.read.department within the filing department. Employee transfers do not change historical access.",
    responses={
        status.HTTP_200_OK: {"description": "Timesheet and entries returned"},
        status.HTTP_403_FORBIDDEN: {
            "model": ApiError,
            "description": "Not allowed to read this timesheet",
        },
        status.HTTP_404_NOT_FOUND: {
            "model": ApiError,
            "description": "Timesheet not found",
        },
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
        timesheet=await _public(session, timesheet_data),
        entries=await _entries_public(session, timesheet_data, entries),
    )
