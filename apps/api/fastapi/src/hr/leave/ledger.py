"""The single owner of leave-ledger reads and writes.

Every balance change is an appended ``LeaveBalanceEvent``. Writers take the
employee's ``User`` row lock, so postings for one employee serialise and each
entry derives from the previous ``sequence``. The database also enforces one
sequence per (user, leave type) and one approval debit per leave request.
Functions here never commit; the caller owns the transaction.
"""

import uuid
from decimal import Decimal

from sqlalchemy import exists, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.models import User

from .models import LeaveBalanceEvent, LeaveEntryKind


async def _latest(
    session: AsyncSession, user_id: uuid.UUID, leave_type: str
) -> LeaveBalanceEvent | None:
    return (
        (
            await session.execute(
                select(LeaveBalanceEvent)
                .where(
                    LeaveBalanceEvent.user_id == user_id,
                    LeaveBalanceEvent.leave_type == leave_type,
                )
                .order_by(LeaveBalanceEvent.sequence.desc())
                .limit(1)
            )
        )
        .scalars()
        .first()
    )


async def lock_employee(session: AsyncSession, user_id: uuid.UUID) -> None:
    """Serialise ledger postings for one employee."""
    await session.execute(select(User.id).where(User.id == user_id).with_for_update())


async def post(
    session: AsyncSession,
    *,
    user_id: uuid.UUID,
    leave_type: str,
    kind: LeaveEntryKind,
    delta: Decimal,
    reason: str,
    actor_id: uuid.UUID,
    leave_request_id: uuid.UUID | None = None,
) -> LeaveBalanceEvent:
    """Append one entry. An approval debit already posted for the request is returned unchanged."""
    if kind == LeaveEntryKind.APPROVAL_DEBIT and leave_request_id is None:
        raise ValueError("An approval debit needs its leave request")
    await lock_employee(session, user_id)
    if kind == LeaveEntryKind.APPROVAL_DEBIT:
        existing = (
            (
                await session.execute(
                    select(LeaveBalanceEvent).where(
                        LeaveBalanceEvent.related_leave_request_id == leave_request_id,
                        LeaveBalanceEvent.entry_kind == LeaveEntryKind.APPROVAL_DEBIT,
                    )
                )
            )
            .scalars()
            .first()
        )
        if existing is not None:
            return existing
    last = await _latest(session, user_id, leave_type)
    previous = last.balance_after_days if last else Decimal(0)
    event = LeaveBalanceEvent(
        user_id=user_id,
        leave_type=leave_type,
        entry_kind=kind,
        sequence=(last.sequence if last else 0) + 1,
        delta_days=delta,
        balance_after_days=previous + delta,
        reason=reason,
        related_leave_request_id=leave_request_id,
        created_by_user_id=actor_id,
    )
    session.add(event)
    await session.flush()
    return event


async def set_to(
    session: AsyncSession,
    *,
    user_id: uuid.UUID,
    leave_type: str,
    target: Decimal,
    reason: str,
    actor_id: uuid.UUID,
) -> LeaveBalanceEvent:
    """Record a verified balance: the first entry is the opening, later ones adjust."""
    await lock_employee(session, user_id)
    last = await _latest(session, user_id, leave_type)
    previous = last.balance_after_days if last else Decimal(0)
    return await post(
        session,
        user_id=user_id,
        leave_type=leave_type,
        kind=LeaveEntryKind.ADJUSTMENT if last else LeaveEntryKind.OPENING,
        delta=target - previous,
        reason=reason,
        actor_id=actor_id,
    )


async def balance(
    session: AsyncSession, user_id: uuid.UUID, leave_type: str
) -> Decimal | None:
    """The current balance, or ``None`` when no opening has been recorded."""
    last = await _latest(session, user_id, leave_type)
    return last.balance_after_days if last else None


async def balances(session: AsyncSession, user_id: uuid.UUID) -> dict[str, Decimal]:
    """The current balance for every leave type the employee has entries for."""
    rows = await session.execute(
        select(LeaveBalanceEvent.leave_type, LeaveBalanceEvent.balance_after_days)
        .where(LeaveBalanceEvent.user_id == user_id)
        .distinct(LeaveBalanceEvent.leave_type)
        .order_by(LeaveBalanceEvent.leave_type, LeaveBalanceEvent.sequence.desc())
    )
    return {row.leave_type: row.balance_after_days for row in rows}


async def has_entry(session: AsyncSession, user_id: uuid.UUID, leave_type: str) -> bool:
    """Whether an opening balance has been recorded for this leave type."""
    return bool(
        await session.scalar(
            select(
                exists().where(
                    LeaveBalanceEvent.user_id == user_id,
                    LeaveBalanceEvent.leave_type == leave_type,
                )
            )
        )
    )


async def entries(
    session: AsyncSession, user_ids: list[uuid.UUID]
) -> list[LeaveBalanceEvent]:
    """Every entry for these employees, in ledger order, for replay and review."""
    if not user_ids:
        return []
    return list(
        (
            await session.execute(
                select(LeaveBalanceEvent)
                .where(LeaveBalanceEvent.user_id.in_(user_ids))
                .order_by(
                    LeaveBalanceEvent.user_id,
                    LeaveBalanceEvent.leave_type,
                    LeaveBalanceEvent.sequence,
                )
            )
        )
        .scalars()
        .all()
    )
