"""Raise a saved GMS alert to a pre-filled CAP warning draft (ADR-0051).

GMS alerts are green only; yellow, orange and red are CAP warnings. A
forecaster presses "Raise to warning" and this module turns one saved alert
revision into a CAP draft that links back to it through the three
``GMS:source-bulletin-*`` parameters (see ``validation.py``).

Import rule: this module imports ``wxproducts.service`` only, never
``wxproducts.advisories``, because ``advisories`` imports ``cap.service``.

The wording below (event names, certainty from likelihood, severity from the
colour) is a first draft. GMS owns warning wording policy and must sign it off.
The green alert is not changed: it stays in force until a forecaster withdraws it.
"""

import uuid
from datetime import UTC, datetime

from sqlalchemy import String, cast, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.models import User
from src.auth.policy import require_permission
from src.baseline import product_access
from src.cap import service
from src.cap.levels import GmsColour, GmsProduct, level_parameters, severity_for
from src.cap.models import (
    CapAlert,
    CapCategory,
    CapCertainty,
    CapInfo,
    CapLifecycleState,
    CapUrgency,
)
from src.cap.schemas import (
    CapAlertCreate,
    CapEscalationCreate,
    CapEscalationLookup,
    CapEscalationPublic,
    CapEscalationSource,
    CapInfoCreate,
    CapNameValue,
)
from src.exceptions import AppValidationError, AuthorizationError
from src.wxproducts import service as wxproducts_service
from src.wxproducts.schemas import ProductPdfSource, values_as_dict
from src.wxproducts.validation import local_time

SOURCE_KIND = "GMS:source-bulletin-kind"
SOURCE_ID = "GMS:source-bulletin-id"
SOURCE_REVISION = "GMS:source-bulletin-revision"

# Hazard alert kinds only; forecasts and the outlook are never raised.
EVENTS = {
    "cyclone": "Tropical cyclone",
    "marine": "Marine hazard",
    "flood": "Flood",
    "thunderstorm": "Thunderstorm",
    "wind": "Wind",
    "heat": "Heat",
    "dust": "Dust haze",
    "coastal": "Coastal hazard",
    "tsunami": "Tsunami",
}
CATEGORY_OVERRIDES = {"tsunami": CapCategory.GEO}
# Reverse of the forecast import mapping; "Observed" is never inferred.
CERTAINTY_FROM_LIKELIHOOD = {
    "High": CapCertainty.LIKELY,
    "Medium": CapCertainty.LIKELY,
    "Low": CapCertainty.POSSIBLE,
    "Very low": CapCertainty.UNLIKELY,
}
SENDER_NAME = "Grenada Meteorological Service"
OPEN_STATES = (
    CapLifecycleState.DRAFT,
    CapLifecycleState.SUBMITTED,
    CapLifecycleState.APPROVED,
)


def _clip(text: str, limit: int) -> str:
    text = text.strip()
    return text if len(text) <= limit else f"{text[: limit - 1]}…"


def _utc(value: str) -> datetime | None:
    try:
        return local_time(value).astimezone(UTC)
    except ValueError:
        return None


