"""Roster rule sets, enforcement on every change path and audited overrides (#380)."""

from datetime import UTC, date, datetime, time, timedelta
from decimal import Decimal

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.audit.models import AuditEntry
from src.auth.models import RoleAssignmentScope, User
from src.exceptions import AppException
from src.hr.attendance.models import AttendanceRecord
from src.hr.exceptions import HRValidationError
from src.hr.leave.models import LeaveRequest, LeaveType
from src.hr.models import Department, EmploymentRecord, RequestStatus
from src.hr.roster import change_checks, overtime_service
from src.hr.roster.models import (
    PublicHoliday,
    RosterAssignment,
    RosterPeriod,
    RosterPeriodStatus,
    RosterRevision,
    RosterRevisionAction,
    RosterRuleOverride,
    ShiftCatalog,
    ShiftCategory,
)
from src.hr.roster.rule_service import (
    RosterRuleWarningsError,
    check_period_rules,
    clear_department_rule_set,
    read_department_rule_set,
    save_department_rule_set,
    save_organisation_rule_set,
    update_department_rules,
    update_from_rules,
)
from src.hr.roster.rules import DEFAULT_RULES, RuleCode
from src.hr.roster.schemas import (
    RosterAssignmentBulkCreate,
    RosterAssignmentInput,
    RosterPeriodCreate,
    RosterRulesUpdate,
    RuleSetSource,
)
from src.hr.roster.service import (
    bulk_upsert_roster_assignments,
    create_roster_period,
    publish_roster_period,
)
from src.hr.timesheet.models import Timesheet, TimesheetEntry
from src.utils.timezones import GRENADA, local_today
from tests.factories import (
    assign_role,
    make_employee,
    make_role_with_permission,
    make_user,
)

DEPT = "dept_rules"
SHIFTS = (
    ("M", "05:30", "14:00", False, ShiftCategory.WORK),
    ("D", "08:00", "16:00", False, ShiftCategory.WORK),
    ("N", "22:30", "06:00", True, ShiftCategory.WORK),
    ("O", None, None, False, ShiftCategory.OFF),
)
FAR = date(2027, 3, 1)  # a Monday, far from today's notice window


async def _seed(db: AsyncSession) -> None:
    if not await db.get(Department, DEPT):
        db.add(Department(organisation_id="gaa", code=DEPT, id=DEPT, name="Rules"))
    for code, start, end, next_day, category in SHIFTS:
        if not await db.get(ShiftCatalog, code):
            db.add(
                ShiftCatalog(
                    code=code,
                    label=code,
                    category=category,
                    start_time=start,
                    end_time=end,
                    ends_next_day=next_day,
                    counts_as_work_hours=category == ShiftCategory.WORK,
                )
            )
    await db.commit()


async def _manager(db: AsyncSession) -> User:
    await _seed(db)
    manager = await make_user(db, superuser=True)
    await make_employee(db, user=manager, department_id=DEPT)
    return manager


async def _roster(
    db: AsyncSession, manager: User, start: date, cells: dict[date, str]
) -> RosterPeriod:
    period = await create_roster_period(
        session=db,
        current_user=manager,
        period_in=RosterPeriodCreate(
            department_id=DEPT,
            period_start=start,
            period_end=start + timedelta(days=27),
        ),
    )
    await bulk_upsert_roster_assignments(
        session=db,
        current_user=manager,
        payload=RosterAssignmentBulkCreate(
            roster_period_id=period.id,
            assignments=[
                RosterAssignmentInput(
                    user_id=manager.id, assignment_date=day, shift_code=code
                )
                for day, code in cells.items()
            ],
        ),
    )
    return period


async def _published(
    db: AsyncSession, manager: User, cells: dict[date, str]
) -> RosterPeriod:
    period = await _roster(db, manager, FAR, cells)
    period.status = RosterPeriodStatus.PUBLISHED
    await db.commit()
    return period


def _run(start: date, count: int, code: str = "D") -> dict[date, str]:
    return {start + timedelta(days=n): code for n in range(count)}


def _utc(day: date, hh: int, mm: int = 0) -> datetime:
    local = datetime.combine(day, time(hh, mm), tzinfo=GRENADA)
    return local.astimezone(UTC).replace(tzinfo=None)


def _band_map(bands: list[object]) -> dict[str, str]:
    return {str(b.rate): str(b.hours) for b in bands}  # type: ignore[attr-defined]


# --- rule sets --------------------------------------------------------------


