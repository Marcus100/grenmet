"""Rewards ledger and stamp-card programmes.

Service functions ``flush`` and never ``commit``; the caller owns the
transaction. Balances are always computed in SQL from the ledger.

Guardrails (docs/exec-plans/barrels-foundations-plan.md): stamps cannot be
cashed out, transferred between people or bought, and nothing here ranks
people or rewards opening the app. Every entry comes from a real-world source
(an admission), a customer redeeming their own stamps, or an audited manual
adjustment.
"""

import logging
import secrets
import uuid
from datetime import timedelta
from typing import Any

from sqlalchemy import and_, func, or_, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from src import outbox
from src.audit import service as audit_service
from src.auth.models import User
from src.exceptions import NotFoundError
from src.organisations.models import PlatformOrganisation
from src.utils.datetime import utc_now

from . import sources
from .config import rewards_settings
from .exceptions import (
    ProgramNotFoundError,
    RedemptionNotFoundError,
    RewardsConflictError,
    RewardsValidationError,
)
from .models import (
    Entry,
    EntryKind,
    EntryStatus,
    FlagReason,
    Program,
    ProgramStatus,
    ReviewFlag,
)
from .schemas import ProgramCreate, ProgramUpdate

logger = logging.getLogger(__name__)

#: No 0/O/1/I so a code read aloud or typed on a till is hard to get wrong.
_CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"
_CODE_LENGTH = 8
SETTLED = (EntryStatus.CONFIRMED.value, EntryStatus.REVERSED.value)
EVENTS_ADMISSION = sources.EVENTS_ADMISSION


# --- programmes ---------------------------------------------------------------


async def create_program(
    session: AsyncSession, *, organisation_id: str, actor: User, payload: ProgramCreate
) -> Program:
    audit_service.set_actor(session, actor.id)
    program = Program(
        organisation_id=organisation_id,
        name=payload.name,
        stamps_required=payload.stamps_required,
        reward_description=payload.reward_description,
        stamps_per_source=payload.stamps_per_source,
        qualifying_source_type=payload.qualifying_source_type,
        max_redemptions_per_account=payload.max_redemptions_per_account,
    )
    session.add(program)
    await session.flush()
    return program


async def get_program(
    session: AsyncSession, program_id: uuid.UUID, *, organisation_id: str | None = None
) -> Program:
    program = await session.get(Program, program_id)
    if program is None or (
        organisation_id is not None and program.organisation_id != organisation_id
    ):
        raise ProgramNotFoundError()
    return program


async def update_program(
    session: AsyncSession,
    program: Program,
    *,
    actor: User,
    payload: ProgramUpdate,
) -> Program:
    audit_service.set_actor(session, actor.id)
    for field, value in payload.model_dump(exclude_unset=True).items():
        if field in {"name", "reward_description", "status"} and value is None:
            continue
        setattr(program, field, value.value if hasattr(value, "value") else value)
    await session.flush()
    return program


async def list_programs(
    session: AsyncSession, *, organisation_id: str
) -> list[Program]:
    result = await session.scalars(
        select(Program)
        .where(Program.organisation_id == organisation_id)
        .order_by(Program.created_at, Program.id)
    )
    return list(result)


async def set_program_status(
    session: AsyncSession, program: Program, *, actor: User, status: ProgramStatus
) -> Program:
    """Pause or resume a programme. Idempotent; paused programmes earn and redeem nothing."""
    audit_service.set_actor(session, actor.id)
    program.status = status.value
    await session.flush()
    return program


