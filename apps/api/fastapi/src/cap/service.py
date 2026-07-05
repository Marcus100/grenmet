import hashlib
import logging
import uuid
from datetime import datetime, timezone
from typing import Any
from urllib.parse import urlparse

import feedparser  # type: ignore[import-untyped]
import httpx
import sqlalchemy as sa
from fastapi.concurrency import run_in_threadpool
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from sqlmodel import col, select

from src.auth.models import User
from src.auth.policy import require_permission
from src.cap.cache import PUBLIC_FEED_KEYS, invalidate, public_xml_key
from src.cap.exceptions import (
    CapAlertNotFoundError,
    CapFeedNotFoundError,
    CapImportError,
    CapSnapshotNotFoundError,
    CapStateError,
    CapValidationFailedError,
)
from src.cap.models import (
    CapAlert,
    CapArea,
    CapAuditEvent,
    CapCategory,
    CapCertainty,
    CapFeedImport,
    CapIncident,
    CapInfo,
    CapIntegrationStatus,
    CapJobEvent,
    CapLifecycleState,
    CapMessageType,
    CapMqttBroker,
    CapPredefinedArea,
    CapReference,
    CapResource,
    CapResponseType,
    CapScope,
    CapSettings,
    CapSeverity,
    CapSnapshot,
    CapStatus,
    CapUrgency,
    CapWebhook,
)
from src.cap.schemas import (
    CapAlertAction,
    CapAlertCreate,
    CapAlertListPublic,
    CapAlertPublic,
    CapAlertUpdate,
    CapAreaCreate,
    CapAreaPublic,
    CapAuditEventPublic,
    CapCatalogsPublic,
    CapFeedImportCreate,
    CapFeedImportUpdate,
    CapInfoCreate,
    CapInfoPublic,
    CapNameValue,
    CapPredefinedAreaCreate,
    CapPredefinedAreaPublic,
    CapReferenceCreate,
    CapReferencePublic,
    CapResourceCreate,
    CapResourcePublic,
    CapSettingsPublic,
    CapSettingsUpdate,
    CapSnapshotPublic,
    CapValidationResult,
)
from src.cap.sign import is_signing_enabled, sign_xml, signing_key_ref
from src.cap.tasks import enqueue_publish_side_effects
from src.cap.validation import (
    MAX_IMPORT_BYTES,
    ensure_public_host,
    validate_cap_alert,
    validate_import_url,
)
from src.cap.xml import alert_to_cap_xml, xml_to_alert_data
from src.config import settings as app_config
from src.utils.datetime import utc_now

logger = logging.getLogger(__name__)


def _as_categories(values: list[str]) -> list[CapCategory]:
    """Coerce JSON-stored category strings into the typed CapCategory enum."""
    return [CapCategory(value) for value in values]


def _as_name_values(values: list[dict[str, str]]) -> list[CapNameValue]:
    """Coerce JSON-stored name/value dicts into typed CapNameValue models."""
    return [CapNameValue.model_validate(value) for value in values]


EDITABLE_STATES = {
    CapLifecycleState.DRAFT,
    CapLifecycleState.SUBMITTED,
    CapLifecycleState.APPROVED,
}


def _info_to_public_from_loaded(info: CapInfo) -> CapInfoPublic:
    """Build CapInfoPublic from an already-loaded CapInfo (no queries fired)."""
    resource_rows = sorted(info.resources or [], key=lambda x: x.sequence)
    area_rows = sorted(info.areas or [], key=lambda x: x.sequence)
    return CapInfoPublic(
        id=info.id,
        sequence=info.sequence,
        language=info.language,
        categories=_as_categories(info.categories or []),
        event=info.event,
        event_codes=_as_name_values(info.event_codes or []),
        response_types=info.response_types or [],
        urgency=info.urgency,
        severity=info.severity,
        certainty=info.certainty,
        audience=info.audience,
        effective=info.effective,
        onset=info.onset,
        expires=info.expires,
        sender_name=info.sender_name,
        headline=info.headline,
        description=info.description,
        instruction=info.instruction,
        web=info.web,
        contact=info.contact,
        parameters=_as_name_values(info.parameters or []),
        resources=[
            CapResourcePublic.model_validate(r, from_attributes=True)
            for r in resource_rows
        ],
        areas=[_area_to_public(area) for area in area_rows],
    )


def _to_public_from_loaded(alert: CapAlert) -> CapAlertPublic:
    """Build CapAlertPublic from relationships already loaded via selectinload."""
    info_rows = sorted(alert.info_blocks or [], key=lambda x: x.sequence)
    reference_rows = sorted(alert.cap_references or [], key=lambda x: x.sequence)
    incident_rows = sorted(alert.incidents or [], key=lambda x: x.sequence)
    return CapAlertPublic(
        id=alert.id,
        identifier=alert.identifier,
        sender=alert.sender,
        sent=alert.sent,
        status=alert.status,
        msg_type=alert.msg_type,
        source=alert.source,
        scope=alert.scope,
        restriction=alert.restriction,
        addresses=list(alert.addresses or []),
        codes=list(alert.codes or []),
        note=alert.note,
        lifecycle_state=alert.lifecycle_state,
        created_by_user_id=alert.created_by_user_id,
        updated_by_user_id=alert.updated_by_user_id,
        submitted_at=alert.submitted_at,
        approved_at=alert.approved_at,
        published_at=alert.published_at,
        expired_at=alert.expired_at,
        created_at=alert.created_at,
        updated_at=alert.updated_at,
        references=[
            CapReferencePublic.model_validate(r, from_attributes=True)
            for r in reference_rows
        ],
        incidents=[i.value for i in incident_rows],
        info=[_info_to_public_from_loaded(i) for i in info_rows],
        xml_url=f"/api/cap/{alert.identifier}.xml",
    )


