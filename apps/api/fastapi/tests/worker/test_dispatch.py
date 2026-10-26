"""Worker dispatch tests — CAP outbox processing without Redis/arq or network.

httpx.MockTransport stands in for webhook endpoints so no real HTTP is made.
"""

import asyncio
import uuid
from datetime import timedelta

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
from src.utils.datetime import utc_now
from src.worker.dispatch import exhausted_jobs, process_due_jobs


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
    assert job.status == CapJobStatus.SKIPPED
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
    # Channels that deliberately did nothing are SKIPPED, everything else SUCCEEDED.
    for status, result in outcomes.values():
        skipped = bool(result and result.get("skipped"))
        assert status == (
            CapJobStatus.SKIPPED if skipped else CapJobStatus.SUCCEEDED
        ), outcomes
    assert len(stored) == 5


async def test_two_concurrent_runs_deliver_a_slow_job_once(
    db_async: AsyncSession,
) -> None:
    from src.database import async_session_factory

    received: list[httpx.Request] = []

    async def slow(request: httpx.Request) -> httpx.Response:
        received.append(request)
        await asyncio.sleep(0.5)
        return httpx.Response(200)

    await _add_webhook(db_async, "https://example.test/hook")
    job = await _add_job(db_async, "publish.webhooks")

    async def run() -> int:
        async with async_session_factory() as session:
            async with _client(slow) as client:
                return await process_due_jobs(session=session, http_client=client)

    first = asyncio.create_task(run())
    await asyncio.sleep(0.2)  # the first run is now inside the slow send
    second = await run()
    await first

    assert second == 0
    assert len(received) == 1
    await db_async.refresh(job)
    assert job.status == CapJobStatus.SUCCEEDED
    assert job.attempts == 1


async def test_retry_after_unexpected_error_skips_recipients_already_sent(
    db_async: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    from src.worker import dispatch

    calls: list[str] = []

    async def flaky(**_kw: object) -> dict[str, object]:
        calls.append("run")
        if len(calls) == 1:
            raise RuntimeError("boom")
        return {"delivered": ["a", "b"], "count": 2}

    monkeypatch.setitem(dispatch.KIND_HANDLERS, "publish.webhooks", flaky)
    job = await _add_job(db_async, "publish.webhooks")
    job.result = {"delivered": ["a"]}
    await db_async.commit()

    async with _client(lambda _r: httpx.Response(200)) as client:
        await process_due_jobs(session=db_async, http_client=client)
    await db_async.refresh(job)
    assert job.status == CapJobStatus.FAILED
    assert job.result is not None and job.result["delivered"] == ["a"]


async def test_running_job_is_not_picked_up_but_a_stale_one_is(
    db_async: AsyncSession,
) -> None:
    from datetime import timedelta

    from src.utils.datetime import utc_now

    job = await _add_job(db_async, "publish.bogus")
    job.status = CapJobStatus.RUNNING
    job.attempts = 1
    await db_async.commit()
    async with _client(lambda _r: httpx.Response(200)) as client:
        assert await process_due_jobs(session=db_async, http_client=client) == 0
        job.updated_at = utc_now() - timedelta(hours=1)
        await db_async.commit()
        assert await process_due_jobs(session=db_async, http_client=client) == 1


async def test_exhausted_jobs_are_counted_and_logged(
    db_async: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    from unittest.mock import MagicMock

    from src.worker import main as worker_main

    job = await _add_job(db_async, "publish.email")
    job.status = CapJobStatus.FAILED
    job.attempts = 5
    other = await _add_job(db_async, "publish.push")
    other.status = CapJobStatus.FAILED
    other.attempts = 2
    await db_async.commit()
    log = MagicMock()
    monkeypatch.setattr(worker_main, "logger", log)

    total = await worker_main.check_cap_job_failures({})

    assert total == 1
    log.error.assert_called_once()
    assert log.error.call_args.kwargs["extra"] == {
        "count": 1,
        "kinds": ["publish.email"],
    }


async def test_exhausted_job_emails_gms_once_with_no_personal_data(
    db_async: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    from src.notifications.models import OutboundEmail
    from src.worker import main as worker_main
    from src.worker.config import worker_settings

    monkeypatch.setattr(
        worker_settings, "CAP_DELIVERY_FAILURE_RECIPIENTS", "duty@gms.example.test"
    )
    job = await _add_job(db_async, "publish.email")
    job.status = CapJobStatus.FAILED
    job.attempts = 5
    job.result = {"error": "smtp said ada@example.com", "error_class": "OSError"}
    await db_async.commit()

    assert await worker_main.check_cap_job_failures({}) == 1
    assert await worker_main.check_cap_job_failures({}) == 1  # re-run: no resend

    rows = list(
        (
            await db_async.scalars(
                select(OutboundEmail).where(
                    OutboundEmail.dedupe_key.like(f"cap-job-failed:{job.id}:%")
                )
            )
        ).all()
    )
    assert len(rows) == 1
    mail = rows[0]
    assert mail.to_email == "duty@gms.example.test"
    body = str(mail.props["body"])
    assert "Delivery channel: email" in body
    assert "Attempts: 5" in body
    assert "Last error: OSError" in body
    assert "ada@example.com" not in body


async def test_no_failure_email_when_no_recipients_are_configured(
    db_async: AsyncSession,
) -> None:
    from src.notifications.models import OutboundEmail
    from src.worker import main as worker_main

    job = await _add_job(db_async, "publish.email")
    job.status = CapJobStatus.FAILED
    job.attempts = 5
    await db_async.commit()

    assert await worker_main.check_cap_job_failures({}) == 1
    count = await db_async.scalars(
        select(OutboundEmail).where(OutboundEmail.dedupe_key.like("cap-job-failed:%"))
    )
    assert list(count.all()) == []


async def test_job_abandoned_on_the_final_attempt_is_failed_and_reported(
    db_async: AsyncSession,
) -> None:
    """A worker that dies on the last attempt must not strand the job in RUNNING."""
    abandoned = await _add_job(db_async, "publish.webhooks")
    live = await _add_job(db_async, "publish.webhooks")
    abandoned.status = CapJobStatus.RUNNING
    abandoned.attempts = 5
    abandoned.updated_at = utc_now() - timedelta(minutes=30)
    abandoned.result = {"delivered": ["hook-b", "hook-a"]}
    live.status = CapJobStatus.RUNNING
    live.attempts = 5
    live.updated_at = utc_now() - timedelta(minutes=1)
    db_async.add_all([abandoned, live])
    await db_async.commit()

    async with _client(lambda _request: httpx.Response(200)) as client:
        handled = await process_due_jobs(
            session=db_async, http_client=client, max_attempts=5
        )

    assert handled == 0
    await db_async.refresh(abandoned)
    await db_async.refresh(live)
    assert abandoned.status == CapJobStatus.FAILED
    assert abandoned.attempts == 5
    assert abandoned.result is not None
    assert abandoned.result["error_class"] == "WorkerStopped"
    assert abandoned.result["delivered"] == ["hook-a", "hook-b"]
    assert live.status == CapJobStatus.RUNNING
    reported = await exhausted_jobs(
        session=db_async, max_attempts=5, window=timedelta(hours=1)
    )
    assert [job.id for job in reported] == [abandoned.id]
