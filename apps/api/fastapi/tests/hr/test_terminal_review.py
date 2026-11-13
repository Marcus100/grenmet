"""Terminal punch import: review fixes (proxy authority, ordering, handover, limits)."""

from datetime import UTC, date, datetime

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.models import RoleAssignmentScope, User
from src.exceptions import AppException
from src.hr.attendance import clock_service, punch_service, terminal_service
from src.hr.attendance import service as attendance_service
from src.hr.attendance.models import (
    TerminalPunch,
    TerminalPunchOutcome,
    TerminalUser,
)
from src.hr.attendance.schemas import AttendanceSave
from src.hr.models import EmploymentRecord
from src.hr.roster.models import ShiftCatalog, ShiftCategory
from src.hr.workflow.models import (
    WorkflowInstance,
    WorkflowStatus,
    WorkflowTemplate,
    WorkflowType,
)
from tests.factories import (
    _load_user_with_roles,
    assign_role,
    make_employee,
    make_role_with_permission,
    make_user,
)
from tests.hr.test_terminal_import import (
    ALREADY,
    DAY,
    DEPT,
    NO_SHIFT,
    OTHER,
    RECORDED,
    REFUSED,
    REPEAT,
    UNMAPPED,
    _import,
    _manager,
    _map,
    _publish,
    _punches,
    _records,
    _shifts,
    _staff,
)

PROXY = "timesheet.submit.proxy"


async def _catalog(
    db: AsyncSession, code: str, start: str, end: str, next_day: bool
) -> None:
    if not await db.get(ShiftCatalog, code):
        db.add(
            ShiftCatalog(
                code=code,
                label=f"Review {code}",
                category=ShiftCategory.WORK,
                start_time=start,
                end_time=end,
                ends_next_day=next_day,
            )
        )
        await db.commit()


async def _scoped_manager(
    db: AsyncSession,
    *,
    dept: str = DEPT,
    proxy_scope: RoleAssignmentScope | None = None,
    employed: bool = False,
) -> User:
    """A non-superuser with roster.manage in ``dept``, optionally with proxy rights."""
    await _shifts(db)
    user = await make_user(db)
    if employed:
        await make_employee(db, user=user, department_id=dept)
    manage, _ = await make_role_with_permission(db, "roster.manage")
    await assign_role(
        db,
        user=user,
        role=manage,
        scope=RoleAssignmentScope.DEPARTMENT,
        department_id=dept,
    )
    if proxy_scope is not None:
        proxy, _ = await make_role_with_permission(db, PROXY)
        await assign_role(
            db,
            user=user,
            role=proxy,
            scope=proxy_scope,
            department_id=dept
            if proxy_scope == RoleAssignmentScope.DEPARTMENT
            else None,
        )
    return await _load_user_with_roles(db, user.id)


async def _site(db: AsyncSession, manager: User) -> str:
    _, token = await clock_service.create_site(
        session=db, current_user=manager, department_id=DEPT, name="Gate"
    )
    return token


async def _phone_arrival(db, manager, employee, token, now: datetime) -> None:
    loaded = await _load_user_with_roles(db, employee.id)
    _, punch, *_ = await clock_service.clock(
        session=db, current_user=loaded, token=token, now=now
    )
    await punch_service.approve_punch(
        session=db, current_user=manager, punch_id=punch.id
    )


# --- proxy authority -------------------------------------------------------


async def test_roster_manager_without_proxy_rights_is_refused_and_nothing_is_written(
    db_async: AsyncSession,
) -> None:
    publisher = await _manager(db_async)
    employee = await _staff(db_async)
    restricted_self = await _scoped_manager(db_async, employed=True)
    await _publish(
        db_async,
        publisher,
        [(employee, "TDM", DAY), (restricted_self, "TDM", date(2026, 7, 7))],
    )
    await _map(db_async, publisher, "7", employee)
    await _map(db_async, publisher, "5", restricted_self)

    summary = await _import(
        db_async,
        restricted_self,
        "7 2026-07-06 05:31:00\n5 2026-07-07 05:31:00\n",
    )

    assert summary.outcomes[REFUSED] == 2
    assert await _records(db_async) == []
    assert all(p.detail for p in await _punches(db_async))


