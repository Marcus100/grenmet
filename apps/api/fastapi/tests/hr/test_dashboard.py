from datetime import date, datetime
from decimal import Decimal
from zoneinfo import ZoneInfo

import pytest

from src.auth.models import User
from src.hr.dashboard.service import read_dashboard
from src.hr.leave.models import LeaveBalanceEvent, LeaveRequest, LeaveType
from src.hr.models import Department, EmploymentRecord, RequestStatus
from src.hr.roster.models import (
    RosterAssignment,
    RosterPeriod,
    RosterPeriodStatus,
    ShiftCatalog,
    ShiftCategory,
)


@pytest.mark.asyncio
async def test_dashboard_uses_ledger_and_own_requests_with_department_published_roster(
    db_async,
):
    people = [
        User(
            username=name,
            email=f"{name}@example.com",
            first_name=name,
            last_name="Tester",
            hashed_password="unused",
            roles=[],
        )
        for name in ("staff", "colleague", "outsider")
    ]
    for user in people:
        db_async.add(user)
    db_async.add_all(
        [
            Department(organisation_id="gaa", code="a", id="a", name="Department A"),
            Department(organisation_id="gaa", code="b", id="b", name="Department B"),
        ]
    )
    await db_async.flush()
    for index, user in enumerate(people):
        db_async.add(
            EmploymentRecord(
                organisation_id="gaa",
                user_id=user.id,
                department_id="a" if index < 2 else "b",
                employee_number=f"TEST-{index}",
            )
        )
    await db_async.commit()
    from tests.factories import assign_role, make_role_with_permission

    role, _ = await make_role_with_permission(db_async, "roster.view")
    await assign_role(db_async, user=people[0], role=role)
    empty = await read_dashboard(session=db_async, current_user=people[0])
    assert empty.vacation_balance is None
    assert empty.requests == [] and empty.on_duty == []
    assert empty.active_staff == 2 and empty.departments == 1
    assert not empty.can_approve and empty.approvals == []
    today = datetime.now(ZoneInfo("America/Grenada")).date()
    db_async.add(
        LeaveBalanceEvent(
            user_id=people[0].id,
            leave_type="VACATION",
            delta_days=Decimal("9.5"),
            balance_after_days=Decimal("9.5"),
            reason="Verified opening balance",
            created_by_user_id=people[0].id,
        )
    )
    for user in people[:2]:
        db_async.add(
            LeaveRequest(
                user_id=user.id,
                department_id="a",
                leave_type=LeaveType.VACATION,
                start_date=date(2026, 10, 1),
                end_date=date(2026, 10, 1),
                days_requested=1,
                status=RequestStatus.SUBMITTED,
            )
        )
    db_async.add(
        ShiftCatalog(code="TST", label="Test shift", category=ShiftCategory.WORK)
    )
    periods = [
        RosterPeriod(
            department_id=dept,
            period_start=today,
            period_end=today,
            status=status,
            created_by_user_id=people[0].id,
        )
        for dept, status in [
            ("a", RosterPeriodStatus.PUBLISHED),
            ("a", RosterPeriodStatus.DRAFT),
            ("b", RosterPeriodStatus.PUBLISHED),
        ]
    ]
    db_async.add_all(periods)
    await db_async.flush()
    for user, period in zip(people, periods, strict=True):
        db_async.add(
            RosterAssignment(
                roster_period_id=period.id,
                user_id=user.id,
                assignment_date=today,
                shift_code="TST",
            )
        )
    await db_async.commit()
    result = await read_dashboard(session=db_async, current_user=people[0])
    assert result.vacation_balance == Decimal("9.5")
    assert result.open_requests == 1 and len(result.requests) == 1
    assert [person.name for person in result.on_duty] == ["staff Tester"]
    assert result.scope == "Department A"

    periods[1].status = RosterPeriodStatus.PUBLISHED
    db_async.add(periods[1])
    await db_async.commit()
    assert (
        len((await read_dashboard(session=db_async, current_user=people[0])).on_duty)
        == 2
    )
    people[0].roles.clear()
    await db_async.commit()
    private = await read_dashboard(session=db_async, current_user=people[0])
    assert [person.name for person in private.on_duty] == ["staff Tester"]
    assert private.scope == "Your records" and private.active_staff == 1
