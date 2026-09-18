"""Resolve registered local replicas and serve a verified snapshot of their bytes."""

import hashlib
from collections.abc import Iterator
from pathlib import Path
from tempfile import SpooledTemporaryFile
from uuid import UUID

from fastapi import HTTPException
from fastapi.responses import StreamingResponse
from PIL import Image, UnidentifiedImageError
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.background import BackgroundTask
from starlette.concurrency import run_in_threadpool

from .config import wxwatch_settings


class ReplicaUnavailableError(ValueError):
    pass


def snapshot(
    root: Path, key: str, sha256: str, size: int
) -> tuple[SpooledTemporaryFile[bytes], str]:
    if "\\" in key or any(part in {"", ".", ".."} for part in key.split("/")):
        raise ReplicaUnavailableError
    root = root.resolve()
    path = (root / key).resolve()
    if not path.is_relative_to(root) or not path.is_file():
        raise ReplicaUnavailableError
    result: SpooledTemporaryFile[bytes] = SpooledTemporaryFile(max_size=8 * 1024 * 1024)
    try:
        digest = hashlib.sha256()
        count = 0
        with path.open("rb") as source:
            while chunk := source.read(1024 * 1024):
                count += len(chunk)
                if count > size:
                    raise ReplicaUnavailableError
                digest.update(chunk)
                result.write(chunk)
        if count != size or digest.hexdigest() != sha256:
            raise ReplicaUnavailableError
        result.seek(0)
        # Only validated raster formats can render inline on the application's origin.
        mime = "application/octet-stream"
        try:
            with Image.open(result) as picture:
                format_name = picture.format
                picture.verify()
            mime = {
                "PNG": "image/png",
                "JPEG": "image/jpeg",
                "GIF": "image/gif",
                "WEBP": "image/webp",
            }.get(format_name or "", mime)
        except (
            UnidentifiedImageError,
            OSError,
            SyntaxError,
            ValueError,
            Image.DecompressionBombError,
        ):
            pass
        result.seek(0)
        return result, mime
    except BaseException:
        result.close()
        raise


def chunks(stream: SpooledTemporaryFile[bytes]) -> Iterator[bytes]:
    try:
        while chunk := stream.read(1024 * 1024):
            yield chunk
    finally:
        stream.close()


async def deliver(session: AsyncSession, asset_id: UUID) -> StreamingResponse:
    asset = (
        (
            await session.execute(
                text("SELECT sha256,byte_size FROM archive_assets WHERE id=:id"),
                {"id": asset_id},
            )
        )
        .mappings()
        .first()
    )
    if asset is None:
        raise HTTPException(404, "Asset not found")
    replicas = (
        (
            await session.execute(
                text("""SELECT backend_key,object_key FROM archive_replicas
        WHERE asset_id=:id AND state='verified' AND verified_sha256=:sha
        ORDER BY backend_key,object_key"""),
                {"id": asset_id, "sha": asset["sha256"]},
            )
        )
        .mappings()
        .all()
    )
    roots = dict(wxwatch_settings.LOCAL_ASSET_ROOTS)
    if wxwatch_settings.LOCAL_IMAGES_DIR is not None:
        roots["local-primary"] = wxwatch_settings.LOCAL_IMAGES_DIR
    for replica in replicas:
        root = roots.get(replica["backend_key"])
        if root is None:
            continue
        try:
            stream, mime = await run_in_threadpool(
                snapshot,
                root,
                replica["object_key"],
                asset["sha256"],
                asset["byte_size"],
            )
        except (OSError, ReplicaUnavailableError):
            continue
        disposition = "inline" if mime.startswith("image/") else "attachment"
        return StreamingResponse(
            chunks(stream),
            media_type=mime,
            background=BackgroundTask(stream.close),
            headers={
                "Cache-Control": "private, no-store",
                "X-Content-Type-Options": "nosniff",
                "Content-Security-Policy": "sandbox; default-src 'none'",
                "Content-Length": str(asset["byte_size"]),
                "Content-Disposition": f'{disposition}; filename="{asset_id}"',
            },
        )
    raise HTTPException(503, "No verified asset replica is currently available")
