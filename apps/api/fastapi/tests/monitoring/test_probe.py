"""Uptime probe: token-authenticated 200/503 verdict for Better Stack (no user session)."""

from datetime import timedelta
from typing import Any

import httpx
import pytest
from pydantic import SecretStr
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from src import operational_metrics, outbox
from src.monitoring import probe_auth
from src.monitoring.config import monitoring_settings
from src.outbox import Outbox, OutboxStatus
from src.rate_limit import limiter
from src.utils.datetime import utc_now

ENDPOINT = "/api/v1/monitoring/admin/freshness/probe"
pytestmark = pytest.mark.usefixtures("probe_configured")
# Built at run time so no key-shaped literal sits in the source (secret scanning).
SECRET = "x" * 40


@pytest.fixture
def probe_configured(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(monitoring_settings, "PROBE_TOKEN", SecretStr(SECRET))


def _auth(value: str = SECRET) -> dict[str, str]:
    return {"Authorization": f"Bearer {value}"}


def _all_fresh_telemetry(now: Any) -> Any:
    async def fresh() -> dict[str, Any]:
        return dict.fromkeys(operational_metrics.FEEDS, now)

    return fresh


async def test_healthy_answers_200_with_no_personal_data(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    now = utc_now()
    monkeypatch.setattr(
        operational_metrics, "feed_successes", _all_fresh_telemetry(now)
    )
    await outbox.enqueue(
        db_async,
        topic="email.send",
        payload={"to": "person@example.com"},
        dedupe_key="ok",
    )
    await db_async.commit()

    response = await async_client.get(ENDPOINT, headers=_auth())

    assert response.status_code == 200
    body = response.json()
    assert body["healthy"] is True
    assert body["failing_checks"] == []
    assert set(body) == {"healthy", "checked_at", "failing_checks"}
    assert "@" not in response.text


async def test_stale_feed_answers_503_and_names_the_check(
    async_client: httpx.AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    now = utc_now()

    async def stale_cap() -> dict[str, Any]:
        return {
            name: (now - timedelta(hours=2) if name == "cap_feeds" else now)
            for name in operational_metrics.FEEDS
        }

    monkeypatch.setattr(operational_metrics, "feed_successes", stale_cap)

    response = await async_client.get(ENDPOINT, headers=_auth())

    assert response.status_code == 503
    body = response.json()
    assert body["healthy"] is False
    assert body["failing_checks"] == ["feed:cap_feeds"]


async def test_dead_email_rows_answer_503_and_name_the_check(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    now = utc_now()
    monkeypatch.setattr(
        operational_metrics, "feed_successes", _all_fresh_telemetry(now)
    )
    await outbox.enqueue(db_async, topic="email.send", payload={}, dedupe_key="dead")
    await db_async.execute(
        update(Outbox)
        .where(Outbox.dedupe_key == "dead")
        .values(status=OutboxStatus.DEAD.value)
    )
    await db_async.commit()

    response = await async_client.get(ENDPOINT, headers=_auth())

    assert response.status_code == 503
    assert response.json()["failing_checks"] == ["email_outbox.dead_last_window"]


async def test_missing_telemetry_is_named(
    async_client: httpx.AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def no_telemetry() -> None:
        return None

    monkeypatch.setattr(operational_metrics, "feed_successes", no_telemetry)

    response = await async_client.get(ENDPOINT, headers=_auth())

    assert response.status_code == 503
    assert "telemetry" in response.json()["failing_checks"]


async def test_missing_or_wrong_credential_is_refused(
    async_client: httpx.AsyncClient,
) -> None:
    assert (await async_client.get(ENDPOINT)).status_code == 401
    assert (await async_client.get(ENDPOINT, headers=_auth("wrong"))).status_code == 401
    # The secret in a query string is not a credential.
    assert (await async_client.get(f"{ENDPOINT}?token={SECRET}")).status_code == 401


async def test_unconfigured_probe_is_404(
    async_client: httpx.AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(monitoring_settings, "PROBE_TOKEN", None)
    assert (await async_client.get(ENDPOINT, headers=_auth())).status_code == 404


async def test_short_secret_counts_as_unconfigured(
    async_client: httpx.AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(monitoring_settings, "PROBE_TOKEN", SecretStr("short"))
    assert (await async_client.get(ENDPOINT, headers=_auth("short"))).status_code == 404


async def test_probe_is_rate_limited_before_the_credential_check(
    async_client: httpx.AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(limiter, "enabled", True)
    monkeypatch.setattr(probe_auth, "_PER_ADDRESS", probe_auth.parse("2/minute"))
    limiter.limiter.storage.reset()
    try:
        statuses = [
            (await async_client.get(ENDPOINT, headers=_auth("wrong"))).status_code
            for _ in range(3)
        ]
        assert statuses == [401, 401, 429]
        limited = await async_client.get(ENDPOINT, headers=_auth())
        assert limited.status_code == 429
        assert limited.headers["Retry-After"] == "60"
    finally:
        limiter.limiter.storage.reset()


# db_async clears the outbox, so no dead row from an earlier test leaks in.
@pytest.mark.usefixtures("db_async")
async def test_probe_does_not_need_a_user_session(
    async_client: httpx.AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    now = utc_now()
    monkeypatch.setattr(
        operational_metrics, "feed_successes", _all_fresh_telemetry(now)
    )
    response = await async_client.get(ENDPOINT, headers=_auth())
    assert response.status_code == 200, response.json()
