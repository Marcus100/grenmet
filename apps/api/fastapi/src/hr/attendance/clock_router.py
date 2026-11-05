import uuid
from typing import Annotated, Any

from fastapi import APIRouter, Query, status

from src.dependencies import CurrentUser, SessionDep
from src.models import ApiError

from . import clock_service, punch_service
from .clock_schemas import (
    ClockPunchApproveBody,
    ClockPunchesPublic,
    ClockPunchPendingPublic,
    ClockPunchPublic,
    ClockPunchReject,
    ClockRequest,
    ClockResult,
    ClockSiteActive,
    ClockSiteCreate,
    ClockSiteIssued,
    ClockSitePublic,
    ClockSitesPublic,
)
from .router import public_record

router = APIRouter(prefix="/hr/attendance", tags=["hr-attendance"])
SITE_ERRORS: dict[int | str, dict[str, Any]] = {
    403: {
        "model": ApiError,
        "description": "Insufficient permission or department outside your scope",
    },
    404: {"model": ApiError, "description": "Clock site not found"},
}


@router.post(
    "/clock",
    response_model=ClockResult,
    status_code=status.HTTP_200_OK,
    summary="Clock in or out at a clock point",
    description=(
        "Records a PENDING punch for the caller's rostered work shift (arrival, or "
        "departure when a shift is already open). The token proves presence at a "
        "department clock point. A phone punch is not attendance, hours or "
        "timesheet input until a supervisor approves it (ADR-0040). Late, "
        "early-departure and overtime minutes are informational only."
    ),
    operation_id="hrClock",
    responses={
        400: {"model": ApiError, "description": "Invalid attendance for this shift"},
        403: {
            "model": ApiError,
            "description": "Clock point belongs to another department",
        },
        404: {"model": ApiError, "description": "Clock-in code is not valid"},
        409: {
            "model": ApiError,
            "description": "No rostered shift to clock in to at this time",
        },
    },
)
async def clock(
    *, session: SessionDep, current_user: CurrentUser, payload: ClockRequest
) -> Any:
    action, punch, site, late, early, overtime, arrived_at = await clock_service.clock(
        session=session, current_user=current_user, token=payload.token
    )
    return ClockResult(
        action="DEPARTED" if action == "DEPARTED" else "ARRIVED",
        site_name=site.name,
        attendance=await public_record(
            session, clock_service.provisional_attendance(punch, arrived_at)
        ),
        punch=ClockPunchPublic.model_validate(punch, from_attributes=True),
        late_minutes=late,
        early_departure_minutes=early,
        overtime_minutes=overtime,
    )


@router.get(
    "/clock-sites",
    response_model=ClockSitesPublic,
    summary="List clock sites for a department",
    description="Clock points for a department. Tokens are never returned. Requires roster.manage in the department scope.",
    operation_id="hrListClockSites",
    responses=SITE_ERRORS,
)
async def list_clock_sites(
    *, session: SessionDep, current_user: CurrentUser, department_id: str
) -> Any:
    sites = await clock_service.list_sites(
        session=session, current_user=current_user, department_id=department_id
    )
    return ClockSitesPublic(
        data=[ClockSitePublic.model_validate(s, from_attributes=True) for s in sites],
        count=len(sites),
    )


@router.post(
    "/clock-sites",
    response_model=ClockSiteIssued,
    status_code=status.HTTP_201_CREATED,
    summary="Create a clock site",
    description="Creates a clock point and returns its token once, for the NFC tag or QR poster. Only a hash is stored. Requires roster.manage in the department scope.",
    operation_id="hrCreateClockSite",
    responses=SITE_ERRORS,
)
async def create_clock_site(
    *, session: SessionDep, current_user: CurrentUser, payload: ClockSiteCreate
) -> Any:
    site, token = await clock_service.create_site(
        session=session,
        current_user=current_user,
        department_id=payload.department_id,
        name=payload.name,
    )
    return ClockSiteIssued(
        **ClockSitePublic.model_validate(site, from_attributes=True).model_dump(),
        token=token,
    )


