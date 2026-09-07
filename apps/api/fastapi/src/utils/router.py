from functools import lru_cache
from pathlib import Path

from alembic.script import ScriptDirectory
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.concurrency import run_in_threadpool
from pydantic.networks import EmailStr
from sqlalchemy import text

from src.auth.dependencies import get_current_active_superuser
from src.dependencies import SessionDep
from src.email import generate_test_email, send_email
from src.models import Message


@lru_cache(maxsize=1)
def _migration_heads() -> frozenset[str]:
    return frozenset(
        ScriptDirectory(
            str(Path(__file__).resolve().parents[2] / "alembic")
        ).get_heads()
    )


router = APIRouter(prefix="/utils", tags=["utils"])


@router.post(
    "/test-email/",
    dependencies=[Depends(get_current_active_superuser)],
    status_code=status.HTTP_201_CREATED,
)
async def test_email(email_to: EmailStr) -> Message:
    email_data = generate_test_email(email_to=email_to)
    await run_in_threadpool(
        send_email,
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
async def ready(session: SessionDep) -> dict[str, str]:
    try:
        versions = await session.execute(
            text("SELECT version_num FROM alembic_version")
        )
        if frozenset(versions.scalars()) != _migration_heads():
            raise RuntimeError("Schema revision mismatch")
        # Empty datasets are valid; these reads verify required schema and permissions.
        await session.execute(text('SELECT id FROM "user" LIMIT 0'))
        await session.execute(text("SELECT id FROM hr.department LIMIT 0"))
        return {"status": "ready"}
    except Exception:
        raise HTTPException(status_code=503, detail="Database unreachable")
