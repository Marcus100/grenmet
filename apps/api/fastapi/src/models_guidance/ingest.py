"""Worker-side fetch of the latest model runs (idempotent, retry-safe).

A run is stored only when every step downloaded, in one transaction, so a
failed attempt leaves nothing behind and the next hourly poll tries again.
"""

import logging
from collections.abc import Callable
from contextlib import AbstractAsyncContextManager

from sqlalchemy.ext.asyncio import AsyncSession

from . import providers, service
from .config import guidance_settings

logger = logging.getLogger(__name__)

type SessionFactory = Callable[[], AbstractAsyncContextManager[AsyncSession]]


async def refresh_model(
    session_factory: SessionFactory,
    model: str,
    fetcher: providers.RunFetcher | None = None,
) -> str:
    """Fetch ``model``'s newest run if it is not stored. Returns the outcome."""
    fetcher = fetcher or providers.fetcher_for(model)
    points = service.configured_points()
    run_time = await fetcher.latest_run()
    if run_time is None:
        return "unavailable"
    async with session_factory() as session:
        if await service.run_exists(session, model, run_time):
            return "current"
    readings = await fetcher.fetch_run(run_time, points)
    async with session_factory() as session:
        stored = await service.store_run(
            session, model=model, run_time=run_time, readings=readings, points=points
        )
        if stored is None:
            return "empty"
        await session.commit()
    logger.info(
        "Stored model guidance run",
        extra={"model": model, "run_time": run_time.isoformat()},
    )
    return "stored"


async def refresh_all(session_factory: SessionFactory) -> dict[str, str]:
    """Refresh every enabled model; one model failing never blocks the others."""
    outcomes: dict[str, str] = {}
    for model in guidance_settings.enabled_models():
        try:
            outcomes[model] = await refresh_model(session_factory, model)
        except Exception:  # isolate providers; logged (and reported to Sentry) below
            logger.exception("Model guidance fetch failed", extra={"model": model})
            outcomes[model] = "error"
    async with session_factory() as session:
        await service.prune(session, retention_days=guidance_settings.RETENTION_DAYS)
        await session.commit()
    return outcomes
