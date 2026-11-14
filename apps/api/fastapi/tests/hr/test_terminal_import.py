"""Terminal punch import (ADR-0040, Decision 4): mapping, processing and re-runs."""

from collections import Counter
from datetime import date, datetime

import pytest
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from src.audit.models import AuditEntry
from src.auth.models import RoleAssignmentScope, User
from src.exceptions import AppException, AuthorizationError
from src.hr.attendance import clock_service, punch_service, terminal_service
from src.hr.attendance.models import (
    AttendanceRecord,
    TerminalPunch,
    TerminalPunchOutcome,
)
from src.hr.attendance.terminal_service import ImportSummary
from src.hr.models import Department
from src.hr.roster.models import ShiftCatalog, ShiftCategory
from src.hr.roster.schemas import (
    RosterAssignmentBulkCreate,
    RosterAssignmentInput,
    RosterPeriodCreate,
)
from src.hr.roster.service import (
    bulk_upsert_roster_assignments,
    create_roster_period,
    publish_roster_period,
)
from tests.factories import (
    assign_role,
    make_employee,
    make_role_with_permission,
    make_user,
)

FIXTURE_REASON = "Fixture roster; roster rules are not under test"
DEPT = "dept_terminal"
OTHER = "dept_terminal_other"
DAY = date(2026, 7, 6)
NIGHT = date(2026, 7, 13)

RECORDED = TerminalPunchOutcome.RECORDED
ALREADY = TerminalPunchOutcome.ALREADY_RECORDED
REPEAT = TerminalPunchOutcome.REPEAT
UNMAPPED = TerminalPunchOutcome.UNMAPPED
NO_SHIFT = TerminalPunchOutcome.NO_SHIFT
REFUSED = TerminalPunchOutcome.REFUSED


async def _shifts(db: AsyncSession) -> None:
    for dept in (DEPT, OTHER):
        if not await db.get(Department, dept):
            db.add(Department(organisation_id="gaa", code=dept, id=dept, name=dept))
    if not await db.get(ShiftCatalog, "TDM"):
        db.add(
            ShiftCatalog(
                code="TDM",
                label="Terminal day",
                category=ShiftCategory.WORK,
                start_time="05:30",
                end_time="14:00",
                ends_next_day=False,
            )
        )
    if not await db.get(ShiftCatalog, "TNT"):
        db.add(
            ShiftCatalog(
                code="TNT",
                label="Terminal night",
                category=ShiftCategory.WORK,
                start_time="21:30",
                end_time="06:30",
                ends_next_day=True,
            )
        )
    await db.commit()


async def _manager(db: AsyncSession) -> User:
    await _shifts(db)
    return await make_user(db, superuser=True)


async def _staff(db: AsyncSession, *, submit: bool = True) -> User:
    """An employee of DEPT; ``submit`` grants their own timesheet.submit.self."""
    user = await make_user(db)
    await make_employee(db, user=user, department_id=DEPT)
    if submit:
        role, _ = await make_role_with_permission(db, "timesheet.submit.self")
        await assign_role(db, user=user, role=role, scope=RoleAssignmentScope.SELF)
    return user


async def _publish(
    db: AsyncSession, manager: User, rows: list[tuple[User, str, date]]
) -> None:
    period = await create_roster_period(
        session=db,
        current_user=manager,
        period_in=RosterPeriodCreate(
            department_id=DEPT,
            period_start=date(2026, 7, 1),
            period_end=date(2026, 7, 31),
        ),
    )
    await bulk_upsert_roster_assignments(
        session=db,
        current_user=manager,
        payload=RosterAssignmentBulkCreate(
            roster_period_id=period.id,
            assignments=[
                RosterAssignmentInput(user_id=u.id, assignment_date=d, shift_code=code)
                for u, code, d in rows
            ],
        ),
    )
    await publish_roster_period(
        session=db,
        current_user=manager,
        period_id=period.id,
        rule_override_reason=FIXTURE_REASON,
    )


async def _map(db: AsyncSession, manager: User, device: str, user: User) -> None:
    await terminal_service.add_mapping(
        session=db,
        current_user=manager,
        department_id=DEPT,
        device_user_id=device,
        user_id=user.id,
    )


