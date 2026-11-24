from typing import Any

from fastapi import APIRouter, Depends, Response, status

from src.auth.policy import require_permission
from src.dependencies import CurrentUser, SessionDep
from src.models import ApiError

from . import service
from .probe_auth import authenticate_probe
from .schemas import FreshnessReport, ProbeReport

router = APIRouter(prefix="/monitoring", tags=["monitoring"])


@router.get(
    "/admin/freshness",
    response_model=FreshnessReport,
    summary="Read ingest freshness and the email outbox backlog",
    description=(
        "For staff (the monitoring screen). Each ingest feed reports its last successful "
        "run and whether that is inside its window; the email outbox reports pending, "
        "overdue and recently dead rows. `healthy` is true only when every enabled feed "
        "is fresh and the email backlog is within threshold. Needs "
        "monitoring.freshness.read. It is not an uptime monitor target: a signed-in "
        "token expires within an hour. Counts and times only; no recipients, payloads "
        "or error text."
    ),
    responses={
        401: {"model": ApiError, "description": "Missing or invalid credentials"},
        403: {"model": ApiError, "description": "Missing monitoring.freshness.read"},
    },
)
async def get_freshness(*, session: SessionDep, current_user: CurrentUser) -> Any:
    require_permission(
        current_user=current_user, permission_key=service.FRESHNESS_PERMISSION
    )
    return await service.freshness_report(session)


@router.get(
    "/admin/freshness/probe",
    response_model=ProbeReport,
    dependencies=[Depends(authenticate_probe)],
    summary="Uptime probe: is ingest fresh and the email outbox clear",
    description=(
        "For Better Stack and other plain HTTP monitors. Send the probe secret as "
        "`Authorization: Bearer <MONITORING_PROBE_TOKEN>` (a header, never the URL). "
        "200 with `healthy: true` when every check passes; 503 with `healthy: false` "
        "and the names of the failing checks otherwise. Returns verdict, check names "
        "and a time only: no counts, recipients, payloads or error text. Not user "
        "authenticated; the secret is the one grant, equal to monitoring.freshness.read. "
        "Answers 404 when the secret is not configured and 429 when called too often."
    ),
    responses={
        200: {"model": ProbeReport, "description": "Every check passes"},
        401: {"model": ApiError, "description": "Missing or wrong probe secret"},
        404: {"model": ApiError, "description": "Probe secret not configured"},
        429: {"model": ApiError, "description": "Too many probe calls"},
        503: {"model": ProbeReport, "description": "At least one check fails"},
    },
)
async def get_probe(*, session: SessionDep, response: Response) -> ProbeReport:
    report = service.probe_report(await service.freshness_report(session))
    if not report.healthy:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    return report
