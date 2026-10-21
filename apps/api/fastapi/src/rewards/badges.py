"""Trust signals (U4), derived from records on every read.

There is no table of badges and no write path: a badge cannot be bought, given
or transferred, only earned by the underlying record existing. Each badge says
whether its source is available; Events shares the main database, so the
attendee and purchaser badges are always readable.
"""

import uuid
from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.events.models import Admission, Order, Ticket
from src.organisations.models import (
    Membership,
    MembershipStatus,
    OrganisationStatus,
    PlatformOrganisation,
)

from .schemas import BadgeKey, BadgePublic

_LABELS = {
    BadgeKey.VERIFIED_ORGANISER: (
        "Verified organiser",
        "You act for an organisation Barrels has verified.",
    ),
    BadgeKey.VERIFIED_ATTENDEE: (
        "Verified attendee",
        "You have been admitted at the door of a real event.",
    ),
    BadgeKey.VERIFIED_PURCHASER: (
        "Verified purchaser",
        "You have completed a paid order.",
    ),
}


def _badge(
    key: BadgeKey,
    *,
    earned: bool,
    available: bool,
    count: int,
    since: datetime | None,
) -> BadgePublic:
    label, description = _LABELS[key]
    return BadgePublic(
        key=key,
        label=label,
        description=description,
        earned=earned,
        available=available,
        count=count,
        since=since,
    )


async def badges_for(session: AsyncSession, user_id: uuid.UUID) -> list[BadgePublic]:
    organisers = (
        await session.execute(
            select(func.count(), func.min(PlatformOrganisation.verified_at))
            .select_from(Membership)
            .join(
                PlatformOrganisation,
                PlatformOrganisation.id == Membership.organisation_id,
            )
            .where(
                Membership.user_id == user_id,
                Membership.status == MembershipStatus.ACTIVE.value,
                PlatformOrganisation.verified_at.is_not(None),
                PlatformOrganisation.status == OrganisationStatus.ACTIVE.value,
            )
        )
    ).one()
    result = [
        _badge(
            BadgeKey.VERIFIED_ORGANISER,
            earned=organisers[0] > 0,
            available=True,
            count=organisers[0],
            since=organisers[1],
        )
    ]
    attended = (
        await session.execute(
            select(func.count(), func.min(Admission.admitted_at))
            .select_from(Admission)
            .join(Ticket, Ticket.id == Admission.ticket_id)
            .where(Ticket.user_id == user_id)
        )
    ).one()
    paid = (
        await session.execute(
            select(func.count(), func.min(Order.created_at)).where(
                Order.user_id == user_id,
                Order.status == "confirmed",
                Order.total_minor > 0,
            )
        )
    ).one()
    return result + [
        _badge(
            BadgeKey.VERIFIED_ATTENDEE,
            earned=attended[0] > 0,
            available=True,
            count=attended[0],
            since=attended[1],
        ),
        _badge(
            BadgeKey.VERIFIED_PURCHASER,
            earned=paid[0] > 0,
            available=True,
            count=paid[0],
            since=paid[1],
        ),
    ]
