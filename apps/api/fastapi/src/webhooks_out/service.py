"""Webhook endpoint management, event fan-out and auto-disable (ADR-0029, PF6).

Functions flush but never commit; the caller owns the transaction. ``emit_event``
is the one call other domains make.
"""

import hashlib
import html
import logging
import secrets
from typing import Any

from sqlalchemy import func, or_, select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from src import outbox
from src.audit import service as audit_service
from src.auth.models import User
from src.notifications import outbox_handlers
from src.organisations import service as organisations_service
from src.organisations.config import organisations_settings
from src.organisations.models import Membership, MembershipRole, MembershipStatus
from src.utils import secret_box
from src.utils.datetime import utc_now

from . import events, ssrf
from .exceptions import (
    WebhookEndpointLimitError,
    WebhookEndpointNotFoundError,
    WebhookEventTypeInvalidError,
    WebhookSecretStorageUnavailableError,
    WebhookUrlRejectedError,
)
from .models import (
    DeliveryStatus,
    EndpointStatus,
    WebhookDelivery,
    WebhookEndpoint,
    new_delivery_id,
    new_endpoint_id,
    new_event_id,
)
from .schemas import WebhookEndpointCreate, WebhookEndpointUpdate

logger = logging.getLogger(__name__)

DELIVER_TOPIC = "webhook.deliver"
PRODUCT = "webhooks"
MAX_ENDPOINTS_PER_ORGANISATION = 20
#: Failed attempts in a row, across deliveries, before an endpoint is disabled.
AUTO_DISABLE_AFTER = 15
SECRET_PREFIX = "whsec_"


# --- secrets -------------------------------------------------------------------------------


def new_signing_secret() -> str:
    return f"{SECRET_PREFIX}{secrets.token_urlsafe(32)}"


def _encrypt(secret: str) -> str:
    keys = organisations_settings.ORG_SECRET_ENCRYPTION_KEYS
    if not keys:
        raise WebhookSecretStorageUnavailableError()
    return secret_box.encrypt(secret, keys)


def decrypt_secret(endpoint: WebhookEndpoint) -> str:
    """Raises ``secret_box.SecretBoxError`` when the keys no longer fit."""
    return secret_box.decrypt(
        endpoint.secret_encrypted, organisations_settings.ORG_SECRET_ENCRYPTION_KEYS
    )


# --- validation ----------------------------------------------------------------------------


async def _check_url(url: str) -> str:
    try:
        parts, _ = await ssrf.check_url(url)
    except ssrf.UnsafeTargetError as exc:
        raise WebhookUrlRejectedError(str(exc)) from None
    return parts.geturl()


def _check_event_types(event_types: list[str]) -> list[str]:
    try:
        return events.validate_subscription(event_types)
    except ValueError as exc:
        raise WebhookEventTypeInvalidError(str(exc)) from None


# --- endpoints -----------------------------------------------------------------------------


async def get_endpoint(
    session: AsyncSession, *, organisation_id: str | None, endpoint_id: str
) -> WebhookEndpoint:
    """``organisation_id=None`` is for superuser routes only."""
    statement = select(WebhookEndpoint).where(WebhookEndpoint.id == endpoint_id)
    if organisation_id is not None:
        statement = statement.where(WebhookEndpoint.organisation_id == organisation_id)
    endpoint = await session.scalar(statement)
    if endpoint is None:
        raise WebhookEndpointNotFoundError()
    return endpoint


async def create_endpoint(
    session: AsyncSession,
    actor: User,
    *,
    organisation_id: str,
    payload: WebhookEndpointCreate,
) -> tuple[WebhookEndpoint, str]:
    """Returns the endpoint and its signing secret (shown to the caller once)."""
    audit_service.set_actor(session, actor.id)
    url = await _check_url(payload.url)
    event_types = _check_event_types(payload.event_types)
    existing = await session.scalar(
        select(func.count())
        .select_from(WebhookEndpoint)
        .where(WebhookEndpoint.organisation_id == organisation_id)
    )
    if (existing or 0) >= MAX_ENDPOINTS_PER_ORGANISATION:
        raise WebhookEndpointLimitError(MAX_ENDPOINTS_PER_ORGANISATION)
    secret = new_signing_secret()
    endpoint = WebhookEndpoint(
        id=new_endpoint_id(),
        organisation_id=organisation_id,
        url=url,
        description=payload.description,
        event_types=event_types,
        secret_encrypted=_encrypt(secret),
        status=EndpointStatus.ACTIVE.value,
        consecutive_failures=0,
    )
    session.add(endpoint)
    await session.flush()
    return endpoint, secret


