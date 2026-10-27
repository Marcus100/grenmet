"""Superusers hold Events moderator powers implicitly, so the staff MFA gate applies."""

from datetime import timedelta

import httpx
import pyotp
import pytest
from cryptography.fernet import Fernet
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth import service
from src.auth.config import auth_settings
from src.auth.utils import create_access_token
from src.main import app
from src.utils.datetime import utc_now
from tests.events.roles import user_with_role
from tests.events.support import BASE, SessionFactory
from tests.factories import make_user


@pytest.fixture(autouse=True)
def enforce(monkeypatch):
    monkeypatch.setattr(
        auth_settings, "AUTH_TOTP_ENCRYPTION_KEYS", [Fernet.generate_key().decode()]
    )
    monkeypatch.setattr(auth_settings, "AUTH_PRIVILEGED_MFA_MODE", "enforce")


async def _events_get(db_async, user, *, verified: bool) -> httpx.Response:
    row, _ = await service.create_session(
        session=db_async,
        user=user,
        app_name="events",
        enforce_approval=False,
        mfa_verified_at=utc_now() if verified else None,
    )
    token = create_access_token(
        user.id, timedelta(minutes=5), app="events", session_id=str(row.id)
    )
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        return await client.get(
            f"{BASE}/moderation/reports", headers={"Authorization": f"Bearer {token}"}
        )


@pytest.mark.asyncio
async def test_unenrolled_superuser_is_refused_on_a_moderator_route(
    events_db: SessionFactory, db_async: AsyncSession
):
    _ = events_db
    user = await make_user(db_async, superuser=True)
    response = await _events_get(db_async, user, verified=False)
    assert response.status_code == 403
    assert "(mfa_enrolment_required)" in response.json()["detail"]


@pytest.mark.asyncio
async def test_enrolled_superuser_and_ordinary_moderator_still_work(
    events_db: SessionFactory, db_async: AsyncSession
):
    _ = events_db
    superuser = await make_user(db_async, superuser=True)
    secret = await service.begin_totp_setup(session=db_async, user=superuser)
    assert await service.activate_totp(
        session=db_async, user=superuser, code=pyotp.TOTP(secret).now()
    )
    assert (await _events_get(db_async, superuser, verified=True)).status_code == 200
    moderator = await user_with_role(db_async, "events-moderator")
    assert (await _events_get(db_async, moderator, verified=False)).status_code == 200