async def test_proxy_scope_that_does_not_cover_the_employee_is_refused(
    db_async: AsyncSession,
) -> None:
    publisher = await _manager(db_async)
    employee = await _staff(db_async)
    await _publish(db_async, publisher, [(employee, "TDM", DAY)])
    await _map(db_async, publisher, "7", employee)
    # Proxy rights that only cover the actor's own record: not this employee.
    restricted = await _scoped_manager(db_async, proxy_scope=RoleAssignmentScope.SELF)

    summary = await _import(db_async, restricted, "7 2026-07-06 05:31:00\n")

    assert summary.outcomes[REFUSED] == 1
    assert await _records(db_async) == []


async def test_refused_punch_is_decided_after_proxy_rights_are_granted(
    db_async: AsyncSession,
) -> None:
    publisher = await _manager(db_async)
    employee = await _staff(db_async)
    await _publish(db_async, publisher, [(employee, "TDM", DAY)])
    await _map(db_async, publisher, "7", employee)
    restricted = await _scoped_manager(db_async)
    restricted_id = restricted.id
    await _import(db_async, restricted, "7 2026-07-06 05:31:00\n")
    assert await _records(db_async) == []

    proxy, _ = await make_role_with_permission(db_async, PROXY)
    await assign_role(
        db_async,
        user=await _load_user_with_roles(db_async, restricted_id),
        role=proxy,
        scope=RoleAssignmentScope.DEPARTMENT,
        department_id=DEPT,
    )
    actor = await _load_user_with_roles(db_async, restricted_id)
    summary = await terminal_service.reprocess(
        session=db_async, current_user=actor, department_id=DEPT
    )

    assert summary.outcomes[RECORDED] == 1
    assert len(await _records(db_async)) == 1


async def test_mapping_requires_proxy_authority_for_the_person(
    db_async: AsyncSession,
) -> None:
    await _manager(db_async)
    employee = await _staff(db_async)
    without = await _scoped_manager(db_async)
    scoped = await _scoped_manager(db_async, proxy_scope=RoleAssignmentScope.SELF)

    for actor in (without, scoped):
        with pytest.raises(AppException) as refused:
            await terminal_service.add_mapping(
                session=db_async,
                current_user=actor,
                department_id=DEPT,
                device_user_id="7",
                user_id=employee.id,
            )
        assert refused.value.status_code == 403
    assert (await db_async.scalars(select(TerminalUser))).all() == []


# --- visibility of imported attendance ------------------------------------


async def test_imported_attendance_carries_a_terminal_marker_and_keeps_employee_notes(
    db_async: AsyncSession,
) -> None:
    manager = await _manager(db_async)
    employee = await _staff(db_async)
    await _publish(db_async, manager, [(employee, "TDM", DAY)])
    await _map(db_async, manager, "7", employee)
    loaded = await _load_user_with_roles(db_async, employee.id)
    await attendance_service.save_attendance(
        session=db_async,
        current_user=loaded,
        payload=AttendanceSave(
            roster_assignment_id=(await _records_assignment_id(db_async, employee)),
            expected_revision=0,
            arrived_at=datetime(2026, 7, 6, 9, 31, tzinfo=UTC),
            notes="Late, bus",
        ),
    )

    await _import(db_async, manager, "7 2026-07-06 14:02:00\n")

    [record] = await _records(db_async)
    assert record.departed_at == datetime(2026, 7, 6, 18, 2, 0)
    assert record.notes == "Late, bus | Terminal import: main gate"


async def _records_assignment_id(db: AsyncSession, employee: User):
    from src.hr.roster.models import RosterAssignment

    return await db.scalar(
        select(RosterAssignment.id).where(RosterAssignment.user_id == employee.id)
    )


# --- decisions and re-runs -------------------------------------------------


async def test_reprocess_decides_pending_rows(db_async: AsyncSession) -> None:
    manager = await _manager(db_async)
    employee = await _staff(db_async)
    await _publish(db_async, manager, [(employee, "TDM", DAY)])
    await _map(db_async, manager, "7", employee)
    import uuid

    db_async.add(
        TerminalPunch(
            id=uuid.uuid4(),
            department_id=DEPT,
            terminal="main gate",
            device_user_id="7",
            punched_at=datetime(2026, 7, 6, 9, 31, 2),
            outcome=TerminalPunchOutcome.PENDING.value,
            import_id=uuid.uuid4(),
        )
    )
    await db_async.commit()

    summary = await terminal_service.reprocess(
        session=db_async, current_user=manager, department_id=DEPT
    )

    assert summary.processed == 1
    assert summary.outcomes[RECORDED] == 1


