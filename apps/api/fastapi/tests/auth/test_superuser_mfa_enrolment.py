"""Superusers without an authenticator are refused privileged routes (issue #501)."""

import pyotp
import pytest
from cryptography.fernet import Fernet

from src.auth import devices, service
from src.auth.config import AuthConfig, auth_settings
from tests.auth.test_config import STRONG_SECRET
from tests.factories import assign_role, make_role_with_permission, make_user

CODE = "mfa_enrolment_required"
PRIVILEGED = "/api/v1/auth/staff/me"


@pytest.fixture(autouse=True)
def enforce(monkeypatch):
    monkeypatch.setattr(
        auth_settings, "AUTH_TOTP_ENCRYPTION_KEYS", [Fernet.generate_key().decode()]
    )
    monkeypatch.setattr(auth_settings, "AUTH_PRIVILEGED_MFA_MODE", "enforce")


async def login(client, user, code=None):
    body = {"email": user.email, "password": "password123", "totp_code": code}
    response = await client.post("/api/v1/auth/sessions", json=body)
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


async def test_unenrolled_superuser_is_refused_with_code(async_client, db_async):
    user = await make_user(db_async, superuser=True)
    headers = await login(async_client, user)
    response = await async_client.get(PRIVILEGED, headers=headers)
    assert response.status_code == 403
    detail = response.json()["detail"]
    assert detail.startswith("Set up two-step verification")
    assert f"({CODE})" in detail


async def test_enrolment_stays_reachable_and_then_privileged_route_works(
    async_client, db_async
):
    user = await make_user(db_async, superuser=True)
    headers = await login(async_client, user)
    assert (
        await async_client.get("/api/v1/auth/users/me/security", headers=headers)
    ).status_code == 200
    setup = await async_client.post(
        "/api/v1/auth/users/me/security/2fa/setup", headers=headers
    )
    assert setup.status_code == 200
    secret = setup.json()["secret"]
    activate = await async_client.post(
        "/api/v1/auth/users/me/security/2fa/activate",
        headers=headers,
        json={"code": pyotp.TOTP(secret).now()},
    )
    assert activate.status_code == 200
    # The password-only session never upgrades; a fresh two-step sign-in works.
    assert (await async_client.get(PRIVILEGED, headers=headers)).status_code == 403
    fresh = await login(async_client, user, pyotp.TOTP(secret).now())
    assert (await async_client.get(PRIVILEGED, headers=fresh)).status_code == 200


async def test_refresh_does_not_launder_an_unenrolled_session(async_client, db_async):
    user = await make_user(db_async, superuser=True)
    body = {"email": user.email, "password": "password123"}
    data = (await async_client.post("/api/v1/auth/sessions", json=body)).json()
    refreshed = await async_client.post(
        "/api/v1/auth/sessions/refresh", json={"session_token": data["session_token"]}
    )
    assert refreshed.status_code == 200
    headers = {"Authorization": f"Bearer {refreshed.json()['access_token']}"}
    assert (await async_client.get(PRIVILEGED, headers=headers)).status_code == 403


async def test_non_privileged_user_is_unaffected(async_client, db_async):
    user = await make_user(db_async)
    headers = await login(async_client, user)
    assert (
        await async_client.get("/api/v1/auth/users/me/security", headers=headers)
    ).status_code == 200


async def test_opt_out_mode_behaves_as_before(async_client, db_async, monkeypatch):
    monkeypatch.setattr(auth_settings, "AUTH_PRIVILEGED_MFA_MODE", "disabled")
    user = await make_user(db_async, superuser=True)
    headers = await login(async_client, user)
    assert (await async_client.get(PRIVILEGED, headers=headers)).status_code == 200


def test_mode_defaults_to_enforce_outside_local_and_can_opt_out():
    keys = [Fernet.generate_key().decode()]
    common = {"SECRET_KEY": STRONG_SECRET, "BCRYPT_ROUNDS": 12, "_env_file": None}
    local = AuthConfig(ENVIRONMENT="local", _env_file=None)
    assert local.AUTH_PRIVILEGED_MFA_MODE == "disabled"
    prod = AuthConfig(
        ENVIRONMENT="production", AUTH_TOTP_ENCRYPTION_KEYS=keys, **common
    )
    assert prod.AUTH_PRIVILEGED_MFA_MODE == "enforce"
    empty = AuthConfig(
        ENVIRONMENT="staging",
        AUTH_PRIVILEGED_MFA_MODE="",
        AUTH_TOTP_ENCRYPTION_KEYS=keys,
        **common,
    )
    assert empty.AUTH_PRIVILEGED_MFA_MODE == "enforce"
    opted_out = AuthConfig(
        ENVIRONMENT="production", AUTH_PRIVILEGED_MFA_MODE="disabled", **common
    )
    assert opted_out.AUTH_PRIVILEGED_MFA_MODE == "disabled"
    with pytest.raises(ValueError, match="requires AUTH_TOTP"):
        AuthConfig(ENVIRONMENT="production", **common)


async def test_cookie_path_refuses_an_unenrolled_superuser(async_client, db_async):
    user = await make_user(db_async, superuser=True)
    body = {"email": user.email, "password": "password123"}
    data = (await async_client.post("/api/v1/auth/sessions", json=body)).json()
    cookie = f"{auth_settings.BROWSER_SESSION_COOKIE_NAME}={data['session_token']}"
    response = await async_client.get(
        "/api/v1/auth/browser/session", headers={"Cookie": cookie}
    )
    assert response.status_code == 403
    assert f"({CODE})" in response.json()["detail"]


@pytest.mark.parametrize("permission", ["user.manage", "cap.alert.approve"])
async def test_non_superuser_privileged_holder_is_refused(
    async_client, db_async, permission
):
    user = await make_user(db_async)
    role, _ = await make_role_with_permission(db_async, permission)
    await assign_role(db_async, user=user, role=role)
    headers = await login(async_client, user)
    response = await async_client.get(PRIVILEGED, headers=headers)
    assert response.status_code == 403
    assert f"({CODE})" in response.json()["detail"]


async def _activate(db_async, user):
    secret = await service.begin_totp_setup(session=db_async, user=user)
    assert await service.activate_totp(
        session=db_async, user=user, code=pyotp.TOTP(secret).now()
    )


async def test_enrolling_a_privileged_account_sends_one_alert(db_async, monkeypatch):
    sent: list[str] = []
    monkeypatch.setattr(
        devices,
        "schedule_authenticator_added_alert",
        lambda *, email_to: sent.append(email_to),
    )
    user = await make_user(db_async, superuser=True)
    await _activate(db_async, user)
    assert sent == [user.email]


async def test_enrolling_an_ordinary_account_sends_no_alert(db_async, monkeypatch):
    sent: list[str] = []
    monkeypatch.setattr(
        devices,
        "schedule_authenticator_added_alert",
        lambda *, email_to: sent.append(email_to),
    )
    await _activate(db_async, await make_user(db_async))
    assert sent == []


async def test_alert_email_names_no_secret(monkeypatch, auth_emails):

    from src.email_config import email_settings

    monkeypatch.setattr(
        type(email_settings), "emails_enabled", property(lambda _self: True)
    )
    devices.schedule_authenticator_added_alert(email_to="owner@example.com")
    await devices.wait_for_pending_alerts()
    [message] = auth_emails
    assert message["email_to"] == "owner@example.com"
    assert message["subject"] == "An authenticator was added to your account"
    assert "contact a Barrels administrator" in message["html_content"]
