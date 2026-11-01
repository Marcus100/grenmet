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
        prefix: str = "login",
    ) -> None:
        self._prefix = prefix
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

    def _fail_key(self, identifier: str) -> str:
        return f"{self._prefix}:fail:{identifier.strip().lower()}"

    def _lock_key(self, identifier: str) -> str:
        return f"{self._prefix}:lock:{identifier.strip().lower()}"

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

    async def allow(self, identifier: str) -> bool:
        """Count one attempt and say whether it is within the limit.

        One INCR decides, so concurrent requests cannot all pass a check made
        before any of them counted. Fails open like the rest of this class.
        """
        if not self._enabled:
            return True
        try:
            client = await self._get_client()
            if client is None:
                return True
            key = self._fail_key(identifier)
            count = await client.incr(key)
            if count == 1:
                await client.expire(key, self._window)
            return bool(count <= self._max)
        except Exception:
            # Fail open: a broken store must not block requests.
            logger.warning("Rate limit check failed; allowing request", exc_info=True)
            return True

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


def normalised_address(email: str) -> str:
    """The key for send limits: one mailbox, one key.

    Lowercase, the part after a "+" removed, and for Gmail the dots removed and
    googlemail.com treated as gmail.com. Only the key changes; mail still goes
    to the address the person typed.
    """
    local, _, domain = email.strip().lower().rpartition("@")
    local = local.split("+", 1)[0]
    if domain in {"gmail.com", "googlemail.com"}:
        domain = "gmail.com"
        local = local.replace(".", "")
    return f"{local}@{domain}"


# Emailed codes. Each limit fails open without Redis, like login lockout.
# Five code requests per mailbox per hour (email bombing).
email_code_send_limit = LoginLockout(
    redis_url=worker_settings.REDIS_URL,
    max_attempts=5,
    lockout_seconds=3600,
    window_seconds=3600,
    prefix="codesend",
)
# One code per mailbox per cooldown. A request inside the cooldown is ignored
# silently, so no one can replace a live code faster than this.
email_code_cooldown = LoginLockout(
    redis_url=worker_settings.REDIS_URL,
    max_attempts=1,
    lockout_seconds=60,
    window_seconds=60,
    prefix="codecool",
)
# Twenty code requests per client address per hour, across all mailboxes.
email_code_ip_limit = LoginLockout(
    redis_url=worker_settings.REDIS_URL,
    max_attempts=20,
    lockout_seconds=3600,
    window_seconds=3600,
    prefix="codeip",
)
# Password setup links (/auth/password/setup): the same mailbox rule as codes.
password_setup_send_limit = LoginLockout(
    redis_url=worker_settings.REDIS_URL,
    max_attempts=5,
    lockout_seconds=3600,
    window_seconds=3600,
    prefix="setupsend",
)
password_setup_ip_limit = LoginLockout(
    redis_url=worker_settings.REDIS_URL,
    max_attempts=20,
    lockout_seconds=3600,
    window_seconds=3600,
    prefix="setupip",
)


def rate_limit_store_warning() -> str | None:
    """Name the fail-open state when Redis is not configured outside local work."""
    if worker_settings.REDIS_URL or auth_settings.ENVIRONMENT == "local":
        return None
    return (
        "REDIS_URL is not set: the emailed-code send cap, code cooldown, per-IP code "
        "limit, password-setup link limits and login lockouts are DISABLED (they fail open)."
    )
