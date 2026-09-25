"""Leave ledger: ordering, idempotent approval debits, and one balance for every reader."""

import asyncio
from datetime import date, datetime
from decimal import Decimal

import pytest
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from src.hr.dashboard.service import read_dashboard
from src.hr.exceptions import HRValidationError
from src.hr.leave import ledger
from src.hr.leave.models import (
    LeaveBalanceEvent,
    LeaveEntryKind,
    LeaveRequest,
    LeaveType,
)
from src.hr.leave.schemas import LeaveRequestAction
from src.hr.leave.service import action_leave_request
from src.hr.models import LeaveCarryOver, RequestStatus
from src.hr.service import read_profile_for_user
from tests.factories import (
    _load_user_with_roles,
    assign_role,
    make_department,
    make_ready_staff,
    make_role_with_permission,
    make_supervised_pair,
    make_user,
)


async def _events(session: AsyncSession, user_id, leave_type="VACATION"):
    return list(
        (
            await session.execute(
                select(LeaveBalanceEvent)
                .where(
                    LeaveBalanceEvent.user_id == user_id,
                    LeaveBalanceEvent.leave_type == leave_type,
                )
                .order_by(LeaveBalanceEvent.sequence)
            )
        )
        .scalars()
        .all()
    )


async def _leave_request(session: AsyncSession, user, department_id, days="3.0"):
    request = LeaveRequest(
        user_id=user.id,
        department_id=department_id,
        leave_type=LeaveType.VACATION,
        start_date=date(2026, 11, 2),
        end_date=date(2026, 11, 4),
        days_requested=Decimal(days),
        status=RequestStatus.SUBMITTED,
    )
    session.add(request)
    await session.flush()
    return request


async def test_postings_keep_sequence_and_running_balance(db_async: AsyncSession):
    user = await make_user(db_async)
    dept = await make_department(db_async, "ledger_order")
    request = await _leave_request(db_async, user, dept.id, days="2.5")

    await ledger.set_to(
        db_async,
        user_id=user.id,
        leave_type="VACATION",
        target=Decimal("10"),
        reason="Opening",
        actor_id=user.id,
    )
    await ledger.post(
        db_async,
        user_id=user.id,
        leave_type="VACATION",
        kind=LeaveEntryKind.ADJUSTMENT,
        delta=Decimal("0.5"),
        reason="Half day correction",
        actor_id=user.id,
    )
    await ledger.post(
        db_async,
        user_id=user.id,
        leave_type="VACATION",
        kind=LeaveEntryKind.APPROVAL_DEBIT,
        delta=-request.days_requested,
        reason="Approved",
        actor_id=user.id,
        leave_request_id=request.id,
    )
    await ledger.set_to(
        db_async,
        user_id=user.id,
        leave_type="VACATION",
        target=Decimal("7"),
        reason="Verified correction",
        actor_id=user.id,
    )

    events = await _events(db_async, user.id)
    assert [e.sequence for e in events] == [1, 2, 3, 4]
    assert [e.entry_kind for e in events] == [
        LeaveEntryKind.OPENING,
        LeaveEntryKind.ADJUSTMENT,
        LeaveEntryKind.APPROVAL_DEBIT,
        LeaveEntryKind.ADJUSTMENT,
    ]
    running = Decimal(0)
    for event in events:
        running += event.delta_days
        assert event.balance_after_days == running
    assert running == Decimal("7")

    # Identical timestamps no longer make "latest" ambiguous.
    await db_async.execute(
        update(LeaveBalanceEvent)
        .where(LeaveBalanceEvent.user_id == user.id)
        .values(created_at=datetime(2026, 1, 1))
    )
    assert await ledger.balance(db_async, user.id, "VACATION") == Decimal("7")
    assert await ledger.balances(db_async, user.id) == {"VACATION": Decimal("7")}
    assert await ledger.balance(db_async, user.id, "SICK") is None
    assert not await ledger.has_entry(db_async, user.id, "SICK")


async def test_approval_debit_posts_once(db_async: AsyncSession):
    user = await make_user(db_async)
    dept = await make_department(db_async, "ledger_once")
    request = await _leave_request(db_async, user, dept.id)
    await ledger.set_to(
        db_async,
        user_id=user.id,
        leave_type="VACATION",
        target=Decimal("20"),
        reason="Opening",
        actor_id=user.id,
    )

    async def debit():
        return await ledger.post(
            db_async,
            user_id=user.id,
            leave_type="VACATION",
            kind=LeaveEntryKind.APPROVAL_DEBIT,
            delta=-request.days_requested,
            reason="Approved",
            actor_id=user.id,
            leave_request_id=request.id,
        )

    first = await debit()
    second = await debit()
    assert first.id == second.id
    assert await ledger.balance(db_async, user.id, "VACATION") == Decimal("17")
    with pytest.raises(ValueError, match="needs its leave request"):
        await ledger.post(
            db_async,
            user_id=user.id,
            leave_type="VACATION",
            kind=LeaveEntryKind.APPROVAL_DEBIT,
            delta=Decimal("-1"),
            reason="Unlinked",
            actor_id=user.id,
        )


