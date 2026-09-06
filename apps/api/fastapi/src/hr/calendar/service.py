"""Department calendar: the record of what a department is doing.

Meetings, training, inspections, visits, maintenance windows, deadlines — any
dated thing a member of the department thinks is worth recording. The duty
roster is a separate layer that the calendar reads alongside these entries (see
`src/hr/roster/service.read_roster_calendar`); rostered shifts are never copied
in here.

Who may write: anyone with `calendar.event.create` may add an entry, and may
edit or cancel their own. Changing someone else's entry needs `calendar.manage`.
Entries are cancelled rather than deleted — "the inspection was called off" is
part of the record.
"""

import logging
import uuid
from datetime import date, datetime

from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import col, select

from src.auth.models import User
from src.auth.policy import has_permission, require_permission
from src.hr.constants import (
    ERROR_CALENDAR_EVENT_END_BEFORE_START,
    ERROR_CALENDAR_EVENT_NO_DEPARTMENT,
    ERROR_CALENDAR_EVENT_NOT_AUTHOR,
    ERROR_CALENDAR_RANGE_INVALID,
    ERROR_CALENDAR_RANGE_TOO_LONG,
)
from src.hr.exceptions import (
    CalendarEventNotFoundError,
    DepartmentNotFoundError,
    HRPermissionDeniedError,
    HRValidationError,
)
from src.hr.models import Department, EmploymentRecord
from src.utils.datetime import utc_now

from .models import CalendarEvent
from .schemas import CalendarEventCreate, CalendarEventUpdate

logger = logging.getLogger(__name__)

#: Matches the roster feed's window, so one calendar month is one pair of reads.
CALENDAR_MAX_DAYS = 92


def _strip_offset(value: datetime) -> datetime:
    """Department-local wall clock: drop any offset a client happens to send.

    The whole calendar — roster shifts and events alike — is stored and read in
    department-local wall time. Accepting an offset here and keeping it would
    put two time bases on one grid.
    """
    return value.replace(tzinfo=None)


async def _department_for(session: AsyncSession, user: User) -> str | None:
    result = await session.execute(
        select(EmploymentRecord).where(col(EmploymentRecord.user_id) == user.id)
    )
    employment = result.scalars().first()
    return employment.department_id if employment else None


async def list_calendar_events(
    *,
    session: AsyncSession,
    current_user: User,
    start: date,
    end: date,
    department_id: str | None = None,
    include_cancelled: bool = False,
) -> list[tuple[CalendarEvent, User | None]]:
    """Entries overlapping a window, with their author, oldest first."""
    require_permission(current_user=current_user, permission_key="calendar.view")
    if end < start:
        raise HRValidationError(ERROR_CALENDAR_RANGE_INVALID)
    if (end - start).days + 1 > CALENDAR_MAX_DAYS:
        raise HRValidationError(
            ERROR_CALENDAR_RANGE_TOO_LONG.format(max_days=CALENDAR_MAX_DAYS)
        )

    if department_id is None:
        department_id = await _department_for(session, current_user)
        if department_id is None:
            return []
    elif await session.get(Department, department_id) is None:
        raise DepartmentNotFoundError()

    # An entry belongs in the window if it overlaps it at all, so a week-long
    # training that starts before the window still shows.
    statement = (
        select(CalendarEvent, User)
        .outerjoin(User, col(CalendarEvent.created_by_user_id) == col(User.id))
        .where(
            col(CalendarEvent.department_id) == department_id,
            col(CalendarEvent.starts_at) < datetime.combine(end, datetime.max.time()),
            col(CalendarEvent.ends_at) >= datetime.combine(start, datetime.min.time()),
        )
        .order_by(col(CalendarEvent.starts_at))
    )
    if not include_cancelled:
        statement = statement.where(col(CalendarEvent.cancelled_at).is_(None))

    result = await session.execute(statement)
    return [(event, author) for event, author in result.all()]


async def create_calendar_event(
    *, session: AsyncSession, current_user: User, payload: CalendarEventCreate
) -> CalendarEvent:
    require_permission(
        current_user=current_user, permission_key="calendar.event.create"
    )
    starts_at = _strip_offset(payload.starts_at)
    ends_at = _strip_offset(payload.ends_at)
    if ends_at < starts_at:
        raise HRValidationError(ERROR_CALENDAR_EVENT_END_BEFORE_START)

    department_id = payload.department_id
    if department_id is None:
        department_id = await _department_for(session, current_user)
        if department_id is None:
            raise HRValidationError(ERROR_CALENDAR_EVENT_NO_DEPARTMENT)
    elif await session.get(Department, department_id) is None:
        raise DepartmentNotFoundError()

    event = CalendarEvent(
        department_id=department_id,
        title=payload.title,
        description=payload.description,
        kind=payload.kind,
        starts_at=starts_at,
        ends_at=ends_at,
        all_day=payload.all_day,
        location=payload.location,
        created_by_user_id=current_user.id,
    )
    session.add(event)
    await session.commit()
    await session.refresh(event)
    logger.info(
        "calendar event created",
        extra={"event_id": str(event.id), "department_id": department_id},
    )
    return event


async def get_calendar_event(
    *, session: AsyncSession, event_id: uuid.UUID
) -> CalendarEvent:
    event = await session.get(CalendarEvent, event_id)
    if event is None:
        raise CalendarEventNotFoundError()
    return event


async def update_calendar_event(
    *,
    session: AsyncSession,
    current_user: User,
    event_id: uuid.UUID,
    payload: CalendarEventUpdate,
) -> CalendarEvent:
    """Edit or cancel an entry. Your own needs nothing extra; anyone else's
    needs `calendar.manage`."""
    require_permission(current_user=current_user, permission_key="calendar.view")
    event = await get_calendar_event(session=session, event_id=event_id)

    is_author = event.created_by_user_id == current_user.id
    may_manage = has_permission(
        current_user=current_user, permission_key="calendar.manage"
    )
    if not (is_author or may_manage or current_user.is_superuser):
        logger.warning(
            "calendar event edit denied",
            extra={"event_id": str(event_id), "user_id": str(current_user.id)},
        )
        raise HRPermissionDeniedError(ERROR_CALENDAR_EVENT_NOT_AUTHOR)

    data = payload.model_dump(exclude_unset=True)
    cancelled = data.pop("cancelled", None)
    for field, value in data.items():
        if value is None:
            continue
        if field in {"starts_at", "ends_at"}:
            value = _strip_offset(value)
        setattr(event, field, value)
    if event.ends_at < event.starts_at:
        raise HRValidationError(ERROR_CALENDAR_EVENT_END_BEFORE_START)
    if cancelled is not None:
        event.cancelled_at = utc_now() if cancelled else None
    event.updated_at = utc_now()

    session.add(event)
    await session.commit()
    await session.refresh(event)
    return event
