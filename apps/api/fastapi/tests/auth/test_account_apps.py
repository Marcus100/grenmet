"""Join and leave apps from the auth.barrels.gd account (ADR-0017)."""

import pytest

from src.auth import app_service, service
from src.auth.config import auth_settings
from tests.auth.test_app_handoff import (
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
    assert joined.json() == {"joined": True}
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