async def list_org_entries(
    session: AsyncSession,
    *,
    organisation_id: str,
    skip: int,
    limit: int,
    program_id: uuid.UUID | None = None,
    kind: EntryKind | None = None,
    redemptions_only: bool = False,
) -> tuple[list[dict[str, Any]], int]:
    """The organisation's ledger entries without any account identity."""
    conditions = [Entry.organisation_id == organisation_id]
    if program_id is not None:
        conditions.append(Entry.program_id == program_id)
    if kind is not None:
        conditions.append(Entry.kind == kind.value)
    if redemptions_only:
        conditions.append(Entry.kind == EntryKind.REDEEM.value)
    total = (
        await session.scalar(select(func.count()).select_from(Entry).where(*conditions))
        or 0
    )
    rows = (
        await session.execute(
            select(Entry, Program.name)
            .join(Program, Program.id == Entry.program_id)
            .where(*conditions)
            .order_by(Entry.created_at.desc(), Entry.id)
            .offset(skip)
            .limit(limit)
        )
    ).all()
    data = [
        {
            "id": entry.id,
            "program_id": entry.program_id,
            "program_name": program_name,
            "kind": entry.kind,
            "amount": entry.amount,
            "status": entry.status,
            "source_type": entry.source_type,
            "reason": entry.reason,
            "created_at": entry.created_at,
            "settled_at": entry.settled_at,
        }
        for entry, program_name in rows
    ]
    return data, total


async def list_programs_admin(
    session: AsyncSession, *, skip: int, limit: int
) -> tuple[list[dict[str, Any]], int]:
    total = await session.scalar(select(func.count()).select_from(Program)) or 0
    rows = (
        await session.execute(
            select(Program, PlatformOrganisation.name)
            .join(
                PlatformOrganisation, PlatformOrganisation.id == Program.organisation_id
            )
            .order_by(PlatformOrganisation.name, Program.created_at, Program.id)
            .offset(skip)
            .limit(limit)
        )
    ).all()
    data = [
        {
            **{c.key: getattr(program, c.key) for c in Program.__table__.columns},
            "organisation_name": name,
        }
        for program, name in rows
    ]
    return data, total


async def organisation_name(session: AsyncSession, organisation_id: str) -> str:
    return (
        await session.scalar(
            select(PlatformOrganisation.name).where(
                PlatformOrganisation.id == organisation_id
            )
        )
    ) or ""


# --- balances -----------------------------------------------------------------


async def cards(session: AsyncSession, account_id: uuid.UUID) -> list[dict[str, Any]]:
    """One row per programme the account has any entry in, balances from SQL."""
    settled = func.coalesce(func.sum(Entry.amount).filter(Entry.status.in_(SETTLED)), 0)
    pending_earn = func.coalesce(
        func.sum(Entry.amount).filter(
            Entry.status == EntryStatus.PENDING.value, Entry.amount > 0
        ),
        0,
    )
    held = func.coalesce(
        func.sum(Entry.amount).filter(
            Entry.status == EntryStatus.PENDING.value, Entry.amount < 0
        ),
        0,
    )
    redemptions = func.count().filter(
        Entry.kind == EntryKind.REDEEM.value,
        Entry.status.in_((EntryStatus.PENDING.value, EntryStatus.CONFIRMED.value)),
    )
    open_code = func.max(Entry.redeem_code).filter(
        Entry.kind == EntryKind.REDEEM.value,
        Entry.status == EntryStatus.PENDING.value,
    )
    rows = (
        await session.execute(
            select(
                Program,
                PlatformOrganisation.name.label("organisation_name"),
                settled.label("balance"),
                pending_earn.label("pending"),
                held.label("held"),
                redemptions.label("redemptions"),
                open_code.label("open_code"),
            )
            .join(Program, Program.id == Entry.program_id)
            .join(
                PlatformOrganisation, PlatformOrganisation.id == Program.organisation_id
            )
            .where(Entry.account_id == account_id)
            .group_by(Program.id, PlatformOrganisation.name)
            .order_by(PlatformOrganisation.name, Program.name)
        )
    ).all()
    result = []
    for row in rows:
        program: Program = row.Program
        available = row.balance + row.held
        result.append(
            {
                "program_id": program.id,
                "program_name": program.name,
                "organisation_id": program.organisation_id,
                "organisation_name": row.organisation_name,
                "reward_description": program.reward_description,
                "stamps_required": program.stamps_required,
                "balance": row.balance,
                "pending": row.pending,
                "available": available,
                "redemptions": row.redemptions,
                "open_redemption_code": row.open_code,
                "can_redeem": (
                    program.status == ProgramStatus.ACTIVE.value
                    and available >= program.stamps_required
                    and row.open_code is None
                    and (
                        program.max_redemptions_per_account is None
                        or row.redemptions < program.max_redemptions_per_account
                    )
                ),
            }
        )
    return result


