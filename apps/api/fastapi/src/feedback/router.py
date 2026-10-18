from fastapi import APIRouter, Request, status

from src.dependencies import SessionDep
from src.openapi_responses import BAD_REQUEST
from src.rate_limit import limiter

from . import service
from .schemas import PageFeedbackAccepted, PageFeedbackCreate

router = APIRouter(prefix="/feedback", tags=["feedback"])


@router.post(
    "",
    response_model=PageFeedbackAccepted,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Send page feedback",
    description=(
        "Public, anonymous 'Was this page helpful?' answer from a website. "
        "Stores the site key, page path, yes/no and an optional short comment."
    ),
    responses={**BAD_REQUEST},
)
@limiter.limit("10/minute")
async def send_page_feedback(
    *, request: Request, session: SessionDep, body: PageFeedbackCreate
) -> PageFeedbackAccepted:
    _ = request
    await service.submit_feedback(session=session, payload=body)
    return PageFeedbackAccepted(ok=True)