async def test_rule_sets_resolve_department_then_organisation(
    db_async: AsyncSession,
) -> None:
    manager = await _manager(db_async)
    _, _, source = await read_department_rule_set(
        session=db_async, current_user=manager, department_id=DEPT
    )
    assert source in {RuleSetSource.ORGANISATION, RuleSetSource.DEFAULT}
    defaults = update_from_rules(DEFAULT_RULES)
    org = await save_organisation_rule_set(
        session=db_async,
        current_user=manager,
        organisation_id="gaa",
        data=defaults.model_copy(update={"max_consecutive_shifts": 5}),
    )
    assert org.department_id is None
    _, row, source = await read_department_rule_set(
        session=db_async, current_user=manager, department_id=DEPT
    )
    assert source == RuleSetSource.ORGANISATION
    assert row is not None and row.max_consecutive_shifts == 5

    await save_department_rule_set(
        session=db_async,
        current_user=manager,
        department_id=DEPT,
        data=defaults.model_copy(update={"notice_days": None}),
    )
    _, row, source = await read_department_rule_set(
        session=db_async, current_user=manager, department_id=DEPT
    )
    assert source == RuleSetSource.DEPARTMENT
    assert row is not None and row.notice_days is None
    assert row.max_consecutive_shifts == 3

    await clear_department_rule_set(
        session=db_async, current_user=manager, department_id=DEPT
    )
    _, _, source = await read_department_rule_set(
        session=db_async, current_user=manager, department_id=DEPT
    )
    assert source == RuleSetSource.ORGANISATION


async def test_rule_set_changes_are_audited(db_async: AsyncSession) -> None:
    manager = await _manager(db_async)
    await save_department_rule_set(
        session=db_async,
        current_user=manager,
        department_id=DEPT,
        data=update_from_rules(DEFAULT_RULES),
    )
    entries = (
        await db_async.scalars(
            select(AuditEntry).where(AuditEntry.record_type == "roster_rule_set")
        )
    ).all()
    assert entries
    assert {entry.actor_user_id for entry in entries} == {manager.id}


async def test_deprecated_limits_endpoint_maps_onto_the_rule_set(
    db_async: AsyncSession,
) -> None:
    manager = await _manager(db_async)
    rules = await update_department_rules(
        session=db_async,
        current_user=manager,
        department_id=DEPT,
        data=RosterRulesUpdate(
            min_rest_hours=Decimal(11),
            max_consecutive_days=6,
            max_weekly_hours=Decimal(48),
        ),
    )
    assert rules.max_consecutive_shifts == 6
    assert rules.shift_weekly_hours == Decimal("48.00")
    assert rules.weekend_window_weeks == 4  # the rest keeps its values


async def test_rule_edits_need_roster_rules_manage(db_async: AsyncSession) -> None:
    await _seed(db_async)
    roster_manager = await make_user(db_async)
    role, _ = await make_role_with_permission(db_async, "roster.manage", "roster.view")
    await assign_role(
        db_async,
        user=roster_manager,
        role=role,
        scope=RoleAssignmentScope.DEPARTMENT,
        department_id=DEPT,
    )
    with pytest.raises(AppException) as denied:
        await save_department_rule_set(
            session=db_async,
            current_user=roster_manager,
            department_id=DEPT,
            data=update_from_rules(DEFAULT_RULES),
        )
    assert denied.value.status_code == 403

    hr_admin = await make_user(db_async)
    rules_role, _ = await make_role_with_permission(db_async, "roster.rules.manage")
    await assign_role(
        db_async,
        user=hr_admin,
        role=rules_role,
        scope=RoleAssignmentScope.DEPARTMENT,
        department_id=DEPT,
    )
    saved = await save_department_rule_set(
        session=db_async,
        current_user=hr_admin,
        department_id=DEPT,
        data=update_from_rules(DEFAULT_RULES),
    )
    assert saved.department_id == DEPT
    # A department grant cannot change the organisation default.
    with pytest.raises(AppException) as org_denied:
        await save_organisation_rule_set(
            session=db_async,
            current_user=hr_admin,
            organisation_id="gaa",
            data=update_from_rules(DEFAULT_RULES),
        )
    assert org_denied.value.status_code == 403


# --- publish ----------------------------------------------------------------


