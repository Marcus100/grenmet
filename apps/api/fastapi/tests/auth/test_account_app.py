"""The Barrels account web app is registered for single sign-on (ADR-0017, ADR-0057)."""

import pytest

from src.auth import app_service, apps
from src.auth.config import auth_settings
from tests.auth.test_app_handoff import (
    _account_session,
    _redeem,
    _start,
    _state,
)


@pytest.fixture
async def seeded(monkeypatch, db_async):
    from src.auth.permissions import seed_permissions_and_roles_async

    await seed_permissions_and_roles_async(db_async)
    monkeypatch.setattr(app_service, "new_code", lambda: "123456")
    monkeypatch.setattr(app_service, "send_email", lambda **_: None)


BASE = "/api/v1/auth/apps/account"
SECRET = "account-test-client-secret"


def test_account_resolves_in_the_registry_as_a_self_service_site(monkeypatch):
    monkeypatch.setattr(auth_settings, "ACCOUNT_APP_URL", "https://account.barrels.gd/")
    app = apps.get_app("account")
    assert app is not None
    assert app.key == "account"
    assert app.label == "Barrels account"
    assert app.url == "https://account.barrels.gd"
    assert app.scope == "app"
    assert app.default_role == "account-member"
    assert app.access_permission == "app.account.access"
    assert app.self_signup is True
    assert app.callback_url == "https://account.barrels.gd/auth/callback"
    assert apps.is_app_scoped("account")


def test_account_defaults_to_the_local_port(monkeypatch):
    monkeypatch.setattr(auth_settings, "ACCOUNT_APP_URL", "http://localhost:3018")
    app = apps.get_app("account")
    assert app is not None
    assert app.url == "http://localhost:3018"


def test_account_sign_in_is_off_while_the_secret_is_empty(monkeypatch):
    monkeypatch.setattr(auth_settings, "ACCOUNT_SSO_CLIENT_SECRET", "")
    app = apps.get_app("account")
    assert app is not None
    assert not app.sso
    assert "account" not in {a.key for a in apps.registered_apps()}
    assert "account" in {a.key for a in apps.all_apps()}


def test_account_is_a_registered_permission_and_role():
    from src.auth.permissions import DEFAULT_ROLES, PERMISSIONS

    assert "app.account.access" in {p.key for p in PERMISSIONS}
    assert "account-member" in DEFAULT_ROLES
    assert "app.account.access" in DEFAULT_ROLES["account-member"][1]


@pytest.mark.asyncio
async def test_account_handoff_round_trip(
    async_client,
    db_async,
    seeded,
    monkeypatch,
):
    _ = seeded
    monkeypatch.setattr(auth_settings, "ACCOUNT_SSO_CLIENT_SECRET", SECRET)
    secret = await _account_session(db_async)
    state = _state()
    joined = await _start(async_client, secret, state, join=True, base=BASE)
    assert joined.status_code == 200, joined.text
    assert joined.json()["callback_url"].endswith("/auth/callback")
    redeemed = await _redeem(
        async_client, joined.json()["code"], state, base=BASE, secret=SECRET
    )
    assert redeemed.status_code == 200, redeemed.text
    assert redeemed.json()["session"]["app_name"] == "account"


@pytest.mark.asyncio
async def test_account_handoff_refused_with_empty_secret(
    async_client,
    db_async,
    seeded,
    monkeypatch,
):
    _ = seeded
    monkeypatch.setattr(auth_settings, "ACCOUNT_SSO_CLIENT_SECRET", "")
    secret = await _account_session(db_async)
    started = await _start(async_client, secret, _state(), join=True, base=BASE)
    assert started.status_code == 404
    redeemed = await _redeem(async_client, "x" * 32, _state(), base=BASE, secret=SECRET)
    assert redeemed.status_code == 404
