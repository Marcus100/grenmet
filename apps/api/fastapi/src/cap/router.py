import uuid
from typing import Any
from xml.etree import ElementTree as ET

from fastapi import APIRouter, Query, Request, Response, status

from src.cap import cache, service
from src.cap.geo import alerts_to_feature_collection
from src.cap.models import CapLifecycleState
from src.cap.schemas import (
    CapAlertAction,
    CapAlertCreate,
    CapAlertImportRequest,
    CapAlertListPublic,
    CapAlertPublic,
    CapAlertUpdate,
    CapAuditEventListPublic,
    CapCatalogsPublic,
    CapFeedImportCreate,
    CapFeedImportPublic,
    CapFeedImportUpdate,
    CapPredefinedAreaCreate,
    CapPredefinedAreaPublic,
    CapPublishPublic,
    CapSettingsPublic,
    CapSettingsUpdate,
    CapValidationResult,
)
from src.dependencies import CurrentUser, SessionDep
from src.pagination import PaginationDep
from src.rate_limit import limiter

router = APIRouter(prefix="/cap", tags=["cap"])
public_router = APIRouter(prefix="/api/cap", tags=["cap-public"])


@router.get("/alerts", response_model=CapAlertListPublic)
async def read_alerts(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    pagination: PaginationDep,
    lifecycle_state: CapLifecycleState | None = Query(default=None),
) -> CapAlertListPublic:
    alerts, total = await service.list_alerts(
        session=session,
        current_user=current_user,
        lifecycle_state=lifecycle_state,
        skip=pagination.skip,
        limit=pagination.limit,
    )
    return CapAlertListPublic(
        data=alerts, count=total, page=pagination.page, size=pagination.size
    )


@router.post(
    "/alerts",
    response_model=CapAlertPublic,
    status_code=status.HTTP_201_CREATED,
)
async def create_alert(
    *, session: SessionDep, current_user: CurrentUser, payload: CapAlertCreate
) -> CapAlertPublic:
    return await service.create_alert(
        session=session, current_user=current_user, payload=payload
    )


@router.post(
    "/alerts/import",
    response_model=CapAlertPublic,
    status_code=status.HTTP_201_CREATED,
    summary="Import a CAP alert from a URL or pasted XML",
)
@limiter.limit("10/minute")
async def import_alert(
    request: Request,
    *,
    session: SessionDep,
    current_user: CurrentUser,
    payload: CapAlertImportRequest,
) -> CapAlertPublic:
    # Throttle the outbound-fetch import endpoint per IP (slowapi reads `request`).
    _ = request
    return await service.import_alert(
        session=session,
        current_user=current_user,
        source=payload.source,
        value=payload.value,
    )


@router.get("/alerts/{alert_id}", response_model=CapAlertPublic)
async def read_alert(
    *, session: SessionDep, current_user: CurrentUser, alert_id: uuid.UUID
) -> CapAlertPublic:
    return await service.get_alert(
        session=session, current_user=current_user, alert_id=alert_id
    )


@router.patch("/alerts/{alert_id}", response_model=CapAlertPublic)
async def update_alert(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    alert_id: uuid.UUID,
    payload: CapAlertUpdate,
) -> CapAlertPublic:
    return await service.update_alert(
        session=session,
        current_user=current_user,
        alert_id=alert_id,
        payload=payload,
    )


@router.post("/alerts/{alert_id}/duplicate", response_model=CapAlertPublic)
async def duplicate_alert(
    *, session: SessionDep, current_user: CurrentUser, alert_id: uuid.UUID
) -> CapAlertPublic:
    return await service.duplicate_alert(
        session=session, current_user=current_user, alert_id=alert_id
    )


@router.post("/alerts/{alert_id}/validate", response_model=CapValidationResult)
async def validate_alert(
    *, session: SessionDep, current_user: CurrentUser, alert_id: uuid.UUID
) -> CapValidationResult:
    return await service.validate_alert(
        session=session, current_user=current_user, alert_id=alert_id
    )


@router.post("/alerts/{alert_id}/submit", response_model=CapAlertPublic)
async def submit_alert(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    alert_id: uuid.UUID,
    payload: CapAlertAction,
) -> CapAlertPublic:
    return await service.submit_alert(
        session=session,
        current_user=current_user,
        alert_id=alert_id,
        payload=payload,
    )


