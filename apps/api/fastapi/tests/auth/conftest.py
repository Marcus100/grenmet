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
def no_shared_rate_limits(monkeypatch: pytest.MonkeyPatch) -> None:
    """Every limit counts in the live Redis; tests must not share that state.

    A test that exercises a limit builds its own limiter with a fake Redis and
    patches it in. These disabled limiters never touch Redis.
    """

    def disabled() -> LoginLockout:
        return LoginLockout(
            redis_url=None, max_attempts=10**6, lockout_seconds=1, window_seconds=1
        )

    for name in ("email_code_send_limit", "email_code_cooldown", "email_code_ip_limit"):
        monkeypatch.setattr(app_service, name, disabled())
    for name in ("password_setup_send_limit", "password_setup_ip_limit"):
        monkeypatch.setattr(modern_service, name, disabled())
