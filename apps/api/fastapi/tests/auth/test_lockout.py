"""Login lockout tests (fakeredis — no live Redis, no DB)."""

from fakeredis import FakeAsyncRedis

from src.auth.lockout import LoginLockout


def _lockout(client: FakeAsyncRedis, max_attempts: int = 3) -> LoginLockout:
    return LoginLockout(
        redis_url=None,
        max_attempts=max_attempts,
        lockout_seconds=900,
        window_seconds=900,
        client=client,
    )


async def test_disabled_when_no_redis() -> None:
    lo = LoginLockout(
        redis_url=None, max_attempts=3, lockout_seconds=900, window_seconds=900
    )
    assert await lo.is_locked("a@b.com") is False
    await lo.record_failure("a@b.com")  # no-op, must not raise
    assert await lo.is_locked("a@b.com") is False


async def test_locks_after_max_attempts() -> None:
    lo = _lockout(FakeAsyncRedis(decode_responses=True), max_attempts=3)
    assert await lo.is_locked("u@x.com") is False
    await lo.record_failure("u@x.com")
    await lo.record_failure("u@x.com")
    assert await lo.is_locked("u@x.com") is False
    await lo.record_failure("u@x.com")  # third failure trips the lock
    assert await lo.is_locked("u@x.com") is True


async def test_reset_clears_lock() -> None:
    lo = _lockout(FakeAsyncRedis(decode_responses=True), max_attempts=2)
    await lo.record_failure("u@x.com")
    await lo.record_failure("u@x.com")
    assert await lo.is_locked("u@x.com") is True
    await lo.reset("u@x.com")
    assert await lo.is_locked("u@x.com") is False


async def test_identifier_is_case_insensitive() -> None:
    lo = _lockout(FakeAsyncRedis(decode_responses=True), max_attempts=1)
    await lo.record_failure("User@X.com")
    assert await lo.is_locked("  user@x.com ") is True
