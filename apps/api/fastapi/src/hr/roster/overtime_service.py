"""Overtime hours by rate band for attendance and timesheets (#380, rule 5).

Bands are counted when read, from the current rules, holidays and roster; they
are hours only and are not stored (payroll is future work; see
docs/hr/roster-rules.md for the proposed snapshot at approval).

What counts as overtime:
- Attendance: time worked before the scheduled start or after the scheduled end.
  The whole attendance, less its unpaid break, is overtime on a public holiday
  (owner, 2026-10-31, Art. 6), when the employee was called in on a rostered day off
  (the published roster had a non-work code for that day), and for non-shift staff
  on a Saturday or Sunday.
- Timesheet entries: ``overtime_hours`` as an extension right after the shift
  ends, or from the Saturday window start (08:00 by default) when the day had no
  timed shift. On those whole-day days the rostered shift's worked hours (span
  minus break) count first, from the shift start.

Staff not covered by the union agreement get no bands.
"""

import uuid
from collections.abc import Callable, Iterable, Sequence
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.utils.timezones import GRENADA

from . import rule_service
from .expansion import expand_shift, worked_shift_hours
from .models import (
    PublicHoliday,
    RosterAssignment,
    RosterPeriod,
    RosterRevision,
    RosterRevisionAction,
    ShiftCatalog,
    ShiftCategory,
    WorkerType,
)
from .overtime import (
    DayKind,
    OvertimeBand,
    OvertimeSpell,
    band_overtime,
    classify_day,
    extension_spell,
)
from .rules import RosterRules, worker_type_for


def _local(value: datetime) -> datetime:
    """Stored UTC-naive instant as naive Grenada local time."""
    return value.replace(tzinfo=UTC).astimezone(GRENADA).replace(tzinfo=None)


async def holidays_between(session: AsyncSession, start: date, end: date) -> set[date]:
    rows = (
        await session.execute(
            select(PublicHoliday.holiday_date, PublicHoliday.is_recurring).where(
                or_(
                    PublicHoliday.holiday_date.between(start, end),
                    PublicHoliday.is_recurring.is_(True),
                )
            )
        )
    ).all()
    found: set[date] = set()
    for day, recurring in rows:
        if not recurring:
            found.add(day)
            continue
        for year in range(start.year, end.year + 1):
            try:
                candidate = day.replace(year=year)
            except ValueError:  # 29 February
                continue
            if start <= candidate <= end:
                found.add(candidate)
    return found


async def published_codes(
    session: AsyncSession, period_ids: Iterable[uuid.UUID]
) -> dict[tuple[uuid.UUID, date], str]:
    """Shift codes as published (the latest PUBLISHED revision snapshot)."""
    ids = list(set(period_ids))
    if not ids:
        return {}
    revisions = (
        await session.scalars(
            select(RosterRevision)
            .where(
                RosterRevision.roster_period_id.in_(ids),
                RosterRevision.action == RosterRevisionAction.PUBLISHED,
            )
            .order_by(RosterRevision.revision_number)
        )
    ).all()
    codes: dict[tuple[uuid.UUID, date], str] = {}
    for revision in revisions:
        items = revision.snapshot.get("assignments")
        if not isinstance(items, list):
            continue
        for item in items:
            if not isinstance(item, dict):
                continue
            try:
                key = (
                    uuid.UUID(str(item["user_id"])),
                    date.fromisoformat(str(item["assignment_date"])),
                )
            except KeyError, ValueError:
                continue
            codes[key] = str(item.get("shift_code"))
    return codes


async def _work_codes(session: AsyncSession) -> set[str]:
    return set(
        await session.scalars(
            select(ShiftCatalog.code).where(
                ShiftCatalog.category == ShiftCategory.WORK,
                ShiftCatalog.counts_as_work_hours.is_(True),
            )
        )
    )


class _Context:
    """Rules, coverage and holidays for one batch of rows."""

    def __init__(self) -> None:
        self.rules: dict[str, RosterRules] = {}

    async def load(
        self,
        session: AsyncSession,
        *,
        departments: Iterable[str],
        users: Iterable[uuid.UUID],
        start: date,
        end: date,
    ) -> None:
        for department_id in set(departments):
            self.rules[department_id] = await rule_service.rules_for_department(
                session, department_id
            )
        self.profiles = await rule_service.profiles_for(session, users)
        self.holidays = await holidays_between(session, start, end)

    def kind_for(self, attributed: date, *, day_off: bool) -> Callable[[date], DayKind]:
        """Day kinds for one working day's overtime; only that day can be the
        rostered day off."""
        holidays = self.holidays

        def kind(day: date) -> DayKind:
            return classify_day(
                day, holidays=holidays, day_off=day_off and day == attributed
            )

        return kind


def _whole_day(
    *, non_shift: bool, called_in: bool, day: date, holidays: set[date]
) -> bool:
    """The whole worked shift is overtime: on a public holiday for everyone
    (owner, 2026-10-31, Art. 6), when called in on a rostered day off, and for
    non-shift staff on a Saturday or Sunday."""
    if called_in or day in holidays:
        return True
    return non_shift and day.weekday() >= 5


