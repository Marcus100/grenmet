"""Static last-known-good alerts snapshot written by the worker."""

import json

import httpx
import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from src.cap.models import CapJobEvent, CapJobStatus
from src.cap.tasks import PUBLISH_JOB_KINDS
from src.storage.service import StorageNotConfiguredError, storage_service
from src.worker import last_known_good
from src.worker.dispatch import KIND_HANDLERS, process_due_jobs
from tests.worker.test_dispatch import _add_published_alert


def test_publish_flow_queues_and_dispatches_the_snapshot() -> None:
    assert "publish.last_known_good" in PUBLISH_JOB_KINDS
    assert "publish.last_known_good" in KIND_HANDLERS


def test_html_escapes_alert_text_and_is_self_contained() -> None:
    snapshot = {
        "generated_at": "2026-10-18 12:00:00",
        "alerts": [
            {
                "headline": "<script>alert(1)</script>",
                "event": "Flood",
                "severity": "Severe",
                "areas": ["Grenada"],
                "description": "Rain & wind",
                "instruction": None,
                "sent": "2026-10-18T12:00:00+00:00",
                "expires": None,
            }
        ],
    }
    page = last_known_good.render_html(snapshot)
    assert "<script>" not in page
    assert "&lt;script&gt;" in page
    assert "Rain &amp; wind" in page
    assert "http" not in page.replace("<!doctype", "")


def test_empty_snapshot_says_no_alerts_were_in_effect_when_written() -> None:
    page = last_known_good.render_html({"generated_at": "now", "alerts": []})
    assert "No alerts were in effect when this page was last written" in page


async def test_job_writes_json_and_html_for_active_alerts(
    db_async: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    stored: dict[str, bytes] = {}

    def put_object(key: str, data: bytes, *, content_type: str) -> None:
        _ = content_type
        stored[key] = data

    monkeypatch.setattr(storage_service, "put_object", put_object)
    alert = await _add_published_alert(db_async)
    job = CapJobEvent(
        alert_id=alert.id,
        kind="publish.last_known_good",
        payload={"alert_id": str(alert.id)},
    )
    db_async.add(job)
    await db_async.commit()

    async with httpx.AsyncClient(
        transport=httpx.MockTransport(lambda _r: httpx.Response(200))
    ) as client:
        await process_due_jobs(session=db_async, http_client=client)

    await db_async.refresh(job)
    assert job.status == CapJobStatus.SUCCEEDED, job.result
    assert set(stored) == {last_known_good.JSON_KEY, last_known_good.HTML_KEY}
    document = json.loads(stored[last_known_good.JSON_KEY])
    assert [a["identifier"] for a in document["alerts"]] == [alert.identifier]
    assert b"saved copy" in stored[last_known_good.HTML_KEY]


async def test_job_skips_cleanly_when_storage_is_unconfigured(
    db_async: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:

    def unconfigured(*_args: object, **_kwargs: object) -> None:
        raise StorageNotConfiguredError

    monkeypatch.setattr(storage_service, "put_object", unconfigured)
    alert = await _add_published_alert(db_async)
    job = CapJobEvent(
        alert_id=alert.id,
        kind="publish.last_known_good",
        payload={"alert_id": str(alert.id)},
    )
    db_async.add(job)
    await db_async.commit()
    async with httpx.AsyncClient(
        transport=httpx.MockTransport(lambda _r: httpx.Response(200))
    ) as client:
        await process_due_jobs(session=db_async, http_client=client)
    await db_async.refresh(job)
    assert job.status == CapJobStatus.SUCCEEDED
    assert job.result["skipped"] is True
