"""Real database tests for administrator-mediated activation and app isolation."""

import uuid
from datetime import timedelta
from urllib.parse import parse_qs, urlparse

import pytest
from sqlalchemy import select

from src.audit.models import AuditEntry
from src.auth import modern_service, service
from src.auth.models import User
from src.auth.modern_models import AuthChallenge
from src.auth.utils import create_access_token, get_password_hash, verify_password_async
from src.utils.datetime import utc_now

BASE = "/api/v1/auth/onboarding"
PASSWORD = "My-new-password-123!"


def token_from(response):
    assert response.status_code == 201, response.text
    return parse_qs(urlparse(response.json()["activation_url"]).fragment)["token"][0]


async def new_account(client, headers):
    key = uuid.uuid4().hex
    result = await client.post(
        f"{BASE}/accounts",
        headers=headers,
        json={
            "email": f"{key}@example.com",
            "username": key,
            "first_name": "Staff",
            "last_name": "Member",
        },
    )
    assert result.status_code == 201, result.text
    return result.json()["id"]


@pytest.mark.asyncio
async def test_activation_without_email_preserves_grants_and_records_audit(
    async_client, db_async, superuser_token_headers_async
):
    uid = await new_account(async_client, superuser_token_headers_async)
    headers = superuser_token_headers_async
    state = await async_client.get(f"{BASE}/{uid}", headers=headers)
    assert "password_setup" in state.json()["apps"][0]["blockers"]
    issued = await async_client.post(
        f"{BASE}/{uid}/activation", headers=headers, json={"identity_confirmed": True}
    )
    token = token_from(issued)
    assert issued.headers["cache-control"] == "no-store"
    challenge = await db_async.get(AuthChallenge, modern_service.digest(token))
    assert challenge is not None and challenge.token_hash != token
    response = await async_client.post(
        f"{BASE}/activate", json={"token": token, "new_password": PASSWORD}
    )
    assert response.status_code == 200, response.text
    db_async.expire_all()
    user = await db_async.get(User, uuid.UUID(uid))
    assert user.email_verified_at is None
    assert user.email_verification_required is False
    assert user.password_setup_pending is False
    assert await verify_password_async(PASSWORD, user.hashed_password)
    assert user.cms_access == "none" and not user.is_superuser
    assert service.is_staff_eligible(user)
    assert not await service.is_eligible_for_app(
        session=db_async, user=user, app_key="cms"
    )
    await async_client.patch(
        f"/api/v1/auth/users/{uid}", headers=headers, json={"cms_access": "writer"}
    )
    state = await async_client.get(f"{BASE}/{uid}", headers=headers)
    assert state.json()["apps"][1]["available"] is True
    login = await async_client.post(
        "/api/v1/login/session", json={"email": user.email, "password": PASSWORD}
    )
    assert login.status_code == 200, login.text
    replay = await async_client.post(
        f"{BASE}/activate", json={"token": token, "new_password": PASSWORD}
    )
    assert replay.status_code == 400
    entries = (
        await db_async.scalars(
            select(AuditEntry).where(
                AuditEntry.entity_type == "account", AuditEntry.entity_id == uid
            )
        )
    ).all()
    assert {row.action for row in entries} == {"created", "issued", "activated"}
    assert all(
        token not in str(row.changes) and PASSWORD not in str(row.changes)
        for row in entries
    )
    assert (
        await async_client.get(f"/api/v1/audit/account/{uid}", headers=headers)
    ).status_code == 200


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "failure",
    [
        "expired",
        "replaced",
        "revoked",
        "inactive",
        "email_changed",
        "password_changed",
        "issuer_demoted",
    ],
)
async def test_invalid_activation_cannot_change_credentials(
    async_client, db_async, superuser_token_headers_async, failure
):
    headers = superuser_token_headers_async
    uid = await new_account(async_client, headers)
    token = token_from(
        await async_client.post(
            f"{BASE}/{uid}/activation",
            headers=headers,
            json={"identity_confirmed": True},
        )
    )
    user = await db_async.get(User, uuid.UUID(uid))
    original_hash = user.hashed_password
    if failure == "expired":
        challenge = await db_async.get(AuthChallenge, modern_service.digest(token))
        challenge.expires_at = utc_now() - timedelta(seconds=1)
    elif failure == "replaced":
        token_from(
            await async_client.post(
                f"{BASE}/{uid}/activation",
                headers=headers,
                json={"identity_confirmed": True},
            )
        )
    elif failure == "revoked":
        assert (
            await async_client.delete(f"{BASE}/{uid}/activation", headers=headers)
        ).status_code == 204
    elif failure == "inactive":
        user.is_active = False
    elif failure == "email_changed":
        user.email = "changed@example.com"
    elif failure == "password_changed":
        original_hash = user.hashed_password = get_password_hash(
            "Different-password-123!"
        )
    else:
        challenge = await db_async.get(AuthChallenge, modern_service.digest(token))
        issuer = await db_async.get(User, uuid.UUID(challenge.data["actor_id"]))
        issuer.is_superuser = False
    await db_async.commit()
    response = await async_client.post(
        f"{BASE}/activate", json={"token": token, "new_password": PASSWORD}
    )
    assert response.status_code == 400, response.text
    db_async.expire_all()
    user = await db_async.get(User, uuid.UUID(uid))
    assert user.hashed_password == original_hash
    assert user.password_setup_pending