def _alert_selectinload_options() -> list[Any]:
    """Standard selectinload options for eager-loading all alert children."""
    return [
        selectinload(CapAlert.info_blocks).selectinload(CapInfo.resources),  # type: ignore[arg-type]
        selectinload(CapAlert.info_blocks).selectinload(CapInfo.areas),  # type: ignore[arg-type]
        selectinload(CapAlert.cap_references),  # type: ignore[arg-type]
        selectinload(CapAlert.incidents),  # type: ignore[arg-type]
    ]


async def list_alerts(
    *,
    session: AsyncSession,
    current_user: User,
    lifecycle_state: CapLifecycleState | None = None,
) -> CapAlertListPublic:
    require_permission(current_user=current_user, permission_key="cap.alert.read")
    stmt = (
        select(CapAlert)
        .order_by(col(CapAlert.sent).desc())
        .limit(100)
        .options(*_alert_selectinload_options())
    )
    if lifecycle_state is not None:
        stmt = stmt.where(CapAlert.lifecycle_state == lifecycle_state)
    result = await session.execute(stmt)
    alerts = [_to_public_from_loaded(alert) for alert in result.scalars()]
    return CapAlertListPublic(data=alerts, count=len(alerts))


async def get_alert(
    *, session: AsyncSession, current_user: User, alert_id: uuid.UUID
) -> CapAlertPublic:
    require_permission(current_user=current_user, permission_key="cap.alert.read")
    return await _to_public(
        session=session,
        alert=await get_alert_or_404(session=session, alert_id=alert_id),
    )


async def import_alert(
    *,
    session: AsyncSession,
    current_user: User,
    source: str,
    value: str,
    http_client: httpx.AsyncClient | None = None,
) -> CapAlertPublic:
    """Import a CAP alert from a source URL or pasted XML. Reuses create_alert.

    URL imports are SSRF-guarded: the scheme/host are validated, the resolved
    host must be public (skipped when a client is injected for tests), redirects
    are not followed, and the body size is capped. Redirecting feeds are not a
    supported import source.
    """
    require_permission(current_user=current_user, permission_key="cap.alert.create")
    if source == "url":
        validate_import_url(value)
        owns_client = http_client is None
        if owns_client:
            host = urlparse(value).hostname or ""
            await ensure_public_host(host)
        client = http_client or httpx.AsyncClient()
        try:
            response = await client.get(value, timeout=15.0, follow_redirects=False)
            if response.is_redirect:
                raise CapImportError("redirects are not followed for CAP imports")
            response.raise_for_status()
            content = response.content
            if len(content) > MAX_IMPORT_BYTES:
                raise CapImportError(f"import exceeds {MAX_IMPORT_BYTES} byte limit")
            raw_xml: str | bytes = content
        except httpx.HTTPError as exc:
            raise CapImportError(
                f"could not fetch source: {type(exc).__name__}"
            ) from exc
        finally:
            if owns_client:
                await client.aclose()
    else:
        raw_xml = value

    payload = xml_to_alert_data(raw_xml)  # raises CapImportError on bad XML
    if payload.identifier:
        existing = await session.execute(
            select(CapAlert).where(col(CapAlert.identifier) == payload.identifier)
        )
        if existing.scalars().first() is not None:
            raise CapImportError(f"alert {payload.identifier} already exists")
    return await create_alert(
        session=session, current_user=current_user, payload=payload
    )


async def create_alert(
    *, session: AsyncSession, current_user: User, payload: CapAlertCreate
) -> CapAlertPublic:
    require_permission(current_user=current_user, permission_key="cap.alert.create")
    settings = await get_or_create_settings(session=session)
    now = utc_now()
    alert = CapAlert(
        identifier=payload.identifier or _new_identifier(settings=settings),
        sender=payload.sender or settings.sender,
        sent=_db_datetime(payload.sent) or now,
        status=payload.status,
        msg_type=payload.msg_type,
        source=payload.source,
        scope=payload.scope,
        restriction=payload.restriction,
        addresses=payload.addresses,
        codes=payload.codes,
        note=payload.note,
        created_by_user_id=current_user.id,
        updated_by_user_id=current_user.id,
    )
    session.add(alert)
    await session.flush()
    await _create_children(session=session, alert_id=alert.id, payload=payload)
    _record_audit(
        session=session,
        alert_id=alert.id,
        actor=current_user,
        action="create",
        previous_state=None,
        next_state=alert.lifecycle_state.value,
    )
    await session.commit()
    await session.refresh(alert)
    return await _to_public(session=session, alert=alert)


