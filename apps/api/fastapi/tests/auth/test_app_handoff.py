"""Single sign-on handoff from the auth.barrels.gd account session (ADR-0017)."""

import secrets
from dataclasses import replace
from datetime import timedelta

import jwt
import pytest
from sqlalchemy import select

from src.auth import app_service, apps, service
from src.auth.config import auth_settings
from src.auth.models import User
from src.auth.modern_models import AuthChallenge
from src.auth.utils import ALGORITHM, get_password_hash
from src.utils.datetime import utc_now

BASE = "/api/v1/auth/apps/events"
CLIENT_SECRET = "events-test-client-secret"


@pytest.fixture
async def seeded(monkeypatch, db_async):
    from src.auth.permissions import seed_permissions_and_roles_async

    await seed_permissions_and_roles_async(db_async)
    monkeypatch.setattr(auth_settings, "EVENTS_SSO_CLIENT_SECRET", CLIENT_SECRET)
    monkeypatch.setattr(auth_settings, "GAA_ADMIN_SSO_CLIENT_SECRET", CLIENT_SECRET)
    monkeypatch.setattr(app_service, "new_code", lambda: "123456")
    monkeypatch.setattr(app_service, "send_email", lambda **_: None)


async def _account_session(db_async, email="staffer@example.com") -> str:
    """A verified staff account signed in at auth.barrels.gd (legacy session)."""
    user = User(
        email=email,
        username=email.split("@", 1)[0],
        first_name="Staff",
        last_name="Member",
        hashed_password=get_password_hash("Staff-password-123!"),
        email_verified_at=utc_now(),
    )
    db_async.add(user)
    await db_async.commit()
    _, secret = await service.create_session(
        session=db_async, user=user, app_name="auth"
    )
    return secret


def _state() -> str:
    return secrets.token_urlsafe(24)


async def _start(async_client, secret, state, *, join=False, base=BASE):
    return await async_client.post(
        f"{base}/handoff",
        json={"session_token": secret, "state": state, "join": join},
    )


async def _redeem(async_client, code, state, *, base=BASE, secret=CLIENT_SECRET):
    return await async_client.post(
        f"{base}/handoff/redeem",
        json={"code": code, "state": state, "client_secret": secret},
    )


@pytest.mark.asyncio
async def test_join_once_then_handoff_creates_an_app_session(
    async_client, db_async, seeded
):
    _ = seeded
    secret = await _account_session(db_async)
    state = _state()

    first = await _start(async_client, secret, state)
    assert first.status_code == 409  # not a member yet: auth shows "Join"

    joined = await _start(async_client, secret, state, join=True)
    assert joined.status_code == 200, joined.text
    body = joined.json()
    assert body["callback_url"].endswith("/auth/callback")

    redeemed = await _redeem(async_client, body["code"], state)
    assert redeemed.status_code == 200, redeemed.text
    session_body = redeemed.json()
    assert session_body["session"]["app_name"] == "events"
    assert session_body["session_token"] != secret
    claims = jwt.decode(
        session_body["access_token"], auth_settings.SECRET_KEY, algorithms=[ALGORITHM]
    )
    assert claims["app"] == "events"

    # Already a member: later handoffs need no join.
    again = await _start(async_client, secret, _state())
    assert again.status_code == 200


@pytest.mark.asyncio
async def test_codes_are_single_use_and_bound_to_state(async_client, db_async, seeded):
    _ = seeded
    secret = await _account_session(db_async)
    state = _state()
    code = (await _start(async_client, secret, state, join=True)).json()["code"]
    assert (await _redeem(async_client, code, state)).status_code == 200
    assert (await _redeem(async_client, code, state)).status_code == 400

    # A wrong state spends the code, so the right state can't retry it.
    code = (await _start(async_client, secret, state)).json()["code"]
    assert (await _redeem(async_client, code, _state())).status_code == 400
    assert (await _redeem(async_client, code, state)).status_code == 400


@pytest.mark.asyncio
async def test_only_the_app_server_can_redeem(async_client, db_async, seeded):
    _ = seeded
    secret = await _account_session(db_async)
    state = _state()
    code = (await _start(async_client, secret, state, join=True)).json()["code"]
    wrong = await _redeem(async_client, code, state, secret="guessed-secret")
    assert wrong.status_code == 401
    # A rejected secret doesn't spend the code for the real app.
    assert (await _redeem(async_client, code, state)).status_code == 200


@pytest.mark.asyncio
async def test_expired_codes_are_refused(async_client, db_async, seeded):
    _ = seeded
    secret = await _account_session(db_async)
    state = _state()
    code = (await _start(async_client, secret, state, join=True)).json()["code"]
    challenge = (
        await db_async.execute(
            select(AuthChallenge).where(
                AuthChallenge.purpose == app_service.HANDOFF_PURPOSE
            )
        )
    ).scalar_one()
    challenge.expires_at = utc_now() - timedelta(seconds=1)
    db_async.add(challenge)
    await db_async.commit()
    assert (await _redeem(async_client, code, state)).status_code == 400


@pytest.mark.asyncio
async def test_codes_only_work_in_the_app_they_were_issued_for(
    async_client, db_async, seeded, monkeypatch
):
    _ = seeded
    events = apps.get_app("events")
    other = replace(events, key="other", label="Other")
    monkeypatch.setattr(apps, "_apps", lambda: {"events": events, "other": other})
    secret = await _account_session(db_async)
    state = _state()
    code = (await _start(async_client, secret, state, join=True)).json()["code"]
    wrong = await _redeem(async_client, code, state, base="/api/v1/auth/apps/other")
    assert wrong.status_code == 400


