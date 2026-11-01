"""Emailed sign-in codes: a per-address hourly send cap (email bombing).

The cap uses a fake Redis client, so no live Redis is needed. Past the cap the
endpoint answers exactly as it does for an unknown address, and no new code is
issued.
"""

import asyncio
import time
from types import SimpleNamespace

import pytest
from fakeredis import FakeAsyncRedis

from src.auth import app_service
from src.auth.lockout import LoginLockout

BASE = "/api/v1/auth"


@pytest.mark.asyncio
async def test_send_cap_stops_new_codes_and_keeps_the_reply(
    async_client, db_async, monkeypatch
):
    _ = db_async
    monkeypatch.setattr(app_service, "send_email", lambda **kwargs: None)
    limit = LoginLockout(
        redis_url=None,
        max_attempts=2,
        lockout_seconds=3600,
        window_seconds=3600,
        client=FakeAsyncRedis(decode_responses=True),
        prefix="codesend",
    )
    monkeypatch.setattr(app_service, "email_code_send_limit", limit)
    issued: list[str] = []
    real_issue = app_service._issue_code

    async def counting_issue(*args, **kwargs):
        issued.append(kwargs.get("target", ""))
        return await real_issue(*args, **kwargs)

    monkeypatch.setattr(app_service, "_issue_code", counting_issue)

    replies = []
    for _ in range(4):
        response = await async_client.post(
            f"{BASE}/email-code/start", json={"email": "bomb@example.com"}
        )
        assert response.status_code == 200
        replies.append(response.json())

    assert len(issued) == 2
    assert all(reply == replies[0] for reply in replies)


async def _drain_code_emails() -> None:
    if app_service._pending_code_emails:
        await asyncio.gather(*list(app_service._pending_code_emails))


@pytest.mark.asyncio
async def test_reply_does_not_wait_for_the_mail_provider(
    async_client, db_async, monkeypatch
):
    """A slow provider must not slow the reply, for a new address or a known one."""
    _ = db_async
    monkeypatch.setattr(app_service, "new_code", lambda: "123456")
    monkeypatch.setattr(
        app_service, "email_settings", SimpleNamespace(EMAILS_ENABLED=True)
    )

    def slow_send(**kwargs):
        _ = kwargs
        time.sleep(1.5)

    monkeypatch.setattr(app_service, "send_email", slow_send)
    started = time.perf_counter()
    response = await async_client.post(
        f"{BASE}/email-code/start", json={"email": "slow-provider@example.com"}
    )
    elapsed = time.perf_counter() - started
    assert response.status_code == 200
    assert elapsed < 1.0, f"reply waited {elapsed:.2f}s on the mail provider"
    await _drain_code_emails()


@pytest.mark.asyncio
async def test_subject_line_does_not_carry_the_code(
    async_client, db_async, monkeypatch
):
    _ = db_async
    monkeypatch.setattr(app_service, "new_code", lambda: "123456")
    subjects: list[str] = []

    def capture(*, email_to, subject, html_content):
        _ = (email_to, html_content)
        subjects.append(subject)

    monkeypatch.setattr(
        app_service, "email_settings", SimpleNamespace(EMAILS_ENABLED=True)
    )
    monkeypatch.setattr(app_service, "send_email", capture)
    monkeypatch.setattr(
        app_service, "email_settings", SimpleNamespace(EMAILS_ENABLED=True)
    )
    await async_client.post(
        f"{BASE}/email-code/start", json={"email": "subject@example.com"}
    )
    await _drain_code_emails()
    assert subjects == ["Your sign-in code"]
    assert "123456" not in subjects[0]


@pytest.mark.asyncio
async def test_code_sign_in_is_audited_without_secrets(
    async_client, db_async, monkeypatch
):
    from sqlalchemy import select

    from src.audit.models import AuditEntry

    monkeypatch.setattr(app_service, "new_code", lambda: "123456")
    monkeypatch.setattr(app_service, "send_email", lambda **kwargs: None)
    email = "audited@example.com"
    await async_client.post(f"{BASE}/email-code/start", json={"email": email})
    response = await async_client.post(
        f"{BASE}/email-code/verify", json={"email": email, "code": "123456"}
    )
    assert response.status_code == 200
    entries = (
        (
            await db_async.execute(
                select(AuditEntry).where(AuditEntry.action == "code_sign_in")
            )
        )
        .scalars()
        .all()
    )
    assert entries, "a code sign-in must leave an audit entry"
    assert all("123456" not in str(entry.changes) for entry in entries)


@pytest.mark.asyncio
async def test_privileged_code_sign_in_still_needs_the_authenticator(
    async_client, db_async, monkeypatch
):
    """The emailed code is the first factor; an enrolled authenticator is required too."""
    from src.auth.models import User

    monkeypatch.setattr(app_service, "new_code", lambda: "123456")
    monkeypatch.setattr(app_service, "send_email", lambda **kwargs: None)
    email = "admin-mfa@example.com"
    db_async.add(
        User(
            email=email,
            username="admin-mfa",
            first_name="Admin",
            last_name="Mfa",
            hashed_password="not-used",
            is_active=True,
            is_superuser=True,
            totp_enabled=True,
            totp_secret="JBSWY3DPEHPK3PXP",
        )
    )
    await db_async.commit()
    await async_client.post(f"{BASE}/email-code/start", json={"email": email})
    response = await async_client.post(
        f"{BASE}/email-code/verify", json={"email": email, "code": "123456"}
    )
    assert response.status_code == 400
    assert "Two-factor authentication code required" in response.json()["detail"]
    assert "access_token" not in response.json()