async def update_alert(
    *,
    session: AsyncSession,
    current_user: User,
    alert_id: uuid.UUID,
    payload: CapAlertUpdate,
) -> CapAlertPublic:
    require_permission(current_user=current_user, permission_key="cap.alert.edit")
    alert = await get_alert_or_404(session=session, alert_id=alert_id)
    if alert.lifecycle_state not in EDITABLE_STATES:
        raise CapStateError(
            "Only draft, submitted, or approved CAP alerts can be edited."
        )

    previous_state = alert.lifecycle_state.value
    update_data = payload.model_dump(exclude_unset=True)
    child_keys = {"references", "incidents", "info"}
    for key, value in update_data.items():
        if key in child_keys:
            continue
        if value is not None:
            setattr(alert, key, _db_datetime(value) if key == "sent" else value)
    alert.updated_by_user_id = current_user.id
    alert.updated_at = utc_now()
    session.add(alert)

    if any(key in update_data for key in child_keys):
        await _replace_children(
            session=session,
            alert_id=alert.id,
            references=payload.references,
            incidents=payload.incidents,
            info=payload.info,
        )

    _record_audit(
        session=session,
        alert_id=alert.id,
        actor=current_user,
        action="update",
        previous_state=previous_state,
        next_state=alert.lifecycle_state.value,
    )
    await session.commit()
    await session.refresh(alert)
    logger.info(
        "CAP alert updated",
        extra={"alert_id": str(alert.id), "user_id": str(current_user.id)},
    )
    return await _to_public(session=session, alert=alert)


async def duplicate_alert(
    *, session: AsyncSession, current_user: User, alert_id: uuid.UUID
) -> CapAlertPublic:
    require_permission(current_user=current_user, permission_key="cap.alert.create")
    original = await get_alert_or_404(session=session, alert_id=alert_id)
    public = await _to_public(session=session, alert=original)
    payload = CapAlertCreate(
        sender=public.sender,
        status=CapStatus.DRAFT,
        msg_type=public.msg_type,
        source=public.source,
        scope=public.scope,
        restriction=public.restriction,
        addresses=public.addresses,
        codes=public.codes,
        note=public.note,
        references=[
            CapReferenceCreate(
                sender=item.sender, identifier=item.identifier, sent=item.sent
            )
            for item in public.references
        ],
        incidents=public.incidents,
        info=[
            CapInfoCreate(
                language=info.language,
                categories=info.categories,
                event=info.event,
                event_codes=info.event_codes,
                response_types=info.response_types,
                urgency=info.urgency,
                severity=info.severity,
                certainty=info.certainty,
                audience=info.audience,
                effective=info.effective,
                onset=info.onset,
                expires=info.expires,
                sender_name=info.sender_name,
                headline=f"Copy of {info.headline}",
                description=info.description,
                instruction=info.instruction,
                web=info.web,
                contact=info.contact,
                parameters=info.parameters,
                resources=[
                    CapResourceCreate(
                        resource_desc=resource.resource_desc,
                        mime_type=resource.mime_type,
                        size=resource.size,
                        uri=resource.uri,
                        deref_uri=resource.deref_uri,
                        digest=resource.digest,
                    )
                    for resource in info.resources
                ],
                areas=[
                    CapAreaCreate(
                        kind=area.kind,
                        area_desc=area.area_desc,
                        predefined_area_id=area.predefined_area_id,
                        polygons=area.polygons,
                        multipolygons=area.multipolygons,
                        circles=area.circles,
                        geocodes=area.geocodes,
                        geometry=area.geometry,
                        altitude=area.altitude,
                        ceiling=area.ceiling,
                    )
                    for area in info.areas
                ],
            )
            for info in public.info
        ],
    )
    return await create_alert(
        session=session, current_user=current_user, payload=payload
    )


async def validate_alert(
    *, session: AsyncSession, current_user: User, alert_id: uuid.UUID
) -> CapValidationResult:
    require_permission(current_user=current_user, permission_key="cap.alert.read")
    alert = await _to_public(
        session=session,
        alert=await get_alert_or_404(session=session, alert_id=alert_id),
    )
    return validate_cap_alert(alert)


async def submit_alert(
    *,
    session: AsyncSession,
    current_user: User,
    alert_id: uuid.UUID,
    payload: CapAlertAction,
) -> CapAlertPublic:
    require_permission(current_user=current_user, permission_key="cap.alert.submit")
    alert = await get_alert_or_404(session=session, alert_id=alert_id)
    return await _transition(
        session=session,
        current_user=current_user,
        alert=alert,
        action="submit",
        allowed={CapLifecycleState.DRAFT},
        next_state=CapLifecycleState.SUBMITTED,
        note=payload.note,
        timestamp_field="submitted_at",
    )


async def approve_alert(
    *,
    session: AsyncSession,
    current_user: User,
    alert_id: uuid.UUID,
    payload: CapAlertAction,
) -> CapAlertPublic:
    require_permission(current_user=current_user, permission_key="cap.alert.approve")
    alert = await get_alert_or_404(session=session, alert_id=alert_id)
    return await _transition(
        session=session,
        current_user=current_user,
        alert=alert,
        action="approve",
        allowed={CapLifecycleState.SUBMITTED},
        next_state=CapLifecycleState.APPROVED,
        note=payload.note,
        timestamp_field="approved_at",
    )


