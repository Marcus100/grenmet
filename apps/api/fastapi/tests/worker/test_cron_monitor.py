"""Sentry Cron check-ins wrap key ARQ jobs and can never break them."""

from typing import Any

import pytest

from src.worker import cron_monitor, main
from src.worker.config import worker_settings


@pytest.fixture
def checkins(monkeypatch: pytest.MonkeyPatch) -> list[dict[str, Any]]:
    calls: list[dict[str, Any]] = []

    def capture(**kwargs: Any) -> str:
        calls.append(kwargs)
        return "check-in-1"

    monkeypatch.setattr(cron_monitor, "capture_checkin", capture)
    monkeypatch.setattr(cron_monitor, "_environment", lambda: "production")
    return calls


def _enable(monkeypatch: pytest.MonkeyPatch, *, initialised: bool = True) -> None:
    monkeypatch.setattr(worker_settings, "SENTRY_CRONS_ENABLED", True)
    monkeypatch.setattr(cron_monitor.sentry_sdk, "is_initialized", lambda: initialised)


def _job(**options: Any):
    @cron_monitor.monitored(
        schedule="*/5 * * * *", checkin_margin=5, max_runtime=5, **options
    )
    async def sample_job(ctx: dict[str, Any]) -> int:
        if ctx.get("fail"):
            raise RuntimeError("job failed")
        return 7

    return sample_job


def test_slugs_are_stable_and_environment_scoped() -> None:
    assert cron_monitor.slug("drain_outbox", "production") == (
        "production-worker-drain-outbox"
    )
    assert cron_monitor.slug("drain_outbox", "staging") == "staging-worker-drain-outbox"


async def test_noop_when_disabled_or_sentry_not_initialised(
    monkeypatch: pytest.MonkeyPatch, checkins: list[dict[str, Any]]
) -> None:
    assert await _job()({}) == 7
    _enable(monkeypatch, initialised=False)
    assert await _job()({}) == 7
    assert checkins == []


async def test_reports_in_progress_then_ok_with_upsert_config(
    monkeypatch: pytest.MonkeyPatch, checkins: list[dict[str, Any]]
) -> None:
    _enable(monkeypatch)
    assert await _job()({}) == 7
    assert [c["status"] for c in checkins] == ["in_progress", "ok"]
    assert {c["monitor_slug"] for c in checkins} == {"production-worker-sample-job"}
    assert checkins[1]["check_in_id"] == "check-in-1"
    assert checkins[0]["monitor_config"]["schedule"] == {
        "type": "crontab",
        "value": "*/5 * * * *",
    }


async def test_job_errors_are_reported_and_reraised(
    monkeypatch: pytest.MonkeyPatch, checkins: list[dict[str, Any]]
) -> None:
    _enable(monkeypatch)
    with pytest.raises(RuntimeError, match="job failed"):
        await _job()({"fail": True})
    assert [c["status"] for c in checkins] == ["in_progress", "error"]


async def test_checkin_failures_never_break_the_job(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _enable(monkeypatch)
    monkeypatch.setattr(cron_monitor, "_environment", lambda: "production")

    def broken(**_kwargs: Any) -> str:
        raise RuntimeError("transport down")

    monkeypatch.setattr(cron_monitor, "capture_checkin", broken)
    assert await _job()({}) == 7

    def no_settings() -> str:
        raise RuntimeError("settings unavailable")

    monkeypatch.setattr(cron_monitor, "_environment", no_settings)
    assert await _job()({}) == 7


async def test_sub_minute_jobs_report_at_most_once_per_interval(
    monkeypatch: pytest.MonkeyPatch, checkins: list[dict[str, Any]]
) -> None:
    _enable(monkeypatch)
    job = _job(min_interval_seconds=60)
    for _ in range(3):
        assert await job({}) == 7
    assert [c["status"] for c in checkins] == ["in_progress", "ok"]


def test_key_jobs_are_monitored_and_keep_their_names() -> None:
    for job in (
        main.process_cap_jobs,
        main.ingest_cap_feeds,
        main.drain_outbox,
        main.purge_expired_data,
    ):
        assert hasattr(job, "__wrapped__")
        # ARQ names jobs after the function; wrapping must not change it.
        assert job.__name__ == job.__wrapped__.__name__
