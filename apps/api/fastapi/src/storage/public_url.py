"""Absolute address of a stored file's public redirect, for mail that must load images.

``GET /storage/public/{id}`` answers with a short-lived redirect to the bucket, so the
address stays the same while the signed link inside it expires. Pure: it reads only
the API base setting. It returns None when ``API_BASE_URL`` is unset (local
development), so mail then carries no logo rather than a link nothing can load.
"""

import uuid

from src.config import settings


def public_file_url(file_id: uuid.UUID | None) -> str | None:
    if file_id is None or settings.API_BASE_URL is None:
        return None
    base = str(settings.API_BASE_URL).rstrip("/")
    return f"{base}{settings.API_V1_STR}/storage/public/{file_id}"
