"""Join and leave apps from the auth.barrels.gd account (ADR-0017)."""

import pytest

from src.auth import app_service, service
from src.auth.config import auth_settings
from src.auth.models import User
from src.auth.utils import get_password_hash
from tests.auth.test_app_handoff import (
    ADMIN,
    CLIENT_SECRET,
    _account_session,
    _redeem,
    _start,
    _state,
)

BASE = "/api/v1/auth/account/apps"


@pytest.fixture
async def seeded(monkeypatch, db_async):
    from src.auth.permissions import seed_permissions_and_roles_async

    await seed_permissions_and_roles_async(db_async)
    monkeypatch.setattr(auth_settings, "EVENTS_SSO_CLIENT_SECRET", CLIENT_SECRET)
    monkeypatch.setattr(auth_settings, "GAA_ADMIN_SSO_CLIENT_SECRET", CLIENT_SECRET)
    monkeypatch.setattr(app_service, "new_code", lambda: "123456")
    monkeypatch.setattr(app_service, "send_email", lambda **_: None)


async def _list(async_client, secret):
    return await async_client.post(BASE, json={"session_token": secret})


def _by_key(response):
    return {app["key"]: app for app in response.json()}


async def _event_session(async_client, secret) -> str:
    """Join Events through the handoff and return the Events session secret."""
    state = _state()
    code = (await _start(async_client, secret, state, join=True)).json()["code"]
    redeemed = await _redeem(async_client, code, state)
    assert redeemed.status_code == 200, redeemed.text
    return redeemed.json()["session_token"]


@pytest.mark.asyncio
async def test_lists_apps_with_joined_state(async_client, db_async, seeded):
    _ = seeded
    secret = await _account_session(db_async)
    apps = _by_key(await _list(async_client, secret))
    assert apps["events"]["joined"] is False
    assert apps["events"]["can_leave"] is True
    # Staff apps are granted by an administrator, so they can't be left here.
    assert apps["gaa-admin"]["can_leave"] is False

    await _event_session(async_client, secret)
    assert _by_key(await _list(async_client, secret))["events"]["joined"] is True


@pytest.mark.asyncio
async def test_join_adds_the_default_role_without_a_handoff(
    async_client, db_async, seeded
):
    _ = seeded
    secret = await _account_session(db_async)
    joined = await async_client.post(
        f"{BASE}/events/join", json={"session_token": secret}
    )
    assert joined.status_code == 200, joined.text
    assert joined.json() == {"joined": True, "pending": False}
    assert _by_key(await _list(async_client, secret))["events"]["joined"] is True
    # Joining twice is harmless.
    again = await async_client.post(
        f"{BASE}/events/join", json={"session_token": secret}
    )
    assert again.status_code == 200


@pytest.mark.asyncio
async def test_leave_removes_access_and_ends_only_that_apps_sessions(
    async_client, db_async, seeded
):
    _ = seeded
    secret = await _account_session(db_async)
    events_secret = await _event_session(async_client, secret)

    left = await async_client.post(
        f"{BASE}/events/leave", json={"session_token": secret}
    )
    assert left.status_code == 200, left.text
    assert left.json() == {"left": True, "still_has_access": False}

    assert _by_key(await _list(async_client, secret))["events"]["joined"] is False
    # The Events session is gone; the account session still works.
    assert (
        await service.get_active_session_by_secret(
            session=db_async, session_secret=events_secret
        )
        is None
    )
    assert (
        await service.get_active_session_by_secret(
            session=db_async, session_secret=secret
        )
        is not None
    )
    # The handoff asks to join again.
    assert (await _start(async_client, secret, _state())).status_code == 409


@pytest.mark.asyncio
async def test_leave_is_idempotent(async_client, db_async, seeded):
    _ = seeded
    secret = await _account_session(db_async)
    for _attempt in range(2):
        response = await async_client.post(
            f"{BASE}/events/leave", json={"session_token": secret}
        )
        assert response.status_code == 200, response.text


@pytest.mark.asyncio
async def test_cannot_leave_a_staff_app(async_client, db_async, seeded):
    _ = seeded
    secret = await _account_session(db_async)
    response = await async_client.post(
        f"{BASE}/gaa-admin/leave", json={"session_token": secret}
    )
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_an_app_session_cannot_manage_memberships(async_client, db_async, seeded):
    _ = seeded
    secret = await _account_session(db_async)
    events_secret = await _event_session(async_client, secret)
    for path, body in (
        ("", {"session_token": events_secret}),
        ("/events/leave", {"session_token": events_secret}),
        ("/events/join", {"session_token": events_secret}),
    ):
        response = await async_client.post(f"{BASE}{path}", json=body)
        assert response.status_code == 401, path


