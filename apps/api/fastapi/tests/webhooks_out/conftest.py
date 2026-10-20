import pytest
from cryptography.fernet import Fernet

from src.organisations.config import organisations_settings
from tests.webhooks_out.support import Receiver, Resolver


@pytest.fixture(autouse=True)
def secret_keys(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        organisations_settings,
        "ORG_SECRET_ENCRYPTION_KEYS",
        [Fernet.generate_key().decode()],
    )


@pytest.fixture
def resolver(monkeypatch: pytest.MonkeyPatch) -> Resolver:
    return Resolver(monkeypatch)


@pytest.fixture
def receiver(monkeypatch: pytest.MonkeyPatch, resolver: Resolver) -> Receiver:
    _ = resolver
    return Receiver(monkeypatch)
