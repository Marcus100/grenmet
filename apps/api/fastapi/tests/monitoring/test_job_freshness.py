"""A stopped worker job must show in the freshness report and the probe (#1377).

Nothing watched an individual job before: ARQ jobs are wrapped for Sentry Crons but
``SENTRY_CRONS_ENABLED`` is unset in production, and the Better Stack heartbeat
notices the worker being down rather than one job failing.
"""

from datetime import timedelta
from typing import Any

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from src import operational_metrics
from src.monitoring import service
from src.monitoring.schemas import FeedStatus
from src.utils.datetime import utc_now

ALERTING_JOB = "enqueue_booking_reminders"
REPORTED_ONLY_JOB = "evaluate_paused_businesses"


def _rule(name: str) -> service.JobRule:
    return next(rule for rule in service.job_rules() if rule.name == name)


def test_every_rule_names_a_tracked_job() -> None:
    """A rule for an untracked name would never be written to, so it would read as
    NEVER for ever."""
    assert {rule.name for rule in service.job_rules()} <= operational_metrics.JOBS


def test_rule_names_are_unique() -> None:
    names = [rule.name for rule in service.job_rules()]
    assert len(names) == len(set(names))


def test_the_booking_jobs_a_customer_would_notice_alert() -> None:
    alerting = {rule.name for rule in service.job_rules() if rule.alerts}
    assert {
        "enqueue_booking_reminders",
        "expire_unpaid_bookings",
        "expire_pending_bookings",
        "complete_finished_bookings",
        "sweep_booking_uploads",
    } <= alerting


def test_job_status_follows_the_window() -> None:
    now = utc_now()
    rule = _rule(ALERTING_JOB)

    inside = service.job_status(
        rule, last_success=now - timedelta(minutes=1), now=now, telemetry_available=True
    )
    outside = service.job_status(
        rule,
        last_success=now - rule.max_age - timedelta(minutes=1),
        now=now,
        telemetry_available=True,
    )

    assert inside is FeedStatus.FRESH
    assert outside is FeedStatus.STALE


def test_a_job_that_never_ran_is_not_stale() -> None:
    """A fresh environment, or a Redis flush, leaves no time. That is unknown rather
    than broken, and must not alert."""
    now = utc_now()
    status = service.job_status(
        _rule(ALERTING_JOB), last_success=None, now=now, telemetry_available=True
    )
    assert status is FeedStatus.NEVER


def test_without_telemetry_a_job_is_unknown_not_stale() -> None:
    now = utc_now()
    status = service.job_status(
        _rule(ALERTING_JOB),
        last_success=now - timedelta(days=7),
        now=now,
        telemetry_available=False,
    )
    assert status is FeedStatus.UNKNOWN


def _all_fresh(now: Any) -> Any:
    async def successes() -> dict[str, Any]:
        return dict.fromkeys(operational_metrics.JOBS, now)

    return successes


def _feeds_fresh(now: Any) -> Any:
    async def successes() -> dict[str, Any]:
        return dict.fromkeys(operational_metrics.FEEDS, now)

    return successes