@router.post("/alerts/{alert_id}/approve", response_model=CapAlertPublic)
async def approve_alert(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    alert_id: uuid.UUID,
    payload: CapAlertAction,
) -> CapAlertPublic:
    return await service.approve_alert(
        session=session,
        current_user=current_user,
        alert_id=alert_id,
        payload=payload,
    )


@router.post("/alerts/{alert_id}/publish", response_model=CapPublishPublic)
async def publish_alert(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    alert_id: uuid.UUID,
    payload: CapAlertAction,
) -> CapPublishPublic:
    alert, snapshot = await service.publish_alert(
        session=session,
        current_user=current_user,
        alert_id=alert_id,
        payload=payload,
    )
    return CapPublishPublic(alert=alert, snapshot=snapshot)


@router.post("/alerts/{alert_id}/cancel", response_model=CapAlertPublic)
async def cancel_alert(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    alert_id: uuid.UUID,
    payload: CapAlertAction,
) -> CapAlertPublic:
    return await service.cancel_alert(
        session=session,
        current_user=current_user,
        alert_id=alert_id,
        payload=payload,
    )


@router.post("/alerts/{alert_id}/expire", response_model=CapAlertPublic)
async def expire_alert(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    alert_id: uuid.UUID,
    payload: CapAlertAction,
) -> CapAlertPublic:
    return await service.expire_alert(
        session=session,
        current_user=current_user,
        alert_id=alert_id,
        payload=payload,
    )


@router.get("/settings", response_model=CapSettingsPublic)
async def read_cap_settings(
    *, session: SessionDep, current_user: CurrentUser
) -> CapSettingsPublic:
    return await service.read_settings(session=session, current_user=current_user)


@router.patch("/settings", response_model=CapSettingsPublic)
async def update_cap_settings(
    *, session: SessionDep, current_user: CurrentUser, payload: CapSettingsUpdate
) -> CapSettingsPublic:
    return await service.update_settings(
        session=session, current_user=current_user, payload=payload
    )


@router.get("/catalogs", response_model=CapCatalogsPublic)
async def read_catalogs(*, current_user: CurrentUser) -> CapCatalogsPublic:
    return service.get_catalogs(current_user=current_user)


@router.get("/areas/predefined", response_model=list[CapPredefinedAreaPublic])
async def read_predefined_areas(
    *, session: SessionDep, current_user: CurrentUser
) -> list[CapPredefinedAreaPublic]:
    return await service.list_predefined_areas(
        session=session, current_user=current_user
    )


@router.post(
    "/areas/predefined",
    response_model=CapPredefinedAreaPublic,
    status_code=status.HTTP_201_CREATED,
)
async def create_predefined_area(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    payload: CapPredefinedAreaCreate,
) -> CapPredefinedAreaPublic:
    return await service.create_predefined_area(
        session=session, current_user=current_user, payload=payload
    )


@router.get(
    "/integrations",
    summary="List integrations",
    description="Return configured webhooks, MQTT brokers, and recent job events.",
)
async def read_integrations(
    *, session: SessionDep, current_user: CurrentUser
) -> dict[str, list[dict[str, object]]]:
    return await service.list_integrations(session=session, current_user=current_user)


@router.get("/audit", response_model=CapAuditEventListPublic)
async def read_audit(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    pagination: PaginationDep,
    alert_id: uuid.UUID | None = Query(default=None),
) -> CapAuditEventListPublic:
    events, total = await service.list_audit_events(
        session=session,
        current_user=current_user,
        alert_id=alert_id,
        skip=pagination.skip,
        limit=pagination.limit,
    )
    return CapAuditEventListPublic(
        data=events, count=total, page=pagination.page, size=pagination.size
    )


@router.get("/feeds", response_model=list[CapFeedImportPublic])
async def read_feeds(
    *, session: SessionDep, current_user: CurrentUser
) -> list[CapFeedImportPublic]:
    feeds = await service.list_feeds(session=session, current_user=current_user)
    return [CapFeedImportPublic.model_validate(f, from_attributes=True) for f in feeds]


@router.post(
    "/feeds",
    response_model=CapFeedImportPublic,
    status_code=status.HTTP_201_CREATED,
    summary="Register an external CAP feed source",
)
async def create_feed(
    *, session: SessionDep, current_user: CurrentUser, payload: CapFeedImportCreate
) -> CapFeedImportPublic:
    feed = await service.create_feed(
        session=session, current_user=current_user, payload=payload
    )
    return CapFeedImportPublic.model_validate(feed, from_attributes=True)


