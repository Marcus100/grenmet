"""Organisation API keys: issue, rotate, revoke, list (ADR-0029, PF5).

The secret is ``bk_<8 hex prefix>_<32 random bytes, urlsafe>``. It is returned
once by ``create_key`` / ``rotate_key``; only its SHA-256 is stored. A key never
holds a scope its creator could not exercise: callers must already be organisation
admins or owners (the routes use ``OrgAdmin``) and the organisation must be
entitled to the scope's product.

Functions flush but never commit; the caller owns the transaction.
"""

import hashlib
import logging
import secrets
from dataclasses import dataclass
from datetime import timedelta

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from src.audit import service as audit_service
from src.auth.models import User
from src.utils.datetime import utc_now

from . import api_key_scopes, service
from .exceptions import (
    ApiKeyNotActiveError,
    ApiKeyNotFoundError,
    ApiKeyScopeInvalidError,
    ApiKeyScopeNotAllowedError,
)
from .models import ApiKey, new_api_key_id
from .schemas import ApiKeyCreate, ApiKeyRotate

logger = logging.getLogger(__name__)

SECRET_PREFIX = "bk_"
PREFIX_LENGTH = 8
MAX_LIFETIME_DAYS = 365
#: ``last_used_at`` is written at most this often per key.
LAST_USED_INTERVAL = timedelta(minutes=1)


@dataclass(frozen=True)
class NewSecret:
    secret: str
    prefix: str
    key_hash: str


def hash_secret(secret: str) -> str:
    return hashlib.sha256(secret.encode()).hexdigest()


