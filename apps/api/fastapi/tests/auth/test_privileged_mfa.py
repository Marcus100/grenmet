"""Privileged MFA acceptance uses real sessions and a run-owned database."""

import asyncio
from datetime import timedelta

import jwt
import pyotp
import pytest
from cryptography.fernet import Fernet
from fastapi import HTTPException

from src.auth import app_service, mfa_rollout, service, totp
from src.auth.account_security import new_recovery_codes, verify_factor
from src.auth.config import AuthConfig, auth_settings
from src.auth.privileged_mfa import require_privileged_mfa
from src.auth.utils import ALGORITHM, create_access_token
from src.exceptions import AppException
from src.utils.datetime import utc_now
from tests.factories import assign_role, make_role_with_permission, make_user


@pytest.fixture(autouse=True)
def encryption(monkeypatch):
    monkeypatch.setattr(
        auth_settings, "AUTH_TOTP_ENCRYPTION_KEYS", [Fernet.generate_key().decode()]
    )
    monkeypatch.setattr(auth_settings, "AUTH_PRIVILEGED_MFA_MODE", "disabled")


async def enrol(session, user):
    secret = await service.begin_totp_setup(session=session, user=user)
    assert await service.activate_totp(
        session=session, user=user, code=pyotp.TOTP(secret).now()
    )
    codes = await new_recovery_codes(
        session, user, "password123", pyotp.TOTP(secret).now()
    )
    return secret, codes


async def login(client, user, code=None):
    body = {"email": user.email, "password": "password123", "totp_code": code}
    return await client.post("/api/v1/login/session", json=body)


def test_enforce_requires_dedicated_valid_key():
    with pytest.raises(ValueError, match="requires AUTH_TOTP"):
        AuthConfig(
            _env_file=None,
            AUTH_PRIVILEGED_MFA_MODE="enforce",
            AUTH_TOTP_ENCRYPTION_KEYS=[],
        )
    with pytest.raises(ValueError, match="Fernet keys"):
        AuthConfig(_env_file=None, AUTH_TOTP_ENCRYPTION_KEYS=["bad-key"])


def test_config_validation_does_not_disclose_encryption_keys():
    key = Fernet.generate_key().decode()
    with pytest.raises(ValueError) as error:
        AuthConfig(
            _env_file=None,
            AUTH_TOTP_ENCRYPTION_KEYS=[key],
            AUTH_PRIVILEGED_MFA_MODE="invalid",
        )
    assert key not in str(error.value)
    assert "input_value" not in str(error.value)


def test_ciphertext_rotation_and_fail_closed(monkeypatch):
    secret = totp.generate_secret()
    stored = totp.encrypt_secret(secret)
    assert stored != secret and totp.decrypt_secret(stored) == secret
    old = auth_settings.AUTH_TOTP_ENCRYPTION_KEYS[0]
    monkeypatch.setattr(
        auth_settings,
        "AUTH_TOTP_ENCRYPTION_KEYS",
        [Fernet.generate_key().decode(), old],
    )
    assert totp.decrypt_secret(stored) == secret
    monkeypatch.setattr(
        auth_settings, "AUTH_TOTP_ENCRYPTION_KEYS", [Fernet.generate_key().decode()]
    )
    with pytest.raises(AppException, match="unavailable"):
        totp.decrypt_secret(stored)
    monkeypatch.setattr(auth_settings, "AUTH_PRIVILEGED_MFA_MODE", "enforce")
    with pytest.raises(AppException, match="upgraded"):
        totp.decrypt_secret(secret)


async def test_rollout_defaults_keep_old_admin_and_enrolment_reachable(
    async_client, db_async, monkeypatch
):
    user = await make_user(db_async, superuser=True)
    response = await login(async_client, user)
    token = response.json()["access_token"]
    assert (
        await async_client.post(
            "/api/v1/login/test-token", headers={"Authorization": f"Bearer {token}"}
        )
    ).status_code == 200
    monkeypatch.setattr(auth_settings, "AUTH_PRIVILEGED_MFA_MODE", "enforce")
    assert (
        await async_client.post(
            "/api/v1/login/test-token", headers={"Authorization": f"Bearer {token}"}
        )
    ).status_code == 403
    security = await async_client.get(
        "/api/v1/auth/modern/security", headers={"Authorization": f"Bearer {token}"}
    )
    assert security.status_code == 200
    assert security.json()["privileged_mfa_required"] is True
    setup = await async_client.post(
        "/api/v1/2fa/setup", headers={"Authorization": f"Bearer {token}"}
    )
    assert setup.status_code == 200