@router.patch("/feeds/{feed_id}", response_model=CapFeedImportPublic)
async def update_feed(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    feed_id: uuid.UUID,
    payload: CapFeedImportUpdate,
) -> CapFeedImportPublic:
    feed = await service.update_feed(
        session=session, current_user=current_user, feed_id=feed_id, payload=payload
    )
    return CapFeedImportPublic.model_validate(feed, from_attributes=True)


@router.delete(
    "/feeds/{feed_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete an external CAP feed source",
)
async def delete_feed(
    *, session: SessionDep, current_user: CurrentUser, feed_id: uuid.UUID
) -> None:
    await service.delete_feed(
        session=session, current_user=current_user, feed_id=feed_id
    )


@public_router.get("/latest-active", response_model=CapAlertListPublic)
async def read_public_latest_active(*, session: SessionDep) -> Any:
    async def _produce() -> dict[str, Any]:
        result = await service.public_latest_active(session=session)
        return result.model_dump(mode="json")

    return await cache.cached_json(cache.PUBLIC_LATEST_ACTIVE, 30, _produce)


@public_router.get("/alerts", response_model=CapAlertListPublic)
async def read_public_alerts(*, session: SessionDep) -> CapAlertListPublic:
    return await service.public_all_alerts(session=session)


@public_router.get("/past", response_model=CapAlertListPublic)
async def read_public_past_alerts(*, session: SessionDep) -> CapAlertListPublic:
    return await service.public_past_alerts(session=session)


@public_router.get("/alerts/{identifier}", response_model=CapAlertPublic)
async def read_public_alert(*, session: SessionDep, identifier: str) -> CapAlertPublic:
    return await service.public_alert_by_identifier(
        session=session, identifier=identifier
    )


@public_router.get("/alerts.geojson")
async def read_alerts_geojson(*, session: SessionDep) -> Any:
    async def _produce() -> dict[str, Any]:
        alerts = await service.public_latest_active(session=session)
        return alerts_to_feature_collection(alerts.data)

    return await cache.cached_json(cache.PUBLIC_GEOJSON, 30, _produce)


@public_router.get("/active-map")
async def read_active_map(*, session: SessionDep) -> dict[str, Any]:
    # Same payload as /alerts.geojson — share its 30s cache instead of
    # recomputing the FeatureCollection on every hit.
    async def _produce() -> dict[str, Any]:
        alerts = await service.public_latest_active(session=session)
        return alerts_to_feature_collection(alerts.data)

    result: dict[str, Any] = await cache.cached_json(cache.PUBLIC_GEOJSON, 30, _produce)
    return result


@public_router.get("/rss.xml")
async def read_rss(*, session: SessionDep) -> Response:
    async def _produce() -> str:
        alerts = await service.public_latest_active(session=session)
        return _rss_xml(alerts.data)

    body = await cache.cached_text(cache.PUBLIC_RSS, 30, _produce)
    return Response(content=body, media_type="application/rss+xml; charset=utf-8")


@public_router.get("/{identifier}.xml")
async def read_cap_xml(*, session: SessionDep, identifier: str) -> Response:
    async def _produce() -> str:
        snapshot = await service.latest_snapshot_for_identifier(
            session=session, identifier=identifier
        )
        return snapshot.xml

    body = await cache.cached_text(cache.public_xml_key(identifier), 300, _produce)
    return Response(content=body, media_type="application/xml; charset=utf-8")


def _rss_xml(alerts: list[CapAlertPublic]) -> str:
    rss = ET.Element("rss", version="2.0")
    channel = ET.SubElement(rss, "channel")
    ET.SubElement(channel, "title").text = "Grenada CAP Alerts"
    ET.SubElement(channel, "link").text = "/api/cap/latest-active"
    ET.SubElement(channel, "description").text = "Active CAP alerts"

    for alert in alerts:
        first_info = alert.info[0] if alert.info else None
        item = ET.SubElement(channel, "item")
        ET.SubElement(item, "title").text = (
            first_info.headline if first_info else alert.identifier
        )
        ET.SubElement(item, "guid").text = alert.identifier
        ET.SubElement(item, "link").text = (
            alert.xml_url or f"/api/cap/{alert.identifier}.xml"
        )
        ET.SubElement(item, "pubDate").text = alert.sent.isoformat()
        ET.SubElement(item, "description").text = (
            first_info.description if first_info else alert.note or ""
        )

    return ET.tostring(rss, encoding="unicode", xml_declaration=True)
