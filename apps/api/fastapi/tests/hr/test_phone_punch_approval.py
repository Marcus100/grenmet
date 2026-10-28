"""Phone punches are pending until a supervisor approves them (ADR-0040)."""

from collections.abc import Awaitable, Callable
from datetime import UTC, datetime, timedelta

import httpx
import pytest
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.models import RoleAssignmentScope, User, UserRoleAssignment
from src.auth.utils import create_access_token
from src.exceptions import AppException, AuthorizationError
from src.hr.attendance import clock_service, punch_service
from src.hr.attendance import service as attendance_service
from src.hr.attendance.models import AttendanceRecord, ClockPunch
from src.hr.attendance.schemas import AttendanceSave
from src.hr.models import (
    Department,
    EmploymentRecord,
    EmploymentStatus,
    Organisation,
)
from src.hr.roster.models import (
    RosterAssignment,
    RosterPeriod,
    ShiftCatalog,
    ShiftCategory,
)
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
from src.utils.datetime import utc_now
from tests.factories import (
    assign_role,
    make_employee,
    make_role_with_permission,
    make_user,
)
from tests.hr.test_clock_in import DEPT, OTHER, SHIFT_DAY, utc

API = "/api/v1/hr/attendance"


async def _staff(db: AsyncSession, department: str = DEPT) -> User:
    """A non-superuser employee who can clock in."""
    user = await make_user(db)
    role, _ = await make_role_with_permission(db, "timesheet.submit.self")
    await make_employee(db, user=user, department_id=department)
    await assign_role(db, user=user, role=role, scope=RoleAssignmentScope.SELF)
    return user


async def _supervisor(
    db: AsyncSession, *, department: str | None, permission: bool = True
) -> User:
    user = await make_user(db)
    await make_employee(db, user=user, department_id=department or DEPT)
    if permission:
        role, _ = await make_role_with_permission(db, "timesheet.approve")
        await assign_role(
            db,
            user=user,
            role=role,
            scope=RoleAssignmentScope.DEPARTMENT,
            department_id=department,
        )
    return user


async def _world(db: AsyncSession) -> tuple[User, User, str]:
    """Employee on a published roster plus a clock-site token; returns the
    employee, a roster manager, and the token."""
    for dept in (DEPT, OTHER):
        if not await db.get(Department, dept):
            db.add(Department(organisation_id="gaa", code=dept, id=dept, name=dept))
    if not await db.get(ShiftCatalog, "CKM"):
        db.add(
            ShiftCatalog(
                code="CKM",
                label="Clock morning",
                category=ShiftCategory.WORK,
                start_time="05:30",
                end_time="14:00",
                ends_next_day=False,
            )
        )
    await db.commit()
    manager = await make_user(db, superuser=True)
    await make_employee(db, user=manager, department_id=DEPT)
    employee = await _staff(db)
    period = await create_roster_period(
        session=db,
        current_user=manager,
        period_in=RosterPeriodCreate(
            department_id=DEPT,
            period_start=datetime(2026, 7, 1).date(),
            period_end=datetime(2026, 7, 31).date(),
        ),
    )
    await bulk_upsert_roster_assignments(
        session=db,
        current_user=manager,
        payload=RosterAssignmentBulkCreate(
            roster_period_id=period.id,
            assignments=[
                RosterAssignmentInput(
                    user_id=employee.id, assignment_date=SHIFT_DAY, shift_code="CKM"
                )
            ],
        ),
    )
    await publish_roster_period(session=db, current_user=manager, period_id=period.id)
    _, token = await clock_service.create_site(
        session=db, current_user=manager, department_id=DEPT, name="Main gate"
    )
    return employee, manager, token


async def _punch(
    db: AsyncSession, employee: User, token: str, hour: int, minute: int = 0
) -> ClockPunch:
    _, punch, *_ = await clock_service.clock(
        session=db, current_user=employee, token=token, now=utc(hour, minute)
    )
    return punch


async def _records(db: AsyncSession) -> list[AttendanceRecord]:
    return list((await db.scalars(select(AttendanceRecord))).all())


