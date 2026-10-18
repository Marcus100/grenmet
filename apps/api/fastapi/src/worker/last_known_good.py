"""Static last-known-good alerts snapshot for storm resilience.

After any CAP publish, update or cancel the worker rewrites two small objects
in storage: ``alerts/last-known-good.json`` and ``alerts/last-known-good.html``.
They hold only active Public Actual alerts, so they can be served by a CDN
(or opened from a bucket) while the API, database or site is down. Skips
cleanly when object storage is not configured.
"""

from __future__ import annotations

import html
import json
from typing import Any

import httpx
from fastapi.concurrency import run_in_threadpool
from sqlalchemy.ext.asyncio import AsyncSession

from src.cap.models import CapJobEvent, CapStatus
from src.cap.public_queries import public_latest_active
from src.cap.schemas import CapAlertPublic
from src.storage.service import StorageNotConfiguredError, storage_service
from src.utils.datetime import utc_now

JSON_KEY = "alerts/last-known-good.json"
HTML_KEY = "alerts/last-known-good.html"


def _alert_entry(alert: CapAlertPublic) -> dict[str, Any]:
    info = alert.info[0] if alert.info else None
    return {
        "identifier": alert.identifier,
        "sent": alert.sent.isoformat(),
        "msg_type": alert.msg_type.value,
        "event": info.event if info else None,
        "headline": info.headline if info else None,
        "severity": info.severity.value if info else None,
        "urgency": info.urgency.value if info else None,
        "expires": info.expires.isoformat() if info and info.expires else None,
        "areas": [area.area_desc for area in info.areas] if info else [],
        "description": info.description if info else None,
        "instruction": info.instruction if info else None,
    }


def build_snapshot(
    alerts: list[CapAlertPublic], *, generated_at: str
) -> dict[str, Any]:
    """The JSON document: active Public Actual alerts and when it was written."""
    return {
        "generated_at": generated_at,
        "note": "Last known good alerts. Check the Grenada Meteorological Service for the latest.",
        "alerts": [_alert_entry(a) for a in alerts if a.status == CapStatus.ACTUAL],
    }


def render_html(snapshot: dict[str, Any]) -> str:
    """A self-contained page (no scripts, no external assets) for the same data."""
    esc = html.escape
    items = []
    for alert in snapshot["alerts"]:
        areas = ", ".join(alert["areas"])
        items.append(
            "<li><h2>{headline}</h2><p><b>{severity}</b> &middot; {areas}</p>"
            "<p>{description}</p><p>{instruction}</p>"
            "<p><small>Sent {sent} UTC &middot; expires {expires}</small></p></li>".format(
                headline=esc(alert["headline"] or alert["event"] or "Alert"),
                severity=esc(alert["severity"] or ""),
                areas=esc(areas),
                description=esc(alert["description"] or ""),
                instruction=esc(alert["instruction"] or ""),
                sent=esc(alert["sent"]),
                expires=esc(alert["expires"] or "not stated"),
            )
        )
    body = (
        "<ul>" + "".join(items) + "</ul>"
        if items
        else "<p>No alerts were in effect when this page was last written.</p>"
    )
    return (
        '<!doctype html><html lang="en"><head><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width,initial-scale=1">'
        "<title>Grenada alerts (saved copy)</title></head><body>"
        "<h1>Grenada weather alerts: saved copy</h1>"
        f"<p>Written {esc(snapshot['generated_at'])} UTC. This is the last copy "
        "saved while the live site may be unavailable. Check the Grenada "
        "Meteorological Service for the latest.</p>"
        f"{body}</body></html>"
    )


async def publish_last_known_good(
    *, session: AsyncSession, job: CapJobEvent, http_client: httpx.AsyncClient
) -> dict[str, Any]:
    """Rewrite the static snapshot objects from the current public alerts."""
    _ = http_client
    active = await public_latest_active(session=session)
    snapshot = build_snapshot(
        active.data, generated_at=utc_now().strftime("%Y-%m-%d %H:%M:%S")
    )
    payload = json.dumps(snapshot, indent=2).encode()
    page = render_html(snapshot).encode()
    try:
        await run_in_threadpool(
            storage_service.put_object,
            JSON_KEY,
            payload,
            content_type="application/json",
        )
        await run_in_threadpool(
            storage_service.put_object,
            HTML_KEY,
            page,
            content_type="text/html; charset=utf-8",
        )
    except StorageNotConfiguredError:
        return {"skipped": True, "reason": "storage not configured", "kind": job.kind}
    return {"alerts": len(snapshot["alerts"]), "keys": [JSON_KEY, HTML_KEY]}
