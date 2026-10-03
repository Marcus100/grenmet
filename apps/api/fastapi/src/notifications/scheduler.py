"""Daily reminder sweep: runs every module's registered sweep (expiries, overdue).

Sweeps must be idempotent (``notify(..., dedupe_key=...)``) because the job can be
re-run, e.g. after a worker restart.
"""

import logging

from sqlalchemy.ext.asyncio import AsyncSession

from . import events

logger = logging.getLogger(__name__)


async def run_sweeps(session: AsyncSession) -> int:
    """Run each sweep in its own transaction; one failing sweep never blocks another."""
    total = 0
    for sweep in events.sweeps():
        try:
            total += await sweep(session)
            await session.commit()
        except Exception:  # noqa: BLE001 - isolate module failures
            await session.rollback()
            logger.exception(
                "Notification sweep failed", extra={"sweep": sweep.__qualname__}
            )
    logger.info("Notification sweep finished", extra={"notified": total})
    return total