async def test_approval_turns_punches_into_attendance_hours(
    db_async: AsyncSession,
) -> None:
    employee, _, token = await _world(db_async)
    supervisor = await _supervisor(db_async, department=DEPT)
    arrive = await _punch(db_async, employee, token, 9, 30)
    depart = await _punch(db_async, employee, token, 18, 0)
    assert await _records(db_async) == []

    await punch_service.approve_punch(
        session=db_async, current_user=supervisor, punch_id=arrive.id
    )
    [record] = await _records(db_async)
    assert record.departed_at is None

    approved = await punch_service.approve_punch(
        session=db_async, current_user=supervisor, punch_id=depart.id, note="ok"
    )
    assert approved.status == "APPROVED"
    assert approved.reviewed_by_user_id == supervisor.id
    [record] = await _records(db_async)
    assert record.departed_at == utc(18, 0)
    assert str(attendance_service.actual_hours(record)) == "8.50"

    _, _, rows = await attendance_service.week_rows(
        session=db_async, current_user=employee, day=SHIFT_DAY
    )
    assert [row[4].id for row in rows if row[4]] == [record.id]


async def test_approval_is_idempotent(db_async: AsyncSession) -> None:
    employee, _, token = await _world(db_async)
    supervisor = await _supervisor(db_async, department=DEPT)
    arrive = await _punch(db_async, employee, token, 9, 30)
    for _ in range(2):
        await punch_service.approve_punch(
            session=db_async, current_user=supervisor, punch_id=arrive.id
        )
    assert len(await _records(db_async)) == 1


async def test_rejected_punches_never_reach_attendance(
    db_async: AsyncSession,
) -> None:
    employee, _, token = await _world(db_async)
    supervisor = await _supervisor(db_async, department=DEPT)
    arrive = await _punch(db_async, employee, token, 9, 30)
    depart = await _punch(db_async, employee, token, 18, 0)

    rejected = await punch_service.reject_punch(
        session=db_async,
        current_user=supervisor,
        punch_id=arrive.id,
        reason="Not on site",
    )
    assert rejected.status == "REJECTED"
    # The departure cannot outlive its rejected arrival.
    await db_async.refresh(depart)
    assert depart.status == "REJECTED"
    assert await _records(db_async) == []
    _, _, rows = await attendance_service.week_rows(
        session=db_async, current_user=employee, day=SHIFT_DAY
    )
    assert all(row[4] is None for row in rows)
    with pytest.raises(AppException) as raised:
        await punch_service.approve_punch(
            session=db_async, current_user=supervisor, punch_id=arrive.id
        )
    assert raised.value.status_code == 409
    # A rejected arrival frees the shift: the employee can punch again.
    again = await _punch(db_async, employee, token, 9, 45)
    assert (again.kind, again.status) == ("ARRIVE", "PENDING")


async def test_departure_needs_its_arrival_approved_first(
    db_async: AsyncSession,
) -> None:
    employee, _, token = await _world(db_async)
    supervisor = await _supervisor(db_async, department=DEPT)
    await _punch(db_async, employee, token, 9, 30)
    depart = await _punch(db_async, employee, token, 18, 0)
    with pytest.raises(AppException) as raised:
        await punch_service.approve_punch(
            session=db_async, current_user=supervisor, punch_id=depart.id
        )
    assert raised.value.status_code == 409
    await db_async.refresh(depart)
    assert depart.status == "PENDING"


async def test_nobody_approves_their_own_punch(db_async: AsyncSession) -> None:
    employee, _, token = await _world(db_async)
    role, _ = await make_role_with_permission(db_async, "timesheet.approve")
    await assign_role(
        db_async,
        user=employee,
        role=role,
        scope=RoleAssignmentScope.DEPARTMENT,
        department_id=DEPT,
    )
    arrive = await _punch(db_async, employee, token, 9, 30)
    with pytest.raises(AppException) as raised:
        await punch_service.approve_punch(
            session=db_async, current_user=employee, punch_id=arrive.id
        )
    assert raised.value.status_code == 403
    with pytest.raises(AppException):
        await punch_service.reject_punch(
            session=db_async, current_user=employee, punch_id=arrive.id, reason="x"
        )
    assert await _records(db_async) == []


async def test_a_superuser_cannot_approve_their_own_punch(
    db_async: AsyncSession,
) -> None:
    _, manager, token = await _world(db_async)
    # The manager is also an employee clocking in on their own roster.
    manager_punch = await _punch_for_manager(db_async, manager, token)
    with pytest.raises(AppException) as raised:
        await punch_service.approve_punch(
            session=db_async, current_user=manager, punch_id=manager_punch.id
        )
    assert raised.value.status_code == 403


