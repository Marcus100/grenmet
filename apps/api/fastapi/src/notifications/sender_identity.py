"""The sender identity of business mail: a verified Reply-To and the display name.

A Reply-To is sent only when its address is the verified login email of an active
member of the business's organisation (people prove their mailbox at sign-in). The
member's account must be active and the organisation must not be suspended (issue
1640): a removed or suspended person's address is not offered as a reply address.
Any other address, including a contact typed into a profile, gets no Reply-To.
The display name ("<Business> via Barrels") is set by ``email.business_sender_name``.
"""

import logging
import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.models import User
from src.email import SenderIdentity, business_sender_name, safe_reply_to
from src.organisations.models import (
    Membership,
    MembershipStatus,
    OrganisationStatus,
    PlatformOrganisation,
)

logger = logging.getLogger(__name__)


async def verified_reply_to(
    session: AsyncSession, organisation_id: str | None, candidate: str | None
) -> str | None:
    """``candidate`` when it is the verified login email of an active member of
    ``organisation_id``, else None."""
    address = safe_reply_to(candidate)
    if address is None or not organisation_id:
        return None
    member = await session.scalar(
        select(User.id)
        .join(Membership, Membership.user_id == User.id)
        .join(
            PlatformOrganisation,
            PlatformOrganisation.id == Membership.organisation_id,
        )
        .where(
            Membership.organisation_id == organisation_id,
            Membership.status == MembershipStatus.ACTIVE.value,
            PlatformOrganisation.status == OrganisationStatus.ACTIVE.value,
            User.is_active.is_(True),
            User.email_verified_at.is_not(None),
            func.lower(User.email) == address.lower(),
        )
        .limit(1)
    )
    if member is None:
        logger.warning("Reply-To not sent: address is not a verified member's email")
        return None
    return address


async def business_identity(
    session: AsyncSession,
    organisation_id: str | uuid.UUID | None,
    business: str,
    contact_email: str | None,
) -> SenderIdentity:
    """The display name for ``business`` and a verified Reply-To (or None)."""
    reply_to = await verified_reply_to(
        session, str(organisation_id) if organisation_id else None, contact_email
    )
    return SenderIdentity(business_sender_name(business) or None, reply_to)
