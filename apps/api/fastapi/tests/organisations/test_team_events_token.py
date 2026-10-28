"""Team routes accept an account token or an Events app token, nothing else."""

from datetime import timedelta

import httpx
import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.config import auth_settings
from src.auth.utils import create_access_token
from src.organisations import grants, service
from src.organisations.dependencies import OrgContext
from src.organisations.models import Membership, MembershipRole
from tests.events.roles import user_with_role
from tests.organisations.support import headers_for, make_org

API = "/api/v1/organisations"


def _app_headers(user, org_id: str, app: str) -> dict[str, str]:
    token = create_access_token(
        user.id,
        timedelta(minutes=auth_settings.ACCESS_TOKEN_EXPIRE_MINUTES),
        app=app,
    )
    return {"Authorization": f"Bearer {token}", "X-Barrels-Organisation": org_id}


async def _world(db: AsyncSession):
    owner = await user_with_role(db, "events-member")
    member = await user_with_role(db, "events-member")
    target = await user_with_role(db, "events-member")
    org = await make_org(
        db,
        "Venue",
        members=(
            (owner, MembershipRole.OWNER),
            (member, MembershipRole.MEMBER),
            (target, MembershipRole.MEMBER),
        ),
        apps=("events",),
    )
    row = (
        await db.execute(
            select(Membership).where(
                Membership.organisation_id == org.id, Membership.user_id == target.id
            )
        )
    ).scalar_one()
    return owner, member, target, org, row.id


def _reads(mid: str) -> list[str]:
    base = f"{API}/org"
    return [
        f"{base}/role-bundles",
        f"{base}/team/me",
        f"{base}/team/members",
        f"{base}/members/{mid}/grants",
        f"{base}/members/{mid}/issued-grants",
    ]


async def test_events_token_is_accepted_on_team_reads(
    async_client: httpx.AsyncClient, db_async: AsyncSession
):
    owner, _, _, org, mid = await _world(db_async)
    headers = _app_headers(owner, org.id, "events")
    for url in _reads(mid):
        response = await async_client.get(url, headers=headers)
        assert response.status_code == 200, (url, response.text)


async def test_events_token_grants_revokes_and_removes(
    async_client: httpx.AsyncClient, db_async: AsyncSession
):
    owner, _, _, org, mid = await _world(db_async)
    headers = _app_headers(owner, org.id, "events")
    created = await async_client.post(
        f"{API}/org/members/{mid}/grants",
        json={"role_key": "events-door"},
        headers=headers,
    )
    assert created.status_code == 201, created.text
    revoked = await async_client.post(
        f"{API}/org/grants/{created.json()['id']}/revoke", headers=headers
    )
    assert revoked.status_code == 200, revoked.text
    removed = await async_client.delete(
        f"{API}/{org.id}/members/{mid}", headers=headers
    )
    assert removed.status_code == 204, removed.text


async def test_other_apps_tokens_are_refused_on_team_routes(
    async_client: httpx.AsyncClient, db_async: AsyncSession
):
    owner, _, _, org, mid = await _world(db_async)
    headers = _app_headers(owner, org.id, "gms")
    for url in _reads(mid):
        response = await async_client.get(url, headers=headers)
        assert response.status_code == 401, (url, response.text)
    post = await async_client.post(
        f"{API}/org/members/{mid}/grants",
        json={"role_key": "events-door"},
        headers=headers,
    )
    assert post.status_code == 401
    delete = await async_client.delete(f"{API}/{org.id}/members/{mid}", headers=headers)
    assert delete.status_code == 401


async def test_account_token_still_works_on_team_routes(
    async_client: httpx.AsyncClient, db_async: AsyncSession
):
    owner, _, _, org, mid = await _world(db_async)
    for url in _reads(mid):
        response = await async_client.get(url, headers=headers_for(owner, org.id))
        assert response.status_code == 200, (url, response.text)


async def test_events_token_without_team_permission_is_refused(
    async_client: httpx.AsyncClient, db_async: AsyncSession
):
    _, member, _, org, mid = await _world(db_async)
    headers = _app_headers(member, org.id, "events")
    for url in (
        f"{API}/org/role-bundles",
        f"{API}/org/team/members",
        f"{API}/org/members/{mid}/grants",
        f"{API}/org/members/{mid}/issued-grants",
    ):
        response = await async_client.get(url, headers=headers)
        assert response.status_code == 403, (url, response.text)
    delete = await async_client.delete(f"{API}/{org.id}/members/{mid}", headers=headers)
    assert delete.status_code == 403


async def test_events_token_is_refused_on_other_organisation_routes(
    async_client: httpx.AsyncClient, db_async: AsyncSession
):
    owner, _, _, org, _ = await _world(db_async)
    response = await async_client.get(
        f"{API}/org/api-key-scopes", headers=_app_headers(owner, org.id, "events")
    )
    assert response.status_code == 401


@pytest.mark.parametrize("app", ["events", "gms"])
async def test_non_member_is_not_found_with_app_token(
    async_client: httpx.AsyncClient, db_async: AsyncSession, app: str
):
    _, _, _, org, _ = await _world(db_async)
    stranger = await user_with_role(db_async, "events-member")
    response = await async_client.get(
        f"{API}/org/team/me", headers=_app_headers(stranger, org.id, app)
    )
    assert response.status_code == (404 if app == "events" else 401)


