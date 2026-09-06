"""The department calendar: the record of what the department is doing.

The point of these tests is the write rule. Anyone with calendar.event.create
may put something on the calendar, and may change their own entry; changing
someone else's needs calendar.manage. Entries are cancelled, never deleted.
"""

from datetime import date, datetime

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from src.exceptions import AuthorizationError
from src.hr.calendar.models import CalendarEventKind
from src.hr.calendar.schemas import CalendarEventCreate, CalendarEventUpdate
from src.hr.calendar.service import (
    create_calendar_event,
    list_calendar_events,
    update_calendar_event,
)
from src.hr.exceptions import HRValidationError
from tests.factories import (
    assign_role,
    make_department,
    make_employee,
    make_role_with_permission,
    make_user,
)

VIEW_AND_CREATE = ("calendar.view", "calendar.event.create")


async def _staff_member(db_async: AsyncSession, department_id: str, *manage: str):
    user = await make_user(db_async)
    await make_employee(db_async, user=user, department_id=department_id)
    role, _ = await make_role_with_permission(db_async, *VIEW_AND_CREATE, *manage)
    await assign_role(db_async, user=user, role=role)
    return user


def _meeting(**overrides) -> CalendarEventCreate:
    payload = {
        "title": "Monthly staff meeting",
        "kind": CalendarEventKind.MEETING,
        "starts_at": datetime(2026, 7, 6, 9, 30),
        "ends_at": datetime(2026, 7, 6, 10, 30),
    }
    payload.update(overrides)
    return CalendarEventCreate(**payload)


async def test_any_staff_member_can_record_something_important(
    db_async: AsyncSession,
) -> None:
    department = await make_department(db_async, "cal_ev_add")
    author = await _staff_member(db_async, department.id)

    event = await create_calendar_event(
        session=db_async, current_user=author, payload=_meeting()
    )

    assert event.department_id == department.id
    assert event.created_by_user_id == author.id
    assert event.cancelled_at is None


async def test_the_whole_department_sees_it(db_async: AsyncSession) -> None:
    department = await make_department(db_async, "cal_ev_see")
    author = await _staff_member(db_async, department.id)
    colleague = await _staff_member(db_async, department.id)
    await create_calendar_event(
        session=db_async, current_user=author, payload=_meeting()
    )

    rows = await list_calendar_events(
        session=db_async,
        current_user=colleague,
        start=date(2026, 7, 1),
        end=date(2026, 7, 31),
    )

    assert [event.title for event, _ in rows] == ["Monthly staff meeting"]
    assert rows[0][1] is not None, "the author is returned alongside the entry"


async def test_an_entry_spanning_the_window_edge_still_shows(
    db_async: AsyncSession,
) -> None:
    department = await make_department(db_async, "cal_ev_span")
    author = await _staff_member(db_async, department.id)
    await create_calendar_event(
        session=db_async,
        current_user=author,
        payload=_meeting(
            title="Recurrent training",
            kind=CalendarEventKind.TRAINING,
            starts_at=datetime(2026, 6, 29, 8, 0),
            ends_at=datetime(2026, 7, 3, 16, 0),
        ),
    )

    rows = await list_calendar_events(
        session=db_async,
        current_user=author,
        start=date(2026, 7, 1),
        end=date(2026, 7, 31),
    )

    assert [event.title for event, _ in rows] == ["Recurrent training"]


async def test_author_may_edit_their_own_entry(db_async: AsyncSession) -> None:
    department = await make_department(db_async, "cal_ev_own")
    author = await _staff_member(db_async, department.id)
    event = await create_calendar_event(
        session=db_async, current_user=author, payload=_meeting()
    )

    updated = await update_calendar_event(
        session=db_async,
        current_user=author,
        event_id=event.id,
        payload=CalendarEventUpdate(title="Monthly staff meeting (moved)"),
    )

    assert updated.title == "Monthly staff meeting (moved)"


async def test_editing_someone_elses_entry_needs_calendar_manage(
    db_async: AsyncSession,
) -> None:
    department = await make_department(db_async, "cal_ev_other")
    author = await _staff_member(db_async, department.id)
    colleague = await _staff_member(db_async, department.id)
    supervisor = await _staff_member(db_async, department.id, "calendar.manage")
    event = await create_calendar_event(
        session=db_async, current_user=author, payload=_meeting()
    )

    with pytest.raises(AuthorizationError):
        await update_calendar_event(
            session=db_async,
            current_user=colleague,
            event_id=event.id,
            payload=CalendarEventUpdate(title="Not yours to move"),
        )

    updated = await update_calendar_event(
        session=db_async,
        current_user=supervisor,
        event_id=event.id,
        payload=CalendarEventUpdate(title="Rescheduled by the supervisor"),
    )
    assert updated.title == "Rescheduled by the supervisor"


async def test_cancelling_keeps_the_record_and_hides_it_by_default(
    db_async: AsyncSession,
) -> None:
    department = await make_department(db_async, "cal_ev_cancel")
    author = await _staff_member(db_async, department.id)
    event = await create_calendar_event(
        session=db_async,
        current_user=author,
        payload=_meeting(title="Annual inspection", kind=CalendarEventKind.INSPECTION),
    )

    cancelled = await update_calendar_event(
        session=db_async,
        current_user=author,
        event_id=event.id,
        payload=CalendarEventUpdate(cancelled=True),
    )
    assert cancelled.cancelled_at is not None

    window = {"start": date(2026, 7, 1), "end": date(2026, 7, 31)}
    visible = await list_calendar_events(
        session=db_async, current_user=author, **window
    )
    assert visible == []

    kept = await list_calendar_events(
        session=db_async, current_user=author, include_cancelled=True, **window
    )
    assert [event.title for event, _ in kept] == ["Annual inspection"]


async def test_an_entry_cannot_end_before_it_starts(db_async: AsyncSession) -> None:
    department = await make_department(db_async, "cal_ev_range")
    author = await _staff_member(db_async, department.id)

    with pytest.raises(HRValidationError):
        await create_calendar_event(
            session=db_async,
            current_user=author,
            payload=_meeting(
                starts_at=datetime(2026, 7, 6, 14, 0),
                ends_at=datetime(2026, 7, 6, 9, 0),
            ),
        )


async def test_times_are_stored_as_department_local_wall_clock(
    db_async: AsyncSession,
) -> None:
    """An offset from a client is dropped: the calendar has one time base."""
    department = await make_department(db_async, "cal_ev_tz")
    author = await _staff_member(db_async, department.id)

    event = await create_calendar_event(
        session=db_async,
        current_user=author,
        payload=_meeting(
            starts_at=datetime.fromisoformat("2026-07-06T09:30:00-04:00"),
            ends_at=datetime.fromisoformat("2026-07-06T10:30:00-04:00"),
        ),
    )

    assert event.starts_at.tzinfo is None
    assert event.starts_at.isoformat() == "2026-07-06T09:30:00"