@pytest.mark.parametrize("clash", ["approval_debit", "sequence"])
async def test_database_rejects_ledger_clashes(db_async: AsyncSession, clash: str):
    user = await make_user(db_async)
    dept = await make_department(db_async, f"ledger_clash_{clash}")
    request = await _leave_request(db_async, user, dept.id)
    await ledger.set_to(
        db_async,
        user_id=user.id,
        leave_type="VACATION",
        target=Decimal("20"),
        reason="Opening",
        actor_id=user.id,
    )
    await ledger.post(
        db_async,
        user_id=user.id,
        leave_type="VACATION",
        kind=LeaveEntryKind.APPROVAL_DEBIT,
        delta=Decimal("-3"),
        reason="Approved",
        actor_id=user.id,
        leave_request_id=request.id,
    )
    db_async.add(
        LeaveBalanceEvent(
            user_id=user.id,
            leave_type="VACATION",
            entry_kind=LeaveEntryKind.APPROVAL_DEBIT
            if clash == "approval_debit"
            else LeaveEntryKind.ADJUSTMENT,
            sequence=3 if clash == "approval_debit" else 2,
            delta_days=Decimal("-3"),
            balance_after_days=Decimal("14"),
            reason="Bypassed the ledger service",
            related_leave_request_id=request.id if clash == "approval_debit" else None,
            created_by_user_id=user.id,
        )
    )
    with pytest.raises(IntegrityError):
        await db_async.flush()
    await db_async.rollback()


async def test_concurrent_legacy_approvals_post_one_debit(db_async: AsyncSession):
    from src.database import async_session_factory

    supervisor, employee, dept, _ = await make_supervised_pair(
        db_async, "leave.request.action"
    )
    await make_ready_staff(db_async, employee, dept.id)
    request = await _leave_request(db_async, employee, dept.id)
    await db_async.commit()

    async def approve():
        async with async_session_factory() as session:
            actor = await _load_user_with_roles(session, supervisor.id)
            await action_leave_request(
                session=session,
                current_user=actor,
                leave_request_id=request.id,
                payload=LeaveRequestAction(status=RequestStatus.APPROVED),
            )

    results = await asyncio.gather(approve(), approve(), return_exceptions=True)
    failures = [r for r in results if isinstance(r, Exception)]
    assert len(failures) == 1
    assert isinstance(failures[0], HRValidationError)

    debits = [
        e
        for e in await _events(db_async, employee.id)
        if e.entry_kind == LeaveEntryKind.APPROVAL_DEBIT
    ]
    assert len(debits) == 1
    assert await ledger.balance(db_async, employee.id, "VACATION") == Decimal("27")


async def test_profile_and_dashboard_read_the_same_ledger(db_async: AsyncSession):
    user = await make_user(db_async)
    dept = await make_department(db_async, "ledger_readers")
    await make_ready_staff(db_async, user, dept.id)
    role, _ = await make_role_with_permission(db_async, "roster.view")
    await assign_role(db_async, user=user, role=role)
    request = await _leave_request(db_async, user, dept.id, days="2.5")
    await ledger.post(
        db_async,
        user_id=user.id,
        leave_type="VACATION",
        kind=LeaveEntryKind.APPROVAL_DEBIT,
        delta=-request.days_requested,
        reason="Approved",
        actor_id=user.id,
        leave_request_id=request.id,
    )
    db_async.add(LeaveCarryOver(user_id=user.id, leave_type="VACATION", days=4))
    await db_async.commit()
    user = await _load_user_with_roles(db_async, user.id)
    await db_async.refresh(user, attribute_names=["user_image"])

    profile = await read_profile_for_user(session=db_async, current_user=user)
    dashboard = await read_dashboard(session=db_async, current_user=user)

    assert profile.leave.balances == {
        "VACATION": Decimal("27.5"),
        "SICK": Decimal("30"),
    }
    assert dashboard.vacation_balance == profile.leave.balances["VACATION"]
    assert profile.leave.unverified_carry_over == {"VACATION": 4}
