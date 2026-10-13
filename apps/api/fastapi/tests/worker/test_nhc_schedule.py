"""A completed manual-request dispatch must not suppress later dispatches."""

from copy import deepcopy
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, Mock

import pytest
from arq.connections import ArqRedis
from arq.worker import Worker

from src.worker.nhc import NhcWorkerSettings


@pytest.mark.asyncio
async def test_nhc_dispatch_can_enqueue_after_a_previous_tick() -> None:
    pool = Mock(spec=ArqRedis)
    pool.enqueue_job = AsyncMock()
    cron_jobs = deepcopy(NhcWorkerSettings.cron_jobs)
    first_tick = datetime(2026, 10, 12, 0, 0, 5, tzinfo=UTC)
    cron_jobs[0].next_run = first_tick
    worker = Worker(
        functions=NhcWorkerSettings.functions,
        cron_jobs=cron_jobs,
        queue_name=NhcWorkerSettings.queue_name,
        redis_pool=pool,
        handle_signals=False,
        timezone=UTC,
    )

    await worker.run_cron(first_tick, delay=0.5)
    await worker.run_cron(first_tick + timedelta(seconds=5), delay=0.5)

    calls = pool.enqueue_job.await_args_list
    assert len(calls) == 2
    assert calls[0].kwargs["_job_id"] != calls[1].kwargs["_job_id"]
    assert all(call.args == ("cron:src.worker.nhc.drain_requests",) for call in calls)
    assert all(call.kwargs["_queue_name"] == "grenmet:nhc" for call in calls)
