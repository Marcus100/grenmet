"""The per-address limit on code and setup mail (F1).

The auth web app calls the API from one server address, so the connecting
address is shared by every visitor. A host that holds the shared secret may name
the visitor in X-Visitor-IP, which these mail routes honour. Without a valid pair,
or with a forged X-Forwarded-For, no extra budget may be gained.
"""

import pytest
from fakeredis import FakeAsyncRedis

from src import rate_limit
from src.auth import app_service
from src.auth.lockout import LoginLockout

BASE = "/api/v1/auth"
SECRET = "s" * 40


def _limit(max_attempts: int) -> LoginLockout:
    return LoginLockout(
        redis_url=None,
        max_attempts=max_attempts,
        lockout_seconds=3600,
        window_seconds=3600,
        client=FakeAsyncRedis(decode_responses=True),
        prefix="codeip",
    )


@pytest.fixture
def issued(monkeypatch: pytest.MonkeyPatch) -> list[str]:
    monkeypatch.setattr(rate_limit.settings, "TRUSTED_WEB_SECRET", SECRET)
    monkeypatch.setattr(app_service, "email_code_ip_limit", _limit(2))
    monkeypatch.setattr(app_service, "send_email", lambda **kwargs: None)
    seen: list[str] = []
    real = app_service._issue_code

    async def counting(*args, **kwargs):
        seen.append(kwargs.get("target", ""))
        return await real(*args, **kwargs)

    monkeypatch.setattr(app_service, "_issue_code", counting)
    return seen


def _visitor(
    ip: str, *, secret: str | None = SECRET, forwarded: str | None = None
) -> dict[str, str]:
    headers = {"X-Visitor-IP": ip}
    if secret is not None:
        headers["X-Visitor-Secret"] = secret
    if forwarded is not None:
        headers["X-Forwarded-For"] = forwarded
    return headers


async def _start(async_client, email: str, headers: dict[str, str]) -> int:
    response = await async_client.post(
        f"{BASE}/email-code/start", json={"email": email}, headers=headers
    )
    return response.status_code


@pytest.mark.asyncio
async def test_shared_server_address_does_not_collapse_visitors(
    async_client, db_async, issued
):
    _ = db_async
    # Visitor A uses the whole budget of two; visitor B, same web host, is unaffected.
    for index in range(3):
        assert (
            await _start(
                async_client, f"a{index}@example.com", _visitor("198.51.100.10")
            )
            == 200
        )
    assert len(issued) == 2
    assert await _start(async_client, "b@example.com", _visitor("198.51.100.20")) == 200
    assert len(issued) == 3


@pytest.mark.asyncio
async def test_spoofed_leading_forwarded_for_grants_no_budget(
    async_client, db_async, issued
):
    _ = db_async
    # Same visitor, a new fake "client" in each X-Forwarded-For: still one bucket.
    for index in range(4):
        await _start(
            async_client,
            f"spoof{index}@example.com",
            _visitor("198.51.100.30", forwarded=f"203.0.113.{index}, 198.51.100.30"),
        )
    assert len(issued) == 2


@pytest.mark.asyncio
async def test_visitor_header_without_secret_is_ignored(async_client, db_async, issued):
    _ = db_async
    # No valid secret: X-Visitor-IP cannot choose the bucket, so rotating it gains nothing.
    for index in range(4):
        await _start(
            async_client,
            f"forged{index}@example.com",
            _visitor(
                f"198.51.100.{40 + index}",
                secret="wrong-secret-value-that-is-long-enough-x",
            ),
        )
    assert len(issued) == 2
