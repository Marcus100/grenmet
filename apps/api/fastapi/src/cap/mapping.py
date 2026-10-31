"""Conversions from CAP database rows to public schemas."""

from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from src.cap.exceptions import (
    CapAlertNotFoundError,
)
from src.cap.levels import INTERNAL_PARAMETERS
from src.cap.models import (
    CapAlert,
    CapArea,
    CapCategory,
    CapInfo,
    CapPredefinedArea,
)
from src.cap.schemas import (
    CapAlertPublic,
    CapAreaPublic,
    CapInfoPublic,
    CapNameValue,
    CapPredefinedAreaPublic,
    CapReferencePublic,
    CapResourcePublic,
)


def _as_categories(values: list[str]) -> list[CapCategory]:
    """Coerce JSON-stored category strings into the typed CapCategory enum."""
    return [CapCategory(value) for value in values]


def _as_name_values(values: list[dict[str, str]]) -> list[CapNameValue]:
    """Coerce JSON-stored name/value dicts into typed CapNameValue models."""
    return [CapNameValue.model_validate(value) for value in values]


def _info_to_public_from_loaded(
    info: CapInfo, *, redact_internal: bool = False
) -> CapInfoPublic:
    """Build CapInfoPublic from an already-loaded CapInfo (no queries fired).

    ``redact_internal`` drops staff-only parameters; every anonymous path sets it.
    """
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
        parameters=[
            item
            for item in _as_name_values(info.parameters or [])
            if not (redact_internal and item.value_name in INTERNAL_PARAMETERS)
        ],
        resources=[
            CapResourcePublic.model_validate(r, from_attributes=True)
            for r in resource_rows
        ],
        areas=[_area_to_public(area) for area in area_rows],
    )


def _to_public_from_loaded(
    alert: CapAlert, *, redact_internal: bool = False
) -> CapAlertPublic:
    """Build CapAlertPublic from relationships already loaded via selectinload."""
    info_rows = sorted(alert.info_blocks or [], key=lambda x: x.sequence)
    reference_rows = sorted(alert.cap_references or [], key=lambda x: x.sequence)
    incident_rows = sorted(alert.incidents or [], key=lambda x: x.sequence)
    return CapAlertPublic(
        id=alert.id,
        identifier=alert.identifier,
        sender=alert.sender,
        schema_conformant=alert.schema_conformant,
        schema_error=alert.schema_error,
        import_source=alert.import_source,
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
        info=[
            _info_to_public_from_loaded(i, redact_internal=redact_internal)
            for i in info_rows
        ],
        xml_url=f"/api/cap/{alert.identifier}.xml",
    )


def _alert_selectinload_options() -> list[Any]:
    """Standard selectinload options for eager-loading all alert children."""
    return [
        selectinload(CapAlert.info_blocks).selectinload(CapInfo.resources),
        selectinload(CapAlert.info_blocks).selectinload(CapInfo.areas),
        selectinload(CapAlert.cap_references),
        selectinload(CapAlert.incidents),
    ]


async def _to_public(
    *, session: AsyncSession, alert: CapAlert, redact_internal: bool = False
) -> CapAlertPublic:
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
    return _to_public_from_loaded(loaded, redact_internal=redact_internal)


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
