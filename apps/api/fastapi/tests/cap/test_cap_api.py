from datetime import UTC, datetime, timedelta
from typing import Any

import httpx
import pytest

pytestmark = pytest.mark.asyncio


async def test_cap_workflow_publish_public_outputs_and_jobs(
    async_client: httpx.AsyncClient,
    db_async: object,
    superuser_token_headers_async: dict[str, str],
) -> None:
    _ = db_async
    payload = _alert_payload()

    create_response = await async_client.post(
        "/api/v1/cap/alerts",
        headers=superuser_token_headers_async,
        json=payload,
    )
    assert create_response.status_code == 201
    alert = create_response.json()
    alert_id = alert["id"]
    identifier = alert["identifier"]

    validate_response = await async_client.post(
        f"/api/v1/cap/alerts/{alert_id}/validate",
        headers=superuser_token_headers_async,
    )
    assert validate_response.status_code == 200
    assert validate_response.json()["is_valid"] is True

    submit_response = await async_client.post(
        f"/api/v1/cap/alerts/{alert_id}/submit",
        headers=superuser_token_headers_async,
        json={"note": "Ready for approval"},
    )
    assert submit_response.status_code == 200
    assert submit_response.json()["lifecycle_state"] == "SUBMITTED"

    approve_response = await async_client.post(
        f"/api/v1/cap/alerts/{alert_id}/approve",
        headers=superuser_token_headers_async,
        json={"note": "Approved"},
    )
    assert approve_response.status_code == 200
    assert approve_response.json()["lifecycle_state"] == "APPROVED"

    publish_response = await async_client.post(
        f"/api/v1/cap/alerts/{alert_id}/publish",
        headers=superuser_token_headers_async,
        json={"note": "Published"},
    )
    assert publish_response.status_code == 200
    assert publish_response.json()["alert"]["lifecycle_state"] == "PUBLISHED"
    assert publish_response.json()["snapshot"]["content_hash"]

    xml_response = await async_client.get(f"/api/cap/{identifier}.xml")
    assert xml_response.status_code == 200
    assert "<msgType>Alert</msgType>" in xml_response.text
    assert "<headline>Heavy rainfall warning</headline>" in xml_response.text

    rss_response = await async_client.get("/api/cap/rss.xml")
    assert rss_response.status_code == 200
    assert "Heavy rainfall warning" in rss_response.text

    geojson_response = await async_client.get("/api/cap/alerts.geojson")
    assert geojson_response.status_code == 200
    assert (
        geojson_response.json()["features"][0]["properties"]["identifier"] == identifier
    )

    integrations_response = await async_client.get(
        "/api/v1/cap/integrations",
        headers=superuser_token_headers_async,
    )
    assert integrations_response.status_code == 200
    assert len(integrations_response.json()["job_events"]) == 6


def _alert_payload() -> dict[str, Any]:
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
