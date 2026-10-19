"""Prefill endpoints: leave working days and timesheet rows from the roster."""

from datetime import date
from decimal import Decimal

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from src.hr.exceptions import HRValidationError
from src.hr.leave.models import LeaveType
from src.hr.leave.service import working_days_between
from src.hr.roster.holidays import PROVISIONAL_SOURCE
from src.hr.roster.models import PublicHoliday
from src.hr.timesheet.service import prefill_from_roster
from tests.factories import assign_role, make_role_with_permission
from tests.hr.test_roster_calendar import _rostered_department


async def _holiday(
    session: AsyncSession,
    user_id,
    day: date,
    *,
    provisional: bool,
    name: str = "Test Day",
) -> None:
    session.add(
        PublicHoliday(
            name=name,
            holiday_date=day,
            source=PROVISIONAL_SOURCE if provisional else "gazette",
            needs_verification=False,
            created_by_user_id=user_id,
        )
    )
    await session.commit()


async def test_working_days_use_weekdays_and_skip_flagged_holiday(
    db_async: AsyncSession,
) -> None:
    _, _, colleague = await _rostered_department(db_async, "wd_weekdays", publish=True)
    role, _ = await make_role_with_permission(db_async, "leave.request.create.self")
    await assign_role(db_async, user=colleague, role=role)
    await _holiday(db_async, colleague.id, date(2026, 7, 8), provisional=True)

    # The colleague is rostered on only two July days, so the roster does not
    # cover this week and the count falls back to Monday-Friday.
    result = await working_days_between(
        session=db_async,
        current_user=colleague,
        start=date(2026, 7, 6),
        end=date(2026, 7, 12),
    )

    assert result.method == "weekdays"
    assert result.calendar_days == 7
    assert result.working_days == 4
    assert [(h.holiday_date, h.provisional) for h in result.holidays] == [
        (date(2026, 7, 8), True)
    ]


async def test_working_days_follow_a_fully_rostered_range(
    db_async: AsyncSession,
) -> None:
    _, manager, _ = await _rostered_department(db_async, "wd_roster", publish=True)

    # 6 July is a night shift (work), 7 July is off duty.
    result = await working_days_between(
        session=db_async,
        current_user=manager,
        start=date(2026, 7, 6),
        end=date(2026, 7, 7),
    )

    assert result.method == "roster"
    assert result.working_days == 1


async def test_working_days_ignore_draft_roster(db_async: AsyncSession) -> None:
    _, manager, _ = await _rostered_department(db_async, "wd_draft", publish=False)

    result = await working_days_between(
        session=db_async,
        current_user=manager,
        start=date(2026, 7, 6),
        end=date(2026, 7, 7),
    )

    assert result.method == "weekdays"
    assert result.working_days == 2


@pytest.mark.parametrize(
    ("start", "end"),
    [(date(2026, 7, 8), date(2026, 7, 7)), (date(2026, 1, 1), date(2027, 6, 1))],
)
async def test_working_days_reject_bad_ranges(
    db_async: AsyncSession, start: date, end: date
) -> None:
    _, manager, _ = await _rostered_department(
        db_async, f"wd_bad_{start.year}_{end.year}_{end.day}", publish=True
    )

    with pytest.raises(HRValidationError):
        await working_days_between(
            session=db_async, current_user=manager, start=start, end=end
        )


async def test_timesheet_prefill_lists_published_work_shifts(
    db_async: AsyncSession,
) -> None:
    department, manager, _ = await _rostered_department(
        db_async, "ts_prefill", publish=True
    )

    result = await prefill_from_roster(
        session=db_async, current_user=manager, period="2026-07"
    )

    assert result.department_id == department.id
    assert result.roster_published is True
    assert result.period_start == date(2026, 7, 1)
    assert result.period_end == date(2026, 7, 31)
    # Off-duty cells are not timesheet rows; the night shift is.
    assert [(e.entry_date, e.shift_code) for e in result.entries] == [
        (date(2026, 7, 6), "N")
    ]
    assert result.entries[0].roster_hours == Decimal("7.50")
    assert result.entries[0].start_time == "22:30"


async def test_timesheet_prefill_is_empty_for_draft_roster(
    db_async: AsyncSession,
) -> None:
    _, manager, _ = await _rostered_department(
        db_async, "ts_prefill_draft", publish=False
    )

    draft = await prefill_from_roster(
        session=db_async, current_user=manager, period="2026-07"
    )
    assert draft.roster_published is False
    assert draft.entries == []


async def test_timesheet_prefill_rejects_bad_period(db_async: AsyncSession) -> None:
    _, manager, _ = await _rostered_department(db_async, "ts_prefill_bad", publish=True)

    with pytest.raises(HRValidationError):
        await prefill_from_roster(
            session=db_async, current_user=manager, period="2026-13"
        )


async def test_vacation_suggests_extra_days_for_holidays_on_working_days(
    db_async: AsyncSession,
) -> None:
    _, _, colleague = await _rostered_department(db_async, "wd_extra", publish=True)
    role, _ = await make_role_with_permission(db_async, "leave.request.create.self")
    await assign_role(db_async, user=colleague, role=role)
    # Wednesday (counts), and Saturday (not a working day, so no extra day).
    await _holiday(db_async, colleague.id, date(2026, 7, 8), provisional=True)
    await _holiday(db_async, colleague.id, date(2026, 7, 11), provisional=False)

    vacation = await working_days_between(
        session=db_async,
        current_user=colleague,
        start=date(2026, 7, 6),
        end=date(2026, 7, 12),
        leave_type=LeaveType.VACATION,
    )
    other = await working_days_between(
        session=db_async,
        current_user=colleague,
        start=date(2026, 7, 6),
        end=date(2026, 7, 12),
        leave_type=LeaveType.SICK,
    )
    no_type = await working_days_between(
        session=db_async,
        current_user=colleague,
        start=date(2026, 7, 6),
        end=date(2026, 7, 12),
    )

    assert vacation.working_days == 4
    assert vacation.suggested_extra_days == 1
    assert vacation.suggested_extra_days_note is not None
    assert "provisional" in vacation.suggested_extra_days_note
    assert "HR may grant 1 extra day" in vacation.suggested_extra_days_note
    assert other.suggested_extra_days == 0
    assert other.suggested_extra_days_note is None
    assert no_type.suggested_extra_days == 0


async def test_timesheet_prefill_marks_rostered_holidays(
    db_async: AsyncSession,
) -> None:
    _, manager, _ = await _rostered_department(db_async, "ts_holiday", publish=True)
    await _holiday(
        db_async, manager.id, date(2026, 7, 6), provisional=True, name="Roster Day"
    )
    await _holiday(
        db_async, manager.id, date(2026, 7, 20), provisional=False, name="Quiet Day"
    )

    result = await prefill_from_roster(
        session=db_async, current_user=manager, period="2026-07"
    )

    assert result.entries[0].holiday_name == "Roster Day"
    assert result.entries[0].holiday_provisional is True
    assert [(h.name, h.provisional) for h in result.holidays] == [
        ("Roster Day", True),
        ("Quiet Day", False),
    ]
