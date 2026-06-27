"""Leave service tests — permission requirements and state transitions."""

from decimal import Decimal

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from src.exceptions import AuthorizationError
from src.hr.leave.schemas import LeaveRequestAction, LeaveRequestCreate
from src.hr.leave.service import action_leave_request, create_leave_request
from src.hr.models import RequestStatus
from tests.factories import make_supervised_pair, make_user


async def test_create_leave_request_requires_permission(db_async: AsyncSession) -> None:
    """create_leave_request raises AuthorizationError when user lacks permission."""
    user = await make_user(db_async)

    with pytest.raises(AuthorizationError):
        await create_leave_request(
            session=db_async,
            current_user=user,
            payload=LeaveRequestCreate(
                department_id="dept_x",
                leave_type="VACATION",
                start_date="2026-07-01",
                end_date="2026-07-02",
                days_requested=Decimal("1.0"),
            ),
        )


async def test_create_leave_request_with_permission(db_async: AsyncSession) -> None:
    """create_leave_request succeeds when the user has the required permission."""
    from tests.factories import assign_role, make_department, make_role_with_permission

    user = await make_user(db_async)
    dept = await make_department(db_async, "dept_leave_create")
    role, _ = await make_role_with_permission(db_async, "leave.request.create.self")
    await assign_role(db_async, user=user, role=role)

    leave_request = await create_leave_request(
        session=db_async,
        current_user=user,
        payload=LeaveRequestCreate(
            department_id=dept.id,
            leave_type="VACATION",
            start_date="2026-07-01",
            end_date="2026-07-02",
            days_requested=Decimal("1.0"),
        ),
    )

    assert leave_request.user_id == user.id
    assert leave_request.status == RequestStatus.SUBMITTED


async def test_action_leave_request_requires_permission(db_async: AsyncSession) -> None:
    """action_leave_request raises AuthorizationError for a user without the action permission."""
    from tests.factories import assign_role, make_department, make_role_with_permission

    creator = await make_user(db_async)
    actor = await make_user(db_async)
    dept = await make_department(db_async, "dept_leave_action")

    creator_role, _ = await make_role_with_permission(
        db_async, "leave.request.create.self"
    )
    await assign_role(db_async, user=creator, role=creator_role)

    leave_request = await create_leave_request(
        session=db_async,
        current_user=creator,
        payload=LeaveRequestCreate(
            department_id=dept.id,
            leave_type="SICK",
            start_date="2026-08-01",
            end_date="2026-08-01",
            days_requested=Decimal("1.0"),
        ),
    )

    with pytest.raises(AuthorizationError):
        await action_leave_request(
            session=db_async,
            current_user=actor,
            leave_request_id=leave_request.id,
            payload=LeaveRequestAction(status=RequestStatus.APPROVED),
        )


async def test_action_leave_request_approved_writes_balance_event(
    db_async: AsyncSession,
) -> None:
    """Approving a leave request writes a balance event (factory-assisted version)."""
    from sqlmodel import select

    from src.hr.leave.models import LeaveBalanceEvent

    supervisor, employee, dept, _ = await make_supervised_pair(
        db_async,
        "leave.request.action",
        "leave.request.create.self",
    )

    # Give the employee the create permission via the role already attached by the factory
    # (the factory attaches the permission to the supervisor's role; employee needs their own)
    from tests.factories import assign_role, make_role_with_permission

    emp_role, _ = await make_role_with_permission(db_async, "leave.request.create.self")
    await assign_role(db_async, user=employee, role=emp_role)

    leave_request = await create_leave_request(
        session=db_async,
        current_user=employee,
        payload=LeaveRequestCreate(
            department_id=dept.id,
            leave_type="VACATION",
            start_date="2026-09-01",
            end_date="2026-09-03",
            days_requested=Decimal("3.0"),
        ),
    )

    await action_leave_request(
        session=db_async,
        current_user=supervisor,
        leave_request_id=leave_request.id,
        payload=LeaveRequestAction(status=RequestStatus.APPROVED),
    )

    result = await db_async.execute(
        select(LeaveBalanceEvent).where(
            LeaveBalanceEvent.related_leave_request_id == leave_request.id
        )
    )
    events = list(result.scalars().all())
    assert len(events) == 1
    assert events[0].delta_days == Decimal("-3.0")