async def _every_route(client, org, mid, headers, expected: int) -> None:
    for url in _reads(mid):
        response = await client.get(url, headers=headers)
        assert response.status_code == expected, (url, response.text)
    for call in (
        client.post(
            f"{API}/org/members/{mid}/grants",
            json={"role_key": "events-door"},
            headers=headers,
        ),
        client.post(f"{API}/org/grants/grant_x/revoke", headers=headers),
        client.delete(f"{API}/{org.id}/members/{mid}", headers=headers),
    ):
        response = await call
        assert response.status_code == expected, response.text


@pytest.mark.parametrize("apps", [("bookings",), ()])
async def test_events_token_needs_the_events_entitlement(
    async_client: httpx.AsyncClient, db_async: AsyncSession, apps: tuple[str, ...]
):
    owner = await user_with_role(db_async, "events-member")
    target = await user_with_role(db_async, "events-member")
    org = await make_org(
        db_async,
        "No events",
        members=((owner, MembershipRole.OWNER), (target, MembershipRole.MEMBER)),
        apps=apps,
    )
    mid = (
        await db_async.execute(
            select(Membership.id).where(
                Membership.organisation_id == org.id, Membership.user_id == target.id
            )
        )
    ).scalar_one()
    headers = _app_headers(owner, org.id, "events")
    await _every_route(async_client, org, mid, headers, 403)
    # The account token keeps its earlier behaviour (membership only).
    account = await async_client.get(
        f"{API}/org/team/me", headers=headers_for(owner, org.id)
    )
    assert account.status_code == 200


async def test_events_token_non_member_is_refused_on_every_route(
    async_client: httpx.AsyncClient, db_async: AsyncSession
):
    _, _, _, org, mid = await _world(db_async)
    stranger = await user_with_role(db_async, "events-member")
    await _every_route(
        async_client, org, mid, _app_headers(stranger, org.id, "events"), 404
    )


async def test_events_token_without_app_access_is_refused(
    async_client: httpx.AsyncClient, db_async: AsyncSession
):
    _, _, _, org, mid = await _world(db_async)
    no_access = await user_with_role(db_async, None)
    await service.add_member(
        db_async,
        organisation_id=org.id,
        user_id=no_access.id,
        role=MembershipRole.OWNER,
    )
    await db_async.commit()
    await _every_route(
        async_client, org, mid, _app_headers(no_access, org.id, "events"), 401
    )


async def test_delete_path_must_match_the_header_organisation(
    async_client: httpx.AsyncClient, db_async: AsyncSession
):
    owner, _, _, org, mid = await _world(db_async)
    response = await async_client.delete(
        f"{API}/org_other/members/{mid}", headers=_app_headers(owner, org.id, "events")
    )
    assert response.status_code == 404


async def test_team_manager_member_cannot_delete(
    async_client: httpx.AsyncClient, db_async: AsyncSession
):
    owner, member, _, org, mid = await _world(db_async)
    resolved = await service.resolve_membership(
        db_async, user_id=owner.id, organisation_id=org.id
    )
    context = OrgContext(
        organisation=resolved.organisation,
        membership=resolved.membership,
        user=owner,
    )
    member_mid = (
        await db_async.execute(
            select(Membership.id).where(
                Membership.organisation_id == org.id, Membership.user_id == member.id
            )
        )
    ).scalar_one()
    await grants.grant_role(
        db_async, context, membership_id=member_mid, role_key="events-team"
    )
    await db_async.commit()
    headers = _app_headers(member, org.id, "events")
    roster = await async_client.get(f"{API}/org/team/members", headers=headers)
    assert roster.status_code == 200, roster.text
    delete = await async_client.delete(f"{API}/{org.id}/members/{mid}", headers=headers)
    assert delete.status_code == 403


async def test_admin_cannot_remove_an_owner_through_events_token(
    async_client: httpx.AsyncClient, db_async: AsyncSession
):
    owner = await user_with_role(db_async, "events-member")
    admin = await user_with_role(db_async, "events-member")
    org = await make_org(
        db_async,
        "Venue 2",
        members=((owner, MembershipRole.OWNER), (admin, MembershipRole.ADMIN)),
        apps=("events",),
    )
    owner_mid = (
        await db_async.execute(
            select(Membership.id).where(
                Membership.organisation_id == org.id, Membership.user_id == owner.id
            )
        )
    ).scalar_one()
    response = await async_client.delete(
        f"{API}/{org.id}/members/{owner_mid}",
        headers=_app_headers(admin, org.id, "events"),
    )
    assert response.status_code == 403, response.text


async def test_gms_token_refused_on_revoke(
    async_client: httpx.AsyncClient, db_async: AsyncSession
):
    owner, _, _, org, _ = await _world(db_async)
    response = await async_client.post(
        f"{API}/org/grants/grant_x/revoke", headers=_app_headers(owner, org.id, "gms")
    )
    assert response.status_code == 401
