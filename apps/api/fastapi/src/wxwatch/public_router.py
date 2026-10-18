"""Unauthenticated, cache-friendly satellite imagery for the public weather site.

Only NOAA/NESDIS GOES images (public domain) are exposed, by ingested row id.
Bytes are never served from a raw bucket URL: a local archive file, or a
60-second presigned redirect for private object storage.
"""

import re
from typing import Annotated, Any

from fastapi import APIRouter, HTTPException, Query, Response
from fastapi.responses import FileResponse, RedirectResponse
from sqlalchemy import text

from src.config import settings
from src.openapi_responses import BAD_REQUEST, NOT_FOUND
from src.storage import service as storage

from .config import wxwatch_settings
from .dependencies import ImageSession
from .schemas import PublicSatelliteImage, PublicSatelliteLatest

router = APIRouter(prefix="/wxwatch/public", tags=["wxwatch"])

SOURCE = "goes19"
ATTRIBUTION = "NOAA/NESDIS GOES-19. Public domain; not a GMS product."
SOURCE_LABEL = "NOAA/NESDIS GOES-19"
# Cloudflare can keep serving these when the origin is down.
LATEST_CACHE = (
    "public, max-age=60, s-maxage=120, stale-while-revalidate=600, stale-if-error=86400"
)
IMAGE_CACHE = "public, max-age=3600, s-maxage=86400, stale-if-error=86400"
MAX_PRODUCTS = 12
_PREFIX = re.compile(r"^\d+_")
_SAFE_PATH = re.compile(
    r"[A-Za-z0-9_./() +%-]+\.(?:png|jpg|jpeg|gif|webp)", re.IGNORECASE
)
_MEDIA = {
    "png": "image/png",
    "jpg": "image/jpeg",
    "jpeg": "image/jpeg",
    "gif": "image/gif",
    "webp": "image/webp",
}


def _media_type(path: str) -> str:
    return _MEDIA.get(path.rsplit(".", 1)[-1].lower(), "application/octet-stream")


def _image(row: Any) -> PublicSatelliteImage:
    name = _PREFIX.sub("", row["name"] or row["product_key"] or "")
    product = (row["product_key"] or f"{SOURCE}:{name}").removeprefix(f"{SOURCE}:")
    return PublicSatelliteImage(
        id=row["id"],
        product=product,
        title=name.rsplit(".", 1)[0].replace("_", " ").strip() or product,
        observed_at=row["observation_time"],
        image_url=f"{settings.API_V1_STR}/wxwatch/public/images/{row['id']}",
        media_type=_media_type(row["storage_path"]),
        width=row["width"],
        height=row["height"],
        source=SOURCE_LABEL,
        attribution=ATTRIBUTION,
    )


@router.get(
    "/latest",
    response_model=PublicSatelliteLatest,
    summary="Latest public satellite images",
    description=(
        "The newest ingested GOES image for each product (or one product), with "
        "observation time and NOAA/NESDIS attribution. No authentication. An empty "
        "list means nothing has been ingested, never that the sky is clear."
    ),
)
async def latest(
    session: ImageSession,
    response: Response,
    product: Annotated[
        str | None, Query(max_length=100, pattern=r"^[A-Za-z0-9_. :-]+$")
    ] = None,
) -> PublicSatelliteLatest:
    response.headers["Cache-Control"] = LATEST_CACHE
    rows = (
        (
            await session.execute(
                text("""SELECT DISTINCT ON (coalesce(product_key, name))
                id, name, product_key, storage_path, width, height, observation_time
                FROM weather_images
                WHERE spider_name = :source AND observation_time IS NOT NULL
                  AND observation_time <= now() + interval '10 minutes'
                  AND storage_path IS NOT NULL
                  AND (CAST(:product AS text) IS NULL
                       OR product_key = :product OR product_key = :qualified)
                ORDER BY coalesce(product_key, name), observation_time DESC, id DESC"""),
                {
                    "source": SOURCE,
                    "product": product,
                    "qualified": f"{SOURCE}:{product}" if product else None,
                },
            )
        )
        .mappings()
        .all()
    )
    images = sorted(
        (_image(row) for row in rows if _SAFE_PATH.fullmatch(row["storage_path"])),
        key=lambda image: image.observed_at,
        reverse=True,
    )[:MAX_PRODUCTS]
    return PublicSatelliteLatest(images=images)


@router.get(
    "/images/{image_id}",
    response_class=RedirectResponse,
    status_code=307,
    summary="Download a public satellite image",
    description=(
        "Image bytes for one GOES image listed by the latest endpoint: the "
        "archive file, or a 60-second signed redirect."
    ),
    responses={**BAD_REQUEST, **NOT_FOUND},
)
async def image(image_id: int, session: ImageSession) -> Response:
    path = await session.scalar(
        text(
            "SELECT storage_path FROM weather_images "
            "WHERE id = :id AND spider_name = :source"
        ),
        {"id": image_id, "source": SOURCE},
    )
    if not path:
        raise HTTPException(404, "Image not found")
    if not _SAFE_PATH.fullmatch(path) or any(
        part in {"", ".", ".."} for part in path.split("/")
    ):
        raise HTTPException(400, "Invalid image path")
    if wxwatch_settings.LOCAL_IMAGES_DIR is not None:
        root = wxwatch_settings.LOCAL_IMAGES_DIR.resolve()
        file = (root / path).resolve()
        if not file.is_relative_to(root) or not file.is_file():
            raise HTTPException(404, "Image not found")
        return FileResponse(
            file, media_type=_media_type(path), headers={"Cache-Control": IMAGE_CACHE}
        )
    try:
        url = storage.storage_service.presigned_download_url(
            f"wxwatch/{path}", expires_in=60
        )
    except storage.StorageNotConfiguredError:
        raise HTTPException(503, "Weather object storage is not configured") from None
    # The signed link lives 60 s, so the redirect itself is cached only briefly.
    return RedirectResponse(
        url, status_code=307, headers={"Cache-Control": "public, max-age=30"}
    )
