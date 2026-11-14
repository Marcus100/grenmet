"""Request-path Redis clients must fail open, not hang, when Redis stops answering."""

import asyncio
import socket
from collections.abc import Generator

import pytest

from src.auth.lockout import LoginLockout
from src.worker.config import REQUEST_REDIS_TIMEOUT_SECONDS


@pytest.fixture
def silent_redis_url() -> Generator[str]:
    """A TCP server that accepts connections and never answers, like a hung Redis."""
    server = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    server.bind(("127.0.0.1", 0))
    server.listen(16)
    port = server.getsockname()[1]
    try:
        yield f"redis://127.0.0.1:{port}/0"
    finally:
        server.close()


async def test_lockout_client_has_request_timeouts(silent_redis_url: str) -> None:
    lo = LoginLockout(
        redis_url=silent_redis_url,
        max_attempts=3,
        lockout_seconds=900,
        window_seconds=900,
    )
    client = await lo._get_client()
    assert client is not None
    kwargs = client.connection_pool.connection_kwargs
    assert kwargs["socket_timeout"] == REQUEST_REDIS_TIMEOUT_SECONDS
    assert kwargs["socket_connect_timeout"] == REQUEST_REDIS_TIMEOUT_SECONDS


async def test_lockout_fails_open_when_redis_hangs(silent_redis_url: str) -> None:
    lo = LoginLockout(
        redis_url=silent_redis_url,
        max_attempts=3,
        lockout_seconds=900,
        window_seconds=900,
    )
    # Without the timeout this would wait forever; with it the check returns
    # "not locked" (fail open) within a few retries of the half-second timeout.
    async with asyncio.timeout(10):
        assert await lo.is_locked("someone@example.com") is False