async def _available(
    session: AsyncSession, account_id: uuid.UUID, program_id: uuid.UUID
) -> int:
    """Settled balance minus stamps held by an open redemption."""
    value = await session.scalar(
        select(
            func.coalesce(
                func.sum(Entry.amount).filter(
                    or_(
                        Entry.status.in_(SETTLED),
                        and_(
                            Entry.status == EntryStatus.PENDING.value, Entry.amount < 0
                        ),
                    )
                ),
                0,
            )
        ).where(Entry.account_id == account_id, Entry.program_id == program_id)
    )
    return int(value or 0)


async def list_entries(
    session: AsyncSession, account_id: uuid.UUID, *, skip: int, limit: int
) -> tuple[list[dict[str, Any]], int]:
    total = (
        await session.scalar(
            select(func.count())
            .select_from(Entry)
            .where(Entry.account_id == account_id)
        )
        or 0
    )
    rows = (
        await session.execute(
            select(Entry, Program.name, PlatformOrganisation.name)
            .join(Program, Program.id == Entry.program_id)
            .join(
                PlatformOrganisation, PlatformOrganisation.id == Entry.organisation_id
            )
            .where(Entry.account_id == account_id)
            .order_by(Entry.created_at.desc(), Entry.id)
            .offset(skip)
            .limit(limit)
        )
    ).all()
    data = [
        {
            "id": entry.id,
            "program_id": entry.program_id,
            "program_name": program_name,
            "organisation_name": organisation_name,
            "kind": entry.kind,
            "amount": entry.amount,
            "status": entry.status,
            "reason": entry.reason,
            "redeem_code": entry.redeem_code
            if entry.status == EntryStatus.PENDING.value
            else None,
            "created_at": entry.created_at,
        }
        for entry, program_name, organisation_name in rows
    ]
    return data, total


# --- earning ------------------------------------------------------------------


async def earn_for_source(
    session: AsyncSession,
    *,
    account_id: uuid.UUID,
    organisation_id: str,
    source_type: str,
    source_id: str,
    status: EntryStatus = EntryStatus.CONFIRMED,
) -> list[Entry]:
    """Credit stamps for one real-world source (e.g. an Events admission).

    Idempotent: a source credits each programme at most once (unique
    transaction reference and a unique index on programme + source), so a
    repeated check-in or a replayed sync adds nothing. Returns only the
    entries created by this call. Paused programmes earn nothing.
    """
    programs = await session.scalars(
        select(Program).where(
            Program.organisation_id == organisation_id,
            Program.status == ProgramStatus.ACTIVE.value,
            Program.qualifying_source_type == source_type,
        )
    )
    created: list[Entry] = []
    for program in programs:
        ref = f"earn:{program.id}:{source_type}:{source_id}"
        if await session.scalar(select(Entry.id).where(Entry.transaction_ref == ref)):
            continue
        entry = Entry(
            account_id=account_id,
            organisation_id=organisation_id,
            program_id=program.id,
            kind=EntryKind.EARN.value,
            amount=program.stamps_per_source,
            status=status.value,
            transaction_ref=ref,
            source_type=source_type,
            source_id=source_id,
            settled_at=utc_now() if status is not EntryStatus.PENDING else None,
        )
        try:
            async with session.begin_nested():
                session.add(entry)
                await session.flush()
        except IntegrityError:
            # Lost a race with another writer of the same source: already credited.
            continue
        created.append(entry)
    if created:
        await _check_velocity(session, account_id)
    return created


