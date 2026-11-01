import hashlib
import logging
import uuid
from datetime import UTC
from urllib.parse import urlparse

import feedparser
import httpx
import sqlalchemy as sa
from fastapi.concurrency import run_in_threadpool
from lxml import etree
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from src.auth.models import User
from src.auth.policy import require_permission
from src.cap.admin_lists import (
    create_predefined_area,
    get_catalogs,
    get_gms_catalogue,
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
    CapHostRefusedError,
    CapImportError,
    CapNonConformingAlertError,
    CapStateError,
    CapValidationFailedError,
)
from src.cap.import_coerce import coerce_for_import
from src.cap.levels import INTERNAL_PARAMETERS
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
from src.cap.notifications import (
    notify_review_requested,
    notify_schema_mismatch,
    notify_warning_changed,
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
from src.cap.safe_fetch import fetch_pinned
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
    CapPublishAction,
    CapReferenceCreate,
    CapResourceCreate,
    CapReviewRecord,
    CapSnapshotPublic,
    CapValidationResult,
)
from src.cap.sign import is_signing_enabled, sign_xml, signing_key_ref
from src.cap.tasks import enqueue_publish_side_effects
from src.cap.validation import (
    MAX_IMPORT_BYTES,
    ensure_public_host,
    validate_cap_alert,
    validate_feed_url,
    validate_import_url,
)
from src.cap.xml import alert_to_cap_xml, ensure_well_formed, xml_to_alert_data
from src.cap.xsd import first_schema_error, gate_cap_xml
from src.config import settings as app_config
from src.utils.datetime import utc_now

logger = logging.getLogger(__name__)

# Generic last_error values for a feed. The UI shows these; the detail is logged.
FEED_ERROR_HOST_REFUSED = "host refused"
FEED_ERROR_FETCH = "could not fetch"
FEED_ERROR_INGEST = "ingest failed"


async def _notify_mismatch_safely(
    *, session: AsyncSession, alert: CapAlert, problem: str, action: str
) -> None:
    """Tell the duty supervisor about a format problem without ever blocking the send.

    The warning or cancellation has already been accepted at this point, so a failed
    notification is logged (identifiers only, no personal data) and swallowed.
    """
    try:
        await notify_schema_mismatch(
            session=session, alert=alert, problem=problem, action=action
        )
    except Exception:
        logger.exception(
            "CAP schema-mismatch notification failed; the alert was still sent",
            extra={"action": action, "identifier": alert.identifier},
        )


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
    "get_gms_catalogue",
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


async def get_alert_by_identifier(
    *, session: AsyncSession, current_user: User, identifier: str
) -> CapAlertPublic:
    """One alert by its CAP identifier, with every staff field (the desk's detail page)."""
    require_permission(current_user=current_user, permission_key="cap.alert.read")
    row = (
        (
            await session.execute(
                select(CapAlert)
                .where(CapAlert.identifier == identifier)
                .options(*_alert_selectinload_options())
            )
        )
        .scalars()
        .first()
    )
    if row is None:
        raise CapAlertNotFoundError()
    return await _to_public(session=session, alert=row)


async def get_alert(
    *, session: AsyncSession, current_user: User, alert_id: uuid.UUID
) -> CapAlertPublic:
    require_permission(current_user=current_user, permission_key="cap.alert.read")
    return await _to_public(
        session=session,
        alert=await get_alert_or_404(session=session, alert_id=alert_id),
    )


async def _fetch_document(
    url: str,
    *,
    http_client: httpx.AsyncClient | None,
    headers: dict[str, str] | None = None,
    allow_http: bool = False,
) -> tuple[int, httpx.Headers, bytes]:
    """GET a CAP document through the SSRF guard, reading at most MAX_IMPORT_BYTES.

    The host is checked on every fetch, whether or not a client was injected, and the
    connection goes to the address that check returned (see ``src.cap.safe_fetch``).
    """
    address = await ensure_public_host(urlparse(url).hostname or "")
    owns_client = http_client is None
    client = http_client or httpx.AsyncClient(trust_env=False)
    try:
        fetched = await fetch_pinned(
            client,
            url,
            address=address,
            max_bytes=MAX_IMPORT_BYTES,
            headers=headers,
            allow_http=allow_http,
        )
        return fetched.status, fetched.headers, fetched.body
    finally:
        if owns_client:
            await client.aclose()