def draft_from_revision(
    source: ProductPdfSource, colour: GmsColour, *, kind: str
) -> CapAlertCreate:
    """Pure: a CAP draft pre-filled from one saved GMS alert revision."""
    values = values_as_dict(source.values)
    event = EVENTS[kind]
    onset = _utc(values.get("validFrom", ""))
    expires = _utc(values.get("validTo", ""))
    if onset and expires and expires <= onset:
        expires = None
    synopsis = values.get("synopsis", "").strip()
    impacts = values.get("impacts", "").strip()
    description = "\n\n".join(
        part
        for part in (synopsis, f"Expected impacts: {impacts}" if impacts else "")
        if part
    )
    info = CapInfoCreate(
        categories=[CATEGORY_OVERRIDES.get(kind, CapCategory.MET)],
        event=event,
        urgency=CapUrgency.EXPECTED,
        severity=severity_for(colour),
        certainty=CERTAINTY_FROM_LIKELIHOOD.get(
            values.get("likelihood", ""), CapCertainty.LIKELY
        ),
        onset=onset,
        expires=expires,
        sender_name=SENDER_NAME,
        headline=_clip(f"{colour.value.capitalize()} warning: {event}", 255),
        description=_clip(description or f"{event} warning", 4000),
        instruction=_clip(values.get("response", ""), 4000) or None,
        parameters=[
            *level_parameters(GmsProduct.WARNING, colour),
            CapNameValue(value_name=SOURCE_KIND, value=kind),
            CapNameValue(value_name=SOURCE_ID, value=str(source.product_id)),
            CapNameValue(value_name=SOURCE_REVISION, value=str(source.revision)),
        ],
    )
    return CapAlertCreate(
        source=_clip(f"GMS {event} alert, revision {source.revision}", 255),
        info=[info],
    )


async def find_linked_alert(
    session: AsyncSession,
    product_id: uuid.UUID,
    states: tuple[CapLifecycleState, ...] = OPEN_STATES,
) -> tuple[uuid.UUID, CapLifecycleState] | None:
    """The newest CAP alert in ``states`` linked to this product."""
    rows = await session.execute(
        select(CapAlert.id, CapAlert.lifecycle_state, CapInfo.parameters)
        .join(CapInfo, CapInfo.alert_id == CapAlert.id)
        .where(
            CapAlert.lifecycle_state.in_(states),
            cast(CapInfo.parameters, String).contains(str(product_id)),
        )
        .order_by(CapAlert.created_at.desc())
    )
    for alert_id, state, parameters in rows:
        if any(
            item.get("value_name") == SOURCE_ID and item.get("value") == str(product_id)
            for item in parameters or []
        ):
            return uuid.UUID(str(alert_id)), state
    return None


async def find_open_alert(
    session: AsyncSession, product_id: uuid.UUID
) -> uuid.UUID | None:
    """The newest Draft, Submitted or Approved alert linked to this product."""
    found = await find_linked_alert(session, product_id)
    return found[0] if found else None


async def lookup(
    session: AsyncSession, current_user: User, product_id: uuid.UUID
) -> CapEscalationLookup:
    """Which warning (if any) was raised from this GMS alert; for the desk note."""
    require_permission(current_user=current_user, permission_key="cap.alert.read")
    found = await find_linked_alert(
        session, product_id, (*OPEN_STATES, CapLifecycleState.PUBLISHED)
    )
    if found is None:
        return CapEscalationLookup(alert_id=None, lifecycle_state=None)
    return CapEscalationLookup(alert_id=found[0], lifecycle_state=found[1])


async def escalate(
    *,
    cap_session: AsyncSession,
    weather_session: AsyncSession,
    current_user: User,
    body: CapEscalationCreate,
) -> CapEscalationPublic:
    """Create (or return) the CAP draft for a saved GMS alert revision."""
    require_permission(current_user=current_user, permission_key="cap.alert.create")
    allowed = await product_access.allowed_kinds(cap_session, current_user)
    source = await wxproducts_service.pdf_source(
        weather_session, body.product_id, body.revision, None
    )
    kind = source.kind
    if kind not in EVENTS:
        raise AppValidationError("Only hazard alerts can be raised to a warning")
    if kind not in allowed:
        raise AuthorizationError(
            "Your account is not authorized to author this kind of GMS product."
        )
    public_source = CapEscalationSource(
        product_id=body.product_id, revision=body.revision, kind=kind
    )
    existing = await find_open_alert(cap_session, body.product_id)
    if existing is not None:
        return CapEscalationPublic(
            alert_id=existing, created=False, source=public_source
        )
    created = await service.create_alert(
        session=cap_session,
        current_user=current_user,
        payload=draft_from_revision(source, GmsColour(body.awareness_level), kind=kind),
    )
    return CapEscalationPublic(alert_id=created.id, created=True, source=public_source)
