"""Read-only comparison of the leave ledger with the legacy balance tables.

For each active employee and leave type, replay the ledger and set it beside
the legacy ``LeaveBalance`` and ``LeaveCarryOver`` figures. Nothing is
changed: HR resolves each finding and records a verified balance through the
ledger. Carry-over is always reported because it needs written approval
(policy rule GAA-LV-VAC-CARRY-01).
"""

import uuid
from collections import defaultdict
from dataclasses import dataclass, field
from decimal import Decimal
from enum import Enum

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.models import User
from src.hr.models import (
    EmploymentRecord,
    EmploymentStatus,
    LeaveBalance,
    LeaveCarryOver,
)

from . import ledger
from .models import LeaveBalanceEvent, LeaveEntryKind


class Finding(str, Enum):
    NO_OPENING = "NO_OPENING"
    FIRST_ENTRY_NOT_OPENING = "FIRST_ENTRY_NOT_OPENING"
    SEQUENCE_GAP = "SEQUENCE_GAP"
    REPLAY_MISMATCH = "REPLAY_MISMATCH"
    LEGACY_BALANCE_DIFFERS = "LEGACY_BALANCE_DIFFERS"
    UNVERIFIED_CARRY_OVER = "UNVERIFIED_CARRY_OVER"


@dataclass
class ReconciliationRow:
    user_id: uuid.UUID
    email: str
    employee_number: str | None
    organisation_id: str
    department_id: str
    leave_type: str
    ledger_balance: Decimal | None
    ledger_entries: int
    legacy_balance: int | None
    legacy_carry_over: int | None
    findings: list[Finding] = field(default_factory=list)

    @property
    def reconciled(self) -> bool:
        return not self.findings


def _replay_findings(events: list[LeaveBalanceEvent]) -> list[Finding]:
    findings: list[Finding] = []
    if events[0].entry_kind != LeaveEntryKind.OPENING:
        findings.append(Finding.FIRST_ENTRY_NOT_OPENING)
    if [e.sequence for e in events] != list(range(1, len(events) + 1)):
        findings.append(Finding.SEQUENCE_GAP)
    running = Decimal(0)
    for event in events:
        running += event.delta_days
        if event.balance_after_days != running:
            findings.append(Finding.REPLAY_MISMATCH)
            break
    return findings


async def reconcile(
    session: AsyncSession, *, organisation_id: str | None = None
) -> list[ReconciliationRow]:
    """One row per active employee and leave type seen in the ledger or legacy tables."""
    query = (
        select(EmploymentRecord, User.email)
        .join(User, User.id == EmploymentRecord.user_id)
        .where(EmploymentRecord.status == EmploymentStatus.ACTIVE)
        .order_by(EmploymentRecord.organisation_id, User.email)
    )
    if organisation_id is not None:
        query = query.where(EmploymentRecord.organisation_id == organisation_id)
    staff = (await session.execute(query)).all()
    user_ids = [record.user_id for record, _ in staff]
    if not user_ids:
        return []

    chains: dict[tuple[uuid.UUID, str], list[LeaveBalanceEvent]] = defaultdict(list)
    for event in await ledger.entries(session, user_ids):
        chains[(event.user_id, event.leave_type)].append(event)
    legacy = {
        (row.user_id, row.leave_type): row.balance
        for row in (
            await session.execute(
                select(LeaveBalance).where(LeaveBalance.user_id.in_(user_ids))
            )
        ).scalars()
    }
    carry = {
        (row.user_id, row.leave_type): row.days
        for row in (
            await session.execute(
                select(LeaveCarryOver).where(LeaveCarryOver.user_id.in_(user_ids))
            )
        ).scalars()
    }

    rows: list[ReconciliationRow] = []
    for record, email in staff:
        leave_types = sorted(
            {t for (u, t) in (*chains, *legacy, *carry) if u == record.user_id}
        )
        for leave_type in leave_types:
            key = (record.user_id, leave_type)
            events = chains.get(key, [])
            balance = events[-1].balance_after_days if events else None
            findings = _replay_findings(events) if events else [Finding.NO_OPENING]
            legacy_balance = legacy.get(key)
            if legacy_balance is not None and balance != legacy_balance:
                findings.append(Finding.LEGACY_BALANCE_DIFFERS)
            if carry.get(key):
                findings.append(Finding.UNVERIFIED_CARRY_OVER)
            rows.append(
                ReconciliationRow(
                    user_id=record.user_id,
                    email=email,
                    employee_number=record.employee_number,
                    organisation_id=record.organisation_id,
                    department_id=record.department_id,
                    leave_type=leave_type,
                    ledger_balance=balance,
                    ledger_entries=len(events),
                    legacy_balance=legacy_balance,
                    legacy_carry_over=carry.get(key),
                    findings=findings,
                )
            )
    return rows
