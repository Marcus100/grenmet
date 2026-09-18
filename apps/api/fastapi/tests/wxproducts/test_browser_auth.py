from datetime import timedelta
from uuid import uuid4

import pytest

from src.auth import service
from src.auth.browser import csrf_token
from src.auth.config import auth_settings
from src.auth.models import User
from src.config import settings
from tests.wxproducts.test_authoring import current_input
from tests.wxproducts.test_authoring import weather_sessions as weather_sessions
from tests.wxproducts.test_migrations import weather_engine as weather_engine


@pytest.fixture
async def browser_identity(db_async):
    user = User(
        email=f"browser-{uuid4()}@example.test",
        username=f"browser-{uuid4()}",
        hashed_password="unused-session-only-fixture",
        is_active=True,
        is_superuser=True,
        first_name="Browser",
        last_name="Author",
        registration_pending=False,
    )
    db_async.add(user)
    await db_async.commit()
    stored, secret = await service.create_session(session=db_async, user=user)
    return user, stored, secret


async def test_cookie_journey_and_bearer_compatibility(
    async_client, db_async, browser_identity, weather_sessions, monkeypatch
):
    assert weather_sessions is not None
    user, stored, secret = browser_identity
    monkeypatch.setattr(settings, "BACKEND_CORS_ORIGINS", ["http://browser.test"])
    cookie = {"cookie": f"{auth_settings.SESSION_COOKIE_NAME}={secret}"}
    session_response = await async_client.get(
        "/api/v1/auth/browser/session", headers=cookie
    )
    assert session_response.status_code == 200
    assert session_response.headers["cache-control"] == "no-store"
    assert secret not in session_response.text
    token = session_response.json()["csrfToken"]
    payload = current_input(action="draft").model_dump(mode="json")
    url = "/api/v1/wxproducts/products"
    for extra in [
        {},
        {"x-csrf-token": "wrong"},
        {"x-csrf-token": csrf_token("another-session")},
        {"x-csrf-token": token, "origin": "https://evil.test"},
    ]:
        result = await async_client.post(url, json=payload, headers=cookie | extra)
        assert result.status_code == 403
    headers = cookie | {"x-csrf-token": token, "origin": "http://browser.test"}
    saved = await async_client.post(url, json=payload, headers=headers)
    assert saved.status_code == 200, saved.text
    assert (
        await async_client.post(url, json=payload, headers=headers)
    ).status_code == 409
    history = await async_client.get(f"{url}/{payload['id']}/history", headers=cookie)
    assert history.json()["history"][0]["actorName"] == "Browser Author"
    for authorization in ["Bearer invalid", "Basic invalid"]:
        assert (
            await async_client.get(
                f"{url}/{payload['id']}/history",
                headers=cookie | {"authorization": authorization},
            )
        ).status_code == 401
    bearer, _ = service.issue_access_token_for_user(user=user)
    other = current_input(action="draft").model_dump(mode="json")
    assert (
        await async_client.post(
            url, json=other, headers={"authorization": f"Bearer {bearer}"}
        )
    ).status_code == 200
    await service.revoke_session(session=db_async, db_session=stored)
    assert (
        await async_client.get("/api/v1/auth/browser/session", headers=cookie)
    ).status_code == 401


@pytest.mark.parametrize(
    "condition,expected",
    [("expired", 401), ("inactive", 401), ("pending", 403), ("unverified", 403)],
)
async def test_cookie_rechecks_account_and_expiry(
    async_client, db_async, browser_identity, condition, expected
):
    user, stored, secret = browser_identity
    if condition == "expired":
        stored.expires_at -= timedelta(days=60)
        db_async.add(stored)
    elif condition == "inactive":
        user.is_active = False
    elif condition == "pending":
        user.registration_pending = True
    else:
        user.email_verification_required = True
        user.email_verified_at = None
    db_async.add(user)
    await db_async.commit()
    result = await async_client.get(
        "/api/v1/auth/browser/session",
        headers={"cookie": f"{auth_settings.SESSION_COOKIE_NAME}={secret}"},
    )
    assert result.status_code == expected