@pytest.mark.asyncio
async def test_unknown_app_and_bad_session(async_client, db_async, seeded):
    _ = seeded
    secret = await _account_session(db_async)
    missing = await async_client.post(
        f"{BASE}/nope/leave", json={"session_token": secret}
    )
    assert missing.status_code == 404
    bad = await _list(async_client, "not-a-session")
    assert bad.status_code == 401


@pytest.mark.asyncio
async def test_leaving_events_does_not_touch_other_users(
    async_client, db_async, seeded
):
    _ = seeded
    first = await _account_session(db_async, "first@example.com")
    second = await _account_session(db_async, "second@example.com")
    first_events = await _event_session(async_client, first)
    second_events = await _event_session(async_client, second)

    await async_client.post(f"{BASE}/events/leave", json={"session_token": first})

    # Only the person who left lost their Events session and membership.
    assert (
        await service.get_active_session_by_secret(
            session=db_async, session_secret=first_events
        )
        is None
    )
    assert (
        await service.get_active_session_by_secret(
            session=db_async, session_secret=second_events
        )
        is not None
    )
    assert _by_key(await _list(async_client, second))["events"]["joined"] is True


async def _public_account(db_async, email="resident@example.com") -> tuple[User, str]:
    """A self-registered account: no staff approval, email not verified."""
    user = User(
        email=email,
        username=email.split("@", 1)[0],
        first_name="Public",
        last_name="Resident",
        hashed_password=get_password_hash("Resident-password-123!"),
        registration_pending=True,
        email_verification_required=True,
    )
    db_async.add(user)
    await db_async.commit()
    _, secret = await service.create_session(
        session=db_async, user=user, app_name="auth", enforce_approval=False
    )
    return user, secret


async def test_unverified_account_joins_self_service_apps_instantly(
    async_client, db_async, seeded
):
    _ = seeded
    user, secret = await _public_account(db_async)
    assert user.email_verified_at is None
    joined = await async_client.post(
        f"{BASE}/events/join", json={"session_token": secret}
    )
    assert joined.status_code == 200, joined.text
    assert joined.json() == {"joined": True, "pending": False}
    state = _state()
    started = await _start(async_client, secret, state)
    assert started.status_code == 200, started.text


async def test_admin_join_requests_access_and_waits_for_approval(
    async_client, db_async, seeded
):
    _ = seeded
    user, secret = await _public_account(db_async)

    asked = await _start(async_client, secret, _state(), base=ADMIN)
    assert asked.status_code == 409, asked.text
    assert asked.json()["detail"].startswith("Request access")
    assert user.staff_access_requested_at is None

    requested = await _start(async_client, secret, _state(), join=True, base=ADMIN)
    assert requested.status_code == 403
    assert requested.json()["detail"] == app_service.STAFF_REQUEST_PENDING
    await db_async.refresh(user)
    assert user.staff_access_requested_at is not None
    # Later visits keep waiting rather than asking again.
    again = await _start(async_client, secret, _state(), base=ADMIN)
    assert again.json()["detail"] == app_service.STAFF_REQUEST_PENDING
    admin = _by_key(await _list(async_client, secret))["gaa-admin"]
    assert admin == {
        "key": "gaa-admin",
        "label": admin["label"],
        "joined": False,
        "can_join": True,
        "pending": True,
        "can_leave": False,
    }

    # An administrator approves (email still unverified); the handoff works.
    user.registration_pending = False
    db_async.add(user)
    await db_async.commit()
    state = _state()
    approved = await _start(async_client, secret, state, base=ADMIN)
    assert approved.status_code == 200, approved.text
    assert _by_key(await _list(async_client, secret))["gaa-admin"]["joined"] is True


async def test_account_page_join_requests_admin_access(async_client, db_async, seeded):
    _ = seeded
    user, secret = await _public_account(db_async)
    joined = await async_client.post(
        f"{BASE}/gaa-admin/join", json={"session_token": secret}
    )
    assert joined.status_code == 200, joined.text
    assert joined.json() == {"joined": False, "pending": True}
    await db_async.refresh(user)
    assert user.staff_access_requested_at is not None and user.registration_pending


async def test_cms_is_granted_not_joined(async_client, db_async, seeded, monkeypatch):
    _ = seeded
    monkeypatch.setattr(auth_settings, "CMS_SSO_CLIENT_SECRET", CLIENT_SECRET)
    _, secret = await _public_account(db_async)
    cms = _by_key(await _list(async_client, secret))["cms"]
    assert cms["can_join"] is False and cms["joined"] is False
    refused = await async_client.post(
        f"{BASE}/cms/join", json={"session_token": secret}
    )
    assert refused.status_code == 403