@pytest.mark.asyncio
async def test_only_superuser_can_issue_and_identity_confirmation_is_required(
    async_client, db_async, superuser_token_headers_async
):
    uid = await new_account(async_client, superuser_token_headers_async)
    user = User(
        email="ordinary@example.com",
        username="ordinary",
        first_name="Ordinary",
        last_name="Staff",
        hashed_password=get_password_hash(PASSWORD),
        email_verified_at=utc_now(),
    )
    db_async.add(user)
    await db_async.commit()
    headers = {
        "Authorization": f"Bearer {create_access_token(user.id, timedelta(minutes=5))}"
    }
    assert (await async_client.get(f"{BASE}/{uid}", headers=headers)).status_code == 403
    assert (
        await async_client.post(
            f"{BASE}/{uid}/activation",
            headers=headers,
            json={"identity_confirmed": True},
        )
    ).status_code == 403
    assert (
        await async_client.delete(f"{BASE}/{uid}/activation", headers=headers)
    ).status_code == 403
    assert (
        await async_client.post(
            f"{BASE}/{uid}/activation",
            headers=superuser_token_headers_async,
            json={"identity_confirmed": False},
        )
    ).status_code == 400


@pytest.mark.asyncio
async def test_password_setup_cannot_be_bypassed_by_email_exemption(
    async_client, db_async
):
    user = User(
        email="pending@example.com",
        username="pending",
        first_name="Pending",
        last_name="Staff",
        hashed_password=get_password_hash(PASSWORD),
        password_setup_pending=True,
        email_verification_required=False,
    )
    db_async.add(user)
    await db_async.commit()
    assert (
        await async_client.post(
            "/api/v1/login/session", json={"email": user.email, "password": PASSWORD}
        )
    ).status_code == 403
    assert not service.is_staff_eligible(user)
    assert not await service.is_eligible_for_app(
        session=db_async, user=user, app_key="cms"
    )


@pytest.mark.asyncio
async def test_public_unverified_cms_grantee_still_needs_email(
    async_client, db_async, monkeypatch
):
    from src.auth.config import auth_settings

    monkeypatch.setattr(auth_settings, "CMS_SSO_CLIENT_SECRET", "cms-test-secret")
    user = User(
        email="public@example.com",
        username="public",
        first_name="Public",
        last_name="Account",
        hashed_password=get_password_hash(PASSWORD),
        registration_pending=True,
        email_verification_required=True,
        cms_access="publisher",
    )
    db_async.add(user)
    await db_async.commit()
    _, secret = await service.create_session(
        session=db_async, user=user, app_name="auth", enforce_approval=False
    )
    response = await async_client.post(
        "/api/v1/auth/apps/cms/handoff",
        json={"session_token": secret, "state": "a" * 32},
    )
    assert response.status_code == 403
    assert "Verify your email" in response.json()["detail"]


@pytest.mark.asyncio
async def test_activation_revokes_sessions_but_preserves_mfa(
    async_client, db_async, superuser_token_headers_async
):
    from src.auth import totp
    from src.auth.models import Session as LoginSession

    uid = await new_account(async_client, superuser_token_headers_async)
    user = await db_async.get(User, uuid.UUID(uid))
    user.totp_secret = totp.generate_secret()
    user.totp_enabled = True
    user.mfa_recovery_hashes = ["existing-recovery-hash"]
    await db_async.commit()
    old_session, _ = await service.create_session(
        session=db_async, user=user, app_name="auth", enforce_approval=False
    )
    old_session_id = old_session.id
    token = token_from(
        await async_client.post(
            f"{BASE}/{uid}/activation",
            headers=superuser_token_headers_async,
            json={"identity_confirmed": True},
        )
    )
    assert (
        await async_client.post(
            f"{BASE}/activate", json={"token": token, "new_password": PASSWORD}
        )
    ).status_code == 200
    db_async.expire_all()
    user = await db_async.get(User, uuid.UUID(uid))
    assert user.totp_enabled and user.totp_secret
    assert user.mfa_recovery_hashes == ["existing-recovery-hash"]
    assert await db_async.get(LoginSession, old_session_id) is None
    response = await async_client.post(
        "/api/v1/login/session", json={"email": user.email, "password": PASSWORD}
    )
    assert response.status_code == 400 and "Two-factor" in response.json()["detail"]