async def _punch_for_manager(db: AsyncSession, manager: User, token: str) -> ClockPunch:
    period_id = await db.scalar(
        select(AttendanceRecord.id).limit(0)
    )  # keep the import used; no records exist
    assert period_id is None
    from src.hr.roster.models import RosterAssignment, RosterPeriod

    period = (await db.scalars(select(RosterPeriod))).first()
    assert period is not None
    await bulk_upsert_roster_assignments(
        session=db,
        current_user=manager,
        payload=RosterAssignmentBulkCreate(
            roster_period_id=period.id,
            assignments=[
                RosterAssignmentInput(
                    user_id=manager.id, assignment_date=SHIFT_DAY, shift_code="CKM"
                )
            ],
        ),
    )
    assert (await db.scalars(select(RosterAssignment))).first() is not None
    return await _punch(db, manager, token, 9, 30)


async def test_only_authorised_reviewers_may_decide(db_async: AsyncSession) -> None:
    employee, _, token = await _world(db_async)
    arrive = await _punch(db_async, employee, token, 9, 30)

    stranger = await make_user(db_async)
    with pytest.raises(AuthorizationError):  # no timesheet.approve at all
        await punch_service.approve_punch(
            session=db_async, current_user=stranger, punch_id=arrive.id
        )
    elsewhere = await _supervisor(db_async, department=OTHER)
    with pytest.raises(AppException) as raised:  # approver of another department
        await punch_service.approve_punch(
            session=db_async, current_user=elsewhere, punch_id=arrive.id
        )
    assert raised.value.status_code == 403
    assert await _records(db_async) == []


async def test_named_supervisor_can_approve_without_department_scope(
    db_async: AsyncSession,
) -> None:
    employee, _, token = await _world(db_async)
    # Holds timesheet.approve only for another department, but is named supervisor.
    named = await _supervisor(db_async, department=OTHER)
    record = await db_async.scalar(
        select(
            __import__("src.hr.models", fromlist=["EmploymentRecord"]).EmploymentRecord
        ).where(
            __import__(
                "src.hr.models", fromlist=["EmploymentRecord"]
            ).EmploymentRecord.user_id
            == employee.id
        )
    )
    assert record is not None
    record.supervisor_id = named.id
    await db_async.commit()
    arrive = await _punch(db_async, employee, token, 9, 30)
    approved = await punch_service.approve_punch(
        session=db_async, current_user=named, punch_id=arrive.id
    )
    assert approved.status == "APPROVED"
    assert len(await _records(db_async)) == 1


async def test_terminal_style_attendance_counts_immediately(
    db_async: AsyncSession,
) -> None:
    """Attendance written straight to the record (the terminal path) needs no
    approval step and no punch; phone-punch rules do not touch it."""
    employee, manager, _ = await _world(db_async)
    from src.hr.roster.models import RosterAssignment

    assignment = (await db_async.scalars(select(RosterAssignment))).first()
    assert assignment is not None
    record = await attendance_service.save_attendance(
        session=db_async,
        current_user=manager,
        payload=AttendanceSave(
            roster_assignment_id=assignment.id,
            expected_revision=0,
            arrived_at=utc(9, 30).replace(tzinfo=__import__("datetime").UTC),
            departed_at=utc(17, 30).replace(tzinfo=__import__("datetime").UTC),
        ),
    )
    assert str(attendance_service.actual_hours(record)) == "8.00"
    assert (await db_async.scalars(select(ClockPunch))).first() is None


async def test_pending_list_scopes_to_reviewer_and_excludes_own(
    db_async: AsyncSession,
) -> None:
    employee, _, token = await _world(db_async)
    await _punch(db_async, employee, token, 9, 30)
    mine = await _supervisor(db_async, department=DEPT)
    elsewhere = await _supervisor(db_async, department=OTHER)
    stranger = await make_user(db_async)

    rows, total = await punch_service.list_pending(
        session=db_async, current_user=mine, limit=50, offset=0
    )
    assert total == 1
    assert rows[0][1] == "Test User"
    assert rows[0][3] == SHIFT_DAY
    assert rows[0][4] == "CKM"
    assert (
        await punch_service.list_pending(
            session=db_async, current_user=elsewhere, limit=50, offset=0
        )
    )[1] == 0
    with pytest.raises(AuthorizationError):
        await punch_service.list_pending(
            session=db_async, current_user=stranger, limit=50, offset=0
        )
    # Approved punches leave the queue.
    await punch_service.approve_punch(
        session=db_async,
        current_user=mine,
        punch_id=rows[0][0].id,
    )
    assert (
        await punch_service.list_pending(
            session=db_async, current_user=mine, limit=50, offset=0
        )
    )[1] == 0


