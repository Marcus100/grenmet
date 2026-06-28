from collections.abc import Generator

import pytest


@pytest.fixture(scope="session", autouse=True)
def db() -> Generator[None, None, None]:
    """CAP unit tests do not need the legacy sync database fixture."""
    yield