async def attendance_bands(
    session: AsyncSession,
    rows: Sequence[tuple[RosterAssignment, RosterPeriod, ShiftCatalog, object]],
) -> dict[uuid.UUID, list[OvertimeBand]]:
    """Bands per roster assignment id for rows with a completed attendance."""
    from src.hr.attendance.models import AttendanceRecord

    done = [
        (a, p, s, r)
        for a, p, s, r in rows
        if isinstance(r, AttendanceRecord) and r.departed_at is not None
    ]
    if not done:
        return {}
    dates = [a.assignment_date for a, _, _, _ in done]
    ctx = _Context()
    await ctx.load(
        session,
        departments={p.department_id for _, p, _, _ in done},
        users={a.user_id for a, _, _, _ in done},
        start=min(dates),
        end=max(dates) + timedelta(days=1),
    )
    published = await published_codes(session, {p.id for _, p, _, _ in done})
    work_codes = await _work_codes(session)
    result: dict[uuid.UUID, list[OvertimeBand]] = {}
    for assignment, period, shift, record in done:
        if not isinstance(record, AttendanceRecord) or record.departed_at is None:
            continue
        rules = ctx.rules[period.department_id]
        profile = ctx.profiles.get(assignment.user_id)
        if rules.overtime is None or (profile is not None and not profile.covered):
            continue
        interval = expand_shift(assignment.assignment_date, shift)
        if interval is None:
            continue
        arrived, departed = _local(record.arrived_at), _local(record.departed_at)
        scheduled_start, scheduled_end = interval
        worker = worker_type_for(rules, profile) if profile else rules.worker_type
        non_shift = worker == WorkerType.NON_SHIFT
        published_code = published.get((assignment.user_id, assignment.assignment_date))
        called_in = (
            not non_shift
            and published_code is not None
            and published_code not in work_codes
        )
        if _whole_day(
            non_shift=non_shift,
            called_in=called_in,
            day=assignment.assignment_date,
            holidays=ctx.holidays,
        ):
            # The unpaid break is not worked: the recorded one, or the shift's.
            unpaid = record.break_minutes or shift.break_minutes or 0
            end = max(arrived, departed - timedelta(minutes=unpaid))
            spells = [OvertimeSpell(arrived, end)]
        else:
            spells = []
            if arrived < scheduled_start:
                spells.append(OvertimeSpell(arrived, scheduled_start))
            if departed > scheduled_end:
                spells.append(OvertimeSpell(scheduled_end, departed))
        bands = band_overtime(
            spells,
            attributed_day=assignment.assignment_date,
            kind_for=ctx.kind_for(assignment.assignment_date, day_off=called_in),
            bands=rules.overtime,
        )
        if bands:
            result[assignment.id] = bands
    return result


async def timesheet_bands(
    session: AsyncSession,
    *,
    user_id: uuid.UUID,
    department_id: str,
    entries: Sequence[object],
) -> dict[uuid.UUID, list[OvertimeBand]]:
    """Bands per timesheet entry id: entries with overtime hours, and rostered
    work on a day where the whole shift is overtime (a public holiday, or a
    Saturday or Sunday for non-shift staff)."""
    from src.hr.timesheet.models import TimesheetEntry

    rows = [e for e in entries if isinstance(e, TimesheetEntry)]
    if not rows:
        return {}
    dates = [e.entry_date for e in rows]
    ctx = _Context()
    await ctx.load(
        session,
        departments={department_id},
        users={user_id},
        start=min(dates),
        end=max(dates),
    )
    rules = ctx.rules[department_id]
    profile = ctx.profiles.get(user_id)
    if rules.overtime is None or (profile is not None and not profile.covered):
        return {}
    worker = worker_type_for(rules, profile) if profile else rules.worker_type
    non_shift = worker == WorkerType.NON_SHIFT
    rostered = {
        a.assignment_date: s
        for a, s in (
            await session.execute(
                select(RosterAssignment, ShiftCatalog)
                .join(ShiftCatalog, ShiftCatalog.code == RosterAssignment.shift_code)
                .where(
                    RosterAssignment.user_id == user_id,
                    RosterAssignment.assignment_date.in_(dates),
                )
            )
        ).all()
    }
    codes = {e.shift_code for e in rows if e.shift_code}
    catalogue = {
        s.code: s
        for s in await session.scalars(
            select(ShiftCatalog).where(ShiftCatalog.code.in_(codes))
        )
    }
    result: dict[uuid.UUID, list[OvertimeBand]] = {}
    for entry in rows:
        shift = rostered.get(entry.entry_date) or catalogue.get(entry.shift_code or "")
        interval = (
            expand_shift(entry.entry_date, shift)
            if shift is not None
            and shift.category == ShiftCategory.WORK
            and shift.counts_as_work_hours
            else None
        )
        extra = Decimal(entry.overtime_hours)
        whole_day = interval is not None and _whole_day(
            non_shift=non_shift,
            called_in=False,
            day=entry.entry_date,
            holidays=ctx.holidays,
        )
        if whole_day and interval is not None and shift is not None:
            worked = (worked_shift_hours(shift) or Decimal(0)) + extra
            spell = OvertimeSpell(
                interval[0], interval[0] + timedelta(seconds=float(worked * 3600))
            )
        else:
            maybe = extension_spell(
                interval[1] if interval else None,
                entry.entry_date,
                extra,
                day_start=rules.overtime.saturday_window_start,
            )
            if maybe is None:
                continue
            spell = maybe
        day_off = not non_shift and interval is None
        bands = band_overtime(
            [spell],
            attributed_day=entry.entry_date,
            kind_for=ctx.kind_for(entry.entry_date, day_off=day_off),
            bands=rules.overtime,
        )
        if bands:
            result[entry.id] = bands
    return result
