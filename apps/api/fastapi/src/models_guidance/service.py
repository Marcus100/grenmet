"""Storage, reads and access requests for model guidance.

Service functions ``flush`` and never ``commit``; the caller owns the
transaction.
"""

import logging
import uuid
from datetime import datetime, timedelta

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.organisations import service as org_service
from src.organisations.models import PlatformOrganisation
from src.utils.datetime import utc_now

from . import extract
from .config import GuidancePoint, guidance_settings
from .constants import (
    ATTRIBUTION,
    GUIDANCE_APP_KEY,
    GUIDANCE_DISCLAIMER,
    MODEL_LABELS,
    VARIABLES,
)
from .exceptions import (
    AccessRequestDecidedError,
    AccessRequestNotFoundError,
    AccessRequestPendingError,
    AlreadyEntitledError,
    NoGuidanceYetError,
    UnknownModelError,
    UnknownPointError,
)
from .models import (
    AccessRequestStatus,
    GuidanceAccessRequest,
    ModelGuidanceRun,
    ModelGuidanceSeries,
)
from .schemas import (
    AccessRequestPublic,
    AccessStatusPublic,
    GuidanceCatalogue,
    GuidanceDecision,
    GuidanceModel,
    GuidanceModelPublic,
    GuidanceOrganisationPublic,
    GuidancePointPublic,
    MeteogramPublic,
    MeteogramSeries,
    MeteogramUnits,
)

logger = logging.getLogger(__name__)


# --- Ingest -----------------------------------------------------------------


async def run_exists(session: AsyncSession, model: str, run_time: datetime) -> bool:
    found = await session.scalar(
        select(ModelGuidanceRun.id).where(
            ModelGuidanceRun.model == model, ModelGuidanceRun.run_time == run_time
        )
    )
    return found is not None


async def store_run(
    session: AsyncSession,
    *,
    model: str,
    run_time: datetime,
    readings: extract.Readings,
    points: list[GuidancePoint],
) -> ModelGuidanceRun | None:
    """Store one run's point series; ``None`` when it is already stored or empty."""
    if await run_exists(session, model, run_time):
        return None
    series = extract.build_series(readings, points)
    if not any(s["valid_times"] for s in series.values()):
        return None
    run = ModelGuidanceRun(model=model, run_time=run_time)
    session.add(run)
    await session.flush()
    for point in points:
        session.add(
            ModelGuidanceSeries(
                run_id=run.id,
                point_key=point.key,
                latitude=point.latitude,
                longitude=point.longitude,
                series=series[point.key],
            )
        )
    await session.flush()
    return run


async def prune(session: AsyncSession, *, retention_days: int) -> int:
    """Delete runs whose cycle is older than the retention window."""
    cutoff = utc_now() - timedelta(days=retention_days)
    result = await session.execute(
        delete(ModelGuidanceRun).where(ModelGuidanceRun.run_time < cutoff)
    )
    return int(getattr(result, "rowcount", 0) or 0)


# --- Reads ------------------------------------------------------------------


def configured_points() -> list[GuidancePoint]:
    return list(guidance_settings.POINTS)


def _point_public(point: GuidancePoint) -> GuidancePointPublic:
    return GuidancePointPublic(
        key=point.key,
        name=point.name,
        latitude=point.latitude,
        longitude=point.longitude,
    )


async def get_catalogue(session: AsyncSession) -> GuidanceCatalogue:
    rows = (
        await session.execute(
            select(ModelGuidanceRun.model, ModelGuidanceRun.run_time)
            .distinct(ModelGuidanceRun.model)
            .order_by(ModelGuidanceRun.model, ModelGuidanceRun.run_time.desc())
        )
    ).all()
    latest = {row.model: row.run_time for row in rows}
    return GuidanceCatalogue(
        enabled=guidance_settings.ENABLED,
        points=[_point_public(p) for p in configured_points()],
        models=[
            GuidanceModelPublic(
                key=GuidanceModel(key),
                label=MODEL_LABELS[key],
                latest_run_time=latest.get(key),
            )
            for key in MODEL_LABELS
        ],
        disclaimer=GUIDANCE_DISCLAIMER,
    )


async def get_meteogram(
    session: AsyncSession, *, point_key: str, model: GuidanceModel
) -> MeteogramPublic:
    point = next((p for p in configured_points() if p.key == point_key), None)
    if point is None:
        raise UnknownPointError()
    if model.value not in MODEL_LABELS:
        raise UnknownModelError()
    row = (
        await session.execute(
            select(ModelGuidanceRun.run_time, ModelGuidanceSeries.series)
            .join(
                ModelGuidanceSeries, ModelGuidanceSeries.run_id == ModelGuidanceRun.id
            )
            .where(
                ModelGuidanceRun.model == model.value,
                ModelGuidanceSeries.point_key == point_key,
            )
            .order_by(ModelGuidanceRun.run_time.desc())
            .limit(1)
        )
    ).first()
    if row is None:
        raise NoGuidanceYetError()
    run_time, series = row
    return MeteogramPublic(
        point=_point_public(point),
        model=model,
        label=MODEL_LABELS[model.value],
        run_time=run_time,
        series=MeteogramSeries.model_validate(
            {
                "valid_times": [
                    datetime.fromisoformat(t).replace(tzinfo=None)
                    for t in series["valid_times"]
                ],
                **{k: series[k] for k in VARIABLES},
            }
        ),
        units=MeteogramUnits.model_validate(VARIABLES),
        attribution=ATTRIBUTION[model.value],
        disclaimer=GUIDANCE_DISCLAIMER,
    )