async def test_enrolment_does_not_upgrade_password_session_and_recovery_is_once(
    async_client, db_async, monkeypatch
):
    user = await make_user(db_async, superuser=True)
    original = (await login(async_client, user)).json()
    _, codes = await enrol(db_async, user)
    monkeypatch.setattr(auth_settings, "AUTH_PRIVILEGED_MFA_MODE", "enforce")
    old_headers = {"Authorization": f"Bearer {original['access_token']}"}
    assert (
        await async_client.post("/api/v1/login/test-token", headers=old_headers)
    ).status_code == 403
    recovered = await login(async_client, user, codes[0])
    assert recovered.status_code == 200
    data = recovered.json()
    assert data["session"]["mfa_verified_at"] is not None
    claims = jwt.decode(
        data["access_token"], auth_settings.SECRET_KEY, algorithms=[ALGORITHM]
    )
    assert claims["sid"] == data["session"]["id"]
    assert (
        await async_client.post(
            "/api/v1/login/test-token",
            headers={"Authorization": f"Bearer {data['access_token']}"},
        )
    ).status_code == 200
    assert (await login(async_client, user, codes[0])).status_code == 400
    refreshed = await async_client.post(
        "/api/v1/login/session/refresh", json={"session_token": data["session_token"]}
    )
    assert refreshed.status_code == 200
    assert (
        refreshed.json()["session"]["mfa_verified_at"]
        == data["session"]["mfa_verified_at"]
    )
    assert (
        await async_client.post(
            "/api/v1/login/test-token",
            headers={"Authorization": f"Bearer {data['access_token']}"},
        )
    ).status_code == 403
    assert (
        await async_client.post(
            "/api/v1/login/test-token",
            headers={"Authorization": f"Bearer {refreshed.json()['access_token']}"},
        )
    ).status_code == 200


async def test_direct_token_wrong_owner_expired_and_app_scoped_session_denied(
    db_async, monkeypatch
):
    user = await make_user(db_async, superuser=True)
    other = await make_user(db_async)
    await enrol(db_async, user)
    monkeypatch.setattr(auth_settings, "AUTH_PRIVILEGED_MFA_MODE", "enforce")
    expired_token = create_access_token(user.id, timedelta(seconds=-1))
    with pytest.raises(HTTPException) as error:
        await require_privileged_mfa(db_async, user, token=expired_token)
    assert error.value.status_code == 401
    direct = create_access_token(user.id, timedelta(minutes=5))
    with pytest.raises(HTTPException):
        await require_privileged_mfa(db_async, user, token=direct)
    for owner, app_name, expiry in [
        (other, "auth", timedelta(days=1)),
        (user, "events", timedelta(days=1)),
        (user, "auth", timedelta(seconds=-1)),
    ]:
        stored, _ = await service.create_session(
            session=db_async,
            user=owner,
            app_name=app_name,
            expires_delta=expiry,
            enforce_approval=False,
            mfa_verified_at=utc_now(),
        )
        token, _ = service.issue_access_token_for_user(user=user, db_session=stored)
        with pytest.raises(HTTPException):
            await require_privileged_mfa(db_async, user, token=token)