async def _import(db: AsyncSession, manager: User, export: str) -> ImportSummary:
    return await terminal_service.import_export(
        session=db,
        current_user=manager,
        department_id=DEPT,
        terminal="Main gate",
        content=export.encode(),
    )


async def _records(db: AsyncSession) -> list[AttendanceRecord]:
    return list((await db.scalars(select(AttendanceRecord))).all())


async def _punches(db: AsyncSession) -> list[TerminalPunch]:
    return list((await db.scalars(select(TerminalPunch))).all())


async def test_arrival_and_departure_are_recorded_and_a_rerun_imports_nothing(
    db_async: AsyncSession,
) -> None:
    manager = await _manager(db_async)
    employee = await _staff(db_async)
    await _publish(db_async, manager, [(employee, "TDM", DAY)])
    await _map(db_async, manager, "7", employee)
    export = "7\t2026-07-06 05:31:02\t1\t0\t0\t0\n7\t2026-07-06 14:02:00\t1\t1\t0\t0\n"

    first = await _import(db_async, manager, export)

    assert (first.new_punches, first.duplicates, first.errors) == (2, 0, [])
    assert first.outcomes[RECORDED] == 2
    [record] = await _records(db_async)
    # Grenada local times, stored as UTC.
    assert record.arrived_at == datetime(2026, 7, 6, 9, 31, 2)
    assert record.departed_at == datetime(2026, 7, 6, 18, 2, 0)

    again = await _import(db_async, manager, export)

    assert (again.new_punches, again.duplicates) == (0, 2)
    assert again.outcomes == Counter()
    assert len(await _records(db_async)) == 1
    assert len(await _punches(db_async)) == 2


async def test_unmapped_punch_is_held_until_mapped_then_reprocessed(
    db_async: AsyncSession,
) -> None:
    manager = await _manager(db_async)
    employee = await _staff(db_async)
    await _publish(db_async, manager, [(employee, "TDM", DAY)])

    first = await _import(db_async, manager, "7 2026-07-06 05:31:02\n")

    assert first.outcomes[UNMAPPED] == 1
    [held] = await _punches(db_async)
    assert held.outcome == UNMAPPED.value
    assert held.user_id is None
    assert await _records(db_async) == []

    await _map(db_async, manager, "7", employee)
    summary = await terminal_service.reprocess(
        session=db_async, current_user=manager, department_id=DEPT
    )

    assert summary.processed == 1
    assert summary.outcomes[RECORDED] == 1
    await db_async.refresh(held)
    assert held.outcome == RECORDED.value
    assert held.user_id == employee.id
    assert held.roster_assignment_id is not None
    assert len(await _records(db_async)) == 1


async def test_repeat_scan_within_five_minutes_is_ignored(
    db_async: AsyncSession,
) -> None:
    manager = await _manager(db_async)
    employee = await _staff(db_async)
    await _publish(db_async, manager, [(employee, "TDM", DAY)])
    await _map(db_async, manager, "7", employee)

    summary = await _import(
        db_async,
        manager,
        "7 2026-07-06 05:31:00\n7 2026-07-06 05:33:30\n",
    )

    assert summary.outcomes[RECORDED] == 1
    assert summary.outcomes[REPEAT] == 1
    [record] = await _records(db_async)
    assert record.arrived_at == datetime(2026, 7, 6, 9, 31, 0)
    assert record.departed_at is None


async def test_night_arrival_and_departure_pair_across_midnight(
    db_async: AsyncSession,
) -> None:
    manager = await _manager(db_async)
    employee = await _staff(db_async)
    await _publish(db_async, manager, [(employee, "TNT", NIGHT)])
    await _map(db_async, manager, "7", employee)

    summary = await _import(
        db_async,
        manager,
        "7\t2026-07-13 21:25:00\t1\n7\t2026-07-14 06:40:00\t1\n",
    )

    assert summary.outcomes[RECORDED] == 2
    [record] = await _records(db_async)
    assert record.arrived_at == datetime(2026, 7, 14, 1, 25, 0)
    assert record.departed_at == datetime(2026, 7, 14, 10, 40, 0)


