"""Worker dispatch tests — CAP outbox processing without Redis/arq or network.

httpx.MockTransport stands in for webhook endpoints so no real HTTP is made.
"""

import uuid

import httpx
import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth import service as auth_service
from src.cap.models import (
    CapAlert,
    CapArea,
    CapCertainty,
    CapInfo,
    CapIntegrationStatus,
    CapJobEvent,
    CapJobStatus,
    CapLifecycleState,
    CapScope,
    CapSeverity,
    CapStatus,
    CapUrgency,
    CapWebhook,
)
from src.cap.tasks import enqueue_publish_side_effects
from src.config import settings
from src.storage.service import storage_service
from src.worker.dispatch import process_due_jobs


def _client(handler) -> httpx.AsyncClient:
    return httpx.AsyncClient(transport=httpx.MockTransport(handler))


async def _add_webhook(session: AsyncSession, url: str) -> CapWebhook:
    hook = CapWebhook(
        name="test-hook",
        url=url,
        status=CapIntegrationStatus.ACTIVE,
        event_types=["alert.published"],
    )
    session.add(hook)
    await session.commit()
    await session.refresh(hook)
    return hook


async def _add_job(session: AsyncSession, kind: str) -> CapJobEvent:
    job = CapJobEvent(kind=kind, payload={"alert_id": "abc", "event": "published"})
    session.add(job)
    await session.commit()
    await session.refresh(job)
    return job


async def test_webhook_job_succeeds(db_async: AsyncSession) -> None:
    received: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        received.append(request)
        return httpx.Response(200)

    await _add_webhook(db_async, "https://example.test/hook")
    job = await _add_job(db_async, "publish.webhooks")

    async with _client(handler) as client:
        count = await process_due_jobs(session=db_async, http_client=client)

    assert count == 1
    assert len(received) == 1
    await db_async.refresh(job)
    assert job.status == CapJobStatus.SUCCEEDED
    assert job.attempts == 1
    assert job.result is not None and job.result.get("count") == 1


async def test_webhook_job_fails_on_5xx(db_async: AsyncSession) -> None:
    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(500)

    await _add_webhook(db_async, "https://example.test/hook")
    job = await _add_job(db_async, "publish.webhooks")

    async with _client(handler) as client:
        await process_due_jobs(session=db_async, http_client=client)

    await db_async.refresh(job)
    assert job.status == CapJobStatus.FAILED
    assert job.result is not None and "failures" in job.result


async def test_unknown_kind_fails(db_async: AsyncSession) -> None:
    job = await _add_job(db_async, "publish.bogus")

    def handler(_request: httpx.Request) -> httpx.Response:  # pragma: no cover
        return httpx.Response(200)

    async with _client(handler) as client:
        await process_due_jobs(session=db_async, http_client=client)

    await db_async.refresh(job)
    assert job.status == CapJobStatus.FAILED


async def test_stub_kind_marked_skipped(db_async: AsyncSession) -> None:
    job = await _add_job(db_async, "publish.mqtt")

    def handler(_request: httpx.Request) -> httpx.Response:  # pragma: no cover
        return httpx.Response(200)

    async with _client(handler) as client:
        await process_due_jobs(session=db_async, http_client=client)

    await db_async.refresh(job)
    assert job.status == CapJobStatus.SUCCEEDED
    assert job.result is not None and job.result.get("skipped") is True


async def _clear_backoff(session: AsyncSession, job: CapJobEvent) -> None:
    """Make a FAILED job immediately retry-eligible (simulate elapsed backoff)."""
    await session.refresh(job)
    job.next_retry_at = None
    session.add(job)
    await session.commit()