async def test_publish_with_a_breach_needs_a_reason_and_is_audited(
    db_async: AsyncSession,
) -> None:
    manager = await _manager(db_async)
    period = await _roster(db_async, manager, FAR, _run(FAR, 4))
    period_id = period.id
    _, _, violations = await check_period_rules(
        session=db_async, current_user=manager, period_id=period_id
    )
    assert RuleCode.MAX_CONSECUTIVE_DAYS in {v.code for v in violations}

    with pytest.raises(RosterRuleWarningsError) as warned:
        await publish_roster_period(
            session=db_async, current_user=manager, period_id=period_id
        )
    assert warned.value.status_code == 409
    assert warned.value.extra["code"] == "ROSTER_RULE_WARNINGS"
    still_draft = await db_async.get(RosterPeriod, period_id)
    assert still_draft is not None and still_draft.status == RosterPeriodStatus.DRAFT
    with pytest.raises(HRValidationError):
        await publish_roster_period(
            session=db_async,
            current_user=manager,
            period_id=period_id,
            rule_override_reason="ok",
        )

    published = await publish_roster_period(
        session=db_async,
        current_user=manager,
        period_id=period_id,
        rule_override_reason="Cover for the October leave block",
    )
    assert published.status == RosterPeriodStatus.PUBLISHED
    override = (
        await db_async.scalars(
            select(RosterRuleOverride).where(
                RosterRuleOverride.entity_id == str(period_id)
            )
        )
    ).one()
    assert override.context == "PUBLISH"
    assert override.overridden_by_user_id == manager.id
    assert "MAX_CONSECUTIVE_DAYS" in override.rule_codes
    assert override.reason == "Cover for the October leave block"
    audit = (
        await db_async.scalars(
            select(AuditEntry).where(
                AuditEntry.entity_type == "roster_period",
                AuditEntry.entity_id == str(period_id),
                AuditEntry.action == "rule_override",
            )
        )
    ).one()
    assert audit.actor_user_id == manager.id
    revision = (
        await db_async.scalars(
            select(RosterRevision).where(
                RosterRevision.roster_period_id == period_id,
                RosterRevision.action == RosterRevisionAction.PUBLISHED,
            )
        )
    ).one()
    assert revision.snapshot["rule_override_reason"] == override.reason
    assert revision.snapshot["rule_warnings"]


async def test_clean_roster_publishes_without_a_reason(db_async: AsyncSession) -> None:
    manager = await _manager(db_async)
    period = await _roster(db_async, manager, FAR, _run(FAR, 3))
    published = await publish_roster_period(
        session=db_async, current_user=manager, period_id=period.id
    )
    assert published.status == RosterPeriodStatus.PUBLISHED


async def test_uncovered_staff_are_not_checked(db_async: AsyncSession) -> None:
    manager = await _manager(db_async)
    employment = await db_async.scalar(
        select(EmploymentRecord).where(EmploymentRecord.user_id == manager.id)
    )
    assert employment is not None
    employment.union_covered = False
    await db_async.commit()
    period = await _roster(db_async, manager, FAR, _run(FAR, 10, "M"))
    published = await publish_roster_period(
        session=db_async, current_user=manager, period_id=period.id
    )
    assert published.status == RosterPeriodStatus.PUBLISHED


async def test_rules_switched_off_publish_without_a_reason(
    db_async: AsyncSession,
) -> None:
    manager = await _manager(db_async)
    off = update_from_rules(DEFAULT_RULES).model_copy(
        update={
            "max_consecutive_shifts": None,
            "shift_daily_hours": None,
            "shift_weekly_hours": None,
            "weekend_window_weeks": None,
        }
    )
    await save_department_rule_set(
        session=db_async, current_user=manager, department_id=DEPT, data=off
    )
    period = await _roster(db_async, manager, FAR, _run(FAR, 10, "M"))
    published = await publish_roster_period(
        session=db_async, current_user=manager, period_id=period.id
    )
    assert published.status == RosterPeriodStatus.PUBLISHED


# --- published roster changes (rule 4 notice) --------------------------------


async def test_published_change_inside_notice_needs_a_reason(
    db_async: AsyncSession,
) -> None:
    manager = await _manager(db_async)
    today = local_today()
    soon, later = today + timedelta(days=2), today + timedelta(days=10)
    period = await _roster(db_async, manager, today, {soon: "D", later: "D"})
    period_id = period.id
    await publish_roster_period(
        session=db_async, current_user=manager, period_id=period_id
    )

    def change(
        day: date, code: str, reason: str | None = None
    ) -> RosterAssignmentBulkCreate:
        return RosterAssignmentBulkCreate(
            roster_period_id=period_id,
            assignments=[
                RosterAssignmentInput(
                    user_id=manager.id, assignment_date=day, shift_code=code
                )
            ],
            rule_override_reason=reason,
        )

    # Ten days away is enough notice.
    await bulk_upsert_roster_assignments(
        session=db_async, current_user=manager, payload=change(later, "O")
    )
    with pytest.raises(RosterRuleWarningsError) as warned:
        await bulk_upsert_roster_assignments(
            session=db_async, current_user=manager, payload=change(soon, "O")
        )
    assert [v.code for v in warned.value.violations] == [RuleCode.SHORT_NOTICE]
    await bulk_upsert_roster_assignments(
        session=db_async,
        current_user=manager,
        payload=change(soon, "O", "Staff member asked for the day"),
    )
    override = (
        await db_async.scalars(
            select(RosterRuleOverride).where(
                RosterRuleOverride.context == "ROSTER_CHANGE",
                RosterRuleOverride.entity_id == str(period_id),
            )
        )
    ).one()
    assert override.rule_codes == ["SHORT_NOTICE"]
    # Saving the same cell again changes nothing and needs no reason.
    await bulk_upsert_roster_assignments(
        session=db_async, current_user=manager, payload=change(soon, "O")
    )