def _prepare_import(raw: bytes) -> tuple[CapAlertCreate, str | None]:
    """The stored content for a document, and the problems to record (None when none).

    Runs in a worker thread: schema validation and coercion are CPU-bound.
    """
    try:
        schema_error = first_schema_error(raw)
        coerced, changes = coerce_for_import(raw)
    except etree.XMLSyntaxError as exc:
        raise CapImportError(f"invalid XML: {exc.msg}") from exc
    payload = xml_to_alert_data(coerced)
    problems = ([schema_error] if schema_error else []) + changes
    return payload, "; ".join(problems)[:1000] or None


async def import_alert(
    *,
    session: AsyncSession,
    current_user: User,
    source: str,
    value: str,
    http_client: httpx.AsyncClient | None = None,
    origin: str = "manual",
) -> CapAlertPublic:
    """Import a CAP alert from a source URL or pasted XML, and store it.

    Only malformed XML and a DTD are refused (400). A document that breaks the CAP
    1.2 schema, or that had to be changed to be stored, is kept with
    ``schema_conformant`` false and every problem listed in ``schema_error``. It is
    never published without the author's confirmation. ``origin`` records whether the
    alert came from a feed or a manual import.
    """
    require_permission(current_user=current_user, permission_key="cap.alert.create")
    if source == "url":
        validate_import_url(value)
        _, _, body = await _fetch_document(value, http_client=http_client)
        raw_bytes = body
    else:
        raw_bytes = value.encode("utf-8")
    if len(raw_bytes) > MAX_IMPORT_BYTES:
        raise CapImportError(f"import exceeds {MAX_IMPORT_BYTES} byte limit")
    ensure_well_formed(raw_bytes)
    payload, import_problem = await run_in_threadpool(_prepare_import, raw_bytes)
    if import_problem is not None:
        logger.warning(
            "Imported CAP alert does not fully follow the CAP 1.2 schema",
            extra={
                "identifier": payload.identifier,
                "origin": origin,
                "schema_error": import_problem,
            },
        )
    if payload.identifier:
        existing = await session.execute(
            select(CapAlert).where(CapAlert.identifier == payload.identifier)
        )
        if existing.scalars().first() is not None:
            raise CapImportError(f"alert {payload.identifier} already exists")
    return await create_alert(
        session=session,
        current_user=current_user,
        payload=payload,
        schema_error=import_problem,
        import_source=origin,
    )


