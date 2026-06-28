"""CAP publish side-effect handlers consumed by the worker.

Each handler takes the DB session, the ``CapJobEvent`` being processed, and a shared
httpx client. On any delivery failure it raises ``PublishError`` (details recorded on
the job; the dispatcher marks it FAILED for retry). On success it returns a JSON-able
result dict.

Only ``publish.webhooks`` is fully implemented in this step. PDF / static-map / social
are implemented in the CAP-features step; MQTT/WIS2 are intentionally out of scope
(handled by the separate wis2box deployment) and recorded as skipped.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import logging
import uuid
from typing import Any

import httpx
from fastapi.concurrency import run_in_threadpool
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import col, select

from src.cap.images import render_area_map, render_social_image
from src.cap.models import (
    CapAlert,
    CapArea,
    CapInfo,
    CapIntegrationStatus,
    CapJobEvent,
    CapWebhook,
)
from src.cap.pdf import render_alert_pdf
from src.storage.service import StorageNotConfiguredError, storage_service

logger = logging.getLogger(__name__)


class PublishError(Exception):
    """A publish side-effect failed; ``details`` is recorded on the job."""

    def __init__(self, details: dict[str, Any]) -> None:
        super().__init__(str(details))
        self.details = details


async def publish_webhooks(
    *, session: AsyncSession, job: CapJobEvent, http_client: httpx.AsyncClient
) -> dict[str, Any]:
    """Deliver the job payload to every ACTIVE CAP webhook (HMAC-signed when a secret is set)."""
    result = await session.execute(
        select(CapWebhook).where(
            col(CapWebhook.status) == CapIntegrationStatus.ACTIVE
        )
    )
    hooks = list(result.scalars().all())
    body = json.dumps(job.payload, default=str).encode()

    delivered: list[str] = []
    failures: list[dict[str, str]] = []
    for hook in hooks:
        headers = {"Content-Type": "application/json"}
        if hook.secret_ref:
            signature = hmac.new(
                hook.secret_ref.encode(), body, hashlib.sha256
            ).hexdigest()
            headers["X-Cap-Signature"] = f"sha256={signature}"
        try:
            response = await http_client.post(
                hook.url, content=body, headers=headers, timeout=10.0
            )
            response.raise_for_status()
            delivered.append(str(hook.id))
        except Exception as exc:  # noqa: BLE001 - record per-hook failure, continue
            failures.append({"webhook_id": str(hook.id), "error": str(exc)})

    if failures:
        raise PublishError({"delivered": delivered, "failures": failures})
    return {"delivered": delivered, "count": len(delivered)}


async def _skipped(
    *, session: AsyncSession, job: CapJobEvent, http_client: httpx.AsyncClient
) -> dict[str, Any]:
    """Placeholder handler: records the side-effect as intentionally not yet run."""
    _ = (session, http_client)  # required by the handler protocol, unused here
    logger.info("CAP publish side-effect not implemented yet", extra={"kind": job.kind})
    return {"skipped": True, "reason": "handler not implemented yet", "kind": job.kind}


async def _resolve_alert(*, session: AsyncSession, job: CapJobEvent) -> CapAlert:
    raw_id = job.alert_id or job.payload.get("alert_id")
    if not raw_id:
        raise PublishError({"error": f"{job.kind} requires an alert_id"})
    alert_id = raw_id if isinstance(raw_id, uuid.UUID) else uuid.UUID(str(raw_id))
    alert = await session.get(CapAlert, alert_id)
    if alert is None:
        raise PublishError({"error": f"alert {alert_id} not found"})
    return alert


async def _alert_areas(
    *, session: AsyncSession, alert_id: uuid.UUID
) -> list[CapArea]:
    result = await session.execute(
        select(CapArea)
        .join(CapInfo, col(CapArea.info_id) == col(CapInfo.id))
        .where(col(CapInfo.alert_id) == alert_id)
        .order_by(col(CapArea.sequence))
    )
    return list(result.scalars().all())


async def publish_pdf(
    *, session: AsyncSession, job: CapJobEvent, http_client: httpx.AsyncClient
) -> dict[str, Any]:
    """Render the alert to a PDF and store it in object storage."""
    _ = http_client
    alert = await _resolve_alert(session=session, job=job)
    alert_id = alert.id

    info_result = await session.execute(
        select(CapInfo)
        .where(col(CapInfo.alert_id) == alert_id)
        .order_by(col(CapInfo.sequence))
    )
    info_blocks = [
        {
            "headline": info.headline,
            "event": info.event,
            "severity": info.severity.value,
            "urgency": info.urgency.value,
            "certainty": info.certainty.value,
            "description": info.description,
            "instruction": info.instruction,
        }
        for info in info_result.scalars().all()
    ]

    pdf_bytes = await run_in_threadpool(
        render_alert_pdf,
        identifier=alert.identifier,
        sent=alert.sent,
        info_blocks=info_blocks,
    )

    key = f"cap/{alert.identifier}.pdf"
    try:
        await run_in_threadpool(
            storage_service.put_object,
            key,
            pdf_bytes,
            content_type="application/pdf",
        )
    except StorageNotConfiguredError:
        return {"skipped": True, "reason": "storage not configured", "kind": job.kind}
    return {"pdf_url": storage_service.public_url(key), "bytes": len(pdf_bytes)}


async def publish_social_image(
    *, session: AsyncSession, job: CapJobEvent, http_client: httpx.AsyncClient
) -> dict[str, Any]:
    """Render a severity-coloured social card (Pillow) and store it."""
    _ = http_client
    alert = await _resolve_alert(session=session, job=job)
    info_result = await session.execute(
        select(CapInfo)
        .where(col(CapInfo.alert_id) == alert.id)
        .order_by(col(CapInfo.sequence))
    )
    info = info_result.scalars().first()
    if info is None:
        raise PublishError({"error": "no info block to render"})
    areas = await _alert_areas(session=session, alert_id=alert.id)
    area_desc = areas[0].area_desc if areas else ""

    png = await run_in_threadpool(
        render_social_image,
        identifier=alert.identifier,
        headline=info.headline,
        severity=info.severity.value,
        area_desc=area_desc,
    )
    key = f"cap/{alert.identifier}-social.png"
    try:
        await run_in_threadpool(
            storage_service.put_object, key, png, content_type="image/png"
        )
    except StorageNotConfiguredError:
        return {"skipped": True, "reason": "storage not configured", "kind": job.kind}
    return {"image_url": storage_service.public_url(key), "bytes": len(png)}


async def publish_static_map(
    *, session: AsyncSession, job: CapJobEvent, http_client: httpx.AsyncClient
) -> dict[str, Any]:
    """Render a schematic map of the alert's area polygons (Pillow, no basemap)."""
    _ = http_client
    alert = await _resolve_alert(session=session, job=job)
    areas = await _alert_areas(session=session, alert_id=alert.id)
    polygons = [ring for area in areas for ring in area.polygons]
    area_desc = areas[0].area_desc if areas else ""

    png = await run_in_threadpool(
        render_area_map,
        polygons=polygons,
        identifier=alert.identifier,
        area_desc=area_desc,
    )
    if png is None:
        return {"skipped": True, "reason": "no polygon geometry", "kind": job.kind}
    key = f"cap/{alert.identifier}-map.png"
    try:
        await run_in_threadpool(
            storage_service.put_object, key, png, content_type="image/png"
        )
    except StorageNotConfiguredError:
        return {"skipped": True, "reason": "storage not configured", "kind": job.kind}
    return {"image_url": storage_service.public_url(key), "bytes": len(png)}


# MQTT / WIS2 are handled by the separate wis2box deployment — out of scope here.
publish_mqtt = _skipped
publish_wis2box = _skipped
