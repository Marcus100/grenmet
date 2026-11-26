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


class _Session:
    async def __aenter__(self) -> _Session:
        return self

    async def __aexit__(self, *_exc: object) -> None:
        return None

    async def commit(self) -> None:
        return None


def test_booking_jobs_are_tracked_by_the_operational_metrics() -> None:
    from src import operational_metrics

    assert {
        "enqueue_booking_reminders",
        "expire_unpaid_bookings",
        "expire_pending_bookings",
        "complete_finished_bookings",
        "evaluate_paused_businesses",
    } <= operational_metrics.JOBS


async def test_booking_jobs_report_check_ins_with_their_cron_schedule(
    monkeypatch: pytest.MonkeyPatch, checkins: list[dict[str, Any]]
) -> None:
    from src import database
    from src.bookings import deposits, lifecycle, paused, reminders

    async def no_reminders(_session: object) -> int:
        return 0

    async def no_expiries(_session: object) -> int:
        return 0

    monkeypatch.setattr(database, "async_session_factory", _Session)
    monkeypatch.setattr(reminders, "enqueue_due_reminders", no_reminders)
    monkeypatch.setattr(deposits, "expire_unpaid", no_expiries)
    monkeypatch.setattr(lifecycle, "expire_stale_requests", no_expiries)
    monkeypatch.setattr(lifecycle, "complete_finished_bookings", no_expiries)
    monkeypatch.setattr(paused, "evaluate_all", no_expiries)
    _enable(monkeypatch)

    assert await main.enqueue_booking_reminders({}) == 0
    assert await main.expire_unpaid_bookings({}) == 0
    assert await main.expire_pending_bookings({}) == 0
    assert await main.complete_finished_bookings({}) == 0
    assert await main.evaluate_paused_businesses({}) == 0

    by_slug = {c["monitor_slug"]: c for c in checkins if c["status"] == "ok"}
    reminder = by_slug["production-worker-enqueue-booking-reminders"]
    assert reminder["monitor_config"]["schedule"] == {
        "type": "crontab",
        "value": "7 * * * *",
    }
    expiry = by_slug["production-worker-expire-unpaid-bookings"]
    assert expiry["monitor_config"]["schedule"]["value"] == (
        "2,7,12,17,22,27,32,37,42,47,52,57 * * * *"
    )
    pending = by_slug["production-worker-expire-pending-bookings"]
    assert pending["monitor_config"]["schedule"]["value"] == (
        "4,9,14,19,24,29,34,39,44,49,54,59 * * * *"
    )
    completion = by_slug["production-worker-complete-finished-bookings"]
    assert completion["monitor_config"]["schedule"]["value"] == "27 * * * *"
    daily = by_slug["production-worker-evaluate-paused-businesses"]
    assert daily["monitor_config"]["schedule"]["value"] == "17 5 * * *"
    cron_job = next(
        job
        for job in main.WorkerSettings.cron_jobs
        if job.coroutine.__name__ == "evaluate_paused_businesses"
    )
    assert (cron_job.hour, cron_job.minute) == ({5}, {17})


def test_booking_jobs_keep_their_names() -> None:
    for job in (main.enqueue_booking_reminders, main.expire_unpaid_bookings):
        assert hasattr(job, "__wrapped__")
        assert job.__name__ == job.__wrapped__.__name__


def test_every_scheduled_arq_job_reports_check_ins() -> None:
    """A scheduled job with no monitor fails silently, so every cron job has one."""
    unmonitored = sorted(
        job.coroutine.__name__
        for job in main.WorkerSettings.cron_jobs
        if job.coroutine.__name__ not in cron_monitor.MONITORED
    )
    assert unmonitored == []


def test_manifest_scheduled_jobs_report_check_ins() -> None:
    from src.domains import worker_jobs

    manifest_jobs = {function.__name__ for function, job in worker_jobs() if job.cron}
    assert {"poll_flights", "purge_scan_log"} <= manifest_jobs
    assert manifest_jobs <= set(cron_monitor.MONITORED)


def test_monitor_schedules_are_utc_crontabs_without_seconds() -> None:
    for name, config in cron_monitor.MONITORED.items():
        assert config["schedule"]["type"] == "crontab", name
        assert config["timezone"] == "UTC", name
        assert len(config["schedule"]["value"].split()) == 5, name


def test_sub_minute_jobs_are_scheduled_once_a_minute() -> None:
    """Jobs that run every 30 seconds report at most once a minute (min interval)."""
    for function in (
        main.send_notification_emails,
        main.send_outbound_emails,
        main.send_wis2_publications,
    ):
        config = cron_monitor.MONITORED[function.__name__]
        assert config["schedule"]["value"] == "* * * * *", function.__name__


async def test_database_free_job_checks_in_with_its_schedule(
    monkeypatch: pytest.MonkeyPatch, checkins: list[dict[str, Any]]
) -> None:
    from src.environmental.config import environmental_settings

    # Marine is off in this run, so the job returns before any provider call.
    monkeypatch.setattr(
        type(environmental_settings), "marine_enabled", property(lambda _s: False)
    )
    _enable(monkeypatch)

    assert await main.fetch_marine_environment({}) == 0
    assert [c["status"] for c in checkins] == ["in_progress", "ok"]
    assert checkins[0]["monitor_slug"] == "production-worker-fetch-marine-environment"
    assert checkins[0]["monitor_config"]["schedule"]["value"] == ("20 1,7,13,19 * * *")
