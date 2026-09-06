from fastapi import APIRouter

from src.dependencies import CurrentUser, SessionDep
from src.hr.dashboard import service
from src.hr.dashboard.schemas import HrDashboardPublic

router = APIRouter(prefix="/hr", tags=["hr-dashboard"])


@router.get(
    "/dashboard",
    response_model=HrDashboardPublic,
    status_code=200,
    summary="Read the live HR dashboard",
    description="Read personal requests and recorded vacation balance, published department roster and actionable approvals. Missing balances remain null.",
    responses={
        401: {"description": "Authentication required"},
        403: {"description": "Account verification required"},
    },
)
async def read_hr_dashboard(
    *, session: SessionDep, current_user: CurrentUser
) -> HrDashboardPublic:
    return await service.read_dashboard(session=session, current_user=current_user)
