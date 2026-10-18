"""Cached lookup of an organisation's verification, for other domains.

Events reads this per organiser from its own database session, so the check
opens a short main-database session instead of a cross-database join. Verify
and unverify clear the entry on this worker; other workers catch up within the
TTL. Kept apart from ``service`` because it needs the session factory.
"""

import time

from sqlalchemy import select

from src.database import async_session_factory
from src.organisations.models import PlatformOrganisation

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
