"""The last owner of a self-created business leaves (ADR-0066 item 7).

Called from the account deletion (``auth.service``) before the account's memberships
end. For each business its own account created, where the deleting account is the
last active owner, it:

- closes online booking (``enabled`` off) and unlists it;
- renames the owner's provider "Staff" (``owner_provider_id``, when set);
- declines the pending requests when no active owner or admin is left to confirm
  them, with the usual mail;
- flags the business for staff (``owner_left_at``).

Existing bookings stay manageable by their customers. Nothing is deleted.
"""

import uuid
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.audit import service as audit_service
from src.organisations.models import (
    Membership,
    MembershipRole,
    MembershipStatus,
    PlatformOrganisation,
)

from . import studio
from .models import Booking, BookingProfile, BookingStatus, Provider

#: Shown to the customer in the decline mail.
DECLINE_REASON = "This business is no longer taking online bookings."
#: The provider name once its owner has left.
STAFF_PROVIDER_NAME = "Staff"
AUDIT_ENTITY = "booking_profile"

_CONFIRMERS = (MembershipRole.OWNER.value, MembershipRole.ADMIN.value)


async def on_owner_leaves(
    session: AsyncSession, *, user_id: uuid.UUID, now: datetime
) -> list[str]:
    """Handle every self-created business this account was the last owner of. Returns
    the organisation ids handled. Flushes; the caller owns the transaction."""
    owned = select(Membership.organisation_id).where(
        Membership.user_id == user_id,
        Membership.role == MembershipRole.OWNER.value,
        Membership.status == MembershipStatus.ACTIVE.value,
    )
    profiles = await session.scalars(
        select(BookingProfile)
        .join(
            PlatformOrganisation,
            PlatformOrganisation.id == BookingProfile.organisation_id,
        )
        .where(
            BookingProfile.organisation_id.in_(owned),
            PlatformOrganisation.created_by_user_id.is_not(None),
        )
        .order_by(BookingProfile.organisation_id)
        .with_for_update(of=BookingProfile)
    )
    handled: list[str] = []
    for profile in profiles.all():
        if await _has_other_active(
            session, profile.organisation_id, user_id, (MembershipRole.OWNER.value,)
        ):
            continue
        await _leave(session, profile, user_id=user_id, now=now)
        handled.append(profile.organisation_id)
    await session.flush()
    return handled


async def _has_other_active(
    session: AsyncSession,
    organisation_id: str,
    user_id: uuid.UUID,
    roles: tuple[str, ...],
) -> bool:
    found = await session.scalar(
        select(Membership.id)
        .where(
            Membership.organisation_id == organisation_id,
            Membership.user_id != user_id,
            Membership.role.in_(roles),
            Membership.status == MembershipStatus.ACTIVE.value,
        )
        .limit(1)
    )
    return found is not None


async def _leave(
    session: AsyncSession,
    profile: BookingProfile,
    *,
    user_id: uuid.UUID,
    now: datetime,
) -> None:
    organisation_id = profile.organisation_id
    changes: dict[str, tuple[object, object]] = {
        "enabled": (profile.enabled, False),
        "listed": (profile.listed, False),
        "owner_left_at": (None, now.isoformat()),
    }
    profile.enabled = False
    profile.listed = False
    profile.owner_left_at = now
    if profile.owner_provider_id is not None:
        provider = await session.get(Provider, profile.owner_provider_id)
        if provider is not None:
            changes["owner_provider_name"] = (provider.name, STAFF_PROVIDER_NAME)
            provider.name = STAFF_PROVIDER_NAME
    if not await _has_other_active(session, organisation_id, user_id, _CONFIRMERS):
        await _decline_pending(session, organisation_id, now=now)
    await audit_service.record_change(
        session,
        entity_type=AUDIT_ENTITY,
        entity_id=str(profile.id),
        record_type=AUDIT_ENTITY,
        record_id=str(profile.id),
        action="owner_left",
        changes=changes,
        organisation_id=organisation_id,
    )


async def _decline_pending(
    session: AsyncSession, organisation_id: str, *, now: datetime
) -> None:
    pending = await session.scalars(
        select(Booking.id)
        .where(
            Booking.organisation_id == organisation_id,
            Booking.status == BookingStatus.PENDING.value,
        )
        .order_by(Booking.starts_at, Booking.id)
    )
    for booking_id in pending.all():
        await studio.decline(
            session,
            organisation_id,
            booking_id,
            actor_user_id=None,
            reason=DECLINE_REASON,
            now=now,
            # The account deletion must not call the payment provider (slice 2 follow-up a).
            defer_refund=True,
        )
