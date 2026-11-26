"""Slice 2 follow-up (c): a second owner who has deleted their account is not counted as
an active owner when the creator leaves.
"""

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth import service as auth_service
from src.auth.models import User
from src.bookings.models import BookingProfile
from src.organisations import service as organisation_service
from src.organisations.models import MembershipRole
from tests.bookings.test_owner_leaves import _owner, _self_created
from tests.factories import make_user


async def _profile(db: AsyncSession, org_id: str) -> BookingProfile:
    db.expire_all()
    profile = await db.scalar(
        select(BookingProfile).where(BookingProfile.organisation_id == org_id)
    )
    assert profile is not None
    return profile


async def test_a_deleted_second_owner_is_not_counted_as_an_active_owner(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio, _, _ = await _self_created(db_async, async_client)
    creator: User = await _owner(db_async, studio.org_id)
    second = await make_user(db_async)
    await organisation_service.add_member(
        db_async,
        organisation_id=studio.org_id,
        user_id=second.id,
        role=MembershipRole.OWNER,
    )
    await db_async.commit()

    # The second owner leaves first: the creator is still the active owner.
    await auth_service.delete_user(session=db_async, user=second)
    await db_async.commit()
    assert (await _profile(db_async, studio.org_id)).owner_left_at is None

    # Now the creator leaves: nobody else is an active owner, so the business is flagged.
    await db_async.refresh(creator)
    await auth_service.delete_user(session=db_async, user=creator)
    await db_async.commit()
    assert (await _profile(db_async, studio.org_id)).owner_left_at is not None
