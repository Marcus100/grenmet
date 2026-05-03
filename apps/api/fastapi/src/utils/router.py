from fastapi import APIRouter, Depends, HTTPException
from pydantic.networks import EmailStr
from sqlalchemy import text

from src.auth.dependencies import get_current_active_superuser
from src.dependencies import SessionDep
from src.email import generate_test_email, send_email
from src.models import Message

router = APIRouter(prefix="/utils", tags=["utils"])


@router.post(
    "/test-email/",
    dependencies=[Depends(get_current_active_superuser)],
    status_code=201,
)
async def test_email(email_to: EmailStr) -> Message:
    """
    Test emails.
    """
    email_data = generate_test_email(email_to=email_to)
    send_email(
        email_to=email_to,
        subject=email_data.subject,
        html_content=email_data.html_content,
    )
    return Message(message="Test email sent")


@router.get(
    "/health-check/",
    summary="Liveness",
    description="Simple liveness probe; returns 200 if the process is running.",
)
async def health_check() -> bool:
    """Liveness: process is up. Use /ready/ for DB readiness."""
    return True


@router.get(
    "/ready/",
    summary="Readiness",
    description="Readiness probe; returns 200 if the app can reach the database, 503 otherwise.",
    responses={
        200: {"description": "Database reachable"},
        503: {"description": "Database unreachable"},
    },
)
async def ready(session: SessionDep) -> dict:
    """Readiness: check DB connectivity. Returns 503 on failure."""
    try:
        await session.execute(text("SELECT 1"))
        return {"status": "ready"}
    except Exception:
        raise HTTPException(status_code=503, detail="Database unreachable")