async def test_draft_edits_are_not_enforced(db_async: AsyncSession) -> None:
    manager = await _manager(db_async)
    today = local_today()
    period = await _roster(db_async, manager, today, _run(today, 6))
    assert period.status == RosterPeriodStatus.DRAFT


# --- leave, absence, overtime ------------------------------------------------


async def test_cancelling_approved_leave_checks_the_returning_shifts(
    db_async: AsyncSession,
) -> None:
    manager = await _manager(db_async)
    await _published(db_async, manager, _run(FAR, 4))
    leave = LeaveRequest(
        user_id=manager.id,
        department_id=DEPT,
        leave_type=LeaveType.VACATION,
        start_date=FAR + timedelta(days=1),
        end_date=FAR + timedelta(days=1),
        days_requested=Decimal(1),
        status=RequestStatus.APPROVED,
    )
    db_async.add(leave)
    await db_async.commit()

    with pytest.raises(RosterRuleWarningsError) as warned:
        await change_checks.check_cancelled_absence(
            db_async, entity=leave, actor_id=manager.id, reason=None
        )
    assert warned.value.context.value == "LEAVE"
    assert RuleCode.MAX_CONSECUTIVE_DAYS in {v.code for v in warned.value.violations}
    await change_checks.check_cancelled_absence(
        db_async, entity=leave, actor_id=manager.id, reason="Leave withdrawn by staff"
    )
    await db_async.commit()
    override = (
        await db_async.scalars(
            select(RosterRuleOverride).where(
                RosterRuleOverride.entity_id == str(leave.id)
            )
        )
    ).one()
    assert override.context == "LEAVE"


async def test_timesheet_overtime_beyond_daily_hours_needs_a_reason(
    db_async: AsyncSession,
) -> None:
    manager = await _manager(db_async)
    await _published(db_async, manager, {FAR: "D"})
    timesheet = Timesheet(
        user_id=manager.id,
        department_id=DEPT,
        period_start=FAR,
        period_end=FAR + timedelta(days=6),
    )
    db_async.add(timesheet)
    await db_async.flush()
    db_async.add(
        TimesheetEntry(
            timesheet_id=timesheet.id,
            entry_date=FAR,
            shift_code="D",
            roster_hours=Decimal(8),
            actual_hours=Decimal(11),
            overtime_hours=Decimal(3),
        )
    )
    await db_async.commit()
    with pytest.raises(RosterRuleWarningsError) as warned:
        await change_checks.check_timesheet_approval(
            db_async, timesheet=timesheet, actor_id=manager.id, reason=None
        )
    [violation] = warned.value.violations
    assert violation.code == RuleCode.MAX_DAILY_HOURS
    assert violation.observed == Decimal(11)
    await change_checks.check_timesheet_approval(
        db_async, timesheet=timesheet, actor_id=manager.id, reason="Storm watch"
    )


async def test_attendance_overtime_and_bands(db_async: AsyncSession) -> None:
    manager = await _manager(db_async)
    period = await _published(db_async, manager, {FAR: "D"})
    assignment = await db_async.scalar(
        select(RosterAssignment).where(RosterAssignment.roster_period_id == period.id)
    )
    assert assignment is not None
    record = AttendanceRecord(
        roster_assignment_id=assignment.id,
        user_id=manager.id,
        department_id=DEPT,
        arrived_at=_utc(FAR, 8),
        departed_at=_utc(FAR, 22),
    )
    db_async.add(record)
    await db_async.commit()
    with pytest.raises(RosterRuleWarningsError):
        await change_checks.check_attendance_approval(
            db_async,
            record=record,
            hours=Decimal(14),
            breaks_recorded=False,
            actor_id=manager.id,
            reason=None,
            entity_type="attendance",
            entity_id=record.id,
        )
    shift = await db_async.get(ShiftCatalog, "D")
    assert shift is not None
    bands = await overtime_service.attendance_bands(
        db_async, [(assignment, period, shift, record)]
    )
    # Monday 16:00 to 22:00: four hours at 1.5x, then two at 2x.
    assert _band_map(bands[assignment.id]) == {"1.5": "4.00", "2": "2.00"}