async def publish_alert(
    *,
    session: AsyncSession,
    current_user: User,
    alert_id: uuid.UUID,
    payload: CapAlertAction,
) -> tuple[CapAlertPublic, CapSnapshotPublic]:
    require_permission(current_user=current_user, permission_key="cap.alert.publish")
    alert = await get_alert_or_404(session=session, alert_id=alert_id)
    if alert.lifecycle_state != CapLifecycleState.APPROVED:
        raise CapStateError("Only approved CAP alerts can be published.")
    public = await _to_public(session=session, alert=alert)
    validation = validate_cap_alert(public)
    if not validation.is_valid:
        raise CapValidationFailedError(validation.errors)
    xml = alert_to_cap_xml(public)
    snapshot = _snapshot_from_xml(alert=alert, xml=xml)
    session.add(snapshot)
    previous_state = alert.lifecycle_state.value
    alert.lifecycle_state = (
        CapLifecycleState.CANCELLED
        if alert.msg_type == CapMessageType.CANCEL
        else CapLifecycleState.PUBLISHED
    )
    alert.published_at = utc_now()
    alert.updated_by_user_id = current_user.id
    alert.updated_at = utc_now()
    session.add(alert)
    await session.flush()
    await enqueue_publish_side_effects(
        session=session, alert_id=alert.id, snapshot_id=snapshot.id
    )
    _record_audit(
        session=session,
        alert_id=alert.id,
        actor=current_user,
        action="publish",
        previous_state=previous_state,
        next_state=alert.lifecycle_state.value,
        note=payload.note,
        payload={"snapshot_id": str(snapshot.id)},
    )
    await session.commit()
    await session.refresh(alert)
    await session.refresh(snapshot)
    logger.info(
        "CAP alert published",
        extra={
            "alert_id": str(alert.id),
            "identifier": alert.identifier,
            "snapshot_id": str(snapshot.id),
            "user_id": str(current_user.id),
        },
    )
    await invalidate(*PUBLIC_FEED_KEYS, public_xml_key(alert.identifier))
    return await _to_public(
        session=session, alert=alert
    ), CapSnapshotPublic.model_validate(snapshot, from_attributes=True)


async def cancel_alert(
    *,
    session: AsyncSession,
    current_user: User,
    alert_id: uuid.UUID,
    payload: CapAlertAction,
) -> CapAlertPublic:
    require_permission(current_user=current_user, permission_key="cap.alert.publish")
    alert = await get_alert_or_404(session=session, alert_id=alert_id)
    if alert.lifecycle_state != CapLifecycleState.PUBLISHED:
        raise CapStateError("Only published CAP alerts can be cancelled.")
    previous_state = alert.lifecycle_state.value
    if alert.msg_type != CapMessageType.CANCEL:
        session.add(
            CapReference(
                alert_id=alert.id,
                sequence=0,
                sender=alert.sender,
                identifier=alert.identifier,
                sent=alert.sent,
            )
        )
    alert.msg_type = CapMessageType.CANCEL
    alert.lifecycle_state = CapLifecycleState.CANCELLED
    alert.updated_by_user_id = current_user.id
    alert.updated_at = utc_now()
    session.add(alert)
    await session.flush()
    public = await _to_public(session=session, alert=alert)
    xml = alert_to_cap_xml(public)
    snapshot = _snapshot_from_xml(alert=alert, xml=xml)
    session.add(snapshot)
    await session.flush()
    await enqueue_publish_side_effects(
        session=session, alert_id=alert.id, snapshot_id=snapshot.id
    )
    _record_audit(
        session=session,
        alert_id=alert.id,
        actor=current_user,
        action="cancel",
        previous_state=previous_state,
        next_state=alert.lifecycle_state.value,
        note=payload.note,
        payload={"snapshot_id": str(snapshot.id)},
    )
    await session.commit()
    await session.refresh(alert)
    await invalidate(*PUBLIC_FEED_KEYS, public_xml_key(alert.identifier))
    return await _to_public(session=session, alert=alert)


async def expire_alert(
    *,
    session: AsyncSession,
    current_user: User,
    alert_id: uuid.UUID,
    payload: CapAlertAction,
) -> CapAlertPublic:
    require_permission(current_user=current_user, permission_key="cap.alert.publish")
    alert = await get_alert_or_404(session=session, alert_id=alert_id)
    identifier = alert.identifier
    public = await _transition(
        session=session,
        current_user=current_user,
        alert=alert,
        action="expire",
        allowed={CapLifecycleState.PUBLISHED},
        next_state=CapLifecycleState.EXPIRED,
        note=payload.note,
        timestamp_field="expired_at",
    )
    # Expiring removes the alert from the active feeds; invalidate the public
    # caches so latest-active/past reflect it immediately (matches publish/cancel).
    await invalidate(*PUBLIC_FEED_KEYS, public_xml_key(identifier))
    return public


async def get_or_create_settings(*, session: AsyncSession) -> CapSettings:
    result = await session.execute(
        select(CapSettings).order_by(col(CapSettings.created_at))
    )
    settings = result.scalars().first()
    if settings:
        return settings
    settings = CapSettings()
    session.add(settings)
    await session.flush()
    return settings


async def read_settings(
    *, session: AsyncSession, current_user: User
) -> CapSettingsPublic:
    require_permission(current_user=current_user, permission_key="cap.settings.manage")
    settings = await get_or_create_settings(session=session)
    await session.commit()
    await session.refresh(settings)
    return CapSettingsPublic.model_validate(settings, from_attributes=True)


