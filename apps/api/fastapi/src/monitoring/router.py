from typing import Any

from fastapi import APIRouter

from src.auth.policy import require_permission
from src.dependencies import CurrentUser, SessionDep
from src.models import ApiError

from . import service
from .schemas import FreshnessReport

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
