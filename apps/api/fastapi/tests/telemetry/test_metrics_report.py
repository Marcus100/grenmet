from datetime import UTC, datetime

import pytest
from redis.exceptions import ConnectionError

from src import metrics_report, operational_metrics

NOW = datetime(2026, 10, 31, 4, 50, tzinfo=UTC)
ALL_JOBS = {
    "process_cap_jobs|completed": 8000,
    "ingest_cap_feeds|completed": 288,
    "send_notification_emails|completed": 2880,
    "send_notification_emails|failed": 1,
    "run_notification_sweeps|completed": 1,
}


class FakeRedis:
    def __init__(self, values=None, error=None):
        self.values = values or {}
        self.error = error
        self.keys: list[str] = []

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_args):
        return None

    async def hgetall(self, key):
        self.keys.append(key)
        if self.error:
            raise self.error
        return self.values


@pytest.fixture
def telemetry(monkeypatch):
    monkeypatch.setattr(operational_metrics.settings, "ENABLED", True)
    monkeypatch.setattr(operational_metrics.settings, "ENVIRONMENT", "staging")

    def install(fake):
        monkeypatch.setattr(
            metrics_report.Redis, "from_url", lambda *_args, **_kwargs: fake
        )
        return fake

    return install


@pytest.mark.asyncio
async def test_complete_day_reads_only_the_previous_utc_day_jobs_key(telemetry):
    fake = telemetry(FakeRedis(ALL_JOBS))
    result = await metrics_report.complete_day_report(NOW)
    assert fake.keys == ["telemetry:v1:staging:jobs:2026-10-30"]
    assert result["completeness"] == "complete"
    assert result["windowKind"] == "previous-UTC-day"
    assert result["days"] == 1
    assert result["start"] == "2026-10-30T00:00:00+00:00"
    assert result["end"] == "2026-10-31T00:00:00+00:00"
    assert result["jobs"] == ALL_JOBS
    assert result["requests"] is None


@pytest.mark.asyncio
async def test_complete_day_is_partial_when_a_tracked_job_is_missing(telemetry):
    jobs = {k: v for k, v in ALL_JOBS.items() if "run_notification_sweeps" not in k}
    telemetry(FakeRedis(jobs))
    result = await metrics_report.complete_day_report(NOW)
    assert result["completeness"] == "partial"


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "fake",
    [FakeRedis({}), FakeRedis(error=ConnectionError("private detail"))],
)
async def test_complete_day_is_unknown_without_counters(telemetry, fake):
    telemetry(fake)
    result = await metrics_report.complete_day_report(NOW)
    assert result["completeness"] == "unknown"
    assert result["jobs"] is None


@pytest.mark.asyncio
async def test_complete_day_is_unknown_when_telemetry_is_disabled(
    telemetry, monkeypatch
):
    fake = telemetry(FakeRedis(ALL_JOBS))
    monkeypatch.setattr(operational_metrics.settings, "ENABLED", False)
    result = await metrics_report.complete_day_report(NOW)
    assert result["completeness"] == "unknown"
    assert fake.keys == []


@pytest.mark.asyncio
async def test_rolling_window_is_never_reported_complete(telemetry):
    telemetry(FakeRedis(ALL_JOBS))
    result = await metrics_report.report(1)
    assert result["completeness"] == "partial"
