"""Shared ``Idempotency-Key`` support for requests that create something (ADR-0026).

``run_idempotent`` claims ``(scope, organisation_id, key)`` in the caller's
transaction by inserting a row, then runs the handler and stores its status code
and JSON body on that row. The claim commits or rolls back with the work itself:

* first call: the handler runs and its response is stored;
* same key and same request: the stored response is replayed (``replayed``);
* same key and a different request: 409 (``IdempotencyKeyReuseError``);
* concurrent duplicates: the second insert waits on the unique constraint until
  the first transaction ends, then replays (or runs, if the first rolled back).

Errors are never stored: a failed attempt rolls back its claim, so a retry runs
again. Stored bodies may hold personal data or one-time secrets (a booking's
manage token), so they live for ``TTL`` only; ``src.worker.retention`` purges
expired rows. Never log them.
"""

import hashlib
import json
import logging
import uuid
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Annotated, Any

import sqlalchemy as sa
from fastapi import Depends, Header, status
from sqlalchemy import ForeignKey, String, delete, select, update
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Mapped, mapped_column

from src.exceptions import AppException
from src.orm import Base
from src.utils.datetime import utc_now

logger = logging.getLogger(__name__)

TTL = timedelta(hours=24)
MAX_KEY_LENGTH = 255
HEADER_NAME = "Idempotency-Key"

#: What a handler returns: the HTTP status and a JSON-serialisable body.
HandlerResult = tuple[int, dict[str, Any]]


class IdempotencyKey(Base):
    __tablename__ = "idempotency_key"
    __table_args__ = (
        sa.UniqueConstraint(
            "scope",
            "organisation_id",
            "key",
            name="idempotency_key_scope_organisation_id_key_key",
        ),
        sa.Index("idempotency_key_expires_at_idx", "expires_at"),
        {"schema": "platform"},
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    scope: Mapped[str] = mapped_column(String(100))
    organisation_id: Mapped[str] = mapped_column(
        String(100), ForeignKey("org.organisation.id", ondelete="CASCADE")
    )
    key: Mapped[str] = mapped_column(String(MAX_KEY_LENGTH))
    request_hash: Mapped[str] = mapped_column(String(64))
    #: Null only while the claiming transaction is still running.
    status_code: Mapped[int | None]
    response: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    expires_at: Mapped[datetime]
    created_at: Mapped[datetime] = mapped_column(default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(default=utc_now, onupdate=utc_now)


class IdempotencyKeyRequiredError(AppException):
    def __init__(self) -> None:
        super().__init__(
            f"The {HEADER_NAME} header is required", status.HTTP_400_BAD_REQUEST
        )


class IdempotencyKeyReuseError(AppException):
    def __init__(self) -> None:
        super().__init__(
            f"This {HEADER_NAME} was already used with a different request",
            status.HTTP_409_CONFLICT,
        )


class IdempotencyInProgressError(AppException):
    def __init__(self) -> None:
        super().__init__(
            "A request with this key is still being processed; retry shortly",
            status.HTTP_409_CONFLICT,
        )


@dataclass(frozen=True)
class IdempotentResult:
    status_code: int
    body: dict[str, Any]
    replayed: bool


def hash_request(body: Any) -> str:
    """SHA-256 of the canonical JSON form (sorted keys, no whitespace)."""
    canonical = json.dumps(
        body, sort_keys=True, separators=(",", ":"), ensure_ascii=True, default=str
    )
    return hashlib.sha256(canonical.encode()).hexdigest()


def _clean_key(value: str | None, *, required: bool) -> str | None:
    key = (value or "").strip()
    if not key:
        if required:
            raise IdempotencyKeyRequiredError
        return None
    return key


def optional_idempotency_key(
    idempotency_key: Annotated[
        str | None,
        Header(
            alias=HEADER_NAME,
            max_length=MAX_KEY_LENGTH,
            description="Client-chosen key that makes a retried request safe.",
        ),
    ] = None,
) -> str | None:
    return _clean_key(idempotency_key, required=False)


def required_idempotency_key(
    idempotency_key: Annotated[
        str | None,
        Header(
            alias=HEADER_NAME,
            max_length=MAX_KEY_LENGTH,
            description=(
                "Required. Client-chosen key (for example a UUID) that makes a "
                "retried request safe."
            ),
        ),
    ] = None,
) -> str:
    key = _clean_key(idempotency_key, required=True)
    assert key is not None
    return key


OptionalIdempotencyKey = Annotated[str | None, Depends(optional_idempotency_key)]
RequiredIdempotencyKey = Annotated[str, Depends(required_idempotency_key)]


async def run_idempotent(
    session: AsyncSession,
    *,
    scope: str,
    organisation_id: str,
    key: str,
    request_body: Any,
    handler: Callable[[], Awaitable[HandlerResult]],
    now: datetime | None = None,
) -> IdempotentResult:
    """Run ``handler`` once per (scope, organisation, key); replay afterwards.

    The caller commits. ``request_body`` is any JSON-serialisable value that
    identifies the request (leave out per-attempt values such as CAPTCHA tokens).
    """
    now = now or utc_now()
    request_hash = hash_request(request_body)
    for _ in range(3):
        claim_id = await session.scalar(
            pg_insert(IdempotencyKey)
            .values(
                id=uuid.uuid4(),
                scope=scope,
                organisation_id=organisation_id,
                key=key,
                request_hash=request_hash,
                expires_at=now + TTL,
                created_at=now,
                updated_at=now,
            )
            .on_conflict_do_nothing(index_elements=["scope", "organisation_id", "key"])
            .returning(IdempotencyKey.id)
        )
        if claim_id is not None:
            return await _run_claimed(session, claim_id, handler)
        existing = await session.scalar(
            select(IdempotencyKey)
            .where(
                IdempotencyKey.scope == scope,
                IdempotencyKey.organisation_id == organisation_id,
                IdempotencyKey.key == key,
            )
            .execution_options(populate_existing=True)
        )
        if existing is None:
            continue  # the claiming transaction rolled back; claim it ourselves
        if existing.expires_at <= now:
            await session.execute(
                delete(IdempotencyKey).where(IdempotencyKey.id == existing.id)
            )
            continue
        if existing.request_hash != request_hash:
            raise IdempotencyKeyReuseError
        if existing.status_code is None or existing.response is None:
            raise IdempotencyInProgressError
        return IdempotentResult(existing.status_code, existing.response, replayed=True)
    raise IdempotencyInProgressError


async def _run_claimed(
    session: AsyncSession,
    claim_id: uuid.UUID,
    handler: Callable[[], Awaitable[HandlerResult]],
) -> IdempotentResult:
    try:
        status_code, body = await handler()
    except Exception:
        # Failures are never stored. Drop the claim so a caller that still
        # commits does not leave a half-finished key behind.
        try:
            await session.execute(
                delete(IdempotencyKey).where(IdempotencyKey.id == claim_id)
            )
        except SQLAlchemyError:
            logger.debug("Idempotency claim left for rollback")
        raise
    await session.execute(
        update(IdempotencyKey)
        .where(IdempotencyKey.id == claim_id)
        .values(status_code=status_code, response=body, updated_at=utc_now())
    )
    return IdempotentResult(status_code, body, replayed=False)
