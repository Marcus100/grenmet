"""Cached lookup of an organisation's verification, for other domains.

Events reads this per organiser from its own database session, so the check
opens a short main-database session instead of a cross-database join. Verify
and unverify clear the entry on this worker; other workers catch up within the
TTL. Kept apart from ``service`` because it needs the session factory.
"""

import time
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.audit import service as audit_service
from src.database import async_session_factory
from src.organisations.models import PlatformOrganisation
from src.utils.datetime import utc_now

CACHE_TTL_SECONDS = 30.0
_cache: dict[str, tuple[float, bool]] = {}


def clear_cache(organisation_id: str | None = None) -> None:
    if organisation_id is None:
        _cache.clear()
    else:
        _cache.pop(organisation_id, None)


async def organisation_is_verified(organisation_id: str) -> bool:
    now = time.monotonic()
    cached = _cache.get(organisation_id)
    if cached is not None and now - cached[0] < CACHE_TTL_SECONDS:
        return cached[1]
    async with async_session_factory() as session:
        verified_at = await session.scalar(
            select(PlatformOrganisation.verified_at).where(
                PlatformOrganisation.id == organisation_id
            )
        )
    verified = verified_at is not None
    _cache[organisation_id] = (now, verified)
    return verified


async def moderator_set_verified(
    session: AsyncSession,
    organisation_id: str,
    *,
    verified: bool,
    actor_id: uuid.UUID,
    source: str,
) -> None:
    """Apply a domain moderator's verification decision to the platform
    organisation, the single source of truth since C2. Idempotent: repeating
    the current state records nothing."""
    organisation = await session.get(PlatformOrganisation, organisation_id)
    if organisation is None or (organisation.verified_at is not None) == verified:
        return
    audit_service.set_actor(session, actor_id)
    organisation.verified_at = utc_now() if verified else None
    await audit_service.record_change(
        session,
        entity_type="platform_organisation",
        entity_id=organisation.id,
        record_type="platform_organisation",
        record_id=organisation.id,
        action="verify" if verified else "unverify",
        changes={"reason": (None, f"{source} moderator review")},
        organisation_id=organisation.id,
    )
    await session.commit()
    clear_cache(organisation_id)
