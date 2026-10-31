"""Settings, catalogues, predefined areas, audit events and integrations."""

import uuid

import sqlalchemy as sa
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.models import User
from src.auth.policy import require_any_permission, require_permission
from src.cap import catalogue
from src.cap.common import _record_audit
from src.cap.mapping import _predefined_area_to_public
from src.cap.models import (
    CapAuditEvent,
    CapCategory,
    CapCertainty,
    CapJobEvent,
    CapMessageType,
    CapMqttBroker,
    CapPredefinedArea,
    CapResponseType,
    CapScope,
    CapSettings,
    CapSeverity,
    CapStatus,
    CapUrgency,
    CapWebhook,
)
from src.cap.schemas import (
    CapAuditEventPublic,
    CapCatalogsPublic,
    CapCategoryLabelPublic,
    CapColourRulePublic,
    CapHazardGroupPublic,
    CapParishPublic,
    CapPredefinedAreaCreate,
    CapPredefinedAreaPublic,
    CapProductRulePublic,
    CapSettingsPublic,
    CapSettingsUpdate,
    GmsCataloguePublic,
)
from src.cap.tasks import NOT_CONFIGURED_CHANNELS
from src.utils.datetime import utc_now


async def get_or_create_settings(*, session: AsyncSession) -> CapSettings:
    result = await session.execute(select(CapSettings).order_by(CapSettings.created_at))
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


def get_catalogs(*, current_user: User) -> CapCatalogsPublic:
    require_permission(current_user=current_user, permission_key="cap.alert.read")
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


def get_gms_catalogue(*, current_user: User) -> GmsCataloguePublic:
    # Reference data, not sensitive: anyone who can open the CAP desk or the
    # wxproducts desk (app.weather.access) reads the hazard list and colour rules.
    require_any_permission(
        current_user=current_user,
        permission_keys=("cap.alert.read", "app.weather.access"),
    )
    return GmsCataloguePublic(
        hazard_groups=[
            CapHazardGroupPublic(
                label=group.label,
                categories=list(group.categories),
                events=list(group.events),
            )
            for group in catalogue.HAZARD_GROUPS
        ],
        category_labels=[
            CapCategoryLabelPublic(key=category, label=label)
            for category, label in catalogue.CATEGORY_LABELS.items()
        ],
        parishes=[
            CapParishPublic(
                id=parish.id,
                iso_code=parish.iso_code,
                name=parish.name,
                short_name=parish.short_name,
            )
            for parish in catalogue.PARISHES
        ],
        products=[
            CapProductRulePublic(key=product.value, label=label, needs_colour=needs)
            for product, label, needs in catalogue.product_rules()
        ],
        colours=[
            CapColourRulePublic(
                key=colour.value, label=label, awareness_code=code, severity=severity
            )
            for colour, label, code, severity in catalogue.colour_rules()
        ],
        geocode_name=catalogue.GEOCODE_NAME,
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
    *,
    session: AsyncSession,
    current_user: User,
    alert_id: uuid.UUID | None = None,
    skip: int = 0,
    limit: int = 100,
) -> tuple[list[CapAuditEventPublic], int]:
    require_permission(current_user=current_user, permission_key="cap.alert.read")
    base = select(CapAuditEvent)
    if alert_id is not None:
        base = base.where(CapAuditEvent.alert_id == alert_id)
    total = await session.scalar(select(sa.func.count()).select_from(base.subquery()))
    result = await session.execute(
        base.order_by(CapAuditEvent.created_at.desc()).offset(skip).limit(limit)
    )
    events = [
        CapAuditEventPublic.model_validate(event, from_attributes=True)
        for event in result.scalars()
    ]
    return events, total or 0


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
            select(CapJobEvent).order_by(CapJobEvent.created_at.desc()).limit(100)
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
                # No MQTT publisher exists yet, so no broker delivers anything.
                "delivery": "not_configured",
            }
            for item in mqtt_brokers
        ],
        "publish_channels": [dict(channel) for channel in NOT_CONFIGURED_CHANNELS],
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