async def list_endpoints(
    session: AsyncSession,
    *,
    organisation_id: str | None,
    skip: int,
    limit: int,
) -> tuple[list[WebhookEndpoint], int]:
    statement = select(WebhookEndpoint)
    if organisation_id is not None:
        statement = statement.where(WebhookEndpoint.organisation_id == organisation_id)
    total = await session.scalar(select(func.count()).select_from(statement.subquery()))
    rows = await session.scalars(
        statement.order_by(WebhookEndpoint.created_at.desc(), WebhookEndpoint.id)
        .offset(skip)
        .limit(limit)
    )
    return list(rows), total or 0


async def update_endpoint(
    session: AsyncSession,
    actor: User,
    *,
    organisation_id: str,
    endpoint_id: str,
    payload: WebhookEndpointUpdate,
) -> WebhookEndpoint:
    audit_service.set_actor(session, actor.id)
    endpoint = await get_endpoint(
        session, organisation_id=organisation_id, endpoint_id=endpoint_id
    )
    fields = payload.model_fields_set
    if "url" in fields and payload.url is not None:
        endpoint.url = await _check_url(payload.url)
    if "description" in fields:
        endpoint.description = payload.description
    if "event_types" in fields and payload.event_types is not None:
        endpoint.event_types = _check_event_types(payload.event_types)
    if "status" in fields and payload.status is not None:
        if payload.status is EndpointStatus.ACTIVE:
            if endpoint.status != EndpointStatus.ACTIVE.value:
                await _check_url(endpoint.url)
            endpoint.status = EndpointStatus.ACTIVE.value
            endpoint.consecutive_failures = 0
            endpoint.disabled_reason = None
        else:
            endpoint.status = EndpointStatus.DISABLED.value
            endpoint.disabled_reason = "Disabled by an organisation admin"
    await session.flush()
    return endpoint


async def rotate_secret(
    session: AsyncSession, actor: User, *, organisation_id: str, endpoint_id: str
) -> tuple[WebhookEndpoint, str]:
    """The old secret stops working immediately; receivers must switch at once."""
    audit_service.set_actor(session, actor.id)
    endpoint = await get_endpoint(
        session, organisation_id=organisation_id, endpoint_id=endpoint_id
    )
    secret = new_signing_secret()
    endpoint.secret_encrypted = _encrypt(secret)
    await session.flush()
    return endpoint, secret


async def delete_endpoint(
    session: AsyncSession, actor: User, *, organisation_id: str, endpoint_id: str
) -> None:
    audit_service.set_actor(session, actor.id)
    endpoint = await get_endpoint(
        session, organisation_id=organisation_id, endpoint_id=endpoint_id
    )
    await session.delete(endpoint)
    await session.flush()


async def list_deliveries(
    session: AsyncSession,
    *,
    organisation_id: str,
    endpoint_id: str,
    skip: int,
    limit: int,
) -> tuple[list[WebhookDelivery], int]:
    await get_endpoint(
        session, organisation_id=organisation_id, endpoint_id=endpoint_id
    )
    statement = select(WebhookDelivery).where(
        WebhookDelivery.endpoint_id == endpoint_id
    )
    total = await session.scalar(select(func.count()).select_from(statement.subquery()))
    rows = await session.scalars(
        statement.order_by(WebhookDelivery.created_at.desc(), WebhookDelivery.id)
        .offset(skip)
        .limit(limit)
    )
    return list(rows), total or 0


# --- disable and notify --------------------------------------------------------------------


async def _admin_emails(session: AsyncSession, organisation_id: str) -> list[str]:
    rows = await session.scalars(
        select(User.email)
        .join(Membership, Membership.user_id == User.id)
        .where(
            Membership.organisation_id == organisation_id,
            Membership.status == MembershipStatus.ACTIVE.value,
            Membership.role.in_(
                (MembershipRole.OWNER.value, MembershipRole.ADMIN.value)
            ),
            User.is_active.is_(True),
        )
    )
    return sorted(set(rows))