def new_secret() -> NewSecret:
    prefix = secrets.token_hex(PREFIX_LENGTH // 2)
    secret = f"{SECRET_PREFIX}{prefix}_{secrets.token_urlsafe(32)}"
    return NewSecret(secret=secret, prefix=prefix, key_hash=hash_secret(secret))


def looks_like_secret(value: str) -> bool:
    """Cheap shape check so obvious JWTs and junk never reach the database."""
    if not value.startswith(SECRET_PREFIX) or len(value) > 128:
        return False
    parts = value.split("_", 2)
    return len(parts) == 3 and len(parts[1]) == PREFIX_LENGTH and bool(parts[2])


def is_active(key: ApiKey) -> bool:
    if key.revoked_at is not None:
        return False
    return key.expires_at is None or key.expires_at > utc_now()


async def _validate_scopes(
    session: AsyncSession, *, organisation_id: str, scopes: list[str]
) -> list[str]:
    unique = sorted(set(scopes))
    for scope in unique:
        if not api_key_scopes.is_valid(scope):
            raise ApiKeyScopeInvalidError(scope)
    for scope in unique:
        if not await service.is_app_enabled(
            session,
            organisation_id=organisation_id,
            app_key=api_key_scopes.product_of(scope),
        ):
            raise ApiKeyScopeNotAllowedError(scope)
    return unique


def _build(
    *,
    organisation_id: str,
    name: str,
    scopes: list[str],
    days: int,
    actor: User,
    secret: NewSecret,
    rotated_from_id: str | None = None,
) -> ApiKey:
    return ApiKey(
        id=new_api_key_id(),
        organisation_id=organisation_id,
        name=name,
        key_prefix=secret.prefix,
        key_hash=secret.key_hash,
        scopes=scopes,
        created_by_user_id=actor.id,
        expires_at=utc_now() + timedelta(days=min(days, MAX_LIFETIME_DAYS)),
        rotated_from_id=rotated_from_id,
    )


async def create_key(
    session: AsyncSession,
    actor: User,
    *,
    organisation_id: str,
    payload: ApiKeyCreate,
) -> tuple[ApiKey, str]:
    """Issue a key; returns the row and the one-time secret."""
    scopes = await _validate_scopes(
        session, organisation_id=organisation_id, scopes=payload.scopes
    )
    audit_service.set_actor(session, actor.id)
    secret = new_secret()
    key = _build(
        organisation_id=organisation_id,
        name=payload.name,
        scopes=scopes,
        days=payload.expires_in_days,
        actor=actor,
        secret=secret,
    )
    session.add(key)
    await session.flush()
    logger.info(
        "API key created", extra={"organisation_id": organisation_id, "key_id": key.id}
    )
    return key, secret.secret


async def get_key(
    session: AsyncSession, key_id: str, *, organisation_id: str | None
) -> ApiKey:
    """A key by id; ``organisation_id`` scopes the lookup (None = control plane)."""
    stmt = select(ApiKey).where(ApiKey.id == key_id)
    if organisation_id is not None:
        stmt = stmt.where(ApiKey.organisation_id == organisation_id)
    key = await session.scalar(stmt)
    if key is None:
        raise ApiKeyNotFoundError()
    return key


async def rotate_key(
    session: AsyncSession,
    actor: User,
    *,
    organisation_id: str,
    key_id: str,
    payload: ApiKeyRotate,
) -> tuple[ApiKey, str]:
    """Issue a successor with the same name and scopes; the old key stops working
    after ``overlap_hours`` (immediately for 0). Entitlements are re-checked, so
    rotation cannot carry a scope forward that the organisation lost."""
    old = await get_key(session, key_id, organisation_id=organisation_id)
    if not is_active(old):
        raise ApiKeyNotActiveError()
    scopes = await _validate_scopes(
        session, organisation_id=organisation_id, scopes=list(old.scopes)
    )
    audit_service.set_actor(session, actor.id)
    now = utc_now()
    if payload.overlap_hours == 0:
        old.revoked_at = now
    else:
        cutoff = now + timedelta(hours=payload.overlap_hours)
        if old.expires_at is None or cutoff < old.expires_at:
            old.expires_at = cutoff
    secret = new_secret()
    key = _build(
        organisation_id=organisation_id,
        name=old.name,
        scopes=scopes,
        days=payload.expires_in_days,
        actor=actor,
        secret=secret,
        rotated_from_id=old.id,
    )
    session.add(key)
    await session.flush()
    logger.info(
        "API key rotated",
        extra={"organisation_id": organisation_id, "key_id": key.id, "old": old.id},
    )
    return key, secret.secret


async def revoke_key(
    session: AsyncSession,
    actor: User,
    *,
    key_id: str,
    organisation_id: str | None,
) -> ApiKey:
    """Revoke now. Idempotent: a revoked key keeps its original ``revoked_at``."""
    key = await get_key(session, key_id, organisation_id=organisation_id)
    if key.revoked_at is None:
        audit_service.set_actor(session, actor.id)
        key.revoked_at = utc_now()
        await session.flush()
        logger.info(
            "API key revoked",
            extra={"organisation_id": key.organisation_id, "key_id": key.id},
        )
    return key


async def list_keys(
    session: AsyncSession,
    *,
    organisation_id: str | None,
    skip: int,
    limit: int,
) -> tuple[list[ApiKey], int]:
    filters = []
    if organisation_id is not None:
        filters.append(ApiKey.organisation_id == organisation_id)
    total = await session.scalar(
        select(func.count()).select_from(ApiKey).where(*filters)
    )
    rows = await session.scalars(
        select(ApiKey)
        .where(*filters)
        .order_by(ApiKey.created_at.desc(), ApiKey.id)
        .offset(skip)
        .limit(limit)
    )
    return list(rows), total or 0


async def touch_last_used(session: AsyncSession, key_id: str) -> bool:
    """Record a use, at most once per ``LAST_USED_INTERVAL`` per key.

    A single conditional ``UPDATE`` (no audit noise, no read-modify-write race);
    returns whether a row was written."""
    now = utc_now()
    result = await session.execute(
        update(ApiKey)
        .where(
            ApiKey.id == key_id,
            (ApiKey.last_used_at.is_(None))
            | (ApiKey.last_used_at < now - LAST_USED_INTERVAL),
        )
        .values(last_used_at=now)
    )
    return bool(getattr(result, "rowcount", 0))
