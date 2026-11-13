"""API shapes for profile photos (#1303). Never the ORM model."""

import uuid
from enum import IntEnum

from src.models import BaseModel, UtcDateTime


class ProfileImageSize(IntEnum):
    """Square sizes stored for each photo, in pixels."""

    SMALL = 64
    MEDIUM = 256
    LARGE = 512


class ProfileImagePublic(BaseModel):
    user_id: uuid.UUID
    #: Changes with every upload; add it to image URLs so caches refresh.
    version: str
    updated_at: UtcDateTime
    sizes: list[int]
