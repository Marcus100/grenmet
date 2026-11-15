"""Worker jobs of the printix domain (listed in ``register.py``).

Task dependencies are imported inside each job: the worker health probe loads
``WorkerSettings`` (and so this module) without them.
"""

from typing import Any

from src import operational_metrics


async def purge_scan_log(ctx: dict[str, Any]) -> int:
    """Delete scan-log rows of events closed more than 90 days ago (ADR-0060)."""
    from src.database import async_session_factory
    from src.printix import service
    from src.utils.datetime import utc_now

    async with async_session_factory() as session:
        deleted = await service.purge_scan_log(session, now=utc_now())
    await operational_metrics.record_job(
        ctx.get("redis"), "purge_scan_log", str(ctx.get("job_id", "")), True
    )
    return deleted