async def update_settings(
    *, session: AsyncSession, current_user: User, payload: CapSettingsUpdate
) -> CapSettingsPublic:
    require_permission(current_user=current_user, permission_key="cap.settings.manage")
    settings = await get_or_create_settings(session=session)
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(settings, key, value)
    settings.updated_at = utc_now()
    session.add(settings)
    _record_audit(
        session=session,
        alert_id=None,
        actor=current_user,
        action="settings.update",
        previous_state=None,
        next_state=None,
    )
    await session.commit()
    await session.refresh(settings)
    return CapSettingsPublic.model_validate(settings, from_attributes=True)


def get_catalogs() -> CapCatalogsPublic:
    return CapCatalogsPublic(
        categories=[item.value for item in CapCategory],
        response_types=[item.value for item in CapResponseType],
        urgencies=[item.value for item in CapUrgency],
        severities=[item.value for item in CapSeverity],
        certainties=[item.value for item in CapCertainty],
        statuses=[item.value for item in CapStatus],
        message_types=[item.value for item in CapMessageType],
        scopes=[item.value for item in CapScope],
        languages=["en"],
    )


async def list_predefined_areas(
    *, session: AsyncSession, current_user: User
) -> list[CapPredefinedAreaPublic]:
    require_permission(current_user=current_user, permission_key="cap.alert.read")
    result = await session.execute(
        select(CapPredefinedArea).order_by(CapPredefinedArea.name).limit(100)
    )
    return [_predefined_area_to_public(area) for area in result.scalars()]


async def create_predefined_area(
    *, session: AsyncSession, current_user: User, payload: CapPredefinedAreaCreate
) -> CapPredefinedAreaPublic:
    require_permission(current_user=current_user, permission_key="cap.settings.manage")
    area = CapPredefinedArea(
        name=payload.name,
        area_desc=payload.area_desc,
        geometry=payload.geometry,
        polygons=payload.polygons,
        multipolygons=payload.multipolygons,
        circles=payload.circles,
        geocodes=[item.model_dump() for item in payload.geocodes],
        is_active=payload.is_active,
    )
    session.add(area)
    await session.commit()
    await session.refresh(area)
    return _predefined_area_to_public(area)


async def list_audit_events(
    *, session: AsyncSession, current_user: User, alert_id: uuid.UUID | None = None
) -> list[CapAuditEventPublic]:
    require_permission(current_user=current_user, permission_key="cap.alert.read")
    stmt = (
        select(CapAuditEvent).order_by(col(CapAuditEvent.created_at).desc()).limit(100)
    )
    if alert_id is not None:
        stmt = stmt.where(CapAuditEvent.alert_id == alert_id)
    result = await session.execute(stmt)
    return [
        CapAuditEventPublic.model_validate(event, from_attributes=True)
        for event in result.scalars()
    ]


async def list_integrations(
    *, session: AsyncSession, current_user: User
) -> dict[str, list[dict[str, object]]]:
    require_permission(
        current_user=current_user, permission_key="cap.integrations.manage"
    )
    webhooks = (
        await session.execute(select(CapWebhook).order_by(CapWebhook.name).limit(100))
    ).scalars()
    mqtt_brokers = (
        await session.execute(
            select(CapMqttBroker).order_by(CapMqttBroker.name).limit(100)
        )
    ).scalars()
    jobs = (
        await session.execute(
            select(CapJobEvent).order_by(col(CapJobEvent.created_at).desc()).limit(100)
        )
    ).scalars()
    return {
        "webhooks": [
            {
                "id": str(item.id),
                "name": item.name,
                "url": item.url,
                "status": item.status.value,
                "event_types": item.event_types,
            }
            for item in webhooks
        ],
        "mqtt_brokers": [
            {
                "id": str(item.id),
                "name": item.name,
                "host": item.host,
                "port": item.port,
                "topic": item.topic,
                "status": item.status.value,
            }
            for item in mqtt_brokers
        ],
        "job_events": [
            {
                "id": str(item.id),
                "kind": item.kind,
                "status": item.status.value,
                "attempts": item.attempts,
                "created_at": item.created_at.isoformat(),
            }
            for item in jobs
        ],
    }


async def public_latest_active(*, session: AsyncSession) -> CapAlertListPublic:
    alerts = await _public_alerts_by_state(
        session=session, states={CapLifecycleState.PUBLISHED}
    )
    active = [alert for alert in alerts if _is_active(alert)]
    return CapAlertListPublic(data=active, count=len(active))


async def public_past_alerts(*, session: AsyncSession) -> CapAlertListPublic:
    alerts = await _public_alerts_by_state(
        session=session, states={CapLifecycleState.EXPIRED, CapLifecycleState.CANCELLED}
    )
    return CapAlertListPublic(data=alerts, count=len(alerts))


async def public_all_alerts(*, session: AsyncSession) -> CapAlertListPublic:
    alerts = await _public_alerts_by_state(
        session=session,
        states={
            CapLifecycleState.PUBLISHED,
            CapLifecycleState.EXPIRED,
            CapLifecycleState.CANCELLED,
        },
    )
    return CapAlertListPublic(data=alerts, count=len(alerts))