async def disable_endpoint(
    session: AsyncSession,
    endpoint: WebhookEndpoint,
    *,
    reason: str,
    notify_admins: bool = True,
) -> None:
    """Stop deliveries and, by default, email the organisation's owners and admins.
    Adds rows to the caller's transaction."""
    if endpoint.status == EndpointStatus.DISABLED.value:
        return
    endpoint.status = EndpointStatus.DISABLED.value
    endpoint.disabled_reason = reason[:200]
    await session.flush()
    logger.warning(
        "Webhook endpoint disabled",
        extra={"endpoint_id": endpoint.id, "organisation_id": endpoint.organisation_id},
    )
    if not notify_admins:
        return
    host = html.escape(endpoint.url.split("/")[2] if "//" in endpoint.url else "")
    body = (
        "<p>A webhook endpoint was disabled and is no longer receiving events.</p>"
        f"<p>Endpoint: {html.escape(endpoint.id)} ({host})<br>"
        f"Reason: {html.escape(reason)}</p>"
        "<p>Fix the receiver, then re-enable the endpoint in your organisation "
        "settings. Events sent while it was disabled are not replayed.</p>"
    )
    stamp = int(utc_now().timestamp())
    for email in await _admin_emails(session, endpoint.organisation_id):
        await outbox_handlers.enqueue_email(
            session,
            to_email=email,
            subject="A webhook endpoint was disabled",
            dedupe_key=f"webhook-disabled:{endpoint.id}:{stamp}:{email}",
            transactional=True,
            html=body,
            organisation_id=endpoint.organisation_id,
        )


# --- fan-out -------------------------------------------------------------------------------


EVENT_ID_MAX = 60  # webhooks.delivery.event_id


def stable_event_id(event_id: str) -> str:
    """A producer's id as stored: unchanged when it fits, otherwise a stable hash
    of it, so a repeat of the same event still dedupes."""
    if len(event_id) <= EVENT_ID_MAX:
        return event_id
    return "evt_" + hashlib.sha256(event_id.encode()).hexdigest()[:32]


async def emit_event(
    session: AsyncSession,
    organisation_id: str,
    event_type: str,
    data: dict[str, Any],
    *,
    event_id: str | None = None,
) -> int:
    """Queue one ``webhook.deliver`` outbox row per active endpoint subscribed to
    ``event_type`` in the caller's transaction (no commit). Returns the number of
    deliveries queued. Raises ``ValueError`` for an event type outside the
    catalogue or data that does not match its schema: that is a programming error.

    Pass a stable ``event_id`` (for example derived from the booking and its
    state) when the same event may be emitted twice; a repeat then queues nothing.
    """
    if not events.is_known(event_type):
        raise ValueError(f"Unknown webhook event type: {event_type}")
    body = events.validated_data(event_type, data)
    if not await organisations_service.is_app_enabled(
        session, organisation_id=organisation_id, app_key=PRODUCT
    ):
        return 0
    endpoints = list(
        await session.scalars(
            select(WebhookEndpoint)
            .where(
                WebhookEndpoint.organisation_id == organisation_id,
                WebhookEndpoint.status == EndpointStatus.ACTIVE.value,
                or_(
                    WebhookEndpoint.event_types.contains([event_type]),
                    WebhookEndpoint.event_types.contains([events.WILDCARD]),
                ),
            )
            .order_by(WebhookEndpoint.id)
        )
    )
    if not endpoints:
        return 0
    resolved_id = stable_event_id(event_id) if event_id else new_event_id()
    created_at = utc_now()
    queued = 0
    for endpoint in endpoints:
        delivery_id = new_delivery_id()
        added = await outbox.enqueue(
            session,
            topic=DELIVER_TOPIC,
            dedupe_key=f"{resolved_id}:{endpoint.id}",
            organisation_id=organisation_id,
            payload={
                "delivery_id": delivery_id,
                "endpoint_id": endpoint.id,
                "event_id": resolved_id,
                "event_type": event_type,
                "created_at": created_at.isoformat(timespec="seconds") + "Z",
                "data": body,
            },
        )
        if not added:
            continue
        session.add(
            WebhookDelivery(
                id=delivery_id,
                endpoint_id=endpoint.id,
                event_id=resolved_id,
                event_type=event_type,
                attempts=0,
                status=DeliveryStatus.PENDING.value,
                next_attempt_at=created_at,
            )
        )
        queued += 1
    await session.flush()
    return queued


async def emit_event_safely(
    session: AsyncSession,
    organisation_id: str,
    event_type: str,
    data: dict[str, Any],
    *,
    event_id: str | None = None,
) -> int:
    """``emit_event`` for producers: a webhook problem must never undo or fail the
    action that caused the event. Runs in a savepoint; any error is logged (type
    only, never the payload) and the delivery is skipped."""
    try:
        async with session.begin_nested():
            return await emit_event(
                session, organisation_id, event_type, data, event_id=event_id
            )
    except SQLAlchemyError, ValueError:
        logger.exception(
            "Webhook event not queued",
            extra={"organisation_id": organisation_id, "event_type": event_type},
        )
        return 0
