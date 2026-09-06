import uuid
from datetime import date
from typing import Any

from fastapi import APIRouter, status

from src.dependencies import CurrentUser, SessionDep

from . import service
from .schemas import (
    CalendarEventCreate,
    CalendarEventPublic,
    CalendarEventsPublic,
    CalendarEventUpdate,
)

router = APIRouter(prefix="/hr/calendar", tags=["hr-calendar"])


def _to_public(event: Any, author: Any) -> CalendarEventPublic:
    return CalendarEventPublic(
        id=event.id,
        department_id=event.department_id,
        title=event.title,
        description=event.description,
        kind=event.kind,
        starts_at_local=event.starts_at.isoformat(),
        ends_at_local=event.ends_at.isoformat(),
        all_day=event.all_day,
        location=event.location,
        is_cancelled=event.cancelled_at is not None,
        created_by_user_id=event.created_by_user_id,
        created_by_name=author.full_name if author else None,
        created_at=event.created_at,
    )


@router.get(
    "/events",
    response_model=CalendarEventsPublic,
    summary="List department calendar events",
    description=(
        "Return the department's calendar entries overlapping the date range — "
        "meetings, training, inspections, visits, maintenance and anything else "
        "staff have recorded. The duty roster is a separate layer, read from "
        "/hr/rosters/assignments. Requires calendar.view; the range is capped at "
        "92 days. Cancelled entries are omitted unless include_cancelled is set."
    ),
    responses={
        status.HTTP_200_OK: {"description": "Calendar events returned"},
        status.HTTP_400_BAD_REQUEST: {"description": "Invalid date range"},
        status.HTTP_403_FORBIDDEN: {"description": "Insufficient permission"},
        status.HTTP_404_NOT_FOUND: {"description": "Department not found"},
    },
)
async def list_calendar_events(
    session: SessionDep,
    current_user: CurrentUser,
    start: date,
    end: date,
    department_id: str | None = None,
    include_cancelled: bool = False,
) -> Any:
    rows = await service.list_calendar_events(
        session=session,
        current_user=current_user,
        start=start,
        end=end,
        department_id=department_id,
        include_cancelled=include_cancelled,
    )
    return CalendarEventsPublic(
        data=[_to_public(event, author) for event, author in rows],
        count=len(rows),
    )


@router.post(
    "/events",
    response_model=CalendarEventPublic,
    status_code=status.HTTP_201_CREATED,
    summary="Add a department calendar event",
    description=(
        "Record anything the department needs on its calendar. Any member of "
        "staff may add an entry (calendar.event.create) and may edit or cancel "
        "their own; changing someone else's needs calendar.manage. Times are "
        "department-local wall clock, matching the roster."
    ),
    responses={
        status.HTTP_201_CREATED: {"description": "Calendar event created"},
        status.HTTP_400_BAD_REQUEST: {"description": "Invalid event"},
        status.HTTP_403_FORBIDDEN: {"description": "Insufficient permission"},
        status.HTTP_404_NOT_FOUND: {"description": "Department not found"},
    },
)
async def create_calendar_event(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    payload: CalendarEventCreate,
) -> Any:
    event = await service.create_calendar_event(
        session=session, current_user=current_user, payload=payload
    )
    return _to_public(event, current_user)


@router.patch(
    "/events/{event_id}",
    response_model=CalendarEventPublic,
    summary="Update or cancel a department calendar event",
    description=(
        "Edit an entry, or set cancelled=true to strike it from the calendar "
        "without deleting the record. The author may change their own entry; "
        "changing anyone else's requires calendar.manage."
    ),
    responses={
        status.HTTP_200_OK: {"description": "Calendar event updated"},
        status.HTTP_400_BAD_REQUEST: {"description": "Invalid event"},
        status.HTTP_403_FORBIDDEN: {"description": "Not the author"},
        status.HTTP_404_NOT_FOUND: {"description": "Calendar event not found"},
    },
)
async def update_calendar_event(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    event_id: uuid.UUID,
    payload: CalendarEventUpdate,
) -> Any:
    event = await service.update_calendar_event(
        session=session,
        current_user=current_user,
        event_id=event_id,
        payload=payload,
    )
    author = await session.get(type(current_user), event.created_by_user_id)
    return _to_public(event, author)