async def public_alert_by_identifier(
    *, session: AsyncSession, identifier: str
) -> CapAlertPublic:
    result = await session.execute(
        select(CapAlert)
        .where(CapAlert.identifier == identifier)
        .where(
            col(CapAlert.lifecycle_state).in_(
                {
                    CapLifecycleState.PUBLISHED,
                    CapLifecycleState.EXPIRED,
                    CapLifecycleState.CANCELLED,
                }
            )
        )
    )
    alert = result.scalars().first()
    if not alert:
        raise CapAlertNotFoundError()
    return await _to_public(session=session, alert=alert)


async def latest_snapshot_for_identifier(
    *, session: AsyncSession, identifier: str
) -> CapSnapshot:
    result = await session.execute(
        select(CapSnapshot)
        .where(CapSnapshot.identifier == identifier)
        .order_by(col(CapSnapshot.generated_at).desc())
    )
    snapshot = result.scalars().first()
    if not snapshot:
        raise CapSnapshotNotFoundError()
    return snapshot


async def get_alert_or_404(*, session: AsyncSession, alert_id: uuid.UUID) -> CapAlert:
    result = await session.execute(select(CapAlert).where(CapAlert.id == alert_id))
    alert = result.scalars().first()
    if not alert:
        raise CapAlertNotFoundError()
    return alert


async def _transition(
    *,
    session: AsyncSession,
    current_user: User,
    alert: CapAlert,
    action: str,
    allowed: set[CapLifecycleState],
    next_state: CapLifecycleState,
    note: str | None,
    timestamp_field: str,
) -> CapAlertPublic:
    if alert.lifecycle_state not in allowed:
        allowed_text = ", ".join(
            state.value for state in sorted(allowed, key=lambda item: item.value)
        )
        raise CapStateError(
            f"CAP alert must be in one of these states: {allowed_text}."
        )
    previous_state = alert.lifecycle_state.value
    alert.lifecycle_state = next_state
    setattr(alert, timestamp_field, utc_now())
    alert.updated_by_user_id = current_user.id
    alert.updated_at = utc_now()
    session.add(alert)
    _record_audit(
        session=session,
        alert_id=alert.id,
        actor=current_user,
        action=action,
        previous_state=previous_state,
        next_state=next_state.value,
        note=note,
    )
    await session.commit()
    await session.refresh(alert)
    logger.info(
        "CAP alert state transition",
        extra={
            "alert_id": str(alert.id),
            "action": action,
            "previous_state": previous_state,
            "next_state": next_state.value,
            "user_id": str(current_user.id),
        },
    )
    return await _to_public(session=session, alert=alert)


async def _public_alerts_by_state(
    *, session: AsyncSession, states: set[CapLifecycleState]
) -> list[CapAlertPublic]:
    stmt = (
        select(CapAlert)
        .where(col(CapAlert.lifecycle_state).in_(states))
        .order_by(col(CapAlert.sent).desc())
        .limit(100)
        .options(*_alert_selectinload_options())
    )
    result = await session.execute(stmt)
    return [_to_public_from_loaded(alert) for alert in result.scalars()]


def _is_active(alert: CapAlertPublic) -> bool:
    if alert.lifecycle_state != CapLifecycleState.PUBLISHED:
        return False
    now = utc_now()
    expires_values = [info.expires for info in alert.info if info.expires is not None]
    return not expires_values or any(
        _as_naive(expires) > now for expires in expires_values
    )


async def _to_public(*, session: AsyncSession, alert: CapAlert) -> CapAlertPublic:
    # Re-fetch with all children eager-loaded, then render via the loaded builder
    # so a single query set replaces the previous per-child (N+1) lookups. Callers
    # commit/flush their changes before rendering, so the reload sees fresh data.
    result = await session.execute(
        select(CapAlert)
        .where(CapAlert.id == alert.id)
        .options(*_alert_selectinload_options())
    )
    loaded = result.scalars().first()
    if loaded is None:
        raise CapAlertNotFoundError()
    return _to_public_from_loaded(loaded)


def _area_to_public(area: CapArea) -> CapAreaPublic:
    return CapAreaPublic(
        id=area.id,
        sequence=area.sequence,
        kind=area.kind,
        area_desc=area.area_desc,
        predefined_area_id=area.predefined_area_id,
        polygons=area.polygons or [],
        multipolygons=area.multipolygons or [],
        circles=area.circles or [],
        geocodes=_as_name_values(area.geocodes or []),
        geometry=area.geometry,
        altitude=area.altitude,
        ceiling=area.ceiling,
    )


def _predefined_area_to_public(area: CapPredefinedArea) -> CapPredefinedAreaPublic:
    return CapPredefinedAreaPublic(
        id=area.id,
        name=area.name,
        area_desc=area.area_desc,
        geometry=area.geometry,
        polygons=area.polygons or [],
        multipolygons=area.multipolygons or [],
        circles=area.circles or [],
        geocodes=_as_name_values(area.geocodes or []),
        is_active=area.is_active,
        created_at=area.created_at,
        updated_at=area.updated_at,
    )