async def record_qualifying_action(
    session: AsyncSession,
    *,
    source_type: str,
    source_id: str,
    organisation_id: str,
    user_id: uuid.UUID,
) -> list[Entry]:
    """Credit every active programme of the organisation that qualifies for this action.

    The single entry point for earn sources (ADR-0030): Events, Bookings,
    Billing, Payments and venue check-ins call it, directly or from an outbox
    handler. ``source_type`` must be in the ``sources`` catalogue. Idempotent per
    programme and ``source_id`` (a replay credits nothing), and it applies the
    velocity flag through ``earn_for_source``. Returns the entries created by
    this call; the caller commits.
    """
    if not sources.is_qualifying_source(source_type):
        raise RewardsValidationError("Unknown qualifying source type")
    return await earn_for_source(
        session,
        account_id=user_id,
        organisation_id=organisation_id,
        source_type=source_type,
        source_id=source_id,
    )


QUALIFYING_ACTION_TOPIC = "rewards.qualifying_action"


async def emit_qualifying_action(
    session: AsyncSession,
    *,
    source_type: str,
    source_id: str,
    organisation_id: str,
    user_id: uuid.UUID,
) -> bool:
    """Queue ``record_qualifying_action`` on the outbox, in the caller's transaction.

    The row commits or rolls back with the change that caused it, and the worker
    credits the stamps later (``outbox_handlers``). Deduplicated per source and
    person (``<source_type>:<source_id>:<user_id>``), so a repeat adds nothing.
    No commit; returns False for a repeat."""
    if not sources.is_qualifying_source(source_type):
        raise RewardsValidationError("Unknown qualifying source type")
    return await outbox.enqueue(
        session,
        topic=QUALIFYING_ACTION_TOPIC,
        dedupe_key=f"{source_type}:{source_id}:{user_id}",
        organisation_id=organisation_id,
        payload={
            "source_type": source_type,
            "source_id": source_id,
            "organisation_id": organisation_id,
            "user_id": str(user_id),
        },
    )


async def confirm_pending_earn(session: AsyncSession, entry_id: uuid.UUID) -> bool:
    """Settle a pending earn (e.g. once its source can no longer be refunded)."""
    entry = await session.scalar(
        select(Entry)
        .where(
            Entry.id == entry_id,
            Entry.kind == EntryKind.EARN.value,
            Entry.status == EntryStatus.PENDING.value,
        )
        .with_for_update()
    )
    if entry is None:
        return False
    entry.status = EntryStatus.CONFIRMED.value
    entry.settled_at = utc_now()
    await session.flush()
    return True


async def _check_velocity(session: AsyncSession, account_id: uuid.UUID) -> None:
    """Flag an account that earns implausibly fast. Entries are kept; a person reviews."""
    window = utc_now() - timedelta(minutes=rewards_settings.VELOCITY_WINDOW_MINUTES)
    recent = await session.scalar(
        select(func.count())
        .select_from(Entry)
        .where(
            Entry.account_id == account_id,
            Entry.kind == EntryKind.EARN.value,
            Entry.created_at >= window,
        )
    )
    if (recent or 0) <= rewards_settings.VELOCITY_MAX_EARNS:
        return
    flag = ReviewFlag(
        account_id=account_id,
        reason=FlagReason.VELOCITY.value,
        detail=(
            f"{recent} earn entries in {rewards_settings.VELOCITY_WINDOW_MINUTES} "
            f"minutes (limit {rewards_settings.VELOCITY_MAX_EARNS})"
        ),
    )
    try:
        async with session.begin_nested():
            session.add(flag)
            await session.flush()
    except IntegrityError:
        return  # an open velocity flag already exists for this account
    logger.warning(
        "Rewards velocity flag",
        extra={"account_id": str(account_id), "earn_count": recent},
    )


# --- reversal -----------------------------------------------------------------


