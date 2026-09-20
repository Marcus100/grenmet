"""Authenticated access to private weather image objects, without cross-domain table access."""

import re
from uuid import UUID

from fastapi import APIRouter, HTTPException, Response
from fastapi.responses import FileResponse, RedirectResponse, StreamingResponse

from src.auth.browser import BrowserUser
from src.storage import service
from src.wxwatch import assets
from src.wxwatch.config import wxwatch_settings
from src.wxwatch.router import ImageSession

router = APIRouter(prefix="/wxwatch", tags=["weather-images"])
_SAFE_PATH = re.compile(
    r"[A-Za-z0-9_./() +%-]+\.(?:png|jpg|jpeg|gif|webp)", re.IGNORECASE
)


@router.get(
    "/images/{storage_path:path}", response_class=RedirectResponse, status_code=307
)
async def weather_image(storage_path: str, _current_user: BrowserUser) -> Response:
    """Issue a short-lived download redirect scoped to the environment's wxwatch prefix."""
    if not _SAFE_PATH.fullmatch(storage_path) or any(
        part in {"", ".", ".."} for part in storage_path.split("/")
    ):
        raise HTTPException(status_code=400, detail="Invalid image path")
    if wxwatch_settings.LOCAL_IMAGES_DIR is not None:
        root = wxwatch_settings.LOCAL_IMAGES_DIR.resolve()
        path = (root / storage_path).resolve()
        if not path.is_relative_to(root) or not path.is_file():
            raise HTTPException(404, "Archived image not found")
        return FileResponse(path, headers={"Cache-Control": "private, no-store"})
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


@router.get(
    "/assets/{asset_id}",
    response_class=StreamingResponse,
    responses={
        200: {
            "description": "Verified image bytes",
            "content": {
                "image/png": {},
                "image/jpeg": {},
                "image/gif": {},
                "image/webp": {},
                "application/octet-stream": {},
            },
        },
        404: {"description": "Asset not found"},
        503: {"description": "No verified asset replica is available"},
    },
)
async def archive_asset(
    asset_id: UUID, _user: BrowserUser, session: ImageSession
) -> Response:
    """Deliver verified bytes by stable asset ID; storage locations stay private."""
    return await assets.deliver(session, asset_id)