async def test_punch_with_no_published_shift_is_flagged_not_invented(
    db_async: AsyncSession,
) -> None:
    manager = await _manager(db_async)
    employee = await _staff(db_async)
    await _publish(db_async, manager, [(employee, "TDM", DAY)])
    await _map(db_async, manager, "7", employee)

    summary = await _import(db_async, manager, "7 2026-07-20 05:31:00\n")

    assert summary.outcomes[NO_SHIFT] == 1
    [punch] = await _punches(db_async)
    assert punch.user_id == employee.id
    assert punch.roster_assignment_id is None
    assert await _records(db_async) == []


async def test_phone_punch_already_recorded_is_not_duplicated(
    db_async: AsyncSession,
) -> None:
    manager = await _manager(db_async)
    employee = await _staff(db_async)
    await _publish(db_async, manager, [(employee, "TDM", DAY)])
    await _map(db_async, manager, "7", employee)
    _, token = await clock_service.create_site(
        session=db_async, current_user=manager, department_id=DEPT, name="Gate"
    )
    _, phone, *_ = await clock_service.clock(
        session=db_async,
        current_user=employee,
        token=token,
        now=datetime(2026, 7, 6, 9, 30, 20),
    )
    await punch_service.approve_punch(
        session=db_async, current_user=manager, punch_id=phone.id
    )

    summary = await _import(db_async, manager, "7 2026-07-06 05:31:02\n")

    assert summary.outcomes[ALREADY] == 1
    assert len(await _records(db_async)) == 1
    [punch] = await _punches(db_async)
    assert punch.outcome == ALREADY.value
    assert punch.roster_assignment_id is not None


async def test_one_refused_row_does_not_stop_the_others(
    db_async: AsyncSession,
) -> None:
    manager = await _manager(db_async)
    unlicensed = await _staff(db_async, submit=False)
    employee = await _staff(db_async)
    await _publish(
        db_async,
        manager,
        [(unlicensed, "TDM", DAY), (employee, "TDM", DAY)],
    )
    await _map(db_async, manager, "8", unlicensed)
    await _map(db_async, manager, "7", employee)

    summary = await _import(
        db_async,
        manager,
        "8 2026-07-06 05:31:00\n7 2026-07-06 05:32:00\n",
    )

    assert summary.outcomes[REFUSED] == 1
    assert summary.outcomes[RECORDED] == 1
    refused = next(p for p in await _punches(db_async) if p.device_user_id == "8")
    assert refused.outcome == REFUSED.value
    assert refused.detail
    assert [r.user_id for r in await _records(db_async)] == [employee.id]


async def test_duplicate_lines_inside_one_file_count_as_duplicates(
    db_async: AsyncSession,
) -> None:
    manager = await _manager(db_async)
    employee = await _staff(db_async)
    await _publish(db_async, manager, [(employee, "TDM", DAY)])
    await _map(db_async, manager, "7", employee)

    summary = await _import(
        db_async,
        manager,
        "7 2026-07-06 05:31:00\n7 2026-07-06 05:31:00\n",
    )

    assert summary.new_punches == 1
    assert summary.duplicates == 1


async def test_bad_lines_are_reported_and_good_lines_still_import(
    db_async: AsyncSession,
) -> None:
    manager = await _manager(db_async)

    summary = await _import(
        db_async,
        manager,
        "7 2026-07-06 05:31:00\nnot a punch\n",
    )

    assert summary.new_punches == 1
    assert [e.line for e in summary.errors] == [2]


async def test_empty_and_oversized_files_are_refused(db_async: AsyncSession) -> None:
    manager = await _manager(db_async)

    with pytest.raises(AppException) as empty:
        await _import(db_async, manager, "\n\n")
    assert empty.value.status_code == 400

    with pytest.raises(AppException) as too_big:
        await terminal_service.import_export(
            session=db_async,
            current_user=manager,
            department_id=DEPT,
            terminal="Main gate",
            content=b"x" * (terminal_service.MAX_IMPORT_BYTES + 1),
        )
    assert too_big.value.status_code == 413


