"""Pre-publish warning checks from ADR-0056 item 6 (#1312).

Ideas from wmo-raf/cap-aggregator's ingestion validators: an Actual warning needs
an expiry and, when public, an area; coordinates must be real places; and a
warning repeating one published in the last hour gets a warning suggesting an
Update.
"""

from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID, uuid4

import httpx
import pytest
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from src.baseline.models import ApprovalPolicy
from src.cap.models import (
    CapAlert,
    CapAreaKind,
    CapCategory,
    CapCertainty,
    CapLifecycleState,
    CapMessageType,
    CapScope,
    CapSeverity,
    CapStatus,
    CapUrgency,
)
from src.cap.schemas import CapAlertPublic, CapAreaPublic, CapInfoPublic
from src.cap.validation import validate_cap_alert
from src.utils.datetime import utc_now

_GRENADA = [[-61.8, 12.0], [-61.7, 12.2], [-61.6, 12.1], [-61.8, 12.0]]


def _area(**overrides: Any) -> CapAreaPublic:
    fields: dict[str, Any] = {
        "id": uuid4(),
        "sequence": 0,
        "kind": CapAreaKind.POLYGON,
        "area_desc": "Grenada",
        "polygons": [_GRENADA],
    }
    fields.update(overrides)
    return CapAreaPublic(**fields)


def _alert(
    *,
    status: CapStatus = CapStatus.ACTUAL,
    msg_type: CapMessageType = CapMessageType.ALERT,
    scope: CapScope = CapScope.PUBLIC,
    expires: bool = True,
    areas: list[CapAreaPublic] | None = None,
) -> CapAlertPublic:
    now = datetime.now(UTC)
    info = CapInfoPublic(
        id=uuid4(),
        sequence=0,
        language="en",
        categories=[CapCategory.MET],
        event="Heavy Rainfall",
        urgency=CapUrgency.EXPECTED,
        severity=CapSeverity.SEVERE,
        certainty=CapCertainty.LIKELY,
        effective=now,
        expires=now + timedelta(hours=6) if expires else None,
        headline="Heavy rainfall warning",
        description="Heavy rainfall is expected across Grenada.",
        areas=[_area()] if areas is None else areas,
    )
    return CapAlertPublic(
        id=uuid4(),
        identifier="test-alert",
        sender="cap@example.com",
        sent=now,
        status=status,
        msg_type=msg_type,
        scope=scope,
        restriction="staff only" if scope == CapScope.RESTRICTED else None,
        lifecycle_state=CapLifecycleState.APPROVED,
        created_by_user_id=uuid4(),
        created_at=now,
        updated_at=now,
        info=[info],
        xml_url="/api/cap/test-alert.xml",
    )


def test_complete_actual_warning_is_valid() -> None:
    result = validate_cap_alert(_alert())
    assert result.is_valid, result.errors


def test_actual_warning_without_expiry_is_refused() -> None:
    result = validate_cap_alert(_alert(expires=False))
    assert not result.is_valid
    assert "info[1].expires is required for an Actual warning" in result.errors


@pytest.mark.parametrize("status", [CapStatus.TEST, CapStatus.EXERCISE])
def test_test_and_exercise_messages_may_omit_expiry(status: CapStatus) -> None:
    result = validate_cap_alert(_alert(status=status, expires=False))
    assert result.is_valid, result.errors


def test_actual_public_warning_without_area_is_refused() -> None:
    result = validate_cap_alert(_alert(areas=[]))
    assert not result.is_valid
    assert "info[1] needs an area for an Actual public warning" in result.errors


def test_restricted_warning_without_area_only_warns() -> None:
    result = validate_cap_alert(_alert(scope=CapScope.RESTRICTED, areas=[]))
    assert result.is_valid, result.errors
    assert "info[1] has no area blocks" in result.warnings


@pytest.mark.parametrize(
    "area",
    [
        pytest.param(
            {
                "polygons": [
                    [[-61.8, 12.0], [-61.7, 95.0], [-61.6, 12.1], [-61.8, 12.0]]
                ]
            },
            id="polygon-latitude",
        ),
        pytest.param(
            {
                "polygons": [],
                "multipolygons": [
                    [[[200.0, 12.0], [-61.7, 12.2], [-61.6, 12.1], [200.0, 12.0]]]
                ],
            },
            id="multipolygon-longitude",
        ),
        pytest.param(
            {
                "kind": CapAreaKind.CIRCLE,
                "polygons": [],
                "circles": [{"lat": -91.0, "lon": -61.7, "radius": 10.0}],
            },
            id="circle-centre",
        ),
        pytest.param(
            {
                "polygons": [],
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [[[0, 0], [0, 100], [1, 100], [0, 0]]],
                },
            },
            id="geometry",
        ),
    ],
)
def test_coordinates_outside_the_globe_are_refused(area: dict[str, Any]) -> None:
    result = validate_cap_alert(_alert(areas=[_area(**area)]))
    assert not result.is_valid
    assert any("outside latitude ±90 or longitude ±180" in e for e in result.errors)


