"""Leave reconciliation report: ledger replay against the legacy balance tables."""

import uuid
from decimal import Decimal

from sqlalchemy.ext.asyncio import AsyncSession

from src.hr.leave import ledger
from src.hr.leave.models import LeaveBalanceEvent, LeaveEntryKind
from src.hr.leave.reconciliation import Finding, reconcile
from src.hr.models import EmploymentStatus, LeaveBalance, LeaveCarryOver
from tests.factories import make_department, make_employee, make_user


async def _staff(session: AsyncSession, department_id: str):
    user = await make_user(session)
    await make_employee(session, user=user, department_id=department_id)
    return user


async def _opening(session: AsyncSession, user, leave_type="VACATION", days="10"):
    await ledger.set_to(
        session,
        user_id=user.id,
        leave_type=leave_type,
        target=Decimal(days),
        reason="Verified opening",
        actor_id=user.id,
    )


def _findings(rows, user_ids: set[uuid.UUID]):
    return {
        (row.user_id, row.leave_type): row.findings
        for row in rows
        if row.user_id in user_ids
    }


async def test_report_classifies_each_employee_and_leave_type(db_async: AsyncSession):
    dept = await make_department(db_async, "recon_gaa")
    clean, differs, legacy_only, carried, broken = [
        await _staff(db_async, dept.id) for _ in range(5)
    ]
    await _opening(db_async, clean)
    db_async.add(LeaveBalance(user_id=clean.id, leave_type="VACATION", balance=10))
    await _opening(db_async, differs)
    db_async.add(LeaveBalance(user_id=differs.id, leave_type="VACATION", balance=12))
    db_async.add(LeaveBalance(user_id=legacy_only.id, leave_type="SICK", balance=5))
    await _opening(db_async, carried)
    db_async.add(LeaveCarryOver(user_id=carried.id, leave_type="VACATION", days=3))
    # A chain written outside the ledger service: wrong first kind and a bad running total.
    db_async.add(
        LeaveBalanceEvent(
            user_id=broken.id,
            leave_type="VACATION",
            entry_kind=LeaveEntryKind.ADJUSTMENT,
            sequence=1,
            delta_days=Decimal("5"),
            balance_after_days=Decimal("6"),
            reason="Imported without review",
            created_by_user_id=broken.id,
        )
    )
    await db_async.commit()

    rows = await reconcile(db_async, organisation_id="gaa")
    findings = _findings(
        rows, {clean.id, differs.id, legacy_only.id, carried.id, broken.id}
    )

    assert findings == {
        (clean.id, "VACATION"): [],
        (differs.id, "VACATION"): [Finding.LEGACY_BALANCE_DIFFERS],
        (legacy_only.id, "SICK"): [
            Finding.NO_OPENING,
            Finding.LEGACY_BALANCE_DIFFERS,
        ],
        (carried.id, "VACATION"): [Finding.UNVERIFIED_CARRY_OVER],
        (broken.id, "VACATION"): [
            Finding.FIRST_ENTRY_NOT_OPENING,
            Finding.REPLAY_MISMATCH,
        ],
    }
    by_user = {row.user_id: row for row in rows}
    assert by_user[clean.id].reconciled
    assert by_user[differs.id].ledger_balance == Decimal("10")
    assert by_user[differs.id].legacy_balance == 12
    assert by_user[carried.id].legacy_carry_over == 3
    assert by_user[legacy_only.id].ledger_entries == 0


async def test_report_skips_inactive_staff_and_other_organisations(
    db_async: AsyncSession,
):
    from src.hr.models import Organisation

    if await db_async.get(Organisation, "other") is None:
        db_async.add(Organisation(id="other", code="OTHER", name="Other organisation"))
        await db_async.flush()
    gaa = await make_department(db_async, "recon_scope")
    other = await make_department(db_async, "recon_other", organisation_id="other")
    active = await _staff(db_async, gaa.id)
    no_records = await _staff(db_async, gaa.id)
    inactive = await make_user(db_async)
    record = await make_employee(db_async, user=inactive, department_id=gaa.id)
    record.status = EmploymentStatus.INACTIVE
    outsider = await _staff(db_async, other.id)
    for user in (active, inactive, outsider):
        await _opening(db_async, user)
    await db_async.commit()

    ids = {active.id, inactive.id, outsider.id, no_records.id}
    gaa_rows = await reconcile(db_async, organisation_id="gaa")
    assert {row.user_id for row in gaa_rows} & ids == {active.id, no_records.id}
    missing = [row for row in gaa_rows if row.user_id == no_records.id]
    assert [(row.leave_type, row.findings) for row in missing] == [
        ("", [Finding.NO_OPENING])
    ]
    all_rows = await reconcile(db_async)
    assert {row.user_id for row in all_rows} & ids == {
        active.id,
        outsider.id,
        no_records.id,
    }