async def test_review_endpoints_over_http(
    db_async: AsyncSession,
    async_client: httpx.AsyncClient,
    superuser_token_headers_async: dict[str, str],
    normal_user_token_headers_async: dict[str, str],
) -> None:
    employee, _, token = await _world(db_async)
    arrive = await _punch(db_async, employee, token, 9, 30)
    depart = await _punch(db_async, employee, token, 18, 0)

    pending = await async_client.get(
        f"{API}/clock-punches/pending", headers=superuser_token_headers_async
    )
    assert pending.status_code == 200
    assert pending.json()["count"] == 2
    denied = await async_client.get(
        f"{API}/clock-punches/pending", headers=normal_user_token_headers_async
    )
    assert denied.status_code == 403

    approved = await async_client.post(
        f"{API}/clock-punches/{arrive.id}/approve",
        headers=superuser_token_headers_async,
    )
    assert approved.status_code == 200
    assert approved.json()["status"] == "APPROVED"
    rejected = await async_client.post(
        f"{API}/clock-punches/{depart.id}/reject",
        headers=superuser_token_headers_async,
        json={"reason": "Left early"},
    )
    assert rejected.status_code == 200
    assert rejected.json()["status"] == "REJECTED"
    blank = await async_client.post(
        f"{API}/clock-punches/{depart.id}/reject",
        headers=superuser_token_headers_async,
        json={"reason": ""},
    )
    assert blank.status_code == 422
    [record] = await _records(db_async)
    assert record.departed_at is None


async def test_self_scoped_approver_sees_an_empty_queue(
    db_async: AsyncSession,
) -> None:
    employee, _, token = await _world(db_async)
    await _punch(db_async, employee, token, 9, 30)
    peer = await make_user(db_async)
    await make_employee(db_async, user=peer, department_id=DEPT)
    role, _ = await make_role_with_permission(db_async, "timesheet.approve")
    await assign_role(db_async, user=peer, role=role, scope=RoleAssignmentScope.SELF)
    _, total = await punch_service.list_pending(
        session=db_async, current_user=peer, limit=50, offset=0
    )
    assert total == 0


async def test_departure_does_not_overwrite_an_existing_departure(
    db_async: AsyncSession,
) -> None:
    employee, manager, token = await _world(db_async)
    supervisor = await _supervisor(db_async, department=DEPT)
    arrive = await _punch(db_async, employee, token, 9, 30)
    depart = await _punch(db_async, employee, token, 18, 0)
    await punch_service.approve_punch(
        session=db_async, current_user=supervisor, punch_id=arrive.id
    )
    [record] = await _records(db_async)
    await attendance_service.save_attendance(
        session=db_async,
        current_user=manager,
        payload=AttendanceSave(
            roster_assignment_id=record.roster_assignment_id,
            expected_revision=record.revision,
            arrived_at=utc(9, 30).replace(tzinfo=UTC),
            departed_at=utc(17, 0).replace(tzinfo=UTC),
        ),
    )
    with pytest.raises(AppException) as raised:
        await punch_service.approve_punch(
            session=db_async, current_user=supervisor, punch_id=depart.id
        )
    assert raised.value.status_code == 409
    await db_async.refresh(depart)
    assert depart.status == "PENDING"


async def test_unique_index_refuses_a_second_live_punch_of_one_kind(
    db_async: AsyncSession,
) -> None:
    employee, _, token = await _world(db_async)
    first = await _punch(db_async, employee, token, 9, 30)
    second = await _punch(db_async, employee, token, 10, 30)
    assert (first.kind, second.kind) == ("ARRIVE", "DEPART")
    db_async.add(
        ClockPunch(
            user_id=employee.id,
            department_id=DEPT,
            clock_site_id=first.clock_site_id,
            roster_assignment_id=first.roster_assignment_id,
            kind="ARRIVE",
            punched_at=utc(9, 45),
            status="PENDING",
        )
    )
    with pytest.raises(IntegrityError):
        await db_async.commit()
    await db_async.rollback()


async def _none(*_args: object, **_kwargs: object) -> None:
    return None