def test_negative_circle_radius_is_refused() -> None:
    area = _area(
        kind=CapAreaKind.CIRCLE,
        polygons=[],
        circles=[{"lat": 12.1, "lon": -61.7, "radius": -1.0}],
    )
    result = validate_cap_alert(_alert(areas=[area]))
    assert "info[1].area[1] circle radius must not be negative" in result.errors


def test_circle_without_a_centre_is_refused() -> None:
    area = _area(kind=CapAreaKind.CIRCLE, polygons=[], circles=[{"radius": 5.0}])
    result = validate_cap_alert(_alert(areas=[area]))
    assert "info[1].area[1] circle needs a centre latitude and longitude" in (
        result.errors
    )


def test_cancellation_without_expiry_or_area_is_not_blocked() -> None:
    result = validate_cap_alert(
        _alert(msg_type=CapMessageType.CANCEL, expires=False, areas=[])
    )
    assert not any("expires is required" in e for e in result.errors)
    assert not any("needs an area" in e for e in result.errors)


# --- Repeat of a warning published in the last hour (API, needs the database) ---


def _payload(headline: str = "Heavy rainfall warning") -> dict[str, Any]:
    now = datetime.now(UTC)
    return {
        "sender": "cap@example.com",
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
                "expires": (now + timedelta(hours=6)).isoformat(),
                "headline": headline,
                "description": "Heavy rainfall is expected across Grenada.",
                "areas": [
                    {"kind": "POLYGON", "area_desc": "Grenada", "polygons": [_GRENADA]}
                ],
            }
        ],
    }


async def _create(client: httpx.AsyncClient, headers: dict[str, str], **kw: Any) -> str:
    response = await client.post(
        "/api/v1/cap/alerts", headers=headers, json=_payload(**kw)
    )
    assert response.status_code == 201, response.text
    return response.json()["id"]


async def _publish(
    client: httpx.AsyncClient,
    author: dict[str, str],
    approver: dict[str, str],
    alert_id: str,
) -> None:
    for path, headers in (
        ("submit", author),
        ("approve", approver),
        ("publish", author),
    ):
        response = await client.post(
            f"/api/v1/cap/alerts/{alert_id}/{path}",
            headers=headers,
            json={"note": path},
        )
        assert response.status_code == 200, response.text


async def _validate(
    client: httpx.AsyncClient, headers: dict[str, str], alert_id: str
) -> dict[str, Any]:
    response = await client.post(
        f"/api/v1/cap/alerts/{alert_id}/validate", headers=headers
    )
    assert response.status_code == 200, response.text
    return response.json()


@pytest.mark.asyncio
async def test_repeat_of_a_recent_warning_warns_but_stays_valid(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    superuser_token_headers_async: dict[str, str],
    second_superuser_headers_async: dict[str, str],
) -> None:
    db_async.add(ApprovalPolicy(key="cap", allow_self_approval=True))
    await db_async.commit()
    author, approver = superuser_token_headers_async, second_superuser_headers_async
    first = await _create(async_client, author)
    await _publish(async_client, author, approver, first)

    repeat = await _validate(async_client, author, await _create(async_client, author))
    assert repeat["is_valid"] is True
    assert any("Issue an Update" in w for w in repeat["warnings"])

    different = await _validate(
        async_client,
        author,
        await _create(async_client, author, headline="Flood watch"),
    )
    assert not any("Issue an Update" in w for w in different["warnings"])


@pytest.mark.asyncio
async def test_a_warning_published_over_an_hour_ago_is_not_a_repeat(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    superuser_token_headers_async: dict[str, str],
    second_superuser_headers_async: dict[str, str],
) -> None:
    db_async.add(ApprovalPolicy(key="cap", allow_self_approval=True))
    await db_async.commit()
    author, approver = superuser_token_headers_async, second_superuser_headers_async
    first = await _create(async_client, author)
    await _publish(async_client, author, approver, first)
    await db_async.execute(
        update(CapAlert)
        .where(CapAlert.id == UUID(first))
        .values(sent=utc_now() - timedelta(minutes=61))
    )
    await db_async.commit()

    result = await _validate(async_client, author, await _create(async_client, author))
    assert not any("Issue an Update" in w for w in result["warnings"])


@pytest.mark.asyncio
@pytest.mark.usefixtures("db_async")
async def test_emergency_publish_is_refused_without_an_expiry(
    async_client: httpx.AsyncClient,
    superuser_token_headers_async: dict[str, str],
) -> None:
    payload = _payload()
    del payload["info"][0]["expires"]
    created = await async_client.post(
        "/api/v1/cap/alerts", headers=superuser_token_headers_async, json=payload
    )
    assert created.status_code == 201, created.text

    response = await async_client.post(
        f"/api/v1/cap/alerts/{created.json()['id']}/emergency-publish",
        headers=superuser_token_headers_async,
        json={"reason": "Real hazard"},
    )
    assert response.status_code == 422, response.text
    assert "expires is required for an Actual warning" in response.text
