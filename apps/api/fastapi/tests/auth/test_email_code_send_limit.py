"""Emailed sign-in codes: a per-address hourly send cap (email bombing).

The cap uses a fake Redis client, so no live Redis is needed. Past the cap the
endpoint answers exactly as it does for an unknown address, and no new code is
issued.
"""

import asyncio
import logging
import time
from collections.abc import Iterator
from types import SimpleNamespace
from typing import Any

import pytest
import resend
from fakeredis import FakeAsyncRedis

from src import email as email_module
from src.auth import app_service
from src.auth.lockout import LoginLockout
from src.email_config import email_settings

BASE = "/api/v1/auth"

# Captured before conftest swaps send_email for a recorder.
_real_send_email = email_module.send_email


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
async def test_subject_line_starts_with_the_code(async_client, db_async, monkeypatch):
    _ = db_async
    monkeypatch.setattr(app_service, "new_code", lambda: "123456")
    subjects: list[str] = []

    bodies: list[str] = []

    def capture(*, email_to, subject, html_content):
        _ = email_to
        subjects.append(subject)
        bodies.append(html_content)

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
    # The code leads the subject so a mail app can offer "Copy code".
    assert subjects == ["123456 is your Barrels code"]
    # The body keeps the code, its lifetime and the line for an unexpected email.
    assert "123456" in bodies[0]
    assert "If you didn't ask for it, ignore this email." in bodies[0]
    # No link, image or tracking pixel: the email is the code and nothing else.
    assert "<a " not in bodies[0]
    assert "<img" not in bodies[0]


@pytest.fixture
def send_logs() -> Iterator[list[logging.LogRecord]]:
    """Every record the code email's send path can emit. Captured on the loggers
    themselves: caplog depends on test order (see tests/test_provider_health.py)."""
    captured: list[logging.LogRecord] = []

    class _Collect(logging.Handler):
        def emit(self, record: logging.LogRecord) -> None:
            captured.append(record)

    handler = _Collect(level=logging.DEBUG)
    targets = [
        logging.getLogger(name)
        for name in ("src.email", "src.auth.app_service", "src.provider_health")
    ]
    before = [(target.disabled, target.level) for target in targets]
    for target in targets:
        target.disabled = False
        target.setLevel(logging.DEBUG)
        target.addHandler(handler)
    try:
        yield captured
    finally:
        for target, (was_disabled, old_level) in zip(targets, before, strict=True):
            target.removeHandler(handler)
            target.disabled = was_disabled
            target.setLevel(old_level)


def _logged_text(records: list[logging.LogRecord]) -> str:
    """Everything a log handler would write: messages, arguments and tracebacks."""
    formatter = logging.Formatter()
    return "\n".join(
        f"{formatter.format(record)} {record.args!r}" for record in records
    )


@pytest.mark.asyncio
@pytest.mark.parametrize("provider_fails", [False, True])
async def test_sending_the_code_email_never_logs_the_code(
    monkeypatch, send_logs, provider_fails
):
    """The subject starts with the code, so no log line may carry the subject."""
    sent: list[dict[str, Any]] = []

    def provider(params: dict[str, Any]) -> dict[str, str]:
        sent.append(dict(params))
        if provider_fails:
            raise OSError(f"refused: {params['subject']}")
        return {"id": "re_1"}

    monkeypatch.setattr(app_service, "send_email", _real_send_email)
    monkeypatch.setattr(email_settings, "RESEND_API_KEY", "re_test")
    monkeypatch.setattr(email_settings, "EMAILS_FROM_EMAIL", "noreply@example.com")
    monkeypatch.setattr(resend.Emails, "send", provider)

    await app_service._deliver_code_email(
        email="reader@example.com",
        app_label="Barrels",
        code="574554",
        subject="574554 is your Barrels code",
    )

    # The provider did get the subject, so the logs below are of a real send.
    assert sent[0]["subject"] == "574554 is your Barrels code"
    assert send_logs, "expected the send to log its outcome"
    logged = _logged_text(send_logs)
    assert "574554" not in logged
    assert "is your Barrels code" not in logged


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