async def _reverse(
    session: AsyncSession, entry: Entry, *, reason: str, actor_id: uuid.UUID | None
) -> Entry | None:
    """Append the negating entry and mark ``entry`` reversed. Caller holds the row lock."""
    if entry.status == EntryStatus.REVERSED.value or entry.kind in (
        EntryKind.REVERSE.value,
        EntryKind.ADJUST.value,
    ):
        return None
    audit_service.set_actor(session, actor_id)
    reversal = Entry(
        account_id=entry.account_id,
        organisation_id=entry.organisation_id,
        program_id=entry.program_id,
        kind=EntryKind.REVERSE.value,
        amount=-entry.amount,
        status=EntryStatus.CONFIRMED.value,
        transaction_ref=f"reverse:{entry.id}",
        source_type=entry.source_type,
        source_id=entry.source_id,
        reverses_entry_id=entry.id,
        reason=reason,
        created_by_user_id=actor_id,
        settled_at=utc_now(),
    )
    session.add(reversal)
    entry.status = EntryStatus.REVERSED.value
    entry.settled_at = entry.settled_at or utc_now()
    await session.flush()
    return reversal


async def reverse_for_source(
    session: AsyncSession,
    source_type: str,
    source_id: str,
    *,
    reason: str = "Source refunded or cancelled",
    actor_id: uuid.UUID | None = None,
) -> int:
    """Reverse every earn entry that came from this source. Idempotent.

    The hook for Events (and any future source): call it in the same transaction
    that records a refund or cancellation. Returns how many entries were reversed.
    """
    entries = await session.scalars(
        select(Entry)
        .where(
            Entry.kind == EntryKind.EARN.value,
            Entry.source_type == source_type,
            Entry.source_id == source_id,
            Entry.status != EntryStatus.REVERSED.value,
        )
        .with_for_update()
    )
    count = 0
    for entry in list(entries):
        if await _reverse(session, entry, reason=reason, actor_id=actor_id):
            count += 1
    return count


# --- redemption ---------------------------------------------------------------


def _new_code() -> str:
    return "".join(secrets.choice(_CODE_ALPHABET) for _ in range(_CODE_LENGTH))


async def _lock_account_program(
    session: AsyncSession, account_id: uuid.UUID, program_id: uuid.UUID
) -> None:
    """Serialise redemptions and adjustments for one account and programme."""
    await session.execute(
        text("SELECT pg_advisory_xact_lock(hashtextextended(:key, 0))"),
        {"key": f"rewards:{account_id}:{program_id}"},
    )


async def request_redemption(
    session: AsyncSession, *, account: User, program_id: uuid.UUID
) -> tuple[Entry, Program]:
    """Hold a card's worth of stamps behind a one-time code staff will confirm."""
    program = await get_program(session, program_id)
    if program.status != ProgramStatus.ACTIVE.value:
        raise RewardsConflictError("This programme is paused")
    await _lock_account_program(session, account.id, program.id)
    open_entry = await session.scalar(
        select(Entry.id).where(
            Entry.account_id == account.id,
            Entry.program_id == program.id,
            Entry.kind == EntryKind.REDEEM.value,
            Entry.status == EntryStatus.PENDING.value,
        )
    )
    if open_entry is not None:
        raise RewardsConflictError("You already have an open redemption for this card")
    if program.max_redemptions_per_account is not None:
        used = await session.scalar(
            select(func.count())
            .select_from(Entry)
            .where(
                Entry.account_id == account.id,
                Entry.program_id == program.id,
                Entry.kind == EntryKind.REDEEM.value,
                Entry.status.in_(
                    (EntryStatus.PENDING.value, EntryStatus.CONFIRMED.value)
                ),
            )
        )
        if (used or 0) >= program.max_redemptions_per_account:
            raise RewardsConflictError("Redemption limit reached for this card")
    if await _available(session, account.id, program.id) < program.stamps_required:
        raise RewardsConflictError("Not enough stamps yet")
    audit_service.set_actor(session, account.id)
    entry = Entry(
        account_id=account.id,
        organisation_id=program.organisation_id,
        program_id=program.id,
        kind=EntryKind.REDEEM.value,
        amount=-program.stamps_required,
        status=EntryStatus.PENDING.value,
        transaction_ref=f"redeem:{uuid.uuid4()}",
        redeem_code=_new_code(),
        created_by_user_id=account.id,
    )
    session.add(entry)
    await session.flush()
    return entry, program


