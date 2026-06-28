"""Redis-backed account lockout for the login path.

Fail-open by design: if Redis is unconfigured or unreachable, lockout is silently
disabled rather than blocking logins. This guarantees an infra problem can never lock
every user out. When REDIS_URL is unset (e.g. tests, simple dev) it is a no-op, so the
login flow is unchanged.
"""

from __future__ import annotations

import logging

from redis.asyncio import Redis

from src.auth.config import auth_settings
from src.worker.config import worker_settings

logger = logging.getLogger(__name__)


class LoginLockout:
    def __init__(
        self,
        *,
        redis_url: str | None,
        max_attempts: int,
        lockout_seconds: int,
        window_seconds: int,
        client: Redis | None = None,
    ) -> None:
        self._redis_url = redis_url
        self._max = max_attempts
        self._lock_ttl = lockout_seconds
        self._window = window_seconds
        self._client = client
        self._enabled = bool(redis_url or client is not None)

    async def _get_client(self) -> Redis | None:
        if self._client is not None:
            return self._client
        if not self._redis_url:
            return None
        self._client = Redis.from_url(self._redis_url, decode_responses=True)
        return self._client

    @staticmethod
    def _fail_key(identifier: str) -> str:
        return f"login:fail:{identifier.strip().lower()}"

    @staticmethod
    def _lock_key(identifier: str) -> str:
        return f"login:lock:{identifier.strip().lower()}"

    async def is_locked(self, identifier: str) -> bool:
        if not self._enabled:
            return False
        try:
            client = await self._get_client()
            if client is None:
                return False
            return bool(await client.exists(self._lock_key(identifier)))
        except Exception:  # noqa: BLE001 - fail open
            logger.warning("Login lockout check failed; allowing login", exc_info=True)
            return False

    async def record_failure(self, identifier: str) -> None:
        if not self._enabled:
            return
        try:
            client = await self._get_client()
            if client is None:
                return
            key = self._fail_key(identifier)
            count = await client.incr(key)
            if count == 1:
                await client.expire(key, self._window)
            if count >= self._max:
                await client.set(self._lock_key(identifier), "1", ex=self._lock_ttl)
        except Exception:  # noqa: BLE001 - fail open
            logger.warning("Login lockout record failed", exc_info=True)

    async def reset(self, identifier: str) -> None:
        if not self._enabled:
            return
        try:
            client = await self._get_client()
            if client is None:
                return
            await client.delete(self._fail_key(identifier), self._lock_key(identifier))
        except Exception:  # noqa: BLE001 - fail open
            logger.warning("Login lockout reset failed", exc_info=True)


login_lockout = LoginLockout(
    redis_url=worker_settings.REDIS_URL,
    max_attempts=auth_settings.LOGIN_MAX_FAILED_ATTEMPTS,
    lockout_seconds=auth_settings.LOGIN_LOCKOUT_SECONDS,
    window_seconds=auth_settings.LOGIN_FAILURE_WINDOW_SECONDS,
)
