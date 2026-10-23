import hashlib
import logging
import uuid
from urllib.parse import urlparse

import feedparser
import httpx
import sqlalchemy as sa
from fastapi.concurrency import run_in_threadpool
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from src.auth.models import User
from src.auth.policy import require_permission
from src.cap.admin_lists import (
    create_predefined_area,
    get_catalogs,
    get_or_create_settings,
    list_audit_events,
    list_integrations,
    list_predefined_areas,
    read_settings,
    update_settings,
)
from src.cap.cache import PUBLIC_FEED_KEYS, invalidate, public_xml_key
from src.cap.common import (
    _as_naive,
    _db_datetime,
    _new_identifier,
    _record_audit,
)
from src.cap.exceptions import (
    CapAlertNotFoundError,
    CapFeedNotFoundError,
    CapImportError,
    CapStateError,
    CapValidationFailedError,
)
from src.cap.mapping import (
    _alert_selectinload_options,
    _area_to_public,
    _as_categories,
    _as_name_values,
    _info_to_public_from_loaded,
    _predefined_area_to_public,
    _to_public,
    _to_public_from_loaded,
)
from src.cap.models import (
    CapAlert,
    CapArea,
    CapAuditEvent,
    CapFeedImport,
    CapIncident,
    CapInfo,
    CapIntegrationStatus,
    CapLifecycleState,
    CapMessageType,
    CapReference,
    CapResource,
    CapSnapshot,
    CapStatus,
)
from src.cap.public_queries import (
    PUBLIC_HAZARD_GROUPS,
    _attach_public_replacements,
    _public_alerts_by_state,
    latest_snapshot_for_identifier,
    public_alert_by_identifier,
    public_all_alerts,
    public_latest_active,
    public_past_alerts,
    public_recent_cancels,
    public_warnings,
    select_public_warnings,
)
from src.cap.schemas import (
    CapAlertAction,
    CapAlertCreate,
    CapAlertPublic,
    CapAlertUpdate,
    CapAreaCreate,
    CapEmergencyPublish,
    CapFeedImportCreate,
    CapFeedImportUpdate,
    CapInfoCreate,
    CapReferenceCreate,
    CapResourceCreate,
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

__all__ = [
    "PUBLIC_HAZARD_GROUPS",
    "_alert_selectinload_options",
    "_area_to_public",
    "_as_categories",
    "_as_naive",
    "_as_name_values",
    "_attach_public_replacements",
    "_db_datetime",
    "_info_to_public_from_loaded",
    "_new_identifier",
    "_predefined_area_to_public",
    "_public_alerts_by_state",
    "_record_audit",
    "_to_public",
    "_to_public_from_loaded",
    "create_predefined_area",
    "get_catalogs",
    "get_or_create_settings",
    "latest_snapshot_for_identifier",
    "list_audit_events",
    "list_integrations",
    "list_predefined_areas",
    "public_alert_by_identifier",
    "public_all_alerts",
    "public_latest_active",
    "public_past_alerts",
    "public_recent_cancels",
    "public_warnings",
    "read_settings",
    "select_public_warnings",
    "update_settings",
]


EDITABLE_STATES = {
    CapLifecycleState.DRAFT,
    CapLifecycleState.SUBMITTED,
    CapLifecycleState.APPROVED,
}


async def list_alerts(
    *,
    session: AsyncSession,
    current_user: User,
    lifecycle_state: CapLifecycleState | None = None,
    skip: int = 0,
    limit: int = 100,
) -> tuple[list[CapAlertPublic], int]:
    require_permission(current_user=current_user, permission_key="cap.alert.read")
    base = select(CapAlert)
    if lifecycle_state is not None:
        base = base.where(CapAlert.lifecycle_state == lifecycle_state)
    total = await session.scalar(select(sa.func.count()).select_from(base.subquery()))
    stmt = (
        base.order_by(CapAlert.sent.desc())
        .offset(skip)
        .limit(limit)
        .options(*_alert_selectinload_options())
    )
    result = await session.execute(stmt)
    alerts = [_to_public_from_loaded(alert) for alert in result.scalars()]
    return alerts, total or 0


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
            select(CapAlert).where(CapAlert.identifier == payload.identifier)
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
    alert = await get_alert_or_404(session=session, alert_id=alert_id, for_update=True)
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
    # Editing after review invalidates it: approval applies to the content approved.
    if alert.lifecycle_state in {
        CapLifecycleState.SUBMITTED,
        CapLifecycleState.APPROVED,
    }:
        alert.lifecycle_state = CapLifecycleState.DRAFT
        alert.approved_at = None
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
    # Database timestamps are naive UTC; use the public UTC representation when
    # constructing a new input, whose timestamps must carry explicit offsets.
    public = CapAlertPublic.model_validate(public.model_dump(mode="json"))
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
    alert = await get_alert_or_404(session=session, alert_id=alert_id, for_update=True)
    from src.baseline.models import ApprovalPolicy

    policy = await session.get(ApprovalPolicy, "cap")
    if policy is None:
        from src.exceptions import AppException

        raise AppException(
            "Configure the CAP approval policy in HR Setup before submitting", 409
        )
    alert.allow_self_approval = policy.allow_self_approval
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
    alert = await get_alert_or_404(session=session, alert_id=alert_id, for_update=True)
    # ADR-0023: approval always needs a different person; the legacy
    # `allow_self_approval` policy flag no longer relaxes this for CAP.
    if alert.created_by_user_id == current_user.id:
        from src.exceptions import AppException

        raise AppException("Another authorised person must approve this alert", 403)
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


async def _approved_by_another(*, session: AsyncSession, alert: CapAlert) -> bool:
    """True when the latest approval was recorded by someone other than the author."""
    actor = (
        await session.execute(
            select(CapAuditEvent.actor_user_id)
            .where(
                CapAuditEvent.alert_id == alert.id, CapAuditEvent.action == "approve"
            )
            .order_by(CapAuditEvent.created_at.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    return actor is not None and actor != alert.created_by_user_id


async def publish_alert(
    *,
    session: AsyncSession,
    current_user: User,
    alert_id: uuid.UUID,
    payload: CapAlertAction,
) -> tuple[CapAlertPublic, CapSnapshotPublic]:
    """Normal publish: only an Approved alert (approved by a non-author)."""
    require_permission(current_user=current_user, permission_key="cap.alert.publish")
    alert = await get_alert_or_404(session=session, alert_id=alert_id, for_update=True)
    if alert.lifecycle_state != CapLifecycleState.APPROVED:
        raise CapStateError(
            "Only an approved alert can be published. Submit it for approval, "
            "or use emergency publish if you hold that permission."
        )
    if not await _approved_by_another(session=session, alert=alert):
        raise CapStateError(
            "This alert was not approved by someone other than its author."
        )
    return await _publish(
        session=session, current_user=current_user, alert=alert, note=payload.note
    )


async def emergency_publish_alert(
    *,
    session: AsyncSession,
    current_user: User,
    alert_id: uuid.UUID,
    payload: CapEmergencyPublish,
) -> tuple[CapAlertPublic, CapSnapshotPublic]:
    """Duty-supervisor publish without approval; reason mandatory, always audited."""
    require_permission(
        current_user=current_user, permission_key="cap.alert.publish_emergency"
    )
    reason = payload.reason.strip()
    if not reason:
        raise CapValidationFailedError(["An emergency publish reason is required."])
    alert = await get_alert_or_404(session=session, alert_id=alert_id, for_update=True)
    if alert.lifecycle_state not in {
        CapLifecycleState.DRAFT,
        CapLifecycleState.SUBMITTED,
        CapLifecycleState.APPROVED,
    }:
        raise CapStateError(
            "Only a draft, submitted or approved alert can be published."
        )
    return await _publish(
        session=session,
        current_user=current_user,
        alert=alert,
        note=reason,
        emergency_reason=reason,
    )


async def _publish(
    *,
    session: AsyncSession,
    current_user: User,
    alert: CapAlert,
    note: str | None,
    emergency_reason: str | None = None,
) -> tuple[CapAlertPublic, CapSnapshotPublic]:
    public = await _to_public(session=session, alert=alert)
    validation = validate_cap_alert(public)
    if not validation.is_valid:
        raise CapValidationFailedError(validation.errors)
    replaced = await _published_references_for_update(
        session=session, alert=alert, public=public
    )
    xml = alert_to_cap_xml(public)
    snapshot = _snapshot_from_xml(alert=alert, xml=xml)
    session.add(snapshot)
    previous_state = alert.lifecycle_state.value
    now = utc_now()
    alert.lifecycle_state = CapLifecycleState.PUBLISHED
    alert.published_at = now
    alert.updated_by_user_id = current_user.id
    alert.updated_at = now
    session.add(alert)
    for predecessor in replaced:
        previous = predecessor.lifecycle_state.value
        predecessor.lifecycle_state = (
            CapLifecycleState.CANCELLED
            if alert.msg_type == CapMessageType.CANCEL
            else CapLifecycleState.EXPIRED
        )
        predecessor.expired_at = now
        predecessor.updated_by_user_id = current_user.id
        predecessor.updated_at = now
        _record_audit(
            session=session,
            alert_id=predecessor.id,
            actor=current_user,
            action="cancel" if alert.msg_type == CapMessageType.CANCEL else "supersede",
            previous_state=previous,
            next_state=predecessor.lifecycle_state.value,
            note=f"Replaced by {alert.identifier}",
        )
    await session.flush()
    await enqueue_publish_side_effects(
        session=session,
        alert_id=alert.id,
        snapshot_id=snapshot.id,
        status=alert.status,
        scope=alert.scope,
    )
    audit_payload: dict[str, object] = {"snapshot_id": str(snapshot.id)}
    if emergency_reason is not None:
        audit_payload["emergency"] = True
        audit_payload["reason"] = emergency_reason
    _record_audit(
        session=session,
        alert_id=alert.id,
        actor=current_user,
        action="emergency_publish" if emergency_reason is not None else "publish",
        previous_state=previous_state,
        next_state=alert.lifecycle_state.value,
        note=note,
        payload=audit_payload,
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
    await invalidate(
        *PUBLIC_FEED_KEYS,
        public_xml_key(alert.identifier),
        *(public_xml_key(item.identifier) for item in replaced),
    )
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
    alert = (
        (
            await session.execute(
                select(CapAlert).where(CapAlert.id == alert_id).with_for_update()
            )
        )
        .scalars()
        .first()
    )
    if alert is None:
        raise CapAlertNotFoundError()
    if alert.lifecycle_state != CapLifecycleState.PUBLISHED:
        raise CapStateError("Only published CAP alerts can be cancelled.")
    if alert.msg_type not in {CapMessageType.ALERT, CapMessageType.UPDATE}:
        raise CapStateError("Only an Alert or Update can be cancelled.")
    reason = (payload.note or "").strip()
    if not reason:
        raise CapValidationFailedError(["A cancellation reason is required."])
    now = utc_now()
    settings = await get_or_create_settings(session=session)
    cancellation = CapAlert(
        identifier=_new_identifier(settings=settings),
        sender=alert.sender,
        # Whole seconds: CAP 1.2 dates carry none, and the reference to this
        # message must repeat the same instant.
        sent=now.replace(microsecond=0),
        status=alert.status,
        msg_type=CapMessageType.CANCEL,
        source=alert.source,
        scope=alert.scope,
        restriction=alert.restriction,
        addresses=alert.addresses,
        codes=alert.codes,
        note=reason,
        lifecycle_state=CapLifecycleState.PUBLISHED,
        created_by_user_id=current_user.id,
        updated_by_user_id=current_user.id,
        published_at=now,
    )
    session.add(cancellation)
    await session.flush()
    session.add(
        CapReference(
            alert_id=cancellation.id,
            sequence=0,
            sender=alert.sender,
            identifier=alert.identifier,
            sent=alert.sent,
        )
    )
    await session.flush()
    public_cancel = await _to_public(session=session, alert=cancellation)
    validation = validate_cap_alert(public_cancel)
    if not validation.is_valid:
        raise CapValidationFailedError(validation.errors)
    snapshot = _snapshot_from_xml(
        alert=cancellation, xml=alert_to_cap_xml(public_cancel)
    )
    session.add(snapshot)
    previous_state = alert.lifecycle_state.value
    alert.lifecycle_state = CapLifecycleState.CANCELLED
    alert.expired_at = now
    alert.updated_by_user_id = current_user.id
    alert.updated_at = now
    session.add(alert)
    await session.flush()
    await enqueue_publish_side_effects(
        session=session,
        alert_id=cancellation.id,
        snapshot_id=snapshot.id,
        status=cancellation.status,
        scope=cancellation.scope,
    )
    _record_audit(
        session=session,
        alert_id=alert.id,
        actor=current_user,
        action="cancel",
        previous_state=previous_state,
        next_state=alert.lifecycle_state.value,
        note=reason,
        payload={
            "snapshot_id": str(snapshot.id),
            "cancellation_identifier": cancellation.identifier,
        },
    )
    await session.commit()
    await session.refresh(alert)
    await invalidate(
        *PUBLIC_FEED_KEYS,
        public_xml_key(alert.identifier),
        public_xml_key(cancellation.identifier),
    )
    return await _to_public(session=session, alert=alert)


async def _published_references_for_update(
    *, session: AsyncSession, alert: CapAlert, public: CapAlertPublic
) -> list[CapAlert]:
    if alert.msg_type not in {CapMessageType.UPDATE, CapMessageType.CANCEL}:
        return []
    if alert.msg_type == CapMessageType.CANCEL and not (public.note or "").strip():
        raise CapValidationFailedError(["A cancellation reason is required."])
    if not public.references:
        raise CapValidationFailedError(["Update and Cancel require a reference."])
    predecessors: list[CapAlert] = []
    identifiers: set[str] = set()
    for reference in public.references:
        if (
            reference.identifier == alert.identifier
            or reference.identifier in identifiers
        ):
            raise CapValidationFailedError(
                ["References must be distinct earlier messages."]
            )
        identifiers.add(reference.identifier)
        target = (
            (
                await session.execute(
                    select(CapAlert)
                    .where(CapAlert.identifier == reference.identifier)
                    .with_for_update()
                )
            )
            .scalars()
            .first()
        )
        if (
            target is None
            or target.sender != reference.sender
            or target.sent != _as_naive(reference.sent)
            or target.sender != alert.sender
            or target.scope != alert.scope
            or target.status != alert.status
            or target.msg_type not in {CapMessageType.ALERT, CapMessageType.UPDATE}
            or target.lifecycle_state != CapLifecycleState.PUBLISHED
        ):
            raise CapValidationFailedError(
                [
                    f"Reference {reference.identifier} is not a current message from this sender."
                ]
            )
        predecessors.append(target)
    return predecessors


async def expire_alert(
    *,
    session: AsyncSession,
    current_user: User,
    alert_id: uuid.UUID,
    payload: CapAlertAction,
) -> CapAlertPublic:
    require_permission(current_user=current_user, permission_key="cap.alert.publish")
    alert = await get_alert_or_404(session=session, alert_id=alert_id, for_update=True)
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


async def get_alert_or_404(
    *, session: AsyncSession, alert_id: uuid.UUID, for_update: bool = False
) -> CapAlert:
    """Load an alert. ``for_update`` takes a row lock until the transaction ends.

    Lifecycle writers (edit, submit, approve, publish, expire) lock so an edit
    and a publish cannot interleave; the loser re-reads the committed state.
    """
    stmt = select(CapAlert).where(CapAlert.id == alert_id)
    if for_update:
        stmt = stmt.with_for_update().execution_options(populate_existing=True)
    result = await session.execute(stmt)
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
            sa.delete(CapReference).where(CapReference.alert_id == alert_id)
        )
        for index, reference in enumerate(references):
            session.add(
                _reference_from_payload(
                    alert_id=alert_id, sequence=index, payload=reference
                )
            )
    if incidents is not None:
        await session.execute(
            sa.delete(CapIncident).where(CapIncident.alert_id == alert_id)
        )
        for index, incident in enumerate(incidents):
            session.add(CapIncident(alert_id=alert_id, sequence=index, value=incident))
    if info is not None:
        info_rows = await _info_rows(session=session, alert_id=alert_id)
        info_ids = [row.id for row in info_rows]
        if info_ids:
            await session.execute(
                sa.delete(CapArea).where(CapArea.info_id.in_(info_ids))
            )
            await session.execute(
                sa.delete(CapResource).where(CapResource.info_id.in_(info_ids))
            )
        await session.execute(sa.delete(CapInfo).where(CapInfo.alert_id == alert_id))
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
        select(CapInfo).where(CapInfo.alert_id == alert_id).order_by(CapInfo.sequence)
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


# --------------------------------------------------------------------------- #
# External CAP feed ingestion
# --------------------------------------------------------------------------- #


async def list_feeds(
    *, session: AsyncSession, current_user: User
) -> list[CapFeedImport]:
    require_permission(current_user=current_user, permission_key="cap.feed.manage")
    result = await session.execute(
        select(CapFeedImport).order_by(CapFeedImport.created_at.desc()).limit(100)
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
        .where(User.email == app_config.FIRST_SUPERUSER)
        .options(selectinload(User.roles))
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
        select(CapFeedImport).where(CapFeedImport.status == CapIntegrationStatus.ACTIVE)
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
