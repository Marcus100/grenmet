"""``GET /bookings/me/organisations``: the studio's organisation picker."""

import uuid

import httpx
import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.models import User
from src.organisations import service as org_service
from src.organisations.models import (
    Membership,
    MembershipRole,
    MembershipStatus,
    OrganisationStatus,
    PlatformOrganisation,
)
from tests.bookings.test_app_token_access import _headers
from tests.events.roles import user_with_role
from tests.organisations.support import make_org

URL = "/api/v1/bookings/me/organisations"


async def _user(db: AsyncSession) -> User:
    return await user_with_role(db, "bookings-member")


async def _org(
    db: AsyncSession,
    user: User,
    role: MembershipRole = MembershipRole.MEMBER,
    apps: tuple[str, ...] = ("bookings",),
) -> PlatformOrganisation:
    return await make_org(
        db, f"Studio {uuid.uuid4().hex[:6]}", members=((user, role),), apps=apps
    )


@pytest.mark.parametrize("app", ["bookings", None])
async def test_lists_entitled_active_memberships_with_role(
    async_client: httpx.AsyncClient, db_async: AsyncSession, app: str | None
) -> None:
    user = await _user(db_async)
    owned = await _org(db_async, user, MembershipRole.OWNER)
    staff = await _org(db_async, user, MembershipRole.MEMBER)
    await _org(db_async, user, MembershipRole.ADMIN, apps=())
    other = await make_org(db_async, "Someone else", apps=("bookings",))
    resp = await async_client.get(URL, headers=_headers(user, None, app))
    assert resp.status_code == 200, resp.text
    body = {row["id"]: row for row in resp.json()}
    assert set(body) == {owned.id, staff.id}
    assert other.id not in body
    assert body[owned.id]["role"] == "owner"
    assert body[staff.id]["role"] == "member"
    assert set(body[owned.id]) == {"id", "name", "slug", "role"}
    assert body[owned.id]["slug"] == owned.slug


async def test_removed_and_suspended_are_excluded(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    user = await _user(db_async)
    kept = await _org(db_async, user)
    removed = await _org(db_async, user)
    suspended = await _org(db_async, user)
    membership = await db_async.get(
        Membership, await _membership_id(db_async, removed, user)
    )
    assert membership is not None
    membership.status = MembershipStatus.REMOVED.value
    suspended.status = OrganisationStatus.SUSPENDED.value
    await db_async.commit()
    resp = await async_client.get(URL, headers=_headers(user, None))
    assert [row["id"] for row in resp.json()] == [kept.id]


async def _membership_id(
    db: AsyncSession, org: PlatformOrganisation, user: User
) -> str:
    resolved = await org_service.resolve_membership(
        db, user_id=user.id, organisation_id=org.id
    )
    return resolved.membership.id


async def test_disabled_entitlement_is_excluded(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    user = await _user(db_async)
    org = await _org(db_async, user)
    await org_service.set_app_enabled(
        db_async, organisation_id=org.id, app_key="bookings", enabled=False
    )
    await db_async.commit()
    resp = await async_client.get(URL, headers=_headers(user, None))
    assert resp.json() == []


async def test_no_memberships_gives_an_empty_list(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    user = await _user(db_async)
    resp = await async_client.get(URL, headers=_headers(user, None))
    assert resp.status_code == 200
    assert resp.json() == []


@pytest.mark.parametrize("other_app", ["events", "gmsdash"])
async def test_other_apps_tokens_are_401(
    async_client: httpx.AsyncClient, db_async: AsyncSession, other_app: str
) -> None:
    user = await _user(db_async)
    await _org(db_async, user)
    resp = await async_client.get(URL, headers=_headers(user, None, other_app))
    assert resp.status_code == 401


async def test_unauthenticated_is_401(async_client: httpx.AsyncClient) -> None:
    assert (await async_client.get(URL)).status_code == 401
