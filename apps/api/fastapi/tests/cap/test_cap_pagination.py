"""Pagination tests for the authenticated CAP list endpoints.

Verifies offset paging and, importantly, that ``count`` reports the full total
across all pages (previously it reflected only the returned page length).
"""

from datetime import UTC, datetime, timedelta
from typing import Any

import httpx
import pytest

pytestmark = pytest.mark.asyncio


async def test_list_alerts_pagination(
    async_client: httpx.AsyncClient,
    db_async: object,
    superuser_token_headers_async: dict[str, str],
) -> None:
    _ = db_async
    for index in range(3):
        response = await async_client.post(
            "/api/v1/cap/alerts",
            headers=superuser_token_headers_async,
            json=_draft_payload(index),
        )
        assert response.status_code == 201, response.text

    page1 = await async_client.get(
        "/api/v1/cap/alerts?page=1&size=2", headers=superuser_token_headers_async
    )
    assert page1.status_code == 200
    body1 = page1.json()
    assert body1["count"] == 3  # full total, not the page length
    assert body1["page"] == 1
    assert body1["size"] == 2
    assert len(body1["data"]) == 2

    page2 = await async_client.get(
        "/api/v1/cap/alerts?page=2&size=2", headers=superuser_token_headers_async
    )
    body2 = page2.json()
    assert body2["count"] == 3
    assert body2["page"] == 2
    assert len(body2["data"]) == 1

    ids1 = {alert["id"] for alert in body1["data"]}
    ids2 = {alert["id"] for alert in body2["data"]}
    assert ids1.isdisjoint(ids2)  # no overlap across pages


async def test_list_alerts_pagination_respects_lifecycle_filter(
    async_client: httpx.AsyncClient,
    db_async: object,
    superuser_token_headers_async: dict[str, str],
) -> None:
    _ = db_async
    for index in range(2):
        response = await async_client.post(
            "/api/v1/cap/alerts",
            headers=superuser_token_headers_async,
            json=_draft_payload(index),
        )
        assert response.status_code == 201

    filtered = await async_client.get(
        "/api/v1/cap/alerts?lifecycle_state=DRAFT&page=1&size=10",
        headers=superuser_token_headers_async,
    )
    assert filtered.status_code == 200
    body = filtered.json()
    assert body["count"] == 2
    assert all(alert["lifecycle_state"] == "DRAFT" for alert in body["data"])

    published_only = await async_client.get(
        "/api/v1/cap/alerts?lifecycle_state=PUBLISHED",
        headers=superuser_token_headers_async,
    )
    assert published_only.json()["count"] == 0


async def test_list_audit_events_pagination(
    async_client: httpx.AsyncClient,
    db_async: object,
    superuser_token_headers_async: dict[str, str],
) -> None:
    _ = db_async
    create = await async_client.post(
        "/api/v1/cap/alerts",
        headers=superuser_token_headers_async,
        json=_draft_payload(0),
    )
    alert_id = create.json()["id"]
    submit = await async_client.post(
        f"/api/v1/cap/alerts/{alert_id}/submit",
        headers=superuser_token_headers_async,
        json={"note": "Ready"},
    )
    assert submit.status_code == 200  # records an audit event

    audit = await async_client.get(
        "/api/v1/cap/audit?page=1&size=1", headers=superuser_token_headers_async
    )
    assert audit.status_code == 200
    body = audit.json()
    assert body["page"] == 1
    assert body["size"] == 1
    assert body["count"] >= 1
    assert len(body["data"]) == 1


def _draft_payload(index: int) -> dict[str, Any]:
    now = datetime.now(UTC)
    return {
        "sender": "cap@weather.gd",
        "sent": now.isoformat(),
        "status": "Actual",
        "msg_type": "Alert",
        "scope": "Public",
        "info": [
            {
                "language": "en",
                "categories": ["Met"],
                "event": "Heavy Rainfall",
                "urgency": "Expected",
                "severity": "Severe",
                "certainty": "Likely",
                "effective": now.isoformat(),
                "onset": (now + timedelta(minutes=30)).isoformat(),
                "expires": (now + timedelta(hours=6)).isoformat(),
                "headline": f"Rainfall warning {index}",
                "description": "Heavy rainfall is expected across Grenada.",
                "instruction": "Monitor official updates.",
                "areas": [
                    {
                        "kind": "POLYGON",
                        "area_desc": "Grenada",
                        "polygons": [
                            [
                                [-61.8, 12.0],
                                [-61.7, 12.2],
                                [-61.6, 12.1],
                                [-61.8, 12.0],
                            ]
                        ],
                    }
                ],
            }
        ],
    }
