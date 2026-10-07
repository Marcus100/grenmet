"""Explicit CMS access must never grant staff access or survive revocation."""

import secrets

import pytest

from src.auth import service
from src.auth.config import auth_settings
from src.auth.models import User
from src.auth.utils import get_password_hash
from src.utils.datetime import utc_now

BASE = "/api/v1/auth/apps/cms"


@pytest.mark.asyncio
async def test_cms_grant_downgrade_revoke_and_staff_isolation(
    async_client, db_async, superuser_token_headers_async, monkeypatch
):
    monkeypatch.setattr(auth_settings, "CMS_SSO_CLIENT_SECRET", "cms-test-secret")
    user = User(
        email="cms-writer@example.com",
        username="cms-writer",
        first_name="CMS",
        last_name="Writer",
        hashed_password=get_password_hash("Password-123!"),
        registration_pending=True,
        email_verified_at=utc_now(),
    )
    db_async.add(user)
    await db_async.commit()
    _, account = await service.create_session(
        session=db_async, user=user, app_name="auth", enforce_approval=False
    )

    async def start():
        return await async_client.post(
            f"{BASE}/handoff", json={"session_token": account, "state": state}
        )

    async def grant(level):
        result = await async_client.patch(
            f"/api/v1/auth/users/{user.id}",
            headers=superuser_token_headers_async,
            json={"cms_access": level},
        )
        assert result.status_code == 200, result.text
        assert result.json()["registration_pending"] is True

    async def login():
        started = await start()
        assert started.status_code == 200, started.text
        redeemed = await async_client.post(
            f"{BASE}/handoff/redeem",
            json={
                "code": started.json()["code"],
                "state": state,
                "client_secret": "cms-test-secret",
            },
        )
        assert redeemed.status_code == 200, redeemed.text
        data = redeemed.json()
        return data, {"Authorization": f"Bearer {data['access_token']}"}

    state = secrets.token_urlsafe(24)
    assert (await start()).status_code == 403
    await grant("publisher")
    old, headers = await login()
    identity = await async_client.get(f"{BASE}/me", headers=headers)
    assert identity.status_code == 200
    assert "cms.homepage.manage" in identity.json()["permission_keys"]
    assert "cms.publish.stories" in identity.json()["permission_keys"]
    for path in [
        "/api/v1/auth/users",
        "/api/v1/hr/profile/me",
        "/api/v1/auth/apps/events/me",
    ]:
        assert (await async_client.get(path, headers=headers)).status_code in {401, 403}
    await grant("writer")
    assert (
        await async_client.post(
            "/api/v1/login/session/access-token",
            json={"session_token": old["session_token"]},
        )
    ).status_code == 401
    # Already-issued JWTs also see the new reduced permissions immediately.
    identity = await async_client.get(f"{BASE}/me", headers=headers)
    assert set(identity.json()["permission_keys"]) == {
        "cms.article.create",
        "cms.article.edit.own",
        "cms.article.submit",
    }
    _, headers = await login()
    await grant("none")
    assert (await start()).status_code == 403
    assert (await async_client.get(f"{BASE}/me", headers=headers)).status_code == 401


@pytest.mark.asyncio
async def test_non_admin_cannot_grant_cms(
    async_client, normal_user_token_headers_async
):
    me = await async_client.get(
        "/api/v1/auth/users/me", headers=normal_user_token_headers_async
    )
    result = await async_client.patch(
        f"/api/v1/auth/users/{me.json()['id']}",
        headers=normal_user_token_headers_async,
        json={"cms_access": "publisher"},
    )
    assert result.status_code == 403


@pytest.mark.asyncio
async def test_user_manager_cannot_grant_cms(
    async_client, db_async, normal_user_token_headers_async
):
    import uuid

    from src.auth.models import UserRoleLink
    from tests.factories import make_role_with_permission

    me = await async_client.get(
        "/api/v1/auth/users/me", headers=normal_user_token_headers_async
    )
    uid = me.json()["id"]
    role, _ = await make_role_with_permission(db_async, "user.manage")
    db_async.add(UserRoleLink(user_id=uuid.UUID(uid), role_id=role.id))
    await db_async.commit()
    # Prove this caller has ordinary user-management authority.
    result = await async_client.patch(
        f"/api/v1/auth/users/{uid}",
        headers=normal_user_token_headers_async,
        json={"first_name": "Manager"},
    )
    assert result.status_code == 200, result.text
    result = await async_client.patch(
        f"/api/v1/auth/users/{uid}",
        headers=normal_user_token_headers_async,
        json={"cms_access": "publisher"},
    )
    assert result.status_code == 403