async def create_alert(
    *,
    session: AsyncSession,
    current_user: User,
    payload: CapAlertCreate,
    schema_error: str | None = None,
    import_source: str | None = None,
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
        schema_conformant=schema_error is None,
        schema_error=schema_error,
        import_source=import_source,
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


def _copy_payload(
    public: CapAlertPublic,
    *,
    status: CapStatus,
    msg_type: CapMessageType,
    references: list[CapReferenceCreate],
    note: str | None,
    headline_prefix: str,
) -> CapAlertCreate:
    """A new draft's input copied from ``public`` (timestamps already UTC-aware).

    Internal parameters (the override reason) are left out: a copy is a new
    decision and needs its own.
    """
    return CapAlertCreate(
        sender=public.sender,
        status=status,
        msg_type=msg_type,
        source=public.source,
        scope=public.scope,
        restriction=public.restriction,
        addresses=public.addresses,
        codes=public.codes,
        note=note,
        references=references,
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
                headline=f"{headline_prefix}{info.headline}",
                description=info.description,
                instruction=info.instruction,
                web=info.web,
                contact=info.contact,
                # A copy is a new decision: it needs its own override reason.
                parameters=[
                    item
                    for item in info.parameters
                    if item.value_name not in INTERNAL_PARAMETERS
                ],
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


async def duplicate_alert(
    *, session: AsyncSession, current_user: User, alert_id: uuid.UUID
) -> CapAlertPublic:
    require_permission(current_user=current_user, permission_key="cap.alert.create")
    original = await get_alert_or_404(session=session, alert_id=alert_id)
    if not original.schema_conformant:
        raise CapNonConformingAlertError(
            "This alert was imported and does not fully follow the CAP 1.2 schema, "
            "so it cannot be copied. Author a new alert instead."
        )
    public = await _to_public(session=session, alert=original)
    # Database timestamps are naive UTC; use the public UTC representation when
    # constructing a new input, whose timestamps must carry explicit offsets.
    public = CapAlertPublic.model_validate(public.model_dump(mode="json"))
    return await create_alert(
        session=session,
        current_user=current_user,
        payload=_copy_payload(
            public,
            status=CapStatus.DRAFT,
            msg_type=public.msg_type,
            references=[
                CapReferenceCreate(
                    sender=item.sender, identifier=item.identifier, sent=item.sent
                )
                for item in public.references
            ],
            note=public.note,
            headline_prefix="Copy of ",
        ),
    )


UPDATABLE_TYPES = {CapMessageType.ALERT, CapMessageType.UPDATE}


async def _open_update_of(*, session: AsyncSession, identifier: str) -> CapAlert | None:
    """An Update still being prepared (draft, submitted or approved) for ``identifier``."""
    return (
        (
            await session.execute(
                select(CapAlert)
                .join(CapReference, CapReference.alert_id == CapAlert.id)
                .where(
                    CapReference.identifier == identifier,
                    CapAlert.msg_type == CapMessageType.UPDATE,
                    CapAlert.lifecycle_state.in_(EDITABLE_STATES),
                )
                .order_by(CapAlert.created_at)
            )
        )
        .scalars()
        .first()
    )


async def issue_update(
    *, session: AsyncSession, current_user: User, alert_id: uuid.UUID
) -> tuple[CapAlertPublic, bool]:
    """Start an Update of a published warning: a draft that references it.

    The draft copies the warning's content, keeps its status, sender and scope
    (publishing checks the reference against them) and goes through the usual
    approval. Publishing it supersedes the original. Returns ``(draft, created)``:
    when an Update of this warning is already being prepared, that draft is
    returned instead (``created`` False), so two forecasters do not issue two.
    """
    require_permission(current_user=current_user, permission_key="cap.alert.create")
    # Row lock: two simultaneous requests for the same warning create one draft.
    original = await get_alert_or_404(
        session=session, alert_id=alert_id, for_update=True
    )
    if original.lifecycle_state != CapLifecycleState.PUBLISHED:
        raise CapStateError("Only a published warning can be updated.")
    if original.msg_type not in UPDATABLE_TYPES:
        raise CapStateError("Only an Alert or Update can be updated.")
    if original.import_source:
        raise CapStateError(
            "This alert was imported from another sender. Only its sender can "
            "issue an Update of it."
        )
    if not original.schema_conformant:
        raise CapNonConformingAlertError(
            "This alert does not fully follow the CAP 1.2 schema, so it cannot be "
            "copied into an Update. Author a new alert instead."
        )
    existing = await _open_update_of(session=session, identifier=original.identifier)
    if existing is not None:
        return await _to_public(session=session, alert=existing), False
    public = await _to_public(session=session, alert=original)
    public = CapAlertPublic.model_validate(public.model_dump(mode="json"))
    draft = await create_alert(
        session=session,
        current_user=current_user,
        payload=_copy_payload(
            public,
            status=public.status,
            msg_type=CapMessageType.UPDATE,
            references=[
                CapReferenceCreate(
                    sender=original.sender,
                    identifier=original.identifier,
                    # From the row, not the JSON copy: that drops microseconds,
                    # and publishing compares the reference with the stored value.
                    sent=original.sent.replace(tzinfo=UTC),
                )
            ],
            note=None,
            headline_prefix="",
        ),
    )
    _record_audit(
        session=session,
        alert_id=original.id,
        actor=current_user,
        action="update_started",
        previous_state=original.lifecycle_state.value,
        next_state=original.lifecycle_state.value,
        note=f"Update drafted as {draft.identifier}",
        payload={"update_alert_id": str(draft.id)},
    )
    await session.commit()
    logger.info(
        "CAP update drafted",
        extra={
            "alert_id": str(original.id),
            "update_alert_id": str(draft.id),
            "user_id": str(current_user.id),
        },
    )
    return draft, True


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
    # Owner decision 2026-10-23 (ADR-0023 amendment): the author may approve
    # their own alert; an independent review is optional (record_review) and
    # always audited.
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


async def _has_approval(*, session: AsyncSession, alert: CapAlert) -> bool:
    """True when an approval is on record (the author may have given it)."""
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
    return actor is not None


async def record_review(
    *,
    session: AsyncSession,
    current_user: User,
    alert_id: uuid.UUID,
    payload: CapReviewRecord,
) -> CapAlertPublic:
    """Record an optional review by someone other than the author.

    Asking for one is the existing submit step ("Request review" in the
    portal); a review never changes the alert's state or blocks approval.
    """
    require_permission(current_user=current_user, permission_key="cap.alert.approve")
    alert = await get_alert_or_404(session=session, alert_id=alert_id, for_update=True)
    if alert.created_by_user_id == current_user.id:
        from src.exceptions import AppException

        raise AppException("A review must come from someone other than the author", 403)
    return await _record_review_event(
        session=session,
        current_user=current_user,
        alert=alert,
        action=payload.outcome,
        note=payload.note,
    )


async def _record_review_event(
    *,
    session: AsyncSession,
    current_user: User,
    alert: CapAlert,
    action: str,
    note: str | None,
) -> CapAlertPublic:
    if alert.lifecycle_state not in {
        CapLifecycleState.SUBMITTED,
        CapLifecycleState.APPROVED,
    }:
        raise CapStateError("Only a submitted or approved alert can be reviewed.")
    state = alert.lifecycle_state.value
    _record_audit(
        session=session,
        alert_id=alert.id,
        actor=current_user,
        action=action,
        previous_state=state,
        next_state=state,
        note=note,
    )
    await session.commit()
    await session.refresh(alert)
    logger.info(
        "CAP alert review event",
        extra={
            "alert_id": str(alert.id),
            "action": action,
            "user_id": str(current_user.id),
        },
    )
    return await _to_public(session=session, alert=alert)


async def publish_alert(
    *,
    session: AsyncSession,
    current_user: User,
    alert_id: uuid.UUID,
    payload: CapPublishAction,
) -> tuple[CapAlertPublic, CapSnapshotPublic]:
    """Normal publish: only an Approved alert (the author may have approved it).

    Strict on the schema: a non-conforming document is refused with 422.
    """
    require_permission(current_user=current_user, permission_key="cap.alert.publish")
    alert = await get_alert_or_404(session=session, alert_id=alert_id, for_update=True)
    if alert.lifecycle_state != CapLifecycleState.APPROVED:
        raise CapStateError(
            "Only an approved alert can be published. Submit it for approval, "
            "or use emergency publish if you hold that permission."
        )
    if not await _has_approval(session=session, alert=alert):
        raise CapStateError("This alert has no recorded approval.")
    _require_imported_confirmation(alert, payload.confirm_imported)
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
    """Duty-supervisor publish without approval; reason mandatory, always audited.

    A schema mismatch never blocks it: the warning goes out, and the mismatch is
    audited and sent to the duty supervisor. This is an audited path, not an approval
    bypass: approval rules are unchanged.
    """
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
    _require_imported_confirmation(alert, payload.confirm_imported)
    return await _publish(
        session=session,
        current_user=current_user,
        alert=alert,
        note=reason,
        emergency_reason=reason,
    )


def _require_imported_confirmation(alert: CapAlert, confirmed: bool) -> None:
    """An imported alert is published only after its author has checked it (409 without)."""
    if alert.import_source and not confirmed:
        raise CapStateError(
            "This alert was imported. Check it against the source, then publish with "
            "confirm_imported set to true."
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
    # CAP "sent" is the time the message went out, not when it was drafted. Set it
    # here, on publish, so the XML, the snapshot and the feeds all carry it.
    alert.sent = utc_now().replace(microsecond=0)
    session.add(alert)
    await session.flush()
    public = await _to_public(session=session, alert=alert)
    emergency = emergency_reason is not None
    xml, mismatch = await gate_cap_xml(
        alert_to_cap_xml(public),
        action="emergency_publish" if emergency else "publish",
        identifier=alert.identifier,
        alert_id=alert.id,
        allow_mismatch=emergency,
    )
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
    await notify_warning_changed(session=session, alert=alert, actor=current_user)
    audit_payload: dict[str, object] = {"snapshot_id": str(snapshot.id)}
    if emergency:
        audit_payload["emergency"] = True
        audit_payload["reason"] = emergency_reason
    if mismatch is not None:
        audit_payload["schema_mismatch"] = mismatch
        await _notify_mismatch_safely(
            session=session,
            alert=alert,
            problem=mismatch,
            action="published",
        )
    _record_audit(
        session=session,
        alert_id=alert.id,
        actor=current_user,
        action="emergency_publish" if emergency else "publish",
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
    snapshot_public = CapSnapshotPublic.model_validate(
        snapshot, from_attributes=True
    ).model_copy(update={"schema_mismatch": mismatch})
    return await _to_public(session=session, alert=alert), snapshot_public


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
    # A cancellation is never blocked by a schema mismatch: a false warning must be
    # cancellable. A mismatch is audited and sent to the duty supervisor instead.
    cancel_xml, cancel_mismatch = await gate_cap_xml(
        alert_to_cap_xml(public_cancel),
        action="cancel",
        identifier=cancellation.identifier,
        alert_id=cancellation.id,
        allow_mismatch=True,
    )
    snapshot = _snapshot_from_xml(alert=cancellation, xml=cancel_xml)
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
            **({"schema_mismatch": cancel_mismatch} if cancel_mismatch else {}),
        },
    )
    await notify_warning_changed(
        session=session, alert=cancellation, actor=current_user, about=alert
    )
    if cancel_mismatch is not None:
        await _notify_mismatch_safely(
            session=session,
            alert=cancellation,
            problem=cancel_mismatch,
            action="cancelled",
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
    if action == "submit":
        await notify_review_requested(session=session, alert=alert, actor=current_user)
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
    validate_feed_url(payload.url)
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
    if payload.url is not None:
        validate_feed_url(payload.url)
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
    http_client: httpx.AsyncClient | None,
) -> dict[str, int]:
    """Fetch a feed, then import each entry (dedupe by identifier).

    The feed and every entry go through the same SSRF guard and size cap. A bad entry
    is skipped and the loop carries on, so one poison entry cannot stop the feed. The
    feed's etag and progress are saved at the end.
    """
    now = utc_now()
    try:
        validate_import_url(feed.url)
        headers = {"If-None-Match": feed.last_etag} if feed.last_etag else None
        status, response_headers, body = await _fetch_document(
            feed.url,
            http_client=http_client,
            headers=headers,
            allow_http=feed.url.startswith("http://"),
        )
    except CapImportError as exc:
        # The detail names the host and the resolver; keep it in the log only.
        logger.warning(
            "CAP feed refused or unreachable",
            extra={"feed_id": str(feed.id), "detail": str(exc)},
        )
        feed.last_checked_at = now
        feed.last_error = (
            FEED_ERROR_HOST_REFUSED
            if isinstance(exc, CapHostRefusedError)
            else FEED_ERROR_FETCH
        )
        session.add(feed)
        await session.commit()
        return {"created": 0, "skipped": 0}
    if status == 304:
        feed.last_checked_at = now
        session.add(feed)
        await session.commit()
        return {"created": 0, "skipped": 0}

    parsed = await run_in_threadpool(feedparser.parse, body)
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
                origin="feed",
            )
            created += 1
        except CapImportError:  # malformed, a DTD, or a duplicate: skip, keep going
            skipped += 1

    feed.last_checked_at = utc_now()
    feed.last_error = None
    feed.last_etag = response_headers.get("etag") or feed.last_etag
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
    client = http_client or httpx.AsyncClient(trust_env=False)
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
                feed.last_error = FEED_ERROR_INGEST
                feed.last_checked_at = utc_now()
                session.add(feed)
                await session.commit()
                logger.warning(
                    "CAP feed ingest failed",
                    extra={"feed_id": str(feed.id), "detail": repr(exc)},
                )
    finally:
        if owns_client:
            await client.aclose()
    return len(feeds)
