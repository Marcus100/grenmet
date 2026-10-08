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

    from sqlalchemy import select

    from src.auth.models import Role, RoleAssignmentScope, User
    from src.auth.permissions import seed_permissions_and_roles_async
    from tests.factories import assign_role, make_department, make_employee, make_user

    me = await async_client.get(
        "/api/v1/auth/users/me", headers=normal_user_token_headers_async
    )
    uid = me.json()["id"]
    user = await db_async.get(User, uuid.UUID(uid))
    await seed_permissions_and_roles_async(db_async)
    department = await make_department(db_async)
    await make_employee(db_async, user=user, department_id=department.id)
    role = await db_async.scalar(select(Role).where(Role.name == "department-manager"))
    await assign_role(
        db_async,
        user=user,
        role=role,
        scope=RoleAssignmentScope.DEPARTMENT,
        department_id=department.id,
    )
    # Management routes cannot modify the caller's own account.
    result = await async_client.patch(
        f"/api/v1/auth/users/{uid}",
        headers=normal_user_token_headers_async,
        json={"first_name": "Manager"},
    )
    assert result.status_code == 403
    target = await make_user(db_async)
    await make_employee(db_async, user=target, department_id=department.id)
    # A manager can correct an ordinary colleague's profile in their own department.
    result = await async_client.patch(
        f"/api/v1/auth/users/{target.id}",
        headers=normal_user_token_headers_async,
        json={"first_name": "Colleague"},
    )
    assert result.status_code == 200, result.text
    result = await async_client.patch(
        f"/api/v1/auth/users/{target.id}",
        headers=normal_user_token_headers_async,
        json={"cms_access": "publisher"},
    )
    assert result.status_code == 403


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "is_admin, grant, permission",
    [
        (True, "none", "cms.article.manage"),
        (False, "publisher", "cms.article.manage"),
        (False, "writer", "cms.article.create"),
    ],
)
async def test_approved_legacy_staff_can_use_explicit_cms_access_without_email(
    async_client, db_async, monkeypatch, is_admin, grant, permission
):
    monkeypatch.setattr(auth_settings, "CMS_SSO_CLIENT_SECRET", "cms-test-secret")
    user = User(
        email="legacy-admin@example.com",
        username="legacy-admin",
        first_name="Legacy",
        last_name="Admin",
        hashed_password=get_password_hash("Password-123!"),
        is_superuser=is_admin,
        is_active=True,
        registration_pending=False,
        email_verification_required=False,
        email_verified_at=None,
        cms_access=grant,
    )
    db_async.add(user)
    await db_async.commit()
    assert service.is_staff_eligible(user)
    _, account = await service.create_session(
        session=db_async, user=user, app_name="auth", enforce_approval=False
    )
    state = secrets.token_urlsafe(24)
    started = await async_client.post(
        f"{BASE}/handoff", json={"session_token": account, "state": state}
    )
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
    identity = await async_client.get(
        f"{BASE}/me",
        headers={"Authorization": f"Bearer {redeemed.json()['access_token']}"},
    )
    assert identity.status_code == 200
    assert identity.json()["is_superuser"] is is_admin
    assert permission in identity.json()["permission_keys"]
