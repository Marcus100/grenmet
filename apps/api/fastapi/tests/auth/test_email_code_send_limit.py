"""Emailed sign-in codes: a per-address hourly send cap (email bombing).

The cap uses a fake Redis client, so no live Redis is needed. Past the cap the
endpoint answers exactly as it does for an unknown address, and no new code is
issued.
"""

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


@pytest.mark.asyncio
async def test_subject_line_does_not_carry_the_code(
    async_client, db_async, monkeypatch
):
    _ = db_async
    monkeypatch.setattr(app_service, "new_code", lambda: "123456")
    subjects: list[str] = []

    def capture(*, email_to, subject, html_content):  # noqa: ARG001
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
