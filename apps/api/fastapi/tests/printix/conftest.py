"""Fixtures for the printix organiser tests (ADR-0060 organiser amendment).

``_totp_keys`` is autouse so every organiser test can enrol an authenticator; ``world``
is the two-organisation, three-event set the organiser tests share."""

import uuid
from typing import Any

import pytest
from cryptography.fernet import Fernet
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.config import auth_settings

from .org_support import _event, _org


@pytest.fixture(autouse=True)
def _totp_keys(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        auth_settings, "AUTH_TOTP_ENCRYPTION_KEYS", [Fernet.generate_key().decode()]
    )


@pytest.fixture
async def world(db_async: AsyncSession) -> dict[str, Any]:
    """Two organisations, one event each, and one event with no organisation."""
    org_a = await _org(db_async, f"Printix A {uuid.uuid4().hex[:6]}")
    org_b = await _org(db_async, f"Printix B {uuid.uuid4().hex[:6]}")
    return {
        "org_a": org_a,
        "org_b": org_b,
        "ev_a": await _event(db_async, "Gala A", org_a),
        "ev_b": await _event(db_async, "Gala B", org_b),
        "ev_none": await _event(db_async, "Gala none", None),
    }