async def test_clock_returns_the_existing_punch_when_a_racing_scan_wins(
    db_async: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    employee, _, token = await _world(db_async)
    winner = await _punch(db_async, employee, token, 9, 30)
    # Blind the pre-checks so this scan tries to insert a duplicate arrival.
    monkeypatch.setattr(clock_service, "_latest_live_punch", _none)
    monkeypatch.setattr(clock_service, "_open_arrival", _none)
    monkeypatch.setattr(
        clock_service,
        "_current_assignment",
        _current_for(winner.roster_assignment_id),
    )
    action, punch, *_ = await clock_service.clock(
        session=db_async, current_user=employee, token=token, now=utc(9, 45)
    )
    assert punch.id == winner.id
    assert action == "ARRIVED"


def _current_for(
    assignment_id: object,
) -> Callable[..., Awaitable[tuple[RosterAssignment, ShiftCatalog]]]:
    async def found(
        session: AsyncSession, _user_id: object, _now: object, _department_id: object
    ) -> tuple[RosterAssignment, ShiftCatalog]:
        row = (
            await session.execute(
                select(RosterAssignment, ShiftCatalog)
                .join(ShiftCatalog, ShiftCatalog.code == RosterAssignment.shift_code)
                .where(RosterAssignment.id == assignment_id)
            )
        ).one()
        return row[0], row[1]

    return found


async def test_http_authority_for_approve_and_reject(
    db_async: AsyncSession,
    async_client: httpx.AsyncClient,
    normal_user_token_headers_async: dict[str, str],
) -> None:
    employee, _, token = await _world(db_async)
    arrive = await _punch(db_async, employee, token, 9, 30)
    for action, body in (("approve", None), ("reject", {"reason": "no"})):
        resp = await async_client.post(
            f"{API}/clock-punches/{arrive.id}/{action}",
            headers=normal_user_token_headers_async,
            json=body,
        )
        assert resp.status_code in {403, 404}

    elsewhere = await _supervisor(db_async, department=OTHER)
    headers = {
        "Authorization": "Bearer "
        + create_access_token(elsewhere.id, expires_delta=timedelta(minutes=5))
    }
    resp = await async_client.post(
        f"{API}/clock-punches/{arrive.id}/reject",
        headers=headers,
        json={"reason": "nope"},
    )
    assert resp.status_code == 403


async def test_all_scope_in_another_organisation_is_refused(
    db_async: AsyncSession,
) -> None:
    employee, _, token = await _world(db_async)
    arrive = await _punch(db_async, employee, token, 9, 30)
    if not await db_async.get(Organisation, "other_org"):
        db_async.add(Organisation(id="other_org", code="other_org", name="Other"))
        await db_async.commit()
    outsider = await make_user(db_async)
    role, _ = await make_role_with_permission(db_async, "timesheet.approve")
    await assign_role(
        db_async,
        user=outsider,
        role=role,
        scope=RoleAssignmentScope.ALL,
        organisation_id="other_org",
    )
    with pytest.raises(AppException) as raised:
        await punch_service.approve_punch(
            session=db_async, current_user=outsider, punch_id=arrive.id
        )
    assert raised.value.status_code == 403


async def test_unrelated_notes_do_not_justify_overwriting_a_departure(
    db_async: AsyncSession,
) -> None:
    employee, manager, token = await _world(db_async)
    supervisor = await _supervisor(db_async, department=DEPT)
    arrive = await _punch(db_async, employee, token, 9, 30)
    depart = await _punch(db_async, employee, token, 18, 0)
    await punch_service.approve_punch(
        session=db_async, current_user=supervisor, punch_id=arrive.id
    )
    [record] = await _records(db_async)
    await attendance_service.save_attendance(
        session=db_async,
        current_user=manager,
        payload=AttendanceSave(
            roster_assignment_id=record.roster_assignment_id,
            expected_revision=record.revision,
            arrived_at=utc(9, 30).replace(tzinfo=UTC),
            departed_at=utc(17, 0).replace(tzinfo=UTC),
            notes="Covered the gate",
        ),
    )
    with pytest.raises(AppException) as raised:
        await punch_service.approve_punch(
            session=db_async, current_user=supervisor, punch_id=depart.id
        )
    assert raised.value.status_code == 409
    [after] = await _records(db_async)
    assert after.departed_at == utc(17, 0)


async def test_all_scope_approver_from_another_organisation_sees_nothing(
    db_async: AsyncSession,
) -> None:
    employee, _, token = await _world(db_async)
    await _punch(db_async, employee, token, 9, 30)
    if not await db_async.get(Organisation, "other_org"):
        db_async.add(Organisation(id="other_org", code="other_org", name="Other"))
        await db_async.commit()
    outsider = await make_user(db_async)
    role, _ = await make_role_with_permission(db_async, "timesheet.approve")
    await assign_role(
        db_async,
        user=outsider,
        role=role,
        scope=RoleAssignmentScope.ALL,
        organisation_id="other_org",
    )
    _, total = await punch_service.list_pending(
        session=db_async, current_user=outsider, limit=50, offset=0
    )
    assert total == 0


async def _transfer(db: AsyncSession, employee: User, department: str) -> None:
    record = await db.scalar(
        select(EmploymentRecord).where(EmploymentRecord.user_id == employee.id)
    )
    assert record is not None
    record.department_id = department
    await db.commit()


async def _pending_ids(db: AsyncSession, user: User) -> list[object]:
    rows, _ = await punch_service.list_pending(
        session=db, current_user=user, limit=50, offset=0
    )
    return [row[0].id for row in rows]


async def test_after_a_transfer_old_and_new_manager_both_see_and_decide(
    db_async: AsyncSession,
) -> None:
    employee, _, token = await _world(db_async)
    old_manager = await _supervisor(db_async, department=DEPT)
    new_manager = await _supervisor(db_async, department=OTHER)
    arrive = await _punch(db_async, employee, token, 9, 30)
    depart = await _punch(db_async, employee, token, 18, 0)
    await _transfer(db_async, employee, OTHER)

    for manager in (old_manager, new_manager):
        assert set(await _pending_ids(db_async, manager)) == {arrive.id, depart.id}

    # Authority for approval is the same rule (the roster-department check in
    # save_attendance is a separate, later step), and either may reject.
    for manager in (old_manager, new_manager):
        await punch_service._require_reviewer(db_async, manager, arrive)
    rejected = await punch_service.reject_punch(
        session=db_async, current_user=new_manager, punch_id=depart.id, reason="no"
    )
    assert rejected.status == "REJECTED"
    assert await _pending_ids(db_async, old_manager) == [arrive.id]


async def test_named_supervisor_and_unrelated_manager_after_transfer(
    db_async: AsyncSession,
) -> None:
    employee, _, token = await _world(db_async)
    third = "ZZZ"
    if not await db_async.get(Department, third):
        db_async.add(
            Department(organisation_id="gaa", code=third, id=third, name=third)
        )
        await db_async.commit()
    named = await _supervisor(db_async, department=third)
    unrelated = await _supervisor(db_async, department=third)
    record = await db_async.scalar(
        select(EmploymentRecord).where(EmploymentRecord.user_id == employee.id)
    )
    assert record is not None
    record.supervisor_id = named.id
    await db_async.commit()
    arrive = await _punch(db_async, employee, token, 9, 30)
    await _transfer(db_async, employee, OTHER)

    assert await _pending_ids(db_async, named) == [arrive.id]
    # A manager of neither the punch's nor the current department sees nothing.
    assert await _pending_ids(db_async, unrelated) == []
    with pytest.raises(AppException) as raised:
        await punch_service.approve_punch(
            session=db_async, current_user=unrelated, punch_id=arrive.id
        )
    assert raised.value.status_code == 403
    await punch_service._require_reviewer(db_async, named, arrive)


async def test_named_supervisor_whose_review_role_has_ended_is_refused(
    db_async: AsyncSession,
) -> None:
    employee, _, token = await _world(db_async)
    named = await _supervisor(db_async, department=OTHER)
    record = await db_async.scalar(
        select(EmploymentRecord).where(EmploymentRecord.user_id == employee.id)
    )
    assert record is not None
    record.supervisor_id = named.id
    arrive = await _punch(db_async, employee, token, 9, 30)
    assert await _pending_ids(db_async, named) == [arrive.id]
    # The role assignment lapsed: being named supervisor alone grants nothing.
    for assignment in (
        await db_async.scalars(
            select(UserRoleAssignment).where(UserRoleAssignment.user_id == named.id)
        )
    ).all():
        assignment.effective_to = utc_now() - timedelta(days=1)
    await db_async.commit()
    assert await _pending_ids(db_async, named) == []
    with pytest.raises(AppException) as raised:
        await punch_service.approve_punch(
            session=db_async, current_user=named, punch_id=arrive.id
        )
    assert raised.value.status_code == 403


@pytest.mark.parametrize("scope", [RoleAssignmentScope.ALL, RoleAssignmentScope.SELF])
async def test_named_supervisor_with_a_review_role_only_elsewhere_is_refused(
    db_async: AsyncSession, scope: RoleAssignmentScope
) -> None:
    """#677: a review role held in another organisation does not let a named
    supervisor decide punches in this one (for example after losing the role here)."""
    employee, _, token = await _world(db_async)
    if not await db_async.get(Organisation, "other_org"):
        db_async.add(Organisation(id="other_org", code="other_org", name="Other"))
        await db_async.commit()
    named = await make_user(db_async)
    await make_employee(db_async, user=named, department_id=DEPT)
    role, _ = await make_role_with_permission(db_async, "timesheet.approve")
    await assign_role(
        db_async, user=named, role=role, scope=scope, organisation_id="other_org"
    )
    record = await db_async.scalar(
        select(EmploymentRecord).where(EmploymentRecord.user_id == employee.id)
    )
    assert record is not None
    record.supervisor_id = named.id
    await db_async.commit()
    arrive = await _punch(db_async, employee, token, 9, 30)

    assert await _pending_ids(db_async, named) == []
    with pytest.raises(AppException) as raised:
        await punch_service.approve_punch(
            session=db_async, current_user=named, punch_id=arrive.id
        )
    assert raised.value.status_code == 403
    assert "Not allowed to review" in str(raised.value.message)
    with pytest.raises(AppException) as rejected:
        await punch_service.reject_punch(
            session=db_async,
            current_user=named,
            punch_id=arrive.id,
            reason="not mine to decide",
        )
    assert rejected.value.status_code == 403
    assert "Not allowed to review" in str(rejected.value.message)
    assert await _records(db_async) == []


async def test_all_scope_holder_in_the_organisation_decides_and_employee_cannot(
    db_async: AsyncSession,
) -> None:
    employee, _, token = await _world(db_async)
    hr = await make_user(db_async)
    role, _ = await make_role_with_permission(db_async, "timesheet.approve")
    await assign_role(db_async, user=hr, role=role, scope=RoleAssignmentScope.ALL)
    arrive = await _punch(db_async, employee, token, 9, 30)
    await _transfer(db_async, employee, OTHER)
    assert await _pending_ids(db_async, hr) == [arrive.id]
    # Even holding the permission at organisation scope, the employee is refused.
    await assign_role(
        db_async,
        user=employee,
        role=role,
        scope=RoleAssignmentScope.ALL,
    )
    assert await _pending_ids(db_async, employee) == []
    with pytest.raises(AppException) as raised:
        await punch_service.approve_punch(
            session=db_async, current_user=employee, punch_id=arrive.id
        )
    assert raised.value.status_code == 403
    await punch_service._require_reviewer(db_async, hr, arrive)


async def test_approval_after_a_transfer_writes_attendance_for_the_old_roster(
    db_async: AsyncSession,
) -> None:
    employee, _, token = await _world(db_async)
    old_manager = await _supervisor(db_async, department=DEPT)
    arrive = await _punch(db_async, employee, token, 9, 30)
    depart = await _punch(db_async, employee, token, 18, 0)
    await _transfer(db_async, employee, OTHER)

    await punch_service.approve_punch(
        session=db_async, current_user=old_manager, punch_id=arrive.id
    )
    await punch_service.approve_punch(
        session=db_async, current_user=old_manager, punch_id=depart.id
    )
    (record,) = await _records(db_async)
    assert record.department_id == DEPT
    assert record.arrived_at is not None
    assert record.departed_at is not None


async def test_other_departments_proxy_is_refused_on_an_old_department_shift(
    db_async: AsyncSession,
) -> None:
    employee, _, token = await _world(db_async)
    arrive = await _punch(db_async, employee, token, 9, 30)
    await _transfer(db_async, employee, OTHER)
    proxy = await make_user(db_async)
    role, _ = await make_role_with_permission(db_async, "timesheet.submit.proxy")
    await make_employee(db_async, user=proxy, department_id=OTHER)
    await assign_role(
        db_async,
        user=proxy,
        role=role,
        scope=RoleAssignmentScope.DEPARTMENT,
        department_id=OTHER,
    )
    with pytest.raises(AppException) as raised:
        await attendance_service.save_attendance(
            session=db_async,
            current_user=proxy,
            payload=AttendanceSave(
                roster_assignment_id=arrive.roster_assignment_id,
                expected_revision=0,
                arrived_at=arrive.punched_at.replace(tzinfo=UTC),
            ),
        )
    assert raised.value.status_code == 400


async def test_roster_department_in_another_organisation_is_still_refused(
    db_async: AsyncSession,
) -> None:
    employee, _, token = await _world(db_async)
    arrive = await _punch(db_async, employee, token, 9, 30)
    if not await db_async.get(Organisation, "other_org"):
        db_async.add(
            Organisation(id="other_org", code="other_org", name="Other organisation")
        )
        await db_async.flush()
    foreign = Department(
        organisation_id="other_org", code="FRN", id="dept_foreign", name="Foreign"
    )
    db_async.add(foreign)
    await db_async.commit()
    # Corrupt state a transfer guard should prevent: the roster's department
    # now belongs to a different organisation than the employee's employment.
    assignment = await db_async.get(RosterAssignment, arrive.roster_assignment_id)
    assert assignment is not None
    period = await db_async.get(RosterPeriod, assignment.roster_period_id)
    assert period is not None
    period.department_id = foreign.id
    await db_async.commit()
    with pytest.raises(AppException) as raised:
        await attendance_service.save_attendance(
            session=db_async,
            current_user=employee,
            payload=AttendanceSave(
                roster_assignment_id=arrive.roster_assignment_id,
                expected_revision=0,
                arrived_at=arrive.punched_at.replace(tzinfo=UTC),
            ),
        )
    assert raised.value.status_code == 400


@pytest.mark.parametrize(
    "ended", [EmploymentStatus.TERMINATED, EmploymentStatus.INACTIVE]
)
@pytest.mark.parametrize(
    "scope",
    [
        RoleAssignmentScope.SELF,
        RoleAssignmentScope.DEPARTMENT,
        RoleAssignmentScope.ALL,
    ],
)
async def test_former_supervisor_with_ended_employment_cannot_review(
    db_async: AsyncSession, scope: RoleAssignmentScope, ended: EmploymentStatus
) -> None:
    """#748: ending employment (profile update) revokes no role assignment and
    leaves reports' supervisor_id in place, so the live review role must not
    outlive the employment."""
    employee, _, token = await _world(db_async)
    named = await make_user(db_async)
    named_record = await make_employee(db_async, user=named, department_id=DEPT)
    role, _ = await make_role_with_permission(db_async, "timesheet.approve")
    await assign_role(
        db_async,
        user=named,
        role=role,
        scope=scope,
        department_id=DEPT if scope == RoleAssignmentScope.DEPARTMENT else None,
    )
    record = await db_async.scalar(
        select(EmploymentRecord).where(EmploymentRecord.user_id == employee.id)
    )
    assert record is not None
    record.supervisor_id = named.id
    await db_async.commit()
    arrive = await _punch(db_async, employee, token, 9, 30)
    depart = await _punch(db_async, employee, token, 18, 0)
    assert await _pending_ids(db_async, named) == [arrive.id, depart.id]

    named_record.status = ended
    await db_async.commit()

    assert await _pending_ids(db_async, named) == []
    with pytest.raises(AppException) as approved:
        await punch_service.approve_punch(
            session=db_async, current_user=named, punch_id=arrive.id
        )
    assert approved.value.status_code == 403
    with pytest.raises(AppException) as rejected:
        await punch_service.reject_punch(
            session=db_async,
            current_user=named,
            punch_id=arrive.id,
            reason="no longer mine",
        )
    assert rejected.value.status_code == 403
    assert await _records(db_async) == []


async def test_deactivated_account_with_review_role_loses_it(
    db_async: AsyncSession,
) -> None:
    employee, _, token = await _world(db_async)
    named = await _supervisor(db_async, department=DEPT)
    arrive = await _punch(db_async, employee, token, 9, 30)
    assert await _pending_ids(db_async, named) == [arrive.id]
    named.is_active = False
    await db_async.commit()
    assert await _pending_ids(db_async, named) == []


async def test_all_scope_reviewer_without_any_employment_record_still_reviews(
    db_async: AsyncSession,
) -> None:
    """Organisation administrators are modelled without an employment record;
    only an ended record withdraws a review role."""
    employee, _, token = await _world(db_async)
    admin = await make_user(db_async)
    role, _ = await make_role_with_permission(db_async, "timesheet.approve")
    await assign_role(db_async, user=admin, role=role, scope=RoleAssignmentScope.ALL)
    arrive = await _punch(db_async, employee, token, 9, 30)
    assert await _pending_ids(db_async, admin) == [arrive.id]
    approved = await punch_service.approve_punch(
        session=db_async, current_user=admin, punch_id=arrive.id
    )
    assert approved.status == "APPROVED"


async def test_superuser_with_ended_employment_still_reviews(
    db_async: AsyncSession,
) -> None:
    employee, _, token = await _world(db_async)
    root = await make_user(db_async, superuser=True)
    root_record = await make_employee(db_async, user=root, department_id=DEPT)
    root_record.status = EmploymentStatus.TERMINATED
    await db_async.commit()
    arrive = await _punch(db_async, employee, token, 9, 30)
    approved = await punch_service.approve_punch(
        session=db_async, current_user=root, punch_id=arrive.id
    )
    assert approved.status == "APPROVED"
