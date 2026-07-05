"""Worker dispatch tests — CAP outbox processing without Redis/arq or network.

httpx.MockTransport stands in for webhook endpoints so no real HTTP is made.
"""

import httpx
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from src.cap.models import (
    CapIntegrationStatus,
    CapJobEvent,
    CapJobStatus,
    CapWebhook,
)
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