async def test_failed_job_backoff_gates_immediate_retry(
    db_async: AsyncSession,
) -> None:
    """After a failure the job is scheduled for a future retry, so an immediate
    re-poll does not pick it up again."""

    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(503)

    await _add_webhook(db_async, "https://example.test/hook")
    job = await _add_job(db_async, "publish.webhooks")

    async with _client(handler) as client:
        await process_due_jobs(session=db_async, http_client=client, max_attempts=5)
        # Immediate second pass: next_retry_at is in the future → skipped.
        handled = await process_due_jobs(
            session=db_async, http_client=client, max_attempts=5
        )

    assert handled == 0
    await db_async.refresh(job)
    assert job.attempts == 1
    assert job.status == CapJobStatus.FAILED
    assert job.next_retry_at is not None


async def test_failed_job_retried_until_limit(db_async: AsyncSession) -> None:
    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(503)

    await _add_webhook(db_async, "https://example.test/hook")
    job = await _add_job(db_async, "publish.webhooks")

    async with _client(handler) as client:
        # First pass marks it FAILED (attempts=1); clear backoff and retry (attempts=2).
        await process_due_jobs(session=db_async, http_client=client, max_attempts=2)
        await _clear_backoff(db_async, job)
        await process_due_jobs(session=db_async, http_client=client, max_attempts=2)
        await _clear_backoff(db_async, job)
        # Now attempts == max_attempts, so it is no longer picked up.
        handled = await process_due_jobs(
            session=db_async, http_client=client, max_attempts=2
        )

    assert handled == 0
    await db_async.refresh(job)
    assert job.attempts == 2
    assert job.status == CapJobStatus.FAILED


async def test_webhook_retry_is_idempotent_per_hook(db_async: AsyncSession) -> None:
    """A hook delivered on the first attempt is not re-POSTed on retry; only the
    previously-failed hook is re-targeted."""
    good_url = "https://good.test/hook"
    bad_url = "https://bad.test/hook"
    await _add_webhook(db_async, good_url)
    await _add_webhook(db_async, bad_url)
    job = await _add_job(db_async, "publish.webhooks")

    first_calls: list[str] = []

    def first_handler(request: httpx.Request) -> httpx.Response:
        first_calls.append(str(request.url))
        return httpx.Response(200 if str(request.url) == good_url else 500)

    async with _client(first_handler) as client:
        await process_due_jobs(session=db_async, http_client=client, max_attempts=5)

    await db_async.refresh(job)
    assert job.status == CapJobStatus.FAILED
    assert set(first_calls) == {good_url, bad_url}

    await _clear_backoff(db_async, job)
    second_calls: list[str] = []

    def second_handler(request: httpx.Request) -> httpx.Response:
        second_calls.append(str(request.url))
        return httpx.Response(200)

    async with _client(second_handler) as client:
        await process_due_jobs(session=db_async, http_client=client, max_attempts=5)

    # The retry must only re-POST to the previously-failed hook.
    assert second_calls == [bad_url]
    await db_async.refresh(job)
    assert job.status == CapJobStatus.SUCCEEDED
    assert job.result is not None and job.result.get("count") == 2


async def test_pdf_job_without_alert_id_fails(db_async: AsyncSession) -> None:
    job = CapJobEvent(kind="publish.pdf", payload={})
    db_async.add(job)
    await db_async.commit()
    await db_async.refresh(job)

    def handler(_request: httpx.Request) -> httpx.Response:  # pragma: no cover
        return httpx.Response(200)

    async with _client(handler) as client:
        await process_due_jobs(session=db_async, http_client=client)

    await db_async.refresh(job)
    assert job.status == CapJobStatus.FAILED
    assert job.result is not None and "alert_id" in str(job.result)


async def test_no_jobs_returns_zero(db_async: AsyncSession) -> None:
    result = await db_async.execute(select(CapJobEvent))
    assert result.scalars().all() == []
    handled = await process_due_jobs(session=db_async)
    assert handled == 0