async def test_equivalent_labels_share_one_dedupe_key(db_async: AsyncSession) -> None:
    manager = await _manager(db_async)
    employee = await _staff(db_async)
    await _publish(db_async, manager, [(employee, "TDM", DAY)])
    await _map(db_async, manager, "7", employee)
    export = "7 2026-07-06 05:31:00\n"

    first = await terminal_service.import_export(
        session=db_async,
        current_user=manager,
        department_id=DEPT,
        terminal="Main gate",
        content=export.encode(),
    )
    again = await terminal_service.import_export(
        session=db_async,
        current_user=manager,
        department_id=DEPT,
        terminal="  MAIN GATE ",
        content=export.encode(),
    )

    assert (first.new_punches, again.new_punches, again.duplicates) == (1, 0, 1)
    assert {p.terminal for p in await _punches(db_async)} == {"main gate"}


async def test_terminal_departure_then_phone_departure_is_not_counted_twice(
    db_async: AsyncSession,
) -> None:
    manager = await _manager(db_async)
    employee = await _staff(db_async)
    await _publish(db_async, manager, [(employee, "TDM", DAY)])
    await _map(db_async, manager, "7", employee)
    token = await _site(db_async, manager)
    await _phone_arrival(
        db_async, manager, employee, token, datetime(2026, 7, 6, 9, 30, 20)
    )
    loaded = await _load_user_with_roles(db_async, employee.id)
    _, phone_depart, *_ = await clock_service.clock(
        session=db_async,
        current_user=loaded,
        token=token,
        now=datetime(2026, 7, 6, 18, 0, 0),
    )

    summary = await _import(db_async, manager, "7 2026-07-06 14:01:00\n")
    assert summary.outcomes[RECORDED] == 1

    with pytest.raises(AppException) as conflict:
        await punch_service.approve_punch(
            session=db_async, current_user=manager, punch_id=phone_depart.id
        )
    assert conflict.value.status_code == 409
    [record] = await _records(db_async)
    assert record.departed_at == datetime(2026, 7, 6, 18, 1, 0)


async def test_departure_refused_when_attendance_is_already_submitted(
    db_async: AsyncSession,
) -> None:
    manager = await _manager(db_async)
    employee = await _staff(db_async)
    await _publish(db_async, manager, [(employee, "TDM", DAY)])
    await _map(db_async, manager, "7", employee)
    await _import(db_async, manager, "7 2026-07-06 05:31:00\n")
    [record] = await _records(db_async)
    template = WorkflowTemplate(
        department_id=DEPT, workflow_type=WorkflowType.TIMESHEET, name="Review"
    )
    db_async.add(template)
    await db_async.flush()
    instance = WorkflowInstance(
        workflow_template_id=template.id,
        department_id=DEPT,
        workflow_type=WorkflowType.TIMESHEET,
        entity_type="attendance",
        entity_id=record.id,
        requested_by_user_id=employee.id,
        status=WorkflowStatus.PENDING,
    )
    db_async.add(instance)
    await db_async.flush()
    record.workflow_instance_id = instance.id
    await db_async.commit()

    summary = await _import(db_async, manager, "7 2026-07-06 14:02:00\n")

    assert summary.outcomes[REFUSED] == 1
    [refused] = [p for p in await _punches(db_async) if p.outcome == REFUSED.value]
    assert "Submitted or approved" in (refused.detail or "")
    await db_async.refresh(record)
    assert record.departed_at is None


async def test_repeat_window_is_inclusive_at_five_minutes(
    db_async: AsyncSession,
) -> None:
    manager = await _manager(db_async)
    employee = await _staff(db_async)
    await _publish(db_async, manager, [(employee, "TDM", DAY)])
    await _map(db_async, manager, "7", employee)

    summary = await _import(
        db_async, manager, "7 2026-07-06 05:31:00\n7 2026-07-06 05:36:00\n"
    )

    assert summary.outcomes[RECORDED] == 1
    assert summary.outcomes[REPEAT] == 1