async def test_called_in_on_a_rostered_day_off_is_all_overtime(
    db_async: AsyncSession,
) -> None:
    manager = await _manager(db_async)
    saturday = FAR + timedelta(days=5)
    period = await _roster(db_async, manager, FAR, {saturday: "O"})
    await publish_roster_period(
        session=db_async, current_user=manager, period_id=period.id
    )
    await bulk_upsert_roster_assignments(
        session=db_async,
        current_user=manager,
        payload=RosterAssignmentBulkCreate(
            roster_period_id=period.id,
            assignments=[
                RosterAssignmentInput(
                    user_id=manager.id, assignment_date=saturday, shift_code="D"
                )
            ],
        ),
    )
    assignment = await db_async.scalar(
        select(RosterAssignment).where(RosterAssignment.roster_period_id == period.id)
    )
    assert assignment is not None
    record = AttendanceRecord(
        roster_assignment_id=assignment.id,
        user_id=manager.id,
        department_id=DEPT,
        arrived_at=_utc(saturday, 8),
        departed_at=_utc(saturday, 18),
    )
    db_async.add(record)
    await db_async.commit()
    shift = await db_async.get(ShiftCatalog, "D")
    assert shift is not None
    bands = await overtime_service.attendance_bands(
        db_async, [(assignment, period, shift, record)]
    )
    assert _band_map(bands[assignment.id]) == {"2": "8.00", "3": "2.00"}


async def test_timesheet_bands_on_a_public_holiday(db_async: AsyncSession) -> None:
    manager = await _manager(db_async)
    db_async.add(
        PublicHoliday(
            name="Test holiday", holiday_date=FAR, created_by_user_id=manager.id
        )
    )
    await _published(db_async, manager, {FAR: "D"})
    timesheet = Timesheet(
        user_id=manager.id,
        department_id=DEPT,
        period_start=FAR,
        period_end=FAR + timedelta(days=6),
    )
    db_async.add(timesheet)
    await db_async.flush()
    entry = TimesheetEntry(
        timesheet_id=timesheet.id,
        entry_date=FAR,
        shift_code="D",
        overtime_hours=Decimal(10),
    )
    db_async.add(entry)
    await db_async.commit()
    bands = await overtime_service.timesheet_bands(
        db_async, user_id=manager.id, department_id=DEPT, entries=[entry]
    )
    # On a public holiday the whole rostered shift is overtime (Art. 6): the
    # 8 h D shift plus 10 h overtime run 08:00 to 02:00. Holiday hours: 8 at 2x,
    # then 8 at 3x; the 2 h after midnight on an ordinary Tuesday are 2x.
    assert _band_map(bands[entry.id]) == {"2": "10.00", "3": "8.00"}


async def test_holiday_shift_is_all_overtime_less_the_unpaid_break(
    db_async: AsyncSession,
) -> None:
    manager = await _manager(db_async)
    morning = await db_async.get(ShiftCatalog, "M")
    assert morning is not None
    morning.break_minutes = 30
    db_async.add(
        PublicHoliday(
            name="Test holiday", holiday_date=FAR, created_by_user_id=manager.id
        )
    )
    period = await _published(db_async, manager, {FAR: "M"})
    assignment = await db_async.scalar(
        select(RosterAssignment).where(RosterAssignment.roster_period_id == period.id)
    )
    assert assignment is not None
    record = AttendanceRecord(
        roster_assignment_id=assignment.id,
        user_id=manager.id,
        department_id=DEPT,
        arrived_at=_utc(FAR, 5, 30),
        departed_at=_utc(FAR, 14),
    )
    db_async.add(record)
    await db_async.commit()
    bands = await overtime_service.attendance_bands(
        db_async, [(assignment, period, morning, record)]
    )
    # 8.5 h span less the 30-minute unpaid break: 8 worked hours, all at 2x.
    assert _band_map(bands[assignment.id]) == {"2": "8.00"}


async def test_an_8_5_hour_shift_with_its_break_is_not_warned(
    db_async: AsyncSession,
) -> None:
    manager = await _manager(db_async)
    morning = await db_async.get(ShiftCatalog, "M")
    assert morning is not None
    morning.break_minutes = 30
    await db_async.commit()
    period = await _roster(db_async, manager, FAR, _run(FAR, 3, "M"))
    _, _, violations = await check_period_rules(
        session=db_async, current_user=manager, period_id=period.id
    )
    assert violations == []