async def _create_children(
    *, session: AsyncSession, alert_id: uuid.UUID, payload: CapAlertCreate
) -> None:
    for index, reference in enumerate(payload.references):
        session.add(
            _reference_from_payload(
                alert_id=alert_id, sequence=index, payload=reference
            )
        )
    for index, incident in enumerate(payload.incidents):
        session.add(CapIncident(alert_id=alert_id, sequence=index, value=incident))
    for index, info_payload in enumerate(payload.info):
        await _create_info(
            session=session, alert_id=alert_id, sequence=index, payload=info_payload
        )


async def _replace_children(
    *,
    session: AsyncSession,
    alert_id: uuid.UUID,
    references: list[CapReferenceCreate] | None,
    incidents: list[str] | None,
    info: list[CapInfoCreate] | None,
) -> None:
    if references is not None:
        await session.execute(
            sa.delete(CapReference).where(col(CapReference.alert_id) == alert_id)
        )
        for index, reference in enumerate(references):
            session.add(
                _reference_from_payload(
                    alert_id=alert_id, sequence=index, payload=reference
                )
            )
    if incidents is not None:
        await session.execute(
            sa.delete(CapIncident).where(col(CapIncident.alert_id) == alert_id)
        )
        for index, incident in enumerate(incidents):
            session.add(CapIncident(alert_id=alert_id, sequence=index, value=incident))
    if info is not None:
        info_rows = await _info_rows(session=session, alert_id=alert_id)
        info_ids = [row.id for row in info_rows]
        if info_ids:
            await session.execute(
                sa.delete(CapArea).where(col(CapArea.info_id).in_(info_ids))
            )
            await session.execute(
                sa.delete(CapResource).where(col(CapResource.info_id).in_(info_ids))
            )
        await session.execute(
            sa.delete(CapInfo).where(col(CapInfo.alert_id) == alert_id)
        )
        for index, info_payload in enumerate(info):
            await _create_info(
                session=session, alert_id=alert_id, sequence=index, payload=info_payload
            )


async def _create_info(
    *, session: AsyncSession, alert_id: uuid.UUID, sequence: int, payload: CapInfoCreate
) -> None:
    info = CapInfo(
        alert_id=alert_id,
        sequence=sequence,
        language=payload.language,
        categories=[category.value for category in payload.categories],
        event=payload.event,
        event_codes=[item.model_dump() for item in payload.event_codes],
        response_types=payload.response_types,
        urgency=payload.urgency,
        severity=payload.severity,
        certainty=payload.certainty,
        audience=payload.audience,
        effective=_db_datetime(payload.effective),
        onset=_db_datetime(payload.onset),
        expires=_db_datetime(payload.expires),
        sender_name=payload.sender_name,
        headline=payload.headline,
        description=payload.description,
        instruction=payload.instruction,
        web=payload.web,
        contact=payload.contact,
        parameters=[item.model_dump() for item in payload.parameters],
    )
    session.add(info)
    await session.flush()
    for index, resource in enumerate(payload.resources):
        session.add(
            _resource_from_payload(info_id=info.id, sequence=index, payload=resource)
        )
    for index, area in enumerate(payload.areas):
        session.add(_area_from_payload(info_id=info.id, sequence=index, payload=area))


def _reference_from_payload(
    *, alert_id: uuid.UUID, sequence: int, payload: CapReferenceCreate
) -> CapReference:
    return CapReference(
        alert_id=alert_id,
        sequence=sequence,
        sender=payload.sender,
        identifier=payload.identifier,
        sent=_db_datetime(payload.sent) or utc_now(),
    )


def _resource_from_payload(
    *, info_id: uuid.UUID, sequence: int, payload: CapResourceCreate
) -> CapResource:
    return CapResource(
        info_id=info_id,
        sequence=sequence,
        resource_desc=payload.resource_desc,
        mime_type=payload.mime_type,
        size=payload.size,
        uri=payload.uri,
        deref_uri=payload.deref_uri,
        digest=payload.digest,
    )


def _area_from_payload(
    *, info_id: uuid.UUID, sequence: int, payload: CapAreaCreate
) -> CapArea:
    return CapArea(
        info_id=info_id,
        predefined_area_id=payload.predefined_area_id,
        sequence=sequence,
        kind=payload.kind,
        area_desc=payload.area_desc,
        polygons=payload.polygons,
        multipolygons=payload.multipolygons,
        circles=payload.circles,
        geocodes=[item.model_dump() for item in payload.geocodes],
        geometry=payload.geometry,
        altitude=payload.altitude,
        ceiling=payload.ceiling,
    )


async def _info_rows(*, session: AsyncSession, alert_id: uuid.UUID) -> list[CapInfo]:
    result = await session.execute(
        select(CapInfo)
        .where(CapInfo.alert_id == alert_id)
        .order_by(col(CapInfo.sequence))
    )
    return list(result.scalars())


def _snapshot_from_xml(*, alert: CapAlert, xml: str) -> CapSnapshot:
    signed_xml = sign_xml(xml)  # no-op unless signing is configured
    return CapSnapshot(
        alert_id=alert.id,
        identifier=alert.identifier,
        xml=signed_xml,
        content_hash=hashlib.sha256(signed_xml.encode("utf-8")).hexdigest(),
        generated_at=utc_now(),
        signed_at=utc_now() if is_signing_enabled() else None,
        signing_key_ref=signing_key_ref(),
    )


