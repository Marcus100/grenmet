"""Stamps for door admissions, saved in the admission's own transaction (ADR-0003).

Events and Rewards share one database, so the stamp is written with the admission
instead of by a sync job: both commit or neither does. ``credit_admission`` is
idempotent (rewards keeps one entry per programme and admission) and a no-op when
the organiser has no platform organisation or no active programme. A ticket that
later stops being valid (event cancelled, refund) reverses its admission's stamps
through ``reverse_for_tickets``, also in the caller's transaction. Neither commits.

Why inline and not ``rewards.service.emit_qualifying_action`` on the outbox: the
stamp must exist exactly when the admission does (ADR-0003), and the reversal is
inline too, so credit and reversal cannot cross in a queue. The price is that this
path does the outbox handler's checks itself (the account must still exist).
"""

import uuid
from collections.abc import Collection

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.models import User
from src.rewards import service as rewards_service
from src.rewards import sources

from .models import Admission, Listing, Organiser, Ticket


async def credit_admission(
    db: AsyncSession, *, admission: Admission, ticket: Ticket, listing: Listing
) -> int:
    """Credit the ticket holder for this admission. Returns entries created."""
    if ticket.user_id is None or await db.get(User, ticket.user_id) is None:
        return 0
    organisation_id = await db.scalar(
        select(Organiser.organisation_id).where(Organiser.id == listing.organiser_id)
    )
    if organisation_id is None:
        return 0
    created = await rewards_service.record_qualifying_action(
        db,
        source_type=sources.EVENTS_ADMISSION,
        source_id=str(admission.id),
        organisation_id=organisation_id,
        user_id=ticket.user_id,
    )
    return len(created)


async def reverse_for_tickets(
    db: AsyncSession, ticket_ids: Collection[uuid.UUID]
) -> int:
    """Reverse the stamps earned by these tickets' admissions. Returns entries reversed."""
    if not ticket_ids:
        return 0
    admission_ids = await db.scalars(
        select(Admission.id).where(Admission.ticket_id.in_(ticket_ids))
    )
    total = 0
    for admission_id in admission_ids.all():
        total += await rewards_service.reverse_for_source(
            db, sources.EVENTS_ADMISSION, str(admission_id)
        )
    return total