async def cancel_redemption(
    session: AsyncSession, *, account: User, entry_id: uuid.UUID
) -> Entry:
    entry = await session.scalar(
        select(Entry)
        .where(
            Entry.id == entry_id,
            Entry.account_id == account.id,
            Entry.kind == EntryKind.REDEEM.value,
        )
        .with_for_update()
    )
    if entry is None:
        raise RedemptionNotFoundError()
    if entry.status != EntryStatus.PENDING.value:
        raise RewardsConflictError("This redemption can no longer be cancelled")
    await _reverse(
        session, entry, reason="Cancelled by the customer", actor_id=account.id
    )
    return entry


async def confirm_redemption(
    session: AsyncSession, *, organisation_id: str, code: str, staff: User | None
) -> tuple[Entry, Program]:
    """Staff of the funding organisation (``None``: an API key) confirm a
    customer's code. One use only."""
    entry = await session.scalar(
        select(Entry)
        .where(
            Entry.redeem_code == code.strip().upper(),
            Entry.organisation_id == organisation_id,
            Entry.kind == EntryKind.REDEEM.value,
        )
        .with_for_update()
    )
    if entry is None:
        raise RedemptionNotFoundError()
    if entry.status != EntryStatus.PENDING.value:
        raise RewardsConflictError("This code has already been used or cancelled")
    staff_id = staff.id if staff else None
    audit_service.set_actor(session, staff_id)
    entry.status = EntryStatus.CONFIRMED.value
    entry.settled_at = utc_now()
    entry.settled_by_user_id = staff_id
    await session.flush()
    program = await get_program(session, entry.program_id)
    return entry, program


# --- adjustments and review ---------------------------------------------------


async def adjust(
    session: AsyncSession,
    *,
    actor: User,
    account_id: uuid.UUID,
    program_id: uuid.UUID,
    amount: int,
    reason: str,
) -> Entry:
    """Audited manual correction (``rewards.manage``). Never takes a card below zero."""
    if amount == 0:
        raise RewardsValidationError("An adjustment cannot be zero")
    program = await get_program(session, program_id)
    if await session.get(User, account_id) is None:
        raise RewardsValidationError("Unknown account")
    await _lock_account_program(session, account_id, program.id)
    if await _available(session, account_id, program.id) + amount < 0:
        raise RewardsValidationError("This adjustment would make the balance negative")
    audit_service.set_actor(session, actor.id)
    entry = Entry(
        account_id=account_id,
        organisation_id=program.organisation_id,
        program_id=program.id,
        kind=EntryKind.ADJUST.value,
        amount=amount,
        status=EntryStatus.CONFIRMED.value,
        transaction_ref=f"adjust:{uuid.uuid4()}",
        reason=reason.strip(),
        created_by_user_id=actor.id,
        settled_at=utc_now(),
    )
    session.add(entry)
    await session.flush()
    return entry


async def list_flags(
    session: AsyncSession, *, include_resolved: bool = False
) -> list[ReviewFlag]:
    stmt = select(ReviewFlag).order_by(ReviewFlag.created_at.desc()).limit(200)
    if not include_resolved:
        stmt = stmt.where(ReviewFlag.resolved_at.is_(None))
    return list(await session.scalars(stmt))


async def resolve_flag(
    session: AsyncSession, *, flag_id: uuid.UUID, actor: User, note: str
) -> ReviewFlag:
    flag = await session.get(ReviewFlag, flag_id)
    if flag is None:
        raise NotFoundError("Flag not found")
    if flag.resolved_at is not None:
        raise RewardsConflictError("This flag is already resolved")
    audit_service.set_actor(session, actor.id)
    flag.resolved_at = utc_now()
    flag.resolved_by_user_id = actor.id
    flag.resolution_note = note.strip()
    await session.flush()
    return flag
