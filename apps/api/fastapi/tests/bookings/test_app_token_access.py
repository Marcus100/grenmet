"""``/bookings/org/*`` accepts the bookings app session (issue #472, Option A).

Role, membership and entitlement checks are unchanged; only the credential set
widens, and only to the route family's own app."""

import uuid
from datetime import UTC, datetime, timedelta

import httpx
import jwt
import pytest
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.audit.models import AuditEntry
from src.auth.config import auth_settings
from src.auth.models import User
from src.auth.utils import create_access_token
from src.dependencies import get_current_user
from src.organisations import service as org_service
from src.organisations.models import (
    Membership,
    MembershipRole,
    MembershipStatus,
    OrganisationStatus,
    PlatformOrganisation,
)
from tests.bookings.test_public_bookings import Studio, _slots
from tests.bookings.test_public_bookings import _studio as _public_studio
from tests.bookings.test_studio import _events
from tests.bookings.test_studio_create import _create
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


# --- org_or_key write paths, audit attribution and credential edge cases ----------------


async def _staffed_studio(
    db: AsyncSession,
    client: httpx.AsyncClient,
    role: MembershipRole,
    apps: tuple[str, ...] = ("bookings",),
) -> tuple[Studio, User]:
    studio = await _public_studio(db, client, apps=apps)
    user = await user_with_role(db, "bookings-member")
    await org_service.add_member(
        db, organisation_id=studio.org_id, user_id=user.id, role=role
    )
    await db.commit()
    return studio, user