async def test_delegated_user_manage_is_privileged_but_ordinary_staff_are_not(
    async_client, db_async, monkeypatch
):
    ordinary = await make_user(db_async)
    manager = await make_user(db_async)
    role, _ = await make_role_with_permission(db_async, "user.manage")
    await assign_role(db_async, user=manager, role=role)
    ordinary_token = (await login(async_client, ordinary)).json()["access_token"]
    manager_token = (await login(async_client, manager)).json()["access_token"]
    monkeypatch.setattr(auth_settings, "AUTH_PRIVILEGED_MFA_MODE", "enforce")
    for token, expected in [(ordinary_token, 200), (manager_token, 403)]:
        response = await async_client.post(
            "/api/v1/login/test-token", headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == expected


async def test_recovery_with_unreadable_ciphertext_and_disable_clears_session_evidence(
    db_async, monkeypatch
):
    user = await make_user(db_async, superuser=True)
    _, codes = await enrol(db_async, user)
    stored, _ = await service.create_session(
        session=db_async, user=user, mfa_verified_at=utc_now()
    )
    monkeypatch.setattr(
        auth_settings, "AUTH_TOTP_ENCRYPTION_KEYS", [Fernet.generate_key().decode()]
    )
    assert await verify_factor(db_async, user, codes[0])
    with pytest.raises(AppException, match="unavailable"):
        await verify_factor(db_async, user, codes[0])
    await service.disable_totp(session=db_async, user=user)
    await db_async.refresh(stored)
    assert stored.mfa_verified_at is None
    assert user.mfa_recovery_hashes == []


async def test_storage_command_dry_run_apply_and_readiness(db_async):
    before = await mfa_rollout.readiness(db_async)
    user = await make_user(db_async, superuser=True)
    secret = totp.generate_secret()
    user.totp_secret = secret
    user.totp_enabled = True
    db_async.add(user)
    await db_async.commit()
    counts = await mfa_rollout.prepare_storage(db_async)
    assert counts["plaintext_secrets"] == 1 and counts["secrets_rewrapped"] == 0
    await db_async.refresh(user)
    assert user.totp_secret == secret
    counts = await mfa_rollout.prepare_storage(db_async, apply=True)
    assert counts["secrets_rewrapped"] == 1
    await db_async.refresh(user)
    assert totp.decrypt_secret(user.totp_secret) == secret
    assert (await mfa_rollout.readiness(db_async))["missing_recovery_codes"] == before[
        "missing_recovery_codes"
    ] + 1


@pytest.mark.parametrize("app_key", ["gaa-admin", "cms"])
async def test_handoff_and_exchange_preserve_only_live_source_mfa(
    async_client, db_async, monkeypatch, app_key
):
    setting = (
        "GAA_ADMIN_SSO_CLIENT_SECRET"
        if app_key == "gaa-admin"
        else "CMS_SSO_CLIENT_SECRET"
    )
    monkeypatch.setattr(auth_settings, setting, "mfa-test-client-secret")
    user = await make_user(db_async, superuser=True)
    legacy = (await login(async_client, user)).json()
    _, codes = await enrol(db_async, user)
    monkeypatch.setattr(auth_settings, "AUTH_PRIVILEGED_MFA_MODE", "enforce")
    base = f"/api/v1/auth/apps/{app_key}"
    state = "mfa-test-state-long-enough"
    body = {"session_token": legacy["session_token"], "state": state}
    assert (await async_client.post(f"{base}/handoff", json=body)).status_code == 403
    authenticated = (await login(async_client, user, codes[0])).json()
    body["session_token"] = authenticated["session_token"]
    challenge = await async_client.post(f"{base}/handoff", json=body)
    assert challenge.status_code == 200, challenge.text
    redeem_body = {
        "code": challenge.json()["code"],
        "state": state,
        "client_secret": "mfa-test-client-secret",
    }
    redeemed = await async_client.post(f"{base}/handoff/redeem", json=redeem_body)
    assert redeemed.status_code == 200, redeemed.text
    app_login = redeemed.json()
    assert (
        app_login["session"]["mfa_verified_at"]
        == authenticated["session"]["mfa_verified_at"]
    )
    exchanged = await async_client.post(
        "/api/v1/login/session/access-token",
        json={"session_token": app_login["session_token"]},
    )
    assert exchanged.status_code == 200
    # Source revocation between issue/redeem must not create another MFA session.
    challenge = await async_client.post(f"{base}/handoff", json=body)
    await async_client.post(
        "/api/v1/login/session/logout",
        json={"session_token": authenticated["session_token"]},
    )
    redeem_body["code"] = challenge.json()["code"]
    assert (
        await async_client.post(f"{base}/handoff/redeem", json=redeem_body)
    ).status_code == 400
    # Disable clears all downstream evidence, including app exchanges.
    await service.disable_totp(session=db_async, user=user)
    rejected = await async_client.post(
        "/api/v1/login/session/access-token",
        json={"session_token": app_login["session_token"]},
    )
    assert rejected.status_code == 403


async def test_cookie_staff_gate_uses_session_evidence(
    async_client, db_async, monkeypatch
):
    user = await make_user(db_async, superuser=True)
    _, codes = await enrol(db_async, user)
    authenticated = (await login(async_client, user, codes[0])).json()
    old, old_secret = await service.create_session(session=db_async, user=user)
    monkeypatch.setattr(auth_settings, "AUTH_PRIVILEGED_MFA_MODE", "enforce")
    headers = {"Cookie": f"{auth_settings.BROWSER_SESSION_COOKIE_NAME}={old_secret}"}
    assert (
        await async_client.get("/api/v1/auth/browser/session", headers=headers)
    ).status_code == 403
    headers["Cookie"] = (
        f"{auth_settings.BROWSER_SESSION_COOKIE_NAME}={authenticated['session_token']}"
    )
    assert (
        await async_client.get("/api/v1/auth/browser/session", headers=headers)
    ).status_code == 200


async def test_missing_key_blocks_setup_and_explains_readiness(
    async_client, db_async, monkeypatch
):
    user = await make_user(db_async, superuser=True)
    token = (await login(async_client, user)).json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    monkeypatch.setattr(auth_settings, "AUTH_TOTP_ENCRYPTION_KEYS", [])
    assert (
        await async_client.post("/api/v1/2fa/setup", headers=headers)
    ).status_code == 503
    details = await async_client.get("/api/v1/auth/modern/security", headers=headers)
    assert details.status_code == 200
    assert details.json()["authenticator_storage_ready"] is False


@pytest.mark.parametrize("method", ["email", "phone", "account-email"])
async def test_primary_code_waits_for_enrolled_factor_then_is_consumed(
    async_client, db_async, monkeypatch, method
):
    from src.auth import otp

    monkeypatch.setattr(auth_settings, "PHONE_OTP_PROVIDER", "console")
    monkeypatch.setattr(
        app_service.email_settings, "EMAILS_FROM_EMAIL", "test@example.com"
    )
    monkeypatch.setattr(app_service.email_settings, "SMTP_HOST", "localhost")
    monkeypatch.setattr(app_service, "new_code", lambda: "123456")
    monkeypatch.setattr(app_service, "send_email", lambda **kwargs: None)
    monkeypatch.setattr(otp, "send_code", lambda **kwargs: None)
    user = await make_user(db_async, superuser=True)
    user.email_verified_at = utc_now()
    user.phone_e164 = "+14734401234"
    user.phone_verified_at = utc_now()
    db_async.add(user)
    await db_async.commit()
    _, codes = await enrol(db_async, user)
    phone = method == "phone"
    base = (
        "/api/v1/auth/modern"
        if method == "account-email"
        else "/api/v1/auth/apps/events"
    )
    route = "phone" if phone else "email"
    identity = {"phone": user.phone_e164} if phone else {"email": user.email}
    assert (
        await async_client.post(f"{base}/{route}-code/start", json=identity)
    ).status_code == 200
    body = {**identity, "code": "123456"}
    needed = await async_client.post(f"{base}/{route}-code/verify", json=body)
    assert needed.status_code == 400
    assert (
        needed.json()["detail"] == "Two-factor authentication code required or invalid"
    )
    body["totp_code"] = "INVALID-FACTOR"
    assert (
        await async_client.post(f"{base}/{route}-code/verify", json=body)
    ).status_code == 400
    body["totp_code"] = codes[0]
    verified = await async_client.post(f"{base}/{route}-code/verify", json=body)
    assert verified.status_code == 200, verified.text
    assert verified.json()["session"]["mfa_verified_at"] is not None
    assert (
        await async_client.post(f"{base}/{route}-code/verify", json=body)
    ).status_code == 400
    if method != "account-email":
        denied = await async_client.post(
            "/api/v1/login/test-token",
            headers={"Authorization": "Bearer " + verified.json()["access_token"]},
        )
        assert denied.status_code == 401


@pytest.mark.parametrize("method", ["email", "phone"])
async def test_concurrent_primary_code_submission_has_one_winner(
    async_client, db_async, monkeypatch, method
):
    from src.auth import otp

    monkeypatch.setattr(auth_settings, "PHONE_OTP_PROVIDER", "console")
    monkeypatch.setattr(
        app_service.email_settings, "EMAILS_FROM_EMAIL", "test@example.com"
    )
    monkeypatch.setattr(app_service.email_settings, "SMTP_HOST", "localhost")
    monkeypatch.setattr(app_service, "new_code", lambda: "123456")
    monkeypatch.setattr(app_service, "send_email", lambda **kwargs: None)
    monkeypatch.setattr(otp, "send_code", lambda **kwargs: None)
    user = await make_user(db_async, superuser=True)
    user.email_verified_at = utc_now()
    user.phone_e164 = "+14734401234"
    user.phone_verified_at = utc_now()
    db_async.add(user)
    await db_async.commit()
    _, codes = await enrol(db_async, user)
    base = f"/api/v1/auth/apps/events/{method}-code"
    identity = (
        {"phone": user.phone_e164} if method == "phone" else {"email": user.email}
    )
    assert (await async_client.post(f"{base}/start", json=identity)).status_code == 200
    body = {**identity, "code": "123456", "totp_code": codes[0]}
    # ASGI requests use independent real DB sessions; FOR UPDATE serialises the claim.
    results = await asyncio.gather(
        async_client.post(f"{base}/verify", json=body),
        async_client.post(f"{base}/verify", json=body),
    )
    assert sorted(result.status_code for result in results) == [200, 400]


async def test_onboarding_readiness_distinguishes_enrolment_from_session(
    db_async, monkeypatch
):
    from src.auth import onboarding
    from src.auth.onboarding_schemas import AccessBlocker

    actor = await make_user(db_async, superuser=True)
    target = await make_user(db_async, superuser=True)
    staged = await onboarding.status(db_async, actor, target.id)
    assert staged.apps[0].available
    assert not staged.apps[0].requires_mfa_sign_in
    monkeypatch.setattr(auth_settings, "AUTH_PRIVILEGED_MFA_MODE", "enforce")
    blocked = await onboarding.status(db_async, actor, target.id)
    assert all(AccessBlocker.MFA_ENROLMENT in app.blockers for app in blocked.apps)
    assert all(not app.available and app.requires_mfa_sign_in for app in blocked.apps)
    target.totp_secret = totp.generate_secret()
    target.totp_enabled = True
    db_async.add(target)
    await db_async.commit()
    legacy = await onboarding.status(db_async, actor, target.id)
    assert not legacy.apps[0].available
    target.totp_secret = totp.encrypt_secret(target.totp_secret)
    db_async.add(target)
    await db_async.commit()
    enrolled = await onboarding.status(db_async, actor, target.id)
    assert enrolled.apps[0].available and enrolled.apps[0].requires_mfa_sign_in
    assert AccessBlocker.MFA_ENROLMENT not in enrolled.apps[0].blockers
    ordinary = await make_user(db_async)
    public = await onboarding.status(db_async, actor, ordinary.id)
    assert not public.apps[0].requires_mfa_sign_in
    assert AccessBlocker.MFA_ENROLMENT not in public.apps[0].blockers


async def test_session_issuance_discards_factor_proof_after_concurrent_disable(
    db_async,
):
    from src.auth.models import User
    from src.database import async_session_factory

    user = await make_user(db_async, superuser=True)
    await enrol(db_async, user)
    async with async_session_factory() as concurrent:
        changed = await concurrent.get(User, user.id)
        await service.disable_totp(session=concurrent, user=changed)
    # This request still holds the old ORM snapshot from its completed factor check.
    assert user.totp_enabled
    issued, _ = await service.create_session(
        session=db_async, user=user, mfa_verified_at=utc_now()
    )
    assert issued.mfa_verified_at is None


async def test_session_issuance_rechecks_handoff_source_under_account_lock(db_async):
    from src.auth.models import Session as LoginSession
    from src.database import async_session_factory

    user = await make_user(db_async, superuser=True)
    await enrol(db_async, user)
    source, _ = await service.create_session(
        session=db_async, user=user, mfa_verified_at=utc_now()
    )
    async with async_session_factory() as concurrent:
        revoked = await concurrent.get(LoginSession, source.id)
        await service.revoke_session(session=concurrent, db_session=revoked)
    with pytest.raises(AppException) as error:
        await service.create_session(
            session=db_async,
            user=user,
            mfa_verified_at=source.mfa_verified_at,
            mfa_source_session=source,
        )
    assert error.value.status_code == 401


async def test_wrong_key_still_prompts_for_recovery_and_completes_sign_in(
    async_client, db_async, monkeypatch
):
    user = await make_user(db_async, superuser=True)
    _, codes = await enrol(db_async, user)
    monkeypatch.setattr(
        auth_settings, "AUTH_TOTP_ENCRYPTION_KEYS", [Fernet.generate_key().decode()]
    )
    monkeypatch.setattr(auth_settings, "AUTH_PRIVILEGED_MFA_MODE", "enforce")
    prompt = await login(async_client, user)
    assert prompt.status_code == 400
    assert (
        prompt.json()["detail"] == "Two-factor authentication code required or invalid"
    )
    recovered = await login(async_client, user, codes[0])
    assert recovered.status_code == 200, recovered.text
    assert recovered.json()["session"]["mfa_verified_at"] is not None
    admitted = await async_client.post(
        "/api/v1/login/test-token",
        headers={"Authorization": "Bearer " + recovered.json()["access_token"]},
    )
    assert admitted.status_code == 200


async def test_concurrent_recovery_code_sign_in_has_one_winner(async_client, db_async):
    user = await make_user(db_async, superuser=True)
    _, codes = await enrol(db_async, user)
    results = await asyncio.gather(
        login(async_client, user, codes[0]), login(async_client, user, codes[0])
    )
    assert sorted(result.status_code for result in results) == [200, 400]
    await db_async.refresh(user)
    assert len(user.mfa_recovery_hashes) == 7


async def test_readiness_covers_public_account_storage_without_requiring_public_enrolment(
    db_async,
):
    before = await mfa_rollout.readiness(db_async)
    user = await make_user(db_async)
    user.totp_secret = totp.generate_secret()
    user.totp_enabled = True
    db_async.add(user)
    await db_async.commit()
    legacy = await mfa_rollout.readiness(db_async)
    assert legacy["unencrypted_secrets"] == before["unencrypted_secrets"] + 1
    assert legacy["missing_enrolment"] == before["missing_enrolment"]
    assert legacy["missing_recovery_codes"] == before["missing_recovery_codes"]
    user.totp_secret = "fernet:v1:invalid-ciphertext"
    db_async.add(user)
    await db_async.commit()
    unreadable = await mfa_rollout.readiness(db_async)
    assert unreadable["unreadable_secrets"] == before["unreadable_secrets"] + 1


@pytest.mark.parametrize("app_key", [None, "events"])
async def test_google_factor_completion_mints_actual_scoped_evidence(
    async_client, db_async, monkeypatch, app_key
):
    from src.auth import modern_service

    user = await make_user(db_async, superuser=True)
    _, codes = await enrol(db_async, user)
    monkeypatch.setattr(auth_settings, "AUTH_PRIVILEGED_MFA_MODE", "enforce")
    monkeypatch.setattr(auth_settings, "GOOGLE_CLIENT_ID", "test-google-client")
    monkeypatch.setattr(
        auth_settings,
        "EVENTS_GOOGLE_REDIRECT_URI",
        "https://events.example.test/callback",
    )
    purpose = f"gl:{app_key}" if app_key else "google-login"
    endpoint = (
        f"/api/v1/auth/apps/{app_key}/google/finish"
        if app_key
        else "/api/v1/auth/modern/google/finish"
    )

    async def challenge():
        token = await modern_service.issue(
            db_async,
            purpose,
            user_id=user.id,
            data={"subject": f"google-{user.id}", "email": user.email},
        )
        await db_async.commit()
        return token

    missing = await async_client.post(endpoint, json={"challenge": await challenge()})
    assert missing.status_code == 400
    token = await challenge()
    response = await async_client.post(
        endpoint, json={"challenge": token, "totp_code": codes[0]}
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["session"]["mfa_verified_at"] is not None
    claims = jwt.decode(
        body["access_token"], auth_settings.SECRET_KEY, algorithms=[ALGORITHM]
    )
    assert claims["sid"] == body["session"]["id"]
    assert claims.get("app") == app_key
    staff = await async_client.post(
        "/api/v1/login/test-token",
        headers={"Authorization": f"Bearer {body['access_token']}"},
    )
    assert staff.status_code == (401 if app_key else 200)
    replay = await async_client.post(
        endpoint, json={"challenge": token, "totp_code": codes[1]}
    )
    assert replay.status_code == 400
