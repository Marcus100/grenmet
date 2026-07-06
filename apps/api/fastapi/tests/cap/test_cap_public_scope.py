"""Security regression tests for the anonymous CAP public feeds.

Covers two hardening fixes:
- Public feeds must expose only ``scope == Public`` alerts. Restricted/Private
  alerts (which carry ``restriction``/``addresses`` targeting) must never surface
  on the unauthenticated endpoints.
- ``GET /api/v1/cap/catalogs`` must require authentication like every other
  authenticated CAP route.
"""

from datetime import UTC, datetime, timedelta
from typing import Any

import httpx
import pytest

pytestmark = pytest.mark.asyncio


async def _publish_alert(
    async_client: httpx.AsyncClient,
    headers: dict[str, str],
    *,
    scope: str,
    restriction: str | None = None,
    addresses: list[str] | None = None,
) -> str:
    """Create an alert, drive it through the lifecycle to PUBLISHED, and
    return its identifier."""
    payload = _alert_payload(scope=scope, restriction=restriction, addresses=addresses)

    create_response = await async_client.post(
        "/api/v1/cap/alerts", headers=headers, json=payload
    )
    assert create_response.status_code == 201, create_response.text
    alert_id: str = create_response.json()["id"]
    identifier: str = create_response.json()["identifier"]

    for action, body in (
        ("submit", {"note": "Ready"}),
        ("approve", {"note": "Approved"}),
        ("publish", {"note": "Published"}),
    ):
        response = await async_client.post(
            f"/api/v1/cap/alerts/{alert_id}/{action}", headers=headers, json=body
        )
        assert response.status_code == 200, response.text

    return identifier


async def test_restricted_alert_hidden_from_public_feeds(
    async_client: httpx.AsyncClient,
    db_async: object,
    superuser_token_headers_async: dict[str, str],
) -> None:
    _ = db_async
    public_id = await _publish_alert(
        async_client, superuser_token_headers_async, scope="Public"
    )
    restricted_id = await _publish_alert(
        async_client,
        superuser_token_headers_async,
        scope="Restricted",
        restriction="Emergency responders only",
    )

    # Public alert IS visible; restricted alert is NOT, on the list feed.
    list_response = await async_client.get("/api/cap/alerts")
    assert list_response.status_code == 200
    identifiers = {item["identifier"] for item in list_response.json()["data"]}
    assert public_id in identifiers
    assert restricted_id not in identifiers

    # Restricted alert is not addressable by identifier.
    detail_response = await async_client.get(f"/api/cap/alerts/{restricted_id}")
    assert detail_response.status_code == 404

    # Restricted alert's raw signed XML snapshot is not served.
    xml_response = await async_client.get(f"/api/cap/{restricted_id}.xml")
    assert xml_response.status_code == 404

    # Control: the public alert's XML IS served.
    public_xml = await async_client.get(f"/api/cap/{public_id}.xml")
    assert public_xml.status_code == 200


async def test_private_alert_hidden_from_public_feeds(
    async_client: httpx.AsyncClient,
    db_async: object,
    superuser_token_headers_async: dict[str, str],
) -> None:
    _ = db_async
    private_id = await _publish_alert(
        async_client,
        superuser_token_headers_async,
        scope="Private",
        addresses=["ops@weather.gd"],
    )

    list_response = await async_client.get("/api/cap/alerts")
    assert list_response.status_code == 200
    identifiers = {item["identifier"] for item in list_response.json()["data"]}
    assert private_id not in identifiers

    detail_response = await async_client.get(f"/api/cap/alerts/{private_id}")
    assert detail_response.status_code == 404


async def test_catalogs_requires_authentication(
    async_client: httpx.AsyncClient,
    db_async: object,
    superuser_token_headers_async: dict[str, str],
) -> None:
    _ = db_async
    anon_response = await async_client.get("/api/v1/cap/catalogs")
    assert anon_response.status_code == 401

    auth_response = await async_client.get(
        "/api/v1/cap/catalogs", headers=superuser_token_headers_async
    )
    assert auth_response.status_code == 200
    assert "Public" in auth_response.json()["scopes"]


def _alert_payload(
    *,
    scope: str,
    restriction: str | None = None,
    addresses: list[str] | None = None,
) -> dict[str, Any]:
    now = datetime.now(UTC)
    return {
        "sender": "cap@weather.gd",
        "sent": now.isoformat(),
        "status": "Actual",
        "msg_type": "Alert",
        "scope": scope,
        "restriction": restriction,
        "addresses": addresses or [],
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
                "headline": "Heavy rainfall warning",
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
