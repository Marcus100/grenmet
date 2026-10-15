from datetime import date
from decimal import Decimal

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.models import User
from src.baseline.balance_import import import_opening_balances
from src.baseline.schemas import BalanceImportRequest
from src.exceptions import AppException
from src.hr.leave import ledger
from src.hr.leave.models import LeaveBalanceEvent, LeaveEntryKind
from src.hr.models import Department, EmploymentRecord, EmploymentStatus
from tests.factories import make_employee, make_user
from tests.utils.utils import random_lower_string

DEPT = "dept_balimport"


async def _employee(db: AsyncSession, number: str) -> User:
    if not await db.get(Department, DEPT):
        db.add(
            Department(organisation_id="gaa", code=DEPT, id=DEPT, name="Balance import")
        )
        await db.commit()
    user = await make_user(db)
    record = await make_employee(db, user=user, department_id=DEPT)
    record.employee_number = number
    db.add(record)
    await db.commit()
    return user


def _request(csv: str, *, apply: bool) -> BalanceImportRequest:
    return BalanceImportRequest(
        organisation_id="gaa",
        source="HrPlus leave balance report",
        as_of=date(2026, 10, 16),
        csv=csv,
        apply=apply,
    )


async def test_check_only_reports_rows_and_posts_nothing(
    db_async: AsyncSession,
) -> None:
    admin = await make_user(db_async, superuser=True)
    number = f"BI-{random_lower_string()[:6]}"
    user = await _employee(db_async, number)
    result = await import_opening_balances(
        db_async,
        admin,
        _request(
            f"employee_number,name,leave_type,balance\n{number},Ignored Name,VACATION,23.5\n",
            apply=False,
        ),
    )
    assert (result.applied, result.valid, result.invalid) == (False, 1, 0)
    assert result.rows[0].balance == Decimal("23.50")
    assert await ledger.balance(db_async, user.id, "VACATION") is None


async def test_apply_posts_opening_then_adjustment_through_the_ledger(
    db_async: AsyncSession,
) -> None:
    admin = await make_user(db_async, superuser=True)
    number = f"BI-{random_lower_string()[:6]}"
    user = await _employee(db_async, number)
    first = await import_opening_balances(
        db_async,
        admin,
        _request(
            f"employee_number,leave_type,balance\n{number},vacation,20\n", apply=True
        ),
    )
    assert first.applied
    assert await ledger.balance(db_async, user.id, "VACATION") == Decimal("20.00")

    await import_opening_balances(
        db_async,
        admin,
        _request(
            f"employee_number,leave_type,balance\n{number},VACATION,18\n", apply=True
        ),
    )
    entries = (
        (
            await db_async.execute(
                select(LeaveBalanceEvent)
                .where(LeaveBalanceEvent.user_id == user.id)
                .order_by(LeaveBalanceEvent.sequence)
            )
        )
        .scalars()
        .all()
    )
    assert [e.entry_kind for e in entries] == [
        LeaveEntryKind.OPENING,
        LeaveEntryKind.ADJUSTMENT,
    ]
    assert entries[-1].balance_after_days == Decimal("18.00")
    assert "as of 2026-10-16" in entries[0].reason


async def test_one_bad_row_blocks_the_whole_file(db_async: AsyncSession) -> None:
    admin = await make_user(db_async, superuser=True)
    number = f"BI-{random_lower_string()[:6]}"
    user = await _employee(db_async, number)
    csv = (
        "employee_number,leave_type,balance\n"
        f"{number},VACATION,10\n"
        f"{number},VACATION,11\n"
        f"{number},Uncertified sick,5\n"
        "NO-SUCH-STAFF,SICK,3\n"
        f"{number},SICK,-2\n"
        f"{number},CASUAL,1.234\n"
    )
    result = await import_opening_balances(db_async, admin, _request(csv, apply=True))
    assert not result.applied
    assert [r.status for r in result.rows] == [
        "OK",
        "ERROR",
        "ERROR",
        "ERROR",
        "ERROR",
        "ERROR",
    ]
    messages = [r.message or "" for r in result.rows]
    assert "Duplicate" in messages[1]
    assert "Unknown leave type" in messages[2]
    assert "No employee" in messages[3]
    assert "between 0 and 9999" in messages[4]
    assert "two decimal places" in messages[5]
    assert await ledger.balance(db_async, user.id, "VACATION") is None


async def test_terminated_staff_are_refused(db_async: AsyncSession) -> None:
    admin = await make_user(db_async, superuser=True)
    number = f"BI-{random_lower_string()[:6]}"
    user = await _employee(db_async, number)
    record = (
        await db_async.execute(
            select(EmploymentRecord).where(EmploymentRecord.user_id == user.id)
        )
    ).scalar_one()
    record.status = EmploymentStatus.TERMINATED
    db_async.add(record)
    await db_async.commit()
    result = await import_opening_balances(
        db_async,
        admin,
        _request(
            f"employee_number,leave_type,balance\n{number},VACATION,5\n", apply=True
        ),
    )
    assert result.rows[0].message == "Employee is not active"
    assert not result.applied


async def test_missing_columns_and_non_admins_are_rejected(
    db_async: AsyncSession,
) -> None:
    admin = await make_user(db_async, superuser=True)
    with pytest.raises(AppException) as missing:
        await import_opening_balances(
            db_async, admin, _request("employee_number,balance\nX,1\n", apply=False)
        )
    assert missing.value.status_code == 400
    staff = await make_user(db_async)
    with pytest.raises(AppException) as denied:
        await import_opening_balances(
            db_async,
            staff,
            _request("employee_number,leave_type,balance\nX,VACATION,1\n", apply=False),
        )
    assert denied.value.status_code == 403