@router.post(
    "/clock-sites/{site_id}/rotate",
    response_model=ClockSiteIssued,
    summary="Rotate a clock site token",
    description="Issues a new token, invalidating the old one, and returns it once. Use when a tag or poster is photographed or lost. Requires roster.manage in the department scope.",
    operation_id="hrRotateClockSite",
    responses=SITE_ERRORS,
)
async def rotate_clock_site(
    *, session: SessionDep, current_user: CurrentUser, site_id: uuid.UUID
) -> Any:
    site, token = await clock_service.rotate_site(
        session=session, current_user=current_user, site_id=site_id
    )
    return ClockSiteIssued(
        **ClockSitePublic.model_validate(site, from_attributes=True).model_dump(),
        token=token,
    )


@router.put(
    "/clock-sites/{site_id}/active",
    response_model=ClockSitePublic,
    summary="Activate or deactivate a clock site",
    description="A deactivated site rejects every scan. Requires roster.manage in the department scope.",
    operation_id="hrSetClockSiteActive",
    responses=SITE_ERRORS,
)
async def set_clock_site_active(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    site_id: uuid.UUID,
    payload: ClockSiteActive,
) -> Any:
    return await clock_service.set_site_active(
        session=session,
        current_user=current_user,
        site_id=site_id,
        active=payload.is_active,
    )


PUNCH_ERRORS: dict[int | str, dict[str, Any]] = {
    403: {
        "model": ApiError,
        "description": "Not an allowed reviewer of this punch, or reviewing your own punch",
    },
    404: {"model": ApiError, "description": "Clock punch not found"},
    409: {
        "model": ApiError,
        "description": "Punch already decided, or its arrival is not approved",
    },
}


@router.get(
    "/clock-punches/pending",
    response_model=ClockPunchesPublic,
    summary="List phone clock punches awaiting approval",
    description="Pending phone punches the caller may decide. Callers holding timesheet.approve with organisation-wide scope, with department scope for the punch's department or the employee's current department, or who are the employee's named supervisor and hold a live timesheet.approve assignment in the punch's organisation. Never the employee. Approve and reject use the same rule.",
    operation_id="hrListPendingClockPunches",
    responses={403: {"model": ApiError, "description": "Requires timesheet.approve"}},
)
async def list_pending_clock_punches(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    offset: Annotated[int, Query(ge=0, le=100000)] = 0,
) -> Any:
    rows, total = await punch_service.list_pending(
        session=session, current_user=current_user, limit=limit, offset=offset
    )
    return ClockPunchesPublic(
        data=[
            ClockPunchPendingPublic(
                **ClockPunchPublic.model_validate(
                    punch, from_attributes=True
                ).model_dump(),
                employee_name=name,
                site_name=site_name,
                shift_date=shift_date,
                shift_code=shift_code,
            )
            for punch, name, site_name, shift_date, shift_code in rows
        ],
        count=total,
    )


@router.post(
    "/clock-punches/{punch_id}/approve",
    response_model=ClockPunchPublic,
    summary="Approve a phone clock punch",
    description="Approving counts the punch as attendance: an arrival creates the attendance record, a departure closes it. Allowed for: callers holding timesheet.approve with organisation-wide scope, with department scope for the punch's department or the employee's current department, or who are the employee's named supervisor and hold a live timesheet.approve assignment in the punch's organisation. Never the employee. Idempotent.",
    operation_id="hrApproveClockPunch",
    responses=PUNCH_ERRORS,
)
async def approve_clock_punch(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    punch_id: uuid.UUID,
    payload: ClockPunchApproveBody = ClockPunchApproveBody(None),
) -> Any:
    return await punch_service.approve_punch(
        session=session,
        current_user=current_user,
        punch_id=punch_id,
        note=payload.root.note if payload.root else None,
    )


@router.post(
    "/clock-punches/{punch_id}/reject",
    response_model=ClockPunchPublic,
    summary="Reject a phone clock punch",
    description="A rejected punch never becomes attendance. Rejecting an arrival also rejects its pending departure. A reason is required. Same authority as approval.",
    operation_id="hrRejectClockPunch",
    responses=PUNCH_ERRORS,
)
async def reject_clock_punch(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    punch_id: uuid.UUID,
    payload: ClockPunchReject,
) -> Any:
    return await punch_service.reject_punch(
        session=session,
        current_user=current_user,
        punch_id=punch_id,
        reason=payload.reason,
    )
