"""Controlled URLs for generated CAP attachments in private object storage."""

from typing import Literal
from urllib.parse import quote

from sqlalchemy.ext.asyncio import AsyncSession

from src.config import settings
from src.exceptions import NotFoundError
from src.storage.service import storage_service

from . import service
from .models import CapStatus

AttachmentKind = Literal["pdf", "social", "map"]
SUFFIXES = {"pdf": ".pdf", "social": "-social.png", "map": "-map.png"}


def public_url(identifier: str, kind: AttachmentKind) -> str:
    base = str(settings.API_BASE_URL or "").rstrip("/")
    return f"{base}/api/cap/alerts/{quote(identifier, safe='')}/attachments/{kind}"


async def download_url(
    session: AsyncSession, identifier: str, kind: AttachmentKind
) -> str:
    alert = await service.public_alert_by_identifier(
        session=session, identifier=identifier
    )
    if alert.status != CapStatus.ACTUAL or any(c in identifier for c in "/\\"):
        raise NotFoundError()
    # Local signing only. Storage objects remain private; recheck visibility on
    # every request. A previously issued link remains usable for at most 60s.
    return storage_service.presigned_download_url(
        f"cap/{identifier}{SUFFIXES[kind]}", expires_in=60
    )
