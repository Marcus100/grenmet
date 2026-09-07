"""Authenticated access to private weather image objects, without cross-domain table access."""

import re

from fastapi import APIRouter, HTTPException
from fastapi.responses import RedirectResponse

from src.dependencies import CurrentUser
from src.storage import service

router = APIRouter(prefix="/wxwatch", tags=["weather-images"])
_SAFE_PATH = re.compile(
    r"[A-Za-z0-9_./() +%-]+\.(?:png|jpg|jpeg|gif|webp)", re.IGNORECASE
)


@router.get(
    "/images/{storage_path:path}", response_class=RedirectResponse, status_code=307
)
async def weather_image(
    storage_path: str, _current_user: CurrentUser
) -> RedirectResponse:
    """Issue a short-lived download redirect scoped to the environment's wxwatch prefix."""
    if not _SAFE_PATH.fullmatch(storage_path) or any(
        part in {"", ".", ".."} for part in storage_path.split("/")
    ):
        raise HTTPException(status_code=400, detail="Invalid image path")
    try:
        url = service.storage_service.presigned_download_url(
            f"wxwatch/{storage_path}", expires_in=60
        )
    except service.StorageNotConfiguredError:
        raise HTTPException(
            status_code=503, detail="Weather object storage is not configured"
        ) from None
    return RedirectResponse(
        url, status_code=307, headers={"Cache-Control": "private, no-store"}
    )
