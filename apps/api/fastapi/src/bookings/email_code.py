"""Emailed-code verification before a booking deposit (ADR-0018, issue #471).

A person who pays a deposit proves they control the booking email with a
6-digit code. Sign-in and browsing are never gated, and a booking without a
deposit has no step.

Flow: ``request_code`` (emails a code) -> ``confirm_code`` (returns a signed
proof) -> ``require_proof`` at booking create. Rules:

- The code is random, 6 digits, valid ``CODE_TTL`` seconds, stored only as an
  HMAC (keyed by a secret derived from ``SECRET_KEY``) in Redis, compared in
  constant time and deleted when used (single use).
- After ``MAX_ATTEMPTS`` wrong answers for one (organisation, email) the pair
  is locked for ``LOCK_TTL`` seconds. A resend does not reset the count, so
  asking for fresh codes cannot extend the guessing budget.
- At most ``SEND_LIMIT`` codes per (organisation, email) per hour, on top of
  the per-visitor route limits.
- The proof is a short-lived HMAC-signed token bound to organisation, email,
  service and start time. It is single use (its nonce is marked used when the
  booking is created and released if that booking fails), so it is not a
  session and cannot be replayed for another slot, email or organisation.
- Fail closed: if Redis is unavailable, no code is issued or accepted (503) and
  a deposit booking is refused.
- Redis keys hold only hashes. Codes and addresses are never logged.

Exempt (no step): a signed-in account whose email equals the booking email and
is verified, or was activated by an administrator (``is_admin_activated``).
"""

import base64
import hashlib
import hmac
import json
import logging
import secrets
import time
import uuid
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from datetime import datetime
from typing import Protocol

from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.config import auth_settings
from src.auth.email_verification import (
    EmailNotVerifiedError,
    is_admin_activated,
    is_email_verified,
)
from src.auth.models import User
from src.exceptions import AppException
from src.notifications import outbox_handlers
from src.utils.email_hash import hash_email, normalise_email
from src.worker.config import worker_settings

from . import emails

logger = logging.getLogger(__name__)

CODE_TTL = 600
PROOF_TTL = 900
MAX_ATTEMPTS = 5
LOCK_TTL = 900
SEND_LIMIT = 5
SEND_WINDOW = 3600
_PREFIX = "bk:ec:"


class CodeRateLimitedError(AppException):
    def __init__(self) -> None:
        super().__init__("Too many verification attempts. Try again later.", 429)


class CodeRejectedError(AppException):
    def __init__(self) -> None:
        super().__init__("That code is not right or has expired", 400)


class VerificationUnavailableError(AppException):
    def __init__(self) -> None:
        super().__init__("Email verification is unavailable. Try again later.", 503)


class CodeStore(Protocol):
    """Small key/value surface; any call may raise ``VerificationUnavailableError``."""

    async def put(self, key: str, value: str, ttl: int) -> None: ...
    async def get(self, key: str) -> str | None: ...
    async def take(self, key: str) -> bool: ...
    async def put_if_absent(self, key: str, value: str, ttl: int) -> bool: ...
    async def incr(self, key: str, ttl: int) -> int: ...
    async def exists(self, key: str) -> bool: ...


class RedisCodeStore:
    def __init__(self, url: str | None) -> None:
        self._url = url
        self._client: Redis | None = None

    def _redis(self) -> Redis:
        if not self._url:
            raise VerificationUnavailableError
        if self._client is None:
            self._client = Redis.from_url(self._url, decode_responses=True)
        return self._client

    async def _run[T](self, call: Callable[[Redis], Awaitable[T]]) -> T:
        try:
            return await call(self._redis())
        except AppException:
            raise
        except Exception:  # noqa: BLE001 - fail closed, never leak details
            logger.warning("booking email-code store failed", exc_info=True)
            raise VerificationUnavailableError from None

    async def put(self, key: str, value: str, ttl: int) -> None:
        await self._run(lambda r: r.set(key, value, ex=ttl))

    async def get(self, key: str) -> str | None:
        value: str | None = await self._run(lambda r: r.get(key))
        return value

    async def take(self, key: str) -> bool:
        removed = await self._run(lambda r: r.delete(key))
        return bool(removed == 1)

    async def put_if_absent(self, key: str, value: str, ttl: int) -> bool:
        return bool(await self._run(lambda r: r.set(key, value, ex=ttl, nx=True)))

    async def incr(self, key: str, ttl: int) -> int:
        async def run(r: Redis) -> int:
            count = int(await r.incr(key))
            if count == 1:
                await r.expire(key, ttl)
            return count

        return await self._run(run)

    async def exists(self, key: str) -> bool:
        return bool(await self._run(lambda r: r.exists(key)))


_store: CodeStore = RedisCodeStore(worker_settings.REDIS_URL)


def set_store(store: CodeStore) -> CodeStore:
    """Test seam: swap the store, returning the previous one."""
    global _store  # noqa: PLW0603
    previous, _store = _store, store
    return previous


# --- keys and signing ---------------------------------------------------------------


def _secret() -> bytes:
    return hmac.new(
        auth_settings.SECRET_KEY.encode(), b"bookings.email-code.v1", hashlib.sha256
    ).digest()


def _mac(*parts: str) -> str:
    return hmac.new(_secret(), "|".join(parts).encode(), hashlib.sha256).hexdigest()


@dataclass(frozen=True)
class Binding:
    organisation_id: str
    email_hash: str
    service_id: str
    starts_at: str  # naive UTC ISO

    @property
    def who(self) -> str:
        return hashlib.sha256(
            f"{self.organisation_id}|{self.email_hash}".encode()
        ).hexdigest()

    @property
    def slot(self) -> str:
        return hashlib.sha256(
            f"{self.who}|{self.service_id}|{self.starts_at}".encode()
        ).hexdigest()


