from datetime import date
from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Query, status

from src.auth.browser import BrowserUser
from src.janitorial.dependencies import JanitorialSession
from src.janitorial.responses import FORBIDDEN, INVALID, NOT_FOUND, UNAVAILABLE, WRITE

from . import schemas, service

router = APIRouter(tags=["janitorial"])


@router.get(
    "/shifts",
    response_model=schemas.JanitorialShiftBoard,
    summary="Get the shift board for a site",
    description="Returns a site's shift patterns, the zones the user may see, and assignments between two dates (at most 62 days).",
    responses={**FORBIDDEN, **NOT_FOUND, **INVALID, **UNAVAILABLE},
)
async def get_shift_board(
    *,
    user: BrowserUser,
    session: JanitorialSession,
    site: Annotated[str, Query(pattern="^[A-Za-z]{3}$")],
    start: Annotated[date, Query(alias="from")],
    end: Annotated[date, Query(alias="to")],
) -> Any:
    return await service.board(session, user, site, start, end)


@router.post(
    "/shift-patterns",
    response_model=schemas.JanitorialShiftPattern,
    status_code=status.HTTP_201_CREATED,
    summary="Add a shift pattern",
    description="Adds a named shift (start and end time) at a site. A shift ending before it starts runs past midnight.",
    responses=WRITE,
)
async def create_shift_pattern(
    *,
    user: BrowserUser,
    session: JanitorialSession,
    payload: schemas.ShiftPatternCreate,
) -> Any:
    return await service.create_pattern(session, user, payload)


@router.patch(
    "/shift-patterns/{pattern_id}",
    response_model=schemas.JanitorialShiftPattern,
    summary="Update a shift pattern",
    description="Renames, retimes or (de)activates a shift. Send the revision you last read.",
    responses=WRITE,
)
async def update_shift_pattern(
    *,
    user: BrowserUser,
    session: JanitorialSession,
    pattern_id: int,
    payload: schemas.ShiftPatternUpdate,
) -> Any:
    return await service.update_pattern(session, user, pattern_id, payload)


@router.post(
    "/zones",
    response_model=schemas.JanitorialZone,
    status_code=status.HTTP_201_CREATED,
    summary="Add a zone",
    description="Groups areas at one site into a zone that staff are assigned to.",
    responses=WRITE,
)
async def create_zone(
    *, user: BrowserUser, session: JanitorialSession, payload: schemas.ZoneCreate
) -> Any:
    return await service.create_zone(session, user, payload)


@router.patch(
    "/zones/{zone_id}",
    response_model=schemas.JanitorialZone,
    summary="Update a zone",
    description="Renames a zone, replaces its areas or (de)activates it. Send the revision you last read.",
    responses=WRITE,
)
async def update_zone(
    *,
    user: BrowserUser,
    session: JanitorialSession,
    zone_id: int,
    payload: schemas.ZoneUpdate,
) -> Any:
    return await service.update_zone(session, user, zone_id, payload)


@router.post(
    "/shift-assignments",
    response_model=schemas.JanitorialShiftAssignment,
    status_code=status.HTTP_201_CREATED,
    summary="Assign a staff member to a zone for a shift",
    description="Schedules one staff member on one shift and zone for a date. A person can hold one scheduled assignment per shift and date.",
    responses=WRITE,
)
async def create_shift_assignment(
    *,
    user: BrowserUser,
    session: JanitorialSession,
    payload: schemas.ShiftAssignmentCreate,
) -> Any:
    return await service.create_assignment(session, user, payload)


@router.patch(
    "/shift-assignments/{assignment_id}",
    response_model=schemas.JanitorialShiftAssignment,
    summary="Update or cancel a shift assignment",
    description="Moves an assignment to another shift or zone, or cancels it. Send the revision you last read.",
    responses=WRITE,
)
async def update_shift_assignment(
    *,
    user: BrowserUser,
    session: JanitorialSession,
    assignment_id: UUID,
    payload: schemas.ShiftAssignmentUpdate,
) -> Any:
    return await service.update_assignment(session, user, assignment_id, payload)