async def test_report_is_healthy_when_every_job_is_fresh(
    db_async: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    now = utc_now()
    monkeypatch.setattr(operational_metrics, "feed_successes", _feeds_fresh(now))
    monkeypatch.setattr(operational_metrics, "job_successes", _all_fresh(now))

    report = await service.freshness_report(db_async, now=now)

    assert report.healthy is True
    assert {job.name for job in report.jobs} == {
        rule.name for rule in service.job_rules()
    }
    assert all(job.status is FeedStatus.FRESH for job in report.jobs)


async def test_a_stale_alerting_job_makes_the_report_unhealthy_and_names_it(
    db_async: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    now = utc_now()
    stale_at = now - timedelta(days=1)

    async def one_stale() -> dict[str, Any]:
        return {
            name: (stale_at if name == ALERTING_JOB else now)
            for name in operational_metrics.JOBS
        }

    monkeypatch.setattr(operational_metrics, "feed_successes", _feeds_fresh(now))
    monkeypatch.setattr(operational_metrics, "job_successes", one_stale)

    report = await service.freshness_report(db_async, now=now)
    statuses = {job.name: job.status for job in report.jobs}

    assert statuses[ALERTING_JOB] is FeedStatus.STALE
    assert report.healthy is False
    assert f"job:{ALERTING_JOB}" in service.failing_checks(report)
    assert service.probe_report(report).healthy is False


async def test_a_stale_reported_only_job_does_not_alert(
    db_async: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    """It still shows on the monitoring screen; it just does not wake anyone."""
    now = utc_now()

    async def one_stale() -> dict[str, Any]:
        return {
            name: (now - timedelta(days=7) if name == REPORTED_ONLY_JOB else now)
            for name in operational_metrics.JOBS
        }

    monkeypatch.setattr(operational_metrics, "feed_successes", _feeds_fresh(now))
    monkeypatch.setattr(operational_metrics, "job_successes", one_stale)

    report = await service.freshness_report(db_async, now=now)
    statuses = {job.name: job.status for job in report.jobs}

    assert statuses[REPORTED_ONLY_JOB] is FeedStatus.STALE
    assert report.healthy is True
    assert service.failing_checks(report) == []


async def test_a_job_that_never_ran_leaves_the_report_healthy(
    db_async: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    now = utc_now()

    async def none_ran() -> dict[str, Any]:
        return {}

    monkeypatch.setattr(operational_metrics, "feed_successes", _feeds_fresh(now))
    monkeypatch.setattr(operational_metrics, "job_successes", none_ran)

    report = await service.freshness_report(db_async, now=now)

    assert all(job.status is FeedStatus.NEVER for job in report.jobs)
    assert report.healthy is True


async def test_job_success_round_trips_through_redis(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class FakeRedis:
        def __init__(self) -> None:
            self.hashes: dict[str, dict[bytes, bytes]] = {}

        async def hset(self, key: str, field: str, value: str) -> None:
            self.hashes.setdefault(key, {})[field.encode()] = value.encode()

        async def expire(self, key: str, ttl: int) -> bool:
            return ttl > 0

        async def hgetall(self, key: str) -> dict[bytes, bytes]:
            return dict(self.hashes.get(key, {}))

        async def eval(self, *_args: Any) -> None:
            return None

    fake = FakeRedis()
    monkeypatch.setattr(operational_metrics.settings, "ENABLED", True)
    monkeypatch.setattr(operational_metrics.settings, "ENVIRONMENT", "production")
    monkeypatch.setattr(operational_metrics, "_shared_client", lambda: fake)

    await operational_metrics.record_job(fake, ALERTING_JOB, "job-1", True)
    found = await operational_metrics.job_successes()

    assert found is not None
    assert set(found) == {ALERTING_JOB}
    assert found[ALERTING_JOB].tzinfo is not None
    assert "telemetry:v1:production:job-success" in fake.hashes


async def test_a_failed_run_does_not_refresh_the_last_success(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The point of the check: a job that keeps failing must still go stale."""

    class FakeRedis:
        def __init__(self) -> None:
            self.hashes: dict[str, dict[bytes, bytes]] = {}

        async def hset(self, key: str, field: str, value: str) -> None:
            self.hashes.setdefault(key, {})[field.encode()] = value.encode()

        async def expire(self, key: str, ttl: int) -> bool:
            return ttl > 0

        async def hgetall(self, key: str) -> dict[bytes, bytes]:
            return dict(self.hashes.get(key, {}))

        async def eval(self, *_args: Any) -> None:
            return None

    fake = FakeRedis()
    monkeypatch.setattr(operational_metrics.settings, "ENABLED", True)
    monkeypatch.setattr(operational_metrics.settings, "ENVIRONMENT", "production")
    monkeypatch.setattr(operational_metrics, "_shared_client", lambda: fake)

    await operational_metrics.record_job(fake, ALERTING_JOB, "job-1", False)

    assert await operational_metrics.job_successes() == {}


async def test_a_redis_failure_on_the_counter_still_records_the_success(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The counter and the last-success time are written separately on purpose."""

    class CounterBroken:
        def __init__(self) -> None:
            self.hashes: dict[str, dict[bytes, bytes]] = {}

        async def eval(self, *_args: Any) -> None:
            raise TimeoutError

        async def hset(self, key: str, field: str, value: str) -> None:
            self.hashes.setdefault(key, {})[field.encode()] = value.encode()

        async def expire(self, key: str, ttl: int) -> bool:
            return ttl > 0

        async def hgetall(self, key: str) -> dict[bytes, bytes]:
            return dict(self.hashes.get(key, {}))

    fake = CounterBroken()
    monkeypatch.setattr(operational_metrics.settings, "ENABLED", True)
    monkeypatch.setattr(operational_metrics.settings, "ENVIRONMENT", "production")
    monkeypatch.setattr(operational_metrics, "_shared_client", lambda: fake)

    await operational_metrics.record_job(fake, ALERTING_JOB, "job-1", True)

    assert set(await operational_metrics.job_successes() or {}) == {ALERTING_JOB}
