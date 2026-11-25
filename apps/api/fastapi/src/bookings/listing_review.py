"""Barrels staff review of a business's home page listing (ADR-0066 item 4).

Approve and withdraw need ``bookings.listing.approve``, are audited and refuse a
repeat with 409. Approval gates only the public home page list; the business's own
booking page works by its link either way (``service._open_for_listing``).
"""

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.audit import service as audit_service
from src.auth.models import User
from src.auth.policy import require_permission
from src.organisations.models import PlatformOrganisation
from src.utils.datetime import utc_now

from .exceptions import BookingConflictError, BookingNotFoundError
from .models import BookingProfile
from .schemas import BookingListingReview

LISTING_PERMISSION = "bookings.listing.approve"
AUDIT_ENTITY = "booking_profile"


async def _load(
    session: AsyncSession, organisation_id: str, *, lock: bool = False
) -> tuple[BookingProfile, PlatformOrganisation]:
    query = (
        select(BookingProfile, PlatformOrganisation)
        .join(
            PlatformOrganisation,
            PlatformOrganisation.id == BookingProfile.organisation_id,
        )
        .where(BookingProfile.organisation_id == organisation_id)
    )
    if lock:
        query = query.with_for_update(of=BookingProfile)
    row = (await session.execute(query)).one_or_none()
    if row is None:
        raise BookingNotFoundError("Business")
    profile, organisation = row
    return profile, organisation


def _review(
    profile: BookingProfile, organisation: PlatformOrganisation
) -> BookingListingReview:
    return BookingListingReview(
        organisation_id=profile.organisation_id,
        public_slug=profile.public_slug,
        display_name=profile.display_name,
        listed=profile.listed,
        listing_approved_at=profile.listing_approved_at,
        listing_approved_by_user_id=profile.listing_approved_by_user_id,
        self_created=organisation.created_by_user_id is not None,
        owner_left_at=profile.owner_left_at,
    )


async def get_review(
    session: AsyncSession, *, actor: User, organisation_id: str
) -> BookingListingReview:
    require_permission(current_user=actor, permission_key=LISTING_PERMISSION)
    profile, organisation = await _load(session, organisation_id)
    return _review(profile, organisation)


async def approve(
    session: AsyncSession, *, actor: User, organisation_id: str
) -> BookingListingReview:
    require_permission(current_user=actor, permission_key=LISTING_PERMISSION)
    profile, organisation = await _load(session, organisation_id, lock=True)
    if profile.listing_approved_at is not None:
        raise BookingConflictError("This listing is already approved")
    now = utc_now()
    changes: dict[str, tuple[object, object]] = {
        "listing_approved_at": (None, now.isoformat()),
        "listing_approved_by_user_id": (None, str(actor.id)),
    }
    profile.listing_approved_at = now
    profile.listing_approved_by_user_id = actor.id
    await _audit(session, actor, profile, "listing_approve", changes)
    await session.flush()
    return _review(profile, organisation)


async def withdraw(
    session: AsyncSession, *, actor: User, organisation_id: str
) -> BookingListingReview:
    require_permission(current_user=actor, permission_key=LISTING_PERMISSION)
    profile, organisation = await _load(session, organisation_id, lock=True)
    if profile.listing_approved_at is None:
        raise BookingConflictError("This listing is not approved")
    previous_at = profile.listing_approved_at.isoformat()
    previous_by: uuid.UUID | None = profile.listing_approved_by_user_id
    changes: dict[str, tuple[object, object]] = {
        "listing_approved_at": (previous_at, None),
        "listing_approved_by_user_id": (
            str(previous_by) if previous_by else None,
            None,
        ),
    }
    profile.listing_approved_at = None
    profile.listing_approved_by_user_id = None
    await _audit(session, actor, profile, "listing_withdraw", changes)
    await session.flush()
    return _review(profile, organisation)


async def _audit(
    session: AsyncSession,
    actor: User,
    profile: BookingProfile,
    action: str,
    changes: dict[str, tuple[object, object]],
) -> None:
    audit_service.set_actor(session, actor.id)
    await audit_service.record_change(
        session,
        entity_type=AUDIT_ENTITY,
        entity_id=str(profile.id),
        record_type=AUDIT_ENTITY,
        record_id=str(profile.id),
        action=action,
        changes=changes,
        organisation_id=profile.organisation_id,
    )
