"""Barrels staff review of a business's home page listing (ADR-0066 item 4).

Approve and withdraw need ``bookings.listing.approve``, are audited and refuse a
repeat with 409. Approval gates only the public home page list; the business's own
booking page works by its link either way (``service._open_for_listing``).
"""

import uuid
from typing import Any

from sqlalchemy import ColumnElement, Row, and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.audit import service as audit_service
from src.auth.models import User
from src.auth.policy import require_permission
from src.organisations.models import PlatformOrganisation
from src.pagination import PaginationParams
from src.utils.datetime import utc_now

from .exceptions import BookingConflictError, BookingNotFoundError
from .models import BookingProfile
from .schemas import (
    BookingListingNotShownReason,
    BookingListingQueue,
    BookingListingReview,
)
from .service import listing_conditions

LISTING_PERMISSION = "bookings.listing.approve"
AUDIT_ENTITY = "booking_profile"


def _condition_columns() -> list[ColumnElement[bool]]:
    """The home page conditions as selected columns, one per reason, so whether a
    business is shown is worked out in SQL with the public listing's own filters."""
    return [
        condition.label(reason) for reason, condition in listing_conditions().items()
    ]


def _not_shown(row: Row[Any]) -> list[BookingListingNotShownReason]:
    """The conditions ``row`` fails, in the order staff would fix them."""
    met = row._mapping
    return [reason for reason in BookingListingNotShownReason if not met[reason.value]]


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


async def _not_shown_now(
    session: AsyncSession, organisation_id: str
) -> list[BookingListingNotShownReason]:
    """Why this one business is not on the home page, read after any pending change
    is flushed."""
    row = (
        await session.execute(
            select(*_condition_columns()).where(
                BookingProfile.organisation_id == organisation_id
            )
        )
    ).one()
    return _not_shown(row)


def _review(
    profile: BookingProfile,
    organisation: PlatformOrganisation,
    not_shown: list[BookingListingNotShownReason],
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
        sender_name_flagged_at=profile.sender_name_flagged_at,
        on_home_page=not not_shown,
        not_shown_reasons=not_shown,
    )


async def get_review(
    session: AsyncSession, *, actor: User, organisation_id: str
) -> BookingListingReview:
    require_permission(current_user=actor, permission_key=LISTING_PERMISSION)
    profile, organisation = await _load(session, organisation_id)
    return _review(
        profile, organisation, await _not_shown_now(session, organisation_id)
    )


def _queue_filter(queue: BookingListingQueue) -> ColumnElement[bool] | None:
    if queue is BookingListingQueue.PENDING:
        return and_(
            BookingProfile.listed.is_(True),
            BookingProfile.listing_approved_at.is_(None),
        )
    if queue is BookingListingQueue.APPROVED:
        return BookingProfile.listing_approved_at.is_not(None)
    if queue is BookingListingQueue.FLAGGED:
        return or_(
            BookingProfile.owner_left_at.is_not(None),
            BookingProfile.sender_name_flagged_at.is_not(None),
        )
    return None


async def list_reviews(
    session: AsyncSession,
    *,
    actor: User,
    queue: BookingListingQueue,
    pagination: PaginationParams,
) -> tuple[list[BookingListingReview], int]:
    """One SQL page of listings for staff, oldest business first so the longest
    wait is at the top."""
    require_permission(current_user=actor, permission_key=LISTING_PERMISSION)
    columns = _condition_columns()
    query = select(BookingProfile, PlatformOrganisation, *columns).join(
        PlatformOrganisation,
        PlatformOrganisation.id == BookingProfile.organisation_id,
    )
    count = select(func.count(BookingProfile.id))
    condition = _queue_filter(queue)
    if condition is not None:
        query = query.where(condition)
        count = count.where(condition)
    total = await session.scalar(count)
    rows = (
        await session.execute(
            query.order_by(PlatformOrganisation.created_at, BookingProfile.id)
            .offset(pagination.skip)
            .limit(pagination.limit)
        )
    ).all()
    return [_review(row[0], row[1], _not_shown(row)) for row in rows], int(total or 0)


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
    return _review(
        profile, organisation, await _not_shown_now(session, organisation_id)
    )


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
    return _review(
        profile, organisation, await _not_shown_now(session, organisation_id)
    )


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
