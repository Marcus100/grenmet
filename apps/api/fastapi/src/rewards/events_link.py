"""Read-only bridge to the Events database (a separate database, no cross-DB joins).

Nothing here writes to Events or edits Events code. Rewards learns about real
attendance by reading admissions, then credits its own ledger idempotently:

* ``sync_admissions`` credits one stamp card entry per admission whose organiser
  funds an active programme (``record_qualifying_action`` is unique per programme and
  admission, so running it repeatedly, or alongside a direct call, is safe).
* ``reverse_refunded_admissions`` reverses entries whose ticket or order is no
  longer valid/confirmed (cancelled, refunded), using ``reverse_for_source``.

Both run from the ``sync_event_rewards`` worker job. Events can also call
``rewards.service.reverse_for_source("events.admission", str(admission_id))``
directly in the same main-database transaction as a refund.
"""

import uuid
from dataclasses import dataclass
from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.events.models import Admission, Listing, Order, Organiser, Ticket
from src.utils.datetime import utc_now

from . import service, sources
from .config import rewards_settings
from .models import Entry, EntryKind, EntryStatus, Program, ProgramStatus


@dataclass
class SyncResult:
    credited: int = 0
    reversed: int = 0


async def sync_admissions(main: AsyncSession, events: AsyncSession) -> SyncResult:
    """Credit recent admissions and reverse refunded ones; the caller commits."""
    result = SyncResult()
    funded = set(
        await main.scalars(
            select(Program.organisation_id)
            .where(
                Program.status == ProgramStatus.ACTIVE.value,
                Program.qualifying_source_type == sources.EVENTS_ADMISSION,
            )
            .distinct()
        )
    )
    if funded:
        since = utc_now() - timedelta(days=rewards_settings.SYNC_LOOKBACK_DAYS)
        rows = (
            await events.execute(
                select(Admission.id, Ticket.user_id, Organiser.organisation_id)
                .join(Ticket, Ticket.id == Admission.ticket_id)
                .join(Order, Order.id == Ticket.order_id)
                .join(Listing, Listing.id == Admission.listing_id)
                .join(Organiser, Organiser.id == Listing.organiser_id)
                .where(
                    Admission.admitted_at >= since,
                    Ticket.status == "valid",
                    Order.status == "confirmed",
                    Organiser.organisation_id.in_(funded),
                )
                .order_by(Admission.admitted_at)
                .limit(rewards_settings.SYNC_BATCH_SIZE)
            )
        ).all()
        for admission_id, user_id, organisation_id in rows:
            created = await service.record_qualifying_action(
                main,
                source_type=sources.EVENTS_ADMISSION,
                source_id=str(admission_id),
                organisation_id=organisation_id,
                user_id=user_id,
            )
            result.credited += len(created)
    result.reversed = await reverse_refunded_admissions(main, events)
    return result


async def reverse_refunded_admissions(main: AsyncSession, events: AsyncSession) -> int:
    since = utc_now() - timedelta(days=rewards_settings.SYNC_LOOKBACK_DAYS)
    sources = [
        row
        for row in await main.scalars(
            select(Entry.source_id).where(
                Entry.kind == EntryKind.EARN.value,
                Entry.source_type == service.EVENTS_ADMISSION,
                Entry.status != EntryStatus.REVERSED.value,
                Entry.created_at >= since,
            )
        )
        if row is not None
    ]
    ids: list[uuid.UUID] = []
    for source in sources:
        try:
            ids.append(uuid.UUID(source))
        except ValueError:
            continue
    if not ids:
        return 0
    gone = await events.scalars(
        select(Admission.id)
        .join(Ticket, Ticket.id == Admission.ticket_id)
        .join(Order, Order.id == Ticket.order_id)
        .where(
            Admission.id.in_(ids),
            (Ticket.status != "valid") | (Order.status != "confirmed"),
        )
    )
    total = 0
    for admission_id in gone:
        total += await service.reverse_for_source(
            main, service.EVENTS_ADMISSION, str(admission_id)
        )
    return total
