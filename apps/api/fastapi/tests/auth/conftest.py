"""Auth tests capture outbound email instead of contacting delivery providers."""

import pytest

from src.auth import modern_service
from src.auth.routers import login, users


@pytest.fixture(autouse=True)
def auth_emails(monkeypatch: pytest.MonkeyPatch) -> list[dict[str, str]]:
    messages: list[dict[str, str]] = []

    def capture(**kwargs: str) -> None:
        messages.append(kwargs)

    for module in (modern_service, login, users):
        monkeypatch.setattr(module, "send_email", capture)
    return messages
