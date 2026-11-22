"""A Reply-To needs an active member of an active organisation (issue 1640).

The verified login email of a removed, deactivated or suspended person is not
offered as a reply address, and a plain contact typed into a profile never is.
"""

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from src.notifications import sender_identity
from src.organisations.models import MembershipRole, OrganisationStatus
from tests.factories import make_user
from tests.organisations.support import make_org


async def _member_org(
    db: AsyncSession, token: str, role: MembershipRole = MembershipRole.ADMIN
):
    user = await make_user(db, email=f"owner-{token}@example.com")
    org = await make_org(db, f"Studio {token}", members=((user, role),))
    await db.commit()
    return user, org


@pytest.mark.usefixtures("db_async")
async def test_an_active_verified_member_of_an_active_org_is_kept(
    db_async: AsyncSession,
) -> None:
    user, org = await _member_org(db_async, "ok")
    address = await sender_identity.verified_reply_to(db_async, org.id, user.email)
    assert address == user.email


@pytest.mark.usefixtures("db_async")
async def test_a_deactivated_member_is_not_a_reply_to(db_async: AsyncSession) -> None:
    user, org = await _member_org(db_async, "inactive")
    user.is_active = False
    await db_async.commit()
    assert (
        await sender_identity.verified_reply_to(db_async, org.id, user.email)
    ) is None


@pytest.mark.usefixtures("db_async")
async def test_a_suspended_organisation_gives_no_reply_to(
    db_async: AsyncSession,
) -> None:
    user, org = await _member_org(db_async, "suspended")
    org.status = OrganisationStatus.SUSPENDED.value
    await db_async.commit()
    assert (
        await sender_identity.verified_reply_to(db_async, org.id, user.email)
    ) is None


@pytest.mark.usefixtures("db_async")
async def test_an_unverified_member_gives_no_reply_to(db_async: AsyncSession) -> None:
    user, org = await _member_org(db_async, "unverified", MembershipRole.MEMBER)
    user.email_verified_at = None
    await db_async.commit()
    assert (
        await sender_identity.verified_reply_to(db_async, org.id, user.email)
    ) is None
