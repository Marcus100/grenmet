"""Auth tests capture outbound email instead of contacting delivery providers."""

import pytest

from src.auth import app_service, devices, modern_service
from src.auth.lockout import LoginLockout
from src.auth.routers import login, users


@pytest.fixture(autouse=True)
def auth_emails(monkeypatch: pytest.MonkeyPatch) -> list[dict[str, str]]:
    messages: list[dict[str, str]] = []

    def capture(**kwargs: str) -> None:
        messages.append(kwargs)

    for module in (devices, modern_service, login, users):
        monkeypatch.setattr(module, "send_email", capture)
    return messages


@pytest.fixture(autouse=True)
def no_shared_code_send_cap(monkeypatch: pytest.MonkeyPatch) -> None:
    """The email-code send cap counts in the live Redis; tests must not share it.

    A test that exercises the cap builds its own limiter with a fake Redis.
    """
    monkeypatch.setattr(
        app_service,
        "email_code_send_limit",
        LoginLockout(
            redis_url=None, max_attempts=5, lockout_seconds=1, window_seconds=1
        ),
    )