async def test_mapping_rejects_people_outside_the_department_and_duplicates(
    db_async: AsyncSession,
) -> None:
    manager = await _manager(db_async)
    employee = await _staff(db_async)
    outsider = await make_user(db_async)

    with pytest.raises(AppException) as wrong_department:
        await _map(db_async, manager, "7", outsider)
    assert wrong_department.value.status_code == 400

    await _map(db_async, manager, "7", employee)
    with pytest.raises(AppException) as device_taken:
        await _map(db_async, manager, "7", await _staff(db_async))
    assert device_taken.value.status_code == 409

    with pytest.raises(AppException) as person_taken:
        await _map(db_async, manager, "99", employee)
    assert person_taken.value.status_code == 409


async def test_listing_attention_punches_filters_and_paginates(
    db_async: AsyncSession,
) -> None:
    manager = await _manager(db_async)
    employee = await _staff(db_async)
    await _publish(db_async, manager, [(employee, "TDM", DAY)])
    await _map(db_async, manager, "7", employee)
    await _import(
        db_async,
        manager,
        "7 2026-07-20 05:31:00\n"  # NO_SHIFT
        "9 2026-07-06 05:31:00\n"  # UNMAPPED
        "7 2026-07-06 05:32:30\n"  # RECORDED: a shift arrival, not held
        "7 2026-07-21 05:31:00\n",  # NO_SHIFT
    )

    rows, total = await terminal_service.list_punches(
        session=db_async,
        current_user=manager,
        department_id=DEPT,
        outcome=None,
        terminal=None,
        from_date=None,
        to_date=None,
        limit=10,
        offset=0,
    )
    assert total == 3
    assert {row.punch.outcome for row in rows} == {
        UNMAPPED.value,
        NO_SHIFT.value,
    }

    _, total_no_shift = await terminal_service.list_punches(
        session=db_async,
        current_user=manager,
        department_id=DEPT,
        outcome=TerminalPunchOutcome.NO_SHIFT,
        terminal=None,
        from_date=date(2026, 7, 21),
        to_date=date(2026, 7, 21),
        limit=10,
        offset=0,
    )
    assert total_no_shift == 1

    page, total_paged = await terminal_service.list_punches(
        session=db_async,
        current_user=manager,
        department_id=DEPT,
        outcome=None,
        terminal=None,
        from_date=None,
        to_date=None,
        limit=1,
        offset=2,
    )
    assert total_paged == 3
    assert len(page) == 1


async def test_people_without_roster_authority_cannot_import_or_map(
    db_async: AsyncSession,
) -> None:
    await _shifts(db_async)
    plain = await _staff(db_async)
    employee = await _staff(db_async)

    with pytest.raises(AuthorizationError):
        await _import(db_async, plain, "7 2026-07-06 05:31:00\n")
    with pytest.raises(AuthorizationError):
        await _map(db_async, plain, "7", employee)


async def test_terminal_tables_and_unique_keys_exist_after_migration(
    db_async: AsyncSession,
) -> None:
    names = set(
        (
            await db_async.scalars(
                text(
                    "select conname from pg_constraint where conname like 'uq_hr_terminal%'"
                )
            )
        ).all()
    )

    assert names == {
        "uq_hr_terminal_user_device",
        "uq_hr_terminal_user_person",
        "uq_hr_terminal_punch_scan",
    }


async def test_mapping_and_imported_punches_are_audited_to_the_hr_actor(
    db_async: AsyncSession,
) -> None:
    manager = await _manager(db_async)
    employee = await _staff(db_async)
    await _publish(db_async, manager, [(employee, "TDM", DAY)])
    await _map(db_async, manager, "7", employee)
    await _import(db_async, manager, "7 2026-07-06 05:31:02\n")

    record_types = set(
        (
            await db_async.scalars(
                select(AuditEntry.record_type).where(
                    AuditEntry.actor_user_id == manager.id
                )
            )
        ).all()
    )

    assert {"terminal_user", "terminal_punch"} <= record_types