def _record_audit(
    *,
    session: AsyncSession,
    alert_id: uuid.UUID | None,
    actor: User,
    action: str,
    previous_state: str | None,
    next_state: str | None,
    note: str | None = None,
    payload: dict[str, object] | None = None,
) -> None:
    session.add(
        CapAuditEvent(
            alert_id=alert_id,
            actor_user_id=actor.id,
            action=action,
            previous_state=previous_state,
            next_state=next_state,
            note=note,
            payload=payload or {},
        )
    )


def _new_identifier(*, settings: CapSettings) -> str:
    if settings.wmo_oid:
        return f"urn:oid:{settings.wmo_oid}:{uuid.uuid4()}"
    return f"urn:grenmet:cap:{uuid.uuid4()}"


def _as_naive(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value
    return value.astimezone(timezone.utc).replace(tzinfo=None)


def _db_datetime(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value
    return value.astimezone(timezone.utc).replace(tzinfo=None)


# --------------------------------------------------------------------------- #
# External CAP feed ingestion
# --------------------------------------------------------------------------- #


async def list_feeds(
    *, session: AsyncSession, current_user: User
) -> list[CapFeedImport]:
    require_permission(current_user=current_user, permission_key="cap.feed.manage")
    result = await session.execute(
        select(CapFeedImport).order_by(col(CapFeedImport.created_at).desc())
    )
    return list(result.scalars().all())


async def create_feed(
    *, session: AsyncSession, current_user: User, payload: CapFeedImportCreate
) -> CapFeedImport:
    require_permission(current_user=current_user, permission_key="cap.feed.manage")
    feed = CapFeedImport(name=payload.name, url=payload.url)
    session.add(feed)
    await session.commit()
    await session.refresh(feed)
    return feed


async def update_feed(
    *,
    session: AsyncSession,
    current_user: User,
    feed_id: uuid.UUID,
    payload: CapFeedImportUpdate,
) -> CapFeedImport:
    require_permission(current_user=current_user, permission_key="cap.feed.manage")
    feed = await session.get(CapFeedImport, feed_id)
    if feed is None:
        raise CapFeedNotFoundError()
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(feed, field, value)
    feed.updated_at = utc_now()
    session.add(feed)
    await session.commit()
    await session.refresh(feed)
    return feed


async def delete_feed(
    *, session: AsyncSession, current_user: User, feed_id: uuid.UUID
) -> None:
    require_permission(current_user=current_user, permission_key="cap.feed.manage")
    feed = await session.get(CapFeedImport, feed_id)
    if feed is None:
        raise CapFeedNotFoundError()
    await session.delete(feed)
    await session.commit()


async def _system_user(*, session: AsyncSession) -> User | None:
    """The actor for automated ingestion (first superuser; bypasses permissions)."""
    result = await session.execute(
        select(User)
        .where(col(User.email) == app_config.FIRST_SUPERUSER)
        .options(selectinload(User.roles))  # type: ignore[arg-type]
    )
    return result.scalars().first()


async def ingest_feed(
    *,
    session: AsyncSession,
    feed: CapFeedImport,
    system_user: User,
    http_client: httpx.AsyncClient,
) -> dict[str, int]:
    """Fetch a feed, import each entry's CAP XML (dedup by identifier)."""
    parsed = await run_in_threadpool(
        feedparser.parse, feed.url, etag=feed.last_etag or None
    )
    if getattr(parsed, "status", None) == 304:
        feed.last_checked_at = utc_now()
        session.add(feed)
        await session.commit()
        return {"created": 0, "skipped": 0}

    created = 0
    skipped = 0
    for entry in getattr(parsed, "entries", []):
        link = entry.get("link")
        if not link:
            continue
        try:
            await import_alert(
                session=session,
                current_user=system_user,
                source="url",
                value=link,
                http_client=http_client,
            )
            created += 1
        except CapImportError:  # malformed or duplicate — skip, keep going
            skipped += 1

    feed.last_checked_at = utc_now()
    feed.last_error = None
    feed.last_etag = getattr(parsed, "etag", None) or feed.last_etag
    session.add(feed)
    await session.commit()
    return {"created": created, "skipped": skipped}


async def ingest_all_active_feeds(
    *, session: AsyncSession, http_client: httpx.AsyncClient | None = None
) -> int:
    """Worker entrypoint: ingest every ACTIVE feed. Returns count processed."""
    system_user = await _system_user(session=session)
    if system_user is None:
        logger.warning("CAP feed ingestion skipped: no superuser seeded")
        return 0
    result = await session.execute(
        select(CapFeedImport).where(
            col(CapFeedImport.status) == CapIntegrationStatus.ACTIVE
        )
    )
    feeds = list(result.scalars().all())
    owns_client = http_client is None
    client = http_client or httpx.AsyncClient()
    try:
        for feed in feeds:
            try:
                await ingest_feed(
                    session=session,
                    feed=feed,
                    system_user=system_user,
                    http_client=client,
                )
            except Exception as exc:  # noqa: BLE001 - record + continue to next feed
                feed.last_error = str(exc)
                feed.last_checked_at = utc_now()
                session.add(feed)
                await session.commit()
                logger.warning(
                    "CAP feed ingest failed", extra={"feed_id": str(feed.id)}
                )
    finally:
        if owns_client:
            await client.aclose()
    return len(feeds)