def bind(
    organisation_id: object, email: str, service_id: object, starts_at: datetime
) -> Binding:
    return Binding(
        organisation_id=str(organisation_id),
        email_hash=hash_email(email),
        service_id=str(service_id),
        starts_at=starts_at.replace(tzinfo=None).isoformat(),
    )


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _unb64(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


def sign_proof(binding: Binding, *, now: float | None = None) -> str:
    claims = {
        "o": binding.organisation_id,
        "e": binding.email_hash,
        "s": binding.service_id,
        "t": binding.starts_at,
        "x": int((now if now is not None else time.time()) + PROOF_TTL),
        "n": secrets.token_urlsafe(12),
    }
    body = _b64(json.dumps(claims, separators=(",", ":"), sort_keys=True).encode())
    return f"{body}.{_mac('proof', body)}"


def _read_proof(proof: str, binding: Binding, now: float) -> str | None:
    """The nonce when ``proof`` is genuine, unexpired and bound to ``binding``."""
    body, _, signature = proof.partition(".")
    if not body or not signature:
        return None
    if not hmac.compare_digest(signature, _mac("proof", body)):
        return None
    try:
        claims = json.loads(_unb64(body))
        expected = {
            "o": binding.organisation_id,
            "e": binding.email_hash,
            "s": binding.service_id,
            "t": binding.starts_at,
        }
        if any(claims.get(k) != v for k, v in expected.items()):
            return None
        if int(claims["x"]) < now:
            return None
        return str(claims["n"])
    except ValueError, KeyError, TypeError:
        return None


# --- exemption ------------------------------------------------------------------------


async def is_exempt(session: AsyncSession, payer: User | None, email: str) -> bool:
    """A signed-in account that already vouches for this exact booking email."""
    if payer is None or normalise_email(payer.email) != normalise_email(email):
        return False
    return is_email_verified(payer) or await is_admin_activated(session, payer)


# --- request and confirm --------------------------------------------------------------


async def request_code(
    session: AsyncSession,
    binding: Binding,
    *,
    to_email: str,
    business: str,
) -> int:
    """Issue a code and queue its email. Returns the code lifetime in seconds."""
    store = _store
    if await store.exists(f"{_PREFIX}lock:{binding.who}"):
        raise CodeRateLimitedError
    sent = await store.incr(f"{_PREFIX}sent:{binding.who}", SEND_WINDOW)
    if sent > SEND_LIMIT:
        raise CodeRateLimitedError
    code = f"{secrets.randbelow(10**6):06d}"
    await store.put(
        f"{_PREFIX}code:{binding.slot}", _mac("code", binding.slot, code), CODE_TTL
    )
    subject, html = emails.verification_code(
        business=business, code=code, minutes=CODE_TTL // 60
    )
    await outbox_handlers.enqueue_email(
        session,
        to_email=to_email,
        subject=subject,
        html=html,
        transactional=True,
        dedupe_key=f"booking-email-code:{uuid.uuid4().hex}",
        organisation_id=binding.organisation_id,
    )
    return CODE_TTL


async def confirm_code(binding: Binding, code: str) -> tuple[str, int]:
    """Check ``code``; on success return ``(proof, lifetime seconds)``."""
    store = _store
    lock = f"{_PREFIX}lock:{binding.who}"
    if await store.exists(lock):
        raise CodeRateLimitedError
    key = f"{_PREFIX}code:{binding.slot}"
    stored = await store.get(key)
    expected = _mac("code", binding.slot, code)
    # Compare against a dummy when nothing is stored so timing does not differ.
    matches = hmac.compare_digest(stored or _mac("none"), expected) and bool(stored)
    # Single use: only the caller whose delete removed the key succeeds.
    if matches and await store.take(key):
        await store.take(f"{_PREFIX}fail:{binding.who}")
        return sign_proof(binding), PROOF_TTL
    failures = await store.incr(f"{_PREFIX}fail:{binding.who}", LOCK_TTL)
    if failures >= MAX_ATTEMPTS:
        await store.put(lock, "1", LOCK_TTL)
        await store.take(key)
        raise CodeRateLimitedError
    raise CodeRejectedError


# --- use at booking create ------------------------------------------------------------


@dataclass(frozen=True)
class ProofUse:
    """A consumed proof. ``release`` frees it again when the booking fails."""

    nonce: str | None

    async def release(self) -> None:
        if self.nonce is not None:
            try:
                await _store.take(f"{_PREFIX}used:{self.nonce}")
            except AppException:
                logger.warning("booking email proof could not be released")


async def require_proof(
    session: AsyncSession,
    binding: Binding,
    *,
    payer: User | None,
    email: str,
    proof: str | None,
    now: float | None = None,
) -> ProofUse:
    """Allow a deposit booking: exempt payer, or a valid unused proof (consumed).

    Raises ``EmailNotVerifiedError`` (403, ``email_verification_required``)
    otherwise."""
    if await is_exempt(session, payer, email):
        return ProofUse(None)
    if not proof:
        raise EmailNotVerifiedError("pay a deposit")
    moment = now if now is not None else time.time()
    nonce = _read_proof(proof, binding, moment)
    if nonce is None:
        raise EmailNotVerifiedError("pay a deposit")
    if not await _store.put_if_absent(f"{_PREFIX}used:{nonce}", "1", PROOF_TTL + 60):
        raise EmailNotVerifiedError("pay a deposit")
    return ProofUse(nonce)
