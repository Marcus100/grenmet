"""App-scoped accounts and sessions (ADR-0016): Barrels Events first."""

import jwt
import pytest
from sqlalchemy import select

from src.auth import app_service, otp, service
from src.auth.config import auth_settings
from src.auth.models import Session as LoginSession
from src.auth.models import User
from src.auth.utils import ALGORITHM, create_access_token, get_password_hash
from src.exceptions import AppException

BASE = "/api/v1/auth/apps/events"


@pytest.fixture
async def fixed_code(monkeypatch, db_async):
    """Seed app roles, use a known code, and capture email instead of sending."""
    from src.auth.permissions import seed_permissions_and_roles_async

    await seed_permissions_and_roles_async(db_async)
    sent: list[dict[str, str]] = []
    monkeypatch.setattr(app_service, "new_code", lambda: "123456")
    monkeypatch.setattr(app_service, "send_email", lambda **kwargs: sent.append(kwargs))
    return sent


async def _sign_up(async_client, email="resident@example.com"):
    start = await async_client.post(
        f"{BASE}/email-code/start",
        json={"email": email, "first_name": "Kezia", "last_name": "Mitchell"},
    )
    assert start.status_code == 200, start.text
    return await async_client.post(
        f"{BASE}/email-code/verify", json={"email": email, "code": "123456"}
    )


def test_app_tokens_carry_the_app_claim():
    from datetime import timedelta

    token = create_access_token("abc", timedelta(minutes=5), app="events")
    claims = jwt.decode(token, auth_settings.SECRET_KEY, algorithms=[ALGORITHM])
    assert claims["app"] == "events"
    legacy = jwt.decode(
        create_access_token("abc", timedelta(minutes=5)),
        auth_settings.SECRET_KEY,
        algorithms=[ALGORITHM],
    )
    assert "app" not in legacy


def test_phone_codes_are_off_unless_configured(monkeypatch):
    monkeypatch.setattr(auth_settings, "PHONE_OTP_PROVIDER", "disabled")
    with pytest.raises(AppException):
        otp.send_code(phone="+14734401234", channel="sms", code="123456")


@pytest.mark.asyncio
async def test_sign_in_options_are_public(async_client, db_async):
    _ = db_async
    response = await async_client.get(BASE)
    assert response.status_code == 200
    body = response.json()
    assert body["key"] == "events"
    assert "email_code" in body["methods"]
    assert "phone" not in body["methods"]
    assert (await async_client.get("/api/v1/auth/apps/nope")).status_code == 404


@pytest.mark.asyncio
async def test_email_code_creates_member_with_only_the_events_role(
    async_client, db_async, fixed_code
):
    _ = fixed_code
    response = await _sign_up(async_client)
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["session"]["app_name"] == "events"
    claims = jwt.decode(
        body["access_token"], auth_settings.SECRET_KEY, algorithms=[ALGORITHM]
    )
    assert claims["app"] == "events"

    user = await service.get_user_by_email(
        session=db_async, email="resident@example.com"
    )
    assert user is not None
    assert user.first_name == "Kezia"
    assert user.registration_pending is True  # never passes the staff gate
    from src.auth.access import current

    access = await current(db_async, user)
    assert access.role_names == ["events-member"]
    assert "app.events.access" in access.permission_keys


@pytest.mark.asyncio
async def test_requesting_a_code_does_not_create_an_account(
    async_client, db_async, fixed_code
):
    _ = fixed_code
    await async_client.post(
        f"{BASE}/email-code/start", json={"email": "drive-by@example.com"}
    )
    assert (
        await service.get_user_by_email(session=db_async, email="drive-by@example.com")
        is None
    )


@pytest.mark.asyncio
async def test_resident_token_is_refused_by_staff_routes(
    async_client, db_async, fixed_code
):
    _ = (db_async, fixed_code)
    token = (await _sign_up(async_client)).json()["access_token"]
    staff = await async_client.get(
        "/api/v1/auth/users/me", headers={"Authorization": f"Bearer {token}"}
    )
    assert staff.status_code == 401


@pytest.mark.asyncio
async def test_resident_cannot_open_a_staff_session(async_client, db_async, fixed_code):
    _ = fixed_code
    await _sign_up(async_client)
    user = await service.get_user_by_email(
        session=db_async, email="resident@example.com"
    )
    assert user is not None
    with pytest.raises(AppException):
        await service.create_session(session=db_async, user=user, app_name="auth")


