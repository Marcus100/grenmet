import asyncio
from unittest.mock import AsyncMock

import pytest
from redis.exceptions import ConnectionError

from src import operational_metrics as metrics


def test_duration_buckets_are_coarse():
    assert [metrics.duration_bucket(s) for s in [0.01, 0.2, 1, 5]] == [
        "under-100ms",
        "under-500ms",
        "under-2s",
        "over-2s",
    ]


@pytest.mark.asyncio
async def test_job_counters_are_disabled_by_default(monkeypatch):
    monkeypatch.setattr(metrics.settings, "ENABLED", False)
    client = AsyncMock()
    await metrics.record_job(client, "process_cap_jobs", "job-1", True)
    client.eval.assert_not_called()


@pytest.mark.asyncio
async def test_counter_failure_does_not_fail_a_job(monkeypatch):
    monkeypatch.setattr(metrics.settings, "ENABLED", True)
    client = AsyncMock()
    client.eval.side_effect = ConnectionError("sensitive connection details")
    await metrics.record_job(client, "process_cap_jobs", "job-1", True)
    assert client.eval.call_count == 1


@pytest.mark.asyncio
async def test_job_keys_are_deterministic_and_environment_scoped(monkeypatch):
    monkeypatch.setattr(metrics.settings, "ENABLED", True)
    monkeypatch.setattr(metrics.settings, "ENVIRONMENT", "staging")
    client = AsyncMock()
    await metrics.record_job(client, "process_cap_jobs", "job-1", True)
    await metrics.record_job(client, "process_cap_jobs", "job-1", True)
    first, second = client.eval.call_args_list
    assert first.args[2] == second.args[2]
    assert "job-1" not in first.args[2]
    assert first.args[2].startswith("telemetry:v1:staging:seen:")
    assert first.args[-1] == 14 * 86400
    assert "SET" in first.args[0] and "NX" in first.args[0]
    await metrics.record_job(client, "unreviewed-private-job", "job-1", True)
    assert client.eval.call_count == 2


@pytest.mark.asyncio
async def test_timeout_is_bounded(monkeypatch):
    monkeypatch.setattr(metrics.settings, "ENABLED", True)
    client = AsyncMock()

    async def hang(*_args):
        await asyncio.sleep(10)

    client.eval.side_effect = hang
    await asyncio.wait_for(
        metrics.record_job(client, "process_cap_jobs", "job-1", True), timeout=0.2
    )
