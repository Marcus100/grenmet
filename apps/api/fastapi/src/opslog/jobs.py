"""Worker jobs of the opslog domain (listed in ``register.py``).

Task dependencies are imported inside each job: the worker health probe loads
``WorkerSettings`` (and so this module) without them.
"""

from typing import Any

from src.worker.cron_monitor import monitored


@monitored(schedule="5 10 * * *", checkin_margin=30, max_runtime=60)
async def send_opslog_daily_summaries(_ctx: dict[str, Any]) -> int:
    """Tell each subscriber what was written in their logs in the last 24 hours."""
    from src.database import async_session_factory
    from src.opslog import summary
    from src.utils.datetime import utc_now

    async with async_session_factory() as session:
        told = await summary.send_daily_summaries(session, now=utc_now())
    return told
