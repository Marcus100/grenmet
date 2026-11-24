"""Ingest freshness and the email backlog for uptime monitors and the staff screen."""

from datetime import timedelta
from typing import Any

import httpx
import pytest
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from src import operational_metrics, outbox
from src.monitoring import service
from src.monitoring.schemas import FeedStatus
from src.outbox import Outbox, OutboxStatus
from src.utils.datetime import utc_now

ENDPOINT = "/api/v1/monitoring/admin/freshness"
WINDOW = timedelta(minutes=20)
ON = service.FeedRule("feed", WINDOW, lambda: True)
OFF = service.FeedRule("feed", WINDOW, lambda: False)


def test_feed_status_follows_the_window() -> None:
    now = utc_now()
    assert (
        service.feed_status(
            ON,
            last_success=now - timedelta(minutes=5),
            now=now,
            telemetry_available=True,
        )
        == FeedStatus.FRESH
    )
    assert (
        service.feed_status(
            ON,
            last_success=now - timedelta(minutes=21),
            now=now,
            telemetry_available=True,
        )
        == FeedStatus.STALE
    )
    assert (
        service.feed_status(ON, last_success=None, now=now, telemetry_available=True)
        == FeedStatus.NEVER
    )


def test_unknown_and_disabled_feeds_are_not_reported_as_stale() -> None:
    now = utc_now()
    assert (
        service.feed_status(ON, last_success=now, now=now, telemetry_available=False)
        == FeedStatus.UNKNOWN
    )
    # A feed whose flag is off is not expected to run, whatever Redis holds.
    assert (
        service.feed_status(OFF, last_success=None, now=now, telemetry_available=False)
        == FeedStatus.DISABLED
    )


def test_naive_redis_timestamps_are_read_as_utc() -> None:
    now = utc_now()
    naive = (now - timedelta(minutes=1)).replace(tzinfo=None)
    assert (
        service.feed_status(ON, last_success=naive, now=now, telemetry_available=True)
        == FeedStatus.FRESH
    )


async def test_email_backlog_counts_pending_stale_and_dead_email_rows(
    db_async: AsyncSession,
) -> None:
    now = utc_now()
    await outbox.enqueue(db_async, topic="email.send", payload={}, dedupe_key="a")
    await outbox.enqueue(
        db_async,
        topic="email.deliver",
        payload={},
        dedupe_key="b",
        run_at=now - timedelta(hours=2),
    )
    await outbox.enqueue(db_async, topic="email.deliver", payload={}, dedupe_key="c")
    await outbox.enqueue(db_async, topic="webhook.deliver", payload={}, dedupe_key="d")
    await db_async.execute(
        update(Outbox)
        .where(Outbox.dedupe_key == "c")
        .values(status=OutboxStatus.DEAD.value)
    )
    await db_async.commit()

    backlog = await service.email_backlog(db_async, now=utc_now())

    assert backlog.pending == 2
    assert backlog.stale_pending == 1
    assert backlog.dead_last_window == 1


