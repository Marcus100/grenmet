"""Worker jobs of the flights domain (listed in ``register.py``).

Task dependencies are imported inside each job: the worker health probe loads
``WorkerSettings`` (and so this module) without them.
"""

from typing import Any

from src import operational_metrics


async def poll_flights(ctx: dict[str, Any]) -> int:
    """Refresh cached OpenSky movements. Does nothing unless the flag is on."""
    from src.flights import service as flights_service
    from src.flights.config import flights_settings

    if not flights_settings.FLIGHTS_OPENSKY_ENABLED:
        return 0
    result = await flights_service.poll_flights()
    # A fully failed poll (nothing cached) is a failure for job metrics.
    healthy = bool(result)
    await operational_metrics.record_job(
        ctx.get("redis"), "poll_flights", str(ctx.get("job_id", "")), healthy
    )
    return sum(result.values())