# --- Entitlement and access requests ---------------------------------------


async def is_entitled(session: AsyncSession, organisation_id: str) -> bool:
    return await org_service.is_app_enabled(
        session, organisation_id=organisation_id, app_key=GUIDANCE_APP_KEY
    )


def _request_public(
    request: GuidanceAccessRequest, organisation_name: str
) -> AccessRequestPublic:
    return AccessRequestPublic(
        id=request.id,
        organisation_id=request.organisation_id,
        organisation_name=organisation_name,
        status=request.status,
        note=request.note,
        decision_note=request.decision_note,
        created_at=request.created_at,
        decided_at=request.decided_at,
    )


async def get_access_status(
    session: AsyncSession, organisation: PlatformOrganisation
) -> AccessStatusPublic:
    latest = await session.scalar(
        select(GuidanceAccessRequest)
        .where(GuidanceAccessRequest.organisation_id == organisation.id)
        .order_by(GuidanceAccessRequest.created_at.desc())
        .limit(1)
    )
    return AccessStatusPublic(
        entitled=await is_entitled(session, organisation.id),
        request=None if latest is None else _request_public(latest, organisation.name),
    )


async def create_access_request(
    session: AsyncSession,
    *,
    organisation: PlatformOrganisation,
    user_id: uuid.UUID,
    note: str | None,
) -> AccessRequestPublic:
    if await is_entitled(session, organisation.id):
        raise AlreadyEntitledError()
    pending = await session.scalar(
        select(GuidanceAccessRequest.id).where(
            GuidanceAccessRequest.organisation_id == organisation.id,
            GuidanceAccessRequest.status == AccessRequestStatus.PENDING.value,
        )
    )
    if pending is not None:
        raise AccessRequestPendingError()
    request = GuidanceAccessRequest(
        organisation_id=organisation.id,
        requested_by_user_id=user_id,
        note=(note or "").strip() or None,
    )
    session.add(request)
    await session.flush()
    logger.info(
        "GMS Dashboard access requested",
        extra={"organisation_id": organisation.id, "request_id": str(request.id)},
    )
    return _request_public(request, organisation.name)


async def list_access_requests(
    session: AsyncSession, *, status: str | None
) -> list[AccessRequestPublic]:
    query = (
        select(GuidanceAccessRequest, PlatformOrganisation.name)
        .join(
            PlatformOrganisation,
            PlatformOrganisation.id == GuidanceAccessRequest.organisation_id,
        )
        .order_by(GuidanceAccessRequest.created_at.desc())
        .limit(200)
    )
    if status is not None:
        query = query.where(GuidanceAccessRequest.status == status)
    rows = (await session.execute(query)).all()
    return [_request_public(request, name) for request, name in rows]


async def decide_access_request(
    session: AsyncSession,
    *,
    request_id: uuid.UUID,
    decision: GuidanceDecision,
    note: str | None,
    reviewer_id: uuid.UUID,
) -> AccessRequestPublic:
    """Approve (enabling the ``gmsdash`` entitlement) or reject a pending request."""
    request = await session.get(GuidanceAccessRequest, request_id, with_for_update=True)
    if request is None:
        raise AccessRequestNotFoundError()
    if request.status != AccessRequestStatus.PENDING.value:
        raise AccessRequestDecidedError()
    approved = decision is GuidanceDecision.APPROVE
    request.status = (
        AccessRequestStatus.APPROVED if approved else AccessRequestStatus.REJECTED
    ).value
    request.decided_by_user_id = reviewer_id
    request.decision_note = (note or "").strip() or None
    request.decided_at = utc_now()
    if approved:
        await org_service.set_app_enabled(
            session,
            organisation_id=request.organisation_id,
            app_key=GUIDANCE_APP_KEY,
            enabled=True,
        )
    await session.flush()
    organisation = await session.get(PlatformOrganisation, request.organisation_id)
    logger.info(
        "GMS Dashboard access request decided",
        extra={"request_id": str(request.id), "decision": decision.value},
    )
    return _request_public(request, organisation.name if organisation else "")


async def list_my_organisations(
    session: AsyncSession, user_id: uuid.UUID
) -> list[GuidanceOrganisationPublic]:
    """The caller's active organisations with entitlement and latest request."""
    memberships = await org_service.list_my_memberships(session, user_id)
    result: list[GuidanceOrganisationPublic] = []
    for membership, organisation in memberships:
        latest = await session.scalar(
            select(GuidanceAccessRequest.status)
            .where(GuidanceAccessRequest.organisation_id == organisation.id)
            .order_by(GuidanceAccessRequest.created_at.desc())
            .limit(1)
        )
        result.append(
            GuidanceOrganisationPublic(
                id=organisation.id,
                name=organisation.name,
                role=membership.role,
                entitled=await is_entitled(session, organisation.id),
                request_status=latest,
            )
        )
    return result