async def test_admin_token_creates_a_booking_attributed_to_the_user(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    studio, user = await _staffed_studio(
        db_async, async_client, MembershipRole.ADMIN, ("bookings", "contacts")
    )
    slot = (await _slots(async_client, studio))[0]
    before = set(
        await db_async.scalars(
            select(AuditEntry.id).where(AuditEntry.organisation_id == studio.org_id)
        )
    )
    created = await _create(
        async_client,
        studio,
        slot,
        headers=_headers(user, studio.org_id),
        customer_email="audited@example.com",
    )
    assert created.status_code == 201, created.text
    events = await _events(db_async, created.json()["id"])
    assert events[0].actor_user_id == user.id
    entries = (
        await db_async.scalars(
            select(AuditEntry)
            .where(AuditEntry.organisation_id == studio.org_id)
            .execution_options(populate_existing=True)
        )
    ).all()
    new = [e for e in entries if e.id not in before]
    assert new
    assert {e.actor_user_id for e in new} == {user.id}


async def test_member_token_cannot_create_or_reorder(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    studio, user = await _staffed_studio(db_async, async_client, MembershipRole.MEMBER)
    headers = _headers(user, studio.org_id)
    slot = (await _slots(async_client, studio))[0]
    created = await _create(async_client, studio, slot, headers=headers)
    assert created.status_code == 403, created.text
    reorder = await async_client.put(
        f"{SERVICES}/order", headers=headers, json={"ids": [studio.service_id]}
    )
    assert reorder.status_code == 403, reorder.text


async def test_admin_token_reorders_services(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    studio, user = await _staffed_studio(db_async, async_client, MembershipRole.ADMIN)
    reorder = await async_client.put(
        f"{SERVICES}/order",
        headers=_headers(user, studio.org_id),
        json={"ids": [studio.service_id]},
    )
    assert reorder.status_code == 200, reorder.text


@pytest.mark.parametrize("other_app", ["events", "gmsdash"])
async def test_other_apps_tokens_cannot_create_or_reorder(
    async_client: httpx.AsyncClient, db_async: AsyncSession, other_app: str
) -> None:
    studio, user = await _staffed_studio(db_async, async_client, MembershipRole.ADMIN)
    headers = _headers(user, studio.org_id, app=other_app)
    slot = (await _slots(async_client, studio))[0]
    created = await _create(async_client, studio, slot, headers=headers)
    assert created.status_code == 401, created.text
    reorder = await async_client.put(
        f"{SERVICES}/order", headers=headers, json={"ids": [studio.service_id]}
    )
    assert reorder.status_code == 401, reorder.text


async def test_bookings_token_is_refused_on_unopted_org_or_key_route(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    user, org = await _studio(db_async, MembershipRole.ADMIN, ("bookings", "rewards"))
    resp = await async_client.get(
        "/api/v1/rewards/programs", headers=_headers(user, org.id)
    )
    assert resp.status_code == 401, resp.text


@pytest.mark.parametrize("path", [SERVICES, PROFILE])
async def test_non_member_of_an_unentitled_organisation_is_404(
    async_client: httpx.AsyncClient, db_async: AsyncSession, path: str
) -> None:
    _user, org = await _studio(db_async, MembershipRole.ADMIN, apps=())
    outsider = await user_with_role(db_async, "bookings-member")
    resp = await async_client.get(path, headers=_headers(outsider, org.id))
    assert resp.status_code == 404, resp.text


async def test_inactive_user_with_a_bookings_token_is_401(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    user, org = await _studio(db_async, MembershipRole.ADMIN)
    user.is_active = False
    await db_async.commit()
    for path in (SERVICES, PROFILE):
        resp = await async_client.get(path, headers=_headers(user, org.id))
        assert resp.status_code == 401, resp.text


async def test_removed_membership_is_404_and_suspended_organisation_is_403(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    user, org = await _studio(db_async, MembershipRole.ADMIN)
    headers = _headers(user, org.id)
    org.status = OrganisationStatus.SUSPENDED.value
    await db_async.commit()
    assert (await async_client.get(SERVICES, headers=headers)).status_code == 403
    org.status = OrganisationStatus.ACTIVE.value
    membership = await db_async.scalar(
        select(Membership).where(Membership.organisation_id == org.id)
    )
    assert membership is not None
    membership.status = MembershipStatus.REMOVED.value
    await db_async.commit()
    assert (await async_client.get(SERVICES, headers=headers)).status_code == 404


def _forged(user: User, **kwargs: object) -> dict[str, object]:
    claims = {
        "sub": str(user.id),
        "exp": datetime.now(UTC) + timedelta(minutes=5),
        "app": "bookings",
    }
    claims.update(kwargs)
    return claims


@pytest.mark.parametrize("kind", ["wrong-key", "alg-swap", "alg-none", "bad-app"])
async def test_forged_tokens_are_401(
    async_client: httpx.AsyncClient, db_async: AsyncSession, kind: str
) -> None:
    user, org = await _studio(db_async, MembershipRole.ADMIN)
    key = auth_settings.SECRET_KEY
    claims = _forged(user)
    if kind == "wrong-key":
        token = jwt.encode(claims, "not-the-secret-key-not-the-secret-key", "HS256")
    elif kind == "alg-swap":
        token = jwt.encode(claims, key, "HS384")
    elif kind == "alg-none":
        token = jwt.encode(claims, "", "none")
    else:
        token = jwt.encode(_forged(user, app="bookings-evil"), key, "HS256")
    headers = {
        "Authorization": f"Bearer {token}",
        "X-Barrels-Organisation": org.id,
    }
    for path in (SERVICES, PROFILE):
        resp = await async_client.get(path, headers=headers)
        assert resp.status_code == 401, resp.text


async def test_api_key_still_works_on_a_session_app_route(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    studio = await _public_studio(db_async, async_client)
    made = await async_client.post(
        "/api/v1/organisations/org/api-keys",
        headers=studio.headers,
        json={"name": "Kiosk", "scopes": ["bookings.read"]},
    )
    assert made.status_code == 201, made.text
    resp = await async_client.get(
        SERVICES, headers={"Authorization": f"Bearer {made.json()['secret']}"}
    )
    assert resp.status_code == 200, resp.text
