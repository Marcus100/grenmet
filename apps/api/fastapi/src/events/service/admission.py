"""Door admission (E2): scan a ticket in, once, and print who is expected.

A scan carries the QR token or a typed code. The ticket row is locked
(``FOR UPDATE``) and ``admissions.ticket_id`` is unique, so two devices scanning
the same ticket cannot both succeed. A scan that repeats an earlier success with
the same ``idempotency_key`` replays that success; any other second scan is
refused with who admitted the ticket and when. Every admission also writes an
activity row on the listing, so the History panel shows door activity.
"""

import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.models import User
from src.utils.datetime import utc_now

from .. import activity, schemas, tickets
from ..exceptions import EventsConflict, EventsNotFound
from ..models import Admission, Listing, MemberProfile, Ticket, TicketTier
from .common import GRENADA
from .organiser_admin import _my_organiser


async def _door_listing(
    db: AsyncSession,
    user: User,
    listing_id: uuid.UUID,
    org_ids: list[str],
    slug: str | None,
) -> Listing:
    organiser = await _my_organiser(db, user, org_ids, slug)
    listing = await db.get(Listing, listing_id)
    if listing is None or listing.organiser_id != organiser.id:
        raise EventsNotFound("Event not found")
    return listing


async def _names(db: AsyncSession, user_ids: set[uuid.UUID]) -> dict[uuid.UUID, str]:
    if not user_ids:
        return {}
    rows = await db.execute(
        select(MemberProfile.user_id, MemberProfile.display_name).where(
            MemberProfile.user_id.in_(user_ids)
        )
    )
    return {row[0]: row[1] for row in rows.all()}


def _grenada_clock(moment: datetime) -> str:
    return moment.replace(tzinfo=UTC).astimezone(GRENADA).strftime("%H:%M")


def _result(
    ticket: Ticket,
    tier_name: str,
    admission: Admission,
    names: dict[uuid.UUID, str],
    *,
    repeat: bool,
) -> schemas.AdmissionPublic:
    return schemas.AdmissionPublic(
        ticket_id=ticket.id,
        code=tickets.display_code(ticket.code),
        tier_name=tier_name,
        holder_name=names.get(ticket.user_id),
        admitted_at=admission.admitted_at,
        admitted_by_name=names.get(admission.admitted_by),
        repeat=repeat,
    )


async def admit_ticket(
    db: AsyncSession,
    user: User,
    listing_id: uuid.UUID,
    body: schemas.AdmissionCreate,
    org_ids: list[str],
    slug: str | None = None,
) -> schemas.AdmissionPublic:
    listing = await _door_listing(db, user, listing_id, org_ids, slug)
    scanned_token = body.code.strip().startswith("BT1.")
    code = tickets.code_from_scan(body.code)
    ticket = await db.scalar(
        select(Ticket).where(Ticket.code == code).with_for_update()
    )
    if ticket is None:
        raise EventsNotFound("No ticket has that code")
    if ticket.listing_id != listing.id:
        raise EventsConflict("This ticket is for a different event")
    if ticket.status != "valid":
        raise EventsConflict("This ticket was cancelled")
    tier = await db.get(TicketTier, ticket.tier_id)
    assert tier is not None
    existing = await db.scalar(
        select(Admission).where(Admission.ticket_id == ticket.id)
    )
    if existing is not None:
        names = await _names(db, {ticket.user_id, existing.admitted_by})
        if (
            body.idempotency_key is not None
            and existing.idempotency_key == body.idempotency_key
        ):
            return _result(ticket, tier.name, existing, names, repeat=True)
        who = names.get(existing.admitted_by, "door staff")
        raise EventsConflict(
            f"Already admitted at {_grenada_clock(existing.admitted_at)} by {who}"
        )
    admission = Admission(
        ticket_id=ticket.id,
        listing_id=listing.id,
        admitted_by=user.id,
        method="qr" if scanned_token else "code",
        idempotency_key=body.idempotency_key,
    )
    db.add(admission)
    try:
        await db.flush()
    except IntegrityError:
        await db.rollback()
        raise EventsConflict(
            "This ticket was just admitted on another device"
        ) from None
    activity.record(
        db,
        actor_id=user.id,
        action="ticket.admitted",
        entity_type="listing",
        entity_id=str(listing.id),
        organiser_id=listing.organiser_id,
        summary={
            "ticket_id": str(ticket.id),
            "tier": tier.name,
            "method": admission.method,
        },
    )
    await db.commit()
    names = await _names(db, {ticket.user_id, user.id})
    return _result(ticket, tier.name, admission, names, repeat=False)


async def manifest(
    db: AsyncSession,
    user: User,
    listing_id: uuid.UUID,
    org_ids: list[str],
    slug: str | None = None,
) -> schemas.Manifest:
    listing = await _door_listing(db, user, listing_id, org_ids, slug)
    rows: list[Any] = list(
        (
            await db.execute(
                select(Ticket, TicketTier.name, Admission.admitted_at)
                .join(TicketTier, TicketTier.id == Ticket.tier_id)
                .outerjoin(Admission, Admission.ticket_id == Ticket.id)
                .where(Ticket.listing_id == listing.id, Ticket.status == "valid")
            )
        ).all()
    )
    cancelled = int(
        await db.scalar(
            select(func.count())
            .select_from(Ticket)
            .where(Ticket.listing_id == listing.id, Ticket.status == "cancelled")
        )
        or 0
    )
    names = await _names(db, {row[0].user_id for row in rows})
    entries = sorted(
        (
            schemas.ManifestRow(
                ticket_id=row[0].id,
                code=tickets.display_code(row[0].code),
                holder_name=names.get(row[0].user_id),
                tier_name=row[1],
                admitted_at=row[2],
            )
            for row in rows
        ),
        key=lambda entry: ((entry.holder_name or "~").lower(), entry.code),
    )
    admitted = sum(1 for entry in entries if entry.admitted_at is not None)
    return schemas.Manifest(
        listing_id=listing.id,
        title=listing.title,
        starts_at=listing.starts_at,
        generated_at=utc_now(),
        issued=len(entries),
        admitted=admitted,
        waiting=len(entries) - admitted,
        cancelled=cancelled,
        rows=entries,
    )