async def _add_published_alert(session: AsyncSession) -> CapAlert:
    """A Public/Actual alert with one info block and a polygon area."""
    user = await auth_service.get_user_by_email(
        session=session, email=str(settings.FIRST_SUPERUSER)
    )
    assert user is not None
    alert = CapAlert(
        identifier=f"urn:oid:test.{uuid.uuid4()}",
        sender="test@example.test",
        status=CapStatus.ACTUAL,
        scope=CapScope.PUBLIC,
        lifecycle_state=CapLifecycleState.PUBLISHED,
        created_by_user_id=user.id,
    )
    session.add(alert)
    await session.flush()
    info = CapInfo(
        alert_id=alert.id,
        event="Heavy rain",
        urgency=CapUrgency.EXPECTED,
        severity=CapSeverity.MODERATE,
        certainty=CapCertainty.LIKELY,
        headline="Yellow heavy rain warning",
        description="Heavy showers expected.",
    )
    session.add(info)
    await session.flush()
    session.add(
        CapArea(
            info_id=info.id,
            area_desc="Grenada",
            polygons=[[[-61.8, 12.0], [-61.6, 12.0], [-61.6, 12.2], [-61.8, 12.0]]],
        )
    )
    await session.commit()
    await session.refresh(alert)
    return alert


@pytest.mark.parametrize(
    "kind", ["publish.pdf", "publish.social_image", "publish.static_map"]
)
async def test_render_jobs_store_artifact_for_published_alert(
    db_async: AsyncSession, monkeypatch: pytest.MonkeyPatch, kind: str
) -> None:
    stored: dict[str, bytes] = {}

    def put_object(key: str, data: bytes, *, content_type: str) -> None:
        _ = content_type
        stored[key] = data

    monkeypatch.setattr(storage_service, "put_object", put_object)
    monkeypatch.setattr(
        storage_service, "public_url", lambda key: f"https://cdn.test/{key}"
    )
    alert = await _add_published_alert(db_async)
    job = CapJobEvent(alert_id=alert.id, kind=kind, payload={"alert_id": str(alert.id)})
    db_async.add(job)
    await db_async.commit()

    def handler(_request: httpx.Request) -> httpx.Response:  # pragma: no cover
        return httpx.Response(200)

    async with _client(handler) as client:
        await process_due_jobs(session=db_async, http_client=client)

    await db_async.refresh(job)
    assert job.status == CapJobStatus.SUCCEEDED, job.result
    assert len(stored) == 1
    attachment = {
        "publish.pdf": "pdf",
        "publish.social_image": "social",
        "publish.static_map": "map",
    }[kind]
    result_key = "pdf_url" if attachment == "pdf" else "image_url"
    assert "/api/cap/alerts/" in job.result[result_key]
    assert job.result[result_key].endswith(f"/attachments/{attachment}")


async def test_publish_batch_runs_every_side_effect_for_an_alert(
    db_async: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    """The publish flow queues all side effects together; one worker poll must
    complete every one of them in a single session."""
    stored: dict[str, bytes] = {}

    def put_object(key: str, data: bytes, *, content_type: str) -> None:
        _ = content_type
        stored[key] = data

    monkeypatch.setattr(storage_service, "put_object", put_object)
    monkeypatch.setattr(
        storage_service, "public_url", lambda key: f"https://cdn.test/{key}"
    )
    alert = await _add_published_alert(db_async)
    jobs = await enqueue_publish_side_effects(
        session=db_async,
        alert_id=alert.id,
        snapshot_id=None,
        status=alert.status,
        scope=alert.scope,
    )
    await db_async.commit()

    def handler(_request: httpx.Request) -> httpx.Response:  # pragma: no cover
        return httpx.Response(200)

    async with _client(handler) as client:
        await process_due_jobs(session=db_async, http_client=client)

    outcomes = {}
    for job in jobs:
        await db_async.refresh(job)
        outcomes[job.kind] = (job.status, job.result)
    assert all(status == CapJobStatus.SUCCEEDED for status, _ in outcomes.values()), (
        outcomes
    )
    assert len(stored) == 3
