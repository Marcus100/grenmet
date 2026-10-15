import uuid
from typing import Any

from fastapi import APIRouter, status

from src.dependencies import CurrentUser, SessionDep

from . import clock_service
from .clock_schemas import (
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
    403: {"description": "Insufficient permission or department outside your scope"},
    404: {"description": "Clock site not found"},
}


@router.post(
    "/clock",
    response_model=ClockResult,
    status_code=status.HTTP_200_OK,
    summary="Clock in or out at a clock point",
    description=(
        "Records arrival against the caller's rostered work shift, or departure "
        "when a shift is already open. The token proves presence at a department "
        "clock point. It feeds the same attendance record and supervisor review as "
        "manual attendance. Late, early-departure and overtime minutes are "
        "informational only."
    ),
    operation_id="hrClock",
    responses={
        400: {"description": "Invalid attendance for this shift"},
        403: {"description": "Clock point belongs to another department"},
        404: {"description": "Clock-in code is not valid"},
        409: {"description": "No rostered shift to clock in to at this time"},
    },
)
async def clock(
    *, session: SessionDep, current_user: CurrentUser, payload: ClockRequest
) -> Any:
    action, record, site, late, early, overtime = await clock_service.clock(
        session=session, current_user=current_user, token=payload.token
    )
    return ClockResult(
        action="DEPARTED" if action == "DEPARTED" else "ARRIVED",
        site_name=site.name,
        attendance=await public_record(session, record),
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
