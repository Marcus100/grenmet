"""Feature flag management and evaluation (ADR-0020).

Evaluation reads every flag once into an in-process snapshot cached for 30
seconds (like ``organisations.verification``). Routers call ``clear_cache``
after committing a write; other workers catch up within the TTL. Management
functions flush and never commit; the router owns the transaction.
"""

import time
import uuid
from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.audit import service as audit_service
from src.auth.models import User
from src.config import settings
from src.utils.datetime import utc_now

from . import rules
from .exceptions import (
    FeatureFlagKeyTakenError,
    FeatureFlagNotFoundError,
    SuccessMetricRequiredError,
)
from .models import FeatureFlag
from .schemas import (
    FeatureFlagAdmin,
    FeatureFlagAudience,
    FeatureFlagCreate,
    FeatureFlagUpdate,
)

CACHE_TTL_SECONDS = 30.0

#: Nullable columns a PATCH may clear by sending null.
_CLEARABLE = ("success_metric", "owner", "expires_at", "review_by")


@dataclass(frozen=True)
class FlagDefinition:
    key: str
    enabled: bool
    exposed: bool
    audience: FeatureFlagAudience
    expires_at: datetime | None


@dataclass
class _Snapshot:
    """The flag definitions loaded at ``loaded_at`` (monotonic seconds)."""

    loaded_at: float = 0.0
    definitions: dict[str, FlagDefinition] | None = None


_cache = _Snapshot()


def clear_cache() -> None:
    _cache.definitions = None


async def _definitions(session: AsyncSession) -> dict[str, FlagDefinition]:
    now = time.monotonic()
    if _cache.definitions is not None and now - _cache.loaded_at < CACHE_TTL_SECONDS:
        return _cache.definitions
    rows = (await session.execute(select(FeatureFlag))).scalars().all()
    loaded = {
        row.key: FlagDefinition(
            key=row.key,
            enabled=row.enabled,
            exposed=row.exposed,
            audience=FeatureFlagAudience.model_validate(row.audience or {}),
            expires_at=row.expires_at,
        )
        for row in rows
    }
    _cache.loaded_at = now
    _cache.definitions = loaded
    return loaded


def _on(
    definition: FlagDefinition,
    *,
    organisation_id: str | None,
    user_id: uuid.UUID | None,
) -> bool:
    if not definition.enabled:
        return False
    if definition.expires_at is not None and definition.expires_at <= utc_now():
        return False
    return rules.evaluate(
        definition.audience,
        flag_key=definition.key,
        environment=settings.ENVIRONMENT,
        organisation_id=organisation_id,
        user_id=user_id,
    )


async def is_enabled(
    session: AsyncSession,
    key: str,
    *,
    organisation_id: str | None = None,
    user_id: uuid.UUID | None = None,
) -> bool:
    """Whether ``key`` is on for the subject. An unknown flag is off."""
    definition = (await _definitions(session)).get(key)
    if definition is None:
        return False
    return _on(definition, organisation_id=organisation_id, user_id=user_id)


async def evaluate_exposed(
    session: AsyncSession,
    *,
    organisation_id: str | None = None,
    user_id: uuid.UUID | None = None,
) -> dict[str, bool]:
    """Every client-exposed flag for the subject; internal flags never appear."""
    return {
        key: _on(definition, organisation_id=organisation_id, user_id=user_id)
        for key, definition in sorted((await _definitions(session)).items())
        if definition.exposed
    }


# ── Management ────────────────────────────────────────────────────────────────


def is_stale(flag: FeatureFlag) -> bool:
    now = utc_now()
    return (flag.expires_at is not None and flag.expires_at <= now) or (
        flag.review_by is not None and flag.review_by <= now
    )


def to_admin(flag: FeatureFlag) -> FeatureFlagAdmin:
    return FeatureFlagAdmin(
        id=flag.id,
        key=flag.key,
        description=flag.description,
        enabled=flag.enabled,
        exposed=flag.exposed,
        audience=FeatureFlagAudience.model_validate(flag.audience or {}),
        success_metric=flag.success_metric,
        owner=flag.owner,
        expires_at=flag.expires_at,
        review_by=flag.review_by,
        stale=is_stale(flag),
        created_at=flag.created_at,
        updated_at=flag.updated_at,
    )


def _check_enableable(enabled: bool, success_metric: str | None) -> None:
    if (
        enabled
        and settings.ENVIRONMENT != "local"
        and not (success_metric and success_metric.strip())
    ):
        raise SuccessMetricRequiredError()


async def get_flag(session: AsyncSession, flag_id: str) -> FeatureFlag:
    flag = await session.get(FeatureFlag, flag_id)
    if flag is None:
        raise FeatureFlagNotFoundError()
    return flag


async def list_flags(
    session: AsyncSession, *, offset: int, limit: int
) -> tuple[list[FeatureFlag], int]:
    total = await session.scalar(select(func.count()).select_from(FeatureFlag))
    rows = (
        (
            await session.execute(
                select(FeatureFlag)
                .order_by(FeatureFlag.key)
                .offset(offset)
                .limit(limit)
            )
        )
        .scalars()
        .all()
    )
    return list(rows), total or 0


async def list_stale(session: AsyncSession) -> list[FeatureFlag]:
    """Flags past their ``expires_at`` or ``review_by``: the cleanup list."""
    now = utc_now()
    rows = await session.execute(
        select(FeatureFlag)
        .where(
            or_(
                FeatureFlag.expires_at <= now,
                FeatureFlag.review_by <= now,
            )
        )
        .order_by(FeatureFlag.key)
    )
    return list(rows.scalars().all())


async def create_flag(
    session: AsyncSession, actor: User, payload: FeatureFlagCreate
) -> FeatureFlag:
    if await session.scalar(
        select(FeatureFlag.id).where(FeatureFlag.key == payload.key)
    ):
        raise FeatureFlagKeyTakenError()
    _check_enableable(payload.enabled, payload.success_metric)
    audit_service.set_actor(session, actor.id)
    flag = FeatureFlag(
        key=payload.key,
        description=payload.description,
        enabled=payload.enabled,
        exposed=payload.exposed,
        audience=payload.audience.model_dump(mode="json"),
        success_metric=payload.success_metric,
        owner=payload.owner,
        expires_at=payload.expires_at,
        review_by=payload.review_by,
    )
    session.add(flag)
    await session.flush()
    return flag


async def update_flag(
    session: AsyncSession, actor: User, flag_id: str, payload: FeatureFlagUpdate
) -> FeatureFlag:
    flag = await get_flag(session, flag_id)
    sent = payload.model_fields_set
    enabled = payload.enabled if payload.enabled is not None else flag.enabled
    metric = payload.success_metric if "success_metric" in sent else flag.success_metric
    _check_enableable(enabled, metric)
    audit_service.set_actor(session, actor.id)
    for name in _CLEARABLE:
        if name in sent:
            setattr(flag, name, getattr(payload, name))
    for name in ("description", "enabled", "exposed"):
        value = getattr(payload, name)
        if value is not None:
            setattr(flag, name, value)
    if payload.audience is not None:
        flag.audience = payload.audience.model_dump(mode="json")
    await session.flush()
    return flag


async def delete_flag(session: AsyncSession, actor: User, flag_id: str) -> None:
    flag = await get_flag(session, flag_id)
    audit_service.set_actor(session, actor.id)
    await session.delete(flag)
    await session.flush()
