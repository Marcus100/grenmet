"""``/bookings/org/*`` accepts the bookings app session (issue #472, Option A).

Role, membership and entitlement checks are unchanged; only the credential set
widens, and only to the route family's own app."""

import uuid
from datetime import timedelta

import httpx
import pytest
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.config import auth_settings
from src.auth.models import User
from src.auth.utils import create_access_token
from src.dependencies import get_current_user
from src.organisations.models import MembershipRole, PlatformOrganisation
from tests.events.roles import user_with_role
from tests.organisations.support import make_org

SERVICES = "/api/v1/bookings/org/services"
PROFILE = "/api/v1/bookings/org/profile"
SETTINGS = "/api/v1/bookings/org/settings"
PROFILE_BODY = {"public_slug": "studio-one", "display_name": "Studio One"}
NEW_SERVICE = {"name": "Trim", "duration_min": 30, "price_minor": 1000}


def _token(user: User, app: str | None) -> str:
    return create_access_token(
        user.id,
        timedelta(minutes=auth_settings.ACCESS_TOKEN_EXPIRE_MINUTES),
        app=app,
    )


def _headers(
    user: User, org_id: str | None, app: str | None = "bookings"
) -> dict[str, str]:
    headers = {"Authorization": f"Bearer {_token(user, app)}"}
    if org_id is not None:
        headers["X-Barrels-Organisation"] = org_id
    return headers


async def _studio(
    db: AsyncSession, role: MembershipRole, apps: tuple[str, ...] = ("bookings",)
) -> tuple[User, PlatformOrganisation]:
    user = await user_with_role(db, "bookings-member")
    org = await make_org(
        db,
        f"Studio {uuid.uuid4().hex[:6]}",
        members=((user, role),),
        apps=apps,
    )
    return user, org


async def test_admin_bookings_token_reads_and_writes(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    user, org = await _studio(db_async, MembershipRole.ADMIN)
    headers = _headers(user, org.id)
    created = await async_client.post(SERVICES, headers=headers, json=NEW_SERVICE)
    assert created.status_code == 201, created.text
    listed = await async_client.get(SERVICES, headers=headers)
    assert listed.status_code == 200, listed.text
    assert [s["name"] for s in listed.json()] == ["Trim"]
    saved = await async_client.put(PROFILE, headers=headers, json=PROFILE_BODY)
    assert saved.status_code == 200, saved.text
    assert (await async_client.get(PROFILE, headers=headers)).status_code == 200
    assert (await async_client.get(SETTINGS, headers=headers)).status_code == 200


async def test_member_bookings_token_reads_but_cannot_write(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    user, org = await _studio(db_async, MembershipRole.MEMBER)
    headers = _headers(user, org.id)
    assert (await async_client.get(SERVICES, headers=headers)).status_code == 200
    denied = await async_client.post(SERVICES, headers=headers, json=NEW_SERVICE)
    assert denied.status_code == 403, denied.text
    # The admin-only `require_org_app` path (profile update) refuses it too.
    patched = await async_client.put(PROFILE, headers=headers, json=PROFILE_BODY)
    assert patched.status_code == 403, patched.text


async def test_non_member_is_404(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    _user, org = await _studio(db_async, MembershipRole.ADMIN)
    outsider = await user_with_role(db_async, "bookings-member")
    resp = await async_client.get(SERVICES, headers=_headers(outsider, org.id))
    assert resp.status_code == 404, resp.text
    patched = await async_client.put(
        PROFILE, headers=_headers(outsider, org.id), json=PROFILE_BODY
    )
    assert patched.status_code == 404, patched.text


async def test_missing_organisation_header_is_400(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    user, _org = await _studio(db_async, MembershipRole.ADMIN)
    resp = await async_client.get(SERVICES, headers=_headers(user, None))
    assert resp.status_code == 400, resp.text
    patched = await async_client.put(
        PROFILE, headers=_headers(user, None), json=PROFILE_BODY
    )
    assert patched.status_code == 400, patched.text


async def test_unentitled_organisation_is_403(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    user, org = await _studio(db_async, MembershipRole.ADMIN, apps=())
    resp = await async_client.get(SERVICES, headers=_headers(user, org.id))
    assert resp.status_code == 403, resp.text
    patched = await async_client.put(
        PROFILE, headers=_headers(user, org.id), json=PROFILE_BODY
    )
    assert patched.status_code == 403, patched.text


async def test_cross_organisation_id_is_404(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    user, org = await _studio(db_async, MembershipRole.ADMIN)
    other_user, other = await _studio(db_async, MembershipRole.ADMIN)
    created = await async_client.post(
        SERVICES, headers=_headers(user, org.id), json=NEW_SERVICE
    )
    assert created.status_code == 201, created.text
    resp = await async_client.patch(
        f"{SERVICES}/{created.json()['id']}",
        headers=_headers(other_user, other.id),
        json={"name": "Hijack"},
    )
    assert resp.status_code == 404, resp.text


@pytest.mark.parametrize("other_app", ["events", "gmsdash"])
async def test_other_apps_tokens_are_401(
    async_client: httpx.AsyncClient, db_async: AsyncSession, other_app: str
) -> None:
    user, org = await _studio(db_async, MembershipRole.ADMIN)
    headers = _headers(user, org.id, app=other_app)
    assert (await async_client.get(SERVICES, headers=headers)).status_code == 401
    assert (await async_client.get(SETTINGS, headers=headers)).status_code == 401
    posted = await async_client.post(SERVICES, headers=headers, json=NEW_SERVICE)
    assert posted.status_code == 401
    patched = await async_client.put(PROFILE, headers=headers, json=PROFILE_BODY)
    assert patched.status_code == 401


async def test_token_without_app_access_permission_is_401(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    user = await user_with_role(db_async, None)
    org = await make_org(
        db_async,
        f"NoAccess {uuid.uuid4().hex[:6]}",
        members=((user, MembershipRole.ADMIN),),
        apps=("bookings",),
    )
    resp = await async_client.get(SERVICES, headers=_headers(user, org.id))
    assert resp.status_code == 401, resp.text


async def test_bookings_token_is_refused_on_unopted_org_routes(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    user, org = await _studio(db_async, MembershipRole.ADMIN, ("bookings", "rewards"))
    headers = _headers(user, org.id)
    rewards = await async_client.get("/api/v1/rewards/org/leaderboard", headers=headers)
    assert rewards.status_code == 401, rewards.text
    keys = await async_client.get("/api/v1/organisations/org/api-keys", headers=headers)
    assert keys.status_code == 401, keys.text


async def test_account_token_still_works(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    user, org = await _studio(db_async, MembershipRole.ADMIN)
    headers = _headers(user, org.id, app=None)
    assert (await async_client.get(SERVICES, headers=headers)).status_code == 200
    created = await async_client.post(SERVICES, headers=headers, json=NEW_SERVICE)
    assert created.status_code == 201, created.text
    assert (
        await async_client.put(PROFILE, headers=headers, json=PROFILE_BODY)
    ).status_code == 200


async def test_get_current_user_still_refuses_bookings_token(
    db_async: AsyncSession,
) -> None:
    user, _org = await _studio(db_async, MembershipRole.ADMIN)
    with pytest.raises(HTTPException) as caught:
        await get_current_user(db_async, _token(user, "bookings"))
    assert caught.value.status_code == 401
