"""Public accounts at auth.barrels.gd and staff access requests (ADR-0017)."""

import secrets

import pytest

from src.auth import app_service, service
from src.auth.config import auth_settings
from src.auth.models import User
from src.auth.utils import get_password_hash
from src.baseline.service import list_staff
from src.utils.datetime import utc_now
from tests.factories import make_user

PASSWORD = "Public-password-123!"
SECRET = "x" * 32


@pytest.fixture
async def seeded(monkeypatch, db_async):
    from src.auth.permissions import seed_permissions_and_roles_async

    await seed_permissions_and_roles_async(db_async)
    monkeypatch.setattr(auth_settings, "EVENTS_SSO_CLIENT_SECRET", SECRET)
    monkeypatch.setattr(auth_settings, "GAA_ADMIN_SSO_CLIENT_SECRET", SECRET)
    monkeypatch.setattr(app_service, "send_email", lambda **_: None)


async def _public_account(db_async, email="resident@example.com") -> User:
    """Verified, signed up, never approved for staff access."""
    user = User(
        email=email,
        username=email.split("@", 1)[0],
        first_name="Kezia",
        last_name="Mitchell",
        hashed_password=get_password_hash(PASSWORD),
        registration_pending=True,
        email_verification_required=True,
        email_verified_at=utc_now(),
    )
    db_async.add(user)
    await db_async.commit()
    return user


async def _sign_in(async_client, email="resident@example.com"):
    response = await async_client.post(
        "/api/v1/login/session", json={"email": email, "password": PASSWORD}
    )
    assert response.status_code == 200, response.text
    return response.json()


@pytest.mark.asyncio
async def test_public_accounts_sign_in_and_manage_only_their_account(
    async_client, db_async, seeded
):
    _ = seeded
    await _public_account(db_async)
    body = await _sign_in(async_client)
    headers = {"Authorization": f"Bearer {body['access_token']}"}

    me = await async_client.get("/api/v1/auth/users/me", headers=headers)
    assert me.status_code == 200
    assert me.json()["registration_pending"] is True
    assert (
        await async_client.get("/api/v1/auth/modern/security", headers=headers)
    ).status_code == 200
    assert (
        await async_client.get("/api/v1/auth/access/me", headers=headers)
    ).status_code == 200

    # Every staff route still refuses the account.
    for path in ["/api/v1/hr/profile/me", "/api/v1/auth/users"]:
        assert (await async_client.get(path, headers=headers)).status_code == 403

    # Exchange and refresh keep working without staff approval.
    exchanged = await async_client.post(
        "/api/v1/login/session/access-token",
        json={"session_token": body["session_token"]},
    )
    assert exchanged.status_code == 200
    refreshed = await async_client.post(
        "/api/v1/login/session/refresh",
        json={"session_token": body["session_token"]},
    )
    assert refreshed.status_code == 200

    # The cookie-authenticated staff routes refuse it too.
    async_client.cookies.set(
        auth_settings.BROWSER_SESSION_COOKIE_NAME,
        refreshed.json()["session_token"],
    )
    assert (await async_client.get("/api/v1/auth/browser/session")).status_code == 403


@pytest.mark.asyncio
async def test_public_accounts_join_public_apps_but_not_staff_apps(
    async_client, db_async, seeded
):
    _ = seeded
    await _public_account(db_async)
    account = (await _sign_in(async_client))["session_token"]

    def start(app, join=False):
        return async_client.post(
            f"/api/v1/auth/apps/{app}/handoff",
            json={
                "session_token": account,
                "state": secrets.token_urlsafe(24),
                "join": join,
            },
        )

    assert (await start("events")).status_code == 409
    assert (await start("events", join=True)).status_code == 200
    assert (await start("gaa-admin", join=True)).status_code == 403


@pytest.mark.asyncio
async def test_staff_access_requests_fill_the_approval_queue(
    async_client, db_async, seeded
):
    _ = seeded
    asking = await _public_account(db_async, email="asking@example.com")
    await _public_account(db_async, email="resident@example.com")
    staff = await make_user(db_async)
    headers = {
        "Authorization": "Bearer "
        + (await _sign_in(async_client, "asking@example.com"))["access_token"]
    }

    first = await async_client.post(
        "/api/v1/auth/users/me/staff-access-request", headers=headers
    )
    assert first.status_code == 200
    requested_at = first.json()["staff_access_requested_at"]
    assert requested_at is not None
    again = await async_client.post(
        "/api/v1/auth/users/me/staff-access-request", headers=headers
    )
    assert again.json()["staff_access_requested_at"] == requested_at

    queue = {row.user_id for row in await list_staff(db_async)}
    assert asking.id in queue
    assert staff.id in queue
    resident = await service.get_user_by_email(
        session=db_async, email="resident@example.com"
    )
    assert resident is not None
    assert resident.id not in queue


@pytest.fixture
def fixed_code(monkeypatch):
    monkeypatch.setattr(app_service, "new_code", lambda: "123456")


async def _code_sign_in(async_client, email, code="123456"):
    await async_client.post(
        "/api/v1/auth/modern/email-code/start",
        json={"email": email, "first_name": "Kezia", "last_name": "Mitchell"},
    )
    return await async_client.post(
        "/api/v1/auth/modern/email-code/verify", json={"email": email, "code": code}
    )


@pytest.mark.asyncio
async def test_email_code_opens_an_account_session_and_creates_accounts(
    async_client, db_async, seeded, fixed_code
):
    _ = (db_async, seeded, fixed_code)
    response = await _code_sign_in(async_client, "new.person@example.com")
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["session"]["app_name"] == "auth"
    headers = {"Authorization": f"Bearer {body['access_token']}"}
    me = await async_client.get("/api/v1/auth/users/me", headers=headers)
    assert me.status_code == 200
    assert me.json()["registration_pending"] is True
    assert (
        await async_client.get("/api/v1/hr/profile/me", headers=headers)
    ).status_code == 403

    wrong = await _code_sign_in(async_client, "new.person@example.com", "000000")
    assert wrong.status_code == 400


@pytest.mark.asyncio
async def test_email_code_respects_closed_sign_up(
    async_client, db_async, seeded, fixed_code, monkeypatch
):
    _ = (seeded, fixed_code)
    monkeypatch.setattr(auth_settings, "ALLOW_PUBLIC_SIGNUP", False)
    assert (await _code_sign_in(async_client, "nobody@example.com")).status_code == 400
    await _public_account(db_async, email="existing@example.com")
    assert (
        await _code_sign_in(async_client, "existing@example.com")
    ).status_code == 200


@pytest.mark.asyncio
async def test_information_sites_join_without_a_prompt(
    async_client, db_async, seeded, monkeypatch
):
    _ = seeded
    monkeypatch.setattr(auth_settings, "WEATHER_SSO_CLIENT_SECRET", SECRET)
    user = await _public_account(db_async)
    account = (await _sign_in(async_client))["session_token"]
    started = await async_client.post(
        "/api/v1/auth/apps/weather/handoff",
        json={"session_token": account, "state": secrets.token_urlsafe(24)},
    )
    assert started.status_code == 200, started.text
    assert await service.is_eligible_for_app(
        session=db_async, user=user, app_key="weather"
    )