async def test_just_past_five_minutes_is_not_a_repeat(db_async: AsyncSession) -> None:
    manager = await _manager(db_async)
    employee = await _staff(db_async)
    await _publish(db_async, manager, [(employee, "TDM", DAY)])
    await _map(db_async, manager, "7", employee)

    summary = await _import(
        db_async, manager, "7 2026-07-06 05:31:00\n7 2026-07-06 05:36:01\n"
    )

    assert summary.outcomes[REPEAT] == 0
    assert summary.outcomes[ALREADY] == 1


async def test_already_recorded_window_is_inclusive_at_fifteen_minutes(
    db_async: AsyncSession,
) -> None:
    manager = await _manager(db_async)
    employee = await _staff(db_async)
    await _publish(db_async, manager, [(employee, "TDM", DAY)])
    await _map(db_async, manager, "7", employee)
    token = await _site(db_async, manager)
    await _phone_arrival(
        db_async, manager, employee, token, datetime(2026, 7, 6, 9, 30, 0)
    )

    summary = await _import(db_async, manager, "7 2026-07-06 05:45:00\n")

    assert summary.outcomes[ALREADY] == 1
    assert len(await _records(db_async)) == 1


async def test_a_scan_past_fifteen_minutes_after_an_arrival_is_a_departure(
    db_async: AsyncSession,
) -> None:
    manager = await _manager(db_async)
    employee = await _staff(db_async)
    await _publish(db_async, manager, [(employee, "TDM", DAY)])
    await _map(db_async, manager, "7", employee)
    token = await _site(db_async, manager)
    await _phone_arrival(
        db_async, manager, employee, token, datetime(2026, 7, 6, 9, 30, 0)
    )

    summary = await _import(db_async, manager, "7 2026-07-06 05:45:01\n")

    assert summary.outcomes[RECORDED] == 1
    [record] = await _records(db_async)
    assert record.departed_at == datetime(2026, 7, 6, 9, 45, 1)


