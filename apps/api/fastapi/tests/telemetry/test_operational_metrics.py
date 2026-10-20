import asyncio
from unittest.mock import AsyncMock, MagicMock

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


@pytest.mark.asyncio
async def test_outbox_dead_counter_is_disabled_by_default(monkeypatch):
    monkeypatch.setattr(metrics.settings, "ENABLED", False)
    client = MagicMock()
    monkeypatch.setattr(metrics, "_client", client)
    await metrics.record_outbox_dead("platform", "email.send")
    client.pipeline.assert_not_called()


@pytest.mark.asyncio
async def test_outbox_dead_counter_is_daily_per_outbox_and_topic(monkeypatch):
    monkeypatch.setattr(metrics.settings, "ENABLED", True)
    monkeypatch.setattr(metrics.settings, "ENVIRONMENT", "production")
    pipe = MagicMock()
    pipe.execute = AsyncMock()
    context = MagicMock()
    context.__aenter__ = AsyncMock(return_value=pipe)
    context.__aexit__ = AsyncMock(return_value=False)
    client = MagicMock()
    client.pipeline.return_value = context
    monkeypatch.setattr(metrics, "_client", client)
    await metrics.record_outbox_dead("platform", "email.send")
    key, field, amount = pipe.hincrby.call_args.args
    assert key.startswith("telemetry:v1:production:outbox:")
    assert (field, amount) == ("platform|email.send|dead", 1)
    pipe.expire.assert_called_once_with(key, 14 * 86400)
    # Unknown outboxes are ignored rather than creating new keys.
    await metrics.record_outbox_dead("someone-else", "x")
    assert pipe.hincrby.call_count == 1


@pytest.mark.asyncio
async def test_outbox_dead_counter_failure_is_swallowed(monkeypatch):
    monkeypatch.setattr(metrics.settings, "ENABLED", True)
    client = MagicMock()
    client.pipeline.side_effect = ConnectionError("down")
    monkeypatch.setattr(metrics, "_client", client)
    await metrics.record_outbox_dead("events", "listing.published")


@pytest.mark.asyncio
async def test_backlog_gauges_overwrite_one_hash(monkeypatch):
    monkeypatch.setattr(metrics.settings, "ENABLED", True)
    monkeypatch.setattr(metrics.settings, "ENVIRONMENT", "staging")
    client = AsyncMock()
    await metrics.record_outbox_backlog(client, "events", dead=2, stale_pending=3)
    key = client.hset.call_args.args[0]
    mapping = client.hset.call_args.kwargs["mapping"]
    assert key == "telemetry:v1:staging:outbox-backlog"
    assert (mapping["events|dead"], mapping["events|stale_pending"]) == (2, 3)
    client.hset.side_effect = ConnectionError("down")
    await metrics.record_outbox_backlog(client, "events", dead=0, stale_pending=0)
    await metrics.record_outbox_backlog(None, "events", dead=0, stale_pending=0)
