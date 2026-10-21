"""The bookings web app is registered for single sign-on (ADR-0016/0017)."""

import pytest

from src.auth import app_service, apps
from src.auth.config import auth_settings
from src.auth.models import Permission, Role
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


BASE = "/api/v1/auth/apps/bookings"
SECRET = "bookings-test-client-secret"


def test_bookings_resolves_in_the_registry_as_a_self_service_site(monkeypatch):
    monkeypatch.setattr(
        auth_settings, "BOOKINGS_APP_URL", "https://bookings.barrels.gd/"
    )
    app = apps.get_app("bookings")
    assert app is not None
    assert app.key == "bookings"
    assert app.url == "https://bookings.barrels.gd"
    assert app.scope == "app"
    assert app.default_role == "bookings-member"
    assert app.self_signup is True
    assert app.callback_url == "https://bookings.barrels.gd/auth/callback"
    assert apps.is_app_scoped("bookings")


def test_bookings_sign_in_is_off_while_the_secret_is_empty(monkeypatch):
    monkeypatch.setattr(auth_settings, "BOOKINGS_SSO_CLIENT_SECRET", "")
    app = apps.get_app("bookings")
    assert app is not None
    assert not app.sso
    assert "bookings" not in {a.key for a in apps.registered_apps()}
    assert "bookings" in {a.key for a in apps.all_apps()}


@pytest.mark.asyncio
async def test_bookings_handoff_round_trip(
    async_client,
    db_async,
    seeded,
    monkeypatch,
):
    _ = seeded
    monkeypatch.setattr(auth_settings, "BOOKINGS_SSO_CLIENT_SECRET", SECRET)
    # permissions.py (owner-only) does not seed bookings-member yet, so stand in
    # for it here; drop this once the owner adds app.bookings.access.
    role = Role(name="bookings-member")
    role.permissions = [
        Permission(
            key="app.bookings.access", action="access", entity="bookings", access="app"
        )
    ]
    db_async.add(role)
    await db_async.commit()
    secret = await _account_session(db_async)
    state = _state()
    joined = await _start(async_client, secret, state, join=True, base=BASE)
    assert joined.status_code == 200, joined.text
    assert joined.json()["callback_url"].endswith("/auth/callback")
    redeemed = await _redeem(
        async_client, joined.json()["code"], state, base=BASE, secret=SECRET
    )
    assert redeemed.status_code == 200, redeemed.text
    assert redeemed.json()["session"]["app_name"] == "bookings"


@pytest.mark.asyncio
async def test_bookings_handoff_refused_with_empty_secret(
    async_client,
    db_async,
    seeded,
    monkeypatch,
):
    _ = seeded
    monkeypatch.setattr(auth_settings, "BOOKINGS_SSO_CLIENT_SECRET", "")
    secret = await _account_session(db_async)
    started = await _start(async_client, secret, _state(), join=True, base=BASE)
    assert started.status_code == 404
    redeemed = await _redeem(async_client, "x" * 32, _state(), base=BASE, secret=SECRET)
    assert redeemed.status_code == 404