async def test_report_is_healthy_when_every_enabled_feed_is_fresh(
    db_async: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    now = utc_now()

    async def fresh() -> dict[str, Any]:
        return dict.fromkeys(operational_metrics.FEEDS, now)

    monkeypatch.setattr(operational_metrics, "feed_successes", fresh)
    report = await service.freshness_report(db_async, now=now)

    assert report.telemetry_available is True
    assert report.healthy is True
    assert {f.name for f in report.feeds} == set(operational_metrics.FEEDS)


async def test_report_is_unhealthy_when_a_feed_is_stale(
    db_async: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    now = utc_now()

    async def stale_cap() -> dict[str, Any]:
        return {
            name: (now - timedelta(hours=1) if name == "cap_feeds" else now)
            for name in operational_metrics.FEEDS
        }

    monkeypatch.setattr(operational_metrics, "feed_successes", stale_cap)
    report = await service.freshness_report(db_async, now=now)

    statuses = {f.name: f.status for f in report.feeds}
    assert statuses["cap_feeds"] == FeedStatus.STALE
    assert report.healthy is False


async def test_report_is_unhealthy_when_the_email_outbox_has_dead_rows(
    db_async: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    now = utc_now()

    async def fresh() -> dict[str, Any]:
        return dict.fromkeys(operational_metrics.FEEDS, now)

    monkeypatch.setattr(operational_metrics, "feed_successes", fresh)
    await outbox.enqueue(db_async, topic="email.send", payload={}, dedupe_key="dead")
    await db_async.execute(
        update(Outbox)
        .where(Outbox.dedupe_key == "dead")
        .values(status=OutboxStatus.DEAD.value)
    )
    await db_async.commit()

    report = await service.freshness_report(db_async, now=utc_now())

    assert report.email_outbox.dead_last_window == 1
    assert report.healthy is False


async def test_without_telemetry_every_enabled_feed_is_unknown(
    db_async: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    async def no_telemetry() -> None:
        return None

    monkeypatch.setattr(operational_metrics, "feed_successes", no_telemetry)
    report = await service.freshness_report(db_async)

    assert report.telemetry_available is False
    assert report.healthy is False
    assert {f.status for f in report.feeds} <= {
        FeedStatus.UNKNOWN,
        FeedStatus.DISABLED,
    }


async def test_feed_success_round_trips_through_redis(
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

    fake = FakeRedis()
    monkeypatch.setattr(operational_metrics.settings, "ENABLED", True)
    monkeypatch.setattr(operational_metrics.settings, "ENVIRONMENT", "production")
    monkeypatch.setattr(operational_metrics, "_shared_client", lambda: fake)

    await operational_metrics.record_feed_success(fake, "cap_feeds")
    await operational_metrics.record_feed_success(fake, "not-a-feed")
    found = await operational_metrics.feed_successes()

    assert found is not None
    assert set(found) == {"cap_feeds"}
    assert found["cap_feeds"].tzinfo is not None
    assert list(fake.hashes) == ["telemetry:v1:production:feed-success"]


async def test_feed_success_is_off_without_telemetry(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class MustNotBeUsed:
        async def hset(self, *_args: Any) -> None:
            raise AssertionError("telemetry is off; nothing should be written")

    monkeypatch.setattr(operational_metrics.settings, "ENABLED", False)
    await operational_metrics.record_feed_success(MustNotBeUsed(), "cap_feeds")
    assert await operational_metrics.feed_successes() is None


async def test_freshness_endpoint_requires_a_signed_in_user(
    async_client: httpx.AsyncClient,
) -> None:
    response = await async_client.get(ENDPOINT)
    assert response.status_code == 401


async def test_freshness_endpoint_needs_the_permission(
    async_client: httpx.AsyncClient,
    normal_user_token_headers_async: dict[str, str],
) -> None:
    response = await async_client.get(ENDPOINT, headers=normal_user_token_headers_async)
    assert response.status_code == 403


async def test_superuser_reads_every_feed_with_plain_counts(
    async_client: httpx.AsyncClient,
    superuser_token_headers_async: dict[str, str],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def no_telemetry() -> None:
        return None

    monkeypatch.setattr(operational_metrics, "feed_successes", no_telemetry)
    response = await async_client.get(ENDPOINT, headers=superuser_token_headers_async)

    assert response.status_code == 200
    body = response.json()
    assert body["healthy"] is False
    assert body["telemetry_available"] is False
    assert {f["name"] for f in body["feeds"]} == set(operational_metrics.FEEDS)
    assert {f["status"] for f in body["feeds"]} <= {"unknown", "disabled"}
    assert set(body["email_outbox"]) == {
        "pending",
        "stale_pending",
        "dead_last_window",
        "dead_window_hours",
        "stale_after_minutes",
    }