@pytest.mark.asyncio
async def test_app_session_exchange_and_refresh_keep_the_app_claim(
    async_client, db_async, fixed_code
):
    _ = (db_async, fixed_code)
    secret = (await _sign_up(async_client)).json()["session_token"]
    exchanged = await async_client.post(
        "/api/v1/login/session/access-token", json={"session_token": secret}
    )
    assert exchanged.status_code == 200
    claims = jwt.decode(
        exchanged.json()["access_token"],
        auth_settings.SECRET_KEY,
        algorithms=[ALGORITHM],
    )
    assert claims["app"] == "events"
    refreshed = await async_client.post(
        "/api/v1/login/session/refresh", json={"session_token": secret}
    )
    assert refreshed.status_code == 200
    assert refreshed.json()["session"]["app_name"] == "events"


@pytest.mark.asyncio
async def test_legacy_login_cannot_claim_an_app_name(async_client, db_async):
    user = User(
        email="staffer@example.com",
        username="staffer",
        first_name="Staff",
        last_name="Member",
        hashed_password=get_password_hash("Staff-password-123!"),
    )
    db_async.add(user)
    await db_async.commit()
    response = await async_client.post(
        "/api/v1/login/session",
        json={
            "email": "staffer@example.com",
            "password": "Staff-password-123!",
            "app_name": "events",
        },
    )
    assert response.status_code == 200
    assert response.json()["session"]["app_name"] is None


@pytest.mark.asyncio
async def test_codes_are_single_use_and_lock_after_wrong_guesses(
    async_client, db_async, fixed_code
):
    _ = (db_async, fixed_code)
    email = "guesser@example.com"
    await async_client.post(f"{BASE}/email-code/start", json={"email": email})
    for _attempt in range(app_service.MAX_CODE_ATTEMPTS):
        wrong = await async_client.post(
            f"{BASE}/email-code/verify", json={"email": email, "code": "000000"}
        )
        assert wrong.status_code == 400
    # Locked: even the right code no longer works.
    locked = await async_client.post(
        f"{BASE}/email-code/verify", json={"email": email, "code": "123456"}
    )
    assert locked.status_code == 400

    await async_client.post(f"{BASE}/email-code/start", json={"email": email})
    first = await async_client.post(
        f"{BASE}/email-code/verify", json={"email": email, "code": "123456"}
    )
    assert first.status_code == 200
    reused = await async_client.post(
        f"{BASE}/email-code/verify", json={"email": email, "code": "123456"}
    )
    assert reused.status_code == 400


@pytest.mark.asyncio
async def test_revoking_access_ends_app_sessions(async_client, db_async, fixed_code):
    _ = fixed_code
    secret = (await _sign_up(async_client)).json()["session_token"]
    user = await service.get_user_by_email(
        session=db_async, email="resident@example.com"
    )
    assert user is not None
    user.is_active = False
    db_async.add(user)
    await db_async.commit()
    response = await async_client.post(
        "/api/v1/login/session/access-token", json={"session_token": secret}
    )
    assert response.status_code == 401
    rows = (
        await db_async.execute(
            select(LoginSession).where(LoginSession.user_id == user.id)
        )
    ).scalars()
    assert all(row.revoked_at is not None for row in rows)


@pytest.mark.asyncio
async def test_phone_link_and_sign_in_with_console_provider(
    async_client, db_async, fixed_code, monkeypatch
):
    _ = (db_async, fixed_code)
    monkeypatch.setattr(auth_settings, "PHONE_OTP_PROVIDER", "console")
    token = (await _sign_up(async_client)).json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    phone = {"phone": "+14734401234", "channel": "whatsapp"}
    assert (
        await async_client.post(f"{BASE}/phone/link/start", json=phone, headers=headers)
    ).status_code == 200
    linked = await async_client.post(
        f"{BASE}/phone/link/verify",
        json={"phone": phone["phone"], "code": "123456"},
        headers=headers,
    )
    assert linked.status_code == 200, linked.text

    assert (
        await async_client.post(f"{BASE}/phone-code/start", json=phone)
    ).status_code == 200
    signed_in = await async_client.post(
        f"{BASE}/phone-code/verify", json={"phone": phone["phone"], "code": "123456"}
    )
    assert signed_in.status_code == 200
    assert signed_in.json()["session"]["app_name"] == "events"


@pytest.mark.asyncio
async def test_member_role_lacks_organiser_and_moderator_access(
    async_client, db_async, fixed_code
):
    _ = fixed_code
    await _sign_up(async_client)
    user = await service.get_user_by_email(
        session=db_async, email="resident@example.com"
    )
    assert user is not None
    for key, expected in (
        ("events.member.write", True),
        ("events.organiser.manage", False),
        ("events.moderate", False),
    ):
        assert (
            await service.has_effective_permission(
                session=db_async, user=user, permission_key=key
            )
            is expected
        )