async def test_non_app_exception_leaves_row_pending_and_reprocess_recovers(
    db_async: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    manager = await _manager(db_async)
    employee = await _staff(db_async)
    await _publish(db_async, manager, [(employee, "TDM", DAY)])
    await _map(db_async, manager, "7", employee)
    real = terminal_service.save_attendance

    async def broken(**_: object) -> None:
        raise RuntimeError("connection dropped")

    monkeypatch.setattr(terminal_service, "save_attendance", broken)
    with pytest.raises(RuntimeError):
        await _import(db_async, manager, "7 2026-07-06 05:31:00\n")
    [stuck] = await _punches(db_async)
    assert stuck.outcome == TerminalPunchOutcome.PENDING.value
    assert await _records(db_async) == []

    monkeypatch.setattr(terminal_service, "save_attendance", real)
    summary = await terminal_service.reprocess(
        session=db_async, current_user=manager, department_id=DEPT
    )

    assert summary.outcomes[RECORDED] == 1


# --- ordering and shift matching --------------------------------------------


async def test_roster_published_late_then_reprocess_records_the_punch(
    db_async: AsyncSession,
) -> None:
    manager = await _manager(db_async)
    employee = await _staff(db_async)
    await _map(db_async, manager, "7", employee)
    first = await _import(db_async, manager, "7 2026-07-06 05:31:00\n")
    assert first.outcomes[NO_SHIFT] == 1

    await _publish(db_async, manager, [(employee, "TDM", DAY)])
    summary = await terminal_service.reprocess(
        session=db_async, current_user=manager, department_id=DEPT
    )

    assert summary.outcomes[RECORDED] == 1
    [record] = await _records(db_async)
    assert record.arrived_at == datetime(2026, 7, 6, 9, 31, 0)


async def test_older_file_imported_after_newer_keeps_hours_correct(
    db_async: AsyncSession,
) -> None:
    manager = await _manager(db_async)
    employee = await _staff(db_async)
    await _publish(db_async, manager, [(employee, "TDM", DAY)])
    await _map(db_async, manager, "7", employee)

    newer = await _import(db_async, manager, "7 2026-07-06 14:02:00\n")
    # Nearer the end of the shift than its start: never taken as an arrival.
    assert newer.outcomes[NO_SHIFT] == 1
    assert await _records(db_async) == []

    await _import(db_async, manager, "7 2026-07-06 05:31:02\n")
    await terminal_service.reprocess(
        session=db_async, current_user=manager, department_id=DEPT
    )

    [record] = await _records(db_async)
    assert record.arrived_at == datetime(2026, 7, 6, 9, 31, 2)
    assert record.departed_at == datetime(2026, 7, 6, 18, 2, 0)


async def test_missed_departure_leaves_the_open_record_and_opens_the_next_shift(
    db_async: AsyncSession,
) -> None:
    manager = await _manager(db_async)
    employee = await _staff(db_async)
    await _catalog(db_async, "TEV", "08:00", "16:00", False)
    await _publish(
        db_async,
        manager,
        [(employee, "TEV", DAY), (employee, "TEV", date(2026, 7, 7))],
    )
    await _map(db_async, manager, "7", employee)
    await _import(db_async, manager, "7 2026-07-06 08:01:00\n")

    summary = await _import(db_async, manager, "7 2026-07-07 07:55:00\n")

    assert summary.outcomes[RECORDED] == 1
    records = sorted(await _records(db_async), key=lambda r: r.arrived_at)
    assert len(records) == 2
    assert records[0].departed_at is None
    assert records[1].arrived_at == datetime(2026, 7, 7, 11, 55, 0)


async def _handover_world(db: AsyncSession):
    manager = await _manager(db)
    employee = await _staff(db)
    await _catalog(db, "TNX", "22:00", "16:00", True)
    await _catalog(db, "TBK", "16:00", "22:00", False)
    await _publish(
        db,
        manager,
        [(employee, "TNX", date(2026, 7, 5)), (employee, "TBK", DAY)],
    )
    await _map(db, manager, "7", employee)
    return manager, employee


async def test_handover_scan_is_the_next_arrival_when_the_earlier_shift_is_open(
    db_async: AsyncSession,
) -> None:
    manager, _ = await _handover_world(db_async)
    await _import(db_async, manager, "7 2026-07-05 21:55:00\n")

    summary = await _import(db_async, manager, "7 2026-07-06 16:03:00\n")

    assert summary.outcomes[RECORDED] == 1
    assert summary.outcomes[ALREADY] == 0
    records = sorted(await _records(db_async), key=lambda r: r.arrived_at)
    assert len(records) == 2
    assert records[0].departed_at is None
    assert records[1].arrived_at == datetime(2026, 7, 6, 20, 3, 0)


async def test_handover_scan_after_a_recorded_departure_is_not_swallowed(
    db_async: AsyncSession,
) -> None:
    manager, _ = await _handover_world(db_async)
    await _import(db_async, manager, "7 2026-07-05 21:55:00\n")
    # 15:55, not 15:58: a scan 5 minutes after the last accepted one is a REPEAT.
    departure = await _import(db_async, manager, "7 2026-07-06 15:55:00\n")
    assert departure.outcomes[RECORDED] == 1

    summary = await _import(db_async, manager, "7 2026-07-06 16:03:00\n")

    assert summary.outcomes[ALREADY] == 0
    assert summary.outcomes[RECORDED] == 1
    assert len(await _records(db_async)) == 2


async def test_a_stray_no_shift_scan_does_not_hold_the_next_arrival(
    db_async: AsyncSession,
) -> None:
    """A scan with no shift is a final answer for HR, not an undecided punch:
    an evening scan on a day off must not hold the next morning's arrival."""
    manager = await _manager(db_async)
    employee = await _staff(db_async)
    await _publish(db_async, manager, [(employee, "TDM", DAY)])
    await _map(db_async, manager, "7", employee)

    await _import(db_async, manager, "7 2026-07-05 18:00:00\n7 2026-07-06 05:31:00\n")

    by_time = {p.punched_at: p for p in await _punches(db_async)}
    assert by_time[datetime(2026, 7, 5, 22, 0, 0)].outcome == NO_SHIFT.value
    assert by_time[datetime(2026, 7, 6, 9, 31, 0)].outcome == RECORDED.value
    assert len(await _records(db_async)) == 1


async def test_an_unmapped_earlier_punch_holds_a_later_arrival_until_reprocess(
    db_async: AsyncSession,
) -> None:
    """An unmapped scan is undecided: a later arrival waits, and reprocess after
    the mapping decides both in time order."""
    manager = await _manager(db_async)
    employee = await _staff(db_async)
    await _publish(db_async, manager, [(employee, "TDM", DAY)])

    await _import(db_async, manager, "7 2026-07-06 05:31:00\n")
    await _map(db_async, manager, "7", employee)
    await _import(db_async, manager, "7 2026-07-06 13:40:00\n")

    by_time = {p.punched_at: p for p in await _punches(db_async)}
    assert by_time[datetime(2026, 7, 6, 9, 31, 0)].outcome == UNMAPPED.value
    held = by_time[datetime(2026, 7, 6, 17, 40, 0)]
    assert held.outcome == NO_SHIFT.value
    assert held.detail == "an earlier punch is not decided yet"
    assert await _records(db_async) == []

    await terminal_service.reprocess(
        session=db_async, current_user=manager, department_id=DEPT
    )

    outcomes = sorted(p.outcome for p in await _punches(db_async))
    assert outcomes == [RECORDED.value, RECORDED.value]
    assert len(await _records(db_async)) == 1


# --- mapping and removal -----------------------------------------------------


async def test_mapping_refused_when_the_employment_has_ended(
    db_async: AsyncSession,
) -> None:
    manager = await _manager(db_async)
    employee = await _staff(db_async)
    record = await db_async.scalar(
        select(EmploymentRecord).where(EmploymentRecord.user_id == employee.id)
    )
    record.end_date = date(2026, 6, 30)
    await db_async.commit()

    with pytest.raises(AppException) as ended:
        await _map_direct(db_async, manager, employee)
    assert ended.value.status_code == 400


async def _map_direct(db, manager, employee):
    await terminal_service.add_mapping(
        session=db,
        current_user=manager,
        department_id=DEPT,
        device_user_id="7",
        user_id=employee.id,
    )


async def test_remove_mapping_out_of_scope_looks_like_a_missing_one(
    db_async: AsyncSession,
) -> None:
    manager = await _manager(db_async)
    employee = await _staff(db_async)
    await _map(db_async, manager, "7", employee)
    mapping = await db_async.scalar(select(TerminalUser))
    other_scope = await _scoped_manager(db_async, dept=OTHER)

    with pytest.raises(AppException) as hidden:
        await terminal_service.remove_mapping(
            session=db_async, current_user=other_scope, terminal_user_id=mapping.id
        )
    assert hidden.value.status_code == 404
    assert len(list((await db_async.scalars(select(TerminalUser))).all())) == 1


# --- size limits ----------------------------------------------------------------


async def test_reprocess_is_capped_at_one_thousand_rows_per_call(
    db_async: AsyncSession,
) -> None:
    import uuid

    manager = await _manager(db_async)
    base = datetime(2026, 7, 6, 5, 0, 0)
    import_id = uuid.uuid4()
    db_async.add_all(
        [
            TerminalPunch(
                id=uuid.uuid4(),
                department_id=DEPT,
                terminal="main gate",
                device_user_id=f"u{i}",
                punched_at=base.replace(second=0) + (time_delta(i)),
                outcome=TerminalPunchOutcome.UNMAPPED.value,
                import_id=import_id,
            )
            for i in range(1001)
        ]
    )
    await db_async.commit()

    summary = await terminal_service.reprocess(
        session=db_async, current_user=manager, department_id=DEPT
    )

    assert summary.processed == 1000
    assert summary.remaining == 1


def time_delta(i: int):
    from datetime import timedelta

    return timedelta(minutes=i)


async def test_import_refuses_more_than_one_thousand_lines(
    db_async: AsyncSession,
) -> None:
    manager = await _manager(db_async)

    with pytest.raises(AppException) as too_many:
        await _import(db_async, manager, "7 2026-07-06 05:31:00\n" * 1001)

    assert too_many.value.status_code == 400
    assert await _punches(db_async) == []