@pytest.mark.asyncio
async def test_only_a_live_account_session_can_start_a_handoff(
    async_client, db_async, seeded
):
    _ = seeded
    # An app session (Events) must never mint access to another app.
    await async_client.post(f"{BASE}/email-code/start", json={"email": "r@example.com"})
    app_secret = (
        await async_client.post(
            f"{BASE}/email-code/verify",
            json={"email": "r@example.com", "code": "123456"},
        )
    ).json()["session_token"]
    assert (await _start(async_client, app_secret, _state())).status_code == 401

    assert (await _start(async_client, "not-a-session", _state())).status_code == 401

    secret = await _account_session(db_async)
    await async_client.post(
        "/api/v1/login/session/logout", json={"session_token": secret}
    )
    assert (await _start(async_client, secret, _state(), join=True)).status_code == 401


@pytest.mark.asyncio
async def test_closed_apps_require_an_admin_grant(
    async_client, db_async, seeded, monkeypatch
):
    _ = seeded
    monkeypatch.setattr(auth_settings, "ALLOW_PUBLIC_SIGNUP", False)
    secret = await _account_session(db_async)
    response = await _start(async_client, secret, _state(), join=True)
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_apps_without_sso_refuse_handoff(
    async_client, db_async, seeded, monkeypatch
):
    _ = seeded
    events = replace(apps.get_app("events"), client_secret="")
    monkeypatch.setattr(apps, "_apps", lambda: {"events": events})
    secret = await _account_session(db_async)
    assert (await _start(async_client, secret, _state(), join=True)).status_code == 404
    assert (await _redeem(async_client, "x" * 32, _state())).status_code == 404


@pytest.mark.asyncio
async def test_staff_cookie_routes_refuse_app_sessions(async_client, db_async, seeded):
    _ = seeded
    cookie = auth_settings.BROWSER_SESSION_COOKIE_NAME
    staff_secret = await _account_session(db_async)
    state = _state()
    code = (await _start(async_client, staff_secret, state, join=True)).json()["code"]
    app_secret = (await _redeem(async_client, code, state)).json()["session_token"]

    async_client.cookies.set(cookie, staff_secret)
    staff = await async_client.get("/api/v1/auth/browser/session")
    assert staff.status_code == 200, staff.text
    async_client.cookies.set(cookie, app_secret)
    scoped = await async_client.get("/api/v1/auth/browser/session")
    assert scoped.status_code == 401


ADMIN = "/api/v1/auth/apps/gaa-admin"


@pytest.mark.asyncio
async def test_staff_apps_get_staff_tokens_and_cookie_access(
    async_client, db_async, seeded
):
    _ = seeded
    secret = await _account_session(db_async)
    state = _state()
    started = await _start(async_client, secret, state, base=ADMIN)
    assert started.status_code == 200, started.text  # no join step for staff
    redeemed = await _redeem(async_client, started.json()["code"], state, base=ADMIN)
    assert redeemed.status_code == 200, redeemed.text
    body = redeemed.json()
    assert body["session"]["app_name"] == "gaa-admin"
    claims = jwt.decode(
        body["access_token"], auth_settings.SECRET_KEY, algorithms=[ALGORITHM]
    )
    assert "app" not in claims
    me = await async_client.get(
        "/api/v1/auth/users/me",
        headers={"Authorization": f"Bearer {body['access_token']}"},
    )
    assert me.status_code == 200

    # Exchange and refresh keep it an ordinary staff session.
    exchanged = await async_client.post(
        "/api/v1/login/session/access-token",
        json={"session_token": body["session_token"]},
    )
    assert "app" not in jwt.decode(
        exchanged.json()["access_token"],
        auth_settings.SECRET_KEY,
        algorithms=[ALGORITHM],
    )
    async_client.cookies.set(
        auth_settings.BROWSER_SESSION_COOKIE_NAME, body["session_token"]
    )
    assert (await async_client.get("/api/v1/auth/browser/session")).status_code == 200

    # A staff-app session is not the account session: it can't hand off.
    onward = await _start(async_client, body["session_token"], _state())
    assert onward.status_code == 401


@pytest.mark.asyncio
async def test_staff_apps_refuse_unapproved_accounts(async_client, db_async, seeded):
    _ = seeded
    secret = await _account_session(db_async, email="applicant@example.com")
    user = await service.get_user_by_email(
        session=db_async, email="applicant@example.com"
    )
    assert user is not None
    user.registration_pending = True
    db_async.add(user)
    await db_async.commit()
    response = await _start(async_client, secret, _state(), join=True, base=ADMIN)
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_legacy_login_cannot_claim_a_staff_app_session(async_client, db_async):
    user = User(
        email="staffer2@example.com",
        username="staffer2",
        first_name="Staff",
        last_name="Member",
        hashed_password=get_password_hash("Staff-password-123!"),
    )
    db_async.add(user)
    await db_async.commit()
    response = await async_client.post(
        "/api/v1/login/session",
        json={
            "email": "staffer2@example.com",
            "password": "Staff-password-123!",
            "app_name": "gaa-admin",
        },
    )
    assert response.status_code == 200
    assert response.json()["session"]["app_name"] is None
